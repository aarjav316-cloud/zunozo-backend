import mongoose from 'mongoose'



const eventSchema = new mongoose.Schema({
    
    title:{
        type:String,
        required:[true , "Event title is required"],
        trim:true,
        maxLength:[100 , "Title cannot exceed 100 characters"],
    },

     slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    shortDescription: {
      type: String,
      required: [true, "Short description is required"],
      trim: true,
      maxlength: [200, "Short description cannot exceed 200 characters"],
    },

    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },

    category: {
      type: String,
      enum: [
        "MUSIC",
        "COMEDY",
        "SPORTS",
        "RUN_CLUB",
        "HOUSE_PARTY",
        "WORKSHOP",
        "FOOD",
        "FESTIVAL",
      ],
      required: true,
    },

    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],

    // ==========================
    // Organizer
    // ==========================
    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ==========================
    // Event Schedule
    // ==========================
    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
    },

    // ==========================
    // Venue
    // ==========================
    venue: {
      venueName: {
        type: String,
        required: true,
        trim: true,
      },

      address: {
        type: String,
        required: true,
        trim: true,
      },

      city: {
        type: String,
        required: true,
        trim: true,
      },

      state: {
        type: String,
        required: true,
        trim: true,
      },

      country: {
        type: String,
        default: "India",
      },

      pincode: {
        type: String,
        required: true,
      },
    },

    // ==========================
    // Images
    // ==========================
    coverImage: {
      type: String,
      required: true,
    },

    galleryImages: [
      {
        type: String,
      },
    ],

    // ==========================
    // Capacity & Pricing
    // ==========================
    capacity: {
      type: Number,
      required: true,
      min: 1,
    },

    isFree: {
      type: Boolean,
      default: true,
    },

    price: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ==========================
    // Moderation
    // ==========================
    status: {
      type: String,
      enum: [
        
        "PENDING_REVIEW",
        "APPROVED",
        "REJECTED",
        "CHANGES_REQUESTED",
        "CANCELLED",
        "COMPLETED",
      ],
      default: "PENDING_REVIEW",
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    reviewComment: {
      type: String,
      default: "",
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    capacity:{
      type:Number,
      required:true,
      min:1,
    },

    ticketsSold:{
      type:Number,
      default:0,
      min:0,
    },
    
    bookingDeadline:{
      type:Date,
      default:null,
    },

    maxTicketsPerBooking:{
      type:Number,
      default:10,
      min:1,
    },

    isFree:{
      type:Boolean,
      default:true,
    },

    price:{
      type:Number,
      default:0,
      min:0,
    },
},
   {
        timestamps:true,
    }
)

const Event = mongoose.model("Event" , eventSchema)

export default Event;


