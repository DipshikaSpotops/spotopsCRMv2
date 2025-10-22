import { useState, useEffect, useRef } from "react";
import Select from "../../ui/Select";

/* ---------------------- Toast Banner ---------------------- */
function Toast({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white text-black px-6 py-4 rounded-lg shadow-lg border border-gray-300 z-[200] text-sm font-medium flex items-center gap-4">
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

export default function EditYardStatusModal({
  open,
  yard,
  yardIndex,
  order,
  onClose,
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

  const fileInputRef = useRef(null);
  const baseUrl = import.meta.env.VITE_API_BASE || "http://localhost:5000";

  /* ---------------------- useEffects ---------------------- */
  useEffect(() => {
    if (!open) return;
    setStatus(yard?.status || "Yard located");
    setEscCause(yard?.escalationCause || "");
    setTrackingNo(yard?.trackingNo || "");
    setEta(yard?.eta || "");
    setShipperName(yard?.shipperName || "");
    setOtherShipper("");
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

  const hasBackendLabelData = () => {
    if (!yard) return false;
    const chosen = t(yard.shipperName);
    return [t(yard.trackingNo), t(yard.eta), chosen, t(yard.trackingLink)].some(Boolean);
  };

  /* ---------------------- SAVE ---------------------- */
  const save = async () => {
    if (loading) return;

    try {
      setLoading(true);
      setToast("");

      const firstName = localStorage.getItem("firstName") || "System";
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
        return;
      }

      const body = {
      status,
      escalationCause: showEsc ? t(escCause) : undefined,
      escTicked: status === "Escalation" ? "Yes" : "No",
      trackingNo: showTracking ? t(trackingNo) : undefined,
      eta: showTracking ? t(eta) : undefined,
      shipperName: showTracking ? chosenShipper : undefined,
      trackingLink: showTracking ? t(trackingLink) : undefined,
      orderStatus: ORDER_STATUS_MAP[status],
    };

      const res = await fetch(
        `${baseUrl}/orders/${encodeURIComponent(orderNo)}/additionalInfo/${yardIndex + 1}?firstName=${encodeURIComponent(firstName)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(data?.message || "Failed to update yard status");
        setLoading(false);
        return;
      }

      // Email logic
      if (status === "Part shipped" || status === "Part delivered") {
        const emailUrl =
          status === "Part shipped"
            ? `${baseUrl}/emails/orders/sendTrackingInfo/${encodeURIComponent(orderNo)}`
            : `${baseUrl}/emails/customer-delivered/${encodeURIComponent(orderNo)}?yardIndex=${yardIndex + 1}&firstName=${encodeURIComponent(firstName)}`;

        const emailBody =
          status === "Part shipped"
            ? JSON.stringify({
                trackingNo,
                eta,
                shipperName: chosenShipper,
                link: trackingLink,
                firstName,
              })
            : undefined;

        const emailRes = await fetch(emailUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: emailBody,
        });

        setToast(
          emailRes.ok
            ? `Yard ${yardIndex + 1} status updated to ${status} — email sent successfully!`
            : `Yard ${yardIndex + 1} status updated to ${status}, but email failed to send.`
        );
      } else {
        setToast(`Yard ${yardIndex + 1} status updated to '${status}'.`);
      }
    } catch (err) {
      console.error("Error updating yard:", err);
      setToast("Error updating yard. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------------- VOID LABEL ---------------------- */
  const voidLabel = async () => {
    try {
      setLoading(true);
      const firstName = localStorage.getItem("firstName") || "System";
      const orderNo = order?.orderNo;

      const res = await fetch(
        `${baseUrl}/orders/${encodeURIComponent(orderNo)}/additionalInfo/${yardIndex + 1}?firstName=${encodeURIComponent(firstName)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voidLabel: true }),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(data?.message || "Failed to void label.");
        return;
      }

      setToast("Label voided successfully, and status updated to 'Yard PO Sent'.");
    } catch (e) {
      console.error(e);
      setToast("Error voiding label. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------------- CANCEL SHIPMENT ---------------------- */
  const cancelShipment = async () => {
    try {
      setLoading(true);
      const firstName = localStorage.getItem("firstName") || "System";
      const orderNo = order?.orderNo;

      const res = await fetch(
        `${baseUrl}/orders/${encodeURIComponent(orderNo)}/cancelShipment?firstName=${encodeURIComponent(firstName)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ yardIndex: yardIndex + 1 }),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(data?.message || "Failed to cancel shipment.");
        return;
      }

      setToast("Shipment cancelled and status moved to 'Yard PO Sent'.");
    } catch (e) {
      console.error(e);
      setToast("Error cancelling shipment. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------------- SEND PO ---------------------- */
  const sendPO = async () => {
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append("yardIndex", yardIndex);

      const files = fileInputRef.current?.files || [];
      for (let i = 0; i < files.length; i++) {
        formData.append("images", files[i]);
      }

      const firstName = localStorage.getItem("firstName") || "System";
      const orderNo = order?.orderNo;

      const res = await fetch(
        `${baseUrl}/sendPOEmailYard/${encodeURIComponent(orderNo)}?firstName=${encodeURIComponent(firstName)}`,
        { method: "POST", body: formData }
      );

      const text = await res.text();
      let data = {};
      try {
        data = JSON.parse(text);
      } catch {}

      if (res.ok) {
        setToast(
          data?.message?.includes?.("No yard email")
            ? "Yard email missing. PO not sent."
            : "PO sent successfully!"
        );
      } else {
        setToast(data?.message || "Failed to send PO.");
      }
    } catch (err) {
      console.error("Error sending PO:", err);
      setToast("Error sending PO");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------------- JSX ---------------------- */
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-xl shadow-2xl">
        <header className="flex items-center justify-between px-5 py-3 border-b border-white/20">
          <h3 className="text-lg font-semibold">Edit Yard Status (Yard {yardIndex + 1})</h3>
          <button
            onClick={onClose}
            className="px-2 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20"
          >
            ✕
          </button>
        </header>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Status */}
          <div>
            <label className="block text-sm mb-1">Status</label>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="!bg-[#2b2d68] hover:!bg-[#090c6c]"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
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
                  className="px-3 py-1.5 rounded-md text-sm border bg-white/10 text-white border-white/20 hover:bg-white/20"
                >
                  Send PO
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
                  className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 outline-none"
                  value={trackingNo}
                  onChange={(e) => setTrackingNo(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm mb-1">ETA</label>
                <input
                  type="date"
                  className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 outline-none"
                  value={eta}
                  onChange={(e) => setEta(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm mb-1">Shipper</label>
                <Select
                  value={shipperName}
                  onChange={(e) => setShipperName(e.target.value)}
                  className="!bg-[#2b2d68] hover:!bg-[#090c6c]"
                >
                  <option value="" disabled>
                    Select Shipper
                  </option>
                  <option value="UPS">UPS</option>
                  <option value="World Wide Express">World Wide Express</option>
                  <option value="FedEx">FedEx</option>
                  <option value="Others">Others</option>
                </Select>

                {shipperName === "Others" && (
                  <input
                    className="w-full mt-2 rounded-lg px-3 py-2 bg-white/10 border border-white/30 outline-none"
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
                  className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 outline-none"
                  value={trackingLink}
                  onChange={(e) => setTrackingLink(e.target.value)}
                />
              </div>

              {/* Void / Cancel */}
              {yard?.status === "Label created" && hasBackendLabelData() && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={voidLabel}
                    className="px-3 py-1.5 rounded-md text-sm border bg-white text-[#04356d] hover:bg-white/90"
                  >
                    Void Label
                  </button>
                </div>
              )}

              {yard?.status === "Part shipped" && hasBackendLabelData() && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={cancelShipment}
                    className="px-3 py-1.5 rounded-md text-sm border bg-white text-[#04356d] hover:bg-white/90"
                  >
                    Cancel Shipment
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Escalation */}
          {showEsc && (
            <div className="grid grid-cols-1 gap-2">
              <label className="text-sm">Reason</label>
             <Select
              value={escCause}
              onChange={(e) => setEscCause(e.target.value)}
              className="!bg-[#2b2d68] hover:!bg-[#090c6c]"
            >
              <option value="">Choose</option>
              <option value="Damaged">Damaged</option>
              <option value="Defective">Defective</option>
              <option value="Incorrect">Incorrect</option>
              <option value="Not programming">Not programming</option>
              <option value="Personal reason">Personal reason</option>
            </Select>
              <div className="mt-2 flex items-center gap-2 text-xs opacity-90">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={status === "Escalation"}
                  readOnly
                  className="w-4 h-4 accent-[#2b2d68] cursor-not-allowed"
                />
                <span className="font-semibold">
                  Escalation Flag: {status === "Escalation" ? "Yes" : "No"}
                </span>
              </label>
              <span className="italic opacity-70">(auto-updated)</span>
            </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/20">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md bg-white/10 border border-white/20 hover:bg-white/20"
          >
            Close
          </button>
          <button
            onClick={save}
            disabled={loading}
            className={`px-3 py-1.5 rounded-md border transition ${
              loading
                ? "bg-gray-400 text-gray-700 border-gray-300 cursor-not-allowed"
                : "bg-white text-[#04356d] border-white/20 hover:bg-white/90 hover:scale-[1.02]"
            }`}
            title={loading ? "Please wait..." : "Save changes"}
          >
            {loading ? (
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
                    fill="current...Color"
                    d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 000 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z"
                  ></path>
                </svg>
                Saving...
              </span>
            ) : (
              "Save"
            )}
          </button>
        </footer>
      </div>

      {/* Loader for email sending */}
      {loading && (status === "Part shipped" || status === "Part delivered") && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-[100]">
          <div className="bg-white text-black px-6 py-4 rounded-xl shadow-lg flex items-center gap-3">
            <svg
              className="animate-spin h-5 w-5 text-[#04356d]"
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
            <span>
              {status === "Part shipped"
                ? "Sending tracking email..."
                : "Sending delivery email..."}
            </span>
          </div>
        </div>
      )}

      {/* Toast visible until OK click */}
      <Toast
        message={toast}
        onClose={() => {
          setToast("");
          onClose();
          window.location.reload();
        }}
      />
    </div>
  );
}
