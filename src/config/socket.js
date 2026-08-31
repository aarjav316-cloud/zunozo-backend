import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

let io;

/**
 * Helper to parse cookies from the raw cookie header string
 */
const parseCookies = (cookieHeader) => {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce((acc, cookie) => {
    const [key, val] = cookie.split("=").map((c) => c.trim());
    if (key && val) {
      acc[key] = decodeURIComponent(val);
    }
    return acc;
  }, {});
};

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      credentials: true,
    },
  });

  /**
   * =========================================
   * Socket.io Authentication Middleware
   * =========================================
   * Verifies the same accessToken cookie used
   * by the HTTP REST API.
   */
  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.request.headers.cookie;
      const cookies = parseCookies(cookieHeader);
      const token = cookies.accessToken;

      if (!token) {
        return next(new Error("Authentication error: Missing access token"));
      }

      // Verify JWT
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      
      // Find the user to ensure they still exist and aren't deleted
      const user = await User.findById(decoded.id).select("_id role isDeleted");

      if (!user || user.isDeleted) {
        return next(new Error("Authentication error: User not found or deleted"));
      }

      // Attach minimal required user info to the socket
      socket.user = {
        userId: user._id.toString(),
        role: user.role,
      };

      next(); // Allow connection
    } catch (error) {
      return next(new Error("Authentication error: Invalid or expired token"));
    }
  });

  /**
   * =========================================
   * Connection Handling
   * =========================================
   */
  io.on("connection", (socket) => {
    const { userId, role } = socket.user;

    console.log(`[Socket.io] Connected | User: ${userId} | Socket: ${socket.id} | Role: ${role}`);

    // Join the user-specific room
    const userRoom = `user:${userId}`;
    socket.join(userRoom);

    // Organizers also join an organizer-specific room for booking notifications
    if (role === "organizer") {
      const organizerRoom = `organizer:${userId}`;
      socket.join(organizerRoom);
      console.log(`[Socket.io] Joined organizer room: ${organizerRoom}`);
    }

    // Admins join a shared admin room for event review notifications
    if (role === "admin") {
      socket.join("admin");
      console.log(`[Socket.io] Joined admin room`);
    }

    socket.on("disconnect", (reason) => {
      console.log(`[Socket.io] Disconnected | User: ${userId} | Socket: ${socket.id} | Reason: ${reason}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};
