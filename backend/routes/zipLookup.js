import express from "express";
import axios from "axios";

const router = express.Router();

router.get("/", async (req, res) => {
  const raw = String(req.query.zip || "").trim();
  if (!raw) {
    return res.status(400).json({ error: "zip query parameter is required" });
  }

  const normalized = raw.replace(/\s+/g, "").toUpperCase();
  let url = null;
  let countryCode = "US";

  if (/^\d{5}$/.test(normalized)) {
    url = `https://api.zippopotam.us/us/${normalized}`;
  } else if (normalized.length >= 3) {
    const segment = normalized.slice(0, 3);
    if (/^[A-Z]\d[A-Z]$/.test(segment)) {
      url = `https://api.zippopotam.us/CA/${segment}`;
      countryCode = "CA";
    }
  }

  if (!url) {
    return res.status(400).json({ error: "Unsupported ZIP/Postal code format" });
  }

  try {
    const response = await axios.get(url);
    const data = response.data;
    const place = data?.places?.[0];

    if (!place) {
      return res.status(404).json({ error: "ZIP/Postal code not found" });
    }

    return res.json({
      city: place["place name"] || "",
      state: place["state abbreviation"] || "",
      country: data?.["country abbreviation"] || countryCode,
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        return res.status(404).json({ error: "ZIP/Postal code not found" });
      }
      console.error("zipLookup axios error:", error.message);
    } else {
      console.error("zipLookup error:", error);
    }
    return res.status(500).json({ error: "ZIP lookup failed" });
  }
});

export default router;

