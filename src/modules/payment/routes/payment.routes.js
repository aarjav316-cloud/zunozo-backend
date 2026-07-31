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
 * Create Razorpay Order
 * POST /api/v1/payments/create-order
 *
 * Creates a Razorpay order for an unpaid booking.
 * Validates: bookingId
 * Returns: orderId, amount, currency, key
 */
router.post(
  "/create-order",
  protect,
  validate(createOrderSchema),
  createOrder,
);

/**
 * Verify Razorpay Payment
 * POST /api/v1/payments/verify
 *
 * Verifies HMAC SHA256 signature after checkout.
 * Updates Payment status and Booking paymentStatus.
 * Validates: razorpay_order_id, razorpay_payment_id, razorpay_signature
 */
router.post(
  "/verify",
  protect,
  validate(verifyPaymentSchema),
  verifyPayment,
);

export default router;
