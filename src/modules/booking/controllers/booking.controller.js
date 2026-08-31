import mongoose from "mongoose";

import Booking from "../model/booking.model.js";
import Event from "../../event/models/event.model.js";

import {
  invalidateBookingCache,
  bookingCacheKeys,
  getCache,
  setCache,
} from "../cache/booking.cache.js";
import {
  invalidateEventCache,
  invalidateApprovedEventsCache,
} from "../../event/cache/event.cache.js";

import { createBookingFromPayment } from "../services/booking.service.js";
import { generateQRCode } from "../../../utils/generateQRCode.js";
import { getIO } from "../../../config/socket.js";
import { createNotification } from "../../notification/services/notification.service.js";

/**
 * =====================================================
 * CREATE BOOKING CONTROLLER (Payment-First Architecture)
 * =====================================================
 * POST /api/v1/bookings
 *
 * In the payment-first architecture:
 * - FREE events: Booking is created directly (no payment needed)
 * - PAID events: Rejected — user must go through the payment flow
 *
 * Booking creation logic is delegated to the shared
 * booking service (booking.service.js) to avoid duplication.
 * =====================================================
 */

export const createBooking = async (req, res) => {
  try {
    const userId = req.user._id;

    const { eventId, quantity } = req.body;

    /**
     * ---------------------------------------------------
     * Fetch Event for Free/Paid Check
     * ---------------------------------------------------
     * Quick lookup before delegating to the service.
     * The service will re-validate inside a transaction.
     */

    const event = await Event.findById(eventId).select("isFree isDeleted status").lean();

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    /**
     * ---------------------------------------------------
     * Paid Event Guard
     * ---------------------------------------------------
     * Paid events MUST go through the payment flow.
     * Booking is created ONLY after successful payment.
     */

    if (!event.isFree) {
      return res.status(400).json({
        success: false,
        message: "This is a paid event. Please complete payment first via /api/v1/payments/create-order.",
      });
    }

    /**
     * ---------------------------------------------------
     * Create Booking via Shared Service
     * ---------------------------------------------------
     * Delegates to booking.service.js which handles:
     * - MongoDB Transaction
     * - Capacity validation
     * - Atomic ticket reservation
     * - Counter increment
     * - Booking ID generation
     * - Ticket Code generation
     * - Redis cache invalidation
     * - Event ticketsSold update
     */

    const result = await createBookingFromPayment({
      eventId,
      userId,
      quantity,
    });

    /**
     * ---------------------------------------------------
     * Success Response
     * ---------------------------------------------------
     */

    return res.status(201).json({
      success: true,
      message: "Booking created successfully.",
      data: {
        ...result.booking,
        event: result.event,
      },
    });
  } catch (error) {
    console.error("Create Booking Error:", error);

    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Unable to complete booking. Please try again.",
    });
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

/**
 * =====================================================
 * GET MY BOOKINGS CONTROLLER
 * =====================================================
 * Production-ready booking retrieval for authenticated users
 * - Pagination
 * - Filtering by bookingStatus and paymentStatus
 * - Sorting
 * - Redis caching
 * - Efficient queries with indexes
 * =====================================================
 */

