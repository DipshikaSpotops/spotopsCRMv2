import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

export default function MainLayout({ children }) {
  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("darkMode") === "true"
  );
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        onToggleSidebar={() => setSidebarOpen(true)}
      />

      {/* One continuous background (covers sidebar + content) */}
      <div
        className="flex flex-1
                   bg-gradient-to-b from-[#3271a5] via-[#553790] to-[#727298]
                   dark:from-[#0f172a] dark:via-[#1e293b] dark:to-[#0f172a]"
      >
        {/* Sidebar: fixed on desktop, off-canvas on mobile */}
        <aside
          className={[
            "fixed inset-y-0 left-0 z-40 w-64 shrink-0",
            // IMPORTANT: no border/shadow so there's no visible divider
            "shadow-none border-0 [box-shadow:none] [border-right:0]",
            "transition-transform duration-200 will-change-transform",
            "lg:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
        >
          <div className="h-full overflow-y-auto custom-scrollbar">
            <Sidebar />
          </div>
        </aside>

        {/* Backdrop when drawer open (mobile) */}
        {sidebarOpen && (
          <button
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          />
        )}

        {/* Spacer reserves sidebar width on desktop; prevents any overlay */}
        <div className="hidden lg:block w-64 shrink-0 ml-4" aria-hidden />

        {/* Main content */}
        <main className="flex-1 min-w-0 pt-16 text-white overflow-y-auto">
          {/* Mobile toggle button (if Navbar doesn't render one) */}
          <div className="px-3 lg:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="mt-2 inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 hover:bg-white/20"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h16M3 12h16M3 18h16" />
              </svg>
              Menu
            </button>
          </div>

          {/* Content wrapper
              Your Dashboard root has: px-3 sm:px-4 lg:px-6
              We cancel that with matching negative margins so it sits flush */}
          <div className="py-4 pr-3 sm:pr-4 lg:pr-6">
            <div className="-ml-3 sm:-ml-4 lg:-ml-6">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
