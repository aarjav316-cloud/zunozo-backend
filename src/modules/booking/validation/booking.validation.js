import {z} from "zod";
import mongoose from 'mongoose'



/**
 * Custom ObjectId Validator
 */
const objectIdSchema = z.string().refine(
  (value) => mongoose.Types.ObjectId.isValid(value),
  {
    message: "Invalid MongoDB ObjectId",
  }
);

/**
 * ==========================
 * Create Booking
 * ==========================
 */
export const createBookingSchema = z.object({
  body: z.object({
    eventId: objectIdSchema,

    quantity: z
      .number({
        required_error: "Quantity is required",
        invalid_type_error: "Quantity must be a number",
      })
      .int("Quantity must be an integer")
      .min(1, "Minimum 1 ticket is required")
      .max(10, "Maximum 10 tickets allowed per booking"),
  }),
});

/**
 * ==========================
 * Cancel Booking
 * ==========================
 */
export const cancelBookingSchema = z.object({
  params: z.object({
    bookingId: objectIdSchema,
  }),
});

/**
 * ==========================
 * Get Booking Details
 * ==========================
 */
export const bookingIdParamSchema = z.object({
  params: z.object({
    bookingId: objectIdSchema,
  }),
});

/**
 * ==========================
 * Organizer Event Bookings
 * ==========================
 */
export const eventIdParamSchema = z.object({
  params: z.object({
    eventId: objectIdSchema,
  }),
});

/**
 * ==========================
 * Common Query Validation
 * ==========================
 */
export const bookingQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),

    limit: z.coerce.number().int().min(1).max(100).default(10),

    bookingStatus: z
      .enum(["PENDING", "CONFIRMED", "CANCELLED", "EXPIRED"])
      .optional(),

    paymentStatus: z
      .enum(["UNPAID", "PAID", "REFUNDED"])
      .optional(),
  }),
});