export const getMyBookings = async (req, res) => {
  try {
    const userId = req.user._id;

    /**
     * ---------------------------------------------------
     * Extract Query Parameters
     * ---------------------------------------------------
     * Support pagination, filtering, and sorting
     */

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const bookingStatus = req.query.bookingStatus;
    const paymentStatus = req.query.paymentStatus;
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    /**
     * ---------------------------------------------------
     * Validate Limit (Prevent Abuse)
     * ---------------------------------------------------
     * Max 100 items per page to prevent performance issues
     */

    const validatedLimit = Math.min(limit, 100);

    /**
     * ---------------------------------------------------
     * Build Query Filter
     * ---------------------------------------------------
     * Always filter by authenticated user
     * Optional filters for bookingStatus and paymentStatus
     */

    const query = { user: userId };

    if (bookingStatus) {
      const validBookingStatuses = [
        "PENDING",
        "CONFIRMED",
        "CANCELLED",
        "EXPIRED",
      ];

      if (validBookingStatuses.includes(bookingStatus)) {
        query.bookingStatus = bookingStatus;
      }
    }

    if (paymentStatus) {
      const validPaymentStatuses = ["UNPAID", "PAID", "REFUNDED"];

      if (validPaymentStatuses.includes(paymentStatus)) {
        query.paymentStatus = paymentStatus;
      }
    }

    /**
     * ---------------------------------------------------
     * Generate Cache Key
     * ---------------------------------------------------
     * Include all query parameters in cache key
     * to avoid returning stale filtered data
     */

    const cacheKey = `${bookingCacheKeys.userBookings(
      userId.toString(),
      page,
      validatedLimit,
    )}:status:${bookingStatus || "all"}:payment:${paymentStatus || "all"}:sort:${sortBy}:${sortOrder}`;

    /**
     * ---------------------------------------------------
     * Check Redis Cache
     * ---------------------------------------------------
     * Return cached response if available
     */

    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json(cachedData);
    }

    /**
     * ---------------------------------------------------
     * Build Sort Object
     * ---------------------------------------------------
     * Validate sortBy field to prevent NoSQL injection
     */

    const validSortFields = ["createdAt", "updatedAt", "totalAmount"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";

    const sort = { [sortField]: sortOrder };

    /**
     * ---------------------------------------------------
     * Fetch Bookings with Pagination
     * ---------------------------------------------------
     * Uses index: { user: 1, createdAt: -1 }
     * Populate only essential event fields
     */

    const bookings = await Booking.find(query)
      .select(
        "bookingId ticketCode quantity pricePerTicket totalAmount bookingStatus paymentStatus checkedIn checkedInAt cancelledAt createdAt updatedAt",
      )
      .populate({
        path: "event",
        select:
          "title slug startDate endDate venue.venueName venue.city venue.state coverImage category isFree price status isDeleted",
      })
      .sort(sort)
      .skip(skip)
      .limit(validatedLimit)
      .lean();

    /**
     * ---------------------------------------------------
     * Get Total Count
     * ---------------------------------------------------
     * Required for pagination metadata
     */

    const totalBookings = await Booking.countDocuments(query);

    /**
     * ---------------------------------------------------
     * Calculate Pagination Metadata
     * ---------------------------------------------------
     */

    const totalPages = Math.ceil(totalBookings / validatedLimit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    /**
     * ---------------------------------------------------
     * Build Response
     * ---------------------------------------------------
     * Consistent with existing project response structure
     */

    const response = {
      success: true,
      message: "Bookings retrieved successfully.",
      data: {
        bookings,
        pagination: {
          currentPage: page,
          totalPages,
          totalBookings,
          limit: validatedLimit,
          hasNextPage,
          hasPrevPage,
        },
      },
    };

    /**
     * ---------------------------------------------------
     * Cache Successful Response
     * ---------------------------------------------------
     * Only cache successful responses
     * TTL defined in booking.cache.js (300 seconds)
     */

    await setCache(cacheKey, response);

    /**
     * ---------------------------------------------------
     * Return Response
     * ---------------------------------------------------
     */

    return res.status(200).json(response);
  } catch (error) {
    /**
     * ---------------------------------------------------
     * Error Handling
     * ---------------------------------------------------
     * Never expose internal error details
     * Log for debugging purposes only
     */

    console.error("Get My Bookings Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve bookings. Please try again.",
    });
  }
};

/**
 * =====================================================
 * GET BOOKING BY ID CONTROLLER
 * =====================================================
 * Production-ready single booking retrieval with:
 * - Authorization checks (owner, admin, organizer)
 * - Complete booking details for ticket page
 * - Redis caching
 * - Efficient population
 * - Security against enumeration
 * =====================================================
 */

