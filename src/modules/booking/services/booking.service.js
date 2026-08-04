import mongoose from "mongoose";

import Booking from "../model/booking.model.js";
import Event from "../../event/models/event.model.js";
import Counter from "../model/counter.model.js";

import generateBookingId from "../utils/generateBookingId.js";
import generateTicketCode from "../utils/generateTicketCode.js";

import {
  invalidateBookingCache,
} from "../cache/booking.cache.js";
import {
  invalidateEventCache,
  invalidateApprovedEventsCache,
} from "../../event/cache/event.cache.js";

/**
 * =====================================================
 * CREATE BOOKING FROM VERIFIED PAYMENT
 * =====================================================
 * Core booking creation logic used by:
 * - Payment module (after successful Razorpay verification)
 * - Booking controller (for free events, direct creation)
 *
 * All booking business logic lives HERE to maintain
 * separation of concerns. Payment module calls this
 * function — it never duplicates booking logic.
 *
 * Includes:
 * - MongoDB Transaction
 * - Capacity validation
 * - Atomic ticket reservation
 * - Counter increment
 * - Booking ID generation
 * - Ticket Code generation
 * - Redis cache invalidation
 * - Event ticketsSold update
 *
 * @param {Object} params
 * @param {string} params.eventId    - MongoDB ObjectId of the event
 * @param {string} params.userId     - MongoDB ObjectId of the user
 * @param {number} params.quantity   - Number of tickets
 * @param {string} [params.paymentId]  - MongoDB ObjectId of Payment (for paid events)
 * @param {mongoose.ClientSession} [params.session] - External session (if called within an existing transaction)
 *
 * @returns {Object} Created booking document + event metadata
 * @throws {Object} Error with statusCode for the caller to handle
 * =====================================================
 */

