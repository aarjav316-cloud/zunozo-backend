import Notification from "../model/notification.model.js";
import { getIO } from "../../../config/socket.js";

/**
 * =====================================================
 * NOTIFICATION SERVICE
 * =====================================================
 * Centralized service for creating persistent notifications
 * and emitting them via Socket.io.
 *
 * Rules:
 * 1. Database FIRST, Socket.io SECOND
 * 2. Socket.io failure must never block business logic
 * 3. Recipient validation is caller's responsibility
 *    (the caller already has authenticated user data)
 * =====================================================
 */

/**
 * Create a notification, persist it, and emit via Socket.io.
 *
 * @param {Object} params
 * @param {string} params.recipientId  - MongoDB ObjectId of the user
 * @param {string} params.type         - Notification type enum
 * @param {string} params.title        - Short title
 * @param {string} params.message      - Descriptive message
 * @param {Object} [params.relatedEntity] - { entityType, entityId }
 *
 * @returns {Object} The created notification document
 */
export const createNotification = async ({
  recipientId,
  type,
  title,
  message,
  relatedEntity,
}) => {
  // 1. Validate required fields
  if (!recipientId || !type || !title || !message) {
    console.error("[Notification] Missing required fields:", {
      recipientId,
      type,
      title,
      message,
    });
    return null;
  }

  // 2. Persist to MongoDB
  const notification = await Notification.create({
    recipient: recipientId,
    type,
    title,
    message,
    relatedEntity: relatedEntity || undefined,
  });

  // 3. Emit via Socket.io (fire-and-forget)
  try {
    const io = getIO();

    const payload = {
      _id: notification._id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      relatedEntity: notification.relatedEntity,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    };

    io.to(`user:${recipientId.toString()}`).emit("notification:new", payload);
  } catch (socketError) {
    // Socket.io failure is non-critical
    console.error(
      "[Socket.io] Notification emit failed:",
      socketError.message
    );
  }

  return notification;
};
