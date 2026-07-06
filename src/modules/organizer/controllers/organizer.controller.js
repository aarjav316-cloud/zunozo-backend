import Organizer from "../models/organizer.model.js";
import User from "../../../models/user.model.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../../../utils/generateToken.js";


/**
 * @desc    Become an organizer (create organizer profile + update user role)
 * @route   PATCH /api/v1/organizer/become-organizer
 * @access  Protected (authenticated users with role "user")
 */
export const becomeOrganizer = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    // Ensure user exists
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Ensure user role is "user" (not already organizer or admin)
    if (user.role !== "user") {
      return res.status(400).json({
        success: false,
        message: "You are already an organizer or have a different role.",
      });
    }

    // Ensure organizer profile does not already exist
    const existingOrganizer = await Organizer.findOne({ user: user._id });

    if (existingOrganizer) {
      return res.status(409).json({
        success: false,
        message: "Organizer profile already exists.",
      });
    }

    // Get validated data from request body
    const { organizerName, phone, about, instagram, website } = req.body;

    // Create Organizer document
    const organizer = await Organizer.create({
      user: user._id,
      organizerName,
      phone,
      about,
      instagram: instagram || null,
      website: website || null,
    });

    // Update user role to "organizer"
    user.role = "organizer";

    // Generate fresh tokens with updated role context
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;

    await user.save({ validateBeforeSave: false });

    // Set fresh cookies so frontend immediately reflects the new role
    // without requiring re-login
    const cookieOptions = {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
    };

    res.cookie("accessToken", accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie("refreshToken", refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(201).json({
      success: true,
      message: "You are now an organizer.",
      organizer,
    });
  } catch (error) {
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
 * @route   GET /api/v1/organizer/profile
 * @access  Protected (organizer)
 */
export const getOrganizerProfile = async (req, res) => {
  // TODO: Implement get organizer profile
  return res.status(501).json({
    success: false,
    message: "Not implemented yet.",
  });
};


/**
 * @desc    Update the authenticated organizer's profile
 * @route   PATCH /api/v1/organizer/profile
 * @access  Protected (organizer)
 */
export const updateOrganizerProfile = async (req, res) => {
  // TODO: Implement update organizer profile
  return res.status(501).json({
    success: false,
    message: "Not implemented yet.",
  });
};


/**
 * @desc    Delete the authenticated organizer's profile
 * @route   DELETE /api/v1/organizer/profile
 * @access  Protected (organizer)
 */
export const deleteOrganizerProfile = async (req, res) => {
  // TODO: Implement delete organizer profile
  // Should also revert user role back to "user"
  return res.status(501).json({
    success: false,
    message: "Not implemented yet.",
  });
};


/**
 * @desc    Get a specific organizer by ID (public)
 * @route   GET /api/v1/organizer/:organizerId
 * @access  Public
 */
export const getOrganizerById = async (req, res) => {
  // TODO: Implement get organizer by ID
  return res.status(501).json({
    success: false,
    message: "Not implemented yet.",
  });
};
