import Event from "../models/event.model.js";
import generateSlug from "../utils/generateSlug.js";
import { getApprovedEventsCache , setApprovedEventCache , invalidateApprovedEventsCache , getEventCache , setEventCache , invalidateEventCache } from "../cache/event.cache.js";
import { createNotification } from "../../notification/services/notification.service.js";
import { getIO } from "../../../config/socket.js";
import User from "../../../models/user.model.js";
import cloudinary from "../../../config/cloudinary.js";


/**
 * Upload image buffer to Cloudinary.
 * Returns the Cloudinary upload result (contains secure_url, public_id, etc.)
 */
const uploadToCloudinary = (fileBuffer, mimetype) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "zunozo/events",
        resource_type: "image",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
};


export const createEvent = async (req, res) => {
  try {
    // Get validated event data
    const eventData = req.body;

    // Get organizer id from authenticated user
    const organizerId = req.user._id;

    // Handle image upload to Cloudinary if file was provided
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(
          req.file.buffer,
          req.file.mimetype
        );
        eventData.coverImage = uploadResult.secure_url;
      } catch (uploadError) {
        console.error("Cloudinary Upload Error:", uploadError);
        return res.status(500).json({
          success: false,
          message: "Unable to upload event image. Please try again.",
        });
      }
    }

    // Generate unique slug
    const slug = await generateSlug(eventData.title);

    // Create event
    const event = await Event.create({
      ...eventData,
      organizer: organizerId,
      slug,
      status: "PENDING_REVIEW",
    });
    // Notify admins about new event submission
    try {
      const admins = await User.find({ role: "admin", isDeleted: false }).select("_id").lean();
      for (const admin of admins) {
        await createNotification({
          recipientId: admin._id,
          type: "EVENT_SUBMITTED",
          title: "New Event Submitted",
          message: `"${event.title}" has been submitted for review.`,
          relatedEntity: { entityType: "Event", entityId: event._id },
        });
      }
      // Also emit a real-time event to the shared admin room
      const io = getIO();
      io.to("admin").emit("event:submitted", {
        eventId: event._id.toString(),
        eventTitle: event.title,
      });
    } catch (notifError) {
      console.error("[Notification] Event submission notification failed:", notifError.message);
    }

    return res.status(201).json({
      success: true,
      message: "Event created successfully and sent for review.",
      event,
    });
  } catch (error) {
    console.error("Create Event Error:", error);

    // Handle multer errors
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "Image file is too large. Maximum size is 5MB.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};


export const getMyEvents = async (req,res) => {
    try {

        const organizerId = req.user._id;

        const events = await Event.find({
            organizer:organizerId,
            isDeleted:false
        })
        .select("title slug coverImage category startDate status createdAt venue.city")
        .sort({createdAt:-1});

        return res.status(200).json({
            success: true,
            count: events.length,
            events,
        });
        
    } catch (error) {
        console.log("Get My events error : " , error)

        return res.status(500).json({
            success:false,
            message:"Internal Server Error",
        })
    }
}


export const getEventById = async (req,res) => {
    try {

        const {eventId} = req.params;

        const organizerId = req.user._id;

        const event = await Event.findOne({
            _id:eventId,
            organizer:organizerId,
            isDeleted:false,
        });

        if(!event){
            return  res.status(404).json({
                success:false,
                message:"Event not found. ",
            })
        }

        return res.status(200).json({
            success:true,
            event,
        });
        
    } catch (error) {
        console.error("Get Event Error:", error);

        return res.status(500).json({
          success: false,
          message: "Internal Server Error",
        });
    }
}


export const updateEvent = async (req,res) => {
    try {

    const { eventId } = req.params;
    const updateData = req.body;

    const event = await Event.findOne({
      _id: eventId,
      organizer: req.user._id,
      isDeleted: false,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    // Handle image upload to Cloudinary if new file was provided
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(
          req.file.buffer,
          req.file.mimetype
        );
        updateData.coverImage = uploadResult.secure_url;
      } catch (uploadError) {
        console.error("Cloudinary Upload Error:", uploadError);
        return res.status(500).json({
          success: false,
          message: "Unable to upload event image. Please try again.",
        });
      }
    }

     const oldSlug = event.slug;

    // Generate new slug if title changes
    if (updateData.title && updateData.title !== event.title) {
      updateData.slug = await generateSlug(updateData.title);
    }

    // Send event back for review
    if (event.status === "APPROVED") {
       updateData.status = "PENDING_REVIEW";
    }

    // Update event
    const updatedEvent = await Event.findByIdAndUpdate(
      eventId,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    );

    await invalidateApprovedEventsCache();
    await invalidateEventCache(oldSlug);

    return res.status(200).json({
      success: true,
      message: "Event updated successfully and sent for review.",
      event: updatedEvent,
    });

        
    } catch (error) {
        console.error("Update Event Error:", error);

        if (error.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            success: false,
            message: "Image file is too large. Maximum size is 5MB.",
          });
        }

        return res.status(500).json({
          success: false,
          message: "Internal Server Error",
        });
    }
}


