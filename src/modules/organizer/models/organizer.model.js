import mongoose from "mongoose";

const organizerSchema = new mongoose.Schema(
  {
    // ==========================
    // User Reference
    // ==========================
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
      unique: true,
    },

    // ==========================
    // Organizer Info
    // ==========================
    organizerName: {
      type: String,
      required: [true, "Organizer name is required"],
      trim: true,
      maxlength: [100, "Organizer name cannot exceed 100 characters"],
    },

    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },

    about: {
      type: String,
      required: [true, "About section is required"],
      trim: true,
      maxlength: [1000, "About cannot exceed 1000 characters"],
    },

    // ==========================
    // Social Links (Optional)
    // ==========================
    instagram: {
      type: String,
      default: null,
      trim: true,
    },

    website: {
      type: String,
      default: null,
      trim: true,
    },

    // ==========================
    // Verification
    // ==========================
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes (user unique index is already created by unique:true on the schema field)
organizerSchema.index({ isVerified: 1 });

const Organizer = mongoose.model("Organizer", organizerSchema);

export default Organizer;
