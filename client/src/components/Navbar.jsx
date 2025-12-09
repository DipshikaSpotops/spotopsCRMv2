import { useEffect, useState, useRef } from "react";
import "@fortawesome/fontawesome-free/css/all.min.css";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { logout as logoutAction } from "../store/authSlice";
import { clearStoredAuth } from "../utils/authStorage";
import API from "../api";

export default function Navbar() {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [userName, setUserName] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const dropdownRef = useRef(null);

  // --- Single read path for user name ---
  useEffect(() => {
    // Prefer unified 'auth' (if you start using it), else fall back to your existing keys
    const authRaw = localStorage.getItem("auth");
    if (authRaw) {
      try {
        const { user } = JSON.parse(authRaw);
        if (user?.firstName) setUserName(user.firstName);
      } catch {}
    }
    if (!userName) {
      // Your existing keys:
      const storedUser = JSON.parse(localStorage.getItem("user") || "null");
      const storedFirstName = localStorage.getItem("firstName");
      if (storedUser?.firstName) setUserName(storedUser.firstName);
      else if (storedFirstName) setUserName(storedFirstName);
    }

    const storedTheme = localStorage.getItem("darkMode");
    if (storedTheme === "true") {
      document.documentElement.classList.add("dark");
      setIsDarkMode(true);
    }

    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTheme = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem("darkMode", newMode.toString());
    document.documentElement.classList.toggle("dark", newMode);
  };

  // --- Single logout that clears ALL possible keys + Redux ---
  const handleLogout = () => {
    try {
      clearStoredAuth();
    } catch (e) {
      console.error("Logout error:", e);
    }
    dispatch(logoutAction());
    navigate("/login", { replace: true });
  };

  return (
    <nav
      className={`fixed top-0 z-50 w-full shadow-lg py-4 px-6 backdrop-blur-md transition-colors duration-300 
        ${
          isDarkMode
            ? "bg-gradient-to-b from-[#0f172a] to-[#1e293b] text-white border-b border-gray-700"
            : "bg-gradient-to-b from-[#3b89bf] to-[#04356d] text-white"
        }`}
    >
      <div className="flex items-center justify-between">
        {/* Left: Logo */}
        <div className="flex items-center space-x-2">
          <img
            id="logoImg"
            src="https://assets-autoparts.s3.ap-south-1.amazonaws.com/images/darkLogo.png"
            alt="Logo"
            className="h-9 w-auto cursor-pointer"
            onClick={() => navigate("/dashboard")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") navigate("/dashboard");
            }}
          />
        </div>

        {/* Right: Search + Dark Mode Toggle + User */}
        <div className="flex items-center space-x-4" ref={dropdownRef}>
          {/* Search */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (searchLoading) return;

              const value = e.target.elements.orderSearch?.value?.trim();
              if (!value) return;

              try {
                setSearchLoading(true);

                // If exactly 4 digits, try to find order where orderNo ends with those digits
                const is4Digits = /^\d{4}$/.test(value);
                let orders = [];

                if (is4Digits) {
                  // For 4-digit search: search broadly, then filter to only orders where orderNo ends with those 4 digits
                  // Do NOT fall back to regular search if no match - user specifically searched for last 4 digits
                  try {
                    const exactRes = await API.get("/orders/ordersPerPage", {
                      params: {
                        page: 1,
                        limit: 500, // Get many results to ensure we find the match
                        // Use searchTerm to narrow results, but we'll filter client-side to only orderNo matches
                        searchTerm: value,
                        sortBy: "orderDate",
                        sortOrder: "desc",
                      },
                    });
                    const allOrders = exactRes?.data?.orders || [];
                    // STRICT FILTER: Only orders where orderNo ends with these 4 digits (case-insensitive)
                    orders = allOrders.filter((order) => {
                      const orderNo = String(order.orderNo || "").trim();
                      // Match ONLY if orderNo ends with the 4 digits (case-insensitive)
                      return orderNo.toLowerCase().endsWith(value.toLowerCase());
                    });
                    // Sort by most recent first (already sorted by API, but ensure it)
                    orders.sort((a, b) => {
                      const dateA = new Date(a.orderDate || 0);
                      const dateB = new Date(b.orderDate || 0);
                      return dateB - dateA;
                    });
                    console.log(`Found ${orders.length} orders ending with ${value} out of ${allOrders.length} total results`);
                  } catch (exactErr) {
                    console.warn("4-digit search failed:", exactErr);
                  }
                  // IMPORTANT: For 4-digit searches, do NOT fall back to regular search
                  // If no order number ends with these digits, show "Order not found"
                } else {
                  // If not 4 digits, use regular fuzzy search
                  const res = await API.get("/orders/ordersPerPage", {
                    params: {
                      page: 1,
                      limit: 1,
                      searchTerm: value,
                      sortBy: "orderDate",
                      sortOrder: "desc",
                    },
                  });
                  orders = res?.data?.orders || [];
                }

                if (orders.length > 0 && orders[0].orderNo) {
                  navigate(
                    `/order-details?orderNo=${encodeURIComponent(
                      orders[0].orderNo
                    )}`
                  );
                  setDropdownOpen(false);
                } else {
                  // Navigate to order details page - it will show "Order not found" message
                  navigate(
                    `/order-details?orderNo=${encodeURIComponent(value)}`
                  );
                  setDropdownOpen(false);
                }
              } catch (err) {
                console.error("Order search failed:", err);
                // Navigate to order details page - it will show the error message
                navigate(
                  `/order-details?orderNo=${encodeURIComponent(value)}`
                );
                setDropdownOpen(false);
              } finally {
                setSearchLoading(false);
              }
            }}
          >
            <input
              name="orderSearch"
              type="text"
              placeholder={
                searchLoading ? "Searching..." : "Search order no."
              }
              disabled={searchLoading}
              className={`px-3 py-1 rounded-md focus:outline-none focus:ring focus:ring-[#c40505] w-40 sm:w-52 
                ${isDarkMode ? "bg-gray-800 text-white border border-gray-600" : "bg-white text-black"} ${searchLoading ? "opacity-70 cursor-not-allowed" : ""}`}
            />
          </form>

          {/* Hi User */}
          <span className="hidden sm:block text-lg font-medium">
            Hi {userName || "User"}
          </span>

          {/* Dark Mode Toggle */}
          <button
            onClick={toggleTheme}
            className="text-xl focus:outline-none hover:scale-110 transition"
            title="Toggle theme"
          >
            {isDarkMode ? (
              <i className="fas fa-sun text-[#6785a9]"></i>
            ) : (
              <i className="fas fa-moon"></i>
            )}
          </button>

          {/* User Icon */}
          <button
            className="focus:outline-none hover:scale-110 transition"
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <i className="fas fa-user-circle text-3xl"></i>
          </button>

          {/* Dropdown */}
          {dropdownOpen && (
            <div
              className={`absolute right-2 top-14 rounded shadow-md w-40 z-50 
                ${isDarkMode ? "bg-gray-900 text-white border border-gray-700" : "bg-white text-black"}`}
            >
              <ul className="text-sm">
                <li className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                  Profile
                </li>
                <li
                  className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                  onClick={handleLogout}
                >
                  Logout
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
