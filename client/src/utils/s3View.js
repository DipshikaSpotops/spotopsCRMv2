import API from "../api";

function revokeLater(objectUrl) {
  if (!objectUrl) return;
  setTimeout(() => {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      /* ignore */
    }
  }, 60_000);
}

/**
 * Open a private S3 object via authenticated API stream (blob URL).
 */
export async function openS3ObjectUrl(rawUrl) {
  const url = String(rawUrl || "").trim();
  if (!url) return;

  try {
    const { data } = await API.get("/s3/object", {
      params: { url },
      responseType: "blob",
    });
    const blobUrl = URL.createObjectURL(data);
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    revokeLater(blobUrl);
  } catch (err) {
    console.error("Failed to open S3 object:", err);
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Resolve a displayable image src for <img> tags via authenticated blob URL.
 */
export async function resolveS3ViewSrc(rawUrl) {
  const url = String(rawUrl || "").trim();
  if (!url) return "";
  try {
    const { data } = await API.get("/s3/object", {
      params: { url },
      responseType: "blob",
    });
    return URL.createObjectURL(data);
  } catch {
    return url;
  }
}
