import mongoose from "mongoose";

/**
 * =====================================================
 * NOTIFICATION MODEL
 * =====================================================
 * Persistent notification storage for Zunozo.
 *
 * Each notification belongs to a single recipient.
 * Socket.io delivers them in real-time, but this model
 * ensures offline users can still see notifications
 * when they return.
 * =====================================================
 */

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "BOOKING_CONFIRMED",
        "NEW_BOOKING",
        "TICKET_CHECKED_IN",
        "EVENT_APPROVED",
        "EVENT_REJECTED",
        "EVENT_SUBMITTED",
      ],
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    /**
     * Optional reference to the entity that triggered
     * the notification (booking, event, etc.)
     */
    relatedEntity: {
      entityType: {
        type: String,
        enum: ["Booking", "Event"],
      },
      entityId: {
        type: mongoose.Schema.Types.ObjectId,
      },
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries: unread first, newest first
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
