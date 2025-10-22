import { useEffect, useState } from "react";
import axios from "axios";
import GlassCard from "../../ui/GlassCard";
import { getWhen } from "../../../../../backend/utils/timeUtils";

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

export default function CommentBox({ orderNo, mode = "support", yardIndex = null }) {
  const baseUrl = import.meta.env.VITE_API_BASE || "http://localhost:5000";
  const [comments, setComments] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  /* -------------------- Fetch existing comments -------------------- */
  useEffect(() => {
  if (!orderNo) return;
  (async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${baseUrl}/orders/${orderNo}`);

      if (mode === "support") {
        setComments(res.data?.supportNotes || []);
      } else {
        const yardNotes = res.data?.additionalInfo?.[yardIndex]?.notes || [];
        setComments(yardNotes);
      }
    } catch (err) {
      console.error("Fetch comments error:", err);
      setToast("Failed to load comments.");
    } finally {
      setLoading(false);
    }
  })();
}, [orderNo, mode, yardIndex]);

  /* -------------------- Handle submit -------------------- */
  const handleSubmit = async (e) => {
  e.preventDefault();
  const note = input.trim();
  if (!note) return;

  const author = localStorage.getItem("firstName") || "User";
  const timestamp = getWhen("iso");
  const newEntry = `${author}, ${timestamp} : ${note}`;

  try {
    setLoading(true);

    // Save to backend
    if (mode === "support") {
      await axios.patch(`${baseUrl}/orders/${orderNo}/supportNotes`, {
        note,
        author,
        timestamp,
      });
    } else {
      await axios.patch(
        `${baseUrl}/orders/${orderNo}/additionalInfo/${yardIndex}/notes`,
        { note, author, timestamp }
      );
    }

    // 🔁 Immediately fetch latest comments again from backend
    const res = await axios.get(`${baseUrl}/orders/${orderNo}`);

    if (mode === "support") {
      setComments(res.data?.supportNotes || []);
    } else {
      setComments(res.data?.additionalInfo?.[yardIndex]?.notes || []);
    }

    setInput("");
    setToast("Comment added successfully!");
  } catch (err) {
    console.error("Submit comment error:", err);
    setToast("Error adding comment. Please try again.");
  } finally {
    setLoading(false);
  }
};

  /* -------------------- Handle Enter key -------------------- */
  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  /* -------------------- Render -------------------- */
  return (
  <>
    {/* Outer wrapper with fixed height control */}
    <div className="flex flex-col h-full bg-white/5 rounded-xl border border-white/10 backdrop-blur-md">
      
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 font-semibold text-white/90">
      {mode === "support" ? "Support Comments" : `Yard ${yardIndex + 1} Notes`}
    </div>

      {/* Content area: scrollable comments + fixed input */}
      <div className="flex flex-col flex-1 min-h-0">
        
        {/* Scrollable comments */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 custom-scrollbar">
          {loading ? (
            <p className="text-gray-300 italic">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="text-white/60 italic">No comments yet.</p>
          ) : (
            comments.map((note, i) => (
              <div
                key={i}
                className="p-2 rounded-lg bg-white/10 border border-white/20 text-sm whitespace-pre-wrap text-white"
              >
                {note}
              </div>
            ))
          )}
        </div>

        {/* Input area (always visible at bottom) */}
        <div className="shrink-0 border-t border-white/10 bg-[#1a1a3d]/80 backdrop-blur-md p-3">
          <form
            onSubmit={handleSubmit}
            className="flex gap-2"
          >
            <input
              type="text"
              placeholder="Type your comment here..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              className="flex-1 rounded-lg px-3 py-2 bg-white/10 border border-white/20 outline-none text-white placeholder-white/50 focus:bg-white/20"
            />
            <button
              type="submit"
              disabled={loading}
              className={`px-4 py-2 rounded-lg bg-white text-[#04356d] font-medium border border-white/20 hover:bg-white/90 transition ${
                loading && "opacity-70 cursor-not-allowed"
              }`}
            >
              {loading ? "Saving…" : "Comment"}
            </button>
          </form>
        </div>
      </div>
    </div>

    {/* Toast */}
    <Toast
  message={toast}
  onClose={() => setToast("")}
/>
  </>
);



}