export const getBookingById = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const loggedInUserRole = req.user.role;

    const { bookingId } = req.params;

    /**
     * ---------------------------------------------------
     * Check Redis Cache
     * ---------------------------------------------------
     * Generate cache key and check for cached booking
     * Only authorized responses are cached
     */

    const cacheKey = bookingCacheKeys.booking(bookingId);
    const cachedBooking = await getCache(cacheKey);

    if (cachedBooking) {
      /**
       * ---------------------------------------------------
       * Authorization Check for Cached Data
       * ---------------------------------------------------
       * Even with cache, verify user is authorized
       * This prevents unauthorized access to cached data
       */

      const isOwner =
        cachedBooking.data.user._id.toString() === loggedInUserId.toString();
      const isAdmin = loggedInUserRole === "admin";
      const isEventOrganizer =
        loggedInUserRole === "organizer" &&
        cachedBooking.data.organizer._id.toString() ===
        loggedInUserId.toString();

      if (isOwner || isAdmin || isEventOrganizer) {
        return res.status(200).json(cachedBooking);
      }

      // Not authorized - continue to DB to return proper 403
    }

    /**
     * ---------------------------------------------------
     * Fetch Booking from Database
     * ---------------------------------------------------
     * Find by bookingId (ZNZ-YYYYMMDD-XXXXXX format)
     * Populate user, event, and organizer details
     */

    const booking = await Booking.findOne({ bookingId })
      .populate({
        path: "user",
        select: "name email avatar",
      })
      .populate({
        path: "event",
        select:
          "title slug shortDescription description category tags startDate endDate venue coverImage galleryImages capacity isFree price status ticketsSold bookingDeadline maxTicketsPerBooking",
      })
      .populate({
        path: "organizer",
        select: "name email avatar",
      })
      .lean();

    /**
     * ---------------------------------------------------
     * Booking Not Found
     * ---------------------------------------------------
     * Return 404 without revealing if booking exists
     * Prevents booking ID enumeration
     */

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    /**
     * ---------------------------------------------------
     * Authorization Check
     * ---------------------------------------------------
     * Allow access only if:
     * 1. User owns the booking
     * 2. User is ADMIN
     * 3. User is ORGANIZER and owns the event
     */

    const isOwner = booking.user._id.toString() === loggedInUserId.toString();
    const isAdmin = loggedInUserRole === "admin";
    const isEventOrganizer =
      loggedInUserRole === "organizer" &&
      booking.organizer._id.toString() === loggedInUserId.toString();

    if (!isOwner && !isAdmin && !isEventOrganizer) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this booking.",
      });
    }

    /**
     * ---------------------------------------------------
     * QR Code Generation (QR Ticket System)
     * ---------------------------------------------------
     * Only generate QR code for valid, confirmed and paid bookings.
     */
    let qrCode = null;
    if (
      booking.bookingStatus === "CONFIRMED" &&
      booking.paymentStatus === "PAID" &&
      booking.ticketCode
    ) {
      qrCode = await generateQRCode(booking.ticketCode);
    }

    /**
     * ---------------------------------------------------
     * Build Complete Response
     * ---------------------------------------------------
     * Return all details needed for:
     * - Booking details page
     * - Downloadable ticket
     * - QR code generation
     * - Invoice generation
     * - Email ticket
     */

    const response = {
      success: true,
      message: "Booking retrieved successfully.",
      data: {
        // Booking Information
        bookingId: booking.bookingId,
        ticketCode: booking.ticketCode,
        ticketStatus: booking.ticketStatus,
        qrCode,
        quantity: booking.quantity,
        pricePerTicket: booking.pricePerTicket,
        totalAmount: booking.totalAmount,

        // Status
        bookingStatus: booking.bookingStatus,
        paymentStatus: booking.paymentStatus,

        // Check-in Details
        checkedIn: booking.checkedIn,
        checkedInAt: booking.checkedInAt,

        // Cancellation Details
        cancelledAt: booking.cancelledAt,

        // Timestamps
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,

        // User Details (Booking Owner)
        user: {
          _id: booking.user._id,
          name: booking.user.name,
          email: booking.user.email,
          avatar: booking.user.avatar,
        },

        // Event Details (Complete for ticket display)
        event: {
          _id: booking.event._id,
          title: booking.event.title,
          slug: booking.event.slug,
          shortDescription: booking.event.shortDescription,
          description: booking.event.description,
          category: booking.event.category,
          tags: booking.event.tags,
          startDate: booking.event.startDate,
          endDate: booking.event.endDate,
          venue: booking.event.venue,
          coverImage: booking.event.coverImage,
          galleryImages: booking.event.galleryImages,
          capacity: booking.event.capacity,
          ticketsSold: booking.event.ticketsSold,
          isFree: booking.event.isFree,
          price: booking.event.price,
          status: booking.event.status,
          bookingDeadline: booking.event.bookingDeadline,
          maxTicketsPerBooking: booking.event.maxTicketsPerBooking,
        },

        // Organizer Details
        organizer: {
          _id: booking.organizer._id,
          name: booking.organizer.name,
          email: booking.organizer.email,
          avatar: booking.organizer.avatar,
        },
      },
    };

    /**
     * ---------------------------------------------------
     * Cache Successful Response
     * ---------------------------------------------------
     * Only cache after authorization check passes
     * TTL defined in booking.cache.js (300 seconds)
     */

    await setCache(cacheKey, response);

    /**
     * ---------------------------------------------------
     * Return Response
     * ---------------------------------------------------
     * Complete booking details ready for:
     * - Ticket page rendering
     * - PDF ticket generation
     * - QR code display
     * - Invoice download
     * - Email notifications
     */

    return res.status(200).json(response);
  } catch (error) {
    /**
     * ---------------------------------------------------
     * Error Handling
     * ---------------------------------------------------
     * Never expose internal error details
     * Log for debugging purposes only
     */

    console.error("Get Booking By ID Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve booking. Please try again.",
    });
  }
};

