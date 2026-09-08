import mongoose from "mongoose";
import Organizer from "../models/organizer.model.js";
import User from "../../../models/user.model.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../../../utils/generateToken.js";

// ==========================
// Helper: Set fresh auth cookies after role change
// ==========================
const isProduction = process.env.NODE_ENV === "production";

const setAuthCookies = (res, user) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  user.refreshToken = refreshToken;

  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "strict",
    ...(isProduction && { partitioned: true }),
  };

  res.cookie("accessToken", accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie("refreshToken", refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  return refreshToken;
};


export const becomeOrganizer = async (req, res) => {
  let useTransaction = false;
  let session = null;
  let user = null;

  try {
    // 1. Try to start a transaction
    session = await mongoose.startSession();
    session.startTransaction();
    useTransaction = true;

    // 2. Execute the first query. If MongoDB is standalone, THIS is where it throws.
    user = await User.findById(req.user._id).session(session);
  } catch (error) {
    if (
      error.message &&
      error.message.includes(
        "Transaction numbers are only allowed on a replica set member or mongos",
      )
    ) {
      // Standalone MongoDB detected — cleanly fallback to non-transactional mode
      if (session) {
        await session.abortTransaction();
        session.endSession();
      }
      useTransaction = false;
      session = null;
      user = await User.findById(req.user._id);
    } else {
      // Unrelated database error, bubble it up to the main catch block
      throw error;
    }
  }

  try {
    const sessionOpts = useTransaction ? { session } : {};

    // Ensure user exists
    if (!user) {
      if (useTransaction) {
        await session.abortTransaction();
        session.endSession();
      }
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Ensure user role is "user" (not already organizer or admin)
    if (user.role !== "user") {
      if (useTransaction) {
        await session.abortTransaction();
        session.endSession();
      }
      return res.status(400).json({
        success: false,
        message: "You are already an organizer or have a different role.",
      });
    }

    // Ensure organizer profile does not already exist
    const existingOrganizer = await Organizer.findOne({
      user: user._id,
    }).session(sessionOpts.session || null);

    if (existingOrganizer) {
      if (useTransaction) {
        await session.abortTransaction();
        session.endSession();
      }
      return res.status(409).json({
        success: false,
        message: "Organizer profile already exists.",
      });
    }

    // Get validated data from request body
    const { phone, about, instagram, website } = req.body;

    // Create Organizer document
    const [organizer] = await Organizer.create(
      [
        {
          user: user._id,
          organizerName: user.name,
          phone,
          about,
          instagram: instagram || null,
          website: website || null,
        },
      ],
      useTransaction ? { session } : {},
    );

    // Update user role to "organizer" and issue fresh tokens
    user.role = "organizer";
    const refreshToken = setAuthCookies(res, user);
    user.refreshToken = refreshToken;

    await user.save({
      validateBeforeSave: false,
      ...(useTransaction ? { session } : {}),
    });

    // Commit the transaction if supported
    if (useTransaction) {
      await session.commitTransaction();
      session.endSession();
    }

    return res.status(201).json({
      success: true,
      message: "You are now an organizer.",
      organizer,
    });
  } catch (error) {
    // Abort transaction if it was started
    if (useTransaction && session) {
      try {
        await session.abortTransaction();
        session.endSession();
      } catch {}
    }

    // Non-transactional rollback: if organizer was created but user save failed,
    // attempt to clean up the orphaned organizer document
    if (!useTransaction) {
      try {
        await Organizer.deleteOne({ user: req.user._id });
      } catch (cleanupError) {
        console.error("Rollback cleanup failed:", cleanupError);
      }
    }

    console.error("Become Organizer Error:", error);

    // Handle duplicate key error (race condition safeguard)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Organizer profile already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

/**
 * @desc    Get the authenticated organizer's profile
 * @route   GET /api/v1/organizers/me
 * @access  Protected (organizer)
 */
export const getOrganizerProfile = async (req, res) => {
  try {
    const organizer = await Organizer.findOne({ user: req.user._id }).populate({
      path: "user",
      select: "name email avatar role createdAt",
    });

    if (!organizer) {
      return res.status(404).json({
        success: false,
        message: "Organizer profile not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        user: organizer.user,
        organizer: {
          id: organizer._id,
          organizerName: organizer.organizerName,
          phone: organizer.phone,
          about: organizer.about,
          instagram: organizer.instagram,
          website: organizer.website,
          isVerified: organizer.isVerified,
          createdAt: organizer.createdAt,
          updatedAt: organizer.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error("Get Organizer Profile Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

/**
 * @desc    Update the authenticated organizer's profile
 * @route   PATCH /api/v1/organizers/me
 * @access  Protected (organizer)
 */
export const updateOrganizerProfile = async (req, res) => {
  try {
    const { phone, about, instagram, website } = req.body;

    const organizer = await Organizer.findOne({ user: req.user._id });

    if (!organizer) {
      return res.status(404).json({
        success: false,
        message: "Organizer profile not found.",
      });
    }

    // Update only provided fields
    if (phone !== undefined) organizer.phone = phone;
    if (about !== undefined) organizer.about = about;
    if (instagram !== undefined) organizer.instagram = instagram || null;
    if (website !== undefined) organizer.website = website || null;

    await organizer.save();

    // Populate user data for response
    await organizer.populate({
      path: "user",
      select: "name email avatar role createdAt",
    });

    return res.status(200).json({
      success: true,
      message: "Organizer profile updated successfully.",
      data: {
        user: organizer.user,
        organizer: {
          id: organizer._id,
          organizerName: organizer.organizerName,
          phone: organizer.phone,
          about: organizer.about,
          instagram: organizer.instagram,
          website: organizer.website,
          isVerified: organizer.isVerified,
          createdAt: organizer.createdAt,
          updatedAt: organizer.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error("Update Organizer Profile Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

/**
 * @desc    Delete the authenticated organizer's profile
 * @route   DELETE /api/v1/organizers/me
 * @access  Protected (organizer)
 */
export const deleteOrganizerProfile = async (req, res) => {
  // TODO: Implement delete organizer profile
  // Should also revert user role back to "user" (use transaction)
  return res.status(501).json({
    success: false,
    message: "Not implemented yet.",
  });
};

/**
 * @desc    Get a specific organizer by ID (public)
 * @route   GET /api/v1/organizers/:organizerId
 * @access  Public
 */
export const getOrganizerById = async (req, res) => {
  // TODO: Implement get organizer by ID
  return res.status(501).json({
    success: false,
    message: "Not implemented yet.",
  });
};

/**
 * @desc    Get dashboard statistics for the logged-in organizer
 * @route   GET /api/v1/organizers/dashboard-stats
 * @access  Protected (organizer)
 */
export const getDashboardStats = async (req, res) => {
  try {
    const organizerId = req.user._id;
    const Event = mongoose.model("Event");
    const Booking = mongoose.model("Booking");

    // 1. Total Events
    const totalEvents = await Event.countDocuments({
      organizer: organizerId,
      isDeleted: false,
    });

    // 2. Upcoming Events
    const upcomingEvents = await Event.countDocuments({
      organizer: organizerId,
      isDeleted: false,
      startDate: { $gte: new Date() },
    });

    // 3. Aggregate Bookings for Tickets Sold & Revenue
    const stats = await Booking.aggregate([
      {
        $lookup: {
          from: "events",
          localField: "event",
          foreignField: "_id",
          as: "eventDoc",
        },
      },
      { $unwind: "$eventDoc" },
      {
        $match: {
          "eventDoc.organizer": organizerId,
          bookingStatus: "CONFIRMED",
        },
      },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          ticketsSold: { $sum: "$quantity" },
          totalRevenue: { $sum: "$totalAmount" },
        },
      },
    ]);

    const globalStats = stats.length > 0 ? stats[0] : { totalBookings: 0, ticketsSold: 0, totalRevenue: 0 };

    return res.status(200).json({
      success: true,
      data: {
        totalEvents,
        upcomingEvents,
        totalBookings: globalStats.totalBookings,
        ticketsSold: globalStats.ticketsSold,
        revenue: globalStats.totalRevenue,
      },
    });
  } catch (error) {
    console.error("Get Organizer Dashboard Stats Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
