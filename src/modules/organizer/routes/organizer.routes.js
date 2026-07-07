import express from "express";

import {
  becomeOrganizer,
  getOrganizerProfile,
  updateOrganizerProfile,
  deleteOrganizerProfile,
  getOrganizerById,
} from "../controllers/organizer.controller.js";

import { protect } from "../../../middleware/middleware.js";
import validate from "../../../middleware/validate.middleware.js";
import {
  becomeOrganizerSchema,
  updateOrganizerProfileSchema,
} from "../validation/organizer.validation.js";
import { authorizeRoles } from "../../../middleware/rbac.middleware.js";

const router = express.Router();

// ==========================
// Create Organizer (RESTful: POST /api/v1/organizers)
// No role middleware — this is specifically for "user" accounts becoming organizers
// ==========================
router.post("/", protect, validate(becomeOrganizerSchema), becomeOrganizer);

// ==========================
// Backward-compatible alias for existing frontend
// PATCH /api/v1/organizers/become-organizer → same handler as POST /
// Can be removed once frontend migrates to POST /api/v1/organizers
// ==========================
router.patch(
  "/become-organizer",
  protect,
  validate(becomeOrganizerSchema),
  becomeOrganizer,
);

// ==========================
// Organizer Profile (authenticated organizer)
// ==========================
router.get("/me", protect, authorizeRoles("organizer"), getOrganizerProfile);
router.patch(
  "/me",
  protect,
  authorizeRoles("organizer"),
  validate(updateOrganizerProfileSchema),
  updateOrganizerProfile,
);
router.delete(
  "/me",
  protect,
  authorizeRoles("organizer"),
  deleteOrganizerProfile,
);

// ==========================
// Public Organizer (future implementation)
// ==========================
// router.get("/:organizerId", getOrganizerById);

export default router;
