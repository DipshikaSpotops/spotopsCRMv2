import mongoose from "mongoose";

/**
 * Mid-month (15th @ 12:00 America/Chicago) Actual GP snapshot per sales agent.
 */
const salesActualGpSnapshotSchema = new mongoose.Schema(
  {
    brand: {
      type: String,
      required: true,
      enum: ["50STARS", "PROLANE"],
      index: true,
    },
    salesAgent: {
      type: String,
      required: true,
      trim: true,
    },
    year: {
      type: Number,
      required: true,
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    /** Dallas calendar date of the run, e.g. "2026-07-15" */
    snapshotDateKey: {
      type: String,
      required: true,
    },
    capturedAt: {
      type: Date,
      required: true,
    },
    actualGP: {
      type: Number,
      required: true,
      default: 0,
    },
    orderCount: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { timestamps: true }
);

salesActualGpSnapshotSchema.index(
  { brand: 1, salesAgent: 1, year: 1, month: 1 },
  { unique: true }
);

salesActualGpSnapshotSchema.index({ brand: 1, year: 1, month: 1 });

export default mongoose.model("SalesActualGpSnapshot", salesActualGpSnapshotSchema);
