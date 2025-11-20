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
import YardEscalationModal from "../components/order/modals/YardEscalationModal";
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
      <div className="relative w-[90vw] max-w-md rounded-2xl border border-gray-200 bg-blue-50 text-[#09325d] shadow-2xl overflow-hidden dark:border-white/15 dark:bg-[#0b1c34]/90 dark:text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/10">
          <h3 className="text-lg font-semibold text-[#09325d] dark:text-white">{title}</h3>
          <button
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-md bg-blue-200 hover:bg-blue-300 border border-blue-300 text-blue-800 shadow-sm hover:shadow-md transition-all dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/15 dark:text-white"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 text-[#09325d] dark:text-white/90">
          <p className="leading-relaxed">{message}</p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 dark:border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-blue-200 hover:bg-blue-300 border border-blue-300 text-blue-800 shadow-sm hover:shadow-md transition-all dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/20 dark:text-white"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm?.();
              onClose?.();
            }}
            className="px-5 py-2 rounded-lg bg-[#04356d] text-white font-medium border border-[#04356d] hover:bg-[#021f4b] shadow-sm dark:bg-[#2b2d68] dark:border-white/20 dark:hover:bg-[#1a1f4b]"
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
      <div className="w-full max-w-lg max-h-[80vh] bg-blue-50 text-[#09325d] rounded-xl shadow-xl overflow-hidden flex flex-col dark:bg-[#0b1c34] dark:text-white">
        <div className="flex justify-between items-center mb-4 p-6 pb-4">
          <h2 className="text-xl font-bold text-[#09325d] dark:text-white">Order History</h2>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-md bg-blue-200 hover:bg-blue-300 border border-blue-300 text-blue-800 shadow-sm hover:shadow-md transition-all dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/20 dark:text-white"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <OrderHistory timeline={timeline} loading={loading} error={error} />
        </div>
      </div>
    </div>
  );
}

