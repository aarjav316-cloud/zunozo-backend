import { z } from "zod";
import mongoose from "mongoose";

/**
 * Custom ObjectId Validator
 */
const objectIdSchema = z
  .string()
  .refine((value) => mongoose.Types.ObjectId.isValid(value), {
    message: "Invalid MongoDB ObjectId",
  });

/**
 * ==========================
 * Create Razorpay Order
 * ==========================
 * Payment-first architecture:
 * Accepts eventId + quantity instead of bookingId.
 * No booking exists at this point.
 */
export const createOrderSchema = z.object({
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
 * Verify Razorpay Payment
 * ==========================
 * Unchanged — Razorpay fields remain the same.
 */
export const verifyPaymentSchema = z.object({
  body: z.object({
    razorpay_order_id: z
      .string({
        required_error: "Razorpay order ID is required",
        invalid_type_error: "Razorpay order ID must be a string",
      })
      .trim()
      .min(1, "Razorpay order ID cannot be empty"),

    razorpay_payment_id: z
      .string({
        required_error: "Razorpay payment ID is required",
        invalid_type_error: "Razorpay payment ID must be a string",
      })
      .trim()
      .min(1, "Razorpay payment ID cannot be empty"),

    razorpay_signature: z
      .string({
        required_error: "Razorpay signature is required",
        invalid_type_error: "Razorpay signature must be a string",
      })
      .trim()
      .min(1, "Razorpay signature cannot be empty"),
  }),
});
