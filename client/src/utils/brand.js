// brand.js - helpers for 50STARS / PROLANE brand selection
// Per-tab: sessionStorage holds this tab’s brand so duplicate tabs can show different brands.
// New tabs with empty session once copy from localStorage (last choice / legacy).

const BRAND_KEY = "currentBrand";
const EVENT_NAME = "brand-changed";

function readTabBrand() {
  try {
    const fromSession = sessionStorage.getItem(BRAND_KEY);
    if (fromSession != null && String(fromSession).trim() !== "") {
      return String(fromSession).toUpperCase();
    }
    const fromLocal = localStorage.getItem(BRAND_KEY);
    if (fromLocal != null && String(fromLocal).trim() !== "") {
      const normalized = String(fromLocal).toUpperCase();
      sessionStorage.setItem(BRAND_KEY, normalized);
      return normalized;
    }
  } catch {
    // ignore
  }
  return "50STARS";
}

export function getCurrentBrand() {
  if (typeof window === "undefined") return "50STARS";
  return readTabBrand();
}

export function setCurrentBrand(nextBrand) {
  if (typeof window === "undefined") return;
  const normalized = String(nextBrand || "50STARS").toUpperCase();
  try {
    sessionStorage.setItem(BRAND_KEY, normalized);
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

