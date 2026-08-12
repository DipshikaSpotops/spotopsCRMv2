import express from "express";
import { requireAuth, allow } from "../middleware/auth.js";
import { getPresignedViewUrlForObjectUrl } from "../services/s3Upload.js";

const router = express.Router();

/**
 * GET /api/s3/signed-url?url=<stored-s3-url>
 * Returns a short-lived signed URL for private bucket objects (yard images, void labels, etc.).
 */
router.get(
  "/signed-url",
  requireAuth,
  allow("Admin", "Sales", "Support"),
  async (req, res) => {
    try {
      const url = String(req.query.url || "").trim();
      if (!url) {
        return res.status(400).json({ message: "url query param is required" });
      }

      const signedUrl = await getPresignedViewUrlForObjectUrl(url);
      res.json({ url: signedUrl });
    } catch (err) {
      console.error("GET /api/s3/signed-url failed:", err);
      const status = err?.statusCode || 500;
      res.status(status).json({
        message: err?.message || "Failed to create signed URL",
      });
    }
  }
);

export default router;
