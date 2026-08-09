import express from "express";
import { protect } from "../../../middleware/middleware.js";
import { authorizeRoles } from "../../../middleware/rbac.middleware.js";
import {
  getDashboardStats,
  getOrganizers,
  getOrganizerDetails,
} from "../controllers/admin.controller.js";

const router = express.Router();

router.use(protect);
router.use(authorizeRoles("admin"));

router.get("/dashboard-stats", getDashboardStats);
router.get("/organizers", getOrganizers);
router.get("/organizers/:organizerId", getOrganizerDetails);

export default router;
