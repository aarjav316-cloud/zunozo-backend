import mongoose from "mongoose";

export const getDashboardStats = async (req, res) => {
  try {
    const User = mongoose.model("User");
    const Event = mongoose.model("Event");
    const Booking = mongoose.model("Booking");

    // 1. Total Users (role: "user")
    const totalUsers = await User.countDocuments({ role: "user" });

    // 2. Total Organizers (role: "organizer")
    const totalOrganizers = await User.countDocuments({ role: "organizer" });

    // 3. Event stats
    const totalEvents = await Event.countDocuments({ isDeleted: false });
    const pendingEvents = await Event.countDocuments({ status: "PENDING_REVIEW", isDeleted: false });
    const approvedEvents = await Event.countDocuments({ status: "APPROVED", isDeleted: false });
    const rejectedEvents = await Event.countDocuments({ status: "REJECTED", isDeleted: false });

    // 4. Booking stats
    const bookingsStats = await Booking.aggregate([
      {
        $match: { bookingStatus: "CONFIRMED" }
      },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          totalRevenue: { $sum: "$totalAmount" }
        }
      }
    ]);

    const globalStats = bookingsStats.length > 0 ? bookingsStats[0] : { totalBookings: 0, totalRevenue: 0 };
    
    // 5. Recent pending events
    const recentPendingEvents = await Event.find({ status: "PENDING_REVIEW", isDeleted: false })
      .populate("organizer", "fullname email")
      .sort({ createdAt: -1 })
      .limit(3)
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalOrganizers,
        totalEvents,
        pendingEvents,
        approvedEvents,
        rejectedEvents,
        totalBookings: globalStats.totalBookings,
        totalRevenue: globalStats.totalRevenue,
        recentPendingEvents,
      }
    });

  } catch (error) {
    console.error("Admin Dashboard Stats Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getOrganizers = async (req, res) => {
  try {
    const User = mongoose.model("User");
    const Event = mongoose.model("Event");

    const organizers = await User.find({ role: "organizer" })
      .select("fullname email avatar createdAt isActive")
      .lean();

    // Attach total events for each organizer (inefficient for large DBs without aggregation, but OK for this scale)
    const organizersWithStats = await Promise.all(organizers.map(async (org) => {
      const totalEvents = await Event.countDocuments({ organizer: org._id, isDeleted: false });
      return {
        _id: org._id,
        name: org.fullname,
        email: org.email,
        avatar: org.avatar,
        joinedDate: org.createdAt,
        totalEvents,
        status: org.isActive ? "ACTIVE" : "INACTIVE"
      };
    }));

    return res.status(200).json({
      success: true,
      data: organizersWithStats
    });

  } catch (error) {
    console.error("Get Organizers Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getOrganizerDetails = async (req, res) => {
  try {
    const { organizerId } = req.params;
    const User = mongoose.model("User");
    const Event = mongoose.model("Event");

    const organizer = await User.findById(organizerId).select("fullname email avatar bio phone company createdAt").lean();
    if (!organizer) {
      return res.status(404).json({ success: false, message: "Organizer not found" });
    }

    const events = await Event.find({ organizer: organizerId, isDeleted: false })
      .select("title slug coverImage category startDate status createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        organizer: {
          _id: organizer._id,
          name: organizer.fullname,
          email: organizer.email,
          avatar: organizer.avatar,
          bio: organizer.bio,
          phone: organizer.phone,
          company: organizer.company,
          joinedDate: organizer.createdAt
        },
        events
      }
    });

  } catch (error) {
    console.error("Get Organizer Details Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
