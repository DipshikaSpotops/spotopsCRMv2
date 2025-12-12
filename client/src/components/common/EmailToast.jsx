import { useEffect } from "react";

/**
 * Reusable email toast notification component
 */
export default function EmailToast({ toast, onClose }) {
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        onClose?.();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toast, onClose]);

  if (!toast) return null;

  return (
    <div
      className={`fixed bottom-5 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg border z-[200] text-sm font-medium flex items-center gap-4 ${
        toast.variant === "error"
          ? "bg-red-100 text-red-900 border-red-300"
          : "bg-green-100 text-green-900 border-green-300"
      }`}
    >
      <span>{toast.message}</span>
      <button
        onClick={onClose}
        className={`ml-3 px-3 py-1 text-sm font-semibold rounded-md transition ${
          toast.variant === "error"
            ? "bg-red-500 text-white hover:bg-red-600"
            : "bg-green-500 text-white hover:bg-green-600"
        }`}
      >
        OK
      </button>
    </div>
  );
}
