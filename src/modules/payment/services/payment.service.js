import crypto from "crypto";
import mongoose from "mongoose";

import razorpay from "../../../config/razorpay.js";

import Event from "../../event/models/event.model.js";
import Payment from "../model/payment.model.js";

import { createBookingFromPayment } from "../../booking/services/booking.service.js";

/**
 * =====================================================
 * CREATE RAZORPAY ORDER (Payment-First)
 * =====================================================
 * Validates the event, calculates amount server-side,
 * creates a Razorpay order, and persists a Payment
 * document with event/quantity metadata.
 *
 * NO Booking is created at this stage.
 *
 * Throws errors with statusCode for the controller
 * to return proper HTTP responses.
 * =====================================================
 */

export const createOrder = async ({ eventId, quantity, userId }) => {
  /**
   * ---------------------------------------------------
   * Fetch Event
   * ---------------------------------------------------
   */

  const event = await Event.findById(eventId);

  if (!event) {
    const error = new Error("Event not found.");
    error.statusCode = 404;
    throw error;
  }

  /**
   * ---------------------------------------------------
   * Event Status Validation
   * ---------------------------------------------------
   */

  if (event.isDeleted) {
    const error = new Error("This event is no longer available.");
    error.statusCode = 404;
    throw error;
  }

  if (event.status !== "APPROVED") {
    const error = new Error("Bookings are not available for this event.");
    error.statusCode = 400;
    throw error;
  }

  /**
   * ---------------------------------------------------
   * Free Event Guard
   * ---------------------------------------------------
   * Free events should use the direct booking flow,
   * not the payment flow.
   */

  if (event.isFree) {
    const error = new Error("This event is free. No payment required.");
    error.statusCode = 400;
    throw error;
  }

  /**
   * ---------------------------------------------------
   * Booking Deadline Validation
   * ---------------------------------------------------
   */

  const now = new Date();

  if (event.bookingDeadline && now > event.bookingDeadline) {
    const error = new Error("Booking deadline has passed.");
    error.statusCode = 400;
    throw error;
  }

  /**
   * ---------------------------------------------------
   * Event Already Started
   * ---------------------------------------------------
   */

  if (now >= event.startDate) {
    const error = new Error("Bookings are closed. Event has already started.");
    error.statusCode = 400;
    throw error;
  }

  /**
   * ---------------------------------------------------
   * Ticket Quantity Validation
   * ---------------------------------------------------
   */

  if (quantity > event.maxTicketsPerBooking) {
    const error = new Error(
      `Maximum ${event.maxTicketsPerBooking} tickets can be booked at once.`,
    );
    error.statusCode = 400;
    throw error;
  }

  /**
   * ---------------------------------------------------
   * Capacity Validation
   * ---------------------------------------------------
   */

  const availableTickets = event.capacity - event.ticketsSold;

  if (availableTickets <= 0) {
    const error = new Error("This event is sold out.");
    error.statusCode = 409;
    throw error;
  }

  if (quantity > availableTickets) {
    const error = new Error(`Only ${availableTickets} ticket(s) left.`);
    error.statusCode = 409;
    throw error;
  }

  /**
   * ---------------------------------------------------
   * Price Calculation (Server-Side)
   * ---------------------------------------------------
   * SECURITY: Never trust frontend pricing.
   * Always calculate from the Event document.
   */

  const pricePerTicket = event.price;
  const totalAmount = pricePerTicket * quantity;
  const amountInPaise = Math.round(totalAmount * 100);

  /**
   * ---------------------------------------------------
   * Minimum Amount Validation
   * ---------------------------------------------------
   * Razorpay requires minimum 100 paise (₹1).
   */

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
   * same user + event + quantity combination when an
   * active (CREATED) payment already exists.
   */

  const existingPayment = await Payment.findOne({
    event: event._id,
    user: userId,
    quantity,
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
   * Receipt uses a unique identifier for traceability.
   */

  const receipt = `rcpt_${event._id.toString().substring(18)}_${Date.now()}`;

  let razorpayOrder;

  try {
    razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt,
    });
  } catch (razorpayError) {
    console.error("Razorpay Order Creation Failed:", razorpayError);

    const error = new Error(
      "Unable to create payment order. Please try again.",
    );
    error.statusCode = 502;
    throw error;
  }

  /**
   * ---------------------------------------------------
   * Persist Payment Record
   * ---------------------------------------------------
   * Save Payment with event + quantity metadata.
   * booking is NULL — will be linked after verification.
   */

  await Payment.create({
    event: event._id,
    user: userId,
    quantity,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    razorpayOrderId: razorpayOrder.id,
    status: "CREATED",
    receipt: razorpayOrder.receipt,
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
 * VERIFY RAZORPAY PAYMENT (Payment-First)
 * =====================================================
 * Verifies the HMAC SHA256 signature, updates the
 * Payment record, then invokes booking creation
 * via the Booking service.
 *
 * The booking is created ONLY after successful payment.
 *
 * Uses a MongoDB transaction to ensure atomicity:
 * - Payment status update
 * - Booking creation (delegated to booking service)
 * - Payment → Booking linkage
 *
 * If any step fails, everything rolls back.
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
   * Start MongoDB Transaction
   * ---------------------------------------------------
   * Wraps payment update + booking creation in a single
   * transaction for atomicity.
   */

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

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

    await payment.save({ session });

    /**
     * ---------------------------------------------------
     * Create Booking via Booking Service
     * ---------------------------------------------------
     * Delegates to the Booking module's service function.
     * Passes the transaction session so booking creation
     * is part of the same atomic operation.
     *
     * The booking service handles:
     * - Capacity validation
     * - Atomic ticket reservation
     * - Counter increment
     * - Booking ID generation
     * - Ticket Code generation
     * - Event ticketsSold update
     */

    const bookingResult = await createBookingFromPayment({
      eventId: payment.event.toString(),
      userId: payment.user.toString(),
      quantity: payment.quantity,
      paymentId: payment._id.toString(),
      session,
    });

    /**
     * ---------------------------------------------------
     * Link Booking to Payment
     * ---------------------------------------------------
     * Now that booking exists, link it to the payment
     * record for audit trail and future lookups.
     */

    payment.booking = bookingResult.booking._id;
    await payment.save({ session });

    /**
     * ---------------------------------------------------
     * Commit Transaction
     * ---------------------------------------------------
     * Both payment update and booking creation succeeded.
     */

    await session.commitTransaction();

    /**
     * ---------------------------------------------------
     * Return Verified Payment + Booking Data
     * ---------------------------------------------------
     */

    return {
      paymentId: payment._id,
      razorpayPaymentId: payment.razorpayPaymentId,
      razorpayOrderId: payment.razorpayOrderId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      paidAt: payment.paidAt,
      booking: bookingResult.booking,
      event: bookingResult.event,
    };
  } catch (error) {
    /**
     * ---------------------------------------------------
     * Transaction Rollback
     * ---------------------------------------------------
     * If booking creation fails, payment status update
     * is also rolled back. No partial state.
     */

    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    throw error;
  } finally {
    await session.endSession();
  }
};
