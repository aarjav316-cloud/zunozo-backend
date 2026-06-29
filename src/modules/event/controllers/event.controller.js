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
        }).sort({createdAt:-1});

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

