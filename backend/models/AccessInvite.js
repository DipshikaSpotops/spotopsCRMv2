import mongoose from "mongoose";

const accessInviteSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    allowedEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    expiresAt: { type: Date, default: null },
    usedAt: { type: Date, default: null },
    redeemedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("AccessInvite", accessInviteSchema);
