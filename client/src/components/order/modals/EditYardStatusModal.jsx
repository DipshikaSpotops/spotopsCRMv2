import { useState, useEffect, useRef, useMemo } from "react";
import API from "../../../api";

/* ---------------------- Toast Banner ---------------------- */
function Toast({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white text-black px-6 py-4 rounded-lg shadow-lg border border-gray-300 z-[200] text-sm font-medium flex items-center gap-4">
      <span>{message}</span>
      <button
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClose?.();
          }
        }}
        className="ml-3 px-3 py-1 text-sm font-semibold bg-[#04356d] text-white rounded-md hover:bg-[#021f4b] transition"
      >
        OK
      </button>
    </div>
  );
}

const STATUS_OPTIONS = [
  "Yard located",
  "Yard PO Sent",
  "Label created",
  "PO cancelled",
  "Part shipped",
  "Part delivered",
  "Escalation",
];

const ORDER_STATUS_MAP = {
  "Yard located": "Yard Processing",
  "Yard PO Sent": "Yard Processing",
  "Label created": "Yard Processing",
  "PO cancelled": "Yard Processing",
  "Part shipped": "In Transit",
  "Part delivered": "Order Fulfilled",
  Escalation: "Escalation",
};

const SHIPPERS = [
  "UPS",
  "World Wide Express",
  "FedEx",
  "Central Transport",
  "R&L Carriers",
  "Others",
];

