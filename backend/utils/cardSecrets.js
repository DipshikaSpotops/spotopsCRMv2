import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;

function getKey() {
  const raw = String(process.env.CARD_DATA_ENCRYPTION_KEY || "").trim();
  if (!raw) {
    throw new Error("CARD_DATA_ENCRYPTION_KEY is not configured");
  }
  // Accept 64-char hex (32 bytes) or any string (hashed to 32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function last4FromCard(value) {
  const digits = digitsOnly(value);
  if (digits.length < 4) return "";
  return digits.slice(-4);
}

export function maskCardNumber(value) {
  const digits = digitsOnly(value);
  if (!digits) return "";
  const last4 = digits.slice(-4);
  if (digits.length >= 8) {
    const first4 = digits.slice(0, 4);
    return `${first4}**** **** ${last4}`;
  }
  return `**** **** **** ${last4}`;
}

export function maskFromLast4(last4) {
  const d = digitsOnly(last4).slice(-4);
  if (!d) return "";
  return `**** **** **** ${d}`;
}

/** Encrypt a UTF-8 secret. Returns `iv:authTag:ciphertext` (hex). */
export function encryptSecret(plaintext) {
  const text = String(plaintext ?? "");
  if (!text) return "";
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

/** Decrypt a value produced by encryptSecret. Returns "" on failure. */
export function decryptSecret(payload) {
  try {
    const raw = String(payload ?? "");
    if (!raw) return "";
    const parts = raw.split(":");
    if (parts.length !== 3) return "";
    const [ivHex, tagHex, dataHex] = parts;
    const key = getKey();
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const data = Buffer.from(dataHex, "hex");
    if (iv.length !== IV_LEN || tag.length !== AUTH_TAG_LEN) return "";
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

/**
 * Apply card/CVV from an incoming request body onto an order document.
 * Mutates `order` and strips sensitive plaintext keys from `body`.
 */
export function applyCardSecretsFromBody(order, body = {}) {
  if (!order || !body || typeof body !== "object") return;

  const cardRaw = body.cardNumber;
  const cvvRaw = body.cvv;

  // Never let plaintext or client-supplied ciphertext overwrite via blind assign
  delete body.cardNumber;
  delete body.cvv;
  delete body.cardNumberMasked;
  delete body.cardNumberEncrypted;
  delete body.cvvEncrypted;

  if (cardRaw != null && String(cardRaw).trim() !== "") {
    const digits = digitsOnly(cardRaw);
    // Ignore masked placeholders like ****1234 with no real digits beyond last4-only save
    const isMaskedPlaceholder = /\*/.test(String(cardRaw)) && digits.length <= 4;

    if (digits.length >= 13 && digits.length <= 19) {
      order.cardNumberEncrypted = encryptSecret(digits);
      order.last4digits = last4FromCard(digits);
    } else if (digits.length === 4 && !isMaskedPlaceholder) {
      // Explicit last-4 only (legacy / no full card yet)
      order.last4digits = digits;
    } else if (isMaskedPlaceholder && digits.length === 4) {
      // Re-saving masked value from non-Admin edit — keep existing encrypted card; sync last4
      order.last4digits = digits;
    } else if (digits.length > 4 && digits.length < 13) {
      order.last4digits = last4FromCard(digits);
    }
  }

  if (cvvRaw != null && String(cvvRaw).trim() !== "") {
    const cvvStr = String(cvvRaw).trim();
    if (!/^\*+$/.test(cvvStr)) {
      const cvvDigits = digitsOnly(cvvStr).slice(0, 4);
      if (cvvDigits.length >= 3) {
        order.cvvEncrypted = encryptSecret(cvvDigits);
      }
    }
  }
}

/**
 * Shape an order object for API clients. Never returns ciphertext.
 * Admin gets decrypted cardNumber + cvv when available.
 */
export function presentOrderCardFields(orderObj, { isAdmin = false } = {}) {
  if (!orderObj || typeof orderObj !== "object") return orderObj;

  const out = { ...orderObj };
  const encCard = out.cardNumberEncrypted;
  const encCvv = out.cvvEncrypted;
  delete out.cardNumberEncrypted;
  delete out.cvvEncrypted;

  let plainCard = "";
  if (encCard) {
    try {
      plainCard = decryptSecret(encCard);
    } catch {
      plainCard = "";
    }
  }

  const last4 = out.last4digits || last4FromCard(plainCard);
  if (last4 && !out.last4digits) out.last4digits = last4;

  out.cardNumberMasked = plainCard
    ? maskCardNumber(plainCard)
    : maskFromLast4(last4);

  if (isAdmin && plainCard) {
    out.cardNumber = plainCard;
    if (encCvv) {
      out.cvv = decryptSecret(encCvv) || "";
    }
  } else {
    out.cardNumber = out.cardNumberMasked || "";
    delete out.cvv;
  }

  return out;
}

export function isAdminUser(user) {
  return String(user?.role || "").trim() === "Admin";
}
