import { Link, useLocation } from "react-router-dom";
import { FaHome, FaUsers, FaChartBar, FaChevronDown, FaClipboardCheck } from "react-icons/fa";
import { useState } from "react";
import { useSelector } from "react-redux";
import { selectRole } from "../store/authSlice";
import { getCurrentBrand } from "../utils/brand";

const normalizeRole = (value) => {
  if (!value) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "admin") return "Admin";
  if (normalized === "sales") return "Sales";
  if (normalized === "support") return "Support";
  return String(value).trim();
};

export default function Sidebar() {
  const location = useLocation();

  // Role from Redux with robust fallback to localStorage
  const roleFromRedux = useSelector(selectRole);
  const role = normalizeRole(
    roleFromRedux ??
      (function () {
        try {
          const raw = localStorage.getItem("auth");
          if (raw) return JSON.parse(raw)?.user?.role || undefined;
        } catch {}
        return localStorage.getItem("role") || undefined; // legacy key
      })()
  );

  // Email from Redux with robust fallback to localStorage
  const email =
    (function () {
      try {
        const raw = localStorage.getItem("auth");
        if (raw) return JSON.parse(raw)?.user?.email || undefined;
      } catch {}
      return localStorage.getItem("email") || undefined;
    })()?.toLowerCase();

  // Brand (50STARS / PROLANE)
  const brand = getCurrentBrand();

  // Top-level sections open; nested groups (CX Related, Yard Related, etc.) start collapsed.
  const [openMenu, setOpenMenu] = useState({
    dashboards: true,
    cxRelated: false,
    yardRelated: false,
    dashboardEscalations: false,
    reportsPurchases: false,
    reportsRefunds: false,
    reportsDisputes: false,
    reportsStatistics: false,
    attendance: true,
    users: true,
    reports: true,
  });

  const toggleMenu = (menu) => {
    setOpenMenu((prev) => ({ ...prev, [menu]: !prev[menu] }));
  };

  /** Nested dropdowns are independently toggleable; keep others open. */
  const toggleSubmenu = (key) => {
    setOpenMenu((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ====== Base link sets ======
  const dashboardLinksBase = [
    { text: "Add New Order", to: "/add-order", roles: ["Admin", "Sales"] },
    { text: "Edit Order", to: "/edit-order", roles: ["Admin", "Sales"] },
    { text: "Daily Sales GP", to: "/daily-sales-gp", roles: ["Admin", "Sales"] },
    { text: "Sales Data", to: "/sales-data", roles: ["Admin", "Sales"] },
    { text: "Leads", to: "/leads", roles: ["Admin", "Sales"], emailAccess: "50starsauto110@gmail.com" },
    { text: "View All Orders", to: "/view-all-orders" },
    { text: "View Orders-Monthly", to: "/monthly-orders" },
    {
      text: "CX Related",
      submenuKey: "cxRelated",
      children: [
        { text: "Placed Orders", to: "/placed-orders" },
        { text: "Partially Charged Orders", to: "/partially-charged-orders" },
        { text: "In-Transit Orders", to: "/in-transit" },
        { text: "Fulfilled Orders", to: "/fulfilled-orders" },
        { text: "Refunded Orders", to: "/refunded-orders" },
        { text: "To Be Reimbursed", to: "/to-be-reimbursed" },
        { text: "Cancelled Orders", to: "/cancelled-orders" },
        { text: "Disputed Orders", to: "/disputed-orders" },
      ],
    },
    {
      text: "Yard Related",
      submenuKey: "yardRelated",
      children: [
        { text: "Yard Data", to: "/yards", adminOnly: true, emailAccess: "50starsauto110@gmail.com" },
        { text: "CX Approved Orders", to: "/customer-approved" },
        { text: "Yard Processing Orders", to: "/yard-processing" },
        { text: "Own Shipping", to: "/own-shipping-orders" },
        { text: "Expedite Shipping", to: "/yard-expedite" },
        { text: "Junk Parts", to: "/junk-parts" },
      ],
    },
    {
      text: "Escalations",
      submenuKey: "dashboardEscalations",
      children: [
        { text: "Overall Escalation", to: "/overall-escalation" },
        { text: "Ongoing Escalation", to: "/ongoing-escalation" },
      ],
    },
    { text: "UPS Claims", to: "/ups-claims" },
  ];

  const usersLinksBase = [
    { text: "Create User", to: "/create-user" },
    { text: "View Users", to: "/view-users" },
  ];

  const reportsLinksBase = [
    { text: "Sales Report", to: "/sales-report", roles: ["Admin", "Sales"] },
    {
      text: "Purchases",
      submenuKey: "reportsPurchases",
      children: [
        { text: "Shipping", to: "/shipping-expenses" },
        { text: "PO Report", to: "/po-report" },
        { text: "Card Charged", to: "/card-charged" },
        { text: "Card Not Charged", to: "/card-not-charged-report" },
      ],
    },
    {
      text: "Refunds",
      submenuKey: "reportsRefunds",
      children: [
        { text: "Cancellations & Refunds", to: "/cancelled-refunded-report" },
        { text: "Reimbursements", to: "/reimbursement-report" },
        { text: "UPS Claims", to: "/ups-claims" },
        { text: "Collect Refund", to: "/collect-refund" },
        { text: "Store Credit", to: "/store-credit" },
      ],
    },
    {
      text: "Disputes",
      submenuKey: "reportsDisputes",
      children: [
        { text: "CX Disputes", to: "/monthly-disputes" },
        { text: "Yard Disputes", to: "/disputed-orders" },
      ],
    },
    {
      text: "Statistics",
      submenuKey: "reportsStatistics",
      children: [
        { text: "Order Statistics", to: "/order-statistics", adminOnly: true, emailAccess: "50starsauto110@gmail.com" },
        { text: "Make/Model", to: "/make-statistics", adminOnly: true, emailAccess: "50starsauto110@gmail.com" },
        { text: "Incentives Report", to: "/incentives-report", adminOnly: true, emailAccess: "50starsauto110@gmail.com" },
      ],
    },
  ];

  const attendanceLinksBase = [{ text: "Attendance", to: "/attendance" }];

  // Helper function to check if a link should be shown based on role, email, and link properties
  const shouldShowLink = (link, userRole, userEmail, currentBrand) => {
    const isAdmin = normalizeRole(userRole) === "Admin";

    // Brand-specific visibility
    if (link.brandOnly && String(currentBrand || "").toUpperCase() !== link.brandOnly) {
      return false;
    }
    // Special case: If link has both adminOnly and emailAccess, show only for Admin OR authorized email
    if (link.adminOnly && link.emailAccess) {
      // Admin can always see
      if (isAdmin) return true;
      // Check if email matches (works for ANY role)
      const isAuthorizedEmail = userEmail === link.emailAccess.toLowerCase();
      if (isAuthorizedEmail) return true;
      // Otherwise, deny access
      return false;
    }

    // Check email-based access (overrides other restrictions - works for ANY role)
    if (link.emailAccess) {
      const isAuthorizedEmail = userEmail === link.emailAccess.toLowerCase();
      if (isAuthorizedEmail) return true; // Email access grants permission regardless of role
    }

    // Check adminOnly restriction
    if (link.adminOnly) {
      // Admin can always see adminOnly links
      if (isAdmin) return true;
      // Non-admin users can only see if they have email access (checked above)
      return false;
    }

    // Check roles array
    if (link.roles) {
      const allowedRoles = link.roles.map(normalizeRole);
      if (!allowedRoles.includes(normalizeRole(userRole))) return false;
    }

    return true;
  };

  /** Reports / nested menus: Sales always keeps Sales Report; Support hides it; leaves still use shouldShowLink. */
  const filterNestedLinksByRole = (items, userRole, userEmail, currentBrand) => {
    const leafVisible = (l) => {
      if (userRole === "Sales") {
        if (l.text === "Sales Report") return true;
        return shouldShowLink(l, userRole, userEmail, currentBrand);
      }
      if (userRole === "Support") {
        if (l.text === "Sales Report") return false;
        return shouldShowLink(l, userRole, userEmail, currentBrand);
      }
      return shouldShowLink(l, userRole, userEmail, currentBrand);
    };

    return items
      .map((item) => {
        if (item.children?.length) {
          const children = item.children.filter(leafVisible);
          if (children.length === 0) return null;
          return { ...item, children };
        }
        return leafVisible(item) ? item : null;
      })
      .filter(Boolean);
  };

  /** Filter dashboard items (flat links or `{ text, children }` groups). */
  const filterDashboardLinks = (items, userRole, userEmail, currentBrand, hiddenFlat, hiddenNested) => {
    const flatHidden = hiddenFlat ?? new Set();
    const nestedHidden = hiddenNested ?? flatHidden;

    return items
      .map((item) => {
        if (item.children?.length) {
          const children = item.children.filter((l) => {
            if (nestedHidden.has(l.text)) return false;
            return shouldShowLink(l, userRole, userEmail, currentBrand);
          });
          if (children.length === 0) return null;
          return { ...item, children };
        }
        if (flatHidden.has(item.text)) return null;
        return shouldShowLink(item, userRole, userEmail, currentBrand) ? item : null;
      })
      .filter(Boolean);
  };

  // ====== Role-based filtering ======
  let dashboardLinks = dashboardLinksBase;
  let showUsersSection = true;
  let usersLinks = usersLinksBase;
  let reportsLinks = reportsLinksBase;
  let attendanceLinks = attendanceLinksBase;

  if (role === "Sales") {
    const hiddenForSales = new Set([
      "Placed Orders",
      "CX Related",
      "CX Approved Orders",
      "Yard Related",
      "Yard Processing Orders",
      "Own Shipping",
      "In-Transit Orders",
      "Overall Escalation",
      "Ongoing Escalation",
      "UPS Claims",
    ]);
    dashboardLinks = filterDashboardLinks(
      dashboardLinksBase,
      role,
      email,
      brand,
      hiddenForSales,
      hiddenForSales
    );

    // Hide Users block entirely
    showUsersSection = false;
    usersLinks = [];

    reportsLinks = reportsLinksBase.filter(
      (l) => l.text === "Sales Report" && shouldShowLink(l, role, email, brand)
    );
    attendanceLinks = attendanceLinksBase.filter((l) => shouldShowLink(l, role, email, brand));
  } else if (role === "Support") {
    const hiddenForSupport = new Set(["Sales Data", "Add New Order"]);
    dashboardLinks = filterDashboardLinks(
      dashboardLinksBase,
      role,
      email,
      brand,
      hiddenForSupport,
      hiddenForSupport
    );

    // Hide Users block entirely
    showUsersSection = false;
    usersLinks = [];

    reportsLinks = filterNestedLinksByRole(reportsLinksBase, role, email, brand);
    attendanceLinks = attendanceLinksBase.filter((l) => shouldShowLink(l, role, email, brand));
  } else {
    showUsersSection = true;
    dashboardLinks = filterDashboardLinks(dashboardLinksBase, role, email, brand, new Set(), new Set());
    reportsLinks = filterNestedLinksByRole(reportsLinksBase, role, email, brand);
    attendanceLinks = attendanceLinksBase.filter((l) => shouldShowLink(l, role, email, brand));
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
        openSubmenus={openMenu}
        toggleSubmenu={toggleSubmenu}
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
        openSubmenus={openMenu}
        toggleSubmenu={toggleSubmenu}
      />

      {/* ATTENDANCE Section */}
      <SidebarItem
        icon={<FaClipboardCheck />}
        title="Attendance"
        isOpen={openMenu.attendance}
        onClick={() => toggleMenu("attendance")}
        links={attendanceLinks}
        location={location}
      />
    </div>
  );
}

/* SidebarItem — supports flat `{ text, to }` or nested `{ text, children }` (e.g. CX Related). */
function SidebarItem({
  icon,
  title,
  links,
  isOpen,
  onClick,
  location,
  openSubmenus,
  toggleSubmenu,
}) {
  const linkClass = (path, extraPl) =>
    `text-sm ${extraPl} py-2 rounded-md transition ${
      location.pathname === path
        ? "bg-white/20 text-white font-semibold"
        : "hover:bg-white/10 hover:text-white text-white/80"
    }`;

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
          {links.map((link, idx) => {
            if (link.children?.length) {
              const subKey = link.submenuKey || `sub-${idx}`;
              const subOpen = openSubmenus?.[subKey] ?? false;
              const childActive = link.children.some((c) => c.to && location.pathname === c.to);
              return (
                <div key={idx} className="flex flex-col">
                  {toggleSubmenu ? (
                    <button
                      type="button"
                      onClick={() => toggleSubmenu(subKey)}
                      className={`flex items-center justify-between text-sm pl-6 pr-2 py-2 rounded-md text-left transition w-full
                        ${
                          childActive && !subOpen
                            ? "bg-white/15 text-white font-medium"
                            : "text-white/85 hover:bg-white/10 hover:text-white"
                        }`}
                    >
                      <span className="font-medium">{link.text}</span>
                      <FaChevronDown
                        className={`text-xs shrink-0 transition-transform ${subOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  ) : (
                    <span className="text-sm pl-6 py-1.5 text-white/85 font-medium">{link.text}</span>
                  )}
                  {subOpen &&
                    link.children.map((child, cidx) =>
                      child.to ? (
                        <Link
                          key={`${idx}-${cidx}`}
                          to={child.to}
                          className={linkClass(child.to, "pl-10")}
                        >
                          {child.text}
                        </Link>
                      ) : null
                    )}
                </div>
              );
            }
            return link.to ? (
              <Link key={idx} to={link.to} className={linkClass(link.to, "pl-6")}>
                {link.text}
              </Link>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}
