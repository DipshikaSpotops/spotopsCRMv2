import API from "../api";

/**
 * Open a private S3 object (yard image / void label / customer image) via short-lived signed URL.
 */
export async function openS3ObjectUrl(rawUrl) {
  const url = String(rawUrl || "").trim();
  if (!url) return;

  try {
    const { data } = await API.get("/s3/signed-url", {
      params: { url },
    });
    const signed = data?.url;
    if (!signed) throw new Error("No signed URL returned");
    window.open(signed, "_blank", "noopener,noreferrer");
  } catch (err) {
    console.error("Failed to open S3 object:", err);
    // Fallback: try the raw URL (works if object is already public)
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Resolve a displayable image src for <img> tags (signed when needed).
 */
export async function resolveS3ViewSrc(rawUrl) {
  const url = String(rawUrl || "").trim();
  if (!url) return "";
  try {
    const { data } = await API.get("/s3/signed-url", {
      params: { url },
    });
    return data?.url || url;
  } catch {
    return url;
  }
}