/* Toast instead of alert */
function Toast({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-gray-50 text-black px-6 py-3 rounded-lg shadow-lg border border-gray-300 z-[200] text-sm font-medium flex items-center gap-4">
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

/** Single source of truth for Actual GP math */
const calcActualGP = (orderLike) => {
  if (!orderLike) return 0;

  const sp = parseFloat(orderLike.soldP) || 0;
  const tax = parseFloat(orderLike.salestax) || 0;
  const spMinusTax =
    parseFloat(orderLike.spMinusTax) || sp - tax;
  const custRefundedAmount = parseFloat(
    orderLike.custRefundedAmount ||
    orderLike.cancelledRefAmount ||
    orderLike.custRefAmount ||
    0
  );

  const additionalInfo = Array.isArray(orderLike.additionalInfo)
    ? orderLike.additionalInfo
    : [];

  const status = normalizeStatusForCalc(orderLike.orderStatus);
  const isDispute = ["Dispute", "Dispute after Cancellation"].includes(status);
  const isCancelled = status === "Order Cancelled";
  const isRefunded = status === "Refunded";
  const isCancelledOrRefunded = isCancelled || isRefunded;

  // CASE 1 — No yards at all
  if (!additionalInfo.length) {
    if (isDispute) {
      return 0 - tax;
    } else if (isRefunded) {
      // For refunded orders with no yards - include custRefundedAmount
      return sp - custRefundedAmount - tax;
    } else if (isCancelled) {
      // For cancelled orders with no yards - don't include custRefundedAmount
      return sp - tax;
    } else {
      return 0;
    }
  }

  let totalSum = 0;

  // CASE 2 — Iterate through yards and only calculate totalSum from "Card charged" yards
  additionalInfo.forEach((yard) => {
    const paymentStatus = (yard.paymentStatus || "").trim();

    // Only calculate yardSpent if paymentStatus is "Card charged"
    if (paymentStatus === "Card charged") {
      const yardPP = parseFloat(yard.partPrice) || 0;
      const yardOSorYS = yard.shippingDetails || "";
      let shippingValueYard = 0;
      if (yardOSorYS && yardOSorYS.includes(":")) {
        const [, valuePart] = yardOSorYS.split(":");
        shippingValueYard = parseFloat(valuePart) || 0;
      }

      const yardOthers = parseFloat(yard.others) || 0;
      const escOwnShipReturn = parseFloat(yard.custOwnShippingReturn) || 0;
      const escOwnShipReplacement =
        parseFloat(yard.custOwnShipReplacement) || 0;
      const yardOwnShippingReplacement =
        parseFloat(yard.yardOwnShipping) || 0;
      const yardRefundAmount = parseFloat(yard.refundedAmount) || 0;
      const escReimbursement = parseFloat(yard.reimbursementAmount) || 0;

      const yardSpent =
        yardPP +
        shippingValueYard +
        yardOthers +
        escOwnShipReturn +
        escOwnShipReplacement +
        yardOwnShippingReplacement +
        escReimbursement -
        yardRefundAmount;

      totalSum += yardSpent;
    }
  });

  let actualGP = 0;

  // CASE 3 — All yards not charged
  const allYardsNotCharged = additionalInfo.every((yard) => {
    const paymentStatus = (yard.paymentStatus || "").trim();
    return !paymentStatus || paymentStatus === "Card not charged";
  });

  if (allYardsNotCharged) {
    // All yards not charged
    if (isDispute) {
      actualGP = 0 - tax;
    } else if (isRefunded) {
      // Refunded orders with all yards not charged - include custRefundedAmount
      actualGP = sp - custRefundedAmount - tax;
    } else if (isCancelled) {
      // Cancelled orders with all yards not charged - don't include custRefundedAmount
      actualGP = sp - tax;
    } else {
      // Normal order with all yards not charged
      actualGP = 0;
    }
  } else if (totalSum > 0) {
    // At least one yard is "Card charged"
    if (isDispute) {
      actualGP = 0 - (totalSum + tax);
    } else if (isRefunded) {
      // Refunded with at least one "Card charged" yard - include custRefundedAmount
      const subtractRefund = spMinusTax - custRefundedAmount;
      actualGP = subtractRefund - totalSum;
    } else if (isCancelled) {
      // Cancelled with at least one "Card charged" yard - don't include custRefundedAmount
      actualGP = spMinusTax - totalSum;
    } else {
      // Normal order with at least one "Card charged" yard
      const subtractRefund = spMinusTax - custRefundedAmount;
      actualGP = subtractRefund - totalSum;
    }
  } else {
    // Mixed case: some yards might have other statuses, but none are charged
    if (isDispute) {
      actualGP = 0 - tax;
    } else if (isRefunded) {
      // Refunded with mixed statuses (none charged) - include custRefundedAmount
      actualGP = sp - custRefundedAmount - tax;
    } else if (isCancelled) {
      // Cancelled with mixed statuses (none charged) - don't include custRefundedAmount
      actualGP = sp - tax;
    } else {
      // Normal order with mixed statuses (none charged)
      actualGP = 0;
    }
  }

  return Number.isFinite(actualGP) ? actualGP : 0;
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
  const [escalationIdx, setEscalationIdx] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [activeSection, setActiveSection] = useState("support");

  const focusCommentsOnYard = useCallback(
    (yardIdx) => {
      if (typeof yardIdx === "number" && yardIdx >= 0) {
        setActiveSection(yardIdx);
      }
    },
    []
  );
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
      const firstName = localStorage.getItem("firstName");
      const orderLike = useServer
        ? (await API.get(`/orders/${orderNo}`)).data
        : order;
      const gp = calcActualGP(orderLike);
      const previousGP = parseFloat(orderLike?.actualGP ?? "0") || 0;
      const hasMeaningfulChange = Math.abs(previousGP - gp) > 0.0001;

      setActualGPView(Number(gp).toFixed(2));
      const gpField = document.querySelector("#actualGP");
      if (gpField) gpField.value = Number(gp).toFixed(2);

      if (hasMeaningfulChange) {
        await API.put(
          `/orders/${orderNo}/updateActualGP`,
          { actualGP: gp },
          { params: { firstName } }
        );
        gpWriteGuardRef.current = true;
        setToast(`Actual GP recalculated: $${gp.toFixed(2)}`);
      } else {
        console.log(
          `Skipped Actual GP update — unchanged at ${gp.toFixed(2)}`
        );
      }

      return gp;
    } catch (err) {
      console.error("Error recalculating Actual GP:", err);
      setToast("Failed to recalculate Actual GP.");
      throw err;
    }
  };

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
        .put(
          `/orders/${orderNo}/updateActualGP`,
          { actualGP: newGP },
          { params: { firstName } }
        )
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
        await refresh();
        await recomputeAndPersistActualGP({ useServer: true });
        if (value === "Dispute") {
          try {
            await refresh();
            await recomputeAndPersistActualGP({ useServer: true });
          } catch (e) {
            console.warn("GP recompute after dispute failed:", e);
          }
        }
        setToast(`Order status updated to ${label}`);
      }
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Error updating order status";
      console.error("Error updating status:", err);
      await recomputeAndPersistActualGP({ useServer: true });
      setToast(message);
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
      const firstName = localStorage.getItem("firstName") || "System";
      if (Array.isArray(yards)) {
        const reimbursementIdx = yards.findIndex(
          (y) => String(y?.escalationProcess || "").trim() === "Reimbursement"
        );
        if (reimbursementIdx >= 0) {
          try {
            await API.put(
              `/orderAndYardStatus/${orderNo}`,
              {
                orderStatus: "Order Fulfilled",
                yardStatus: "Part delivered",
                yardIndex: reimbursementIdx + 1,
              },
              { params: { firstName } }
            );
          } catch (statusErr) {
            console.error("Error updating reimbursement order status:", statusErr);
          }
        }
      }
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

      // 2) Add new yard only if it doesn't exist
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

    const actualGP = calcActualGP(order);

    setActualGPView(actualGP.toFixed(2));
    const gpField = document.querySelector("#actualGP");
    if (gpField) gpField.value = actualGP.toFixed(2);

    const currentGP = parseFloat(order.actualGP) || 0;
    if (gpWriteGuardRef.current) {
      gpWriteGuardRef.current = false;
      return;
    }

    // Only update if there's a meaningful difference AND at least one yard has "Card charged"
    // OR if it's a cancelled/refunded/dispute order (which have special GP calculations)
    const hasCardChargedYard = Array.isArray(order.additionalInfo) && 
      order.additionalInfo.some((yard) => {
        const paymentStatus = (yard.paymentStatus || "").trim();
        return paymentStatus === "Card charged";
      });

    const status = normalizeStatusForCalc(order.orderStatus);
    const isDispute = ["Dispute", "Dispute after Cancellation"].includes(status);
    const isCancelledOrRefunded = status === "Order Cancelled" || status === "Refunded";
    const hasSpecialStatus = isDispute || isCancelledOrRefunded;

    // Only auto-update if:
    // 1. There's a meaningful difference, AND
    // 2. Either there's a "Card charged" yard, OR
    //    it's a cancelled/refunded/dispute order (which need special GP calculations), OR
    //    the currentGP is non-zero (meaning it was previously calculated and might need correction)
    const shouldUpdate = Math.abs(currentGP - actualGP) > 0.0001 && 
      (hasCardChargedYard || hasSpecialStatus || Math.abs(currentGP) > 0.0001);

    if (shouldUpdate) {
      const firstName = localStorage.getItem("firstName");
      API.put(
        `/orders/${orderNo}/updateActualGP`,
        { actualGP },
        { params: { firstName } }
      )
        .then(async () => {
          await refresh();
          if (Math.abs(actualGP) > 0.009) {
            setToast(`Actual GP updated to $${actualGP.toFixed(2)}`);
            setTimeout(() => setToast(""), 3000);
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
    refresh,
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
      <style>{`
        /* Light Mode - High Contrast Colors for All Elements */
        
        /* Page Background - Soft gradient */
        html:not(.dark) .order-details-page {
          background: linear-gradient(135deg, #e0f2fe 0%, #dbeafe 30%, #bfdbfe 70%, #93c5fd 100%) !important;
          background-attachment: fixed;
        }
        
        /* GlassCard Headers - Very light background with darker text for better contrast */
        html:not(.dark) .order-details-page section[class*="rounded-2xl"] > header {
          background: rgba(240, 249, 255, 0.9) !important;
          border-bottom: 2px solid rgba(59, 130, 246, 0.3) !important;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        html:not(.dark) .order-details-page section[class*="rounded-2xl"] > header h3 {
          color: #0f172a !important;
          font-weight: 700 !important;
          font-size: 1rem !important;
        }
        
        /* GlassCard Body - Very light blue background for all sections */
        html:not(.dark) .order-details-page section[class*="rounded-2xl"] {
          background: rgba(240, 249, 255, 0.85) !important;
          border: 1.5px solid rgba(59, 130, 246, 0.25) !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }
        
        /* Apply Poppins font to the entire page */
        html:not(.dark) .order-details-page {
          font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
        }
        
        /* Labels - Soft dark gray for better readability (reduces eye strain) */
        html:not(.dark) .order-details-page label span {
          color: #1a1a1a !important;
          font-weight: 600 !important;
          font-size: 0.875rem !important;
        }
        
        /* Input Fields - Light blue background, blue border, soft dark gray text */
        html:not(.dark) .order-details-page input[type="text"],
        html:not(.dark) .order-details-page input[type="email"],
        html:not(.dark) .order-details-page input[type="number"],
        html:not(.dark) .order-details-page input[type="tel"],
        html:not(.dark) .order-details-page input[type="date"],
        html:not(.dark) .order-details-page textarea,
        html:not(.dark) .order-details-page select {
          background: #e0f2fe !important;
          border: 1.5px solid rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
          font-size: 0.875rem !important;
        }
        html:not(.dark) .order-details-page input[type="text"]:focus,
        html:not(.dark) .order-details-page input[type="email"]:focus,
        html:not(.dark) .order-details-page input[type="number"]:focus,
        html:not(.dark) .order-details-page input[type="tel"]:focus,
        html:not(.dark) .order-details-page input[type="date"]:focus,
        html:not(.dark) .order-details-page textarea:focus,
        html:not(.dark) .order-details-page select:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15) !important;
          background: #ffffff !important;
        }
        
        /* Readonly inputs - Light blue background, soft dark gray text */
        html:not(.dark) .order-details-page input[readonly] {
          background: #e0f2fe !important;
          color: #1a1a1a !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
        }
        
        /* All span text in labels and fields - Soft dark gray for better readability */
        html:not(.dark) .order-details-page span[class*="text-[#09325d]"] {
          color: #1a1a1a !important;
        }
        
        /* Field labels and text spans - Soft dark gray */
        html:not(.dark) .order-details-page .flex.flex-col span,
        html:not(.dark) .order-details-page .grid span:not([class*="text-white"]) {
          color: #1a1a1a !important;
        }
        
        /* Input field text color - Soft dark gray */
        html:not(.dark) .order-details-page input[class*="text-[#09325d]"] {
          color: #1a1a1a !important;
        }
        
        /* Primary Buttons - Dark blue with white text */
        html:not(.dark) .order-details-page button[class*="bg-[#04356d]"] {
          background: #1e40af !important;
          color: #ffffff !important;
          border-color: #1e40af !important;
        }
        html:not(.dark) .order-details-page button[class*="bg-[#04356d]"]:hover:not(:disabled) {
          background: #1e3a8a !important;
          border-color: #1e3a8a !important;
        }
        
        /* Secondary Buttons - Light blue with darker text for better contrast */
        html:not(.dark) .order-details-page button[class*="bg-blue-50"],
        html:not(.dark) .order-details-page button[class*="bg-blue-100"],
        html:not(.dark) .order-details-page button[class*="bg-blue-200"] {
          background: #dbeafe !important;
          color: #1a1a1a !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          font-size: 0.875rem !important; /* text-sm */
          font-weight: 400 !important;
          font-family: inherit !important;
        }
        html:not(.dark) .order-details-page button[class*="bg-blue-50"]:hover:not(:disabled),
        html:not(.dark) .order-details-page button[class*="bg-blue-100"]:hover:not(:disabled),
        html:not(.dark) .order-details-page button[class*="bg-blue-200"]:hover:not(:disabled) {
          background: #bfdbfe !important;
          border-color: rgba(59, 130, 246, 0.5) !important;
        }
        
        /* Save Reimbursement and Action Buttons - Medium blue with white text */
        html:not(.dark) .order-details-page button[class*="bg-blue-200"]:not([class*="bg-blue-50"]):not([class*="bg-blue-100"]):not([class*="bg-sky"]) {
          background: #3b82f6 !important;
          color: #ffffff !important;
          border-color: #3b82f6 !important;
        }
        html:not(.dark) .order-details-page button[class*="bg-blue-200"]:not([class*="bg-blue-50"]):not([class*="bg-blue-100"]):not([class*="bg-sky"]):hover:not(:disabled) {
          background: #2563eb !important;
          border-color: #2563eb !important;
        }
        
        /* Disabled buttons */
        html:not(.dark) .order-details-page button:disabled {
          background: #e5e7eb !important;
          color: #9ca3af !important;
          border-color: #d1d5db !important;
          cursor: not-allowed !important;
        }
        
        /* Tab Buttons - Active state */
        html:not(.dark) .order-details-page .flex.gap-2.rounded-lg button[class*="bg-[#04356d]"] {
          background: #1e40af !important;
          color: #ffffff !important;
        }
        html:not(.dark) .order-details-page .flex.gap-2.rounded-lg button:not([class*="bg-[#04356d]"]) {
          background: #e0f2fe !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .order-details-page .flex.gap-2.rounded-lg button:not([class*="bg-[#04356d]"]):hover {
          background: #bfdbfe !important;
        }
        
        /* Stat Cards - Light Mode: Darker blue gradient for better contrast with white text */
        html:not(.dark) .order-details-page .stat-card {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
          color: #ffffff !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
        }
        
        /* Stat Cards - Dark Mode: Dark purple/blue gradient */
        html.dark .order-details-page .stat-card {
          background: linear-gradient(135deg, #4b225e 0%, #2b2d68 50%, #1a1f4b 100%) !important;
          color: #ffffff !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          backdrop-filter: blur(8px);
        }
        
        /* Title - Dark blue */
        html:not(.dark) .order-details-page h1 {
          color: #1e40af !important;
        }
        html:not(.dark) .order-details-page h1 span {
          color: #3b82f6 !important;
        }
        
        /* Select Dropdown - Match View History button styling */
        html:not(.dark) .order-details-page select[class*="bg-blue-50"] {
          background: #dbeafe !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
          font-size: 0.875rem !important; /* text-sm */
          font-weight: 400 !important;
          font-family: inherit !important;
        }
        html:not(.dark) .order-details-page select[class*="bg-blue-50"]:hover {
          background: #bfdbfe !important;
          border-color: rgba(59, 130, 246, 0.5) !important;
        }
        /* Select option elements - Match text styling */
        html:not(.dark) .order-details-page select[class*="bg-blue-50"] option {
          color: #1a1a1a !important;
          background: #ffffff !important;
          font-size: 0.875rem !important;
          font-weight: 400 !important;
        }
        
        /* Other select dropdowns */
        html:not(.dark) .order-details-page select:not([class*="bg-blue-50"]) {
          background: #ffffff !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        
        /* Tab Container Background */
        html:not(.dark) .order-details-page .rounded-lg.p-1[class*="bg-blue-50"],
        html:not(.dark) .order-details-page .rounded-lg.p-1[class*="bg-white"] {
          background: rgba(255, 255, 255, 0.9) !important;
          border-color: rgba(59, 130, 246, 0.2) !important;
        }
        
        /* Text Colors - Soft dark gray for better readability */
        html:not(.dark) .order-details-page {
          color: #1a1a1a !important;
        }
        
        /* Comment display boxes - Light blue background to match input fields */
        html:not(.dark) .order-details-page div.bg-gray-50[class*="p-2"][class*="rounded-lg"][class*="border"] {
          background: #e0f2fe !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
          color: #1a1a1a !important;
        }
        
        /* Comment input field - Light blue background to match other inputs */
        html:not(.dark) .order-details-page input.bg-gray-50[type="text"] {
          background: #e0f2fe !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .order-details-page input.bg-gray-50[type="text"]:focus {
          background: #ffffff !important;
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15) !important;
        }
      `}</style>
      <div className="min-h-screen text-sm order-details-page bg-gradient-to-br from-sky-100 via-blue-100 to-cyan-100 dark:bg-gradient-to-br dark:from-[#0b1c34] dark:via-[#2b2d68] dark:to-[#4b225e] text-gray-800 dark:text-white">
        <NavbarForm />

        <div className="w-full px-4 sm:px-6 lg:px-8 2xl:px-12 pt-24 pb-6 min-h-[calc(100vh-6rem)] overflow-y-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div>
                <h1 className="text-3xl font-bold text-[#09325d] dark:text-white">
                  ORDER DETAILS{" "}
                  <span className="ml-2 font-normal text-[#09325d]/80 dark:text-white/80">
                    - {orderNo || "—"}
                  </span>
                </h1>
              </div>

              <div className="flex flex-col items-end gap-3">
                <div className="flex gap-2 items-center">
                  {/* Order History Button */}
                  <button
                    onClick={() => setShowHistory(true)}
                    className="px-3 py-1 rounded-md text-sm bg-blue-50 hover:bg-blue-100 border border-gray-200 text-[#09325d] shadow-sm hover:shadow-md transition-all dark:bg-white/10 dark:hover:bg-white/20 dark:text-white dark:border-white/20"
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
                        message: `Set status to "${selectedLabel}"?`,
                        confirmText: "Change",
                        cancelText: "Keep current",
                        onConfirm: () => handleStatusChange(selectedValue),
                      });
                    }}
                    className="px-3 py-1 rounded-md text-sm bg-blue-50 hover:bg-blue-100 border border-gray-200 text-[#09325d] shadow-sm hover:shadow-md cursor-pointer transition-all dark:bg-white/10 dark:hover:bg-white/20 dark:text-white dark:border-white/20"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Top summary; passes live GP override */}
            <OrderSummaryStats order={order} actualGPOverride={actualGPView} />
          </div>

          {/* 3 columns */}
          <div className="grid grid-cols-12 gap-6 2xl:gap-8 items-start min-h-[calc(100vh-11rem)] xl:h-[calc(100vh-11rem)] xl:max-h-[calc(100vh-11rem)] xl:overflow-hidden pb-10">
            {/* LEFT: Order Details */}
            <aside className="col-span-12 xl:col-span-4 flex flex-col gap-4 h-full min-h-[600px]">
              <div className="flex-1 min-h-0">
                <GlassCard
                  className="h-full flex flex-col dark:border-white/20 dark:bg-white/10 dark:text-white"
                  title="Order Details"
                  actions={
                    <div className="flex gap-2 rounded-lg p-1 bg-blue-50 border border-gray-200 dark:bg-white/10 dark:border-white/20">
                      {["Customer", "Part", "Pricing", "Other Details"].map((t) => (
                        <button
                          key={t}
                          onClick={() => setTab(t)}
                          className={`px-3 py-1.5 rounded-md text-sm transition ${tab === t
                            ? "bg-[#04356d] text-white shadow-inner"
                            : "bg-blue-100 text-blue-700 hover:bg-blue-200 hover:text-blue-800 font-medium dark:bg-white/10 dark:text-white/70 dark:hover:text-white dark:hover:bg-white/20"
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
              <GlassCard 
                className="dark:border-white/20 dark:bg-white/10 dark:text-white"
                title="Reimbursement">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-[#09325d] dark:text-white/80">Amount ($)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={reimbursementAmount}
                      onChange={(e) => setReimbursementAmount(e.target.value)}
                      className="w-full rounded-md bg-gray-50 border border-gray-300 px-3 py-2 text-[#09325d] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-white/10 dark:border-white/30 dark:text-white dark:placeholder-white/40 dark:focus:ring-white/60 dark:focus:border-white/60"
                      placeholder="Enter reimbursement amount"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[#09325d] dark:text-white/80">Reimbursement Date</span>
                    <input
                      type="date"
                      value={reimbursementDate}
                      onChange={(e) => setReimbursementDate(e.target.value)}
                      className="w-full rounded-md bg-gray-50 border border-gray-300 px-3 py-2 text-[#09325d] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-white/10 dark:border-white/30 dark:text-white dark:focus:ring-white/60 dark:focus:border-white/60"
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleSaveReimbursement}
                    disabled={savingReimbursement || !orderNo}
                    className={`px-4 py-2 rounded-md text-sm font-semibold border transition ${
                      savingReimbursement
                        ? "bg-sky-200/80 text-gray-500 border-blue-300 cursor-not-allowed dark:bg-white/20 dark:text-white/50 dark:border-white/30"
                        : "bg-blue-200 hover:bg-blue-300 text-blue-800 border-blue-300 shadow-sm hover:shadow-md dark:bg-white/10 dark:text-white dark:border-white/30 dark:hover:bg-white/20"
                    }`}
                  >
                    {savingReimbursement ? "Saving..." : "Save Reimbursement"}
                  </button>
                </div>
              </GlassCard>
            </aside>

            {/* CENTER: Yards */}
            <section className="col-span-12 xl:col-span-4 flex flex-col gap-4 h-full relative z-10">
              <div className="flex-1 min-h-0">
                <YardList
                  yards={yards}
                  expandedYards={expandedYards}
                  onToggle={(i) =>
                    setExpandedYards((p) => ({ ...p, [i]: !p[i] }))
                  }
                  canAddNewYard={canAddNewYard}
                  onOpenAdd={() => setShowAdd(true)}
                  onEditStatus={(i) => {
                    focusCommentsOnYard(i);
                    setEditStatusIdx(i);
                  }}
                  onEditDetails={(i) => {
                    focusCommentsOnYard(i);
                    setEditDetailsIdx(i);
                  }}
                  onCardCharged={(i) => {
                    focusCommentsOnYard(i);
                    setCardChargedIdx(i);
                  }}
                  onRefundStatus={(i) => {
                    focusCommentsOnYard(i);
                    setRefundIdx(i);
                  }}
                  onEscalation={(i) => {
                    const yardEntry = Array.isArray(yards) ? yards[i] : null;
                    const status = String(yardEntry?.status || "").trim();
                    if (status !== "Escalation") {
                      setToast("Set the yard status to Escalation before opening escalation details.");
                      return;
                    }
                    focusCommentsOnYard(i);
                    setEscalationIdx(i);
                  }}
                />
              </div>
            </section>

            {/* RIGHT: comments */}
            <aside className="col-span-12 xl:col-span-4 flex flex-col gap-4 h-full xl:max-h-full xl:overflow-hidden">
      <GlassCard
        className="relative h-full xl:max-h-full flex flex-col xl:overflow-hidden z-20 dark:border-white/20 dark:bg-white/10 dark:text-white"
                title="Support Comments"
                actions={
                  <div className="flex gap-2 rounded-lg p-1 bg-white border border-gray-200 shadow-sm dark:bg-white/10 dark:border-white/20">
                    {yards?.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveSection(i)}
                        className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${
                          activeSection === i
                            ? "bg-[#04356d] text-white shadow-inner"
                            : "bg-blue-100 text-blue-700 hover:bg-blue-200 hover:text-blue-800 dark:bg-white/10 dark:text-white/70 dark:hover:text-white dark:hover:bg-white/20"
                        }`}
                      >
                        Yard {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => setActiveSection("support")}
                      className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${
                        activeSection === "support"
                          ? "bg-blue-600 text-white shadow-inner dark:bg-[#04356d]"
                          : "bg-gray-50 text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:bg-white/10 dark:text-white/70 dark:hover:text-white dark:hover:bg-white/20"
                      }`}
                    >
                      Order Comments
                    </button>
                  </div>
                }
              >
              <div className="flex-1 min-h-0 overflow-hidden" style={{ height: 0 }}>
                <div className="h-full flex flex-col overflow-hidden">
                  <CommentBox
                    orderNo={order?.orderNo}
                    mode={activeSection === "support" ? "support" : "yard"}
                    yardIndex={activeSection === "support" ? null : activeSection}
                      buttonTone="primary"
                      compact
                  />
                </div>
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

      <YardEscalationModal
        open={escalationIdx !== null}
        onClose={() => setEscalationIdx(null)}
        yardIndex={typeof escalationIdx === "number" ? escalationIdx : 0}
        yard={
          escalationIdx !== null && Array.isArray(yards)
            ? yards[escalationIdx]
            : null
        }
        order={order}
        onSaved={async () => {
          await refresh();
          await recomputeAndPersistActualGP({ useServer: true });
        }}
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
        onSubmit={async () => {
          await refresh();
          await recomputeAndPersistActualGP({ useServer: true });
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