export const deleteEvent = async (req,res) => {
    try {

    const { eventId } = req.params;

    const event = await Event.findOne({
      _id: eventId,
      organizer: req.user._id,
      isDeleted: false,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

     await Event.findByIdAndUpdate(eventId, {
      isDeleted: true,
    });

    await invalidateApprovedEventsCache();
    await invalidateEventCache(event.slug);

    return res.status(200).json({
      success: true,
      message: "Event deleted successfully.",
    });

        
    } catch (error) {
        console.error("Delete Event Error: " , error);

        return res.status(500).json({
            success:false,
            message:"Internal Server Error",
        })
    }
}



export const getPendingEvents = async(req,res) => {
    try {

    const pendingEvents = await Event.find({
      status: "PENDING_REVIEW",
      isDeleted: false,
    })
      .populate("organizer", "fullname email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: pendingEvents.length,
      events: pendingEvents,
    });
        
    } catch (error) {
        console.error("Get Pending Event error: " , error)

        return res.status(500).json({
            success:false,
            message:"Internal server error ",
        });
    }
}


export const reviewEvent = async (req,res) => {
    try {

    const { eventId } = req.params;
    const { status, reviewComment } = req.body;

    const event = await Event.findOne({
      _id: eventId,
      isDeleted: false,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    event.status = status;
    event.reviewComment = reviewComment || "";
    event.reviewedBy = req.user._id;
    event.reviewedAt = new Date();

    await event.save();

    await invalidateApprovedEventsCache();
    await invalidateEventCache(event.slug);

    // Notify organizer about review result
    try {
      const notifType = status === "APPROVED" ? "EVENT_APPROVED" : "EVENT_REJECTED";
      const notifTitle = status === "APPROVED" ? "Event Approved" : "Event Rejected";
      const notifMessage = status === "APPROVED"
        ? `Your event "${event.title}" has been approved and is now live!`
        : `Your event "${event.title}" has been rejected.${reviewComment ? " Reason: " + reviewComment : ""}`;

      await createNotification({
        recipientId: event.organizer,
        type: notifType,
        title: notifTitle,
        message: notifMessage,
        relatedEntity: { entityType: "Event", entityId: event._id },
      });
    } catch (notifError) {
      console.error("[Notification] Event review notification failed:", notifError.message);
    }

    return res.status(200).json({
      success: true,
      message: "Event reviewed successfully.",
      event,
    });
        
    } catch (error) {
        console.error("Review Event Error:", error);

        return res.status(500).json({
          success: false,
          message: "Internal Server Error",
        });
    }
}


export const getApprovedEvents = async (req,res) => {
    try {

        const cachedEvents = await getApprovedEventsCache()

         if (cachedEvents) {
           // Filter out past events from cached results
           const now = new Date();
           const upcoming = cachedEvents.filter(e => new Date(e.startDate) > now);
           return res.status(200).json({
             success: true,
             source: "redis",
             count: upcoming.length,
             events: upcoming,
           });
         }   

        const events = await Event.find({
            status:"APPROVED",
            isDeleted:false,
            startDate: { $gt: new Date() },
        })
          .select(
             "title slug shortDescription coverImage category startDate endDate venue capacity isFree price"
          )
          .sort({startDate:1});

          await setApprovedEventCache(events);

         return res.status(200).json({
           success: true,
           count: events.length,
           events,
         });
        
    } catch (error) {

        console.error("Get Approved Events Error:", error);

        return res.status(500).json({
          success: false,
          message: "Internal Server Error",
        });
    }
}


export const getEventsBySlug = async (req,res) => {
    try {

      const { slug } = req.params;

      const cachedEvent = await getEventCache(slug);

      if (cachedEvent) {
        // Check if cached event has already started
        if (new Date(cachedEvent.startDate) <= new Date()) {
          return res.status(404).json({
            success: false,
            message: "Event not found.",
          });
        }
        return res.status(200).json({
          success: true,
          source: "redis",
          event: cachedEvent,
        });
      }
  
      const event = await Event.findOne({
        slug,
        status: "APPROVED",
        isDeleted: false,
        startDate: { $gt: new Date() },
      }).populate("organizer", "fullname email");
  
      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found.",
        });
      }

      await setEventCache(slug, event);
  
      return res.status(200).json({
        success: true,
        event,
      });
        
    } catch (error) {
         console.error("Get Event By Slug Error:", error);

         return res.status(500).json({
           success: false,
           message: "Internal Server Error",
         });
    }
}


export const searchEvents = async (req, res) => {
  try {
    const { q } = req.query;

    // Validate search query
    if (!q || typeof q !== "string" || !q.trim()) {
      return res.status(200).json({
        success: true,
        count: 0,
        events: [],
      });
    }

    const searchTerm = q.trim();

    // Sanitize for regex safety — escape special regex characters
    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Use aggregation pipeline to search by event title OR organizer name
    const events = await Event.aggregate([
      // Stage 1: Match only approved, non-deleted events
      {
        $match: {
          status: "APPROVED",
          isDeleted: false,
          startDate: { $gt: new Date() },
        },
      },
      // Stage 2: Lookup organizer from Users collection
      {
        $lookup: {
          from: "users",
          localField: "organizer",
          foreignField: "_id",
          as: "organizerInfo",
        },
      },
      // Stage 3: Unwind organizer (each event has exactly one organizer)
      {
        $unwind: {
          path: "$organizerInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Stage 4: Match by event title OR organizer name
      {
        $match: {
          $or: [
            { title: { $regex: escapedTerm, $options: "i" } },
            { "organizerInfo.name": { $regex: escapedTerm, $options: "i" } },
          ],
        },
      },
      // Stage 5: Sort by start date
      { $sort: { startDate: 1 } },
      // Stage 6: Limit results
      { $limit: 8 },
      // Stage 7: Project only necessary fields
      {
        $project: {
          title: 1,
          slug: 1,
          coverImage: 1,
          category: 1,
          startDate: 1,
          isFree: 1,
          price: 1,
          "venue.city": 1,
          "venue.state": 1,
          organizerName: "$organizerInfo.name",
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error("Search Events Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
