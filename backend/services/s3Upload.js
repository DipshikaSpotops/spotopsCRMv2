import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

/**
 * Upload a void-label screenshot image to S3 and return its public URL.
 *
 * Required env vars:
 * - AWS_REGION
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - S3_LABEL_VOIDED_BUCKET   (bucket name)
 */
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

