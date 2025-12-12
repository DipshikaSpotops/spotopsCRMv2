import React from 'react';

export default function EmailLoader({ message = "Sending email..." }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-[100] backdrop-blur-sm">
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
        <span>{message}</span>
      </div>
    </div>
  );
}
