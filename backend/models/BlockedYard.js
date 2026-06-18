import mongoose from "mongoose";
import {
  buildLocationKey,
  normalizeYardKey,
} from "../../shared/utils/blockedYards.js";

const blockedYardSchema = new mongoose.Schema(
  {
    yardName: { type: String, required: true, trim: true },
    normalizedKey: { type: String, required: true, trim: true, index: true },
    locationKey: { type: String, required: true, trim: true, default: "" },
    street: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    zipcode: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    active: { type: Boolean, default: true },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

blockedYardSchema.index({ normalizedKey: 1, locationKey: 1 }, { unique: true });

blockedYardSchema.pre("validate", function setKeys(next) {
  if (this.yardName) {
    this.normalizedKey = normalizeYardKey(this.yardName);
  }
  this.locationKey = buildLocationKey(this);
  next();
});

export default mongoose.models.BlockedYard ||
  mongoose.model("BlockedYard", blockedYardSchema);
