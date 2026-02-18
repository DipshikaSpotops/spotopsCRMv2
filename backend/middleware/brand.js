// Middleware to determine current brand (50STARS vs PROLANE) per request
// Brand is sent from frontend via "x-brand" header.
// Defaults to "50STARS" to preserve existing behavior.

export function brandMiddleware(req, res, next) {
  try {
    const raw = (req.headers["x-brand"] || req.headers["x-Brand"] || "").toString();
    const normalized = raw.trim().toUpperCase();
    req.brand = normalized === "PROLANE" ? "PROLANE" : "50STARS";
  } catch {
    req.brand = "50STARS";
  }
  next();
}

