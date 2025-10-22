export function fmtAddress(o = {}, prefix = "") {
  return [
    o?.[`${prefix}Street`],
    o?.[`${prefix}City`],
    o?.[`${prefix}State`],
    o?.[`${prefix}Zip`],
  ]
    .filter(Boolean)
    .join(", ");
}

export function parseOrderHistory(historyArr) {
  if (!Array.isArray(historyArr)) return [];
  return historyArr.map((line) => {
    const byMatch = String(line).match(/\bby\s([^on]+?)\s+on\b/i);
    const whenMatch = String(line).match(/\bon\s(.+)$/i);

    const by = byMatch ? byMatch[1].trim() : "";
    const when = whenMatch ? whenMatch[1].trim() : "";

    let event = String(line);
    if (byMatch) event = event.replace(byMatch[0], "").trim();
    if (whenMatch) event = event.replace(whenMatch[0], "").trim();
    event = event.replace(/\s{2,}/g, " ");

    return { by, when, event, text: line };
  });
}

export function getStatusColor(status) {
  switch ((status || "").toLowerCase()) {
    case "placed":
      return "text-[#9ad696] dark:text-[#9ad696]";
    case "customer approved":
      return "bg-green-100 text-green-800 dark:bg-green-700/30 dark:text-green-300";
    case "order cancelled":
      return "bg-[#40505] text-[#40505] dark:bg-red-700/30 dark:text-red-300";
    case "processing":
      return "bg-blue-100 text-blue-800 dark:bg-blue-700/30 dark:text-blue-300";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-300";
  }
}

export function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "short" }); // <-- "Nov"
  const year = date.getFullYear();
  const suffix =
    day % 10 === 1 && day !== 11 ? "st" :
    day % 10 === 2 && day !== 12 ? "nd" :
    day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${suffix} ${month}, ${year}`;
}
