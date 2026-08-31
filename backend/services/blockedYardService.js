import BlockedYard from "../models/BlockedYard.js";
import Yards from "../models/Yards.js";
import seedRows from "../../shared/data/blockedYards.json" with { type: "json" };
import {
  buildLocationKey,
  findBlockedYardMatch,
  formatBlockedYardLabel,
  normalizeYardKey,
} from "../../shared/utils/blockedYards.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = {
  loadedAt: 0,
  rows: [],
};

function normalizeSeedRow(row) {
  if (typeof row === "string") {
    return { yardName: row.trim() };
  }
  return {
    yardName: String(row?.yardName || "").trim(),
    street: String(row?.street || "").trim(),
    city: String(row?.city || "").trim(),
    state: String(row?.state || "").trim(),
    zipcode: String(row?.zipcode || "").trim(),
    phone: String(row?.phone || "").trim(),
    notes: String(row?.notes || "").trim(),
  };
}

async function loadActiveBlockedYards() {
  const now = Date.now();
  if (cache.rows.length && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache.rows;
  }

  const rows = await BlockedYard.find({ active: true })
    .select(
      "yardName normalizedKey locationKey street city state zipcode phone notes blockReason"
    )
    .lean();

  cache = { loadedAt: now, rows };
  return rows;
}

export function invalidateBlockedYardCache() {
  cache = { loadedAt: 0, rows: [] };
}

export async function getBlockedYardsForClient() {
  const rows = await loadActiveBlockedYards();
  return rows.map((row) => ({
    yardName: row.yardName,
    normalizedKey: row.normalizedKey,
    locationKey: row.locationKey,
    street: row.street || "",
    city: row.city || "",
    state: row.state || "",
    zipcode: row.zipcode || "",
    phone: row.phone || "",
  }));
}

export async function assertYardNotBlocked(yardInput) {
  const input =
    typeof yardInput === "string"
      ? { yardName: yardInput }
      : yardInput || {};
  const rows = await loadActiveBlockedYards();
  const match = findBlockedYardMatch(input, rows);
  if (!match) return null;

  const label = formatBlockedYardLabel(match);
  const error = new Error(
    `This yard is on the blocked list and cannot be used: ${label}`
  );
  error.statusCode = 403;
  error.blockedYardName = match.yardName;
  throw error;
}

/** Upsert seed rows into MongoDB (safe to run multiple times). */
export async function seedBlockedYardsFromFile() {
  const ops = seedRows.map((raw) => {
    const row = normalizeSeedRow(raw);
    const normalizedKey = normalizeYardKey(row.yardName);
    const locationKey = buildLocationKey(row);
    return {
      updateOne: {
        filter: { normalizedKey, locationKey },
        update: {
          $set: {
            yardName: row.yardName,
            normalizedKey,
            locationKey,
            street: row.street || "",
            city: row.city || "",
            state: row.state || "",
            zipcode: row.zipcode || "",
            phone: row.phone || "",
            active: true,
            ...(row.notes ? { notes: row.notes } : {}),
          },
          $setOnInsert: {
            notes: row.notes || "Imported from blocked yard seed list",
          },
        },
        upsert: true,
      },
    };
  });

  if (!ops.length) return { upserted: 0, modified: 0 };

  const result = await BlockedYard.bulkWrite(ops, { ordered: false });
  invalidateBlockedYardCache();
  return {
    upserted: result.upsertedCount || 0,
    modified: result.modifiedCount || 0,
    matched: result.matchedCount || 0,
  };
}

export async function ensureBlockedYardsSeeded() {
  const count = await BlockedYard.countDocuments({ active: true });
  if (count > 0) return { seeded: false, count };
  const result = await seedBlockedYardsFromFile();
  return { seeded: true, ...result };
}

const ADMIN_LIST_SORT_FIELDS = new Set([
  "yardName",
  "street",
  "city",
  "state",
  "zipcode",
  "phone",
  "updatedAt",
  "createdAt",
  "blockReason",
]);

