// utils/dateRange.js
import moment from "moment-timezone";

/**
 * Build start/end Date objects in the given timezone (default: America/Chicago)
 * - If start/end provided: returns that day's bounds
 * - Else if month/year provided: returns that month bounds
 *
 * Inputs:
 *   start, end  -> ISO-like strings (any parseable string)
 *   month, year -> month can be "Jan".."Dec" or 1..12
 */
export function getDateRange({ start, end, month, year }, tz = "America/Chicago") {
  if (start && end) {
    const startDate = moment.tz(start, tz).startOf("day").toDate();
    const endDate   = moment.tz(end,   tz).endOf("day").toDate();
    return { startDate, endDate };
  }

  if (month != null && year != null) {
    const monthMap = {
      Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
      Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
    };

    let paddedMonth;
    if (typeof month === "string" && month.length === 3 && monthMap[month]) {
      paddedMonth = monthMap[month];
    } else if (!isNaN(Number(month))) {
      paddedMonth = String(month).padStart(2, "0");
    } else {
      throw new Error("Invalid month format");
    }

    const base = moment.tz(`${year}-${paddedMonth}-01`, tz);
    const startDate = base.clone().startOf("month").toDate();
    const endDate   = base.clone().endOf("month").toDate();
    return { startDate, endDate };
  }

  throw new Error("Provide either start/end or month/year");
}
