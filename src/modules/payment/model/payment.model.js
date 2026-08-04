import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    /**
     * ---------------------------------------------------
     * Booking Reference (Optional)
     * ---------------------------------------------------
     * In the payment-first architecture, booking does NOT
     * exist when the payment is created. It is linked AFTER
     * successful payment verification and booking creation.
     */
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },

    /**
     * ---------------------------------------------------
     * Event Reference (Required)
     * ---------------------------------------------------
     * Always stored at order creation time.
     * Used to create booking after payment verification.
     */
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    /**
     * ---------------------------------------------------
     * Booking Metadata
     * ---------------------------------------------------
     * Stored at order creation so that the booking can be
     * created after payment verification without needing
     * the client to re-send these values.
     */
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      required: true,
      default: "INR",
      uppercase: true,
      trim: true,
    },

    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    razorpayPaymentId: {
      type: String,
      default: null,
      trim: true,
    },

    razorpaySignature: {
      type: String,
      default: null,
      trim: true,
    },

    status: {
      type: String,
      enum: ["CREATED", "PAID", "FAILED"],
      default: "CREATED",
    },

    paymentMethod: {
      type: String,
      default: null,
      trim: true,
    },

    receipt: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    failureReason: {
      type: String,
      default: null,
      trim: true,
    },

    refundStatus: {
      type: String,
      enum: ["NONE", "INITIATED", "PROCESSED", "FAILED"],
      default: "NONE",
    },
  },
  {
    timestamps: true,
  },
);

// Razorpay Lookups
paymentSchema.index({ razorpayOrderId: 1 }, { unique: true });
paymentSchema.index({ razorpayPaymentId: 1 });

// Receipt Lookup
paymentSchema.index({ receipt: 1 }, { unique: true });

// Booking Lookup (1:1 relationship, sparse — null until booking created)
paymentSchema.index({ booking: 1 }, { sparse: true });

// Event Lookup
paymentSchema.index({ event: 1 });

// User Payment History
paymentSchema.index({ user: 1, createdAt: -1 });

// Status Filters
paymentSchema.index({ status: 1 });
paymentSchema.index({ refundStatus: 1 });

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
