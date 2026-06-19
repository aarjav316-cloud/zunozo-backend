import express from "express";

const router = express.Router();

router.post("/register");
router.post("/verify-otp");

export default router;