import mongoose from "mongoose";

import Booking from "../model/booking.model.js";
import Event from "../../event/models/event.model.js";
import Counter from "../model/counter.model.js";

import generateBookingId from "../utils/generateBookingId.js";
import generateTicketCode from "../utils/generateTicketCode.js";

import { invalidateBookingCache } from "../cache/booking.cache.js";
import {
  invalidateEventCache,
  invalidateApprovedEventsCache,
} from "../../event/cache/event.cache.js";

export const createBooking = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const userId = req.user._id;

    const { eventId, quantity } = req.body;

    /**
     * ---------------------------------------------------
     * Fetch Event
     * ---------------------------------------------------
     */

    const event = await Event.findById(eventId).session(session);

    if (!event) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    /**
     * ---------------------------------------------------
     * Event Status Validation
     * ---------------------------------------------------
     */

    if (event.isDeleted) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "This event is no longer available.",
      });
    }

    if (event.status !== "APPROVED") {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Bookings are not available for this event.",
      });
    }

    /**
     * ---------------------------------------------------
     * Booking Deadline Validation
     * ---------------------------------------------------
     */

    const now = new Date();

    if (event.bookingDeadline && now > event.bookingDeadline) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Booking deadline has passed.",
      });
    }

    /**
     * ---------------------------------------------------
     * Event Already Started
     * ---------------------------------------------------
     */

    if (now >= event.startDate) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Bookings are closed. Event has already started.",
      });
    }

    /**
     * ---------------------------------------------------
     * Ticket Quantity Validation
     * ---------------------------------------------------
     */

    if (quantity > event.maxTicketsPerBooking) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: `Maximum ${event.maxTicketsPerBooking} tickets can be booked at once.`,
      });
    }

    /**
     * ---------------------------------------------------
     * Capacity Validation
     * ---------------------------------------------------
     */

    const availableTickets = event.capacity - event.ticketsSold;

    if (availableTickets <= 0) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "This event is sold out.",
      });
    }

    if (quantity > availableTickets) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: `Only ${availableTickets} ticket(s) left.`,
      });
    }

    /**
     * ---------------------------------------------------
     * Price Calculation
     * ---------------------------------------------------
     */

    const pricePerTicket = event.isFree ? 0 : event.price;

    const totalAmount = pricePerTicket * quantity;

    /**
     * =====================================================
     * PART-2: ATOMIC TICKET RESERVATION
     * =====================================================
     * Atomically reserve tickets BEFORE creating the booking.
     * This prevents race conditions and overselling.
     * =====================================================
     */

    /**
     * ---------------------------------------------------
     * Atomic Ticket Reservation
     * ---------------------------------------------------
     * Uses findOneAndUpdate with $inc to atomically:
     * 1. Check if capacity allows the reservation
     * 2. Increment ticketsSold only if condition passes
     *
     * This prevents race conditions where multiple users
     * book the last tickets simultaneously.
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

    /**
     * ---------------------------------------------------
     * Reservation Failed - No Tickets Available
     * ---------------------------------------------------
     * If findOneAndUpdate returns null, it means either:
     * - Not enough tickets were available
     * - Another transaction reserved them first
     *
     * Return 409 Conflict, NOT 500 Internal Server Error.
     */

    if (!reservedEvent) {
      await session.abortTransaction();

      return res.status(409).json({
        success: false,
        message: "Tickets are no longer available. Please try again.",
      });
    }

    /**
     * ---------------------------------------------------
     * Generate Booking Sequence
     * ---------------------------------------------------
     * Atomically increment the counter to get a unique
     * sequence number for this booking.
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
     * Example: ZNZ-20260730-000042
     */

    const bookingId = generateBookingId(counter.sequenceValue);

    /**
     * ---------------------------------------------------
     * Generate Ticket Code
     * ---------------------------------------------------
     * 8-character alphanumeric code for QR ticket generation.
     * Example: 3K7M9P2Q
     */

    const ticketCode = generateTicketCode();

    /**
     * ---------------------------------------------------
     * Determine Booking and Payment Status
     * ---------------------------------------------------
     * Free events: CONFIRMED + PAID
     * Paid events: CONFIRMED + UNPAID (pending Razorpay)
     */

    const bookingStatus = "CONFIRMED";

    const paymentStatus = event.isFree ? "PAID" : "UNPAID";

    /**
     * ---------------------------------------------------
     * Create Booking Document
     * ---------------------------------------------------
     * Create the booking inside the same transaction.
     * If any error occurs, the entire transaction rolls back.
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
     * =====================================================
     * PART-3: TRANSACTION COMMIT & CACHE INVALIDATION
     * =====================================================
     * 1. Commit the MongoDB transaction
     * 2. Invalidate Redis caches
     * 3. Return success response
     * =====================================================
     */

    /**
     * ---------------------------------------------------
     * Commit Transaction
     * ---------------------------------------------------
     * All database operations succeeded.
     * Commit the transaction to persist changes.
     */

    await session.commitTransaction();

    /**
     * ---------------------------------------------------
     * Invalidate Booking Cache
     * ---------------------------------------------------
     * Invalidate all related booking caches:
     * - User's booking list
     * - Organizer's booking list
     * - Event's booking list
     * - All bookings list (admin)
     */

    await invalidateBookingCache({
      bookingId: booking.bookingId,
      userId: userId.toString(),
      organizerId: event.organizer.toString(),
      eventId: event._id.toString(),
    });

    /**
     * ---------------------------------------------------
     * Invalidate Event Cache
     * ---------------------------------------------------
     * Event capacity has changed. Invalidate:
     * - Single event cache (by slug)
     * - Approved events list cache
     */

    if (event.slug) {
      await invalidateEventCache(event.slug);
    }

    await invalidateApprovedEventsCache();

    /**
     * ---------------------------------------------------
     * Success Response
     * ---------------------------------------------------
     * Return booking details with consistent structure.
     * Ready for future Socket.IO real-time updates.
     */

    return res.status(201).json({
      success: true,
      message: "Booking created successfully.",
      data: {
        bookingId: booking.bookingId,
        ticketCode: booking.ticketCode,
        quantity: booking.quantity,
        totalAmount: booking.totalAmount,
        paymentStatus: booking.paymentStatus,
        bookingStatus: booking.bookingStatus,
        event: {
          _id: event._id,
          title: event.title,
          slug: event.slug,
          startDate: event.startDate,
          endDate: event.endDate,
          location: event.location,
        },
        createdAt: booking.createdAt,
      },
    });
  } catch (error) {
    /**
     * ---------------------------------------------------
     * Transaction Rollback
     * ---------------------------------------------------
     * Any error aborts the transaction.
     * All changes are rolled back automatically.
     */

    await session.abortTransaction();

    console.error("Create Booking Error:", error);

    /**
     * ---------------------------------------------------
     * Error Response with Appropriate Status Codes
     * ---------------------------------------------------
     * - 400: Validation errors (handled in Part 1)
     * - 404: Event not found (handled in Part 1)
     * - 409: Ticket reservation conflict (handled in Part 2)
     * - 500: Unexpected server errors (caught here)
     *
     * Never leak internal error details to the client.
     */

    return res.status(500).json({
      success: false,
      message: "Unable to complete booking. Please try again.",
    });
  } finally {
    /**
     * ---------------------------------------------------
     * Session Cleanup
     * ---------------------------------------------------
     * CRITICAL: Always end the session to prevent memory leaks.
     * This runs whether the transaction succeeds or fails.
     */

    await session.endSession();
  }
};
