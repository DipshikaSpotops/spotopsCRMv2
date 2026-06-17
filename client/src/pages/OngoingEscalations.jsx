// src/pages/OngoingEscalationOrders.jsx
import React, { useEffect } from "react";
import OrdersTable from "../components/OrdersTable";
import useOrdersRealtime from "../hooks/useOrdersRealtime";
import useBrand from "../hooks/useBrand";
import { formatInTimeZone } from "date-fns-tz";
import {
  enrichOrderWithEscalationFields,
  parseFirstEscalationMoment,
} from "../utils/escalationHistory";

const TZ = "America/Chicago";

/* ---------- Helpers ---------- */
/**
 * Format order status for display
 * Transforms "Dispute 2" to "Dispute AC"
 */
function formatOrderStatus(status) {
  if (!status) return "";
  if (status === "Dispute 2") return "Dispute AC";
  return status;
}

// Unique storage keys for this page so it doesn't collide with others
const STORAGE_KEYS = {
  page:   "ongoingEsc_page",
  search: "ongoingEsc_search",
  filter: "ongoingEsc_filter",
  hilite: "ongoingEsc_hilite",
};

// Columns for this page
const COLUMNS = [
  { key: "orderDate",        label: "Order Date" },
  { key: "escDate",          label: "Esc Date" },
  { key: "orderNo",          label: "Order No" },
  { key: "pReq",             label: "Part Name" },
  { key: "salesAgent",       label: "Sales Agent" },
  { key: "customerName",     label: "Customer Name" },
  { key: "escalationStatus", label: "Escalation Status" },
  { key: "lastComment",      label: "Last Comment" },
  { key: "escDays",          label: "No of Days" },
  { key: "orderStatus",      label: "Order Status" },
];

function formatEscDate(row) {
  const date = row?._escDate;
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return formatInTimeZone(d, TZ, "do MMM, yyyy");
}

// Page-specific cell rendering (derive a couple of fields)
function renderCell(row, key, formatDateSafe /*, currency */) {
  switch (key) {
    case "orderDate":
      return formatDateSafe(row.orderDate);

    case "escDate":
      return formatEscDate(row);

    case "orderNo":
      return row.orderNo || "—";

    case "pReq":
      return row.pReq || row.partName || "N/A";

    case "salesAgent":
      return row.salesAgent || "N/A";

    case "customerName": {
      const name = row.customerName || `${row.fName || ""} ${row.lName || ""}`.trim();
      return name || "N/A";
    }

    case "escalationStatus": {
      // derive from first yard’s escTicked flag
      const esc =
        Array.isArray(row.additionalInfo) && row.additionalInfo[0]?.escTicked === "Yes"
          ? "Yes"
          : "";
      return esc;
    }

    case "lastComment": {
      const yards = Array.isArray(row.additionalInfo) ? row.additionalInfo : [];
      const lines = [];
      const lineItems = [];

      yards.forEach((yard, idx) => {
        const status = String(yard?.status || "").trim().toLowerCase();
        if (status !== "escalation") return;

        const notes = Array.isArray(yard?.notes) ? yard.notes : [];
        const lastNote = notes.length ? notes[notes.length - 1] : "—";
        lines.push(`Yard ${idx + 1}: ${lastNote}`);
        lineItems.push({
          label: `Yard ${idx + 1}:`,
          text: lastNote,
        });
      });

      const supportNotes = Array.isArray(row.supportNotes) ? row.supportNotes : [];
      if (supportNotes.length) {
        const orderComment = supportNotes[supportNotes.length - 1];
        lines.push(`Order comment: ${orderComment}`);
        lineItems.push({
          label: "Order comment:",
          text: orderComment,
        });
      }

      const displayText = lines.length ? lines.join("\n") : "—";
      return (
        <div
          className="break-words leading-5 min-w-[260px]"
          title={displayText}
        >
          {lineItems.length ? (
            lineItems.map((item, idx) => (
              <div key={`${item.label}-${idx}`} className="whitespace-pre-line">
                <span className="underline font-medium">{item.label}</span>{" "}
                <span>{item.text}</span>
              </div>
            ))
          ) : (
            "—"
          )}
        </div>
      );
    }

    case "escDays":
      return row._escDays != null ? String(row._escDays) : "—";

    case "orderStatus":
      return formatOrderStatus(row.orderStatus) || "";

    default:
      return row[key] ?? "—";
  }
}

function mapRows(orders) {
  return (Array.isArray(orders) ? orders : []).map(enrichOrderWithEscalationFields);
}

function getSortValue(row, key) {
  if (key === "escDate") {
    const m = parseFirstEscalationMoment(row?.orderHistory);
    return m ? m.valueOf() : 0;
  }
  if (key === "escDays") {
    return row._escDays != null ? row._escDays : -1;
  }
  return undefined;
}

/** Orange/red shades aligned with yard miles badges and attendance colors. */
function getCellClassName(row, key) {
  if (key !== "escDays") return "";
  const days = row._escDays;
  if (days == null || days <= 3) return "";
  if (days > 5) return "bg-[#b91c1c] text-white font-semibold";
  return "bg-[#ea580c] text-white font-semibold";
}

// Keep View button behavior consistent with other pages
const navigateTo = (row) => `/order-details?orderNo=${encodeURIComponent(row.orderNo)}`;

export default function OngoingEscalationOrders() {
  const brand = useBrand(); // 50STARS / PROLANE
  // Realtime: refetch ongoing escalation list when orders change
  useOrdersRealtime({
    enabled: true,
    onOrderCreated: () => {
      if (window.__ordersTableRefs?.ongoingEscalations?.refetch) {
        window.__ordersTableRefs.ongoingEscalations.refetch();
      }
    },
    onOrderUpdated: () => {
      if (window.__ordersTableRefs?.ongoingEscalations?.refetch) {
        window.__ordersTableRefs.ongoingEscalations.refetch();
      }
    },
  });

  // Refetch when brand changes
  useEffect(() => {
    if (window.__ordersTableRefs?.ongoingEscalations?.refetch) {
      window.__ordersTableRefs.ongoingEscalations.refetch();
    }
  }, [brand]);

  return (
    <OrdersTable
      title="Ongoing Escalations"
      endpoint="/orders/ongoingEscalationOrders"
      storageKeys={STORAGE_KEYS}
      columns={COLUMNS}
      renderCell={renderCell}
      mapRows={mapRows}
      getSortValue={getSortValue}
      getCellClassName={getCellClassName}
      showTotalsButton={false}   // hide totals eye for this page
      showAgentFilter={false}    // flip to true if you want Admin agent narrowing
      showGP={false}             // no GP math needed here
      navigateTo={navigateTo}
      tableId="ongoingEscalations"
    />
  );
}
