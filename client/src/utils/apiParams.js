import { buildDefaultFilter } from "./dateUtils";

export function buildParams({ filter, page, query, sortBy, sortOrder }) {
  const params = new URLSearchParams();

  if (filter?.start && filter?.end) {
    params.set("start", filter.start);
    params.set("end", filter.end);
  } else if (filter?.month && filter?.year) {
    params.set("month", filter.month);
    params.set("year", String(filter.year));
  } else {
    const def = buildDefaultFilter();
    params.set("month", def.month);
    params.set("year", String(def.year));
  }

  if (page) params.set("page", String(page));
  if (query) params.set("q", query);
  if (sortBy) params.set("sortBy", sortBy);
  if (sortOrder) params.set("sortOrder", sortOrder);

  return params;
}
