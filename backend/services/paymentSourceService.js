import PaymentSource from "../models/PaymentSource.js";
import {
  DEFAULT_PAYMENT_SOURCES,
  defaultShowCardInfoForName,
  normalizePaymentSourceName,
} from "../../shared/utils/paymentSources.js";

let syncPromise = null;

export async function syncPaymentSources() {
  const ops = DEFAULT_PAYMENT_SOURCES.map((row) => ({
    updateOne: {
      filter: { name: row.name },
      update: {
        $set: {
          name: row.name,
          showCardInfo: Boolean(row.showCardInfo),
        },
      },
      upsert: true,
    },
  }));

  if (ops.length) {
    await PaymentSource.bulkWrite(ops, { ordered: false });
  }

  const missing = await PaymentSource.find({
    $or: [{ showCardInfo: { $exists: false } }, { showCardInfo: null }],
  }).lean();

  for (const row of missing) {
    await PaymentSource.updateOne(
      { _id: row._id },
      { $set: { showCardInfo: defaultShowCardInfoForName(row.name) } }
    );
  }
}

export async function ensurePaymentSourcesSynced() {
  if (!syncPromise) {
    syncPromise = syncPaymentSources().catch((err) => {
      syncPromise = null;
      throw err;
    });
  }
  return syncPromise;
}

export async function listPaymentSourcesSorted() {
  await ensurePaymentSourcesSynced();
  const sources = await PaymentSource.find().lean();
  return [...sources].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), undefined, {
      sensitivity: "base",
      numeric: true,
    })
  );
}

export async function createPaymentSource({ name, showCardInfo }) {
  await ensurePaymentSourcesSynced();
  const trimmed = String(name || "").trim();
  if (!trimmed) {
    const err = new Error("Payment source name is required");
    err.status = 400;
    throw err;
  }

  const resolvedShow =
    typeof showCardInfo === "boolean"
      ? showCardInfo
      : defaultShowCardInfoForName(trimmed);

  const existing = await PaymentSource.findOne({
    name: {
      $regex: `^\\s*${trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
      $options: "i",
    },
  });
  if (existing) {
    const err = new Error("Payment source already exists");
    err.status = 409;
    throw err;
  }

  return PaymentSource.create({ name: trimmed, showCardInfo: resolvedShow });
}

export async function resolvePaymentSourceShowCardInfo(paymentSourceName) {
  const name = String(paymentSourceName || "").trim();
  if (!name) return false;

  try {
    await ensurePaymentSourcesSynced();
    const rows = await PaymentSource.find().lean();
    const match = rows.find(
      (row) =>
        normalizePaymentSourceName(row.name) === normalizePaymentSourceName(name)
    );
    if (match) return match.showCardInfo !== false;
  } catch (err) {
    console.warn("[paymentSources] resolve failed:", err?.message || err);
  }
  return defaultShowCardInfoForName(name);
}
