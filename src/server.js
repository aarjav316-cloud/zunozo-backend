import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import eventRoutes from "./modules/event/routes/event.routes.js";
import organizerRoutes from "./modules/organizer/routes/organizer.routes.js";

import connectDb from "./config/db.js";
import { connectRedis } from "./config/redis.js";

import passport from "./config/passport.js";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
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

app.get("/", (req, res) => {
  res.send("Backend Running 🚀");
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDb();
    await connectRedis();

    app.listen(PORT, () => {
      console.log(`Server running on ${PORT}`);
    });
  } catch (error) {
    console.log(error);
  }
};

startServer();
