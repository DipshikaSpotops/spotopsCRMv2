import Team from "../models/Team.js";
import User from "../models/User.js";
import LegacySalesTeamMap from "../models/LegacySalesTeamMap.js";
import { isCommonTeam } from "../../shared/constants/teams.js";
import {
  OPS_TEAMS,
  OPS_TEAM_NAME_ALIASES,
  permissionsForOpsRole,
} from "../../shared/constants/opsTeams.js";
import { permissionsForStorage } from "../../shared/constants/userPermissions.js";
import { getOrderModelForBrand } from "../models/Order.js";

async function ensureTeamExists(teamName) {
  const name = String(teamName || "").trim();
  if (!name) return null;

  const existing = await Team.findOne({
    teamName: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  }).lean();
  if (existing) return { team: existing, created: false };

  try {
    const team = await Team.create({ teamName: name });
    return { team, created: true };
  } catch (err) {
    if (err?.code === 11000) {
      const again = await Team.findOne({
        teamName: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      }).lean();
      return { team: again, created: false };
    }
    throw err;
  }
}

/** Snapshot current Sales→team rows before clearing (idempotent; no deletes). */
async function snapshotLegacySalesTeams() {
  const salesOnTeams = await User.find({
    role: "Sales",
    team: { $exists: true, $nin: [null, ""] },
  })
    .select("firstName team")
    .lean();

  let upserted = 0;
  for (const u of salesOnTeams) {
    const firstName = String(u.firstName || "").trim();
    const team = String(u.team || "").trim();
    if (!firstName || !team || isCommonTeam(team)) continue;
    const res = await LegacySalesTeamMap.updateOne(
      { firstName, team },
      { $setOnInsert: { firstName, team } },
      { upsert: true }
    );
    if (res.upsertedCount) upserted += 1;
  }
  return { salesOnTeams: salesOnTeams.length, legacyUpserted: upserted };
}

/** Remove Sales users from teams (does not delete Team documents). */
async function removeSalesAgentsFromTeams() {
  const result = await User.updateMany(
    { role: "Sales", team: { $exists: true, $nin: [null, ""] } },
    { $unset: { team: "" } }
  );
  return {
    matched: result.matchedCount,
    modified: result.modifiedCount,
  };
}

/**
 * Place existing Support users onto ops teams by firstName and set permissions.
 * Does not create users; skips missing names. Never deletes teams or users.
 */
async function assignOpsMembers() {
  const assigned = [];
  const missing = [];

  for (const team of OPS_TEAMS) {
    for (const member of team.members) {
      const firstName = String(member.firstName || "").trim();
      const perms = permissionsForStorage(permissionsForOpsRole(member.roleKey));
      const users = await User.find({
        role: { $in: ["Support", "Sales"] },
        firstName: { $regex: new RegExp(`^${firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      });

      if (!users.length) {
        missing.push(`${firstName} (${team.teamName})`);
        continue;
      }

      for (const user of users) {
        // Ops roster is for Support; if name matches a Sales user, leave them sales-only (no team).
        if (user.role === "Sales") {
          missing.push(`${firstName} exists as Sales — skipped (ops are Support)`);
          continue;
        }
        user.team = team.teamName;
        user.permissions = perms;
        await user.save();
        assigned.push({
          email: user.email,
          firstName: user.firstName,
          team: team.teamName,
          permissions: perms,
        });
      }
    }
  }

  return { assigned, missing };
}

/**
 * Remap user.team / legacy map / order.teamOrder from "Team X" (and aliases)
 * to short names. Does not delete Team documents.
 */
async function migrateTeamNameAliases() {
  const pairs = Object.entries(OPS_TEAM_NAME_ALIASES).filter(
    ([from, to]) => String(from).toLowerCase() !== String(to).toLowerCase()
  );

  const users = { matched: 0, modified: 0 };
  const legacy = { matched: 0, modified: 0 };
  const orders = { matched: 0, modified: 0 };

  for (const [from, to] of pairs) {
    const fromRegex = new RegExp(
      `^${String(from).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      "i"
    );

    const u = await User.updateMany({ team: fromRegex }, { $set: { team: to } });
    users.matched += u.matchedCount || 0;
    users.modified += u.modifiedCount || 0;

    const l = await LegacySalesTeamMap.updateMany(
      { team: fromRegex },
      { $set: { team: to } }
    );
    legacy.matched += l.matchedCount || 0;
    legacy.modified += l.modifiedCount || 0;

    for (const brand of ["50STARS", "PROLANE", "PROTP"]) {
      const Order = getOrderModelForBrand(brand);
      const o = await Order.updateMany(
        { teamOrder: fromRegex },
        { $set: { teamOrder: to } }
      );
      orders.matched += o.matchedCount || 0;
      orders.modified += o.modifiedCount || 0;
    }
  }

  return { users, legacy, orders };
}

/**
 * Idempotent startup / script:
 * - create Mavericks / Invicibles / High Clouds if missing (never delete teams)
 * - remap "Team …" aliases on users/orders (no team deletes)
 * - snapshot Sales→team for legacy order scope, then remove Sales from teams
 * - assign matching Support users to ops teams + permissions
 */
export async function ensureOpsTeams() {
  const teamsCreated = [];
  const teamsExisting = [];

  for (const t of OPS_TEAMS) {
    const { team, created } = await ensureTeamExists(t.teamName);
    if (created) teamsCreated.push(team?.teamName || t.teamName);
    else teamsExisting.push(team?.teamName || t.teamName);
  }

  const renamed = await migrateTeamNameAliases();
  const legacy = await snapshotLegacySalesTeams();
  const salesCleared = await removeSalesAgentsFromTeams();
  const members = await assignOpsMembers();

  return {
    teamsCreated,
    teamsExisting,
    renamed,
    legacy,
    salesCleared,
    membersAssigned: members.assigned.length,
    membersMissing: members.missing,
    assigned: members.assigned,
  };
}
