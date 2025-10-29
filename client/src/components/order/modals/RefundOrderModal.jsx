import { useEffect, useState } from "react";
import API from "../../../api";
import { getWhen, formatDallasDate } from "@shared/utils/timeUtils";

export default function RefundOrderModal({ open, onClose, orderNo, onSubmit }) {
  const [refundAmount, setRefundAmount] = useState("");
  const [refundDate, setRefundDate] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [isRefundLocked, setIsRefundLocked] = useState(false);
  const firstName = localStorage.getItem("firstName") || "System";

  // Prefill refund details when modal opens
  useEffect(() => {
    const fetchExisting = async () => {
      if (!open) return;
      try {
        const res = await API.get(`/orders/${orderNo}`);
        const order = res.data;
        if (order.custRefundDate || order.custRefAmount) {
          setRefundAmount(order.custRefAmount || "");
          setRefundDate(order.custRefundDate || "");
          setIsRefundLocked(true); // make read-only
        } else {
          // default: set today's Dallas ISO
          setRefundDate(getWhen("iso"));
          setIsRefundLocked(false);
        }
      } catch (err) {
        console.error("Error fetching refund info:", err);
      }
    };
    fetchExisting();
  }, [open, orderNo]);

  if (!open) return null;

  const validate = () => {
    if (!refundAmount) {
      setToast("Refund amount is required.");
      return false;
    }
    if (!pdfFile) {
      setToast("Please attach refund receipt PDF.");
      return false;
    }
    return true;
  };

  const handleSave = async (sendEmail = false) => {
    if (!validate()) return;
    setLoading(true);
    try {
      if (sendEmail) {
        const formData = new FormData();
        if (pdfFile) formData.append("pdfFile", pdfFile);
        await API.post(
          `/emails/orders/sendRefundConfirmation/${orderNo}`,
          formData,
          { params: { firstName, refundedAmount: refundAmount } }
        );
        setToast("Refund email sent to the customer!");
      } else {
        await API.put(
          `/orders/${orderNo}/custRefund`,
          {
            custRefundDate: refundDate || getWhen("iso"),
            custRefundedAmount: refundAmount,
            orderStatus: "Refunded",
          },
          { params: { firstName } }
        );
        setToast("Refund saved successfully.");
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
      console.error("Refund save/send failed:", err);
      setToast("Error saving or sending refund.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-xl shadow-2xl">
        <header className="flex items-center justify-between px-5 py-3 border-b border-white/20">
          <h3 className="text-lg font-semibold">Customer Refund</h3>
          <button
            onClick={onClose}
            className="px-2 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20"
          >
            ✕
          </button>
        </header>

        <div className="p-5 space-y-4">
          <p className="text-sm text-white/80">
            Refund Date: <b>{formatDallasDate(refundDate || getWhen("iso"))}</b>
          </p>

          <div>
            <label className="block text-sm mb-1">Refund Amount ($)</label>
            <input
              type="number"
              value={refundAmount}
              readOnly={isRefundLocked} // 🔒 lock input
              onChange={(e) => !isRefundLocked && setRefundAmount(e.target.value)}
              className={`w-full rounded-lg px-3 py-2 border text-center ${isRefundLocked
                  ? "bg-gray-700 text-gray-300 border-gray-500 cursor-not-allowed"
                  : "bg-white/10 border-white/30 text-white"
                }`}
            />
            {isRefundLocked && (
              <p className="text-xs text-yellow-300 mt-1">
                (Refund amount locked from cancellation record)
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm mb-1">Attach Refund Receipt (PDF) *</label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setPdfFile(e.target.files[0])}
              className="w-full text-sm text-white/80"
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
