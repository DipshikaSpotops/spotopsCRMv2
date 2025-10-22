// components/layout/StickyDataPage.jsx
import React, { forwardRef } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";

/**
 * Page shell with sticky header & scrollable content.
 * Keeps header always visible while table/content scrolls.
 */
const StickyDataPage = forwardRef(
  (
    {
      title,
      totalLabel,
      badge,
      page,
      totalPages,
      onPrevPage,
      onNextPage,
      rightControls,
      children,
    },
    contentRef // forwarded ref for scroll container
  ) => {
    return (
      <div className="h-[calc(100vh-var(--topbar-h,0px))] overflow-hidden flex flex-col bg-transparent">
        {/* Sticky Header */}
        <header className="flex-none px-6 py-3 bg-[#0b1524] border-b border-white/10">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            {/* Left side */}
            <div className="flex flex-col">
              <h2 className="text-3xl font-bold text-white underline decoration-1">{title}</h2>
              <div className="mt-1 flex items-center gap-4">
                {totalLabel && <p className="text-sm text-white/70">{totalLabel}</p>}
                {badge}
                {/* Pagination */}
                <div className="flex items-center gap-2 text-white font-medium">
                  <button
                    disabled={page <= 1}
                    onClick={onPrevPage}
                    className={`px-3 py-1 rounded-full transition ${
                      page <= 1
                        ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                        : "bg-gray-700 hover:bg-gray-600"
                    }`}
                  >
                    <FaChevronLeft size={14} />
                  </button>
                  <span className="px-4 py-1 bg-gray-800 rounded-full text-sm shadow">
                    Page <strong>{page}</strong> of {totalPages}
                  </span>
                  <button
                    disabled={page >= totalPages}
                    onClick={onNextPage}
                    className={`px-3 py-1 rounded-full transition ${
                      page >= totalPages
                        ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                        : "bg-gray-700 hover:bg-gray-600"
                    }`}
                  >
                    <FaChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
            {/* Right side controls */}
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              {rightControls}
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 min-h-0">
          <div
            ref={contentRef}
            className="h-full overflow-y-auto overflow-x-auto rounded-xl ring-1 ring-white/10 shadow
                       scrollbar scrollbar-thin scrollbar-thumb-[#4986bf] scrollbar-track-[#98addb]"
            style={{ scrollbarGutter: "stable both-edges", paddingBottom: "var(--sb,16px)" }}
          >
            {children}
          </div>
        </main>
      </div>
    );
  }
);

export default StickyDataPage;