export default function EditYardStatusModal({
  open,
  yard,
  yardIndex,
  order,
  onClose,
  onSave,
  onEmailSending,
}) {
  const [status, setStatus] = useState(yard?.status || "Yard located");
  const [escCause, setEscCause] = useState(yard?.escalationCause || "");
  const [escTicked] = useState(!!yard?.escTicked);
  const [toast, setToast] = useState("");

  // label fields (form state)
  const [trackingNo, setTrackingNo] = useState(yard?.trackingNo || "");
  const [eta, setEta] = useState(yard?.eta || "");
  const [shipperName, setShipperName] = useState(yard?.shipperName || "");
  const [otherShipper, setOtherShipper] = useState("");
  const [trackingLink, setTrackingLink] = useState(yard?.trackingLink || "");

  const [showPO, setShowPO] = useState(false);
  const [showTracking, setShowTracking] = useState(false);
  const [showEsc, setShowEsc] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingAction, setSavingAction] = useState(null);

  const fileInputRef = useRef(null);
  const rootApiBase = useMemo(() => {
    const base = API?.defaults?.baseURL || "";
    return base.replace(/\/api$/, "");
  }, []);

  /* ---------------------- useEffects ---------------------- */
  useEffect(() => {
    if (!open) {
      // Clear toast when modal closes
      setToast("");
      return;
    }
    // Clear toast when modal opens
    setToast("");
    setStatus(yard?.status || "Yard located");
    setEscCause(yard?.escalationCause || "");
    setTrackingNo(yard?.trackingNo || "");
    setEta(yard?.eta || "");
    
    // Handle shipper name - if saved shipper is not in SHIPPERS list, set to "Others" and populate otherShipper
    const savedShipperName = (yard?.shipperName == null ? "" : String(yard.shipperName)).trim();
    if (savedShipperName && !SHIPPERS.includes(savedShipperName)) {
      setShipperName("Others");
      setOtherShipper(savedShipperName);
    } else {
      setShipperName(savedShipperName || "");
    setOtherShipper("");
    }
    
    setTrackingLink(yard?.trackingLink || "");

    const st = yard?.status || "";
    setShowPO(st === "Yard PO Sent");
    setShowTracking(st === "Label created" || st === "Part shipped");
    setShowEsc(st === "Escalation");
  }, [open, yard]);

  useEffect(() => {
    setShowPO(status === "Yard PO Sent");
    setShowTracking(status === "Label created" || status === "Part shipped");
    setShowEsc(status === "Escalation");
  }, [status]);

  if (!open) return null;

  /* ---------------------- helpers ---------------------- */
  const t = (v) => (v == null ? "" : String(v)).trim();

  // Check if we have enough label-related data in the current form
  const hasLabelFormData = () => {
    const chosenShipper = shipperName === "Others" ? t(otherShipper) : t(shipperName);
    return [t(trackingNo), t(eta), chosenShipper, t(trackingLink)].some(Boolean);
  };

  /* ---------------------- SAVE ---------------------- */
  const save = async (sendEmail = false) => {
    if (savingAction) return;

    try {
      setLoading(true);
      setSavingAction(sendEmail ? "saveAndSendEmail" : "save");
      setToast("");

      const firstName = localStorage.getItem("firstName");
      const orderNo = order?.orderNo;
      const chosenShipper =
        shipperName === "Others" ? t(otherShipper) : t(shipperName);

      // Validation
      if (
        (status === "Label created" || status === "Part shipped") &&
        (!t(trackingNo) || !t(eta) || !chosenShipper || !t(trackingLink))
      ) {
        setToast("Please fill Tracking No, ETA, Shipper, and Tracking Link before saving.");
        setLoading(false);
        setSavingAction(null);
        return;
      }

      const prevEsc = String(yard?.escTicked ?? "").trim().toLowerCase();
      const alreadyEscalated = prevEsc === "yes" || prevEsc === "true";

      const body = {
        status,
        escalationCause: showEsc ? t(escCause) : undefined,
        // For "Part delivered", preserve existing tracking fields if they exist, otherwise use form values
        trackingNo: showTracking ? t(trackingNo) : (status === "Part delivered" && yard?.trackingNo ? yard.trackingNo : undefined),
        eta: showTracking ? t(eta) : (status === "Part delivered" && yard?.eta ? yard.eta : undefined),
        shipperName: showTracking ? chosenShipper : (status === "Part delivered" && yard?.shipperName ? yard.shipperName : undefined),
        trackingLink: showTracking ? t(trackingLink) : (status === "Part delivered" && yard?.trackingLink ? yard.trackingLink : undefined),
        orderStatus: ORDER_STATUS_MAP[status],
        // Always skip backend email sending - frontend will handle it exclusively when sendEmail is true
        skipEmail: status === "Part shipped" || status === "Part delivered",
      };

      if (status === "Escalation") {
        if (!t(escCause)) {
          setToast("Select an escalation reason before saving.");
          setLoading(false);
          setSavingAction(null);
          return;
        }
      }

      if (status === "Escalation" || alreadyEscalated) {
        body.escTicked = "Yes";
      }

      // Save to MongoDB first
      console.log("[EditYardStatusModal] Saving with body:", body);
      const saveResponse = await API.put(
        `/orders/${encodeURIComponent(orderNo)}/additionalInfo/${yardIndex + 1}`,
        body,
        { params: { firstName } }
      );

      // Verify save was successful
      if (!saveResponse?.data) {
        throw new Error("Save failed - no response from server");
      }

      // Verify the status was actually saved
      const savedOrder = saveResponse.data?.order || saveResponse.data;
      const savedYard = savedOrder?.additionalInfo?.[yardIndex];
      const savedStatus = savedYard?.status;
      
      console.log("[EditYardStatusModal] Save response:", {
        requestedStatus: status,
        savedStatus: savedStatus,
        savedYard: savedYard
      });

      if (savedStatus && savedStatus !== status) {
        console.warn(`[EditYardStatusModal] Status mismatch: requested "${status}" but saved "${savedStatus}"`);
      }

      // Show success message
      if (sendEmail && (status === "Part shipped" || status === "Part delivered")) {
        setToast(`Yard ${yardIndex + 1} status updated to ${status}. Sending email...`);
      } else {
        setToast(`Yard ${yardIndex + 1} status updated to ${status}.`);
      }

      // CRITICAL: Call onSave to preserve active yard index before refresh happens
      onSave?.();

      // Set loading state immediately if email needs to be sent
      if (sendEmail && (status === "Part shipped" || status === "Part delivered")) {
        // Notify parent to show loading indicator with specific status
        onEmailSending?.(true, status);
      }

      // Close modal after a brief delay to show success message
      setTimeout(() => {
        onClose();
      }, sendEmail ? 500 : 0);

      // Send email in background if sendEmail is true (don't await - let it run async)
      if (sendEmail && (status === "Part shipped" || status === "Part delivered")) {
        console.log("[EditYardStatusModal] Sending email from frontend (sendEmail=true)");
        // Send email in background - websocket will notify when done
        const emailPromise = status === "Part shipped"
          ? API.post(
              `/emails/orders/sendTrackingInfo/${encodeURIComponent(orderNo)}`,
              {
                trackingNo,
                eta,
                shipperName: chosenShipper,
                link: trackingLink,
                firstName,
                yardIndex: yardIndex + 1,
              },
              {
                baseURL: rootApiBase || undefined,
              }
            )
          : API.post(
              `/emails/customer-delivered/${encodeURIComponent(orderNo)}`,
              null,
              {
                baseURL: rootApiBase || undefined,
                params: { yardIndex: yardIndex + 1, firstName },
              }
            );

        // Don't await - let it run in background
        emailPromise
          .then((response) => {
            console.log("[EditYardStatusModal] Email sent successfully from frontend", response?.data);
            // Clear the toast since email is sent
            setToast("");
            // Loading will be cleared by websocket EMAIL_SENT event
            // But also set a fallback timeout in case websocket doesn't work
            setTimeout(() => {
              // If loading is still true after 5 seconds, clear it
              // This handles cases where websocket fails
              onEmailSending?.(false);
            }, 5000);
          })
          .catch((emailErr) => {
            console.error("[EditYardStatusModal] Email sending failed", emailErr);
            // Hide loading on error immediately
            onEmailSending?.(false);
            // Clear the toast and show error message if modal is still open
            setToast("");
            // Show error toast
            const errorMessage = emailErr?.response?.data?.message || emailErr?.message || "Failed to send email";
            console.error("[EditYardStatusModal] Email error details:", errorMessage);
          });
      }
    } catch (err) {
      console.error("Error updating yard:", err);
      const message = err?.response?.data?.message || "Error updating yard. Please try again.";
      setToast(message);
    } finally {
      setLoading(false);
      setSavingAction(null);
    }
  };

  /* ---------------------- SAVE AND SEND EMAIL ---------------------- */
  const saveAndSendEmail = () => {
    save(true);
  };

  /* ---------------------- VOID LABEL ---------------------- */
  const voidLabel = async () => {
    if (savingAction) return;

    try {
      setLoading(true);
      setSavingAction("void");
      const firstName = localStorage.getItem("firstName");
      const orderNo = order?.orderNo;

      await API.put(
        `/orders/${encodeURIComponent(orderNo)}/additionalInfo/${yardIndex + 1}`,
        { voidLabel: true },
        { params: { firstName } }
      );

      setToast("Label voided successfully, and status updated to Yard PO Sent.");
    } catch (e) {
      console.error(e);
      const message = e?.response?.data?.message || "Error voiding label. Please try again.";
      setToast(message);
    } finally {
      setLoading(false);
      setSavingAction(null);
    }
  };

  /* ---------------------- CANCEL SHIPMENT ---------------------- */
  const cancelShipment = async () => {
    if (savingAction) return;

    try {
      setLoading(true);
      setSavingAction("cancelShipment");
      const firstName = localStorage.getItem("firstName");
      const orderNo = order?.orderNo;

      await API.put(
        `/orders/${encodeURIComponent(orderNo)}/cancelShipment`,
        { yardIndex: yardIndex + 1 },
        { params: { firstName } }
      );

      setToast("Shipment cancelled and status moved to 'Yard PO Sent'.");
    } catch (e) {
      console.error(e);
      const message = e?.response?.data?.message || "Error cancelling shipment. Please try again.";
      setToast(message);
    } finally {
      setLoading(false);
      setSavingAction(null);
    }
  };

  /* ---------------------- SEND PO ---------------------- */
  const sendPO = async () => {
    if (savingAction) return;

    try {
      setLoading(true);
      setSavingAction("sendPO");
      const formData = new FormData();
      formData.append("yardIndex", String(yardIndex));

      const files = fileInputRef.current?.files || [];
      for (let i = 0; i < files.length; i++) {
        formData.append("images", files[i]);
      }

      const firstName = localStorage.getItem("firstName");
      const orderNo = order?.orderNo;

      const { data } = await API.post(
        `/sendPOEmailYard/${encodeURIComponent(orderNo)}`,
        formData,
        {
          params: { firstName },
          // PDF generation can take longer locally; allow up to 60s for this request
          timeout: 60000,
        }
      );

      if (data?.message?.includes?.("No yard email")) {
        setToast("Yard email missing. PO not sent.");
      } else {
        // Backend already updates status to "Yard PO Sent" - just update local state
        setStatus("Yard PO Sent");
        setToast(data?.message || "PO sent successfully and status updated!");
        // Close popup after a short delay
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    } catch (err) {
      console.error("Error sending PO:", err);
      const errorMessage = err?.response?.data?.error || err?.response?.data?.message || err?.message || "Error sending PO";
      const fullMessage = err?.response?.data?.message 
        ? `${err.response.data.message}: ${errorMessage}`
        : errorMessage;
      setToast(fullMessage);
    } finally {
      setLoading(false);
      setSavingAction(null);
    }
  };

  /* ---------------------- JSX ---------------------- */
  return (
    <>
      <style>{`
        /* EditYardStatusModal Light Mode Styles */
        html:not(.dark) .edit-yard-status-modal-container {
          background: rgba(240, 249, 255, 0.95) !important;
          border: 1.5px solid rgba(59, 130, 246, 0.3) !important;
          color: #1a1a1a !important;
          overflow: hidden !important;
        }
        html:not(.dark) .edit-yard-status-modal-container header {
          background: rgba(240, 249, 255, 0.9) !important;
          border-bottom: 2px solid rgba(59, 130, 246, 0.3) !important;
          border-top-left-radius: 1rem !important;
          border-top-right-radius: 1rem !important;
        }
        html.dark .edit-yard-status-modal-container header {
          border-top-left-radius: 1rem !important;
          border-top-right-radius: 1rem !important;
        }
        html:not(.dark) .edit-yard-status-modal-container header h3 {
          color: #0f172a !important;
          font-weight: 700 !important;
        }
        html:not(.dark) .edit-yard-status-modal-container label {
          color: #1a1a1a !important;
          font-weight: 600 !important;
        }
        html:not(.dark) .edit-yard-status-modal-container input,
        html:not(.dark) .edit-yard-status-modal-container select,
        html:not(.dark) .edit-yard-status-modal-container textarea {
          background: #e0f2fe !important;
          border: 1.5px solid rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .edit-yard-status-modal-container input:focus,
        html:not(.dark) .edit-yard-status-modal-container select:focus,
        html:not(.dark) .edit-yard-status-modal-container textarea:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15) !important;
          background: #ffffff !important;
          outline: none !important;
        }
        html:not(.dark) .edit-yard-status-modal-container select option {
          background: #ffffff !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .edit-yard-status-modal-container select.bg-\[#2b2d68\] {
          background: #dbeafe !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .edit-yard-status-modal-container select.bg-\[#2b2d68\]:hover {
          background: #bfdbfe !important;
        }
        html:not(.dark) .edit-yard-status-modal-container .bg-white\/10 {
          background: rgba(240, 249, 255, 0.6) !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
        }
        html:not(.dark) .edit-yard-status-modal-container footer {
          border-top: 2px solid rgba(59, 130, 246, 0.3) !important;
          border-bottom-left-radius: 1rem !important;
          border-bottom-right-radius: 1rem !important;
        }
        html.dark .edit-yard-status-modal-container footer {
          border-bottom-left-radius: 1rem !important;
          border-bottom-right-radius: 1rem !important;
        }
        html:not(.dark) .edit-yard-status-modal-close-btn {
          background: #dbeafe !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .edit-yard-status-modal-close-btn:hover {
          background: #bfdbfe !important;
        }
        html:not(.dark) .edit-yard-status-modal-submit-btn {
          background: #1e40af !important;
          color: #ffffff !important;
          border-color: #1e40af !important;
        }
        html:not(.dark) .edit-yard-status-modal-submit-btn:hover:not(:disabled) {
          background: #1e3a8a !important;
        }
        html:not(.dark) .edit-yard-status-modal-submit-btn:disabled {
          background: #e5e7eb !important;
          color: #9ca3af !important;
          border-color: #d1d5db !important;
        }
        /* Light mode styling for Send PO button */
        html:not(.dark) .edit-yard-status-modal-container .send-po-btn {
          background: #1e40af !important;
          color: #ffffff !important;
          border-color: #1e40af !important;
        }
        html:not(.dark) .edit-yard-status-modal-container .send-po-btn:hover:not(:disabled) {
          background: #1e3a8a !important;
          border-color: #1e3a8a !important;
        }
        html:not(.dark) .edit-yard-status-modal-container .send-po-btn:disabled {
          background: #e5e7eb !important;
          color: #9ca3af !important;
          border-color: #d1d5db !important;
        }
      `}</style>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-2xl rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-xl shadow-2xl edit-yard-status-modal-container overflow-hidden dark:border-white/20 dark:bg-white/10 dark:text-white">
          <header className="flex items-center justify-between px-5 py-3 border-b border-white/20 rounded-t-2xl dark:border-white/20">
          <h3 className="text-lg font-semibold">Edit Yard Status (Yard {yardIndex + 1})</h3>
          <button
            onClick={onClose}
            className="px-2 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20 edit-yard-status-modal-close-btn dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/20 dark:text-white"
          >
            ✕
          </button>
        </header>

        <div
          className="p-5 space-y-4 max-h-[80vh] overflow-y-auto"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              const tag = e.target?.tagName?.toLowerCase();
              if (tag && tag !== "textarea") {
                e.preventDefault();
                save();
              }
            }
          }}
        >
          {/* Status */}
          <div>
            <label className="block text-sm mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg px-3 py-2 bg-[#2b2d68] hover:bg-[#090c6c] border border-white/30 outline-none dark:bg-[#2b2d68] dark:hover:bg-[#090c6c] dark:text-white"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* PO Section */}
          {showPO && (
            <div className="text-sm bg-white/10 border border-white/20 rounded-xl p-3">
              <p className="mb-2">
                <strong>Note:</strong> You can send PO with or without images.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={sendPO}
                  disabled={savingAction === "sendPO"}
                  className={`px-3 py-1.5 rounded-md text-sm border transition send-po-btn ${
                    savingAction === "sendPO"
                      ? "bg-white/20 text-white/70 border-white/30 cursor-not-allowed"
                      : "bg-white/10 text-white border-white/20 hover:bg-white/20"
                  }`}
                >
                  {savingAction === "sendPO" ? (
                    <span className="flex items-center gap-2">
                      <svg
                        className="animate-spin h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 000 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z"
                        ></path>
                      </svg>
                      Sending…
                    </span>
                  ) : (
                    "Send PO"
                  )}
                </button>
                <input ref={fileInputRef} type="file" multiple accept="image/*" className="text-xs" />
              </div>
            </div>
          )}

          {/* Tracking Section */}
          {showTracking && (
            <div className="grid grid-cols-1 gap-3 text-sm">
              <div>
                <label className="block text-sm mb-1">Tracking No</label>
                <input
                  className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 outline-none dark:bg-white/10 dark:border-white/30 dark:text-white"
                  value={trackingNo}
                  onChange={(e) => setTrackingNo(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm mb-1">ETA</label>
                <input
                  type="date"
                  className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 outline-none dark:bg-white/10 dark:border-white/30 dark:text-white"
                  value={eta}
                  onChange={(e) => setEta(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm mb-1">Shipper</label>
                <select
                  value={shipperName}
                  onChange={(e) => setShipperName(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 bg-[#2b2d68] hover:bg-[#090c6c] border border-white/30 outline-none dark:bg-[#2b2d68] dark:hover:bg-[#090c6c] dark:text-white"
                >
                  <option value="" disabled>
                    Select Shipper
                  </option>
                  <option value="UPS">UPS</option>
                  <option value="World Wide Express">World Wide Express</option>
                  <option value="FedEx">FedEx</option>
                  <option value="Central Transport">Central Transport</option>
                  <option value="R&L Carriers">R&L Carriers</option>
                  <option value="Others">Others</option>
                </select>

                {shipperName === "Others" && (
                  <input
                    className="w-full mt-2 rounded-lg px-3 py-2 bg-white/10 border border-white/30 outline-none dark:bg-white/10 dark:border-white/30 dark:text-white"
                    placeholder="Please specify other shipper"
                    value={otherShipper}
                    onChange={(e) => setOtherShipper(e.target.value)}
                  />
                )}
              </div>

              <div>
                <label className="block text-sm mb-1">Tracking Link</label>
                <input
                  type="url"
                  className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 outline-none dark:bg-white/10 dark:border-white/30 dark:text-white"
                  value={trackingLink}
                  onChange={(e) => setTrackingLink(e.target.value)}
                />
              </div>

              {/* Void / Cancel */}
              {status === "Label created" && hasLabelFormData() && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={voidLabel}
                    disabled={savingAction === "void"}
                    className={`px-3 py-1.5 rounded-md text-sm border transition ${
                      savingAction === "void"
                        ? "bg-white/70 text-[#04356d]/60 border-white/40 cursor-not-allowed"
                        : "bg-white text-[#04356d] border-white/20 hover:bg-white/90"
                    }`}
                  >
                    {savingAction === "void" ? (
                      <span className="flex items-center gap-2">
                        <svg
                          className="animate-spin h-4 w-4 text-[#04356d]"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 000 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z"
                          ></path>
                        </svg>
                        Voiding…
                      </span>
                    ) : (
                      "Void Label"
                    )}
                  </button>
                </div>
              )}

              {status === "Part shipped" && hasLabelFormData() && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={cancelShipment}
                    disabled={savingAction === "cancelShipment"}
                    className={`px-3 py-1.5 rounded-md text-sm border transition ${
                      savingAction === "cancelShipment"
                        ? "bg-white/70 text-[#04356d]/60 border-white/40 cursor-not-allowed"
                        : "bg-white text-[#04356d] border-white/20 hover:bg-white/90"
                    }`}
                  >
                    {savingAction === "cancelShipment" ? (
                      <span className="flex items-center gap-2">
                        <svg
                          className="animate-spin h-4 w-4 text-[#04356d]"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 000 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z"
                          ></path>
                        </svg>
                        Cancelling…
                      </span>
                    ) : (
                      "Cancel Shipment"
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Escalation */}
          {showEsc && (
            <div className="grid grid-cols-1 gap-2">
              <label className="text-sm">Reason</label>
             <select
              value={escCause}
              onChange={(e) => setEscCause(e.target.value)}
              className="w-full rounded-lg px-3 py-2 bg-[#2b2d68] hover:bg-[#090c6c] border border-white/30 outline-none dark:bg-[#2b2d68] dark:hover:bg-[#090c6c] dark:text-white"
            >
              <option value="">Choose</option>
              <option value="Damaged">Damaged</option>
              <option value="Defective">Defective</option>
              <option value="Incorrect">Incorrect</option>
              <option value="Not programming">Not programming</option>
              <option value="Personal reason">Personal reason</option>
            </select>
              <div className="mt-2 flex items-center gap-2 text-xs opacity-90">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked
                    readOnly
                    className="w-4 h-4 accent-[#2b2d68] cursor-not-allowed"
                  />
                  <span className="font-semibold">
                    Escalation Flag: Yes
                  </span>
                </label>
                <span className="italic opacity-70">(auto-updated)</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/20 rounded-b-2xl dark:border-white/20">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md bg-white/10 border border-white/20 hover:bg-white/20 edit-yard-status-modal-close-btn dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/20 dark:text-white"
          >
            Close
          </button>
          {/* Show two buttons for Part shipped or Part delivered */}
          {(status === "Part shipped" || status === "Part delivered") ? (
            <>
              <button
                onClick={() => save(false)}
                disabled={!!savingAction}
                className={`px-3 py-1.5 rounded-md border transition edit-yard-status-modal-submit-btn ${
                  savingAction
                    ? "bg-gray-400 text-gray-700 border-gray-300 cursor-not-allowed"
                    : "bg-white text-[#04356d] border-white/20 hover:bg-white/90 hover:scale-[1.02] dark:bg-white dark:text-[#04356d] dark:hover:bg-white/90"
                }`}
                title={savingAction ? "Please wait..." : "Save without sending email"}
              >
                {savingAction === "save" ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4 text-[#04356d]"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 000 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z"
                      ></path>
                    </svg>
                    Saving...
                  </span>
                ) : (
                  "Save"
                )}
              </button>
              <button
                onClick={saveAndSendEmail}
                disabled={!!savingAction}
                className={`px-3 py-1.5 rounded-md border transition edit-yard-status-modal-submit-btn ${
                  savingAction
                    ? "bg-gray-400 text-gray-700 border-gray-300 cursor-not-allowed"
                    : "bg-[#04356d] text-white border-[#04356d] hover:bg-[#021f4b] hover:scale-[1.02] dark:bg-[#2b2d68] dark:border-white/20 dark:hover:bg-[#1a1f4b]"
                }`}
                title={savingAction ? "Please wait..." : "Save and send email to customer"}
              >
                {savingAction === "saveAndSendEmail" ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 000 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z"
                      ></path>
                    </svg>
                    Saving & Sending...
                  </span>
                ) : (
                  "Save & Send Email"
                )}
              </button>
            </>
          ) : (
            <button
              onClick={() => save(false)}
              disabled={!!savingAction}
              className={`px-3 py-1.5 rounded-md border transition edit-yard-status-modal-submit-btn ${
                savingAction
                  ? "bg-gray-400 text-gray-700 border-gray-300 cursor-not-allowed"
                  : "bg-white text-[#04356d] border-white/20 hover:bg-white/90 hover:scale-[1.02] dark:bg-white dark:text-[#04356d] dark:hover:bg-white/90"
              }`}
              title={savingAction ? "Please wait..." : "Save changes"}
            >
              {savingAction === "save" ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4 text-[#04356d]"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 000 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z"
                    ></path>
                  </svg>
                  Saving...
                </span>
              ) : (
                "Save"
              )}
            </button>
          )}
        </footer>
      </div>


      {/* Toast visible until OK click */}
      <Toast
        message={toast}
        onClose={() => {
          setToast("");
          onClose();
        }}
      />
    </div>
    </>
  );
}
