import express from "express";
import moment from "moment-timezone";
import { getOrderModelForBrand } from "../models/Order.js";
import { requireAuth } from "../middleware/auth.js";
import {
  USER_PERMISSIONS,
  userHasPermission,
} from "../../shared/constants/userPermissions.js";
import { OPS_TEAMS } from "../../shared/constants/opsTeams.js";

const router = express.Router();
const TZ = "America/Chicago";

/**
 * Yard Locaters Stats — aggregations for the Reports page.
 *
 * Access: Admin OR any user holding the `yardLocates` permission.
 *
 * Metrics per locater over a date range:
 *   • ordersLocated              — # of yards added (each yardEntry counts as one locate)
 *   • firstLocates / relocates   — split by relocateSequence
 *   • avgHoursFromInvoiceToLocate — Invoice Signed (customerApprovedDate) → yardLocatedAt
 *   • avgDaysFromLocateToShip    — yardLocatedAt → partShippedAt
 *   • poCancels + breakdown by category
 *   • delayedLocates             — locates > 24h after invoice signed
 *
 * Also returned:
 *   • byMonth      — same metrics grouped by YYYY-MM of yardLocatedAt
 *   • byYard       — per-yard-name rollups + a derived star rating
 *   • filters      — locaters list (Tyler / Amy / Nik) so UI can build the dropdown
 */

const KNOWN_LOCATERS = OPS_TEAMS.flatMap((team) =>
  team.members
    .filter((m) => m.roleKey === "yardLocate")
    .map((m) => String(m.firstName || "").trim())
).filter(Boolean);

const LOCATER_SET = new Set(KNOWN_LOCATERS.map((n) => n.toLowerCase()));

const SLA_HOURS_LOCATE = 24;

/** Emails granted access without the yardLocates permission. */
const EXTRA_VIEWER_EMAILS = new Set(["50starsauto110@gmail.com"]);

const PO_CANCEL_CATEGORIES = [
  "muddy",
  "rusty",
  "damaged",
  "wrong_part",
  "other",
];

function buildDateRange({ start, end, month, year }) {
  if (start && end) {
    const startDate = moment.tz(start, TZ).startOf("day").toDate();
    const endExclusive = moment
      .tz(end, TZ)
      .endOf("day")
      .add(1, "millisecond")
      .toDate();
    return { startDate, endExclusive };
  }
  if (month && year) {
    const monthMap = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };
    const mIndex = isNaN(month)
      ? monthMap[String(month).slice(0, 3)]
      : Math.max(0, Math.min(11, parseInt(month, 10) - 1));
    const y = parseInt(year, 10);
    if (mIndex == null || Number.isNaN(y)) throw new Error("Invalid month/year");
    const startMoment = moment.tz({ year: y, month: mIndex }, TZ).startOf("month");
    const endExclusive = startMoment.clone().add(1, "month").toDate();
    return { startDate: startMoment.toDate(), endExclusive };
  }
  // Default: last 90 days
  const now = moment.tz(TZ);
  return {
    startDate: now.clone().subtract(90, "days").startOf("day").toDate(),
    endExclusive: now.clone().add(1, "day").startOf("day").toDate(),
  };
}

function isPoCancelledStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  return s === "po cancelled" || s === "po canceled" || s === "po cancel";
}

function isPartShippedStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  return s === "part shipped" || s === "part delivered";
}

function isFulfilledStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  return s === "part delivered";
}

/** Strip trailing " on" tokens that historical parses may have picked up. */
function cleanLocaterName(raw) {
  let name = String(raw || "").trim();
  // Defensive: strip trailing " on" if a legacy parse captured the separator.
  name = name.replace(/\s+on$/i, "").trim();
  return name;
}

/**
 * Derive a locater name for a yard.
 * Priority 1: yard.locatedByName (new field, populated on POST)
 * Priority 2: parse orderHistory for `Yard N Located by {name} on {date}`
 *
 * Regex explanation: capture everything after "Located by " up to (but not
 * including) the " on " separator that precedes the timestamp. Using a
 * non-greedy match ensures multi-word names ("John Cochran") work while still
 * excluding the " on " suffix that broke the previous version.
 */
function locaterNameForYard(yard, yardNum, orderHistory) {
  const explicit = cleanLocaterName(yard?.locatedByName);
  if (explicit) return explicit;
  const historyLines = Array.isArray(orderHistory) ? orderHistory : [];
  const re = new RegExp(
    `\\bYard\\s+${yardNum}\\b\\s+Located by\\s+(.+?)\\s+on\\s`,
    "i"
  );
  for (const line of historyLines) {
    const m = re.exec(String(line || ""));
    if (m && m[1]) return cleanLocaterName(m[1]);
  }
  return "";
}

