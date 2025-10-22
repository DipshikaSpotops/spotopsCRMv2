import { formatInTimeZone } from "date-fns-tz";
import moment from "moment-timezone";

const TZ = "America/Chicago";
const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/**
 * Format a date string into "24 Sep 2025" (no ordinal, no comma).
 * Falls back gracefully for invalid or empty dates.
 */
export const formatDate = (dateStr) => {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  if (isNaN(date)) return "Invalid Date";
  return formatInTimeZone(date, TZ, "d MMM yyyy");
};

/**
 * Safe formatter with ordinal + comma style: "24th Sep, 2025"
 * Used where more descriptive formatting is needed (search, table cells).
 */
export const formatDateSafe = (dateStr, fmt = "do MMM, yyyy") => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return "—";
  return formatInTimeZone(d, TZ, fmt);
};

/**
 * Build the default month/year filter (current month, current year).
 */
export const buildDefaultFilter = () => {
  const now = new Date();
  return { month: monthNames[now.getMonth()], year: now.getFullYear() };
};

/**
 * Convert a filter object into a user-friendly string.
 */
export const prettyFilterLabel = (filter) => {
  if (!filter) return "";
  if (filter.month && filter.year) return `${filter.month} ${filter.year}`;

  if (filter.start && filter.end) {
    const s = moment.tz(filter.start, TZ);
    const e = moment.tz(filter.end, TZ);
    if (
      s.isSame(s.clone().startOf("month")) &&
      e.isSame(s.clone().endOf("month"))
    ) {
      return s.format("MMM YYYY");
    }
    return `${s.format("D MMM YYYY")} – ${e.format("D MMM YYYY")}`;
  }

  return "";
};
