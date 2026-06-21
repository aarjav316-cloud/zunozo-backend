import express from "express";
import { login, logout, refreshAccessToken, register, verifyOTP  } from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/register" , register );
router.post("/verify-otp" , verifyOTP);
router.post("/login", login);
router.post("/logout", logout);

router.post("/refresh-token", refreshAccessToken);


export default router;

