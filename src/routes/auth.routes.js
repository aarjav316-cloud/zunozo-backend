import express from "express";
import {
  forgotpassword,
  getMe,
  googleCallback,
  login,
  logout,
  refreshAccessToken,
  register,
  verifyOTP,
} from "../controllers/auth.controller.js";

import { loginLimiter , registerLimiter , otpLimiter } from "../middleware/rateLimiter.js";

import { protect } from "../middleware/middleware.js";
import passport from "passport";

const router = express.Router();

router.post("/register", registerLimiter ,  register);

router.post("/verify-otp", otpLimiter, verifyOTP);

router.post("/login", loginLimiter, login);

router.post("/logout", protect, logout);

router.post("/refresh-token", refreshAccessToken);

router.post("/forgot-password" , forgotpassword)

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
