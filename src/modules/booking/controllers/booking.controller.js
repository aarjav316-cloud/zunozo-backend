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

/**
 * =====================================================
 * CANCEL BOOKING CONTROLLER
 * =====================================================
 * Production-ready booking cancellation with:
 * - MongoDB Transactions
 * - Authorization checks
 * - Atomic ticket restoration
 * - Redis cache invalidation
 * - Proper error handling
 * =====================================================
 */

export const cancelBooking = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const loggedInUserId = req.user._id;
    const loggedInUserRole = req.user.role;

    const { bookingId } = req.params;

    /**
     * ---------------------------------------------------
     * Fetch Booking
     * ---------------------------------------------------
     * Find by bookingId (ZNZ-YYYYMMDD-XXXXXX format)
     * Populate event details needed for validation
     */

    const booking = await Booking.findOne({ bookingId })
      .populate("event")
      .session(session);

    if (!booking) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    /**
     * ---------------------------------------------------
     * Authorization Check
     * ---------------------------------------------------
     * Allow cancellation if:
     * 1. User owns the booking
     * 2. User is ADMIN
     * 3. User is ORGANIZER and owns the event
     */

    const isOwner = booking.user.toString() === loggedInUserId.toString();
    const isAdmin = loggedInUserRole === "admin";
    const isEventOrganizer =
      loggedInUserRole === "organizer" &&
      booking.organizer.toString() === loggedInUserId.toString();

    if (!isOwner && !isAdmin && !isEventOrganizer) {
      await session.abortTransaction();

      return res.status(403).json({
        success: false,
        message: "You are not authorized to cancel this booking.",
      });
    }

    /**
     * ---------------------------------------------------
     * Already Cancelled Check
     * ---------------------------------------------------
     * Prevent duplicate cancellation
     */

    if (booking.bookingStatus === "CANCELLED") {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "This booking is already cancelled.",
      });
    }

    /**
     * ---------------------------------------------------
     * Check-In Validation
     * ---------------------------------------------------
     * Cannot cancel a booking that's already checked in
     */

    if (booking.checkedIn) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Cannot cancel a checked-in booking.",
      });
    }

    /**
     * ---------------------------------------------------
     * Payment Processing Check
     * ---------------------------------------------------
     * Future compatibility: prevent cancellation during payment
     * Currently not implemented but structure is ready
     */

    // if (booking.paymentStatus === "PROCESSING") {
    //   await session.abortTransaction();
    //
    //   return res.status(409).json({
    //     success: false,
    //     message: "Cannot cancel booking while payment is processing.",
    //   });
    // }

    /**
     * ---------------------------------------------------
     * Event Existence Check
     * ---------------------------------------------------
     */

    const event = booking.event;

    if (!event) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "Event associated with this booking not found.",
      });
    }

    /**
     * ---------------------------------------------------
     * Event Deleted Check
     * ---------------------------------------------------
     */

    if (event.isDeleted) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Cannot cancel booking for a deleted event.",
      });
    }

    /**
     * ---------------------------------------------------
     * Cancellation Deadline Validation
     * ---------------------------------------------------
     * Check if event has cancellationDeadline field
     * Otherwise use event start time as deadline
     */

    const now = new Date();

    if (event.cancellationDeadline && now > event.cancellationDeadline) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Cancellation deadline has passed.",
      });
    }

    if (!event.cancellationDeadline && now >= event.startDate) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Cannot cancel booking after event has started.",
      });
    }

    /**
     * ---------------------------------------------------
     * Determine New Payment Status
     * ---------------------------------------------------
     * Free events: No refund needed
     * Paid events (PAID): Refund needed
     * Paid events (UNPAID): Just cancel
     */

    let newPaymentStatus;

    if (event.isFree) {
      newPaymentStatus = "UNPAID"; // Free event, no payment involved
    } else {
      newPaymentStatus =
        booking.paymentStatus === "PAID" ? "REFUNDED" : "UNPAID";
    }

    /**
     * ---------------------------------------------------
     * Update Booking Status
     * ---------------------------------------------------
     * Set booking as CANCELLED with timestamp
     * Update payment status based on event type
     */

    booking.bookingStatus = "CANCELLED";
    booking.cancelledAt = now;
    booking.paymentStatus = newPaymentStatus;

    await booking.save({ session });

    /**
     * ---------------------------------------------------
     * Atomically Restore Event Capacity
     * ---------------------------------------------------
     * Decrement ticketsSold to restore capacity
     * Ensure ticketsSold never goes negative
     */

    const updatedEvent = await Event.findOneAndUpdate(
      {
        _id: event._id,
        ticketsSold: { $gte: booking.quantity },
      },
      {
        $inc: {
          ticketsSold: -booking.quantity,
        },
      },
      {
        new: true,
        session,
      },
    );

    /**
     * ---------------------------------------------------
     * Capacity Restoration Validation
     * ---------------------------------------------------
     * If update fails, ticketsSold would go negative
     * This should never happen but protects data integrity
     */

    if (!updatedEvent) {
      await session.abortTransaction();

      return res.status(409).json({
        success: false,
        message: "Unable to restore event capacity. Please contact support.",
      });
    }

    /**
     * ---------------------------------------------------
     * Commit Transaction
     * ---------------------------------------------------
     * All database operations succeeded
     * Persist changes atomically
     */

    await session.commitTransaction();

    /**
     * ---------------------------------------------------
     * Invalidate Booking Cache
     * ---------------------------------------------------
     * Invalidate all related booking caches:
     * - This specific booking
     * - User's booking list
     * - Organizer's booking list
     * - Event's booking list
     * - All bookings list (admin)
     */

    try {
      await invalidateBookingCache({
        bookingId: booking.bookingId,
        userId: booking.user.toString(),
        organizerId: booking.organizer.toString(),
        eventId: event._id.toString(),
      });
    } catch (cacheError) {
      // Redis failure should not affect successful DB transaction
      console.error("Booking cache invalidation failed:", cacheError);
    }

    /**
     * ---------------------------------------------------
     * Invalidate Event Cache
     * ---------------------------------------------------
     * Event capacity has changed, invalidate:
     * - Single event cache (by slug)
     * - Approved events list cache
     */

    try {
      if (event.slug) {
        await invalidateEventCache(event.slug);
      }

      await invalidateApprovedEventsCache();
    } catch (cacheError) {
      // Redis failure should not affect successful DB transaction
      console.error("Event cache invalidation failed:", cacheError);
    }

    /**
     * ---------------------------------------------------
     * Success Response
     * ---------------------------------------------------
     * Return updated booking details
     * Ready for future integrations:
     * - Razorpay Refund API
     * - Email notifications
     * - Socket.IO real-time updates
     * - Audit logs
     */

    return res.status(200).json({
      success: true,
      message: "Booking cancelled successfully.",
      data: {
        bookingId: booking.bookingId,
        ticketCode: booking.ticketCode,
        bookingStatus: booking.bookingStatus,
        paymentStatus: booking.paymentStatus,
        cancelledAt: booking.cancelledAt,
        quantity: booking.quantity,
        totalAmount: booking.totalAmount,
        refundNote:
          newPaymentStatus === "REFUNDED"
            ? "Refund will be processed within 5-7 business days."
            : null,
      },
    });
  } catch (error) {
    /**
     * ---------------------------------------------------
     * Transaction Rollback
     * ---------------------------------------------------
     * Any unexpected error aborts the transaction
     * All changes are rolled back automatically
     */

    await session.abortTransaction();

    console.error("Cancel Booking Error:", error);

    /**
     * ---------------------------------------------------
     * Error Response
     * ---------------------------------------------------
     * Never expose internal error details to client
     * Return generic user-friendly message
     */

    return res.status(500).json({
      success: false,
      message: "Unable to cancel booking. Please try again.",
    });
  } finally {
    /**
     * ---------------------------------------------------
     * Session Cleanup
     * ---------------------------------------------------
     * CRITICAL: Always end session to prevent memory leaks
     * Runs whether transaction succeeds or fails
     */

    await session.endSession();
  }
};
