const EXT_FROM_MIME = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/pjpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/x-ms-bmp": "bmp",
  "image/tiff": "tiff",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

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
  svg: "image/svg+xml",
};

const IMAGE_EXT_RE =
  /\.(png|jpe?g|jfif|gif|webp|bmp|tiff?|heic|heif|avif|svg)$/i;

/** True for image/* MIME or known image file extension. */
export function isImageUpload(file) {
  if (!file) return false;
  const mime = String(file.mimetype || file.type || "")
    .toLowerCase()
    .trim();
  if (mime.startsWith("image/")) return true;
  if (!mime || mime === "application/octet-stream") {
    return IMAGE_EXT_RE.test(String(file.originalname || file.name || ""));
  }
  return false;
}

export function resolveImageMimeAndExt(file) {
  let mime = String(file?.mimetype || file?.type || "")
    .toLowerCase()
    .trim();
  const name = String(file?.originalname || file?.name || "");

  if (!mime.startsWith("image/")) {
    const match = name.toLowerCase().match(IMAGE_EXT_RE);
    if (match) mime = EXT_TO_MIME[match[1]] || "image/jpeg";
    else mime = "image/jpeg";
  }

  let ext = EXT_FROM_MIME[mime];
  if (!ext) {
    const raw = mime.includes("/") ? mime.split("/")[1] : "";
    ext = String(raw || "jpg")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (ext === "jpeg") ext = "jpg";
    if (!ext) ext = "jpg";
  }

  return { mimeType: mime, ext };
}
