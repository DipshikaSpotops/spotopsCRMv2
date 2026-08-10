/** File picker accept value — all common image types (not PNG-only). */
export const IMAGE_FILE_ACCEPT =
  "image/*,image/png,image/jpeg,image/jpg,image/gif,image/webp,image/bmp,image/tiff,image/heic,image/heif,image/avif,.png,.jpg,.jpeg,.jfif,.gif,.webp,.bmp,.tif,.tiff,.heic,.heif,.avif";

const IMAGE_EXT_RE =
  /\.(png|jpe?g|jfif|gif|webp|bmp|tiff?|heic|heif|avif)$/i;

const EXT_TO_MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
};

export function isImageFile(file) {
  if (!file) return false;
  const mime = String(file.type || "").toLowerCase().trim();
  if (mime.startsWith("image/")) return true;
  // Some OS/browsers leave type empty or as octet-stream for jpg/heic/etc.
  if (!mime || mime === "application/octet-stream") {
    return IMAGE_EXT_RE.test(String(file.name || ""));
  }
  return false;
}

/** Best-effort MIME when the browser omits file.type. */
export function resolveImageMimeType(file) {
  const mime = String(file?.type || "").toLowerCase().trim();
  if (mime.startsWith("image/")) return mime;
  const match = String(file?.name || "").toLowerCase().match(IMAGE_EXT_RE);
  if (!match) return "image/jpeg";
  return EXT_TO_MIME[match[1]] || "image/jpeg";
}
