import { useEffect, useState, useCallback } from "react";
import { getWhen, toDallasIso } from "@spotops/shared";
import API from "../../../api";

export default function CardChargedModal({ open, onClose, onSubmit, orderNo, yardIndex, yard }) {
  const [paymentStatus, setPaymentStatus] = useState("");
  const [cardChargedDate, setCardChargedDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  // 🔹 Prefill data from backend when modal opens
  useEffect(() => {
    if (open && yard) {
      const rawStatus = String(yard.paymentStatus || "").toLowerCase().trim();
      const normalized = rawStatus
      .replace(/\s+/g, " ")
      .replace(/[^a-z ]/g, "");
      const compact = normalized.replace(/\s+/g, "");

      if (["cardcharged", "charged", "chargecomplete"].includes(compact)) {
        setPaymentStatus("Card charged");
      } else if (
        ["cardnotcharged", "notcharged", "pending", "chargepending"].includes(
          compact
        )
      ) {
        setPaymentStatus("Card not charged");
      } else {
        setPaymentStatus("");
      }

      setCardChargedDate(
        yard.cardChargedDate
          ? yard.cardChargedDate.split("T")[0] // only show YYYY-MM-DD
          : ""
      );
    }
  }, [open, yard]);

  const handleSubmit = useCallback(async () => {
    if (!paymentStatus) {
      setToast("Please select payment status.");
      return;
    }

    setLoading(true);
    try {
      const firstName = localStorage.getItem("firstName") || "System";

      const payload = {
        paymentStatus,
        cardChargedDate: cardChargedDate
            ? toDallasIso(cardChargedDate)
            : getWhen("iso"),
      };

      const { data } = await API.patch(
        `/orders/${encodeURIComponent(orderNo)}/additionalInfo/${yardIndex + 1}/paymentStatus`,
        payload,
        { params: { firstName } }
      );

      setToast("Yard payment status updated successfully!");
      await onSubmit?.(data);
      setTimeout(() => {
        setToast("");
        onClose();
      }, 1000);
    } catch (err) {
      console.error("Error updating yard payment:", err);
      setToast("Error updating yard payment.");
    } finally {
      setLoading(false);
    }
  }, [cardChargedDate, onClose, onSubmit, orderNo, paymentStatus, yardIndex]);

  if (!open) return null;

  return (
    <>
      <style>{`
        /* CardChargedModal Light Mode Styles */
        html:not(.dark) .card-charged-modal-container {
          background: rgba(240, 249, 255, 0.95) !important;
          border: 1.5px solid rgba(59, 130, 246, 0.3) !important;
          color: #1a1a1a !important;
          overflow: hidden !important;
        }
        html:not(.dark) .card-charged-modal-container header {
          background: rgba(240, 249, 255, 0.9) !important;
          border-bottom: 2px solid rgba(59, 130, 246, 0.3) !important;
          border-top-left-radius: 1rem !important;
          border-top-right-radius: 1rem !important;
        }
        html.dark .card-charged-modal-container header {
          border-top-left-radius: 1rem !important;
          border-top-right-radius: 1rem !important;
        }
        html:not(.dark) .card-charged-modal-container header h3 {
          color: #0f172a !important;
          font-weight: 700 !important;
        }
        html:not(.dark) .card-charged-modal-container label {
          color: #1a1a1a !important;
          font-weight: 600 !important;
        }
        html:not(.dark) .card-charged-modal-container input,
        html:not(.dark) .card-charged-modal-container select {
          background: #e0f2fe !important;
          border: 1.5px solid rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .card-charged-modal-container input:focus,
        html:not(.dark) .card-charged-modal-container select:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15) !important;
          background: #ffffff !important;
          outline: none !important;
        }
        html:not(.dark) .card-charged-modal-container select option {
          background: #ffffff !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .card-charged-modal-container select.bg-\[#2b2d68\] {
          background: #dbeafe !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .card-charged-modal-container select.bg-\[#2b2d68\]:hover {
          background: #bfdbfe !important;
        }
        html:not(.dark) .card-charged-modal-container footer {
          border-top: 2px solid rgba(59, 130, 246, 0.3) !important;
          border-bottom-left-radius: 1rem !important;
          border-bottom-right-radius: 1rem !important;
        }
        html.dark .card-charged-modal-container footer {
          border-bottom-left-radius: 1rem !important;
          border-bottom-right-radius: 1rem !important;
        }
        html:not(.dark) .card-charged-modal-close-btn {
          background: #dbeafe !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .card-charged-modal-close-btn:hover {
          background: #bfdbfe !important;
        }
        html:not(.dark) .card-charged-modal-submit-btn {
          background: #1e40af !important;
          color: #ffffff !important;
          border-color: #1e40af !important;
        }
        html:not(.dark) .card-charged-modal-submit-btn:hover:not(:disabled) {
          background: #1e3a8a !important;
        }
        html:not(.dark) .card-charged-modal-submit-btn:disabled {
          background: #e5e7eb !important;
          color: #9ca3af !important;
          border-color: #d1d5db !important;
        }
      `}</style>
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-md rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-xl shadow-2xl card-charged-modal-container overflow-hidden dark:border-white/20 dark:bg-white/10 dark:text-white">
          <header className="flex items-center justify-between px-5 py-3 border-b border-white/20 rounded-t-2xl dark:border-white/20">
          <h3 className="text-lg font-semibold">Card Charged Details</h3>
          <button onClick={onClose} className="px-2 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20 card-charged-modal-close-btn dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/20 dark:text-white">
            ✕
          </button>
        </header>

        <div
          className="p-5 space-y-4"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              const tag = e.target?.tagName?.toLowerCase();
              if (tag !== "textarea") {
                e.preventDefault();
                handleSubmit();
              }
            }
          }}
        >
          <div>
            <label className="block text-sm mb-1">Card Charged:</label>
            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
              className="w-full rounded-lg px-3 py-2 bg-[#2b2d68] text-white border border-white/30 outline-none focus:ring-2 focus:ring-white/60 hover:bg-[#1f2760] transition-colors dark:bg-[#2b2d68] dark:hover:bg-[#1f2760] dark:text-white"
            >
              <option value="" disabled>
                Choose...
              </option>
              <option value="Card charged">Charged</option>
              <option value="Card not charged">Not charged</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1">Card Charged Date:</label>
            <input
              type="date"
              value={cardChargedDate}
              onChange={(e) => setCardChargedDate(e.target.value)}
              className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 outline-none text-center dark:bg-white/10 dark:border-white/30 dark:text-white"
            />
          </div>
        </div>

        <footer className="flex justify-end gap-2 px-5 py-3 border-t border-white/20 rounded-b-2xl dark:border-white/20">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md bg-white/10 border border-white/20 hover:bg-white/20 card-charged-modal-close-btn dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/20 dark:text-white">
            Close
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`px-3 py-1.5 rounded-md border transition card-charged-modal-submit-btn ${
              loading
                ? "bg-gray-400 text-gray-700 border-gray-300 cursor-not-allowed"
                : "bg-white text-[#04356d] border-white/20 hover:bg-white/90 dark:bg-white dark:text-[#04356d] dark:hover:bg-white/90"
            }`}
          >
            {loading ? "Saving..." : "Submit"}
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
