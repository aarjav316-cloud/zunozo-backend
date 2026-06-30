import Event from "../models/event.model.js";
import generateSlug from "../utils/generateSlug.js";



export const createEvent = async (req, res) => {
  try {
    // Get validated event data
    const eventData = req.body;

    // Get organizer id from authenticated user
    const organizerId = req.user._id;

    // Generate unique slug
    const slug = await generateSlug(eventData.title);

    // Create event
    const event = await Event.create({
      ...eventData,
      organizer: organizerId,
      slug,
      status: "PENDING_REVIEW",
    });

    return res.status(201).json({
      success: true,
      message: "Event created successfully and sent for review.",
      event,
    });
  } catch (error) {
    console.error("Create Event Error:", error);

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

    // Find organizer's event
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

    return res.status(200).json({
      success: true,
      message: "Event updated successfully and sent for review.",
      event: updatedEvent,
    });

        
    } catch (error) {
        console.error("Update Event Error:", error);

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

        const events = await Event.find({
            status:"APPROVED",
            isDeleted:false,
        })
          .select(
             "title slug shortDescription coverImage category startDate endDate venue capacity isFree price"
          )
          .sort({startDate:1});

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