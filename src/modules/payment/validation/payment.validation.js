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
 */
export const createOrderSchema = z.object({
  body: z.object({
    bookingId: objectIdSchema,
  }),
});

/**
 * ==========================
 * Verify Razorpay Payment
 * ==========================
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
