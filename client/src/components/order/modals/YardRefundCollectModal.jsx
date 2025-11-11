import { useEffect, useState } from "react";
import { getWhen, toDallasIso } from "@spotops/shared";
import API from "../../../api";

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
  const [toast, setToast] = useState("");

  // 🔹 Prefill backend data
  useEffect(() => {
    if (open && yard) {
      setRefundStatus(yard.refundStatus || "");
      setRefundedAmount(yard.refundedAmount || "");
      setRefundToCollect(yard.refundToCollect || "");
      setRefundedDate(yard.refundedDate ? yard.refundedDate.split("T")[0] : "");
      setRefundReason(yard.refundReason || "");
      setReturnTrackingNo(yard.returnTrackingCust || "");
      setCollectRefund(yard.collectRefundCheckbox === "Ticked");
      setUpsClaim(yard.upsClaimCheckbox === "Ticked");
      setStoreCredit(yard.storeCreditCheckbox === "Ticked");
    }
  }, [open, yard]);

  if (!open) return null;

  const validateBeforeSubmit = () => {
    const trimmedCollect = String(refundToCollect ?? "").trim();
    const trimmedRefundedAmount = String(refundedAmount ?? "").trim();

    if ((collectRefund || upsClaim) && !trimmedCollect) {
      setToast("Refund To Be Collected is required when Collect Refund or UPS Claim is ticked.");
      return false;
    }

    if (!collectRefund && !upsClaim) {
      if (!refundStatus) {
        setToast("Please choose a value for Refund Collected.");
        return false;
      }
      if (!trimmedRefundedAmount) {
        setToast("Refunded Amount is required when no refund is pending.");
        return false;
      }
      if (!refundedDate) {
        setToast("Refunded Date is required when no refund is pending.");
        return false;
      }
    }
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

  const handleSendRefundEmail = async () => {
    if (!file) return setToast("Attach a PO PDF first.");

    if ((collectRefund || upsClaim) && !String(refundToCollect ?? "").trim()) {
      setToast("Refund To Be Collected is required before sending the refund email.");
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append("pdfFile", file); // ✅ match backend field name

      await API.post(
        `/emails/orders/sendRefundEmail/${encodeURIComponent(orderNo)}`,
        formData,
        {
          params: {
            yardIndex: yardIndex + 1,
            refundReason: refundReason || "",
            refundToCollect: refundToCollect || "",
            returnTracking: returnTrackingNo || "",
            firstName: localStorage.getItem("firstName") || "",
          },
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
      setToast("Refund email sent successfully!");
    } catch (err) {
      console.error("Send refund email error:", err);
      setToast("Error sending refund email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-xl shadow-2xl">
        <header className="flex items-center justify-between px-5 py-3 border-b border-white/20">
          <h3 className="text-lg font-semibold">Refund Details</h3>
          <button onClick={onClose} className="px-2 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20">
            ✕
          </button>
        </header>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1">Refund Collected:</label>
              <select
                value={refundStatus}
                onChange={(e) => setRefundStatus(e.target.value)}
                className="w-full rounded-lg px-3 py-2 bg-[#2b2d68] text-white border border-white/30 outline-none focus:ring-2 focus:ring-white/60 text-center hover:bg-[#1f2760] transition-colors"
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
                className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 outline-none text-center"
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
                className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 outline-none text-center"
              />
            </div>

            <div>
              <label className="block mb-1">Refund Reason:</label>
              <select
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="w-full rounded-lg px-3 py-2 bg-[#2b2d68] text-white border border-white/30 outline-none focus:ring-2 focus:ring-white/60 text-center hover:bg-[#1f2760] transition-colors"
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
                className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 outline-none text-center"
              />
            </div>
            <div>
              <label className="block mb-1">Return Tracking No.</label>
              <input
                type="text"
                value={returnTrackingNo}
                onChange={(e) => setReturnTrackingNo(e.target.value)}
                placeholder="Enter tracking no."
                className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 outline-none text-center"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={collectRefund} onChange={(e) => setCollectRefund(e.target.checked)} className="accent-[#2b2d68] w-4 h-4" />
              Collect Refund
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={upsClaim} onChange={(e) => setUpsClaim(e.target.checked)} className="accent-[#2b2d68] w-4 h-4" />
              UPS Claim
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={storeCredit} onChange={(e) => setStoreCredit(e.target.checked)} className="accent-[#2b2d68] w-4 h-4" />
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
            <button onClick={handleSendRefundEmail} disabled={loading} className="px-3 py-1.5 rounded-md !bg-[#090c6c] hover:!bg-[#242775] text-white border-white/30">
              Send Refund Email
            </button>
          </div>
        </div>

        <footer className="flex justify-end gap-2 px-5 py-3 border-t border-white/20">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md bg-white/10 border border-white/20 hover:bg-white/20">
            Close
          </button>
          <button onClick={handleSubmit} disabled={loading} className={`px-3 py-1.5 rounded-md border transition ${
            loading
              ? "bg-gray-400 text-gray-700 border-gray-300 cursor-not-allowed"
              : "bg-white text-[#04356d] border-white/20 hover:bg-white/90"
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
  );
}
