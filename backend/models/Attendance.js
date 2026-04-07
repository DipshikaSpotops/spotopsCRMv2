import mongoose from "mongoose";

const changeLogEntrySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    editorUserId: { type: String, default: "" },
    editorEmail: { type: String, default: "" },
    editorFirstName: { type: String, default: "" },
    editorRole: { type: String, default: "" },
    action: { type: String, required: true },
    previousLoginAt: { type: Date, default: null },
    previousLogoutAt: { type: Date, default: null },
    newLoginAt: { type: Date, default: null },
    newLogoutAt: { type: Date, default: null },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    dateKey: { type: String, required: true, index: true },
    firstName: { type: String, required: true },
    loginAt: { type: Date, default: null },
    logoutAt: { type: Date, default: null },
    changeLog: { type: [changeLogEntrySchema], default: [] },
  },
  { timestamps: true }
);

attendanceSchema.index({ dateKey: 1, firstName: 1 }, { unique: true });

export default mongoose.model("Attendance", attendanceSchema, "attendance");
