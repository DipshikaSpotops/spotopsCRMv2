import { useEffect, useState, useCallback } from "react";
import Select, { SelectTrigger, SelectValue, SelectContent, SelectItem } from "../../ui/Select";
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
      const rawStatus = String(yard.paymentStatus || "")
        .toLowerCase()
        .trim();

      if (rawStatus === "card charged" || rawStatus === "charged") {
        setPaymentStatus("Card charged");
      } else if (rawStatus === "card not charged" || rawStatus === "not charged") {
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
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-xl shadow-2xl">
        <header className="flex items-center justify-between px-5 py-3 border-b border-white/20">
          <h3 className="text-lg font-semibold">Card Charged Details</h3>
          <button onClick={onClose} className="px-2 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20">
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
            <Select
              value={paymentStatus}
              onValueChange={(val) => setPaymentStatus(val)}
            >
              <SelectTrigger className="!bg-[#2b2d68] hover:!bg-[#090c6c] w-full">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Card charged">Charged</SelectItem>
                <SelectItem value="Card not charged">Not charged</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm mb-1">Card Charged Date:</label>
            <input
              type="date"
              value={cardChargedDate}
              onChange={(e) => setCardChargedDate(e.target.value)}
              className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 outline-none text-center"
            />
          </div>
        </div>

        <footer className="flex justify-end gap-2 px-5 py-3 border-t border-white/20">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md bg-white/10 border border-white/20 hover:bg-white/20">
            Close
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`px-3 py-1.5 rounded-md border transition ${
              loading
                ? "bg-gray-400 text-gray-700 border-gray-300 cursor-not-allowed"
                : "bg-white text-[#04356d] border-white/20 hover:bg-white/90"
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
  );
}
