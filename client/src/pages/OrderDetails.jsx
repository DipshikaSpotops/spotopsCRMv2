import { useEffect, useRef, useState, useCallback } from "react";
import NavbarForm from "../components/NavbarForm";
import GlassCard from "../components/ui/GlassCard";
import Pill from "../components/ui/Pill";
import { getStatusColor } from "../utils/formatter";
import useOrderDetails from "../hooks/useOrderDetails";
import OrderSummaryStats from "../components/order/OrderSummaryStats";
import OrderHistory from "../components/order/OrderTabs/OrderHistory";
import CustomerTab from "../components/order/OrderTabs/CustomerTab";
import PartTab from "../components/order/OrderTabs/Part";
import PricingTab from "../components/order/OrderTabs/PricingTab";
import ShippingTab from "../components/order/OrderTabs/ShippingTab";
import SaleNote from "../components/order/OrderTabs/SaleNote";
import CommentBox from "../components/order/OrderTabs/CommentBox";
import YardList from "../components/order/Yards/YardList";
import YardAddModal from "../components/order/modals/YardAddModal";
import YardEditModal from "../components/order/modals/YardEditModal";
import EditYardStatusModal from "../components/order/modals/EditYardStatusModal";
import CardChargedModal from "../components/order/modals/CardChargedModal";
import RefundModal from "../components/order/modals/YardRefundCollectModal";
import CancelOrderModal from "../components/order/modals/CancelOrderModal";
import DisputeOrderModal from "../components/order/modals/DisputeOrderModal";
import RefundOrderModal from "../components/order/modals/RefundOrderModal";
import useOrderRealtime from "../hooks/useOrderRealtime";
import { extractOwn, extractYard } from "../utils/yards";
import API from "../api";

// popup intaed of alert or confirm:
function ConfirmModal({
  open,
  title,
  message,
  confirmText = "Save",
  cancelText = "Close",
  onConfirm,
  onClose,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      {/* Panel */}
      <div className="relative w-[90vw] max-w-md rounded-2xl border border-white/15 bg-[#0b1c34]/90 text-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-md bg-white/10 hover:bg-white/20 border border-white/15"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 text-white/90">
          <p className="leading-relaxed">{message}</p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm?.();
              onClose?.();
            }}
            className="px-5 py-2 rounded-lg bg-white text-[#04356d] font-medium border border-white/20 hover:bg-white/90"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}


function HistoryModal({ open, onClose, timeline, loading, error }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto bg-[#0b1c34] text-white rounded-xl shadow-xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Order History</h2>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20"
          >
            Close
          </button>
        </div>
        <OrderHistory timeline={timeline} loading={loading} error={error} />
      </div>
    </div>
  );
}

/* Toast instead of alert */
function Toast({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-white text-black px-6 py-3 rounded-lg shadow-lg border border-gray-300 z-[200] text-sm font-medium flex items-center gap-4">
      <span>{message}</span>
      <button
        onClick={onClose}
        className="ml-3 px-3 py-1 text-sm font-semibold bg-[#04356d] text-white rounded-md hover:bg-[#021f4b] transition"
      >
        OK
      </button>
    </div>
  );
}

/** Map backend value "Dispute 2" to logical status used in GP rules */
const normalizeStatusForCalc = (raw) => {
  const s = (raw || "").trim();
  if (s === "Dispute 2") return "Dispute after Cancellation";
  return s;
};

const parseMoneyValue = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const str = String(value).trim();
  if (!str) return 0;
  const numeric = Number(str);
  if (!Number.isNaN(numeric)) return numeric;
  const match = str.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
};

const getShippingAmounts = (yard) => {
  const ownRaw = yard?.ownShipping ?? extractOwn(yard?.shippingDetails);
  const yardRaw = yard?.yardShipping ?? extractYard(yard?.shippingDetails);
  const own = parseMoneyValue(ownRaw);
  const yardShip = parseMoneyValue(yardRaw);
  return { own, yard: yardShip, total: own + yardShip };
};