/**
 * =====================================================
 * GET EVENT BOOKINGS CONTROLLER
 * =====================================================
 * Production-ready event bookings retrieval for organizers
 * Powers the Organizer Dashboard with:
 * - Authorization checks (organizer ownership, admin)
 * - Pagination
 * - Filtering by bookingStatus, paymentStatus, checkedIn
 * - Search by bookingId, ticketCode, attendee name/email
 * - Sorting
 * - Redis caching
 * - Efficient queries with indexes
 * =====================================================
 */

export const getEventBookings = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const loggedInUserRole = req.user.role;

    const { eventId } = req.params;

    /**
     * ---------------------------------------------------
     * Validate Event ID
     * ---------------------------------------------------
     * Ensure valid MongoDB ObjectId format
     */

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID.",
      });
    }

    /**
     * ---------------------------------------------------
     * Fetch Event
     * ---------------------------------------------------
     * Verify event exists and is not deleted
     */

    const event = await Event.findById(eventId)
      .select("title slug organizer isDeleted")
      .lean();

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    /**
     * ---------------------------------------------------
     * Event Deleted Check
     * ---------------------------------------------------
     * Prevent access to deleted events
     */

    if (event.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    /**
     * ---------------------------------------------------
     * Authorization Check
     * ---------------------------------------------------
     * Allow access only if:
     * 1. User is ADMIN
     * 2. User is ORGANIZER and owns the event
     */

    const isAdmin = loggedInUserRole === "admin";
    const isEventOrganizer =
      loggedInUserRole === "organizer" &&
      event.organizer.toString() === loggedInUserId.toString();

    if (!isAdmin && !isEventOrganizer) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view bookings for this event.",
      });
    }

    /**
     * ---------------------------------------------------
     * Extract Query Parameters
     * ---------------------------------------------------
     * Support pagination, filtering, sorting, and search
     */

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const bookingStatus = req.query.bookingStatus;
    const paymentStatus = req.query.paymentStatus;
    const checkedIn = req.query.checkedIn;
    const search = req.query.search;
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    /**
     * ---------------------------------------------------
     * Validate Limit (Prevent Abuse)
     * ---------------------------------------------------
     * Max 100 items per page to prevent performance issues
     */

    const validatedLimit = Math.min(limit, 100);

    /**
     * ---------------------------------------------------
     * Build Query Filter
     * ---------------------------------------------------
     * Always filter by event ID
     * Optional filters for status, payment, check-in
     */

    const query = { event: eventId };

    if (bookingStatus) {
      const validBookingStatuses = [
        "PENDING",
        "CONFIRMED",
        "CANCELLED",
        "EXPIRED",
      ];

      if (validBookingStatuses.includes(bookingStatus)) {
        query.bookingStatus = bookingStatus;
      }
    }

    if (paymentStatus) {
      const validPaymentStatuses = ["UNPAID", "PAID", "REFUNDED"];

      if (validPaymentStatuses.includes(paymentStatus)) {
        query.paymentStatus = paymentStatus;
      }
    }

    if (checkedIn !== undefined) {
      query.checkedIn = checkedIn === "true";
    }

    /**
     * ---------------------------------------------------
     * Search Implementation
     * ---------------------------------------------------
     * Search by bookingId or ticketCode
     * Uses indexed fields for performance
     */

    if (search && search.trim()) {
      const searchTerm = search.trim().toUpperCase();

      query.$or = [
        { bookingId: { $regex: searchTerm, $options: "i" } },
        { ticketCode: { $regex: searchTerm, $options: "i" } },
      ];
    }

    /**
     * ---------------------------------------------------
     * Generate Cache Key
     * ---------------------------------------------------
     * Include all query parameters in cache key
     * to avoid returning stale filtered data
     */

    const cacheKey = `${bookingCacheKeys.eventBookings(
      eventId,
      page,
      validatedLimit,
    )}:status:${bookingStatus || "all"}:payment:${paymentStatus || "all"}:checkedIn:${checkedIn || "all"}:search:${search || "none"}:sort:${sortBy}:${sortOrder}`;

    /**
     * ---------------------------------------------------
     * Check Redis Cache
     * ---------------------------------------------------
     * Return cached response if available
     */

    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json(cachedData);
    }

    /**
     * ---------------------------------------------------
     * Build Sort Object
     * ---------------------------------------------------
     * Validate sortBy field to prevent NoSQL injection
     */

    const validSortFields = [
      "createdAt",
      "updatedAt",
      "totalAmount",
      "bookingStatus",
      "paymentStatus",
    ];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";

    const sort = { [sortField]: sortOrder };

    /**
     * ---------------------------------------------------
     * Fetch Bookings with Pagination
     * ---------------------------------------------------
     * Uses index: { event: 1, bookingStatus: 1 }
     * Populate user details for attendee information
     */

    const bookings = await Booking.find(query)
      .select(
        "bookingId ticketCode quantity pricePerTicket totalAmount bookingStatus paymentStatus checkedIn checkedInAt cancelledAt createdAt updatedAt",
      )
      .populate({
        path: "user",
        select: "name email avatar",
      })
      .sort(sort)
      .skip(skip)
      .limit(validatedLimit)
      .lean();

    /**
     * ---------------------------------------------------
     * Get Total Count
     * ---------------------------------------------------
     * Required for pagination metadata
     */

    const totalBookings = await Booking.countDocuments(query);

    /**
     * ---------------------------------------------------
     * Calculate Pagination Metadata
     * ---------------------------------------------------
     */

    const totalPages = Math.ceil(totalBookings / validatedLimit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    /**
     * ---------------------------------------------------
     * Calculate Summary Statistics
     * ---------------------------------------------------
     * Provide quick metrics for organizer dashboard
     * Ready for analytics integration
     */

    const summary = {
      totalBookings,
      confirmedBookings: await Booking.countDocuments({
        event: eventId,
        bookingStatus: "CONFIRMED",
      }),
      cancelledBookings: await Booking.countDocuments({
        event: eventId,
        bookingStatus: "CANCELLED",
      }),
      checkedInAttendees: await Booking.countDocuments({
        event: eventId,
        checkedIn: true,
      }),
    };

    /**
     * ---------------------------------------------------
     * Build Response
     * ---------------------------------------------------
     * Consistent with existing project response structure
     * Includes event context and summary statistics
     */

    const response = {
      success: true,
      message: "Event bookings retrieved successfully.",
      data: {
        event: {
          _id: event._id,
          title: event.title,
          slug: event.slug,
        },
        bookings,
        summary,
        pagination: {
          currentPage: page,
          totalPages,
          totalBookings,
          limit: validatedLimit,
          hasNextPage,
          hasPrevPage,
        },
      },
    };

    /**
     * ---------------------------------------------------
     * Cache Successful Response
     * ---------------------------------------------------
     * Only cache successful responses
     * TTL defined in booking.cache.js (300 seconds)
     */

    await setCache(cacheKey, response);

    /**
     * ---------------------------------------------------
     * Return Response
     * ---------------------------------------------------
     * Complete event booking data ready for:
     * - Organizer Dashboard
     * - CSV Export
     * - Excel Export
     * - QR Check-in
     * - Analytics
     * - Revenue reports
     */

    return res.status(200).json(response);
  } catch (error) {
    /**
     * ---------------------------------------------------
     * Error Handling
     * ---------------------------------------------------
     * Never expose internal error details
     * Log for debugging purposes only
     */

    console.error("Get Event Bookings Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve event bookings. Please try again.",
    });
  }
};

