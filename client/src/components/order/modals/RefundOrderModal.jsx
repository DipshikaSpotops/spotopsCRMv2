import { useEffect, useState } from "react";
import API from "../../../api";
import { getWhen, formatDallasDate } from "@spotops/shared";

export default function RefundOrderModal({ open, onClose, orderNo, onSubmit }) {
  const [refundAmount, setRefundAmount] = useState("");
  const [refundDate, setRefundDate] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [isRefundLocked, setIsRefundLocked] = useState(false);
  const firstName = localStorage.getItem("firstName");

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
      const payload = {
        custRefundDate: refundDate || getWhen("iso"),
        custRefundedAmount: refundAmount,
        orderStatus: "Refunded",
      };

      // Always update the order status first
      await API.put(
        `/orders/${orderNo}/custRefund`,
        payload,
        { params: { firstName } }
      );

      // Then send email if requested
      if (sendEmail) {
        const formData = new FormData();
        if (pdfFile) formData.append("pdfFile", pdfFile);
        await API.post(
          `/emails/orders/sendRefundConfirmation/${orderNo}`,
          formData,
          { params: { firstName, refundedAmount: refundAmount } }
        );
        setToast("Refund saved and email sent to the customer!");
      } else {
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
    <>
      <style>{`
        /* RefundOrderModal Light Mode Styles */
        html:not(.dark) .refund-order-modal-container {
          background: rgba(240, 249, 255, 0.95) !important;
          border: 1.5px solid rgba(59, 130, 246, 0.3) !important;
          color: #1a1a1a !important;
          overflow: hidden !important;
        }
        html:not(.dark) .refund-order-modal-container header {
          background: rgba(240, 249, 255, 0.9) !important;
          border-bottom: 2px solid rgba(59, 130, 246, 0.3) !important;
          border-top-left-radius: 1rem !important;
          border-top-right-radius: 1rem !important;
        }
        html.dark .refund-order-modal-container header {
          border-top-left-radius: 1rem !important;
          border-top-right-radius: 1rem !important;
        }
        html:not(.dark) .refund-order-modal-container header h3 {
          color: #0f172a !important;
          font-weight: 700 !important;
        }
        html:not(.dark) .refund-order-modal-container label {
          color: #1a1a1a !important;
          font-weight: 600 !important;
        }
        /* Override text-white inheritance from container for all text elements */
        html:not(.dark) .refund-order-modal-container.text-white p,
        html:not(.dark) .refund-order-modal-container[class*="text-white"] p {
          color: #1a1a1a !important;
        }
        html:not(.dark) .refund-order-modal-container input:not([type="file"]):not(.bg-gray-700),
        html:not(.dark) .refund-order-modal-container select {
          background: #e0f2fe !important;
          border: 1.5px solid rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        /* Override text-white on inputs */
        html:not(.dark) .refund-order-modal-container input.text-white:not(.bg-gray-700),
        html:not(.dark) .refund-order-modal-container input[class*="text-white"]:not(.bg-gray-700) {
          color: #1a1a1a !important;
        }
        html:not(.dark) .refund-order-modal-container input:focus,
        html:not(.dark) .refund-order-modal-container select:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15) !important;
          background: #ffffff !important;
          outline: none !important;
        }
        html:not(.dark) .refund-order-modal-container input:disabled,
        html:not(.dark) .refund-order-modal-container input[readonly] {
          background: #e5e7eb !important;
          color: #9ca3af !important;
          border-color: #d1d5db !important;
        }
        html:not(.dark) .refund-order-modal-container select option {
          background: #ffffff !important;
          color: #1a1a1a !important;
        }
        /* Dark mode select options visibility */
        html.dark .refund-order-modal-container select option {
          background: #1e293b !important;
          color: #ffffff !important;
        }
        html.dark .refund-order-modal-container select.bg-\[#2b2d68\] option {
          background: #2b2d68 !important;
          color: #ffffff !important;
        }
        html:not(.dark) .refund-order-modal-container footer {
          border-top: 2px solid rgba(59, 130, 246, 0.3) !important;
          border-bottom-left-radius: 1rem !important;
          border-bottom-right-radius: 1rem !important;
        }
        html.dark .refund-order-modal-container footer {
          border-bottom-left-radius: 1rem !important;
          border-bottom-right-radius: 1rem !important;
        }
        html:not(.dark) .refund-order-modal-close-btn {
          background: #dbeafe !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .refund-order-modal-close-btn:hover {
          background: #bfdbfe !important;
        }
        html:not(.dark) .refund-order-modal-submit-btn {
          background: #1e40af !important;
          color: #ffffff !important;
          border-color: #1e40af !important;
        }
        html:not(.dark) .refund-order-modal-submit-btn:hover:not(:disabled) {
          background: #1e3a8a !important;
        }
        html:not(.dark) .refund-order-modal-submit-btn:disabled {
          background: #e5e7eb !important;
          color: #9ca3af !important;
          border-color: #d1d5db !important;
        }
        /* Text visibility in light mode - override text-white/80 with high specificity */
        html:not(.dark) .refund-order-modal-container p.text-white\/80,
        html:not(.dark) .refund-order-modal-container p[class*="text-white/80"],
        html:not(.dark) .refund-order-modal-container .text-white\/80,
        html:not(.dark) .refund-order-modal-container [class*="text-white/80"],
        html:not(.dark) .refund-order-modal-container div p.text-white\/80,
        html:not(.dark) .refund-order-modal-container div p[class*="text-white/80"],
        html:not(.dark) .refund-order-modal-container .p-5 p.text-white\/80,
        html:not(.dark) .refund-order-modal-container .p-5 p[class*="text-white/80"],
        html:not(.dark) .refund-order-modal-container > div > div p.text-white\/80,
        html:not(.dark) .refund-order-modal-container > div > div p[class*="text-white/80"] {
          color: #1a1a1a !important;
        }
        html:not(.dark) .refund-order-modal-container p.text-white\/80 b,
        html:not(.dark) .refund-order-modal-container p[class*="text-white/80"] b,
        html:not(.dark) .refund-order-modal-container p.text-white\/80 > b,
        html:not(.dark) .refund-order-modal-container p[class*="text-white/80"] > b,
        html:not(.dark) .refund-order-modal-container div p.text-white\/80 b,
        html:not(.dark) .refund-order-modal-container div p[class*="text-white/80"] b {
          color: #0f172a !important;
          font-weight: 700 !important;
        }
        /* Override text-white inheritance from container with maximum specificity */
        html:not(.dark) .refund-order-modal-container.text-white p.text-white\/80,
        html:not(.dark) .refund-order-modal-container[class*="text-white"] p[class*="text-white/80"],
        html:not(.dark) .refund-order-modal-container.text-white div p.text-white\/80,
        html:not(.dark) .refund-order-modal-container[class*="text-white"] div p[class*="text-white/80"] {
          color: #1a1a1a !important;
        }
        html:not(.dark) .refund-order-modal-container p.text-yellow-300,
        html:not(.dark) .refund-order-modal-container p[class*="text-yellow-300"] {
          color: #d97706 !important;
        }
        /* Locked input styling in light mode */
        html:not(.dark) .refund-order-modal-container input.bg-gray-700 {
          background: #e5e7eb !important;
          color: #6b7280 !important;
          border-color: #d1d5db !important;
        }
        /* Input text color when not locked - override any text-white classes */
        html:not(.dark) .refund-order-modal-container input[type="number"]:not(.bg-gray-700),
        html:not(.dark) .refund-order-modal-container input[type="number"].text-white:not(.bg-gray-700),
        html:not(.dark) .refund-order-modal-container input[type="number"][class*="text-white"]:not(.bg-gray-700) {
          color: #1a1a1a !important;
        }
        /* File input text and "No file chosen" text */
        html:not(.dark) .refund-order-modal-container input[type="file"],
        html:not(.dark) .refund-order-modal-container input[type="file"].text-white\/80,
        html:not(.dark) .refund-order-modal-container input[type="file"][class*="text-white"] {
          color: #1a1a1a !important;
        }
        /* File input button styling - support both standard and webkit */
        html:not(.dark) .refund-order-modal-container input[type="file"]::file-selector-button,
        html:not(.dark) .refund-order-modal-container input[type="file"]::-webkit-file-upload-button {
          background: #dbeafe !important;
          color: #1a1a1a !important;
          border: 1.5px solid rgba(59, 130, 246, 0.4) !important;
          border-radius: 0.5rem !important;
          padding: 0.375rem 0.75rem !important;
          margin-right: 0.5rem !important;
          font-weight: 600 !important;
        }
        html:not(.dark) .refund-order-modal-container input[type="file"]::file-selector-button:hover,
        html:not(.dark) .refund-order-modal-container input[type="file"]::-webkit-file-upload-button:hover {
          background: #bfdbfe !important;
        }
      `}</style>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-lg rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-xl shadow-2xl refund-order-modal-container overflow-hidden dark:border-white/20 dark:bg-white/10 dark:text-white">
          <header className="flex items-center justify-between px-5 py-3 border-b border-white/20 rounded-t-2xl dark:border-white/20">
          <h3 className="text-lg font-semibold">Customer Refund</h3>
          <button
            onClick={onClose}
            className="px-2 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20 refund-order-modal-close-btn dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/20 dark:text-white"
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
                  : "bg-white/10 border-white/30 text-white dark:bg-white/10 dark:border-white/30 dark:text-white"
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

        <footer className="flex justify-end gap-3 px-5 py-3 border-t border-white/20 rounded-b-2xl dark:border-white/20">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3 py-1.5 rounded-md bg-white/10 border border-white/20 hover:bg-white/20 refund-order-modal-close-btn dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/20 dark:text-white"
          >
            Close
          </button>

          <button
            onClick={() => handleSave(false)}
            disabled={loading}
            className={`px-3 py-1.5 rounded-md border transition refund-order-modal-submit-btn ${loading
                ? "bg-gray-400 text-gray-700 border-gray-300 cursor-not-allowed"
                : "bg-white text-[#04356d] border-white/20 hover:bg-white/90 dark:bg-white dark:text-[#04356d] dark:hover:bg-white/90"
              }`}
          >
            {loading ? "Saving..." : "Save Only"}
          </button>

          <button
            onClick={() => handleSave(true)}
            disabled={loading}
            className={`px-3 py-1.5 rounded-md border transition refund-order-modal-submit-btn ${loading
                ? "bg-gray-400 text-gray-700 border-gray-300 cursor-not-allowed"
                : "bg-[#2b2d68] hover:bg-[#090c6c] border border-white/20 dark:bg-[#2b2d68] dark:hover:bg-[#090c6c] dark:text-white"
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
    </>
  );
}
