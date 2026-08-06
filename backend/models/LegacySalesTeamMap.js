import mongoose from "mongoose";

/**
 * Snapshot of Sales-user → team before sales agents were removed from teams.
 * Used only for legacy order visibility (orders without teamOrder).
 * Never deleted when ops teams are seeded.
 */
const legacySalesTeamMapSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    team: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

legacySalesTeamMapSchema.index({ firstName: 1, team: 1 }, { unique: true });

const LegacySalesTeamMap = mongoose.model(
  "LegacySalesTeamMap",
  legacySalesTeamMapSchema,
  "legacySalesTeamMaps"
);

export default LegacySalesTeamMap;
