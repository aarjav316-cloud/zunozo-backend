import express from "express";
import { protect } from "../../../middleware/middleware.js";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "../controllers/notification.controller.js";

const router = express.Router();

// All notification routes require authentication
router.use(protect);

router.get("/", getNotifications);
router.get("/unread-count", getUnreadCount);
router.patch("/read-all", markAllAsRead);
router.patch("/:id/read", markAsRead);

export default router;
