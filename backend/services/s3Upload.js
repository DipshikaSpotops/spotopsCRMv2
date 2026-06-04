import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import dotenv from "dotenv";

// Ensure .env is loaded even if server.js hasn't called dotenv.config yet
dotenv.config();

const region = process.env.AWS_REGION;
const bucket = process.env.S3_LABEL_VOIDED_BUCKET;

if (!region || !bucket) {
  console.warn(
    "[s3Upload] AWS_REGION or S3_LABEL_VOIDED_BUCKET not set. S3 uploads will fail until configured."
  );
}

const s3Client = new S3Client({
  region,
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      }
    : undefined,
});

export async function uploadVoidLabelScreenshotToS3(buffer, mimeType, keyBase) {
  if (!buffer || !buffer.length) {
    throw new Error("No file data provided");
  }
  if (!bucket) {
    throw new Error("S3_LABEL_VOIDED_BUCKET is not configured");
  }

  // Derive extension from MIME type
  let ext = "png";
  if (mimeType && mimeType.startsWith("image/")) {
    const rawExt = mimeType.split("/")[1].toLowerCase();
    if (rawExt === "jpeg" || rawExt === "jpg") {
      ext = "jpg";
    } else if (rawExt) {
      ext = rawExt;
    }
  }

  // keyBase is typically the orderNo; we append a short random suffix for uniqueness
  const safeBase = String(keyBase || "order")
    .trim()
    .replace(/[^\w\-]/g, "_");
  const random = crypto.randomBytes(4).toString("hex");
  const key = `Label_Voided_Images/${safeBase}-${random}.${ext}`;

  const putCommand = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mimeType || "image/png",
  });

  await s3Client.send(putCommand);

  // Construct public URL (standard virtual-hosted–style URL)
  const url = `https://${bucket}.s3.${region}.amazonaws.com/${encodeURIComponent(
    key
  )}`;
  return url;
}

// Generic helper to upload per-yard images (e.g., damage photos, tracking screenshots)
export async function uploadYardImageToS3(buffer, mimeType, keyBase) {
  if (!buffer || !buffer.length) {
    throw new Error("No file data provided");
  }
  if (!bucket) {
    throw new Error("S3_LABEL_VOIDED_BUCKET is not configured");
  }

  let ext = "png";
  if (mimeType && mimeType.startsWith("image/")) {
    const rawExt = mimeType.split("/")[1].toLowerCase();
    if (rawExt === "jpeg" || rawExt === "jpg") {
      ext = "jpg";
    } else if (rawExt) {
      ext = rawExt;
    }
  }

  const safeBase = String(keyBase || "yard")
    .trim()
    .replace(/[^\w\-]/g, "_");
  const random = crypto.randomBytes(4).toString("hex");
  const key = `Yard_Images/${safeBase}-${random}.${ext}`;

  const putCommand = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mimeType || "image/png",
  });

  await s3Client.send(putCommand);

  const url = `https://${bucket}.s3.${region}.amazonaws.com/${encodeURIComponent(
    key
  )}`;
  return url;
}

/**
 * Upload a logo image to S3
 * @param {Buffer} buffer - Image file buffer
 * @param {string} mimeType - MIME type (e.g., "image/png", "image/jpeg")
 * @param {string} logoName - Name for the logo (e.g., "prolaneLogo", "logo")
 * @param {string} bucketName - Optional bucket name (defaults to S3_ASSETS_BUCKET or assets-autoparts)
 * @returns {Promise<string>} Public URL of the uploaded logo
 */
export async function uploadLogoToS3(buffer, mimeType, logoName = "logo", bucketName = null) {
  if (!buffer || !buffer.length) {
    throw new Error("No file data provided");
  }

  // Use provided bucket, or S3_ASSETS_BUCKET env var, or default to assets-autoparts
  const targetBucket = bucketName || process.env.S3_ASSETS_BUCKET || "assets-autoparts";
  const targetRegion = process.env.AWS_REGION || "ap-south-1";

  // Derive extension from MIME type
  let ext = "png";
  if (mimeType && mimeType.startsWith("image/")) {
    const rawExt = mimeType.split("/")[1].toLowerCase();
    if (rawExt === "jpeg" || rawExt === "jpg") {
      ext = "jpg";
    } else if (rawExt) {
      ext = rawExt;
    }
  }

  // Create safe filename
  const safeName = String(logoName || "logo")
    .trim()
    .replace(/[^\w\-]/g, "_")
    .toLowerCase();
  
  // Upload to images/ folder in S3
  const key = `images/${safeName}.${ext}`;

  // Use the same S3 client (it will work with any bucket in the same region)
  const putCommand = new PutObjectCommand({
    Bucket: targetBucket,
    Key: key,
    Body: buffer,
    ContentType: mimeType || "image/png",
    // Make it publicly readable (if bucket policy allows)
    ACL: "public-read",
  });

  await s3Client.send(putCommand);  // Construct public URL
  const url = `https://${targetBucket}.s3.${targetRegion}.amazonaws.com/${key}`;
  return url;
}

/** Fixed PO driving-license object (same file for all orders when checkbox is checked). */
export const DRIVING_LICENSE_PO_S3_KEY =
  process.env.DRIVING_LICENSE_S3_KEY ||
  "Label_Voided_Images/Driving+License+Salomon+Rodriguez.png";

async function streamToBuffer(body) {
  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Fetch the fixed driving license image from S3 for PO email attachment.
 */
export async function fetchDrivingLicenseAttachmentBuffer() {
  if (!bucket) {
    throw new Error("S3_LABEL_VOIDED_BUCKET is not configured");
  }

  const candidates = [
    DRIVING_LICENSE_PO_S3_KEY,
    DRIVING_LICENSE_PO_S3_KEY.replace(/\+/g, " "),
  ];
  const seen = new Set();

  for (const key of candidates) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try {
      const res = await s3Client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      );
      if (!res.Body) continue;
      return await streamToBuffer(res.Body);
    } catch (err) {
      const code = err?.name || err?.Code;
      if (code === "NoSuchKey" || code === "NotFound") continue;
      throw err;
    }
  }

  throw new Error(
    "Driving license image could not be loaded from S3. Check DRIVING_LICENSE_S3_KEY and bucket access."
  );
}
