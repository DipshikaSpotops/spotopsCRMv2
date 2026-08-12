import express from "express";
import { requireAuth, allow } from "../middleware/auth.js";
import { fetchConfiguredS3ObjectForView } from "../services/s3Upload.js";

const router = express.Router();

/**
 * GET /api/s3/object?url=<stored-s3-url>
 * Streams a private bucket object (yard images, void labels, etc.) for authenticated users.
 * Uses @aws-sdk/client-s3 only (no s3-request-presigner dependency).
 */
router.get(
  "/object",
  requireAuth,
  allow("Admin", "Sales", "Support"),
  async (req, res) => {
    try {
      const url = String(req.query.url || "").trim();
      if (!url) {
        return res.status(400).json({ message: "url query param is required" });
      }

      const { buffer, contentType, fileName } =
        await fetchConfiguredS3ObjectForView(url);

      res.setHeader("Content-Type", contentType);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${String(fileName).replace(/"/g, "")}"`
      );
      res.setHeader("Cache-Control", "private, max-age=300");
      res.send(buffer);
    } catch (err) {
      console.error("GET /api/s3/object failed:", err);
      const status = err?.statusCode || 500;
      res.status(status).json({
        message: err?.message || "Failed to load S3 object",
      });
    }
  }
);

/** @deprecated kept as alias so older clients still work */
router.get(
  "/signed-url",
  requireAuth,
  allow("Admin", "Sales", "Support"),
  async (req, res) => {
    // Older UI asked for a signed URL; return a same-origin proxy path instead.
    try {
      const url = String(req.query.url || "").trim();
      if (!url) {
        return res.status(400).json({ message: "url query param is required" });
      }
      // Validate object exists / is ours
      await fetchConfiguredS3ObjectForView(url);
      res.json({
        url: `/api/s3/object?url=${encodeURIComponent(url)}`,
        proxy: true,
      });
    } catch (err) {
      console.error("GET /api/s3/signed-url failed:", err);
      const status = err?.statusCode || 500;
      res.status(status).json({
        message: err?.message || "Failed to prepare S3 view URL",
      });
    }
  }
);

export default router;
