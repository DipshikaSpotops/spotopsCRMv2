// Middleware to determine current brand (50STARS vs PROLANE vs PROTP) per request
// Brand is sent from frontend via "x-brand" header.
// Defaults to "50STARS" to preserve existing behavior.

const VALID_BRANDS = new Set(["50STARS", "PROLANE", "PROTP"]);

export function brandMiddleware(req, res, next) {
  try {
    const raw = (req.headers["x-brand"] || req.headers["x-Brand"] || "").toString();
    const normalized = raw.trim().toUpperCase();
    req.brand = VALID_BRANDS.has(normalized) ? normalized : "50STARS";
  } catch {
    req.brand = "50STARS";
  }
  next();
}

