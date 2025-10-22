export default function TestModal({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      ></div>

      {/* content box */}
      <div className="relative z-[10000] bg-white text-black p-6 rounded-lg shadow-2xl">
        <h2 className="text-xl font-bold mb-4">Modal Works 🎉</h2>
        <p>If you can read this, your modal is rendering properly.</p>
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          Close
        </button>
      </div>
    </div>
  );
}
