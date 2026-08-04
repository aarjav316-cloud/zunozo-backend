import express from "express";

import {
  createOrder,
  verifyPayment,
} from "../controllers/payment.controller.js";

import { protect } from "../../../middleware/middleware.js";
import validate from "../../../middleware/validate.middleware.js";

import {
  createOrderSchema,
  verifyPaymentSchema,
} from "../validation/payment.validation.js";

const router = express.Router();

/**
 * =====================================================
 * AUTHENTICATED USER ROUTES
 * =====================================================
 * Requires: protect middleware
 * Accessible by: All authenticated users
 * =====================================================
 */

/**
 * Create Razorpay Order (Payment-First)
 * POST /api/v1/payments/create-order
 *
 * Creates a Razorpay order for a paid event.
 * No booking is created at this stage.
 * Validates: eventId, quantity
 * Returns: orderId, amount, currency, key
 */
router.post(
  "/create-order",
  protect,
  validate(createOrderSchema),
  createOrder,
);

/**
 * Verify Razorpay Payment (Payment-First)
 * POST /api/v1/payments/verify
 *
 * Verifies HMAC SHA256 signature after checkout.
 * Updates Payment status and creates Booking.
 * Validates: razorpay_order_id, razorpay_payment_id, razorpay_signature
 */
router.post(
  "/verify",
  protect,
  validate(verifyPaymentSchema),
  verifyPayment,
);

export default router;
