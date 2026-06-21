import express from "express";
import { getMe, login, logout, refreshAccessToken, register, verifyOTP  } from "../controllers/auth.controller.js";
import { protect } from "../middleware/middleware.js";

const router = express.Router();

router.post("/register" , register );
router.post("/verify-otp" , verifyOTP);
router.post("/login", login);
router.post("/logout", protect , logout);

router.post("/refresh-token", refreshAccessToken);


router.get(
  "/me",
  protect,
  getMe
);

export default router;

