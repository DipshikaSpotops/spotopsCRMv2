import { useEffect, useState } from "react";
import API from "../../../api";
import { getWhen, formatDallasDate } from "@spotops/shared";
import EmailLoader from "../../common/EmailLoader";
import EmailToast from "../../common/EmailToast";

export default function CancelOrderModal({ open, onClose, orderNo, onSubmit }) {
  const [reason, setReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [cancelDate, setCancelDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailToast, setEmailToast] = useState(null);

  const firstName = localStorage.getItem("firstName");

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

      // Always update the order status first
      await API.put(
        `/orders/${orderNo}/custRefund`,
        payload,
        { params: { firstName } }
      );

      // Then send email if requested
      if (sendEmail) {
        setLoading(false); // Clear main loading, email will have its own loading
        setSendingEmail(true);
        try {
          await API.post(
            `/emails/order-cancel/${orderNo}`,
            null,
            { params: { cancelledRefAmount: refundAmount, firstName } }
          );
          setSendingEmail(false);
          setEmailToast({ message: "Cancellation saved and email sent successfully!", variant: "success" });
          setToast("Cancellation saved and email sent successfully!");
        } catch (emailErr) {
          setSendingEmail(false);
          const errorMsg = emailErr?.response?.data?.message || emailErr?.message || "Failed to send cancellation email.";
          setEmailToast({ message: errorMsg, variant: "error" });
          setToast("Cancellation saved, but email failed to send.");
        }
      } else {
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
    <>
      <style>{`
        /* CancelOrderModal Light Mode Styles */
        html:not(.dark) .cancel-order-modal-container {
          background: rgba(240, 249, 255, 0.95) !important;
          border: 1.5px solid rgba(59, 130, 246, 0.3) !important;
          color: #1a1a1a !important;
          overflow: hidden !important;
        }
        html:not(.dark) .cancel-order-modal-container header {
          background: rgba(240, 249, 255, 0.9) !important;
          border-bottom: 2px solid rgba(59, 130, 246, 0.3) !important;
          border-top-left-radius: 1rem !important;
          border-top-right-radius: 1rem !important;
        }
        html.dark .cancel-order-modal-container header {
          border-top-left-radius: 1rem !important;
          border-top-right-radius: 1rem !important;
        }
        html:not(.dark) .cancel-order-modal-container header h3 {
          color: #0f172a !important;
          font-weight: 700 !important;
        }
        html:not(.dark) .cancel-order-modal-container label {
          color: #1a1a1a !important;
          font-weight: 600 !important;
        }
        /* Override text-white inheritance from container for all text elements */
        html:not(.dark) .cancel-order-modal-container.text-white p,
        html:not(.dark) .cancel-order-modal-container[class*="text-white"] p {
          color: #1a1a1a !important;
        }
        html:not(.dark) .cancel-order-modal-container input,
        html:not(.dark) .cancel-order-modal-container select {
          background: #e0f2fe !important;
          border: 1.5px solid rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .cancel-order-modal-container input:focus,
        html:not(.dark) .cancel-order-modal-container select:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15) !important;
          background: #ffffff !important;
          outline: none !important;
        }
        html:not(.dark) .cancel-order-modal-container select option {
          background: #ffffff !important;
          color: #1a1a1a !important;
        }
        /* Dark mode select options visibility */
        html.dark .cancel-order-modal-container select option {
          background: #1e293b !important;
          color: #ffffff !important;
        }
        html.dark .cancel-order-modal-container select.bg-\[#2b2d68\] option {
          background: #2b2d68 !important;
          color: #ffffff !important;
        }
        html:not(.dark) .cancel-order-modal-container select.bg-\[#2b2d68\] {
          background: #dbeafe !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .cancel-order-modal-container select.bg-\[#2b2d68\]:hover {
          background: #bfdbfe !important;
        }
        html:not(.dark) .cancel-order-modal-container footer {
          border-top: 2px solid rgba(59, 130, 246, 0.3) !important;
          border-bottom-left-radius: 1rem !important;
          border-bottom-right-radius: 1rem !important;
        }
        html.dark .cancel-order-modal-container footer {
          border-bottom-left-radius: 1rem !important;
          border-bottom-right-radius: 1rem !important;
        }
        html:not(.dark) .cancel-order-modal-close-btn {
          background: #dbeafe !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .cancel-order-modal-close-btn:hover {
          background: #bfdbfe !important;
        }
        html:not(.dark) .cancel-order-modal-submit-btn {
          background: #1e40af !important;
          color: #ffffff !important;
          border-color: #1e40af !important;
        }
        html:not(.dark) .cancel-order-modal-submit-btn:hover:not(:disabled) {
          background: #1e3a8a !important;
        }
        html:not(.dark) .cancel-order-modal-submit-btn:disabled {
          background: #e5e7eb !important;
          color: #9ca3af !important;
          border-color: #d1d5db !important;
        }
        /* Text visibility in light mode - override text-white/80 with high specificity */
        html:not(.dark) .cancel-order-modal-container p.text-white\/80,
        html:not(.dark) .cancel-order-modal-container p[class*="text-white/80"],
        html:not(.dark) .cancel-order-modal-container .text-white\/80,
        html:not(.dark) .cancel-order-modal-container [class*="text-white/80"],
        html:not(.dark) .cancel-order-modal-container div p.text-white\/80,
        html:not(.dark) .cancel-order-modal-container div p[class*="text-white/80"],
        html:not(.dark) .cancel-order-modal-container .p-5 p.text-white\/80,
        html:not(.dark) .cancel-order-modal-container .p-5 p[class*="text-white/80"],
        html:not(.dark) .cancel-order-modal-container > div > div p.text-white\/80,
        html:not(.dark) .cancel-order-modal-container > div > div p[class*="text-white/80"] {
          color: #1a1a1a !important;
        }
        html:not(.dark) .cancel-order-modal-container p.text-white\/80 b,
        html:not(.dark) .cancel-order-modal-container p[class*="text-white/80"] b,
        html:not(.dark) .cancel-order-modal-container p.text-white\/80 > b,
        html:not(.dark) .cancel-order-modal-container p[class*="text-white/80"] > b,
        html:not(.dark) .cancel-order-modal-container div p.text-white\/80 b,
        html:not(.dark) .cancel-order-modal-container div p[class*="text-white/80"] b {
          color: #0f172a !important;
          font-weight: 700 !important;
        }
        /* Override text-white inheritance from container with maximum specificity */
        html:not(.dark) .cancel-order-modal-container.text-white p.text-white\/80,
        html:not(.dark) .cancel-order-modal-container[class*="text-white"] p[class*="text-white/80"],
        html:not(.dark) .cancel-order-modal-container.text-white div p.text-white\/80,
        html:not(.dark) .cancel-order-modal-container[class*="text-white"] div p[class*="text-white/80"] {
          color: #1a1a1a !important;
        }
        /* Override text-white on inputs */
        html:not(.dark) .cancel-order-modal-container input.text-white,
        html:not(.dark) .cancel-order-modal-container input[class*="text-white"] {
          color: #1a1a1a !important;
        }
      `}</style>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-lg rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-xl shadow-2xl cancel-order-modal-container overflow-hidden dark:border-white/20 dark:bg-white/10 dark:text-white">
          <header className="flex items-center justify-between px-5 py-3 border-b border-white/20 rounded-t-2xl dark:border-white/20">
          <h3 className="text-lg font-semibold">Order Cancellation</h3>
          <button
            onClick={onClose}
            className="px-2 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20 cancel-order-modal-close-btn dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/20 dark:text-white"
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
              className="w-full rounded-lg px-3 py-2 bg-[#2b2d68] hover:bg-[#090c6c] border border-white/30 text-center dark:bg-[#2b2d68] dark:hover:bg-[#090c6c] dark:text-white"
              required
            >
              <option value="">Choose</option>
              <option value="Same Day">Same Day</option>
              <option value="Invoice Not Signed">Invoice Not Signed</option>
              <option value="Delay">Delay</option>
              <option value="Wrong Part">Wrong Part</option>
              <option value="Defective/Damaged">Defective/Damaged</option>
              <option value="Part Not Available">Part Not Available</option>
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
              className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 text-center dark:bg-white/10 dark:border-white/30 dark:text-white"
              placeholder="0.00"
              required
            />
          </div>
        </div>

        <footer className="flex justify-end gap-3 px-5 py-3 border-t border-white/20 rounded-b-2xl dark:border-white/20">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3 py-1.5 rounded-md bg-white/10 border border-white/20 hover:bg-white/20 cancel-order-modal-close-btn dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/20 dark:text-white"
          >
            Close
          </button>

          <button
            onClick={() => handleSave(false)}
            disabled={loading}
            className={`px-3 py-1.5 rounded-md border transition cancel-order-modal-submit-btn ${loading
              ? "bg-gray-400 text-gray-700 border-gray-300 cursor-not-allowed"
              : "bg-white text-[#04356d] border-white/20 hover:bg-white/90 dark:bg-white dark:text-[#04356d] dark:hover:bg-white/90"
              }`}
          >
            {loading ? "Saving..." : "Save Only"}
          </button>

          <button
            onClick={() => handleSave(true)}
            disabled={loading}
            className={`px-3 py-1.5 rounded-md border transition cancel-order-modal-submit-btn ${loading
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
      
      {/* Email loading overlay */}
      {sendingEmail && <EmailLoader message="Sending cancellation email..." />}
      
      {/* Email toast notification */}
      <EmailToast toast={emailToast} onClose={() => setEmailToast(null)} />
    </div>
    </>
  );
}