export const createBookingFromPayment = async ({
  eventId,
  userId,
  quantity,
  paymentId = null,
  session: externalSession = null,
}) => {
  /**
   * ---------------------------------------------------
   * Session Management
   * ---------------------------------------------------
   * If an external session is provided (e.g., from payment
   * verification), use it. Otherwise, create a new one.
   * This allows the booking creation to participate in
   * the same transaction as the payment update.
   */

  const isExternalSession = !!externalSession;
  const session = externalSession || (await mongoose.startSession());

  try {
    if (!isExternalSession) {
      session.startTransaction();
    }

    /**
     * ---------------------------------------------------
     * Fetch Event
     * ---------------------------------------------------
     */

    const event = await Event.findById(eventId).session(session);

    if (!event) {
      const error = new Error("Event not found.");
      error.statusCode = 404;
      throw error;
    }

    /**
     * ---------------------------------------------------
     * Event Status Validation
     * ---------------------------------------------------
     */

    if (event.isDeleted) {
      const error = new Error("This event is no longer available.");
      error.statusCode = 404;
      throw error;
    }

    if (event.status !== "APPROVED") {
      const error = new Error("Bookings are not available for this event.");
      error.statusCode = 400;
      throw error;
    }

    /**
     * ---------------------------------------------------
     * Booking Deadline Validation
     * ---------------------------------------------------
     */

    const now = new Date();

    if (event.bookingDeadline && now > event.bookingDeadline) {
      const error = new Error("Booking deadline has passed.");
      error.statusCode = 400;
      throw error;
    }

    /**
     * ---------------------------------------------------
     * Event Already Started
     * ---------------------------------------------------
     */

    if (now >= event.startDate) {
      const error = new Error(
        "Bookings are closed. Event has already started.",
      );
      error.statusCode = 400;
      throw error;
    }

    /**
     * ---------------------------------------------------
     * Ticket Quantity Validation
     * ---------------------------------------------------
     */

    if (quantity > event.maxTicketsPerBooking) {
      const error = new Error(
        `Maximum ${event.maxTicketsPerBooking} tickets can be booked at once.`,
      );
      error.statusCode = 400;
      throw error;
    }

    /**
     * ---------------------------------------------------
     * Capacity Validation
     * ---------------------------------------------------
     */

    const availableTickets = event.capacity - event.ticketsSold;

    if (availableTickets <= 0) {
      const error = new Error("This event is sold out.");
      error.statusCode = 409;
      throw error;
    }

    if (quantity > availableTickets) {
      const error = new Error(`Only ${availableTickets} ticket(s) left.`);
      error.statusCode = 409;
      throw error;
    }

    /**
     * ---------------------------------------------------
     * Price Calculation
     * ---------------------------------------------------
     * Always calculate from Event document.
     * Never trust frontend pricing.
     */

    const pricePerTicket = event.isFree ? 0 : event.price;
    const totalAmount = pricePerTicket * quantity;

    /**
     * =====================================================
     * ATOMIC TICKET RESERVATION
     * =====================================================
     * Atomically reserve tickets BEFORE creating the booking.
     * This prevents race conditions and overselling.
     * =====================================================
     */

    const reservedEvent = await Event.findOneAndUpdate(
      {
        _id: event._id,
        $expr: {
          $gte: [{ $subtract: ["$capacity", "$ticketsSold"] }, quantity],
        },
      },
      {
        $inc: {
          ticketsSold: quantity,
        },
      },
      {
        new: true,
        session,
      },
    );

    if (!reservedEvent) {
      const error = new Error(
        "Tickets are no longer available. Please try again.",
      );
      error.statusCode = 409;
      throw error;
    }

    /**
     * ---------------------------------------------------
     * Generate Booking Sequence
     * ---------------------------------------------------
     */

    const counter = await Counter.findByIdAndUpdate(
      "booking",
      {
        $inc: {
          sequenceValue: 1,
        },
      },
      {
        new: true,
        upsert: true,
        session,
      },
    );

    /**
     * ---------------------------------------------------
     * Generate Booking ID
     * ---------------------------------------------------
     * Format: ZNZ-YYYYMMDD-XXXXXX
     */

    const bookingId = generateBookingId(counter.sequenceValue);

    /**
     * ---------------------------------------------------
     * Generate Ticket Code
     * ---------------------------------------------------
     * 8-character alphanumeric code for QR ticket.
     */

    const ticketCode = generateTicketCode();

    /**
     * ---------------------------------------------------
     * Determine Booking and Payment Status
     * ---------------------------------------------------
     * When called from payment verify: Already PAID
     * When called for free events: PAID (no payment needed)
     */

    const bookingStatus = "CONFIRMED";
    const paymentStatus = paymentId ? "PAID" : event.isFree ? "PAID" : "UNPAID";

    /**
     * ---------------------------------------------------
     * Create Booking Document
     * ---------------------------------------------------
     */

    const [booking] = await Booking.create(
      [
        {
          bookingId,
          ticketCode,

          user: userId,
          organizer: event.organizer,
          event: event._id,

          quantity,

          pricePerTicket,
          totalAmount,

          bookingStatus,
          paymentStatus,
        },
      ],
      {
        session,
      },
    );

    /**
     * ---------------------------------------------------
     * Commit Transaction (only if we own the session)
     * ---------------------------------------------------
     */

    if (!isExternalSession) {
      await session.commitTransaction();
    }

    /**
     * ---------------------------------------------------
     * Cache Invalidation (post-commit, fire-and-forget)
     * ---------------------------------------------------
     */

    try {
      await invalidateBookingCache({
        bookingId: booking.bookingId,
        userId: userId.toString(),
        organizerId: event.organizer.toString(),
        eventId: event._id.toString(),
      });

      if (event.slug) {
        await invalidateEventCache(event.slug);
      }

      await invalidateApprovedEventsCache();
    } catch (cacheError) {
      console.error("Cache invalidation failed:", cacheError);
    }

    /**
     * ---------------------------------------------------
     * Return Booking Data
     * ---------------------------------------------------
     */

    return {
      booking: {
        _id: booking._id,
        bookingId: booking.bookingId,
        ticketCode: booking.ticketCode,
        quantity: booking.quantity,
        pricePerTicket: booking.pricePerTicket,
        totalAmount: booking.totalAmount,
        paymentStatus: booking.paymentStatus,
        bookingStatus: booking.bookingStatus,
        createdAt: booking.createdAt,
      },
      event: {
        _id: event._id,
        title: event.title,
        slug: event.slug,
        startDate: event.startDate,
        endDate: event.endDate,
        venue: event.venue,
      },
    };
  } catch (error) {
    /**
     * ---------------------------------------------------
     * Transaction Rollback (only if we own the session)
     * ---------------------------------------------------
     */

    if (!isExternalSession && session.inTransaction()) {
      await session.abortTransaction();
    }

    // Re-throw for caller to handle
    throw error;
  } finally {
    /**
     * ---------------------------------------------------
     * Session Cleanup (only if we own the session)
     * ---------------------------------------------------
     */

    if (!isExternalSession) {
      await session.endSession();
    }
  }
};