export async function listBlockedYardsForAdmin({
  page = 1,
  limit = 25,
  searchTerm = "",
  sortBy = "yardName",
  sortOrder = "asc",
}) {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const pageSize = Math.max(parseInt(limit, 10) || 25, 1);
  const skip = (pageNum - 1) * pageSize;
  const sortField = ADMIN_LIST_SORT_FIELDS.has(sortBy) ? sortBy : "yardName";
  const sortDir = sortOrder === "desc" ? -1 : 1;

  let query = { active: true };

  if (searchTerm && String(searchTerm).trim()) {
    const searchRegex = new RegExp(String(searchTerm).trim(), "i");
    query = {
      active: true,
      $or: [
        { yardName: searchRegex },
        { street: searchRegex },
        { city: searchRegex },
        { state: searchRegex },
        { zipcode: searchRegex },
        { phone: searchRegex },
        { notes: searchRegex },
        { blockReason: searchRegex },
      ],
    };
  }

  const totalCountAll = await BlockedYard.countDocuments({ active: true });
  const filteredCount = await BlockedYard.countDocuments(query);
  const yards = await BlockedYard.find(query)
    .sort({ [sortField]: sortDir, _id: 1 })
    .skip(skip)
    .limit(pageSize)
    .select(
      "yardName street city state zipcode phone notes blockReason updatedAt createdAt"
    )
    .lean();

  return {
    yards,
    currentPage: pageNum,
    totalPages: Math.max(1, Math.ceil(filteredCount / pageSize)),
    totalCount: filteredCount,
    totalCountAll,
  };
}

export async function unblockYardById(id) {
  const deleted = await BlockedYard.findByIdAndDelete(id);
  if (!deleted) return null;
  if (deleted.yardName) {
    try {
      await Yards.findOneAndUpdate(
        { yardName: deleted.yardName },
        { $set: { blockReason: "" } }
      );
    } catch (err) {
      console.error("Failed to clear blockReason on Yards:", err);
    }
  }
  invalidateBlockedYardCache();
  return deleted;
}

/** Add / reactivate a yard on the blocked list (from Yard Data Block action). */
export async function blockYardFromYardData(payload = {}) {
  const yardName = String(payload.yardName || "").trim();
  if (!yardName) {
    const error = new Error("yardName is required");
    error.statusCode = 400;
    throw error;
  }

  const row = {
    yardName,
    street: String(payload.street || "").trim(),
    city: String(payload.city || "").trim(),
    state: String(payload.state || "").trim(),
    zipcode: String(payload.zipcode || "").trim(),
    phone: String(payload.phone || "").trim(),
    notes: String(payload.notes || "").trim() || "Blocked from Yard Data page",
    blockReason: String(payload.blockReason || "").trim(),
    active: true,
  };

  const normalizedKey = normalizeYardKey(row.yardName);
  if (!normalizedKey) {
    const error = new Error("yardName is invalid");
    error.statusCode = 400;
    throw error;
  }
  const locationKey = buildLocationKey(row);

  const existing = await BlockedYard.findOne({ normalizedKey, locationKey }).lean();
  if (existing?.active) {
    const error = new Error("This yard is already blocked");
    error.statusCode = 409;
    error.blockedYard = existing;
    throw error;
  }

  const doc = await BlockedYard.findOneAndUpdate(
    { normalizedKey, locationKey },
    {
      $set: {
        ...row,
        normalizedKey,
        locationKey,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const yardId = String(payload.yardId || payload._id || "").trim();
  try {
    if (yardId) {
      await Yards.findByIdAndUpdate(yardId, { $set: { blockReason: row.blockReason } });
    } else {
      await Yards.findOneAndUpdate(
        { yardName },
        { $set: { blockReason: row.blockReason } }
      );
    }
  } catch (err) {
    console.error("Failed to save blockReason on Yards:", err);
  }

  invalidateBlockedYardCache();
  return doc;
}
