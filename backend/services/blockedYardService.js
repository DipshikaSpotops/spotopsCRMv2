import BlockedYard from "../models/BlockedYard.js";
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
      "yardName normalizedKey locationKey street city state zipcode phone notes"
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
