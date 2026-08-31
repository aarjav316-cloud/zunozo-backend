import Notification from "../model/notification.model.js";

/**
 * =====================================================
 * NOTIFICATION CONTROLLER
 * =====================================================
 * REST API handlers for notification management.
 *
 * - GET  /notifications           → Fetch user's notifications
 * - GET  /notifications/unread-count → Unread count
 * - PATCH /notifications/:id/read → Mark single as read
 * - PATCH /notifications/read-all → Mark all as read
 * =====================================================
 */

/**
 * GET /notifications
 * Fetch paginated notifications for the authenticated user.
 */
export const getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      Notification.find({ recipient: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ recipient: userId }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        notifications,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalNotifications: total,
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Get Notifications Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve notifications.",
    });
  }
};

/**
 * GET /notifications/unread-count
 * Return the count of unread notifications.
 */
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;

    const count = await Notification.countDocuments({
      recipient: userId,
      isRead: false,
    });

    return res.status(200).json({
      success: true,
      data: { unreadCount: count },
    });
  } catch (error) {
    console.error("Get Unread Count Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve unread count.",
    });
  }
};

/**
 * PATCH /notifications/:id/read
 * Mark a single notification as read.
 * Validates ownership — users can only read their own notifications.
 */
export const markAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const notification = await Notification.findOneAndUpdate(
      {
        _id: id,
        recipient: userId, // Ownership check
        isRead: false,
      },
      {
        $set: { isRead: true, readAt: new Date() },
      },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found or already read.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read.",
      data: notification,
    });
  } catch (error) {
    console.error("Mark As Read Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update notification.",
    });
  }
};

/**
 * PATCH /notifications/read-all
 * Mark all unread notifications as read for the authenticated user.
 */
export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    await Notification.updateMany(
      { recipient: userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read.",
    });
  } catch (error) {
    console.error("Mark All As Read Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update notifications.",
    });
  }
};
