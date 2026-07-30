import express from "express";

import {
  createBooking,
  cancelBooking,
  getMyBookings,
  getBookingById,
  getEventBookings,
  checkInBooking,
  deleteBooking,
} from "../controllers/booking.controller.js";

import { protect } from "../../../middleware/middleware.js";
import { authorizeRoles } from "../../../middleware/rbac.middleware.js";
import validate from "../../../middleware/validate.middleware.js";

import {
  createBookingSchema,
  cancelBookingSchema,
  bookingIdParamSchema,
  eventIdParamSchema,
  bookingQuerySchema,
} from "../validation/booking.validation.js";

const router = express.Router();

/**
 * =====================================================
 * PUBLIC ROUTES
 * =====================================================
 * No authentication required
 * =====================================================
 */

// None - All booking operations require authentication

/**
 * =====================================================
 * AUTHENTICATED USER ROUTES
 * =====================================================
 * Requires: protect middleware
 * Accessible by: All authenticated users
 * =====================================================
 */

/**
 * Create Booking
 * POST /api/bookings
 *
 * Any authenticated user can create a booking
 * Validates: eventId, quantity
 */
router.post("/", protect, validate(createBookingSchema), createBooking);

/**
 * Get My Bookings
 * GET /api/bookings/my-bookings
 *
 * User retrieves their own bookings
 * Supports: pagination, filtering, sorting
 * Query params: page, limit, bookingStatus, paymentStatus, sortBy, sortOrder
 */
router.get(
  "/my-bookings",
  protect,
  validate(bookingQuerySchema),
  getMyBookings,
);

/**
 * Get Booking By ID
 * GET /api/bookings/:bookingId
 *
 * Authorization: Owner, Organizer (of event), or Admin
 * Returns complete booking details
 */
router.get(
  "/:bookingId",
  protect,
  validate(bookingIdParamSchema),
  getBookingById,
);

/**
 * Cancel Booking
 * POST /api/bookings/:bookingId/cancel
 *
 * Authorization: Owner, Organizer (of event), or Admin
 * Restores event capacity, handles refunds
 */
router.post(
  "/:bookingId/cancel",
  protect,
  validate(cancelBookingSchema),
  cancelBooking,
);

/**
 * =====================================================
 * ORGANIZER ROUTES
 * =====================================================
 * Requires: protect + authorizeRoles("organizer", "admin")
 * Accessible by: Organizers (own events) and Admins
 * =====================================================
 */

/**
 * Get Event Bookings
 * GET /api/bookings/event/:eventId
 *
 * Organizer Dashboard: View all bookings for their event
 * Admin: Can view any event's bookings
 * Supports: pagination, filtering, search, sorting
 * Query params: page, limit, bookingStatus, paymentStatus, checkedIn, search, sortBy, sortOrder
 */
router.get(
  "/event/:eventId",
  protect,
  authorizeRoles("organizer", "admin"),
  validate(eventIdParamSchema),
  getEventBookings,
);

/**
 * Check-In Booking
 * POST /api/bookings/checkin/:ticketCode
 *
 * QR Scanner endpoint for checking in attendees
 * Only event organizer or admin can check in
 * Uses ticketCode (8-char alphanumeric) from QR scan
 */
router.post(
  "/checkin/:ticketCode",
  protect,
  authorizeRoles("organizer", "admin"),
  checkInBooking,
);

/**
 * =====================================================
 * ADMIN ROUTES
 * =====================================================
 * Requires: protect + authorizeRoles("admin")
 * Accessible by: Admins only
 * =====================================================
 */

/**
 * Delete Booking
 * DELETE /api/bookings/:bookingId
 *
 * Admin-only: Permanent deletion
 * Hard delete (no soft delete in Booking model)
 * Restores event capacity if booking was confirmed
 * Use cases: Test cleanup, GDPR compliance, fraud removal
 */
router.delete(
  "/:bookingId",
  protect,
  authorizeRoles("admin"),
  validate(bookingIdParamSchema),
  deleteBooking,
);

export default router;
