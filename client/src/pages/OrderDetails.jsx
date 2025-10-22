import { useEffect, useState } from "react";
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
import axios from "axios";

// NEW: simple modal for history
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
export default function OrderDetails() {
  const { API_BASE, orderNo, order, loading, error, timeline, yards, canAddNewYard, refresh } = useOrderDetails();
  // for status change of orders
  const handleStatusChange = async (value) => {
    setNewStatus(value);

    if ([
      "Placed",
      "Customer Approved",
      "Yard Processing",
      "In Transit",
      "Escalation",
      "Order Fulfilled",
    ].includes(value)) {
      // Directly update orderStatus
      try {
        const firstName = localStorage.getItem("firstName");
        await axios.put(`${API_BASE}/orders/${orderNo}/custRefund?firstName=${firstName}`, {
          orderStatus: value,
        });
        alert(`Order status updated to ${value}`);
        refresh();
      } catch (err) {
        console.error("Error updating status:", err);
        alert("Error updating order status");
      }
    } else if (value === "Order Cancelled") {
      setShowCancelModal(true);
    } else if (value === "Refunded") {
      setShowRefundModal(true);
    } else if (value === "Dispute") {
      setShowDisputeModal(true)
    }
  };

  const handleAddYard = async (formData) => {
    try {
      const firstName = localStorage.getItem("firstName") || "Unknown";

      // 1️Check if yard already exists
      const yardCheck = await axios.get(`${API_BASE}/api/yards/search?name=${encodeURIComponent(formData.yardName)}`);
      const existingYards = yardCheck.data || [];

      // 2️Add new yard only if it doesn’t exist
      if (existingYards.length === 0) {
        console.log("Adding new yard to Yards collection...");
        await axios.post(`${API_BASE}/api/yards`, {
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
        });
      } else {
        console.log(`Yard "${formData.yardName}" already exists — skipping insert.`);
      }

      // 3️Add yard info to this order (updates order.additionalInfo)
      const payload = { ...formData, orderStatus: "Yard Processing" };

      const res = await axios.post(
        `${API_BASE}/orders/${orderNo}/additionalInfo?firstName=${encodeURIComponent(firstName)}`,
        payload
      );

      console.log("Yard info added:", res.data);

      // 4️Refresh data and close modal
      if (typeof refresh === "function") await refresh();
      setShowAdd(false);
      alert(`Yard- ${formData.yardName} added successfully.`);

    } catch (err) {
      console.error("Error adding yard:", err);
      alert("Error adding yard. Please try again.");
    }
  };
  const [tab, setTab] = useState("Customer");
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
  // for comment box order-switch part:
  const [activeSection, setActiveSection] = useState("support");
  const [toast, setToast] = useState("");

  // NEW: order status dropdown
  const [newStatus, setNewStatus] = useState(order?.orderStatus || "");

  useEffect(() => {
    document.title = orderNo ? `Order No ${orderNo}` : "ORDER DETAILS";
  }, [orderNo]);

  const statusPill = order?.orderStatus || "—";

  const allStatuses = [
    "Placed",
    "Customer Approved",
    "Yard Processing",
    "In Transit",
    "Escalation",
    "Order Fulfilled",
    "Order Cancelled",
    "Dispute",
    "Dispute after Cancellation",
    "Refunded",
    "Voided",
  ];
  useEffect(() => {
    if (order?.orderStatus) {
      setNewStatus(order.orderStatus);
    }
  }, [order]);
  //  to update actualGp for different scenarios:
  useEffect(() => {
    if (!orderNo || !order) return;

    const sp = parseFloat(order.soldP) || 0;
    const tax = parseFloat(order.salestax) || 0;
    const custRefundedAmount =
      parseFloat(
        order.custRefundedAmount ||
        order.cancelledRefAmount ||
        order.custRefAmount ||
        0
      );

    const orderStatus = order.orderStatus || "";
    const additionalInfo = Array.isArray(order.additionalInfo)
      ? order.additionalInfo
      : [];

    let totalYardSpend = 0;
    let hasCardCharged = false;
    let hasPOCancelled = false;
    let poCancelledWithCardCharged = false;

    // 🔹 Loop through all yards
    additionalInfo.forEach((yard) => {
      const part = parseFloat(yard.partPrice) || 0;
      const others = parseFloat(yard.others) || 0;
      const refund = parseFloat(yard.refundedAmount) || 0;
      const reimb = parseFloat(yard.reimbursementAmount) || 0;

      // Parse shipping numeric value
      let shipVal = 0;
      const shipStr = yard.shippingDetails || "";
      if (shipStr.includes(":")) {
        const val = parseFloat(shipStr.split(":")[1]) || 0;
        shipVal = val;
      }

      totalYardSpend += part + others + shipVal + reimb - refund;

      if (yard.paymentStatus === "Card charged") hasCardCharged = true;
      if (yard.status?.toLowerCase().includes("po cancelled")) hasPOCancelled = true;

      // ✅ Detect PO Cancelled + Card Charged combo
      if (
        yard.status?.toLowerCase().includes("po cancelled") &&
        yard.paymentStatus === "Card charged"
      ) {
        poCancelledWithCardCharged = true;
      }
    });

    // 🧮 Calculate Actual GP
    let actualGP = 0;

    if (hasCardCharged || poCancelledWithCardCharged) {
      actualGP = sp - custRefundedAmount - tax - totalYardSpend;
    } else if (
      ["Order Cancelled", "Refunded"].includes(orderStatus) ||
      (hasPOCancelled && !hasCardCharged)
    ) {
      actualGP = sp - custRefundedAmount - tax;
    } else if (
      ["Dispute", "Dispute after Cancellation"].includes(orderStatus)
    ) {
      actualGP = 0 - (totalYardSpend + tax);
    } else {
      actualGP = 0;
    }

    // 🔹 Live UI update like old jQuery version
    const gpField = document.querySelector("#actualGP");
    if (gpField) gpField.value = actualGP.toFixed(2);

    // 🔹 Save only if changed
    const currentGP = parseFloat(order.actualGP) || 0;
    if (Math.abs(currentGP - actualGP) > 0.01) {
      axios
        .put(`${API_BASE}/orders/${orderNo}/updateActualGP`, { actualGP })
        .then(async () => {
          // 🕐 Wait for refresh before showing toast
          await refresh();
          setToast(`Actual GP updated to $${actualGP.toFixed(2)}`);
          setTimeout(() => setToast(""), 3000);
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
  ]);
  useEffect(() => {
    if (!order?.actualGP) return;
    const gpField = document.querySelector("#actualGP");
    if (gpField) gpField.value = Number(order.actualGP).toFixed(2);
  }, [order?.actualGP]);
  return (
    <>
      <div className="min-h-screen text-sm text-[#04356d] bg-gradient-to-b from-[#70869c] via-[#51358a] to-[#4d6bb9] dark:bg-gradient-to-br dark:from-[#0b1c34] dark:via-[#2b2d68] dark:to-[#4b225e] dark:text-white">
        <NavbarForm />

        <div className="w-full px-4 sm:px-6 lg:px-8 2xl:px-12 pt-24 pb-6 min-h-[calc(100vh-6rem)] overflow-y-auto">          {/* Header */}
          <div className="mb-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-white">
                  ORDER DETAILS <span className="ml-2 font-normal text-white/80">- {orderNo || "—"}</span>
                </h1>
                <div className="mt-2 flex gap-2 items-center">

                  {/* Order History Button */}
                  <button
                    onClick={() => setShowHistory(true)}
                    className="px-3 py-1 rounded-md text-sm bg-white/10 hover:bg-white/20"
                  >
                    View History
                  </button>
                  {/* Recalculate Actual GP */}
                  <button
                    onClick={async () => {
                      try {
                        const confirmed = window.confirm("Recalculate Actual GP now?");
                        if (!confirmed) return;

                        const res = await fetch(`${API_BASE}/orders/${orderNo}`);
                        const data = await res.json();

                        // Run same formula as the useEffect recalculation
                        const sp = parseFloat(data.soldP) || 0;
                        const tax = parseFloat(data.salestax) || 0;
                        const custRefundedAmount =
                          parseFloat(
                            data.custRefundedAmount ||
                            data.cancelledRefAmount ||
                            data.custRefAmount ||
                            0
                          );

                        const additionalInfo = Array.isArray(data.additionalInfo)
                          ? data.additionalInfo
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

                          let shipVal = 0;
                          const shipStr = yard.shippingDetails || "";
                          if (shipStr.includes(":")) {
                            shipVal = parseFloat(shipStr.split(":")[1]) || 0;
                          }

                          totalYardSpend += part + others + shipVal + reimb - refund;

                          if (yard.paymentStatus === "Card charged") hasCardCharged = true;
                          if (yard.status?.toLowerCase().includes("po cancel")) hasPOCancelled = true;

                          if (
                            yard.status?.toLowerCase().includes("po cancel") &&
                            yard.paymentStatus === "Card charged"
                          ) {
                            poCancelledWithCardCharged = true;
                          }
                        });

                        let actualGP = 0;
                        const orderStatus = data.orderStatus || "";

                        if (hasCardCharged || poCancelledWithCardCharged) {
                          actualGP = sp - custRefundedAmount - tax - totalYardSpend;
                        } else if (
                          ["Order Cancelled", "Refunded"].includes(orderStatus) ||
                          (hasPOCancelled && !hasCardCharged)
                        ) {
                          actualGP = sp - custRefundedAmount - tax;
                        } else if (
                          ["Dispute", "Dispute after Cancellation"].includes(orderStatus)
                        ) {
                          actualGP = 0 - (totalYardSpend + tax);
                        } else {
                          actualGP = 0;
                        }

                        await axios.put(`${API_BASE}/orders/${orderNo}/updateActualGP`, { actualGP });

                        alert(`Actual GP recalculated: $${actualGP.toFixed(2)}`);
                      } catch (err) {
                        console.error("Error recalculating Actual GP:", err);
                        alert("Failed to recalculate Actual GP.");
                      }
                    }}
                    className="px-3 py-1 rounded-md text-sm bg-white/10 hover:bg-white/20"
                  >
                    Recalculate Actual GP
                  </button>
                  {/* Status Dropdown */}
                  <select
                    value={newStatus}
                    onChange={(e) => {
                      const selected = e.target.value;
                      if (selected === newStatus) return; // no change

                      const confirmed = window.confirm(
                        `Are you sure you want to change the order status to "${selected}"?`
                      );

                      if (confirmed) {
                        handleStatusChange(selected);
                      } else {
                        // revert select visually to old value
                        e.target.value = newStatus;
                      }
                    }}
                    className="px-2 py-1 rounded-md bg-[#2b2d68] hover:bg-[#090c6c] text-white border border-white/20 cursor-pointer"
                  >
                    {allStatuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="hidden md:flex gap-2">
                <Pill className={getStatusColor(statusPill)}>{statusPill}</Pill>
              </div>
            </div>

            <OrderSummaryStats order={order} />
          </div>

          {/* 3 columns */}
          <div className="grid grid-cols-12 gap-6 2xl:gap-8 items-stretch min-h-[calc(100vh-15rem)] pb-10">
            {/* LEFT: Order Details now */}
            <aside className="col-span-12 xl:col-span-4">
              <GlassCard
                title="Order Details"
                actions={
                  <div className="flex gap-2 rounded-lg p-1 bg-[#5c8bc1]/15 border border-[#5c8bc1]/30 dark:bg-white/10 dark:border-white/20">
                    {["Customer", "Part", "Pricing", "Shipping"].map((t) => (
                      <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-3 py-1.5 rounded-md text-sm transition ${tab === t
                          ? "bg-white border border-[#5c8bc1]/40 text-[#04356d] shadow dark:bg-black/20 dark:border-white/30 dark:text-white"
                          : "text-[#04356d]/80 hover:text-[#04356d] dark:text-white/80 dark:hover:text-white"
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
                {tab === "Shipping" && <ShippingTab order={order} />}
              </GlassCard>
              <SaleNote orderNo={order?.orderNo} />
            </aside>

            {/* CENTER: Yards */}
            <section className="col-span-12 xl:col-span-4 flex flex-col gap-6">
              <YardList
                yards={yards}
                expandedYards={expandedYards}
                onToggle={(i) => setExpandedYards((p) => ({ ...p, [i]: !p[i] }))}
                canAddNewYard={canAddNewYard}
                onOpenAdd={() => setShowAdd(true)}
                onEditStatus={(i) => setEditStatusIdx(i)}
                onEditDetails={(i) => setEditDetailsIdx(i)}
                onCardCharged={(i) => setCardChargedIdx(i)}
                onRefundStatus={(i) => setRefundIdx(i)}
                onEscalation={(i) => {/* same logic */ }}
              />
            </section>

            {/* RIGHT: comments */}
            <aside className="col-span-12 xl:col-span-4 flex flex-col h-[calc(100vh-20rem)] min-h-0">
              {/* Buttons for Support Comments + Yards */}
              <div className="flex gap-2 mb-3">

                {yards?.map((y, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveSection(i)}
                    className={`px-3 py-1 rounded-md text-sm font-semibold transition ${activeSection === i
                      ? "bg-white text-[#04356d]"
                      : "bg-white/10 text-white hover:bg-white/20"
                      }`}
                  >
                    Yard {i + 1}
                  </button>

                ))}
                <button
                  onClick={() => setActiveSection("support")}
                  className={`px-3 py-1 rounded-md text-sm font-semibold transition ${activeSection === "support"
                    ? "bg-white text-[#04356d]"
                    : "bg-white/10 text-white hover:bg-white/20"
                    }`}
                >
                  Order Comments
                </button>
              </div>

              {/* Pass mode + index */}
              <CommentBox
                orderNo={order?.orderNo}
                mode={activeSection === "support" ? "support" : "yard"}
                yardIndex={activeSection === "support" ? null : activeSection}
              />
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
      <YardAddModal open={showAdd} onClose={() => setShowAdd(false)} onSubmit={handleAddYard} />
      <YardEditModal
        open={editDetailsIdx !== null}
        yardIndex={editDetailsIdx}
        initial={yards[editDetailsIdx]}
        order={order}
        onClose={() => setEditDetailsIdx(null)}
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
      {/* yard refund */}
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
  API_BASE={API_BASE}
  refresh={() => {
    setTimeout(() => {
      refresh();
      console.log("✅ Refreshed after Cancel modal (with delay)");
    }, 300); // give backend time to commit
  }}
/>

<RefundOrderModal
  open={showRefundModal}
  onClose={() => setShowRefundModal(false)}
  orderNo={orderNo}
  API_BASE={API_BASE}
  refresh={() => {
    setTimeout(() => {
      refresh();
      console.log("✅ Refreshed after Refund modal (with delay)");
    }, 300);
  }}
/>

<DisputeOrderModal
  open={showDisputeModal}
  onClose={() => setShowDisputeModal(false)}
  orderNo={orderNo}
  API_BASE={API_BASE}
  refresh={() => {
    setTimeout(() => {
      refresh();
      console.log("Refreshed after Dispute modal (with delay)");
    }, 300);
  }}
/>

      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </>

  );
}
