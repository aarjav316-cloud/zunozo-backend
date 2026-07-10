import mongoose from 'mongoose'

const bookingSchema = new mongoose.Schema({
    bookingId:{
        type:String,
        required:true,
        unique:true,
        trim:true,
    },

     ticketCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },

    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

   
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    pricePerTicket: {
      type: Number,
      required: true,
      min: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

   
    bookingStatus: {
      type: String,
      enum: [
        "PENDING",
        "CONFIRMED",
        "CANCELLED",
        "EXPIRED",
      ],
      default: "CONFIRMED",
    },

    paymentStatus: {
      type: String,
      enum: [
        "UNPAID",
        "PAID",
        "REFUNDED",
      ],
      default: "UNPAID",
    },

   
    checkedIn: {
      type: Boolean,
      default: false,
    },

    checkedInAt: {
      type: Date,
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },
},{
    timestamps:true,
});



// Unique Identifiers
bookingSchema.index({ bookingId: 1 }, { unique: true });
bookingSchema.index({ ticketCode: 1 }, { unique: true });

// User Queries
bookingSchema.index({ user: 1, createdAt: -1 });

// Organizer Dashboard
bookingSchema.index({ organizer: 1, createdAt: -1 });

// Event Bookings
bookingSchema.index({ event: 1, bookingStatus: 1 });

// Admin Filters
bookingSchema.index({ bookingStatus: 1 });
bookingSchema.index({ paymentStatus: 1 });


bookingSchema.index({createdAt:-1});

const Booking = mongoose.model("Booking" , bookingSchema);

export default Booking;