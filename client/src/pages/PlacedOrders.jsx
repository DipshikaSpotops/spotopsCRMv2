// src/pages/PlacedOrders.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import { formatInTimeZone } from "date-fns-tz";
import moment from "moment-timezone";
import API from "../api";

const prettyFilterLabel = (filter) => {
  if (!filter) return "";

  // Month/year explicitly given
  if (filter.month && filter.year) {
    return `${filter.month} ${filter.year}`;
  }

  // Start/end range
  if (filter.start && filter.end) {
    const TZ = "America/Chicago";
    const s = moment.tz(filter.start, TZ);
    const e = moment.tz(filter.end, TZ);

    // if the range covers the full month → return "Jul 2025"
    if (
      s.isSame(s.clone().startOf("month")) &&
      e.isSame(s.clone().endOf("month"))
    ) {
      return s.format("MMM YYYY");
    }

    // otherwise fall back to date range
    return `${s.format("D MMM YYYY")} – ${e.format("D MMM YYYY")}`;
  }

  return "";
};

const REASONS = [
  "Same Day",
  "Invoice Not Signed",
  "Personal Reason",
  "Reimbursement",
  "Delay",
  "Defective/Damaged",
  "Ugly Part",
  "Wrong Part",
  "Reprogram/VIN",
  "No Blind Shipping",
  "Dispute",
  "Part Not Available",
  "No Refund",
];

// Dallas "YYYY-MM-DD HH:mm:ss"
const dallasNowParts = () => {
  const now = new Date();
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p = f.formatToParts(now);
  const get = (t) => p.find((x) => x.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
};

// Visible date like "28 May, 2025 14:26" (Dallas)
const toDallasPretty = (dateLike) => {
  if (!dateLike) return "";
  const d = new Date(dateLike);
  if (isNaN(d)) return "";
  return formatInTimeZone(d, "America/Chicago", "do MMM, yyyy HH:mm");
};

const dallasToISO = (value) => {
  const TZ = "America/Chicago";
  if (!value) {
    const nowLocal = dallasNowParts();
    return moment.tz(nowLocal, "YYYY-MM-DD HH:mm:ss", TZ).toISOString();
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return moment.tz(value, "YYYY-MM-DD HH:mm:ss", TZ).toISOString();
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/(\d+)(st|nd|rd|th)/gi, "$1");
    const m = moment.tz(cleaned, "D MMM, YYYY HH:mm", TZ);
    if (m.isValid()) return m.toISOString();
  }
  const m2 = moment.tz(value, TZ);
  return m2.isValid() ? m2.toISOString() : null;
};

const PlacedOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Approve confirm modal
  const [approveTarget, setApproveTarget] = useState(null);
  const [savingApprove, setSavingApprove] = useState(false);

  // Cancel modal + fields + errors
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelForm, setCancelForm] = useState({
    orderedDateDisplay: "",
    cancelledDateDisplay: "",
    reason: REASONS[0],
    amount: "",
  });
  const [cancelErrors, setCancelErrors] = useState({});
  const [savingCancel, setSavingCancel] = useState(false);

  // Search within month/range
  const [searchTerm, setSearchTerm] = useState("");
  // Keep the latest date filter (month/year or start/end) so search reuses it
  const [currentFilter, setCurrentFilter] = useState(null);

  const firstName = localStorage.getItem("firstName") || "";

  // Fetch Orders (date or month/year) + optional q
  const fetchOrders = async (filter = {}) => {
    try {
      setLoading(true);
      let url;
      if (filter.start && filter.end) {
        const qPart = filter.q ? `&q=${encodeURIComponent(filter.q)}` : "";
        url = `/orders/placed?start=${filter.start}&end=${filter.end}${qPart}`;
      } else if (filter.month && filter.year) {
        const qPart = filter.q ? `&q=${encodeURIComponent(filter.q)}` : "";
        url = `/orders/placed?month=${filter.month}&year=${filter.year}${qPart}`;
      } else {
        // default = current Dallas month
        const nowDallas = moment().tz("America/Chicago");
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const month = monthNames[nowDallas.month()];
        const year = nowDallas.year();
        const qPart = filter.q ? `&q=${encodeURIComponent(filter.q)}` : "";
        url = `/orders/placed?month=${month}&year=${year}${qPart}`;
        // also persist default as currentFilter so Enter search works
        setCurrentFilter({ month, year });
      }
      const response = await API.get(url);
      setOrders(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error(err);
      setError("Failed to load orders.");
    } finally {
      setLoading(false);
    }
  };

  // Initial Load → Dallas month/year
  useEffect(() => {
    const nowDallas = moment().tz("America/Chicago");
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[nowDallas.month()];
    const year = nowDallas.year();
    setCurrentFilter({ month, year });
    fetchOrders({ month, year });
  }, []);

  // When UnifiedDatePicker changes, update currentFilter and refetch with the same q
  const handleFilterChange = (filter) => {
    setCurrentFilter(filter);
    fetchOrders({ ...filter, q: searchTerm.trim() || undefined });
  };

  /* ----------------- Search handlers (Enter submits) ----------------- */
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const q = searchTerm.trim();
    const base = currentFilter || {};
    fetchOrders({ ...base, q: q || undefined });
  };

  /* ----------------- Approve flow ----------------- */
  const openApprove = (order) => setApproveTarget(order);

  const confirmApprove = async () => {
    if (!approveTarget || savingApprove) return;
    setSavingApprove(true);

    const orderNo = approveTarget.orderNo;
    const customerApprovedDate = dallasNowParts();

    try {
      await API.put(
        `/orders/${orderNo}?firstName=${encodeURIComponent(firstName)}`,
        {
          orderStatus: "Customer approved",
          firstName,
          customerApprovedDate,
        }
      );
      setOrders((prev) => prev.filter((o) => o.orderNo !== orderNo)); // remove from list
      setApproveTarget(null);
    } catch (err) {
      console.error(err);
      alert("Failed to approve order.");
    } finally {
      setSavingApprove(false);
    }
  };

  /* ----------------- Cancel flow ----------------- */
  const openCancel = (order) => {
    setCancelTarget(order);
    setCancelErrors({});
    setCancelForm({
      orderedDateDisplay: toDallasPretty(order.orderDate),
      cancelledDateDisplay: toDallasPretty(new Date()),
      reason: REASONS[0],
      amount: "",
    });
  };

  // Validate fields (all required)
  const validateCancel = () => {
    const errs = {};
    const iso = dallasToISO(cancelForm.cancelledDateDisplay); // <— single function used

    if (!iso) errs.cancelledDateDisplay = "Enter a valid date like 28 May, 2025 14:26";
    if (!cancelForm.reason) errs.reason = "Reason is required";

    const amtNum = Number(cancelForm.amount);
    if (cancelForm.amount === "" || cancelForm.amount == null) {
      errs.amount = "Amount is required";
    } else if (!Number.isFinite(amtNum) || amtNum < 0) {
      errs.amount = "Amount must be a valid number ≥ 0";
    }

    setCancelErrors(errs);
    return { ok: Object.keys(errs).length === 0, iso };
  };

  const submitCancel = async () => {
    if (!cancelTarget || savingCancel) return;

    const { ok, iso } = validateCancel();
    if (!ok) return;

    const orderNo = cancelTarget.orderNo;
    setSavingCancel(true);

    try {
      // 1) Save the cancellation + status
      await API.put(
        `/orders/${orderNo}/custRefund`,
        {
          cancelledDate: iso,
          cancelledRefAmount: cancelForm.amount,
          orderNo,
          cancellationReason: cancelForm.reason,
          orderStatus: "Order Cancelled",
        },
        { params: { firstName } }
      );

      // 2) Send the cancellation email
      const { data, status } = await API.post(
        `/emails/order-cancel/${orderNo}`,
        null,
        { params: { firstName, cancelledRefAmount: cancelForm.amount || "" } }
      );

      // Alert only when the email request succeeds
      if (status >= 200 && status < 300) {
        window.alert(data?.message || "Cancellation email sent successfully");
      }

      // 3) Clean up UI
      setOrders((prev) => prev.filter((o) => o.orderNo !== orderNo));
      setCancelTarget(null);
    } catch (err) {
      console.error(err);
      const serverMsg = err?.response?.data?.message || err.message;
      window.alert(`An error occurred: ${serverMsg}`);
    } finally {
      setSavingCancel(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-white">⏳ Loading orders...</div>;
  if (error) return <div className="p-6 text-center text-red-300">{error}</div>;

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      {/* Header */}
<div className="flex flex-col sm:flex-row sm:items-start justify-between mb-6 gap-3">
  {/* Left: Title + totals (stacked) */}
  <div className="flex items-start gap-6">
    <div>
      <h2 className="text-3xl font-bold text-white underline decoration-1 leading-tight -mb-0.5">
        Placed Orders
      </h2>
      <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-4">
        <p className="text-sm text-white/70">
          Total Orders: <strong>{orders.length}</strong>
        </p>
        {currentFilter && (
          <span className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/15 px-3 py-1 text-xs text-white/70">
            {prettyFilterLabel(currentFilter)}
          </span>
        )}
      </div>
    </div>
  </div>

  {/* Right: Search + Date filter (side by side) */}
  <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
  <form onSubmit={handleSearchSubmit} className="relative flex w-full sm:w-auto">
    <input
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder="Search...(press Enter)"
      className="px-3 py-2 pr-9 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/30 min-w-[260px]"
      aria-label="Search placed orders"
    />
    {/* Clear button inside input */}
    {searchTerm && (
      <button
        type="button"
        onClick={() => {
          setSearchTerm("");
          // refresh results without search term
          const base = currentFilter || {};
          fetchOrders({ ...base, q: undefined });
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
        aria-label="Clear search"
      >
        ×
      </button>
    )}
    <input type="submit" hidden />
  </form>

  <div className="shrink-0">
    <UnifiedDatePicker onFilterChange={handleFilterChange} />
  </div>
</div>
</div>

      {/* Orders */}
      {orders.length === 0 ? (
        <div className="text-gray-200"> {currentFilter
      ? "No results found in this month."
      : "No placed orders found."}</div>
      ) : (
        <div className="grid gap-5 justify-center grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
          {orders.map((order) => (
            <div
              key={order._id}
              className="w-[280px] bg-white/20 backdrop-blur-lg rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-5 border border-white/30"
            >
              {/* Header */}
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm text-white/80">Order No</span>
                <span
                  className={`text-xs px-3 py-1 rounded-full ${
                    order.orderStatus === "Placed"
                      ? "bg-green-400/40 text-green-100"
                      : order.orderStatus?.toLowerCase()?.includes("cancel")
                      ? "bg-red-400/40 text-red-100"
                      : "bg-gray-400/40 text-gray-100"
                  }`}
                >
                  {order.orderStatus}
                </span>
              </div>

              {/* Order Number + Copy */}
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-white">{order.orderNo}</h3>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(String(order.orderNo || ""))}
                  className="text-xs px-2 py-1 rounded-md border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition"
                  title="Copy order number"
                >
                  Copy
                </button>
              </div>

              {/* Details – same font, tighter spacing */}
              <div className="space-y-1 text-sm text-white/80">
                <div>
                  <b>Date:</b> {toDallasPretty(order.orderDate)}
                </div>
                <div>
                  <b>Sales:</b> {order.salesAgent || "N/A"}
                </div>
                <div className="truncate" title={order.customerName || `${order.fName || ""} ${order.lName || ""}`}>
                  <b>Cust:</b>{" "}
                  {order.customerName || `${order.fName || ""} ${order.lName || ""}` || "N/A"}
                </div>
              </div>

              {/* Actions – smaller margin + padding only */}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => openApprove(order)}
                  className="flex-1 bg-gradient-to-r from-[#6c9e6a] to-[#8dcb8d] text-white font-medium px-2.5 py-1.5 rounded-md shadow hover:from-[#39a872] hover:to-[#5eb663] transition-all"
                >
                  Approve
                </button>
                <button
                  onClick={() => openCancel(order)}
                  className="flex-1 bg-gradient-to-r from-[#b58686] to-[#a63333] text-white font-medium px-2.5 py-1.5 rounded-md shadow hover:from-red-500 hover:to-red-600 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== Approve Confirm Modal (glassy) ===== */}
      {approveTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center">
          <div className="absolute inset-0 bg-slate-900/65 backdrop-blur-sm" onClick={() => setApproveTarget(null)} />
          <div
            className="
              relative w-[420px] max-w-[95vw] rounded-2xl p-6
              bg-white/12
              border border-white/20
              ring-1 ring-inset ring-white/15
              backdrop-blur-xl
              text-white
            "
          >
            <button
              className="absolute top-2 right-3 rounded-full p-1.5 hover:bg-white/10 text-white/80"
              onClick={() => setApproveTarget(null)}
              aria-label="Close"
            >
              ×
            </button>
            <h3 className="text-lg font-semibold mb-2 text-center">
              Approve Order
            </h3>
            <p className="text-white/80 text-center">
              Are you sure you want to approve{" "}
              <span className="font-semibold">{approveTarget.orderNo}</span>?
            </p>
            <div className="mt-5 flex gap-3 justify-center">
              <button
                onClick={confirmApprove}
                disabled={savingApprove}
                className="px-4 py-2 rounded-lg bg-emerald-500 text-white font-medium shadow hover:bg-emerald-400 disabled:opacity-60"
              >
                {savingApprove ? "Approving…" : "Yes, Approve"}
              </button>
              <button
                onClick={() => setApproveTarget(null)}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/15"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Cancel Modal (glassy) ===== */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center">
          <div className="absolute inset-0 bg-slate-900/65 backdrop-blur-sm" onClick={() => setCancelTarget(null)} />
          <div
            className="
              relative w-[720px] max-w-[95vw] rounded-2xl p-6
              bg-white/12
              border border-white/20
              ring-1 ring-inset ring-white/15
              backdrop-blur-xl
              text-white
            "
          >
            <button
              className="absolute top-2 right-3 rounded-full p-1.5 hover:bg-white/10 text-white/80"
              onClick={() => setCancelTarget(null)}
              aria-label="Close"
            >
              ×
            </button>

            <h3 className="text-lg font-semibold mb-4 text-left underline decoration-1">
              Order Cancellation
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-white/80 mb-1">
                  Date of Order
                </label>
                <input
                  value={cancelForm.orderedDateDisplay}
                  readOnly
                  className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/20 text-white"
                />
              </div>

              <div>
                <label className="block text-sm text-white/80 mb-1">
                  Date of Cancellation <span className="text-red-300">*</span>
                </label>
                <input
                  value={cancelForm.cancelledDateDisplay}
                  onChange={(e) =>
                    setCancelForm((p) => ({ ...p, cancelledDateDisplay: e.target.value }))
                  }
                  placeholder="28 May, 2025 14:26"
                  className={`w-full rounded-lg px-3 py-2 bg-white/10 border ${
                    cancelErrors.cancelledDateDisplay ? "border-red-400" : "border-white/20"
                  } text-white`}
                  aria-invalid={!!cancelErrors.cancelledDateDisplay}
                />
                {cancelErrors.cancelledDateDisplay && (
                  <p className="text-red-300 text-xs mt-1">{cancelErrors.cancelledDateDisplay}</p>
                )}
              </div>

              <div>
                <label className="block text-sm text-white/80 mb-1">
                  Reason <span className="text-red-300">*</span>
                </label>
                <select
                  value={cancelForm.reason}
                  onChange={(e) => setCancelForm((p) => ({ ...p, reason: e.target.value }))}
                  className={`w-full rounded-lg px-3 py-2 bg-white/10 border ${
                    cancelErrors.reason ? "border-red-400" : "border-white/20"
                  } text-white`}
                >
                  {REASONS.map((r) => (
                    <option key={r} value={r} className="text-black">
                      {r}
                    </option>
                  ))}
                </select>
                {cancelErrors.reason && (
                  <p className="text-red-300 text-xs mt-1">{cancelErrors.reason}</p>
                )}
              </div>

              <div>
                <label className="block text-sm text-white/80 mb-1">
                  Refunded Amount <span className="text-red-300">*</span>
                </label>
                <input
                  type="number"
                  value={cancelForm.amount}
                  onChange={(e) => setCancelForm((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                  className={`w-full rounded-lg px-3 py-2 bg-white/10 border ${
                    cancelErrors.amount ? "border-red-400" : "border-white/20"
                  } text-white`}
                  aria-invalid={!!cancelErrors.amount}
                />
                {cancelErrors.amount && (
                  <p className="text-red-300 text-xs mt-1">{cancelErrors.amount}</p>
                )}
              </div>
            </div>

            <div className="mt-5 flex gap-3 justify-start">
              <button
                onClick={submitCancel}
                disabled={savingCancel}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
              >
                {savingCancel ? "Saving…" : "Save and Send Email"}
              </button>
              <button
                onClick={() => setCancelTarget(null)}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/15"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlacedOrders;