function hoursBetween(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const s = startDate instanceof Date ? startDate : new Date(startDate);
  const e = endDate instanceof Date ? endDate : new Date(endDate);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  const diff = (e.getTime() - s.getTime()) / (1000 * 60 * 60);
  if (!Number.isFinite(diff) || diff < 0) return null;
  return diff;
}

function emptyLocaterAgg() {
  return {
    ordersLocated: 0,
    firstLocates: 0,
    relocates: 0,
    delayedLocates: 0,
    poCancels: 0,
    poCancelByCategory: PO_CANCEL_CATEGORIES.reduce(
      (acc, k) => ({ ...acc, [k]: 0 }),
      {}
    ),
    fulfilled: 0,
    partShipped: 0,
    _sumHoursInvoiceToLocate: 0,
    _countHoursInvoiceToLocate: 0,
    _sumDaysLocateToShip: 0,
    _countDaysLocateToShip: 0,
  };
}

function finalizeAgg(agg) {
  const avgHoursFromInvoiceToLocate =
    agg._countHoursInvoiceToLocate > 0
      ? agg._sumHoursInvoiceToLocate / agg._countHoursInvoiceToLocate
      : null;
  const avgDaysFromLocateToShip =
    agg._countDaysLocateToShip > 0
      ? agg._sumDaysLocateToShip / agg._countDaysLocateToShip
      : null;
  const shipRate =
    agg.ordersLocated > 0 ? (agg.partShipped / agg.ordersLocated) * 100 : 0;
  const cancelRate =
    agg.ordersLocated > 0 ? (agg.poCancels / agg.ordersLocated) * 100 : 0;
  const fulfillmentRate =
    agg.ordersLocated > 0 ? (agg.fulfilled / agg.ordersLocated) * 100 : 0;
  const out = {
    ordersLocated: agg.ordersLocated,
    firstLocates: agg.firstLocates,
    relocates: agg.relocates,
    delayedLocates: agg.delayedLocates,
    poCancels: agg.poCancels,
    poCancelByCategory: { ...agg.poCancelByCategory },
    fulfilled: agg.fulfilled,
    partShipped: agg.partShipped,
    avgHoursFromInvoiceToLocate:
      avgHoursFromInvoiceToLocate !== null
        ? Number(avgHoursFromInvoiceToLocate.toFixed(2))
        : null,
    avgDaysFromLocateToShip:
      avgDaysFromLocateToShip !== null
        ? Number(avgDaysFromLocateToShip.toFixed(2))
        : null,
    shipRate: Number(shipRate.toFixed(2)),
    cancelRate: Number(cancelRate.toFixed(2)),
    fulfillmentRate: Number(fulfillmentRate.toFixed(2)),
  };
  return out;
}

/**
 * 1-5 star internal yard rating.
 * Formula (documented for transparency):
 *   base = 5 * (fulfillmentRatio) - 2 * (cancelRatio) - 1 * (damagedRatio)
 *   clamp to [0, 5]; return with 1 decimal.
 * fulfillmentRatio = fulfilled / ordersLocated
 * cancelRatio      = poCancels / ordersLocated
 * damagedRatio     = (muddy + rusty + damaged) / ordersLocated
 */
