/**
 * Every month on the 15th at 12:00 PM America/Chicago, snapshot each sales
 * agent's Actual GP (month-to-date: 1st 00:00 → 15th 12:00 Dallas) for both brands.
 */
import moment from "moment-timezone";
import { getOrderModelForBrand } from "../models/Order.js";
import SalesAgent from "../models/SalesAgent.js";
import SalesActualGpSnapshot from "../models/SalesActualGpSnapshot.js";

const TZ = "America/Chicago";
const BRANDS = ["50STARS", "PROLANE"];
const POLL_MS = Math.max(
  30_000,
  Number(process.env.MID_MONTH_ACTUAL_GP_POLL_MS || 60_000)
);

let timer = null;
let running = false;

function isEnabled() {
  const raw = String(process.env.MID_MONTH_ACTUAL_GP_ENABLED ?? "true")
    .trim()
    .toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "no" && raw !== "off";
}

/** True during Dallas local day 15, hour 12 (12:00–12:59). */
export function isMidMonthCaptureWindow(now = moment.tz(TZ)) {
  const m = moment.isMoment(now) ? now.clone().tz(TZ) : moment.tz(now, TZ);
  return m.date() === 15 && m.hour() === 12;
}

/**
 * Month-to-date window for the capture: Dallas 1st 00:00 inclusive → 15th 12:00 inclusive.
 */
export function getMidMonthWindow(now = moment.tz(TZ)) {
  const m = moment.isMoment(now) ? now.clone().tz(TZ) : moment.tz(now, TZ);
  const year = m.year();
  const month = m.month() + 1; // 1–12
  const startDate = m.clone().startOf("month").toDate();
  const endDate = m.clone().date(15).hour(12).minute(0).second(0).millisecond(0).toDate();
  const snapshotDateKey = m.clone().date(15).format("YYYY-MM-DD");
  return { year, month, startDate, endDate, snapshotDateKey, capturedAt: m.toDate() };
}

async function brandAlreadyCaptured(brand, year, month) {
  const existing = await SalesActualGpSnapshot.exists({ brand, year, month });
  return Boolean(existing);
}

/**
 * Aggregate Actual GP by salesAgent for one brand in [startDate, endDate].
 * @returns {Map<string, { actualGP: number, orderCount: number }>}
 */
async function aggregateActualGpByAgent(brand, startDate, endDate) {
  const Order = getOrderModelForBrand(brand);
  const rows = await Order.aggregate([
    {
      $match: {
        orderDate: { $gte: startDate, $lte: endDate },
        salesAgent: { $exists: true, $nin: [null, ""] },
      },
    },
    {
      $group: {
        _id: { $trim: { input: { $ifNull: ["$salesAgent", ""] } } },
        actualGP: {
          $sum: {
            $convert: {
              input: "$actualGP",
              to: "double",
              onError: 0,
              onNull: 0,
            },
          },
        },
        orderCount: { $sum: 1 },
      },
    },
  ]);

  const map = new Map();
  for (const row of rows) {
    const name = String(row._id || "").trim();
    if (!name) continue;
    map.set(name, {
      actualGP: Number(row.actualGP) || 0,
      orderCount: Number(row.orderCount) || 0,
    });
  }
  return map;
}

async function snapshotBrand(brand, window) {
  const { year, month, startDate, endDate, snapshotDateKey, capturedAt } = window;

  if (await brandAlreadyCaptured(brand, year, month)) {
    console.log(
      `[MidMonthActualGP] Skip ${brand} ${year}-${String(month).padStart(2, "0")} — already captured`
    );
    return { brand, skipped: true, upserted: 0 };
  }

  const agents = await SalesAgent.find({ brand }).select("firstName").lean();
  if (!agents.length) {
    console.warn(`[MidMonthActualGP] No SalesAgent records for ${brand}`);
    return { brand, skipped: false, upserted: 0 };
  }

  const totals = await aggregateActualGpByAgent(brand, startDate, endDate);
  const ops = agents.map((agent) => {
    const firstName = String(agent.firstName || "").trim();
    const stats = totals.get(firstName) || { actualGP: 0, orderCount: 0 };
    return {
      updateOne: {
        filter: { brand, salesAgent: firstName, year, month },
        update: {
          $set: {
            brand,
            salesAgent: firstName,
            year,
            month,
            snapshotDateKey,
            capturedAt,
            actualGP: Math.round(stats.actualGP * 100) / 100,
            orderCount: stats.orderCount,
          },
        },
        upsert: true,
      },
    };
  });

  if (ops.length) {
    await SalesActualGpSnapshot.bulkWrite(ops, { ordered: false });
  }

  console.log(
    `[MidMonthActualGP] ${brand} ${snapshotDateKey}: upserted ${ops.length} agent snapshot(s)`
  );
  return { brand, skipped: false, upserted: ops.length };
}

/**
 * Run capture for the current Dallas mid-month window (or a forced `now`).
 * Idempotent per brand/year/month.
 */
export async function captureMidMonthSalesActualGp(now = moment.tz(TZ)) {
  const window = getMidMonthWindow(now);
  const results = [];
  for (const brand of BRANDS) {
    try {
      results.push(await snapshotBrand(brand, window));
    } catch (err) {
      console.error(
        `[MidMonthActualGP] Failed for ${brand}:`,
        err?.message || err
      );
      results.push({ brand, error: err?.message || String(err) });
    }
  }
  return { window, results };
}

async function tick() {
  if (running) return;
  if (!isEnabled()) return;
  if (!isMidMonthCaptureWindow()) return;

  running = true;
  try {
    await captureMidMonthSalesActualGp();
  } catch (err) {
    console.error("[MidMonthActualGP] Tick failed:", err?.message || err);
  } finally {
    running = false;
  }
}

export function startMidMonthSalesActualGpScheduler() {
  if (!isEnabled()) {
    console.log(
      "[MidMonthActualGP] Disabled (set MID_MONTH_ACTUAL_GP_ENABLED=true to enable)"
    );
    return;
  }
  if (timer) return;

  console.log(
    `[MidMonthActualGP] Scheduler started (every ${Math.round(POLL_MS / 1000)}s; runs Dallas 15th @ 12:00)`
  );

  setTimeout(tick, 20_000);
  timer = setInterval(tick, POLL_MS);
}
