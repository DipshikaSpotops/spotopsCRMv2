// brand.js - helpers for 50STARS / PROLANE brand selection

const BRAND_KEY = "currentBrand";
const EVENT_NAME = "brand-changed";

export function getCurrentBrand() {
  if (typeof window === "undefined") return "50STARS";
  try {
    const raw = localStorage.getItem(BRAND_KEY) || "50STARS";
    return String(raw || "50STARS").toUpperCase();
  } catch {
    return "50STARS";
  }
}

export function setCurrentBrand(nextBrand) {
  if (typeof window === "undefined") return;
  const normalized = String(nextBrand || "50STARS").toUpperCase();
  try {
    localStorage.setItem(BRAND_KEY, normalized);
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: { brand: normalized } })
    );
  } catch {
    // ignore
  }
}

export function onBrandChange(handler) {
  if (typeof window === "undefined" || typeof handler !== "function") {
    return () => {};
  }
  const wrapped = (event) => {
    handler(event?.detail?.brand);
  };
  window.addEventListener(EVENT_NAME, wrapped);
  return () => window.removeEventListener(EVENT_NAME, wrapped);
}

