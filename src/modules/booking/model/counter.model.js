import mongoose from "mongoose";

const counterSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
      trim: true,
    },

    sequenceValue: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    versionKey: false,
    timestamps: false,
  }
);

const Counter = mongoose.model("Counter", counterSchema);

export default Counter;