/**
 * =====================================================
 * CHECK-IN BOOKING CONTROLLER
 * =====================================================
 * Production-ready booking check-in for QR scanner
 * - Authorization checks (organizer, admin)
 * - Comprehensive validations
 * - Duplicate check-in prevention
 * - Redis cache invalidation
 * - Ready for Socket.IO integration
 * =====================================================
 */

export const checkInBooking = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const loggedInUserRole = req.user.role;

    const { ticketCode } = req.params;

    /**
     * ---------------------------------------------------
     * Fetch Booking by Ticket Code
     * ---------------------------------------------------
     * QR scanner provides ticketCode (8-char alphanumeric)
     * Populate event for validation
     */

    const booking = await Booking.findOne({ ticketCode })
      .populate({
        path: "event",
        select: "title slug organizer startDate endDate isDeleted",
      })
      .populate({
        path: "user",
        select: "name email avatar",
      });

    /**
     * ---------------------------------------------------
     * Booking Not Found
     * ---------------------------------------------------
     * Invalid ticket code or booking doesn't exist
     */

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found. Invalid ticket code.",
      });
    }

    /**
     * ---------------------------------------------------
     * Event Validation
     * ---------------------------------------------------
     * Ensure event exists and is not deleted
     */

    const event = booking.event;

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event associated with this booking not found.",
      });
    }

    if (event.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "Cannot check in for a deleted event.",
      });
    }

    /**
     * ---------------------------------------------------
     * Authorization Check
     * ---------------------------------------------------
     * Only event organizer or admin can check in attendees
     * Prevents other organizers from checking in attendees
     */

    const isAdmin = loggedInUserRole === "admin";
    const isEventOrganizer =
      loggedInUserRole === "organizer" &&
      event.organizer.toString() === loggedInUserId.toString();

    if (!isAdmin && !isEventOrganizer) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to check in attendees for this event.",
      });
    }

    /**
     * ---------------------------------------------------
     * Booking Status Validation
     * ---------------------------------------------------
     * Cannot check in cancelled bookings
     */

    if (booking.bookingStatus === "CANCELLED") {
      return res.status(400).json({
        success: false,
        message: "Cannot check in a cancelled booking.",
      });
    }

    /**
     * ---------------------------------------------------
     * Payment Validation
     * ---------------------------------------------------
     * Check if booking is paid (or free event)
     * Free events have paymentStatus: "PAID"
     * Paid events must be "PAID" status
     */

    if (booking.paymentStatus !== "PAID") {
      return res.status(400).json({
        success: false,
        message: "Cannot check in. Payment not completed.",
      });
    }

    /**
     * ---------------------------------------------------
     * Ticket Status Validation
     * ---------------------------------------------------
     * Ensure ticket is VALID before proceeding.
     */

    if (booking.ticketStatus === "USED" || booking.checkedIn) {
      return res.status(400).json({
        success: false,
        message: "Ticket has already been used.",
        data: {
          checkedInAt: booking.checkedInAt,
        },
      });
    }

    if (booking.ticketStatus === "CANCELLED") {
      return res.status(400).json({
        success: false,
        message: "Ticket is cancelled.",
      });
    }

    /**
     * ---------------------------------------------------
     * Event Timing Validation
     * ---------------------------------------------------
     * Allow check-in only after event has started
     * Prevent early check-ins (optional - adjust based on business rules)
     */

    const now = new Date();

    // Allow check-in 30 minutes before event starts (flexible window)
    const checkInWindowStart = new Date(
      event.startDate.getTime() - 30 * 60 * 1000,
    );

    if (now < checkInWindowStart) {
      return res.status(400).json({
        success: false,
        message: "Check-in not available yet. Event has not started.",
      });
    }

    /**
     * ---------------------------------------------------
     * Update Booking - Check In (Atomic)
     * ---------------------------------------------------
     * Mark ticket as used and checked in with timestamp.
     * Prevents duplicate check-ins if scanned simultaneously.
     */

    const updatedBooking = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        ticketStatus: "VALID", // Atomic condition: must be VALID
      },
      {
        $set: {
          ticketStatus: "USED",
          checkedIn: true,
          checkedInAt: now,
        },
      },
      { new: true }
    );

    if (!updatedBooking) {
      return res.status(400).json({
        success: false,
        message: "Ticket has already been used.",
      });
    }

    /**
     * ---------------------------------------------------
     * Invalidate Cache
     * ---------------------------------------------------
     * Invalidate relevant caches after successful check-in
     * - Single booking cache
     * - User bookings cache
     * - Event bookings cache (organizer dashboard)
     */

    try {
      await invalidateBookingCache({
        bookingId: booking.bookingId,
        userId: booking.user._id.toString(),
        organizerId: booking.organizer.toString(),
        eventId: event._id.toString(),
      });
    } catch (cacheError) {
      // Redis failure should not affect successful check-in
      console.error("Cache invalidation failed:", cacheError);
    }

    /**
     * ---------------------------------------------------
     * Socket.io Real-Time Check-in Notifications
     * ---------------------------------------------------
     * Emitted after DB update and cache invalidation.
     * Fire-and-forget — Socket.io failure must never
     * block the check-in response.
     */

    try {
      const io = getIO();

      // Notify the ticket-owning user
      io.to(`user:${booking.user._id.toString()}`).emit("ticket:updated", {
        bookingId: booking.bookingId,
        ticketCode: booking.ticketCode,
        ticketStatus: updatedBooking.ticketStatus,
        checkedIn: updatedBooking.checkedIn,
        checkedInAt: updatedBooking.checkedInAt,
        eventId: event._id.toString(),
        eventTitle: event.title,
      });

      // Notify the event organizer
      io.to(`organizer:${event.organizer.toString()}`).emit("ticket:checked-in", {
        bookingId: booking.bookingId,
        ticketCode: booking.ticketCode,
        ticketStatus: updatedBooking.ticketStatus,
        checkedIn: updatedBooking.checkedIn,
        checkedInAt: updatedBooking.checkedInAt,
        eventId: event._id.toString(),
        eventTitle: event.title,
        quantity: booking.quantity,
        attendee: {
          name: booking.user.name,
        },
      });
    } catch (socketError) {
      // Socket.io failure is non-critical
      console.error("[Socket.io] Check-in emit failed:", socketError.message);
    }

    /**
     * ---------------------------------------------------
     * Persistent Notification (post check-in)
     * ---------------------------------------------------
     */

    try {
      await createNotification({
        recipientId: booking.user._id,
        type: "TICKET_CHECKED_IN",
        title: "Ticket Checked In",
        message: `Your ticket for ${event.title} has been checked in.`,
        relatedEntity: {
          entityType: "Booking",
          entityId: booking._id,
        },
      });
    } catch (notifError) {
      console.error("[Notification] Check-in notification failed:", notifError.message);
    }

    /**
     * ---------------------------------------------------
     * Success Response
     * ---------------------------------------------------
     * Return updated booking with attendee information
     * Ready for:
     * - QR Scanner display
     * - Attendance analytics
     * - Event capacity dashboard
     */

    return res.status(200).json({
      success: true,
      message: "Attendee checked in successfully.",
      data: {
        bookingId: booking.bookingId,
        ticketCode: booking.ticketCode,
        ticketStatus: updatedBooking.ticketStatus,
        quantity: booking.quantity,
        checkedIn: updatedBooking.checkedIn,
        checkedInAt: updatedBooking.checkedInAt,
        user: {
          _id: booking.user._id,
          name: booking.user.name,
          email: booking.user.email,
          avatar: booking.user.avatar,
        },
        event: {
          _id: event._id,
          title: event.title,
          slug: event.slug,
          startDate: event.startDate,
          endDate: event.endDate,
        },
      },
    });
  } catch (error) {
    /**
     * ---------------------------------------------------
     * Error Handling
     * ---------------------------------------------------
     * Never expose internal error details
     * Log for debugging purposes only
     */

    console.error("Check In Booking Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to check in booking. Please try again.",
    });
  }
};

