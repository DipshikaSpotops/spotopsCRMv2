import { useEffect, useState } from "react";
import API from "../../../api";
import Field from "../../ui/Field";
import Input from "../../ui/Input";
export default function SaleNote({ orderNo, className = "" }) {
  const [noteData, setNoteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orderNo) return;

    const fetchSaleNotes = async () => {
      try {
        setLoading(true);
        setError("");

        // Try fetching from main orders first
        let res = await API.get(`/orders/${orderNo}`);
        let data = res.data;

        // If not found, fallback to cancelledOrders
        if (!data || !data.notes) {
          console.log("Not found in orders, checking cancelledOrders...");
          res = await API.get(`/cancelledOrders/${orderNo}`);
          data = res.data;
        }

        if (!data || !data.notes) {
          setError("No sale notes available for this order.");
          return;
        }

        setNoteData({
          notes: data.notes,
          programmingRequired: data.programmingRequired === "true" ? "Yes" : "No",
          programmingCostQuoted: data.programmingCostQuoted || 0,
          expediteShipping: data.expediteShipping === "true" ? "Yes" : "No",
        });
      } catch (err) {
        console.error("Error fetching sale notes:", err);
        setError("Failed to load sale notes.");
      } finally {
        setLoading(false);
      }
    };

    fetchSaleNotes();
  }, [orderNo]);

  return (
    <div
      className={`p-4 rounded-xl bg-white/10 border border-white/20 text-white backdrop-blur-sm ${className}`}
    >
      <h3 className="text-base font-semibold mb-2 border-b border-white/20 pb-1">
        Sale Notes
      </h3>

      {loading && <p className="text-gray-400 text-sm">Loading sale notes...</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {!loading && !error && noteData && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Programming Required">
            <Input
              readOnly
              value={
                noteData.programmingRequired === "Yes"
                  ? `Yes ($${noteData.programmingCostQuoted})`
                  : "No"
              }
            />
          </Field>
          <Field label="Expedite Shipping">
            <Input readOnly value={noteData.expediteShipping} />
          </Field>
        </div>
      )}
    </div>
  );
}
