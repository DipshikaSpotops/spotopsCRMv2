import moment from "moment-timezone";

/**
 * Returns a formatted timestamp (Dallas timezone) for logs, history, and notes.
 * @param {"short"|"long"|"iso"} type - Optional format style.
 */
export const getWhen = (type = "short") => {
  const now = moment().tz("America/Chicago");
  switch (type) {
    case "iso":
      return now.toISOString();
    case "long":
      return now.format("dddd, D MMM YYYY, hh:mm A");
    case "short":
    default:
      return now.format("D MMM, YYYY HH:mm");
  }
};

/**
 * Converts a plain YYYY-MM-DD string (from <input type="date">)
 * into a proper Dallas-local ISO timestamp.
 * Example: "2025-10-10" → "2025-10-10T05:00:00.000Z"
 */
export const toDallasIso = (dateString) => {
  if (!dateString) return null;
  return moment.tz(dateString, "America/Chicago").startOf("day").toISOString();
};

/**
 * Converts any UTC timestamp into a Dallas-local formatted string for display.
 * Example: "2025-10-10T00:00:00.000Z" → "Oct 9th, 2025, 7:00 PM"
 */
export const formatDallasDate = (utcString, type = "short") => {
  if (!utcString) return "—";
  const local = moment(utcString).tz("America/Chicago");
  switch (type) {
    case "long":
      return local.format("dddd, MMM Do YYYY, h:mm A");
    case "iso":
      return local.toISOString();
    default:
      return local.format("MMM Do, YYYY");
  }
};
