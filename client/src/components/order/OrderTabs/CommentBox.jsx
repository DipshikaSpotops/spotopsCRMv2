// /client/src/components/order/OrderTabs/CommentBox.jsx
import { useEffect, useState, useCallback, useRef } from "react";
import API from "../../../api";
import { getWhen } from "@spotops/shared";
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
  buttonTone = "primary",
  compact = false,
}) {
  const [comments, setComments] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [typingUsers, setTypingUsers] = useState([]); // Array of {firstName, role}
  const typingTimeoutRef = useRef(null);
  const socketRef = useRef(null);

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
        () => API.get(`/orders/${orderNo}`),
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
  }, [orderNo, mode, yardIndex]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  /* -------------------- Realtime: refresh on socket events -------------------- */
  const socket = useOrderRealtime(orderNo, {
    onEvent: (msg, { socket: socketInstance }) => {
      if (!msg?.type) return;
      
      // Store socket reference
      if (socketInstance) socketRef.current = socketInstance;
      
      // Handle comment updates
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
      
      // Handle typing indicators
      if (msg.type === "TYPING_START") {
        const matchesType = mode === "support" 
          ? msg.commentType === "support"
          : msg.commentType === "yard" && Number(msg.yardIndex) === Number(yardIndex);
        
        if (matchesType && msg.user) {
          setTypingUsers((prev) => {
            const exists = prev.some(u => u.firstName === msg.user.firstName && u.socketId === msg.user.socketId);
            if (exists) return prev;
            return [...prev, msg.user];
          });
        }
      }
      
      if (msg.type === "TYPING_STOP") {
        const matchesType = mode === "support"
          ? msg.commentType === "support"
          : msg.commentType === "yard" && Number(msg.yardIndex) === Number(yardIndex);
        
        if (matchesType) {
          setTypingUsers((prev) => prev.filter(u => u.socketId !== msg.socketId));
        }
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
      const firstName = localStorage.getItem("firstName") || "System";
      if (mode === "support") {
        await API.patch(
          `/orders/${orderNo}/supportNotes`,
          { note, author, timestamp: whenIso },
          { params: { firstName } }
        );
      } else {
        await API.patch(
          `/orders/${orderNo}/additionalInfo/${yardIndex}/notes`,
          { note, author, timestamp: whenIso },
          { params: { firstName } }
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
      <div
        className={`flex flex-col h-full ${
          compact
            ? ""
            : "bg-blue-50 rounded-xl border border-gray-200 shadow-sm dark:bg-white/5 dark:border-white/10 dark:backdrop-blur-md overflow-hidden"
        }`}
      >
        {/* Header */}
        {!compact && (
          <div className="px-4 py-3 border-b border-gray-200 dark:border-white/10 font-semibold text-[#09325d] dark:text-white/90">
            {mode === "support" ? "Support Comments" : `Yard ${yardIndex + 1} Notes`}
          </div>
        )}

        {/* Content */}
        <div className={`flex flex-col flex-1 min-h-0 ${compact ? "" : ""}`}>
          {/* Scrollable comments */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-scroll px-3 py-3 space-y-2 custom-scrollbar"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#a3a3a3 #e5e7eb' }}
          >
            {loading ? (
              <p className="text-[#09325d]/80 dark:text-gray-300 italic">Loading comments...</p>
            ) : comments.length === 0 ? (
              <p className="text-[#09325d]/80 dark:text-white/60 italic">No comments yet.</p>
            ) : (
              comments.map((note, i) => (
                <div
                  key={`${i}-${note.slice(0, 16)}`}
                  className="p-2 rounded-lg bg-gray-50 border border-gray-200 text-sm whitespace-pre-wrap text-[#09325d] dark:bg-white/10 dark:border-white/20 dark:text-white"
                >
                  {note}
                </div>
              ))
            )}
          </div>

          {/* Input row */}
          <div className="shrink-0 border-t border-gray-200 dark:border-white/10 bg-blue-50 dark:bg-[#1a1a3d]/80 dark:backdrop-blur-md p-3">
            <form onSubmit={handleSubmit} className="flex gap-2 items-center">
              <div className="flex-1 flex flex-col">
                <input
                  type="text"
                  placeholder="Type your comment here..."
                  value={input}
                  onChange={(e) => {
                    const v = e.target.value.slice(0, MAX_LEN);
                    setInput(v);
                    
                    // Emit typing start
                    if (socketRef.current && v.trim().length > 0) {
                      const firstName = localStorage.getItem("firstName") || "Unknown";
                      const role = (() => {
                        try {
                          const raw = localStorage.getItem("auth");
                          if (raw) {
                            const parsed = JSON.parse(raw);
                            return parsed?.user?.role || localStorage.getItem("role") || "User";
                          }
                        } catch {}
                        return localStorage.getItem("role") || "User";
                      })();
                      
                      socketRef.current.emit("typing:start", {
                        orderNo,
                        commentType: mode,
                        yardIndex: mode === "support" ? null : yardIndex,
                        user: { firstName, role, socketId: socketRef.current.id },
                      });
                      
                      // Clear existing timeout
                      if (typingTimeoutRef.current) {
                        clearTimeout(typingTimeoutRef.current);
                      }
                      
                      // Stop typing after 3 seconds of inactivity
                      typingTimeoutRef.current = setTimeout(() => {
                        if (socketRef.current) {
                          socketRef.current.emit("typing:stop", {
                            orderNo,
                            commentType: mode,
                            yardIndex: mode === "support" ? null : yardIndex,
                          });
                        }
                      }, 3000);
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  onBlur={() => {
                    // Stop typing when input loses focus
                    if (socketRef.current) {
                      socketRef.current.emit("typing:stop", {
                        orderNo,
                        commentType: mode,
                        yardIndex: mode === "support" ? null : yardIndex,
                      });
                    }
                    if (typingTimeoutRef.current) {
                      clearTimeout(typingTimeoutRef.current);
                    }
                  }}
                  className="flex-1 rounded-lg px-3 py-2 bg-gray-50 border border-gray-300 outline-none text-[#09325d] placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:bg-white/10 dark:border-white/20 dark:text-white dark:placeholder-white/50 dark:focus:ring-white/60 dark:focus:border-white/60 dark:focus:bg-white/20"
                />
                {typingUsers.length > 0 && (
                  <div className="text-xs text-[#09325d]/70 dark:text-white/60 mt-1 px-1">
                    {typingUsers.map((u, i) => (
                      <span key={u.socketId || i}>
                        {u.firstName} is typing...
                        {i < typingUsers.length - 1 && ", "}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-xs text-[#09325d]/80 dark:text-white/60 w-16 text-right">
                {remaining}
              </span>
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className={`px-4 py-2 rounded-lg font-medium border transition ${
                  loading || !input.trim()
                    ? "opacity-70 cursor-not-allowed bg-gray-200 text-gray-500 border-gray-300 dark:bg-transparent dark:text-white/50 dark:border-white/30"
                    : buttonTone === "primary"
                    ? "bg-blue-200 text-blue-800 border-blue-300 hover:bg-blue-300 hover:scale-[1.02] shadow-sm hover:shadow-md dark:bg-[#06b6d4]/10 dark:text-[#06b6d4] dark:border-[#06b6d4] dark:hover:bg-[#06b6d4]/15 dark:shadow-[0_0_4px_rgba(6,182,212,0.3)] dark:hover:shadow-[0_0_12px_rgba(6,182,212,0.7),0_0_20px_rgba(6,182,212,0.4)] dark:[text-shadow:0_0_2px_rgba(6,182,212,0.5)] dark:hover:[text-shadow:0_0_8px_rgba(6,182,212,0.9),0_0_12px_rgba(6,182,212,0.6)]"
                    : "bg-blue-200 hover:bg-blue-300 text-blue-800 border-blue-300 shadow-sm hover:shadow-md transition-all dark:bg-[#3b82f6]/10 dark:text-[#3b82f6] dark:border-[#3b82f6] dark:hover:bg-[#3b82f6]/15 dark:shadow-[0_0_4px_rgba(59,130,246,0.3)] dark:hover:shadow-[0_0_12px_rgba(59,130,246,0.7),0_0_20px_rgba(59,130,246,0.4)] dark:[text-shadow:0_0_2px_rgba(59,130,246,0.5)] dark:hover:[text-shadow:0_0_8px_rgba(59,130,246,0.9),0_0_12px_rgba(59,130,246,0.6)]"
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
