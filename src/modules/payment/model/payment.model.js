import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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

// Booking Lookup (1:1 relationship)
paymentSchema.index({ booking: 1 });

// User Payment History
paymentSchema.index({ user: 1, createdAt: -1 });

// Status Filters
paymentSchema.index({ status: 1 });
paymentSchema.index({ refundStatus: 1 });

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
