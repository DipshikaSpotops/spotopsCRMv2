import { useEffect, useState } from "react";
import API from "../../../api";
import { getWhen, formatDallasDate } from "@spotops/shared";

export default function CancelOrderModal({ open, onClose, orderNo, onSubmit }) {
  const [reason, setReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [cancelDate, setCancelDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  const firstName = localStorage.getItem("firstName") || "System";

  // Fetch previously saved cancellation data when modal opens
  useEffect(() => {
    const fetchExisting = async () => {
      if (!open) return;
      try {
        const res = await API.get(`/orders/${orderNo}`);
        const order = res.data;
        if (order.cancelledDate || order.cancellationReason || order.custRefAmount) {
          setReason(order.cancellationReason || "");
          setRefundAmount(order.custRefAmount || "");
          setCancelDate(order.cancelledDate || "");
        } else {
          setCancelDate(getWhen("iso"));
        }
      } catch (err) {
        console.error("Error fetching order cancel info:", err);
      }
    };
    fetchExisting();
  }, [open, orderNo]);
  if (!open) return null;

  const validate = () => {
    if (!reason || !refundAmount) {
      setToast("All fields are required.");
      return false;
    }
    return true;
  };

  const handleSave = async (sendEmail = false) => {
    if (!validate()) return;
    setLoading(true);
    try {
      const payload = {
        cancelledDate: cancelDate || getWhen("iso"),
        cancelledRefAmount: refundAmount,
        cancellationReason: reason,
        orderStatus: "Order Cancelled",
      };

      if (sendEmail) {
        await API.post(
          `/emails/order-cancel/${orderNo}`,
          null,
          { params: { cancelledRefAmount: refundAmount, firstName } }
        );
        setToast("Cancellation email sent successfully!");
      } else {
        await API.put(
          `/orders/${orderNo}/custRefund`,
          payload,
          { params: { firstName } }
        );
        setToast("Order cancellation saved.");
      }

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
      console.error("Cancel order save/send failed:", err);
      setToast("Error saving or sending cancellation.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-xl shadow-2xl">
        <header className="flex items-center justify-between px-5 py-3 border-b border-white/20">
          <h3 className="text-lg font-semibold">Order Cancellation</h3>
          <button
            onClick={onClose}
            className="px-2 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20"
          >
            ✕
          </button>
        </header>

        <div className="p-5 space-y-4">
          <p className="text-sm text-white/80">
            Date of Cancellation: <b>{formatDallasDate(cancelDate || getWhen("iso"))}</b>
          </p>

          <div>
            <label className="block text-sm mb-1">Reason for Cancellation *</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg px-3 py-2 bg-[#2b2d68] hover:bg-[#090c6c] border border-white/30 text-center"
              required
            >
              <option value="">Choose</option>
              <option value="Same Day">Same Day</option>
              <option value="Invoice Not Signed">Invoice Not Signed</option>
              <option value="Delay">Delay</option>
              <option value="Wrong Part">Wrong Part</option>
              <option value="Defective/Damaged">Defective/Damaged</option>
              <option value="Personal Reason">Personal Reason</option>
              <option value="Reimbursement">Reimbursement</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1">Amount to be Refunded ($) *</label>
            <input
              type="number"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 text-center"
              placeholder="0.00"
              required
            />
          </div>
        </div>

        <footer className="flex justify-end gap-3 px-5 py-3 border-t border-white/20">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3 py-1.5 rounded-md bg-white/10 border border-white/20 hover:bg-white/20"
          >
            Close
          </button>

          <button
            onClick={() => handleSave(false)}
            disabled={loading}
            className={`px-3 py-1.5 rounded-md border transition ${loading
              ? "bg-gray-400 text-gray-700 border-gray-300 cursor-not-allowed"
              : "bg-white text-[#04356d] border-white/20 hover:bg-white/90"
              }`}
          >
            {loading ? "Saving..." : "Save Only"}
          </button>

          <button
            onClick={() => handleSave(true)}
            disabled={loading}
            className={`px-3 py-1.5 rounded-md border transition ${loading
              ? "bg-gray-400 text-gray-700 border-gray-300 cursor-not-allowed"
              : "bg-[#2b2d68] hover:bg-[#090c6c] border border-white/20"
              }`}
          >
            {loading ? "Sending..." : "Save & Send Email"}
          </button>
        </footer>

        {toast && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-white text-black px-5 py-2 rounded-md shadow-lg text-sm">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