/** Single source of truth for Actual GP math */
const calcActualGP = (orderLike) => {
  if (!orderLike) return 0;

  const sp = parseFloat(orderLike.soldP) || 0;
  const tax = parseFloat(orderLike.salestax) || 0;
  const orderReimb = parseFloat(orderLike.reimbursementAmount) || 0;
  const custRefundedAmount = parseFloat(
    orderLike.custRefundedAmount ||
    orderLike.cancelledRefAmount ||
    orderLike.custRefAmount ||
    0
  );

  const additionalInfo = Array.isArray(orderLike.additionalInfo)
    ? orderLike.additionalInfo
    : [];

  let totalYardSpend = 0;
  let hasCardCharged = false;
  let hasPOCancelled = false;
  let poCancelledWithCardCharged = false;

  additionalInfo.forEach((yard) => {
    const part = parseFloat(yard.partPrice) || 0;
    const others = parseFloat(yard.others) || 0;
    const refund = parseFloat(yard.refundedAmount) || 0;
    const reimb = parseFloat(yard.reimbursementAmount) || 0;

    const shipping = getShippingAmounts(yard);

    const paymentStatus = (yard.paymentStatus || "").trim().toLowerCase();
    const statusStr = (yard.status || "").trim().toLowerCase();
    const isCardCharged = paymentStatus === "card charged";

    if (isCardCharged) {
      totalYardSpend += part + others + shipping.total + reimb - refund;
      hasCardCharged = true;
    }

    if (statusStr.includes("po cancel")) {
      hasPOCancelled = true;
      if (isCardCharged) {
        poCancelledWithCardCharged = true;
      }
    }
  });

  const status = normalizeStatusForCalc(orderLike.orderStatus);

  if (hasCardCharged || poCancelledWithCardCharged) {
    return sp - custRefundedAmount - tax - totalYardSpend - orderReimb;
  } else if (
    ["Order Cancelled", "Refunded"].includes(status) ||
    (hasPOCancelled && !hasCardCharged)
  ) {
    return sp - custRefundedAmount - tax - orderReimb;
  } else if (["Dispute", "Dispute after Cancellation"].includes(status)) {
    return 0 - (totalYardSpend + tax + orderReimb);
  }
  return 0 - orderReimb;
};

