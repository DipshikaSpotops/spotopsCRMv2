// /client/src/components/order/OrderTabs/CommentBox.jsx
import { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import { getWhen } from "@shared/utils/timeUtils";
import useOrderRealtime from "../../../hooks/useOrderRealtime";

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

/* ---------------------- small retry helper ---------------------- */
async function retry(fn, { retries = 2, delay = 400 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === retries) break;
      await new Promise((r) => setTimeout(r, delay * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

const MAX_LEN = 1000;

export default function CommentBox({
  orderNo,
  mode = "support",
  yardIndex = null,
}) {
  const baseUrl = import.meta.env.VITE_API_BASE || "http://localhost:5000";
  const [comments, setComments] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  // for auto-scroll
  const listRef = useRef(null);

  // scroll to bottom whenever comments change
  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [comments]);

  /* -------------------- Fetch existing comments (with retry) -------------------- */
  const fetchComments = useCallback(async () => {
    if (!orderNo) return;
    setLoading(true);
    try {
      const res = await retry(
        () => axios.get(`${baseUrl}/orders/${orderNo}`),
        { retries: 2, delay: 400 }
      );
      if (mode === "support") {
        setComments(res.data?.supportNotes || []);
      } else {
        setComments(res.data?.additionalInfo?.[yardIndex]?.notes || []);
      }
    } catch (err) {
      console.error("Fetch comments error:", err);
      setToast("Failed to load comments.");
    } finally {
      setLoading(false);
    }
  }, [orderNo, mode, yardIndex, baseUrl]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  /* -------------------- Realtime: refresh on socket events -------------------- */
  useOrderRealtime(orderNo, {
    onEvent: (msg) => {
      if (!msg?.type) return;
      if (mode === "support" && msg.type === "SUPPORT_NOTE_ADDED") {
        fetchComments();
      }
      if (
        mode !== "support" &&
        msg.type === "YARD_NOTE_ADDED" &&
        Number(msg.yardIndex) - 1 === Number(yardIndex)
      ) {
        fetchComments();
      }
    },
  });

  /* -------------------- Handle submit (optimistic + rollback) -------------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    const note = input.trim();
    if (!note) return;

    const author = localStorage.getItem("firstName") || "User";
    const whenIso = getWhen("iso");
    const optimistic = `${author}, ${whenIso} : ${note}`;

    // optimistic add & clear input
    setComments((prev) => [...prev, optimistic]);
    setInput("");

    try {
      if (mode === "support") {
        await axios.patch(`${baseUrl}/orders/${orderNo}/supportNotes`, {
          note,
          author,
          timestamp: whenIso,
        });
      } else {
        await axios.patch(
          `${baseUrl}/orders/${orderNo}/additionalInfo/${yardIndex}/notes`,
          { note, author, timestamp: whenIso }
        );
      }

      // success toast only for the actor on this tab
      setToast("Comment added successfully!");
    } catch (err) {
      console.error("Submit comment error:", err);
      // rollback the optimistic item (remove only the last matching one)
      setComments((prev) => {
        const idx = [...prev].reverse().findIndex((c) => c === optimistic);
        if (idx === -1) return prev;
        const realIdx = prev.length - 1 - idx;
        return prev.filter((_, i) => i !== realIdx);
      });
      setInput(note); // restore for editing/resubmit
      setToast("Error adding comment. Please try again.");
    }
  };

  /* -------------------- Handle keyboard -------------------- */
  const handleKeyDown = (e) => {
    // submit on Enter (no Shift) OR Ctrl/Cmd+Enter
    const plainEnter = e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey;
    const modEnter = e.key === "Enter" && (e.ctrlKey || e.metaKey);
    if (plainEnter || modEnter) {
      e.preventDefault();
      handleSubmit(e);
    }
    // Esc to clear (optional)
    if (e.key === "Escape") {
      e.preventDefault();
      setInput("");
    }
  };

  const remaining = Math.max(0, MAX_LEN - input.length);

  /* -------------------- Render -------------------- */
  return (
    <>
      <div className="flex flex-col h-full bg-white/5 rounded-xl border border-white/10 backdrop-blur-md">
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10 font-semibold text-white/90">
          {mode === "support" ? "Support Comments" : `Yard ${yardIndex + 1} Notes`}
        </div>

        {/* Content */}
        <div className="flex flex-col flex-1 min-h-0">
          {/* Scrollable comments */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto px-3 py-3 space-y-2 custom-scrollbar"
          >
            {loading ? (
              <p className="text-gray-300 italic">Loading comments...</p>
            ) : comments.length === 0 ? (
              <p className="text-white/60 italic">No comments yet.</p>
            ) : (
              comments.map((note, i) => (
                <div
                  key={`${i}-${note.slice(0, 16)}`}
                  className="p-2 rounded-lg bg-white/10 border border-white/20 text-sm whitespace-pre-wrap text-white"
                >
                  {note}
                </div>
              ))
            )}
          </div>

          {/* Input row */}
          <div className="shrink-0 border-t border-white/10 bg-[#1a1a3d]/80 backdrop-blur-md p-3">
            <form onSubmit={handleSubmit} className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="Type your comment here..."
                value={input}
                onChange={(e) => {
                  const v = e.target.value.slice(0, MAX_LEN);
                  setInput(v);
                }}
                onKeyDown={handleKeyDown}
                className="flex-1 rounded-lg px-3 py-2 bg-white/10 border border-white/20 outline-none text-white placeholder-white/50 focus:bg-white/20"
              />
              <span className="text-xs text-white/60 w-16 text-right">
                {remaining}
              </span>
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className={`px-4 py-2 rounded-lg bg-white text-[#04356d] font-medium border border-white/20 hover:bg-white/90 transition ${
                  (loading || !input.trim()) && "opacity-70 cursor-not-allowed"
                }`}
              >
                {loading ? "Saving…" : "Comment"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Toast */}
      <Toast message={toast} onClose={() => setToast("")} />
    </>
  );
}
