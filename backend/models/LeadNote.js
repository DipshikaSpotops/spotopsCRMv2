import mongoose from "mongoose";

const leadNoteSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, trim: true },
    year: { type: String, trim: true },
    make: { type: String, trim: true },
    model: { type: String, trim: true },
    partRequired: { type: String, trim: true },
    partDescription: { type: String, trim: true },
    phoneNo: { type: String, trim: true },
    vinNo: { type: String, trim: true },
    partNo: { type: String, trim: true },
    warranty: { type: String, trim: true },
    warrantyField: { type: String, trim: true, default: "days" },
    leadDate: { type: Date }, // Dallas datetime when lead was created
    leadDateDisplay: { type: String, trim: true }, // Formatted Dallas datetime (for reference)
    leadNo: { type: String, trim: true },
    leadOrigin: { type: String, trim: true },
    leadStatus: { type: String, trim: true },
    comments: { type: String, trim: true },

    brand: {
      type: String,
      enum: ["50STARS", "PROLANE"],
      required: true,
      index: true,
    },
    salesAgent: {
      type: String,
      required: true,
      index: true, // firstName of sales agent
    },
    createdBy: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

leadNoteSchema.index({ brand: 1, salesAgent: 1, createdAt: -1 });

const LeadNote =
  mongoose.models.LeadNote || mongoose.model("LeadNote", leadNoteSchema);

export default LeadNote;

