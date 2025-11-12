import { useEffect, useState } from "react";
import API from "../../../api";
import { getWhen, formatDallasDate } from "@spotops/shared";

export default function DisputeOrderModal({ open, onClose, orderNo, onSubmit }) {
  const [orderDateDisp, setOrderDateDisp] = useState("");     // display strings
  const [disputeDateDisp, setDisputeDateDisp] = useState(""); // display strings
  const [disputeReason, setDisputeReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  const firstName = localStorage.getItem("firstName") || "System";

  // Prefill from backend each time the modal opens
  useEffect(() => {
    if (!open || !orderNo) return;

    (async () => {
      try {
        const { data } = await API.get(`/orders/${orderNo}`);

        // Display-only strings
        setOrderDateDisp(formatDallasDate(data.orderDate));
        // Always show "today Dallas" for dispute date
        setDisputeDateDisp(formatDallasDate(getWhen("iso")));

        setDisputeReason(data.disputeReason || "");
        setRefundAmount(data.custRefAmount != null ? String(data.custRefAmount) : "");
      } catch (err) {
        console.error("Error fetching dispute data:", err);
        setToast("Failed to load dispute data.");
        setTimeout(() => setToast(""), 2000);
      }
    })();
  }, [open, orderNo]);

  if (!open) return null;

  const validate = () => {
    if (!disputeReason.trim()) {
      setToast("Reason for dispute is required.");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const payload = {
        disputedDate: getWhen("iso"),
        disputeReason,
        disputedRefAmount:
          refundAmount !== "" && refundAmount !== null
            ? Number(refundAmount)
            : undefined,
      };

      await API.put(
        `/orders/${orderNo}/dispute`,
        payload,
        { params: { firstName } }
      );

      setToast("Dispute saved successfully!");
      await onSubmit?.();
      setTimeout(async () => {
        setToast("");
        onClose();
        // trigger parent refresh (OrderDetails → useOrderDetails hook)
        if (typeof onSubmit === "function") {
          await onSubmit();
        }
      }, 800);
    } catch (err) {
      console.error("Error saving dispute:", err);
      setToast("Failed to save dispute information.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-xl shadow-2xl">
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-3 border-b border-white/20">
          <h3 className="text-lg font-semibold">Mark Dispute</h3>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-2 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20 disabled:opacity-60"
          >
            ✕
          </button>
        </header>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Row 1 — 3 compact fields */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm mb-1">Date of Order</label>
              <input
                type="text"
                value={orderDateDisp}
                readOnly
                className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 text-center"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Date of Dispute</label>
              <input
                type="text"
                value={disputeDateDisp}
                readOnly
                className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 text-center"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Refunded Amount ($)</label>
              <input
                type="text"
                value={refundAmount}
                readOnly
                className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 text-center cursor-not-allowed"
              />
            </div>
          </div>

          {/* Reason full width */}
          <div>
            <label className="block text-sm mb-1">Reason for Dispute</label>
            <input
              type="text"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Enter reason for dispute"
              className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <footer className="flex justify-end gap-3 px-5 py-3 border-t border-white/20">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3 py-1.5 rounded-md bg-white/10 border border-white/20 hover:bg-white/20 disabled:opacity-60"
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className={`px-3 py-1.5 rounded-md border transition ${loading
                ? "bg-gray-400 text-gray-700 border-gray-300 cursor-not-allowed"
                : "bg-white text-[#04356d] border-white/20 hover:bg-white/90"
              }`}
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </footer>

        {/* Toast */}
        {toast && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-white text-black px-5 py-2 rounded-md shadow-lg text-sm">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
