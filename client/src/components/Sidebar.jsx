import { Link, useLocation } from "react-router-dom";
import { FaHome, FaUsers, FaChartBar, FaChevronDown } from "react-icons/fa";
import { useState } from "react";
import { useSelector } from "react-redux";
import { selectRole } from "../store/authSlice";

export default function Sidebar() {
  const location = useLocation();

  // Role from Redux with robust fallback to localStorage
  const roleFromRedux = useSelector(selectRole);
  const role =
    roleFromRedux ??
    (function () {
      try {
        const raw = localStorage.getItem("auth");
        if (raw) return JSON.parse(raw)?.user?.role || undefined;
      } catch {}
      return localStorage.getItem("role") || undefined; // legacy key
    })();

  // Email from Redux with robust fallback to localStorage
  const email =
    (function () {
      try {
        const raw = localStorage.getItem("auth");
        if (raw) return JSON.parse(raw)?.user?.email || undefined;
      } catch {}
      return localStorage.getItem("email") || undefined;
    })()?.toLowerCase();

  // all menus open by default
  const [openMenu, setOpenMenu] = useState({
    dashboards: true,
    users: true,
    reports: true,
  });

  const toggleMenu = (menu) => {
    setOpenMenu((prev) => ({ ...prev, [menu]: !prev[menu] }));
  };

  // ====== Base link sets ======
  const dashboardLinksBase = [
    { text: "Add New Order", to: "/add-order" },
    { text: "Edit Order", to: "/edit-order", adminOnly: true },
    { text: "Placed Orders", to: "/placed-orders" },
    { text: "Partially Charged Orders", to: "/partially-charged-orders" },
    { text: "Customer Approved", to: "/customer-approved" },
    { text: "View Orders - Monthly", to: "/monthly-orders" },
    { text: "View All Orders", to: "/view-all-orders" },
    { text: "Yard Processing Orders", to: "/yard-processing" },
    { text: "Own Shipping Orders", to: "/own-shipping-orders" },
    { text: "In Transit Orders", to: "/in-transit" },
    { text: "Sales Data", to: "/sales-data" },
    { text: "Cancelled Orders", to: "/cancelled-orders" },
    { text: "Refunded Orders", to: "/refunded-orders" },
    { text: "Disputed Orders", to: "/disputed-orders" },
    { text: "Fulfilled Orders", to: "/fulfilled-orders" },
    { text: "Overall Escalation", to: "/overall-escalation" },
    { text: "Ongoing Escalation", to: "/ongoing-escalation" },
    { text: "Leads", to: "/leads", roles: ["Admin", "Sales"] },
    { text: "Yards", to: "/yards", emailAccess: "50starsauto110@gmail.com" },
  ];

  const usersLinksBase = [
    { text: "Create User", to: "/create-user" },
    { text: "View Users", to: "/view-users" },
  ];

  const reportsLinksBase = [
    { text: "Cancellations & Refunds", to: "/cancelled-refunded-report" },
    { text: "Card Not Charged", to: "/card-not-charged-report" },
    { text: "Collect Refunds", to: "/collect-refund" },
    { text: "UPS Claims", to: "/ups-claims" },
    { text: "Monthly Disputes", to: "/monthly-disputes" },
    { text: "Sales Report", to: "/sales-report" },
    { text: "Purchases", to: "/purchases" },
    { text: "PO Report", to: "/po-report" },
    { text: "Shipping Expenses", to: "/shipping-expenses" },
    { text: "Store Credits", to: "/store-credit" },
    { text: "Tracking Report", to: "/tracking-info" },
    { text: "Refunds/Reimbursements", to: "/reimbursement-report" },
  ];

  // Helper function to check if a link should be shown based on role, email, and link properties
  const shouldShowLink = (link, userRole, userEmail) => {
    // Check email-based access first (overrides other restrictions - works for ANY role)
    if (link.emailAccess) {
      const isAuthorizedEmail = userEmail === link.emailAccess.toLowerCase();
      if (isAuthorizedEmail) return true; // Email access grants permission regardless of role
    }

    // Check adminOnly restriction
    if (link.adminOnly) {
      // Admin can always see adminOnly links
      if (userRole === "Admin") return true;
      // Non-admin users can only see if they have email access (checked above)
      return false;
    }

    // Check roles array
    if (link.roles && !link.roles.includes(userRole)) {
      return false;
    }

    return true;
  };

  // ====== Role-based filtering ======
  let dashboardLinks = dashboardLinksBase;
  let showUsersSection = true;
  let usersLinks = usersLinksBase;
  let reportsLinks = reportsLinksBase;

  if (role === "Sales") {
    // Hide these from Dashboards for Sales
    const hiddenForSales = new Set([
      "Placed Orders",
      "Customer Approved",
      "Yard Processing Orders",
      "Own Shipping Orders",
      "In Transit Orders",
      "Overall Escalation",
      "Ongoing Escalation",
    ]);
    dashboardLinks = dashboardLinksBase.filter((l) => {
      // Filter out hidden items
      if (hiddenForSales.has(l.text)) return false;
      // Use helper function to check access
      return shouldShowLink(l, role, email);
    });

    // Hide Users block entirely
    showUsersSection = false;
    usersLinks = [];

    // Reports => only "Sales Report"
    reportsLinks = reportsLinksBase.filter((l) => l.text === "Sales Report");
  } else if (role === "Support") {
    // Hide "Sales Data" and "Add New Order" from Dashboards
    const hiddenForSupport = new Set(["Sales Data", "Add New Order"]);
    dashboardLinks = dashboardLinksBase.filter((l) => {
      // Filter out hidden items
      if (hiddenForSupport.has(l.text)) return false;
      // Use helper function to check access
      return shouldShowLink(l, role, email);
    });

    // Hide Users block entirely
    showUsersSection = false;
    usersLinks = [];

    // Reports => hide "Sales Report"
    reportsLinks = reportsLinksBase.filter((l) => l.text !== "Sales Report");
  } else {
    // Admin: see everything (no filtering, but keep adminOnly links)
    showUsersSection = true;
    // Filter to only show links that Admin has access to (roles array includes Admin or no roles array)
    // Also check for email-based access for specific links
    dashboardLinks = dashboardLinksBase.filter((l) => {
      // Use helper function to check access
      return shouldShowLink(l, role, email);
    });
  }

  return (
    <div
      className="
        fixed 
        top-16 
        left-0 
        w-64
        h-[calc(100vh-4rem)]
        bg-gradient-to-b from-[#04356d] to-[#3b89bf]
        dark:bg-gradient-to-b dark:from-[#0f172a] dark:via-[#1e293b] dark:to-[#0f172a]
        text-white 
        shadow-lg 
        overflow-y-auto 
        z-40
        transition-all duration-300
        custom-scrollbar 
      "
    >
      {/* DASHBOARDS Section */}
      <SidebarItem
        icon={<FaHome />}
        title="Dashboards"
        isOpen={openMenu.dashboards}
        onClick={() => toggleMenu("dashboards")}
        links={dashboardLinks}
        location={location}
      />

      {/* USERS Section (hidden for Sales & Support) */}
      {showUsersSection && (
        <SidebarItem
          icon={<FaUsers />}
          title="Users"
          isOpen={openMenu.users}
          onClick={() => toggleMenu("users")}
          links={usersLinks}
          location={location}
        />
      )}

      {/* REPORTS Section */}
      <SidebarItem
        icon={<FaChartBar />}
        title="Reports"
        isOpen={openMenu.reports}
        onClick={() => toggleMenu("reports")}
        links={reportsLinks}
        location={location}
      />
    </div>
  );
}

/* SidebarItem component (unchanged) */
function SidebarItem({ icon, title, links, isOpen, onClick, location }) {
  return (
    <div>
      <button
        onClick={onClick}
        className="flex items-center justify-between w-full px-4 py-2 text-left font-semibold hover:bg-white/10 transition"
      >
        <div className="flex items-center space-x-2">
          {icon}
          <span>{title}</span>
        </div>
        <FaChevronDown className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="ml-2 mt-1 flex flex-col space-y-1">
          {links.map((link, idx) => (
            <Link
              key={idx}
              to={link.to}
              className={`text-sm pl-6 py-2 rounded-md transition
                ${
                  location.pathname === link.to
                    ? "bg-white/20 text-white font-semibold"
                    : "hover:bg-white/10 hover:text-white text-white/80"
                }
              `}
            >
              {link.text}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
