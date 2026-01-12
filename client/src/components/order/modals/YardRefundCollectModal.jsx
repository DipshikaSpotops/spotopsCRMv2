import { useEffect, useState } from "react";
import { getWhen, toDallasIso } from "@spotops/shared";
import API from "../../../api";
// hhtp
export default function RefundModal({ open, onClose, onSubmit, orderNo, yardIndex, yard }) {
  const [refundStatus, setRefundStatus] = useState("");
  const [refundedAmount, setRefundedAmount] = useState("");
  const [refundToCollect, setRefundToCollect] = useState("");
  const [refundedDate, setRefundedDate] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [returnTrackingNo, setReturnTrackingNo] = useState("");
  const [collectRefund, setCollectRefund] = useState(false);
  const [upsClaim, setUpsClaim] = useState(false);
  const [storeCredit, setStoreCredit] = useState(false);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [toast, setToast] = useState("");

  const applySelection = (option) => {
    setCollectRefund(option === "collect");
    setUpsClaim(option === "ups");
    setStoreCredit(option === "store");
  };

  const handleSelectionChange = (option) => (event) => {
    const isChecked = event.target.checked;
    
    // Allow individual checkboxes to be checked/unchecked independently
    if (option === "collect") {
      setCollectRefund(isChecked);
      if (isChecked) {
        // When checking collect refund, uncheck others (mutually exclusive)
        setUpsClaim(false);
        setStoreCredit(false);
      }
    } else if (option === "ups") {
      setUpsClaim(isChecked);
      if (isChecked) {
        // When checking UPS claim, uncheck others (mutually exclusive)
        setCollectRefund(false);
        setStoreCredit(false);
      }
    } else if (option === "store") {
      setStoreCredit(isChecked);
      if (isChecked) {
        // When checking store credit, uncheck others (mutually exclusive)
        setCollectRefund(false);
        setUpsClaim(false);
      }
      // Store credit doesn't affect refund status
    }
  };

  // Auto-uncheck Collect Refund and UPS Claim when Refund Collected is "Yes"
  useEffect(() => {
    if (refundStatus === "Refund collected" || refundStatus === "Yes") {
      setCollectRefund(false);
      setUpsClaim(false);
    }
  }, [refundStatus]);

  useEffect(() => {
    if (refundStatus === "Refund not collected") {
      setRefundedAmount("0");
    }
  }, [refundStatus]);

  // 🔹 Prefill backend data
  useEffect(() => {
    if (open && yard) {
      setRefundStatus(yard.refundStatus || "");
      setRefundedAmount(yard.refundedAmount || "");
      setRefundToCollect(yard.refundToCollect || "");
      setRefundedDate(yard.refundedDate ? yard.refundedDate.split("T")[0] : "");
      setRefundReason(yard.refundReason || "");
      setReturnTrackingNo(yard.returnTrackingCust || "");
      const initialCollect = yard.collectRefundCheckbox === "Ticked";
      const initialUps = yard.upsClaimCheckbox === "Ticked";
      const initialStore = yard.storeCreditCheckbox === "Ticked";

      if (initialCollect) applySelection("collect");
      else if (initialUps) applySelection("ups");
      else if (initialStore) applySelection("store");
      else applySelection(null);
    }
  }, [open, yard]);

  if (!open) return null;

  const validateBeforeSubmit = () => {
    const trimmedCollect = String(refundToCollect ?? "").trim();
    const trimmedRefundedAmount = String(refundedAmount ?? "").trim();

    // If "Refund collected" (Yes) is selected, checkboxes should be unchecked and we validate refund amount/date
    if (refundStatus === "Refund collected") {
      if (!trimmedRefundedAmount) {
        setToast("Refunded Amount is required when refund is collected.");
        return false;
      }
      if (!refundedDate) {
        setToast("Refunded Date is required when refund is collected.");
        return false;
      }
      // If refund is collected, checkboxes should not be checked - validation passes
      return true;
    }

    // If any checkbox is checked, validate the required fields
    if (collectRefund || upsClaim || storeCredit) {
      if (!trimmedCollect) {
        setToast("Refund To Be Collected is required when you select a refund action.");
        return false;
      }
      if (!refundReason) {
        setToast("Refund Reason is required when you select a refund action.");
        return false;
      }
      return true;
    }

    // Refund Collected dropdown is optional - no validation required
    return true;
  };

  const handleSubmit = async () => {
    if (!validateBeforeSubmit()) return;

    setLoading(true);
    try {
      const firstName = localStorage.getItem("firstName");
      const payload = {
        refundStatus,
        refundedAmount,
        storeCredit: storeCredit ? refundedAmount : null,
        refundedDate: refundedDate
          ? toDallasIso(refundedDate)
          : getWhen("iso"),
        collectRefundCheckbox: collectRefund ? "Ticked" : "Unticked",
        upsClaimCheckbox: upsClaim ? "Ticked" : "Unticked",
        refundToCollect,
        refundReason,
        storeCreditCheckbox: storeCredit ? "Ticked" : "Unticked",
        returnTrackingCust: returnTrackingNo || "",
      };

      const { data } = await API.patch(
        `/orders/${encodeURIComponent(orderNo)}/additionalInfo/${yardIndex + 1}/refundStatus`,
        payload,
        { params: { firstName } }
      );

      setToast("Refund details saved successfully!");
      await onSubmit?.(data);
      setTimeout(() => {
        setToast("");
        onClose();
      }, 1000);
    } catch (err) {
      console.error("Refund error:", err);
      setToast("Error saving refund details.");
    } finally {
      setLoading(false);
    }
  };

  const handleAttachPO = () => document.getElementById("poFileInput").click();
  const handleFileChange = (e) => {
    const uploaded = e.target.files?.[0];
    if (uploaded && uploaded.type === "application/pdf") {
      setFile(uploaded);
      setToast(`Attached: ${uploaded.name}`);
    } else setToast("Please attach a valid PDF file.");
  };

  const resolveEmailsBase = () => {
    const base = (API?.defaults?.baseURL || window.location.origin || "").trim();
    if (!base) return "";
    return base.replace(/\/api\/?$/, "").replace(/\/$/, "");
  };

  const getRequestConfig = () => {
    if (isLocalDev()) {
      return {};
    }
    return { baseURL: (API?.defaults?.baseURL || "").replace(/\/$/, "") };
  };

  const handleSendRefundEmail = async () => {
    // Prevent multiple simultaneous calls
    if (sendingEmail) return;
    
    if (!file) return setToast("Attach a PO PDF first.");

    const trimmedCollect = String(refundToCollect ?? "").trim();

    if (!trimmedCollect) {
      setToast("Refund To Be Collected is required before sending the refund email.");
      return;
    }

    if (!refundReason) {
      setToast("Refund Reason is required before sending the refund email.");
      return;
    }

    try {
      setSendingEmail(true);
      const formData = new FormData();
      formData.append("pdfFile", file);

      // Get firstName once and ensure it's not duplicated
      const firstName = localStorage.getItem("firstName") || "";
      
      // Construct params object cleanly to avoid duplicates
      const params = new URLSearchParams();
      params.append("yardIndex", String(yardIndex + 1));
      params.append("refundReason", refundReason || "");
      params.append("refundToCollect", refundToCollect || "");
      params.append("returnTracking", returnTrackingNo || "");
      if (firstName) {
        params.append("firstName", firstName);
      }

      const response = await API.post(
        `/emails/orders/sendRefundEmail/${encodeURIComponent(orderNo)}?${params.toString()}`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
      if (response?.data?.message) {
        setToast(response.data.message);
      } else {
        setToast("Refund email sent successfully!");
      }
    } catch (err) {
      console.error("Send refund email error:", err);
      setToast("Error sending refund email.");
    } finally {
      setSendingEmail(false);
    }
  };

  const isLocalDev = () => typeof window !== "undefined" && window.location.hostname === "localhost";

  return (
    <>
      <style>{`
        /* YardRefundCollectModal Light Mode Styles */
        html:not(.dark) .yard-refund-collect-modal-container {
          background: rgba(240, 249, 255, 0.95) !important;
          border: 1.5px solid rgba(59, 130, 246, 0.3) !important;
          color: #1a1a1a !important;
          overflow: hidden !important;
        }
        html:not(.dark) .yard-refund-collect-modal-container header {
          background: rgba(240, 249, 255, 0.9) !important;
          border-bottom: 2px solid rgba(59, 130, 246, 0.3) !important;
          border-top-left-radius: 1rem !important;
          border-top-right-radius: 1rem !important;
        }
        html.dark .yard-refund-collect-modal-container header {
          border-top-left-radius: 1rem !important;
          border-top-right-radius: 1rem !important;
        }
        html:not(.dark) .yard-refund-collect-modal-container header h3 {
          color: #0f172a !important;
          font-weight: 700 !important;
        }
        html:not(.dark) .yard-refund-collect-modal-container label {
          color: #1a1a1a !important;
          font-weight: 600 !important;
        }
        html:not(.dark) .yard-refund-collect-modal-container input,
        html:not(.dark) .yard-refund-collect-modal-container select {
          background: #e0f2fe !important;
          border: 1.5px solid rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .yard-refund-collect-modal-container input:focus,
        html:not(.dark) .yard-refund-collect-modal-container select:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15) !important;
          background: #ffffff !important;
          outline: none !important;
        }
        html:not(.dark) .yard-refund-collect-modal-container select option {
          background: #ffffff !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .yard-refund-collect-modal-container select.bg-\[#2b2d68\] {
          background: #dbeafe !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .yard-refund-collect-modal-container select.bg-\[#2b2d68\]:hover {
          background: #bfdbfe !important;
        }
        html:not(.dark) .yard-refund-collect-modal-container footer {
          border-top: 2px solid rgba(59, 130, 246, 0.3) !important;
          border-bottom-left-radius: 1rem !important;
          border-bottom-right-radius: 1rem !important;
        }
        html.dark .yard-refund-collect-modal-container footer {
          border-bottom-left-radius: 1rem !important;
          border-bottom-right-radius: 1rem !important;
        }
        html:not(.dark) .yard-refund-collect-modal-close-btn {
          background: #dbeafe !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .yard-refund-collect-modal-close-btn:hover {
          background: #bfdbfe !important;
        }
        html:not(.dark) .yard-refund-collect-modal-submit-btn {
          background: #1e40af !important;
          color: #ffffff !important;
          border-color: #1e40af !important;
        }
        html:not(.dark) .yard-refund-collect-modal-submit-btn:hover:not(:disabled) {
          background: #1e3a8a !important;
        }
        html:not(.dark) .yard-refund-collect-modal-submit-btn:disabled {
          background: #e5e7eb !important;
          color: #9ca3af !important;
          border-color: #d1d5db !important;
        }
      `}</style>
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-2xl rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-xl shadow-2xl yard-refund-collect-modal-container overflow-hidden dark:border-white/20 dark:bg-white/10 dark:text-white">
          <header className="flex items-center justify-between px-5 py-3 border-b border-white/20 rounded-t-2xl dark:border-white/20">
          <h3 className="text-lg font-semibold">Refund Details</h3>
          <button onClick={onClose} className="px-2 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20 yard-refund-collect-modal-close-btn dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/20 dark:text-white">
            ✕
          </button>
        </header>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1">Refund Collected:</label>
              <select
                value={refundStatus}
                onChange={(e) => {
                  const newStatus = e.target.value;
                  setRefundStatus(newStatus);
                  // Auto-uncheck Collect Refund and UPS Claim when "Yes" is selected
                  if (newStatus === "Refund collected") {
                    setCollectRefund(false);
                    setUpsClaim(false);
                  }
                }}
                className="w-full rounded-lg px-3 py-2 bg-[#2b2d68] text-white border border-white/30 outline-none focus:ring-2 focus:ring-white/60 text-center hover:bg-[#1f2760] transition-colors dark:bg-[#2b2d68] dark:hover:bg-[#1f2760] dark:text-white"
              >
                <option value="">Select</option>
                <option value="Refund collected">Yes</option>
                <option value="Refund not collected">No</option>
              </select>
            </div>

            <div>
              <label className="block mb-1">Refunded Amount ($):</label>
              <input
                type="number"
                value={refundedAmount}
                onChange={(e) => setRefundedAmount(e.target.value)}
                className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 outline-none text-center dark:bg-white/10 dark:border-white/30 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1">Refunded Date:</label>
              <input
                type="date"
                value={refundedDate}
                onChange={(e) => setRefundedDate(e.target.value)}
                className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 outline-none text-center dark:bg-white/10 dark:border-white/30 dark:text-white"
              />
            </div>

            <div>
              <label className="block mb-1">Refund Reason:</label>
              <select
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="w-full rounded-lg px-3 py-2 bg-[#2b2d68] text-white border border-white/30 outline-none focus:ring-2 focus:ring-white/60 text-center hover:bg-[#1f2760] transition-colors dark:bg-[#2b2d68] dark:hover:bg-[#1f2760] dark:text-white"
              >
                <option value="">Choose</option>
                <option value="Damaged">Damaged</option>
                <option value="Defective">Defective</option>
                <option value="Incorrect">Incorrect</option>
                <option value="Lost">Lost</option>
                <option value="Not programming">Not programming</option>
                <option value="Part not communicating">Part not communicating</option>
                <option value="Personal reason">Personal reason</option>
                <option value="PO cancelled">PO cancelled</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1">Refund To Be Collected ($):</label>
              <input
                type="number"
                value={refundToCollect}
                onChange={(e) => setRefundToCollect(e.target.value)}
                className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 outline-none text-center dark:bg-white/10 dark:border-white/30 dark:text-white"
              />
            </div>
            <div>
              <label className="block mb-1">Return Tracking No.</label>
              <input
                type="text"
                value={returnTrackingNo}
                onChange={(e) => setReturnTrackingNo(e.target.value)}
                placeholder="Enter tracking no."
                className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 outline-none text-center dark:bg-white/10 dark:border-white/30 dark:text-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={collectRefund}
                onChange={handleSelectionChange("collect")}
                className="accent-[#2b2d68] w-4 h-4"
              />
              Collect Refund
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={upsClaim}
                onChange={handleSelectionChange("ups")}
                className="accent-[#2b2d68] w-4 h-4"
              />
              UPS Claim
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={storeCredit}
                onChange={handleSelectionChange("store")}
                className="accent-[#2b2d68] w-4 h-4"
              />
              Store Credit
            </label>
          </div>

          <div className="pt-3 border-t border-white/20">
            <label className="block text-sm mb-1">Attach PO (PDF only):</label>
            <div className="flex items-center gap-3">
              <button onClick={handleAttachPO} className="px-3 py-1.5 rounded-md bg-white/10 border border-white/30 hover:bg-white/20">
                Attach a PO
              </button>
              {file && <span className="text-xs text-green-300">{file.name}</span>}
              <input type="file" id="poFileInput" accept=".pdf" onChange={handleFileChange} style={{ display: "none" }} />
            </div>
          </div>

          <div className="pt-2">
            <button 
              onClick={handleSendRefundEmail} 
              disabled={sendingEmail || loading} 
              className={`px-3 py-1.5 rounded-md !bg-[#090c6c] hover:!bg-[#242775] text-white border-white/30 transition ${
                sendingEmail || loading ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              {sendingEmail ? "Sending..." : "Send Refund Email"}
            </button>
          </div>
        </div>

        <footer className="flex justify-end gap-2 px-5 py-3 border-t border-white/20 rounded-b-2xl dark:border-white/20">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md bg-white/10 border border-white/20 hover:bg-white/20 yard-refund-collect-modal-close-btn dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/20 dark:text-white">
            Close
          </button>
          <button onClick={handleSubmit} disabled={loading} className={`px-3 py-1.5 rounded-md border transition yard-refund-collect-modal-submit-btn ${
            loading
              ? "bg-gray-400 text-gray-700 border-gray-300 cursor-not-allowed"
              : "bg-white text-[#04356d] border-white/20 hover:bg-white/90 dark:bg-white dark:text-[#04356d] dark:hover:bg-white/90"
          }`}>
            {loading ? "Saving..." : "Save"}
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
