import jwt from 'jsonwebtoken'
import User from '../models/user.model.js'

export const protect = async (req, res, next) => {
  try {

    const token = req.cookies.accessToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access token missing",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET
    );

    const user = await User.findById(decoded.id);

    if (!user || user.isDeleted) {
      return res.status(401).json({
        success: false,
        message: "User not found or account deleted",
      });
    }

    req.user = user;

    next();

  } catch (error) {

    if (
      error.name === "TokenExpiredError" ||
      error.name === "JsonWebTokenError"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired access token",
      });
    }

    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};