function computeYardRating({
  ordersLocated,
  fulfilled,
  poCancels,
  poCancelByCategory,
}) {
  if (!ordersLocated || ordersLocated <= 0) return null;
  const fulfillmentRatio = fulfilled / ordersLocated;
  const cancelRatio = poCancels / ordersLocated;
  const damaged =
    (poCancelByCategory?.muddy || 0) +
    (poCancelByCategory?.rusty || 0) +
    (poCancelByCategory?.damaged || 0);
  const damagedRatio = damaged / ordersLocated;
  const raw = 5 * fulfillmentRatio - 2 * cancelRatio - 1 * damagedRatio;
  const clamped = Math.max(0, Math.min(5, raw));
  return Number(clamped.toFixed(1));
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const role = String(req.user?.role || "").trim().toLowerCase();
    const isAdmin = role === "admin";
    const hasYardLocates = userHasPermission(req.user, USER_PERMISSIONS.YARD_LOCATES);
    const reqEmail = String(req.user?.email || "").trim().toLowerCase();
    const isAllowedEmail = EXTRA_VIEWER_EMAILS.has(reqEmail);
    if (!isAdmin && !hasYardLocates && !isAllowedEmail) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const {
      start,
      end,
      month,
      year,
      locater: locaterFilterRaw,
    } = req.query;

    const { startDate, endExclusive } = buildDateRange({ start, end, month, year });

    const locaterFilter = String(locaterFilterRaw || "").trim();
    const locaterFilterKey = locaterFilter.toLowerCase();

    const Order = getOrderModelForBrand(req.brand);

    // Bring back only orders touched in the window OR whose additionalInfo timestamps fall in it.
    // Use orderDate as a coarse pre-filter; then filter yardLocatedAt precisely per yard.
    const coarseFrom = new Date(startDate.getTime() - 1000 * 60 * 60 * 24 * 60);
    const orders = await Order.find({
      orderDate: { $gte: coarseFrom },
      "additionalInfo.0": { $exists: true },
    })
      .select("orderNo orderDate customerApprovedDate additionalInfo orderHistory orderStatus")
      .lean();

    const byLocater = new Map();
    const byMonth = new Map();
    const byYard = new Map();

    /**
     * Every locater name actually seen in the current window's data, keyed
     * lowercase → canonical display name (first case-preserving occurrence).
     * We use this so the Filter dropdown reflects real activity — not just the
     * canonical ops-team list.
     */
    const seenLocaters = new Map();
    const rememberLocater = (name) => {
      const trimmed = String(name || "").trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (!seenLocaters.has(key)) seenLocaters.set(key, trimmed);
    };

    for (const order of orders) {
      const yards = Array.isArray(order.additionalInfo) ? order.additionalInfo : [];
      const orderHistory = Array.isArray(order.orderHistory) ? order.orderHistory : [];

      for (let idx = 0; idx < yards.length; idx += 1) {
        const yard = yards[idx];
        const yardNum = idx + 1;

        // Determine locate time: yardLocatedAt (new) or fall back to orderDate.
        const yardLocatedAt =
          yard?.yardLocatedAt instanceof Date
            ? yard.yardLocatedAt
            : yard?.yardLocatedAt
              ? new Date(yard.yardLocatedAt)
              : null;
        const locateInstant =
          yardLocatedAt && !Number.isNaN(yardLocatedAt.getTime())
            ? yardLocatedAt
            : order.orderDate
              ? new Date(order.orderDate)
              : null;
        if (!locateInstant) continue;

        if (locateInstant < startDate || locateInstant >= endExclusive) continue;

        const locater = locaterNameForYard(yard, yardNum, orderHistory);
        if (!locater) continue;

        // Remember every locater we've seen in the window (before filtering)
        // so the UI dropdown can show whoever has actually located yards.
        rememberLocater(locater);

        // Optional filter
        if (locaterFilterKey && locater.toLowerCase() !== locaterFilterKey) continue;

        const relocateSeq =
          Number.isFinite(Number(yard?.relocateSequence)) && Number(yard.relocateSequence) > 0
            ? Number(yard.relocateSequence)
            : yardNum;

        const invoiceApproved =
          order.customerApprovedDate ? new Date(order.customerApprovedDate) : null;
        const hoursInvoiceToLocate =
          invoiceApproved && !Number.isNaN(invoiceApproved.getTime())
            ? hoursBetween(invoiceApproved, locateInstant)
            : null;
        const isDelayed =
          hoursInvoiceToLocate !== null && hoursInvoiceToLocate > SLA_HOURS_LOCATE;

        const partShippedAt =
          yard?.partShippedAt
            ? new Date(yard.partShippedAt)
            : null;
        const daysLocateToShip =
          partShippedAt && !Number.isNaN(partShippedAt.getTime())
            ? hoursBetween(locateInstant, partShippedAt) / 24
            : null;

        const status = yard?.status || "";
        const isPoCancelled = isPoCancelledStatus(status);
        const isShipped = isPartShippedStatus(status);
        const isFulfilled = isFulfilledStatus(status);

        const yardCategoryRaw = String(yard?.poCancelCategory || "").trim().toLowerCase();
        const yardCategory = PO_CANCEL_CATEGORIES.includes(yardCategoryRaw)
          ? yardCategoryRaw
          : "other";

        const monthKey = moment.tz(locateInstant, TZ).format("YYYY-MM");
        const yardKey = String(yard?.yardName || "").trim() || "(Unnamed)";

        const bumpAgg = (agg) => {
          agg.ordersLocated += 1;
          if (relocateSeq >= 2) agg.relocates += 1;
          else agg.firstLocates += 1;
          if (isDelayed) agg.delayedLocates += 1;
          if (isPoCancelled) {
            agg.poCancels += 1;
            agg.poCancelByCategory[yardCategory] =
              (agg.poCancelByCategory[yardCategory] || 0) + 1;
          }
          if (isShipped) agg.partShipped += 1;
          if (isFulfilled) agg.fulfilled += 1;
          if (hoursInvoiceToLocate !== null) {
            agg._sumHoursInvoiceToLocate += hoursInvoiceToLocate;
            agg._countHoursInvoiceToLocate += 1;
          }
          if (daysLocateToShip !== null) {
            agg._sumDaysLocateToShip += daysLocateToShip;
            agg._countDaysLocateToShip += 1;
          }
        };

        // Aggregate under a normalized (lowercase) key so different casings
        // ("Tyler" vs "tyler") collapse into one row.
        const locaterKey = locater.toLowerCase();
        if (!byLocater.has(locaterKey)) {
          byLocater.set(locaterKey, {
            _displayName: locater,
            ...emptyLocaterAgg(),
          });
        }
        bumpAgg(byLocater.get(locaterKey));

        const monthAggKey = `${locaterKey}||${monthKey}`;
        if (!byMonth.has(monthAggKey)) {
          byMonth.set(monthAggKey, {
            locater,
            monthKey,
            monthLabel: moment.tz(locateInstant, TZ).format("MMMM YYYY"),
            ...emptyLocaterAgg(),
          });
        }
        bumpAgg(byMonth.get(monthAggKey));

        if (!byYard.has(yardKey)) {
          byYard.set(yardKey, { yardName: yardKey, ...emptyLocaterAgg() });
        }
        bumpAgg(byYard.get(yardKey));
      }
    }

    const locaterRows = Array.from(byLocater.values())
      .map((entry) => {
        const { _displayName, ...rest } = entry;
        return { locater: _displayName, ...finalizeAgg(rest) };
      })
      .sort((a, b) => b.ordersLocated - a.ordersLocated);

    const monthRows = Array.from(byMonth.values())
      .map((entry) => {
        const { locater, monthKey, monthLabel, ...rest } = entry;
        return { locater, monthKey, monthLabel, ...finalizeAgg(rest) };
      })
      .sort((a, b) =>
        b.monthKey.localeCompare(a.monthKey) ||
        a.locater.localeCompare(b.locater)
      );

    const yardRows = Array.from(byYard.values())
      .map((entry) => {
        const finalized = finalizeAgg(entry);
        const rating = computeYardRating({
          ordersLocated: finalized.ordersLocated,
          fulfilled: finalized.fulfilled,
          poCancels: finalized.poCancels,
          poCancelByCategory: finalized.poCancelByCategory,
        });
        return { yardName: entry.yardName, ...finalized, rating };
      })
      .sort((a, b) => b.ordersLocated - a.ordersLocated);

    const totals = finalizeAgg(
      Array.from(byLocater.values()).reduce((acc, agg) => {
        acc.ordersLocated += agg.ordersLocated;
        acc.firstLocates += agg.firstLocates;
        acc.relocates += agg.relocates;
        acc.delayedLocates += agg.delayedLocates;
        acc.poCancels += agg.poCancels;
        for (const cat of PO_CANCEL_CATEGORIES) {
          acc.poCancelByCategory[cat] =
            (acc.poCancelByCategory[cat] || 0) +
            (agg.poCancelByCategory[cat] || 0);
        }
        acc.fulfilled += agg.fulfilled;
        acc.partShipped += agg.partShipped;
        acc._sumHoursInvoiceToLocate += agg._sumHoursInvoiceToLocate;
        acc._countHoursInvoiceToLocate += agg._countHoursInvoiceToLocate;
        acc._sumDaysLocateToShip += agg._sumDaysLocateToShip;
        acc._countDaysLocateToShip += agg._countDaysLocateToShip;
        return acc;
      }, emptyLocaterAgg())
    );

    // Union of every locater seen in this window PLUS the canonical ops-team
    // roster (Tyler / Amy / Nik). Ensures the dropdown reflects reality even
    // when older data has different names (e.g. Richard, Ricky, John).
    const locaterUnion = new Map();
    for (const [key, display] of seenLocaters.entries()) {
      locaterUnion.set(key, display);
    }
    for (const name of KNOWN_LOCATERS) {
      const key = name.toLowerCase();
      if (!locaterUnion.has(key)) locaterUnion.set(key, name);
    }
    const locaterOptions = Array.from(locaterUnion.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );

    return res.json({
      brand: req.brand,
      dateRange: {
        start: moment.tz(startDate, TZ).format("YYYY-MM-DD"),
        end: moment.tz(endExclusive, TZ).subtract(1, "millisecond").format("YYYY-MM-DD"),
      },
      slaHoursLocate: SLA_HOURS_LOCATE,
      filters: {
        locaters: locaterOptions,
        knownLocaters: KNOWN_LOCATERS,
        locater: locaterFilter || null,
      },
      totals,
      byLocater: locaterRows,
      byMonth: monthRows,
      byYard: yardRows,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("GET /reports/yard-locaters failed:", err);
    return res.status(500).json({
      message: "Failed to generate yard locaters stats.",
      error: err.message,
    });
  }
});

export default router;
