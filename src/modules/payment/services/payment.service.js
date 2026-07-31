import crypto from "crypto";

import razorpay from "../../../config/razorpay.js";

import Booking from "../../booking/model/booking.model.js";
import Payment from "../model/payment.model.js";

/**
 * =====================================================
 * CREATE PAYMENT RECORD
 * =====================================================
 * Internal helper to persist a new Payment document
 * after a Razorpay order is successfully created.
 * =====================================================
 */

const createPaymentRecord = async ({
  booking,
  userId,
  razorpayOrder,
}) => {
  const payment = await Payment.create({
    booking: booking._id,
    user: userId,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    razorpayOrderId: razorpayOrder.id,
    status: "CREATED",
    receipt: razorpayOrder.receipt,
  });

  return payment;
};

/**
 * =====================================================
 * UPDATE BOOKING AFTER SUCCESSFUL PAYMENT
 * =====================================================
 * Sets the booking paymentStatus to PAID.
 * Called only after signature verification succeeds.
 * =====================================================
 */

const updateBookingAfterSuccess = async (bookingId) => {
  const booking = await Booking.findByIdAndUpdate(
    bookingId,
    {
      paymentStatus: "PAID",
    },
    {
      new: true,
    },
  );

  return booking;
};

/**
 * =====================================================
 * CREATE RAZORPAY ORDER
 * =====================================================
 * Validates the booking, creates a Razorpay order via
 * their Orders API, and persists a Payment document.
 *
 * Throws errors with statusCode for the controller
 * to return proper HTTP responses.
 * =====================================================
 */

export const createOrder = async (bookingId, userId) => {
  /**
   * ---------------------------------------------------
   * Fetch Booking
   * ---------------------------------------------------
   */

  const booking = await Booking.findById(bookingId);

  if (!booking) {
    const error = new Error("Booking not found.");
    error.statusCode = 404;
    throw error;
  }

  /**
   * ---------------------------------------------------
   * Authorization Check
   * ---------------------------------------------------
   * Ensure the booking belongs to the logged-in user.
   */

  if (booking.user.toString() !== userId.toString()) {
    const error = new Error("You are not authorized to pay for this booking.");
    error.statusCode = 403;
    throw error;
  }

  /**
   * ---------------------------------------------------
   * Payment Status Check
   * ---------------------------------------------------
   * Only allow payment for bookings with UNPAID status.
   * Prevents paying for already paid or refunded bookings.
   */

  if (booking.paymentStatus !== "UNPAID") {
    const error = new Error("Payment has already been completed for this booking.");
    error.statusCode = 400;
    throw error;
  }

  /**
   * ---------------------------------------------------
   * Booking Status Check
   * ---------------------------------------------------
   * Only allow payment for CONFIRMED bookings.
   * Cancelled or expired bookings cannot be paid.
   */

  if (booking.bookingStatus !== "CONFIRMED") {
    const error = new Error("This booking is not eligible for payment.");
    error.statusCode = 400;
    throw error;
  }

  /**
   * ---------------------------------------------------
   * Minimum Amount Validation
   * ---------------------------------------------------
   * Razorpay requires minimum 100 paise (₹1).
   * totalAmount is stored in rupees, convert to paise.
   */

  const amountInPaise = Math.round(booking.totalAmount * 100);

  if (amountInPaise < 100) {
    const error = new Error("Amount must be at least ₹1.");
    error.statusCode = 400;
    throw error;
  }

  /**
   * ---------------------------------------------------
   * Duplicate Order Check
   * ---------------------------------------------------
   * Prevent creating multiple Razorpay orders for the
   * same booking. If an active (CREATED) payment exists,
   * return the existing order details instead.
   */

  const existingPayment = await Payment.findOne({
    booking: booking._id,
    status: "CREATED",
  });

  if (existingPayment) {
    return {
      orderId: existingPayment.razorpayOrderId,
      amount: existingPayment.amount,
      currency: existingPayment.currency,
      key: process.env.RAZORPAY_KEY_ID,
    };
  }

  /**
   * ---------------------------------------------------
   * Create Razorpay Order
   * ---------------------------------------------------
   * Calls Razorpay Orders API.
   * Receipt uses booking ObjectId for traceability.
   */

  const receipt = `rcpt_${booking._id.toString()}`;

  let razorpayOrder;

  try {
    razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt,
    });
  } catch (razorpayError) {
    console.error("Razorpay Order Creation Failed:", razorpayError);

    const error = new Error("Unable to create payment order. Please try again.");
    error.statusCode = 502;
    throw error;
  }

  /**
   * ---------------------------------------------------
   * Persist Payment Record
   * ---------------------------------------------------
   * Save the Payment document with CREATED status.
   * Links to both booking and user for audit trail.
   */

  await createPaymentRecord({
    booking,
    userId,
    razorpayOrder,
  });

  /**
   * ---------------------------------------------------
   * Return Order Details
   * ---------------------------------------------------
   * Only expose RAZORPAY_KEY_ID (public key).
   * RAZORPAY_KEY_SECRET is never sent to the client.
   */

  return {
    orderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    key: process.env.RAZORPAY_KEY_ID,
  };
};

/**
 * =====================================================
 * VERIFY RAZORPAY PAYMENT
 * =====================================================
 * Verifies the HMAC SHA256 signature sent by Razorpay
 * after a successful payment. Updates both the Payment
 * document and the associated Booking.
 *
 * Throws errors with statusCode for the controller
 * to return proper HTTP responses.
 * =====================================================
 */

export const verifyPayment = async ({
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
}) => {
  /**
   * ---------------------------------------------------
   * HMAC SHA256 Signature Verification
   * ---------------------------------------------------
   * Razorpay signs: "order_id|payment_id"
   * using your RAZORPAY_KEY_SECRET as the HMAC key.
   * Compare the generated digest with the received one.
   */

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    const error = new Error("Payment verification failed. Invalid signature.");
    error.statusCode = 400;
    throw error;
  }

  /**
   * ---------------------------------------------------
   * Fetch Payment Record
   * ---------------------------------------------------
   * Find the Payment document by razorpayOrderId.
   */

  const payment = await Payment.findOne({
    razorpayOrderId: razorpay_order_id,
  });

  if (!payment) {
    const error = new Error("Payment record not found.");
    error.statusCode = 404;
    throw error;
  }

  /**
   * ---------------------------------------------------
   * Duplicate Verification Check
   * ---------------------------------------------------
   * Prevent re-verification of already paid payments.
   */

  if (payment.status === "PAID") {
    const error = new Error("This payment has already been verified.");
    error.statusCode = 400;
    throw error;
  }

  /**
   * ---------------------------------------------------
   * Update Payment Document
   * ---------------------------------------------------
   * Set status to PAID, store Razorpay identifiers,
   * and record the payment timestamp.
   */

  payment.razorpayPaymentId = razorpay_payment_id;
  payment.razorpaySignature = razorpay_signature;
  payment.status = "PAID";
  payment.paidAt = new Date();

  await payment.save();

  /**
   * ---------------------------------------------------
   * Update Booking Payment Status
   * ---------------------------------------------------
   * Mark the associated booking as PAID.
   */

  const updatedBooking = await updateBookingAfterSuccess(payment.booking);

  return {
    paymentId: payment._id,
    razorpayPaymentId: payment.razorpayPaymentId,
    razorpayOrderId: payment.razorpayOrderId,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    paidAt: payment.paidAt,
    booking: {
      _id: updatedBooking._id,
      bookingId: updatedBooking.bookingId,
      bookingStatus: updatedBooking.bookingStatus,
      paymentStatus: updatedBooking.paymentStatus,
    },
  };
};
