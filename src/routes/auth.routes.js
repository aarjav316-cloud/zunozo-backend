import express from "express";
import {
  getMe,
  googleCallback,
  login,
  logout,
  refreshAccessToken,
  register,
  verifyOTP,
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/middleware.js";
import passport from "passport";

const router = express.Router();

router.post("/register", register);
router.post("/verify-otp", verifyOTP);
router.post("/login", login);
router.post("/logout", protect, logout);

router.post("/refresh-token", refreshAccessToken);

router.get(
  "/google",

  passport.authenticate("google", {
    scope: ["profile", "email"],
  }),
);

router.get(
  "/google/callback",

  passport.authenticate("google", {
    session: false,
  }),

  googleCallback,
);

router.get("/me", protect, getMe);

export default router;
