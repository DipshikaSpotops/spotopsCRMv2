import moment from "moment-timezone";

const TZ = "America/Chicago";

export function dallasNowPretty() {
  return moment().tz(TZ).format("Do MMM, YYYY HH:mm");
}

/** Append a team-assignment line to order.orderHistory (mutates order). */
export function appendTeamAssignHistory(order, { prevTeam, nextTeam, by }) {
  const from = String(prevTeam || "").trim() || "—";
  const to = String(nextTeam || "").trim() || "—";
  const who = String(by || "System").trim() || "System";
  const line = `Team assigned: ${from} → ${to} by ${who} on ${dallasNowPretty()}`;
  if (Array.isArray(order.orderHistory)) {
    order.orderHistory.push(line);
  } else {
    order.orderHistory = [line];
  }
  return line;
}
