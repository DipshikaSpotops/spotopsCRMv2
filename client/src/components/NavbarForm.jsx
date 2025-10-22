import { useEffect, useState, useRef } from "react";
import "@fortawesome/fontawesome-free/css/all.min.css";
import { useNavigate } from "react-router-dom";


export default function NavbarForm() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    const storedFirstName = localStorage.getItem("firstName");
    if (storedUser?.firstName) {
      setUserName(storedUser.firstName);
    } else if (storedFirstName) {
      setUserName(storedFirstName);
    }

    const storedTheme = localStorage.getItem("darkMode");
    if (storedTheme === "true") {
      document.documentElement.classList.add("dark");
      setIsDarkMode(true);
    }

    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleTheme = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem("darkMode", newMode.toString());
    document.documentElement.classList.toggle("dark", newMode);
  };

  const menuItems = {
    Dashboards: [
      ["Add New Order", "/add-order"],
      ["Placed Orders", "/placed-orders"],
      ["Customer Approved", "/customer-approved"],
      ["View Orders- Monthly", "/monthly-orders"],
      ["View All Orders", "/view-all-orders"],
      ["Yard Located Orders", "/yard-located"],
      ["Yard Processing Orders", "/yard-processing"],
      ["In Transit Orders", "/in-transit"],
      ["Sales Data", "/sales-data"],
      ["Cancelled Orders", "/cancelled-orders"],
      ["Refunded Orders", "/refunded-orders"],
      ["Disputed Orders", "/disputed-orders"],
      ["Fulfilled Orders", "/fulfilled-orders"],
      ["Overall Escalation", "/overall-escalation"],
      ["Ongoing Escalation", "/ongoing-escalation"],
      ["View My Tasks", "/my-tasks"],
      ["View All Tasks", "/all-tasks"],
    ],
    Reports: [
      ["Cancellations & Refunds", "/cancelled-refunded-report"],
      ["Card not Charged", "/card-not-charged-report"],
      ["Collect Refunds", "/collect-refund"],
      ["Delivery Report", "/delivery-time"],
      ["Monthly Disputes", "/monthly-disputes"],
      ["My Sales Report", "/my-sales-report"],
      ["Shipping Expenses", "/shipping-expenses"],
      ["Purchases", "/purchases"],
      ["PO Report", "/po-report"],
      ["Store Credits", "/store-credit"],
      ["Tracking Report", "/tracking-info"],
      ["Incentives Report", "/incentive-calculation"],
    ],
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
      <div className="flex flex-wrap items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center">
          <img
          id="logoImg"
          src="https://assets-autoparts.s3.ap-south-1.amazonaws.com/images/darkLogo.png"
          alt="Logo"
          className="h-9 w-auto cursor-pointer"
          onClick={() => navigate("/dashboard")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/dashboard"); }}
        />
        </a>

        {/* Menus */}
        <div className="flex gap-6 text-sm font-medium items-center" ref={dropdownRef}>
          {Object.entries(menuItems).map(([title, items]) => (
            <div className="relative" key={title}>
              <button
                onClick={() =>
                  setDropdownOpen(dropdownOpen === title ? null : title)
                }
                className="hover:underline"
              >
                {title}
              </button>
              {dropdownOpen === title && (
                <div className="absolute top-full mt-1 left-0 bg-white text-black shadow-lg rounded-md z-50">
                  {items.map(([label, href]) => (
                    <a
                      key={href}
                      href={href}
                      className="block px-4 py-2 text-sm hover:bg-gray-100 whitespace-nowrap"
                    >
                      {label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}

          <input
            type="text"
            placeholder="Search order no."
            className={`px-3 py-1 rounded-md w-48 focus:outline-none focus:ring focus:ring-[#c40505] 
              ${isDarkMode ? "bg-gray-800 text-white border border-gray-600" : "bg-white text-black"}`}
          />

          <span className="text-sm sm:text-base whitespace-nowrap">
            Hi <span className="font-semibold">{userName || "User"}</span>
          </span>

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

          <button
            className="focus:outline-none hover:scale-110 transition"
            onClick={() => setDropdownOpen(dropdownOpen === "user" ? null : "user")}
          >
            <i className="fas fa-user-circle text-3xl"></i>
          </button>

          {dropdownOpen === "user" && (
            <div
              className={`absolute right-0 top-14 rounded shadow-md w-40 z-50 
                ${isDarkMode ? "bg-gray-900 text-white border border-gray-700" : "bg-white text-black"}`}
            >
              <ul className="text-sm">
                <li className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                  My Profile
                </li>
                <li
                  className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                  onClick={() => {
                    localStorage.removeItem("token");
                    localStorage.removeItem("user");
                    window.location.href = "/login";
                  }}
                >
                  Log Out
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}