/**
 * =====================================================
 * DELETE BOOKING CONTROLLER
 * =====================================================
 * Production-ready booking deletion (Admin only)
 * - Hard delete (no soft delete in Booking model)
 * - Transaction-based (restore event capacity)
 * - Admin-only authorization
 * - Cache invalidation
 * - Audit-ready structure
 * =====================================================
 */

export const deleteBooking = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const loggedInUserId = req.user._id;
    const loggedInUserRole = req.user.role;

    const { bookingId } = req.params;

    /**
     * ---------------------------------------------------
     * Authorization Check
     * ---------------------------------------------------
     * Only administrators can delete bookings
     * This is a destructive operation requiring highest privileges
     */

    if (loggedInUserRole !== "admin") {
      await session.abortTransaction();

      return res.status(403).json({
        success: false,
        message: "Only administrators can delete bookings.",
      });
    }

    /**
     * ---------------------------------------------------
     * Fetch Booking
     * ---------------------------------------------------
     * Find by bookingId (ZNZ-YYYYMMDD-XXXXXX format)
     * Populate event for capacity restoration
     */

    const booking = await Booking.findOne({ bookingId })
      .populate({
        path: "event",
        select: "_id title slug organizer ticketsSold capacity isDeleted",
      })
      .session(session);

    /**
     * ---------------------------------------------------
     * Booking Not Found
     * ---------------------------------------------------
     * Return 404 if booking doesn't exist
     */

    if (!booking) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    /**
     * ---------------------------------------------------
     * Store Booking Data for Response
     * ---------------------------------------------------
     * Capture before deletion for audit trail
     */

    const deletedBookingData = {
      bookingId: booking.bookingId,
      ticketCode: booking.ticketCode,
      userId: booking.user.toString(),
      organizerId: booking.organizer.toString(),
      eventId: booking.event._id.toString(),
      quantity: booking.quantity,
      bookingStatus: booking.bookingStatus,
      paymentStatus: booking.paymentStatus,
      totalAmount: booking.totalAmount,
    };

    /**
     * ---------------------------------------------------
     * Event Capacity Restoration
     * ---------------------------------------------------
     * If booking was CONFIRMED (not cancelled):
     * - Restore event capacity
     * - Decrement ticketsSold
     *
     * If booking was CANCELLED:
     * - Capacity already restored during cancellation
     * - No need to restore again
     */

    let capacityRestored = false;

    if (booking.bookingStatus === "CONFIRMED" && booking.event) {
      /**
       * ---------------------------------------------------
       * Atomically Restore Event Capacity
       * ---------------------------------------------------
       * Only if event still exists and not deleted
       * Ensure ticketsSold never goes negative
       */

      if (!booking.event.isDeleted) {
        const updatedEvent = await Event.findOneAndUpdate(
          {
            _id: booking.event._id,
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

        if (updatedEvent) {
          capacityRestored = true;
        }
      }
    }

    /**
     * ---------------------------------------------------
     * Delete Booking
     * ---------------------------------------------------
     * Hard delete from database
     * No soft delete fields in Booking model
     */

    await Booking.deleteOne({ _id: booking._id }).session(session);

    /**
     * ---------------------------------------------------
     * Commit Transaction
     * ---------------------------------------------------
     * All operations succeeded
     * Changes are permanent
     */

    await session.commitTransaction();

    /**
     * ---------------------------------------------------
     * Invalidate Cache
     * ---------------------------------------------------
     * Clear all booking-related caches
     * Uses existing invalidateBookingCache helper
     */

    try {
      await invalidateBookingCache({
        bookingId: deletedBookingData.bookingId,
        userId: deletedBookingData.userId,
        organizerId: deletedBookingData.organizerId,
        eventId: deletedBookingData.eventId,
      });
    } catch (cacheError) {
      // Redis failure should not affect successful deletion
      console.error("Cache invalidation failed after deletion:", cacheError);
    }

    /**
     * ---------------------------------------------------
     * Invalidate Event Cache
     * ---------------------------------------------------
     * If capacity was restored, event cache needs update
     */

    if (capacityRestored && booking.event.slug) {
      try {
        await invalidateEventCache(booking.event.slug);
        await invalidateApprovedEventsCache();
      } catch (cacheError) {
        console.error("Event cache invalidation failed:", cacheError);
      }
    }

    /**
     * ---------------------------------------------------
     * Success Response
     * ---------------------------------------------------
     * Return deleted booking info (for audit logs)
     * Ready for future audit trail integration
     */

    return res.status(200).json({
      success: true,
      message: "Booking deleted successfully.",
      data: {
        bookingId: deletedBookingData.bookingId,
        ticketCode: deletedBookingData.ticketCode,
        quantity: deletedBookingData.quantity,
        capacityRestored,
        deletedBy: loggedInUserId.toString(),
        deletedAt: new Date(),
      },
    });
  } catch (error) {
    /**
     * ---------------------------------------------------
     * Transaction Rollback
     * ---------------------------------------------------
     * Any error rolls back all changes
     * Booking remains in database
     */

    await session.abortTransaction();

    console.error("Delete Booking Error:", error);

    /**
     * ---------------------------------------------------
     * Error Response
     * ---------------------------------------------------
     * Never expose internal error details
     * Return generic user-friendly message
     */

    return res.status(500).json({
      success: false,
      message: "Unable to delete booking. Please try again.",
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
