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
import { becomeOrganizerSchema } from "../validation/organizer.validation.js";
import { authorizeRoles } from "../../../middleware/rbac.middleware.js";

const router = express.Router();

// ==========================
// Become Organizer
// No role middleware — this is specifically for "user" accounts becoming organizers
// ==========================
router.patch(
  "/become-organizer",
  protect,
  validate(becomeOrganizerSchema),
  becomeOrganizer,
);

// ==========================
// Organizer Profile (future implementation)
// ==========================
// router.get("/profile", protect, authorizeRoles("organizer"), getOrganizerProfile);
// router.patch("/profile", protect, authorizeRoles("organizer"), updateOrganizerProfile);
// router.delete("/profile", protect, authorizeRoles("organizer"), deleteOrganizerProfile);

// ==========================
// Public Organizer (future implementation)
// ==========================
// router.get("/:organizerId", getOrganizerById);

export default router;
