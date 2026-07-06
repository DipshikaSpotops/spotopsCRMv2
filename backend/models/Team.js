import mongoose from "mongoose";

const teamSchema = new mongoose.Schema(
  {
    teamName: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

teamSchema.index({ teamName: 1 }, { unique: true });

export default mongoose.models.Team || mongoose.model("Team", teamSchema, "teams");
