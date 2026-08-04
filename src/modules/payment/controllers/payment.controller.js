import * as paymentService from "../services/payment.service.js";

/**
 * =====================================================
 * CREATE RAZORPAY ORDER (Payment-First)
 * =====================================================
 * POST /api/v1/payments/create-order
 *
 * Thin controller — all business logic lives in
 * payment.service.js
 *
 * Flow:
 * 1. Extract eventId + quantity from validated request body
 * 2. Delegate to paymentService.createOrder()
 * 3. Return orderId, amount, currency, key
 *
 * The service handles:
 * - Event existence check
 * - Event availability validation
 * - Booking deadline validation
 * - Capacity validation
 * - Quantity validation
 * - Server-side price calculation
 * - Duplicate order prevention
 * - Razorpay API call
 * - Payment record creation
 * =====================================================
 */

export const createOrder = async (req, res) => {
  try {
    const userId = req.user._id;

    const { eventId, quantity } = req.body;

    const orderData = await paymentService.createOrder({
      eventId,
      quantity,
      userId,
    });

    return res.status(201).json({
      success: true,
      message: "Razorpay order created successfully.",
      data: orderData,
    });
  } catch (error) {
    console.error("Create Order Error:", error);

    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Unable to create payment order. Please try again.",
    });
  }
};

/**
 * =====================================================
 * VERIFY RAZORPAY PAYMENT (Payment-First)
 * =====================================================
 * POST /api/v1/payments/verify
 *
 * Thin controller — all business logic lives in
 * payment.service.js
 *
 * Flow:
 * 1. Extract Razorpay fields from validated request body
 * 2. Delegate to paymentService.verifyPayment()
 * 3. Return verified payment + created booking details
 *
 * The service handles:
 * - HMAC SHA256 signature verification
 * - Payment record lookup
 * - Duplicate verification prevention
 * - Payment status update (CREATED → PAID)
 * - Booking creation (via Booking service)
 * - Payment ↔ Booking linkage
 * =====================================================
 */

export const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    const paymentData = await paymentService.verifyPayment({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });

    return res.status(200).json({
      success: true,
      message: "Payment verified and booking created successfully.",
      data: paymentData,
    });
  } catch (error) {
    console.error("Verify Payment Error:", error);

    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Unable to verify payment. Please try again.",
    });
  }
};
