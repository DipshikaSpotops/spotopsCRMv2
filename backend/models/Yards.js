import mongoose from "mongoose";

const yardsSchema = new mongoose.Schema(
  {
    yardName: { type: String, required: true, trim: true, unique: true },
    yardRating: { type: String, trim: true },
    phone: { type: String, trim: true },
    altNo: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zipcode: { type: String, trim: true },
    country: { type: String, trim: true, default: "US" },
    warranty: { type: Number },
  },
  { timestamps: true }
);

export default mongoose.models.Yards || mongoose.model("Yards", yardsSchema);
