import { useEffect, useState } from "react";

export default function SaleNote({ orderNo }) {
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
        let res = await fetch(`http://localhost:5000/orders/${orderNo}`);
        let data = await res.json();

        // If not found, fallback to cancelledOrders
        if (!data || !data.notes) {
          console.log("Not found in orders, checking cancelledOrders...");
          res = await fetch(`http://localhost:5000/cancelledOrders/${orderNo}`);
          if (res.status === 404) {
            setError("No sale notes found for this order.");
            return;
          }
          data = await res.json();
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
    <div className="mt-4 p-4 rounded-xl bg-white/10 border border-white/20 text-white max-h-[220px] overflow-y-auto backdrop-blur-sm">
      <h3 className="text-base font-semibold mb-2 border-b border-white/20 pb-1">
        Sale Notes
      </h3>

      {loading && <p className="text-gray-400 text-sm">Loading sale notes...</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {!loading && !error && noteData && (
        <div className="space-y-1 text-sm">
          <p>
            <strong>Sale Note:</strong>{" "}
            <span className="text-gray-200">{noteData.notes}</span>
          </p>
          <p>
            <strong>Programming Required:</strong>{" "}
            <span className="text-gray-200">{noteData.programmingRequired}</span>
          </p>
          <p>
            <strong>Programming Cost:</strong>{" "}
            <span className="text-gray-200">${noteData.programmingCostQuoted}</span>
          </p>
          <p>
            <strong>Expedite Shipping:</strong>{" "}
            <span className="text-gray-200">{noteData.expediteShipping}</span>
          </p>
        </div>
      )}
    </div>
  );
}
