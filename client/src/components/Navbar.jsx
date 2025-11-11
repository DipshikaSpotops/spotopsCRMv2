import { useEffect, useState, useRef } from "react";
import "@fortawesome/fontawesome-free/css/all.min.css";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { logout as logoutAction } from "../store/authSlice";

export default function Navbar() {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [userName, setUserName] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
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
      // Clear any auth-related keys you’ve used (cover both old & new styles)
      localStorage.removeItem("auth");        // unified object { user, token } (recommended going forward)
      localStorage.removeItem("user");        // legacy
      localStorage.removeItem("firstName");   // legacy
      localStorage.removeItem("role");        // legacy
      localStorage.removeItem("token");       // legacy naming
      localStorage.removeItem("auth_token");  // your newer naming

      // Optional: if you ever stored email, etc.
      localStorage.removeItem("email");

      // Clear Redux auth state
      dispatch(logoutAction());

      // Hard redirect to login so any in-memory state (axios, RTK cache) is clean
      navigate("/login", { replace: true });
    } catch (e) {
      console.error("Logout error:", e);
      dispatch(logoutAction());
      navigate("/login", { replace: true });
    }
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
            onSubmit={(e) => {
              e.preventDefault();
              const value = e.target.elements.orderSearch?.value?.trim();
              if (value) {
                navigate(`/order-details?orderNo=${encodeURIComponent(value)}`);
                setDropdownOpen(false);
              }
            }}
          >
            <input
              name="orderSearch"
              type="text"
              placeholder="Search order no."
              className={`px-3 py-1 rounded-md focus:outline-none focus:ring focus:ring-[#c40505] w-40 sm:w-52 
                ${isDarkMode ? "bg-gray-800 text-white border border-gray-600" : "bg-white text-black"}`}
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