export default function OrderDetails() {
  const gpWriteGuardRef = useRef(false);
  const {
    orderNo,
    order,
    loading,
    error,
    timeline,
    yards,
    canAddNewYard,
    refresh,
    mutateOrder,
  } = useOrderDetails();

  const [tab, setTab] = useState("Customer");
  const [actualGPView, setActualGPView] = useState(null);
  const [pendingAlertLabel, setPendingAlertLabel] = useState(null);
  const [expandedYards, setExpandedYards] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [editDetailsIdx, setEditDetailsIdx] = useState(null);
  const [editStatusIdx, setEditStatusIdx] = useState(null);
  const [cardChargedIdx, setCardChargedIdx] = useState(null);
  const [refundIdx, setRefundIdx] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [activeSection, setActiveSection] = useState("support");
  const [toast, setToast] = useState("");
  const [newStatus, setNewStatus] = useState(order?.orderStatus || "");
  const [confirm, setConfirm] = useState({ open: false, title: "", message: "", onConfirm: null });
  const [reimbursementAmount, setReimbursementAmount] = useState("");
  const [reimbursementDate, setReimbursementDate] = useState("");
  const [savingReimbursement, setSavingReimbursement] = useState(false);

  useEffect(() => {
    document.title = orderNo ? `Order No ${orderNo}` : "ORDER DETAILS";
  }, [orderNo]);

  const statusPill = newStatus || order?.orderStatus || "—";

  const STATUS_OPTIONS = [
    { label: "Placed", value: "Placed" },
    { label: "Customer Approved", value: "Customer Approved" },
    { label: "Yard Processing", value: "Yard Processing" },
    { label: "In Transit", value: "In Transit" },
    { label: "Escalation", value: "Escalation" },
    { label: "Order Fulfilled", value: "Order Fulfilled" },
    { label: "Order Cancelled", value: "Order Cancelled" },
    { label: "Dispute", value: "Dispute" },
    { label: "Dispute after Cancellation", value: "Dispute 2" }, // backend value
    { label: "Refunded", value: "Refunded" },
    { label: "Voided", value: "Voided" },
  ];

  const displayStatus = (value) =>
    STATUS_OPTIONS.find((opt) => opt.value === value)?.label || value;

  useEffect(() => {
    if (order?.orderStatus) {
      setNewStatus(order.orderStatus);
    }
  }, [order]);

  useEffect(() => {
    const amount =
      order?.reimbursementAmount !== undefined && order?.reimbursementAmount !== null
        ? String(order.reimbursementAmount)
        : "";
    setReimbursementAmount(amount);

    const orderDate = order?.reimbursementDate
      ? new Date(order.reimbursementDate)
      : null;
    setReimbursementDate(
      orderDate && !Number.isNaN(orderDate.getTime())
        ? orderDate.toISOString().split("T")[0]
        : ""
    );
  }, [order?.reimbursementAmount, order?.reimbursementDate]);

  /** DRY helper: recompute + persist + paint Actual GP */
  const recomputeAndPersistActualGP = async ({ useServer = true } = {}) => {
    try {
      const orderLike = useServer
        ? (await API.get(`/orders/${orderNo}`)).data
        : order;
      const gp = calcActualGP(orderLike);

      setActualGPView(Number(gp).toFixed(2));
      const gpField = document.querySelector("#actualGP");
      if (gpField) gpField.value = Number(gp).toFixed(2);

      await API.put(`/orders/${orderNo}/updateActualGP`, { actualGP: gp });
      gpWriteGuardRef.current = true;

      setToast(`Actual GP recalculated: $${gp.toFixed(2)}`);
      return gp;
    } catch (err) {
      console.error("Error recalculating Actual GP:", err);
      setToast("Failed to recalculate Actual GP.");
      throw err;
    }
  };
  const handleWsEvent = useCallback(async (msg) => {
    if (
      [
        "ORDER_UPDATED",
        "STATUS_CHANGED",
        "YARD_UPDATED",
        "REFUND_SAVED",
        "REIMBURSEMENT_UPDATED",
      ].includes(msg.type)
    ) {
      await refresh(); // let the safety-effect decide if a PUT is needed
    }
  }, [refresh]);
  useOrderRealtime(orderNo, { onEvent: handleWsEvent });
  /** Status change -> save, optimistic GP recalc, then modal/alert logic */
  const handleStatusChange = async (value) => {
    setNewStatus(value);
    try {
      const firstName = localStorage.getItem("firstName");

      await API.put(
        `/orders/${orderNo}/custRefund`,
        { orderStatus: value },
        { params: { firstName } }
      );

      const labelMap = { "Dispute 2": "Dispute after Cancellation" };
      const label = labelMap[value] || value;

      // Optimistic GP recalc using current in-memory order with new status
      const optimisticOrder = { ...order, orderStatus: label };
      const newGP = calcActualGP(optimisticOrder);

      setActualGPView(Number(newGP).toFixed(2));
      const gpField = document.querySelector("#actualGP");
      if (gpField) gpField.value = Number(newGP).toFixed(2);

      API
        .put(`/orders/${orderNo}/updateActualGP`, { actualGP: newGP })
        .then(() => {
          gpWriteGuardRef.current = true;
        })
        .catch((e) =>
          console.error("Failed to persist Actual GP (optimistic)", e)
        );

      // modal + alert timing
      if (value === "Order Cancelled") {
        setPendingAlertLabel(label);
        setShowCancelModal(true);
      } else if (value === "Refunded") {
        setPendingAlertLabel(label);
        setShowRefundModal(true);
      } else if (value === "Dispute") {
        setPendingAlertLabel(label);
        setShowDisputeModal(true);
      } else {
        // No modal (including "Dispute 2")
        await refresh();
        setToast(`Order status updated to ${label}`);
      }
    } catch (err) {
      console.error("Error updating status:", err);
      await recomputeAndPersistActualGP({ useServer: true })
      setToast("Error updating order status");
    }
  };

  const handleSaveReimbursement = async () => {
    if (!orderNo) {
      setToast("Order number not available yet.");
      return;
    }
    const trimmedAmount = reimbursementAmount.trim();
    const numericAmount =
      trimmedAmount === "" ? null : Number(trimmedAmount);

    if (numericAmount !== null && Number.isNaN(numericAmount)) {
      setToast("Enter a valid reimbursement amount.");
      return;
    }

    try {
      setSavingReimbursement(true);
      await API.put(`/orders/${orderNo}/reimbursement`, {
        reimbursementAmount: numericAmount,
        reimbursementDate: reimbursementDate || null,
      });
      if (typeof refresh === "function") {
        await refresh();
      }
      setToast("Reimbursement details saved.");
    } catch (err) {
      console.error("Error saving reimbursement:", err);
      setToast("Failed to save reimbursement details.");
    } finally {
      setSavingReimbursement(false);
    }
  };

  const handleAddYard = async (formData) => {
    try {
      const firstName = localStorage.getItem("firstName") || "Unknown";

      // 1) Check if yard already exists
      const yardCheck = await API.get(`/yards/search`, {
        params: { name: formData.yardName },
      });
      const existingYards = yardCheck.data || [];

      // 2) Add new yard only if it doesn’t exist
      if (existingYards.length === 0) {
        await API.post(`/yards`, {
          yardName: formData.yardName,
          yardRating: formData.yardRating,
          phone: formData.phone,
          altNo: formData.altPhone,
          email: formData.email,
          street: formData.street,
          city: formData.city,
          state: formData.state,
          zipcode: formData.zipcode,
          country: formData.country,
          warranty: formData.warranty,
          yardWarrantyField: formData.yardWarrantyField,
        });
      }

      // 3) Add yard info to this order (updates order.additionalInfo)
      const payload = { ...formData, orderStatus: "Yard Processing" };
      await API.post(
        `/orders/${orderNo}/additionalInfo`,
        payload,
        { params: { firstName } }
      );

      // 4) Refresh data and close modal
      if (typeof refresh === "function") await refresh();
      setShowAdd(false);
      setToast(`Yard ${formData.yardName} added successfully.`);
    } catch (err) {
      console.error("Error adding yard:", err);
      setToast("Error adding yard. Please try again.");
    }
  };

  // Safety net effect: recompute and persist when order changes from server
  useEffect(() => {
    if (!orderNo || !order) return;

    const sp = parseFloat(order.soldP) || 0;
    const tax = parseFloat(order.salestax) || 0;
    const custRefundedAmount = parseFloat(
      order.custRefundedAmount ||
      order.cancelledRefAmount ||
      order.custRefAmount ||
      0
    );
    const orderReimb = parseFloat(order.reimbursementAmount) || 0;

    const orderStatus = normalizeStatusForCalc(order.orderStatus || "");
    const additionalInfo = Array.isArray(order.additionalInfo)
      ? order.additionalInfo
      : [];

    let totalYardSpend = 0;
    let hasCardCharged = false;
    let hasPOCancelled = false;
    let poCancelledWithCardCharged = false;

    additionalInfo.forEach((yard) => {
    const part = parseFloat(yard.partPrice) || 0;
    const others = parseFloat(yard.others) || 0;
    const refund = parseFloat(yard.refundedAmount) || 0;
    const reimb = parseFloat(yard.reimbursementAmount) || 0;

    const shipping = getShippingAmounts(yard);

    const paymentStatus = (yard.paymentStatus || "").trim().toLowerCase();
    const statusStr = (yard.status || "").trim().toLowerCase();
    const isCardCharged = paymentStatus === "card charged";

    if (isCardCharged) {
      totalYardSpend += part + others + shipping.total + reimb - refund;
      hasCardCharged = true;
    }

    if (statusStr.includes("po cancel")) {
      hasPOCancelled = true;
      if (isCardCharged) {
        poCancelledWithCardCharged = true;
      }
    }
  });

    let actualGP = 0;

    if (hasCardCharged || poCancelledWithCardCharged) {
      actualGP = sp - custRefundedAmount - tax - totalYardSpend - orderReimb;
    } else if (
      ["Order Cancelled", "Refunded"].includes(orderStatus) ||
      (hasPOCancelled && !hasCardCharged)
    ) {
      actualGP = sp - custRefundedAmount - tax - orderReimb;
    } else if (
      ["Dispute", "Dispute after Cancellation"].includes(orderStatus)
    ) {
      actualGP = 0 - (totalYardSpend + tax + orderReimb);
    } else {
      actualGP = 0 - orderReimb;
    }

    // Paint view
    setActualGPView(actualGP.toFixed(2));
    const gpField = document.querySelector("#actualGP");
    if (gpField) gpField.value = actualGP.toFixed(2);

    // Skip one cycle if we just wrote optimistically
    const currentGP = parseFloat(order.actualGP) || 0;
    if (gpWriteGuardRef.current) {
      gpWriteGuardRef.current = false;
      return;
    }

    if (Math.abs(currentGP - actualGP) > 0.0001) {
      API
        .put(`/orders/${orderNo}/updateActualGP`, { actualGP })
        .then(async () => {
          await refresh();
          if (Math.abs(actualGP) > 0.009) {
            setToast(`Actual GP updated to $${actualGP.toFixed(2)}`);
            setTimeout(() => setToast(""), 3000);
          } else {
            setToast("");
          }
        })
        .catch((err) => {
          console.error("Error updating actualGP:", err);
          setToast("Failed to update Actual GP");
          setTimeout(() => setToast(""), 3000);
        });
    } else {
      console.log(
        `Skipped Actual GP update — old: ${currentGP}, new: ${actualGP}`
      );
    }
  }, [
    orderNo,
    order,
    order?.orderStatus,
    order?.custRefAmount,
    order?.cancelledRefAmount,
    order?.additionalInfo,
    order?.reimbursementAmount,
  ]);

  // Mirror server value into view on arrival
  useEffect(() => {
    if (!order?.actualGP) return;
    setActualGPView(Number(order.actualGP).toFixed(2));
    const gpField = document.querySelector("#actualGP");
    if (gpField) gpField.value = Number(order.actualGP).toFixed(2);
  }, [order?.actualGP]);

  return (
    <>
      <div className="min-h-screen text-sm text-[#04356d] bg-gradient-to-b from-[#5a6f87] via-[#51358a] to-[#4d6bb9] dark:bg-gradient-to-br dark:from-[#0b1c34] dark:via-[#2b2d68] dark:to-[#4b225e] dark:text-white">
        <NavbarForm />

        <div className="w-full px-4 sm:px-6 lg:px-8 2xl:px-12 pt-24 pb-6 min-h-[calc(100vh-6rem)] overflow-y-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div>
                <h1 className="text-3xl font-bold text-white">
                  ORDER DETAILS{" "}
                  <span className="ml-2 font-normal text-white/80">
                    - {orderNo || "—"}
                  </span>
                </h1>
              </div>

              <div className="flex flex-col items-end gap-3">
                <div className="flex gap-2 items-center">
                  {/* Order History Button */}
                  <button
                    onClick={() => setShowHistory(true)}
                    className="px-3 py-1 rounded-md text-sm bg-white/10 hover:bg-white/20"
                  >
                    View History
                  </button>

                  {/* Status Dropdown */}
                  <select
                    value={newStatus}
                    onChange={(e) => {
                      const selectedValue = e.target.value;
                      const selectedLabel = displayStatus(selectedValue);

                      if (selectedValue === newStatus) return;

                      setConfirm({
                        open: true,
                        title: "Change order status?",
                        message: `Set status to “${selectedLabel}”?`,
                        confirmText: "Change",
                        cancelText: "Keep current",
                        onConfirm: () => handleStatusChange(selectedValue),
                      });
                    }}
                    className="px-2 py-1 rounded-md bg-[#2b2d68] hover:bg-[#090c6c] text-white align-middle border border-white/20 cursor-pointer transition-colors"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* <div className="hidden md:flex gap-2">
                  <Pill className={getStatusColor(statusPill)}>
                    {displayStatus(statusPill)}
                  </Pill>
                </div> */}
              </div>
            </div>

            {/* Top summary; passes live GP override */}
            <OrderSummaryStats order={order} actualGPOverride={actualGPView} />
          </div>

          {/* 3 columns */}
          <div className="grid grid-cols-12 gap-6 2xl:gap-8 items-start min-h-[calc(100vh-13rem)] pb-10">
            {/* LEFT: Order Details */}
            <aside className="col-span-12 xl:col-span-4 flex flex-col gap-4 h-full min-h-[600px]">
              <div className="flex-1 min-h-0">
                <GlassCard
                  className="h-full flex flex-col"
                  title="Order Details"
                  actions={
                    <div className="flex gap-2 rounded-lg p-1 bg-[#29345a]/60 border border-[#43518a]/70 dark:bg-white/10 dark:border-white/20">
                      {["Customer", "Part", "Pricing", "Other Details"].map((t) => (
                        <button
                          key={t}
                          onClick={() => setTab(t)}
                          className={`px-3 py-1.5 rounded-md text-sm transition ${tab === t
                            ? "bg-[#38487a] text-white shadow-inner border border-[#5260a1] dark:bg-[#2b2d68] dark:border-white/30 dark:text-white"
                            : "text-[#d4d9ea] hover:text-white border border-transparent dark:text-white/70 dark:hover:text-white"
                            }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  }
                >
                  {tab === "Customer" && <CustomerTab order={order} />}
                  {tab === "Part" && <PartTab order={order} />}
                  {tab === "Pricing" && <PricingTab order={order} />}
                  {tab === "Other Details" && <ShippingTab order={order} />}
                </GlassCard>
              </div>
              <SaleNote orderNo={order?.orderNo} />
              <div className="p-4 rounded-xl bg-white/10 border border-white/20 text-white backdrop-blur-sm">
                <h3 className="text-base font-semibold mb-3 border-b border-white/20 pb-1">
                  Reimbursement
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-white/80">Amount ($)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={reimbursementAmount}
                      onChange={(e) => setReimbursementAmount(e.target.value)}
                      className="w-full rounded-md bg-white/10 border border-white/30 px-3 py-2 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/60"
                      placeholder="Enter reimbursement amount"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-white/80">Reimbursement Date</span>
                    <input
                      type="date"
                      value={reimbursementDate}
                      onChange={(e) => setReimbursementDate(e.target.value)}
                      className="w-full rounded-md bg-white/10 border border-white/30 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-white/60"
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleSaveReimbursement}
                    disabled={savingReimbursement || !orderNo}
                    className={`px-4 py-2 rounded-md text-sm font-semibold border transition ${
                      savingReimbursement
                        ? "bg-white/20 text-white/70 border-white/20 cursor-not-allowed"
                        : "bg-white text-[#04356d] border-white/30 hover:bg-white/90 dark:bg-[#2b2d68] dark:text-white dark:border-white/20 dark:hover:bg-[#1a1f4b]"
                    }`}
                  >
                    {savingReimbursement ? "Saving..." : "Save Reimbursement"}
                  </button>
                </div>
              </div>
            </aside>

            {/* CENTER: Yards */}
            <section className="col-span-12 xl:col-span-4 flex flex-col gap-4 h-full">
              <div className="flex-1 min-h-0">
                <YardList
                  yards={yards}
                  expandedYards={expandedYards}
                  onToggle={(i) =>
                    setExpandedYards((p) => ({ ...p, [i]: !p[i] }))
                  }
                  canAddNewYard={canAddNewYard}
                  onOpenAdd={() => setShowAdd(true)}
                  onEditStatus={(i) => setEditStatusIdx(i)}
                  onEditDetails={(i) => setEditDetailsIdx(i)}
                  onCardCharged={(i) => setCardChargedIdx(i)}
                  onRefundStatus={(i) => setRefundIdx(i)}
                  onEscalation={(i) => {
                    /* same logic */
                  }}
                />
              </div>
            </section>

            {/* RIGHT: comments */}
            <aside className="col-span-12 xl:col-span-4 flex flex-col gap-4 h-[calc(100vh-240px)] overflow-hidden">
              <GlassCard
                className="h-full flex flex-col"
                title="Support Comments"
                actions={
                  <div className="flex gap-2 rounded-lg p-1 bg-[#29345a]/60 border border-[#43518a]/70 dark:bg-white/10 dark:border-white/20">
                    {yards?.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveSection(i)}
                        className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${
                          activeSection === i
                            ? "bg-white text-[#04356d] border border-white/30 shadow dark:bg-black/20 dark:border-white/30 dark:text-white"
                            : "text-white/80 hover:text-white border border-transparent dark:text-white/70 dark:hover:text-white"
                        }`}
                      >
                        Yard {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => setActiveSection("support")}
                      className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${
                        activeSection === "support"
                          ? "bg-white text-[#04356d] border border-white/30 shadow dark:bg-black/20 dark:border-white/30 dark:text-white"
                          : "text-white/80 hover:text-white border border-transparent dark:text-white/70 dark:hover:text-white"
                      }`}
                    >
                      Order Comments
                    </button>
                  </div>
                }
              >
                <div className="flex-1 min-h-0">
                  <CommentBox
                    orderNo={order?.orderNo}
                    mode={typeof activeSection === "number" ? "yard" : "support"}
                    yardIndex={typeof activeSection === "number" ? activeSection : null}
                    buttonTone="primary"
                    compact
                  />
                </div>
              </GlassCard>
            </aside>
          </div>
        </div>
      </div>

      {/* Modals */}
      <HistoryModal
        open={showHistory}
        onClose={() => setShowHistory(false)}
        timeline={timeline}
        loading={loading}
        error={error}
      />

      <YardAddModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSubmit={handleAddYard}
      />

      <YardEditModal
        open={editDetailsIdx !== null}
        yardIndex={editDetailsIdx}
        initial={yards[editDetailsIdx]}
        order={order}
        orderNo={order?.orderNo}
        onClose={() => setEditDetailsIdx(null)}
        onSubmit={async (updatedOrder) => {
          if (updatedOrder) {
            mutateOrder(updatedOrder);
          }
          await refresh();
          await recomputeAndPersistActualGP({ useServer: true });
        }}
      />

      <EditYardStatusModal
        open={editStatusIdx !== null}
        yardIndex={typeof editStatusIdx === "number" ? editStatusIdx : 0}
        yard={editStatusIdx !== null ? yards[editStatusIdx] : null}
        order={order}
        onClose={() => setEditStatusIdx(null)}
        onSave={() => { }}
      />

      <CardChargedModal
        open={cardChargedIdx !== null}
        onClose={() => setCardChargedIdx(null)}
        onSubmit={refresh}
        orderNo={orderNo}
        yardIndex={cardChargedIdx}
        yard={cardChargedIdx !== null ? yards[cardChargedIdx] : null}
      />

      <RefundModal
        open={refundIdx !== null}
        onClose={() => setRefundIdx(null)}
        onSubmit={refresh}
        orderNo={orderNo}
        yardIndex={refundIdx}
        yard={refundIdx !== null ? yards[refundIdx] : null}
      />

      <CancelOrderModal
        open={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        orderNo={orderNo}
        refresh={async () => {
          await refresh();
          await recomputeAndPersistActualGP({ useServer: true, showAlert: false });
          if (pendingAlertLabel) {
            setToast(`Order status updated to ${pendingAlertLabel}`);
            setPendingAlertLabel(null);
          }
        }}
      />

      <RefundOrderModal
        open={showRefundModal}
        onClose={() => setShowRefundModal(false)}
        orderNo={orderNo}
        refresh={async () => {
          await refresh();
          await recomputeAndPersistActualGP({ useServer: true, showAlert: false });
          if (pendingAlertLabel) {
            alert(`Order status updated to ${pendingAlertLabel}`);
            setPendingAlertLabel(null);
          }
        }}
      />

      <DisputeOrderModal
        open={showDisputeModal}
        onClose={() => setShowDisputeModal(false)}
        orderNo={orderNo}
        refresh={async () => {
          await refresh();
          await recomputeAndPersistActualGP({ useServer: true, showAlert: false });
          if (pendingAlertLabel) {
            alert(`Order status updated to ${pendingAlertLabel}`);
            setPendingAlertLabel(null);
          }
        }}
      />
      <ConfirmModal
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        confirmText={confirm.confirmText}
        cancelText={confirm.cancelText}
        onConfirm={confirm.onConfirm}
        onClose={() => setConfirm((c) => ({ ...c, open: false }))}
      />

      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </>
  );
}
