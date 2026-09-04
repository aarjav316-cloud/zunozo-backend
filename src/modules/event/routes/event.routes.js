import express from "express";

import {
  createEvent,
  getApprovedEvents,
  getEventById,
  getEventsBySlug,
  getMyEvents,
  getPendingEvents,
  reviewEvent,
  updateEvent,
  deleteEvent,
  searchEvents,
} from "../controllers/event.controller.js";
import { protect } from "../../../middleware/middleware.js";
import validate from "../../../middleware/validate.middleware.js";
import { createEventSchema } from "../validation/event.validation.js";
import { authorizeRoles } from "../../../middleware/rbac.middleware.js";
import { updateEventSchema } from "../validation/updateEventSchema.js";
import { reviewEventSchema } from "../validation/reviewEvent.validation.js";
import upload from "../../../middleware/upload.middleware.js";
import { parseFormDataFields } from "../../../middleware/parseFormData.middleware.js";

const router = express.Router();

router.post(
  "/",
  protect,
  authorizeRoles("organizer"),
  upload.single("coverImageFile"),
  parseFormDataFields,
  validate(createEventSchema),
  createEvent,
);

router.get("/my-events", protect, authorizeRoles("organizer"), getMyEvents);

router.get(
  "/my-events/:eventId",
  protect,
  authorizeRoles("organizer"),
  getEventById,
);

router.patch(
  "/:eventId",
  protect,
  authorizeRoles("organizer"),
  upload.single("coverImageFile"),
  parseFormDataFields,
  validate(updateEventSchema),
  updateEvent,
);

router.delete("/:eventId", protect, authorizeRoles("organizer"), deleteEvent);

router.get(
  "/admin/pending",
  protect,
  authorizeRoles("admin"),
  getPendingEvents,
);

router.patch(
  "/admin/:eventId/review",
  protect,
  authorizeRoles("admin"),
  validate(reviewEventSchema),
  reviewEvent,
);

router.get("/", getApprovedEvents);

router.get("/search", searchEvents);

router.get("/:slug", getEventsBySlug);

export default router;
