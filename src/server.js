import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import cors from "cors";
import { createServer } from "http";
import multer from "multer";

import authRoutes from "./routes/auth.routes.js";
import eventRoutes from "./modules/event/routes/event.routes.js";
import organizerRoutes from "./modules/organizer/routes/organizer.routes.js";
import bookingRoutes from "./modules/booking/routes/booking.routes.js";
import paymentRoutes from "./modules/payment/routes/payment.routes.js";
import adminRoutes from "./modules/admin/routes/admin.routes.js";
import notificationRoutes from "./modules/notification/routes/notification.routes.js";

import connectDb from "./config/db.js";
import { connectRedis } from "./config/redis.js";
import { initSocket } from "./config/socket.js";

import passport from "./config/passport.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);

initSocket(httpServer);

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());
app.use(helmet());

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/events", eventRoutes);
app.use("/api/v1/organizers", organizerRoutes);
app.use("/api/v1/bookings", bookingRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/notifications", notificationRoutes);


// Debug middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Multer error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "Image file is too large. Maximum size is 5MB.",
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  if (err.message && err.message.includes("Invalid file type")) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  next(err);
});

app.get("/", (req, res) => {
  res.send("Backend Running 🚀");
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDb();
    await connectRedis();

    httpServer.listen(PORT, () => {
      console.log(`Server running on ${PORT}`);
    });
  } catch (error) {
    const msg = `\n[FATAL] Failed to start server:\n${error.stack || error}\n`;
    process.stderr.write(msg, () => {
      process.exit(1);
    });
    // Fallback in case flush callback never fires
    setTimeout(() => process.exit(1), 3000);
  }
};

startServer();
