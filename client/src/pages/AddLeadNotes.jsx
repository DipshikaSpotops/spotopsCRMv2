import { useMemo, useState, useEffect, useRef } from "react";
import API from "../api";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import AgentDropdown from "../components/AgentDropdown";
import moment from "moment-timezone";
import { formatInTimeZone } from "date-fns-tz";

// Mapping from 50STARS agent firstName to PROLANE agent firstName (same as AddOrder.jsx)
const AGENT_BRAND_MAPPING = {
  Richard: "Victor",
  Mark: "Sam",
  David: "Steve",
  Michael: "Charlie",
  Dipsikha: "Dipsikha", // Same for both brands
};

function readAuthFromStorage() {
  try {
    const raw = localStorage.getItem("auth");
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        role: parsed?.user?.role || localStorage.getItem("role") || undefined,
        firstName: parsed?.user?.firstName || undefined,
      };
    }
  } catch (err) {
    console.warn("Failed to parse auth storage", err);
  }

  return {
    role: localStorage.getItem("role") || undefined,
    firstName: localStorage.getItem("firstName") || undefined,
  };
}

const AddLeadNotes = () => {
  const { role, firstName } = useMemo(() => readAuthFromStorage(), []);
  
  // Get email from storage
  const email = useMemo(() => {
    try {
      const raw = localStorage.getItem("auth");
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed?.user?.email || localStorage.getItem("email") || undefined;
      }
    } catch (err) {
      console.warn("Failed to parse auth storage", err);
    }
    return localStorage.getItem("email") || undefined;
  }, []);
  
  const isSales = role === "Sales";

  const [form, setForm] = useState({
    name: "",
    email: "",
    year: "",
    make: "",
    model: "",
    partRequired: "",
    partDescription: "",
    vinNo: "",
    partNo: "",
    warranty: "",
    warrantyField: "days",
    brand: "",
    salesAgent: "",
    comments: "$ with programming and 1 year",
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimeoutRef = useRef(null);
  const [showLeads, setShowLeads] = useState(false);
  const [showAllLeads, setShowAllLeads] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [leads, setLeads] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [salesAgents, setSalesAgents] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [parts, setParts] = useState([]);
  const [dateFilter, setDateFilter] = useState(() => {
    // Initialize with today (Dallas timezone)
    const todayDallas = moment.tz("America/Chicago").startOf("day");
    const todayEndDallas = moment.tz("America/Chicago").endOf("day");
    return {
      start: todayDallas.utc().toISOString(),
      end: todayEndDallas.utc().toISOString(),
    };
  });

  const requiredFields = [
    "name",
    "email",
    "partRequired",
    "year",
    "make",
    "model",
    "partDescription",
    "vinNo",
    "warranty",
    "brand",
    "salesAgent",
    "comments",
  ];

  const validate = () => {
    const e = {};
    requiredFields.forEach((k) => {
      if (!String(form[k] || "").trim()) e[k] = "Required";
    });
    // Validate email format
    if (form.email && !/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/.test(form.email.trim())) {
      e.email = "Enter a valid email address";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const setField = (key) => (e) => {
    setForm((prev) => ({
      ...prev,
      [key]: e.target.value,
    }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSubmitting(true);
      setToast("");
      
      // Clear any existing timeout
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      
      await API.post("/lead-notes", form);
      setToast("Lead note saved successfully.");
      
      // Auto-hide toast after 5 seconds
      toastTimeoutRef.current = setTimeout(() => {
        setToast("");
        toastTimeoutRef.current = null;
      }, 5000);
      
      setForm({
        name: "",
        email: "",
        year: "",
        make: "",
        model: "",
        partRequired: "",
        partDescription: "",
        vinNo: "",
        partNo: "",
        warranty: "",
        warrantyField: "days",
        brand: "",
        salesAgent: "",
        comments: "$ with programming and 1 year",
      });
      if (showLeads || showAllLeads) {
        fetchLeads(newFilter);
      }
    } catch (err) {
      console.error("Error saving lead note:", err);
      const message =
        err?.response?.data?.message || "Failed to save lead note.";
      setToast(message);
      
      // Clear any existing timeout
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      
      // Auto-hide error toast after 5 seconds as well
      toastTimeoutRef.current = setTimeout(() => {
        setToast("");
        toastTimeoutRef.current = null;
      }, 5000);
    } finally {
      setSubmitting(false);
    }
  };

  const fetchLeads = async (filter = dateFilter) => {
    try {
      setLoadingLeads(true);
      const params = {};
      if (filter?.start && filter?.end) {
        params.start = filter.start;
        params.end = filter.end;
      }
      // Always fetch all leads for the date range; frontend will handle "My" vs "All" filtering
      const { data } = await API.get("/lead-notes/all", { params });
      setLeads(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching lead notes:", err);
    } finally {
      setLoadingLeads(false);
    }
  };

  const handleFilterChange = (filter) => {
    // UnifiedDatePicker sends { start, end } as UTC ISO strings
    const newFilter = {
      start: filter.start,
      end: filter.end,
    };
    setDateFilter(newFilter);
    if (showLeads || showAllLeads) {
      fetchLeads(newFilter);
    }
  };

  useEffect(() => {
    if (showLeads || showAllLeads) {
      fetchLeads(dateFilter);
    }
  }, [showLeads, showAllLeads, dateFilter]);

  // Fetch sales agents for dropdown
  useEffect(() => {
    const fetchSalesAgents = async () => {
      try {
        setLoadingAgents(true);
        const { data } = await API.get("/lead-notes/sales-agents");
        setSalesAgents(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Error fetching sales agents:", err);
        setSalesAgents([]);
      } finally {
        setLoadingAgents(false);
      }
    };
    fetchSalesAgents();
  }, []);

  // Fetch parts for Part Required dropdown
  useEffect(() => {
    const fetchParts = async () => {
      try {
        const res = await API.get("/parts");
        setParts(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error("Error fetching parts:", err);
        setParts([]);
      }
    };
    fetchParts();
  }, []);

  // Build options list for AgentDropdown (same style as DisputedOrders)
  const agentOptions = useMemo(() => {
    const names = salesAgents.map((a) => a.firstName).filter(Boolean);
    return ["Select", ...Array.from(new Set(names))];
  }, [salesAgents]);

  // Compute which agent names belong to the logged-in user (for "My Leads")
  const myAgentNames = useMemo(() => {
    const base = (firstName || "").trim();
    if (!base) return [];
    const names = [base];
    const mapped = AGENT_BRAND_MAPPING[base];
    if (mapped && !names.includes(mapped)) {
      names.push(mapped);
    }
    return names;
  }, [firstName]);

  // Base leads depending on whether we're showing "My Leads" or "All Leads"
  const baseLeads = useMemo(() => {
    if (!Array.isArray(leads) || leads.length === 0) return [];
    if (showAllLeads) return leads;

    if (showLeads && myAgentNames.length > 0) {
      const allowed = new Set(myAgentNames.map((n) => n.toLowerCase()));
      return leads.filter((lead) =>
        allowed.has((lead.salesAgent || "").toLowerCase())
      );
    }

    return leads;
  }, [leads, showAllLeads, showLeads, myAgentNames]);

  // Filter leads by search query (applied to baseLeads)
  const filteredLeads = useMemo(() => {
    if (!appliedQuery.trim()) return baseLeads;
    const query = appliedQuery.trim().toLowerCase();
    return baseLeads.filter((lead) => {
      const searchableText = [
        lead.name,
        lead.email,
        lead.year,
        lead.make,
        lead.model,
        lead.partRequired,
        lead.partDescription,
        lead.vinNo,
        lead.partNo,
        lead.warranty,
        lead.warrantyField,
        lead.brand,
        lead.salesAgent,
        lead.comments,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchableText.includes(query);
    });
  }, [baseLeads, appliedQuery]);

  // Copy form data to clipboard
  const handleCopy = async () => {
    const formatValue = (value) => (value && value.trim() ? value.trim() : "");
    
    const warrantyDisplay = form.warranty && form.warrantyField
      ? `${form.warranty} ${form.warrantyField}`
      : form.warranty || "";
    
    const copyText = [
      `Name: ${formatValue(form.name)}`,
      `Email: ${formatValue(form.email)}`,
      `Part required: ${formatValue(form.partRequired)}`,
      `Year: ${formatValue(form.year)}`,
      `Make: ${formatValue(form.make)}`,
      `Model: ${formatValue(form.model)}`,
      `Part Description: ${formatValue(form.partDescription)}`,
      `Vin: ${formatValue(form.vinNo)}`,
      `Part no: ${formatValue(form.partNo)}`,
      `Warranty: ${warrantyDisplay}`,
      `brand: ${formatValue(form.brand)}`,
      `salesAgent: ${formatValue(form.salesAgent)}`,
      `other comments: ${formatValue(form.comments)}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(copyText);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = copyText;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (fallbackErr) {
        console.error("Fallback copy failed:", fallbackErr);
      }
      document.body.removeChild(textArea);
    }
  };

  // Only allow Sales, Admin roles, or specific email
  const isAdmin = role === "Admin";
  const isAuthorizedEmail = email?.toLowerCase() === "50starsauto110@gmail.com";
  const isAuthorized = isSales || isAdmin || isAuthorizedEmail;
  
  if (!isAuthorized) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-red-400 mb-4">Access Denied</h1>
          <p className="text-white/70">
            This page is only accessible to Sales and Admin users, or 50starsauto110@gmail.com.
          </p>
          <p className="text-white/50 mt-2">Your current role: {role || "Not set"}</p>
          <p className="text-white/50">Your email: {email || "Not set"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-3xl font-bold text-white underline decoration-1">
            Add Lead Notes
          </h2>
          <UnifiedDatePicker onFilterChange={handleFilterChange} />
        </div>
        <div className="flex items-center gap-3">
          {/* Search bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAppliedQuery(searchInput.trim());
            }}
            className="relative w-[280px]"
          >
            <input
              value={searchInput}
              onChange={(e) => {
                const v = e.target.value;
                setSearchInput(v);
                if (v.trim() === "" && appliedQuery !== "") {
                  setAppliedQuery("");
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchInput("");
                  setAppliedQuery("");
                }
              }}
              placeholder="Search… (press Enter)"
              className="px-3 py-2 pr-9 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/30 w-full"
              aria-label="Search leads"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setAppliedQuery("");
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
            <input type="submit" hidden />
          </form>
          <button
            onClick={() => {
              setShowAllLeads(false);
              setShowLeads((prev) => !prev);
            }}
            className="px-4 py-2 rounded-lg font-medium bg-[#04356d] hover:bg-[#3b89bf] text-white whitespace-nowrap"
          >
            {showLeads ? "Hide" : "Show"} My Leads
          </button>
          <button
            onClick={() => {
              setShowLeads(false);
              setShowAllLeads((prev) => !prev);
            }}
            className="px-4 py-2 rounded-lg font-medium bg-[#04356d] hover:bg-[#3b89bf] text-white whitespace-nowrap"
          >
            {showAllLeads ? "Hide" : "Show"} All Leads
          </button>
        </div>
      </div>

      {/* Content */}
      <div>
        {/* Form */}
        {!showLeads && (
          <form
            onSubmit={handleSubmit}
            className="bg-white/10 rounded-2xl p-5 border border-white/20 shadow-md backdrop-blur-md space-y-3 max-w-4xl"
          >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-white">New Lead</h3>
            <button
              type="button"
              onClick={handleCopy}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                copySuccess
                  ? "bg-green-600 text-white"
                  : "bg-[#04356d] hover:bg-[#3b89bf] text-white"
              }`}
            >
              {copySuccess ? "✓ Copied!" : "Copy"}
            </button>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  Brand
                </label>
                <AgentDropdown
                  options={["Select", "50STARS", "PROLANE"]}
                  value={form.brand || "Select"}
                  onChange={(val) => {
                    setForm((prev) => ({
                      ...prev,
                      brand: val === "Select" ? "" : val,
                    }));
                    if (errors.brand) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.brand;
                        return next;
                      });
                    }
                  }}
                  placeholder="Select Brand"
                  className="w-full"
                />
                {errors.brand && (
                  <p className="mt-1 text-xs text-red-200">
                    {typeof errors.brand === "string" ? errors.brand : "Required"}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  Sales Agent
                </label>
                <AgentDropdown
                  options={agentOptions}
                  value={form.salesAgent || "Select"}
                  onChange={(val) => {
                    setForm((prev) => ({
                      ...prev,
                      salesAgent: val === "Select" ? "" : val,
                    }));
                    if (errors.salesAgent) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.salesAgent;
                        return next;
                      });
                    }
                  }}
                  className="w-full"
                />
                {errors.salesAgent && (
                  <p className="mt-1 text-xs text-red-200">
                    {typeof errors.salesAgent === "string"
                      ? errors.salesAgent
                      : "Required"}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <InputField
                label="Name"
                value={form.name}
                onChange={setField("name")}
                error={errors.name}
              />
              <InputField
                label="Email"
                value={form.email}
                onChange={setField("email")}
                error={errors.email}
                type="email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Part Required
              </label>
              <select
                value={form.partRequired}
                onChange={setField("partRequired")}
                className={`w-full px-3 py-2 rounded-lg bg-white/10 border text-white outline-none focus:ring-2 focus:ring-white/30 ${
                  errors.partRequired ? "border-red-400" : "border-white/20"
                }`}
              >
                <option value="">Select Part Required</option>
                {parts.map((p) => (
                  <option key={p._id} value={p.name} className="text-black">
                    {p.name}
                  </option>
                ))}
              </select>
              {errors.partRequired && (
                <p className="mt-1 text-xs text-red-200">
                  {typeof errors.partRequired === "string"
                    ? errors.partRequired
                    : "Required"}
                </p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <InputField
                label="Year"
                value={form.year}
                onChange={setField("year")}
                error={errors.year}
              />
              <InputField
                label="Make"
                value={form.make}
                onChange={setField("make")}
                error={errors.make}
              />
              <InputField
                label="Model"
                value={form.model}
                onChange={setField("model")}
                error={errors.model}
              />
            </div>
            <InputField
              label="Part Description"
              value={form.partDescription}
              onChange={setField("partDescription")}
              error={errors.partDescription}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <InputField
                label="VIN No"
                value={form.vinNo}
                onChange={setField("vinNo")}
                error={errors.vinNo}
              />
              <InputField
                label="Part No"
                value={form.partNo}
                onChange={setField("partNo")}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <InputField
                label="Warranty"
                type="number"
                value={form.warranty}
                onChange={setField("warranty")}
                error={errors.warranty}
              />
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  Warranty Units
                </label>
                <select
                  value={form.warrantyField}
                  onChange={setField("warrantyField")}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white outline-none focus:ring-2 focus:ring-white/30"
                >
                  <option value="days" className="text-black">
                    {Number(form.warranty) === 1 ? "Day" : "Day(s)"}
                  </option>
                  <option value="months" className="text-black">
                    {Number(form.warranty) === 1 ? "Month" : "Month(s)"}
                  </option>
                  <option value="years" className="text-black">
                    {Number(form.warranty) === 1 ? "Year" : "Year(s)"}
                  </option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Other Details
              </label>
              <textarea
                value={form.comments}
                onChange={setField("comments")}
                rows={4}
                className={`w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white outline-none focus:ring-2 focus:ring-white/30 ${
                  errors.comments ? "border-red-400" : "border-white/20"
                }`}
                style={{ caretColor: '#ffff00' }}
              />
              {errors.comments && (
                <p className="mt-1 text-xs text-red-200">
                  {typeof errors.comments === "string"
                    ? errors.comments
                    : "Required"}
                </p>
              )}
            </div>
          </div>

          {toast && (
            <p className="mt-2 text-sm text-yellow-200 bg-yellow-900/30 border border-yellow-700/40 rounded-md px-3 py-2">
              {toast}
            </p>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className={`px-4 py-2 rounded-lg font-semibold shadow-md bg-[#04356d] hover:bg-[#3b89bf] text-white disabled:opacity-60 ${
                submitting ? "cursor-not-allowed" : ""
              }`}
            >
              {submitting ? "Saving..." : "Save Lead"}
            </button>
          </div>
        </form>
        )}

        {/* Leads list */}
        {(showLeads || showAllLeads) && (
          <div className="bg-white/10 rounded-2xl p-5 border border-white/20 shadow-md backdrop-blur-md">
              <h3 className="text-lg font-semibold text-white mb-3">
                {showAllLeads ? "All Leads" : "My Leads"}
              </h3>
              {loadingLeads ? (
                <div className="p-4 text-white/80 text-center">
                  ⏳ Loading leads...
                </div>
              ) : filteredLeads.length === 0 ? (
                <div className="p-4 text-white/80 text-center">
                  {appliedQuery ? "No leads found matching your search." : "No leads found."}
                </div>
              ) : (
                <div className="max-h-[70vh] overflow-y-auto rounded-xl ring-1 ring-white/10">
                  <table className="min-w-full bg-black/20 text-white text-sm">
                    <thead className="sticky top-0 bg-[#5c8bc1] text-black z-10">
                      <tr>
                        <th className="p-2 text-left border-r border-white/20">
                          Date
                        </th>
                        <th className="p-2 text-left border-r border-white/20">
                          Name
                        </th>
                        <th className="p-2 text-left border-r border-white/20">
                          Email
                        </th>
                        <th className="p-2 text-left border-r border-white/20">
                          Brand
                        </th>
                        <th className="p-2 text-left border-r border-white/20">
                          Sales Agent
                        </th>
                        <th className="p-2 text-left border-r border-white/20">
                          Y/M/M
                        </th>
                        <th className="p-2 text-left border-r border-white/20">
                          Part
                        </th>
                        <th className="p-2 text-left border-r border-white/20">
                          VIN
                        </th>
                        <th className="p-2 text-left border-r border-white/20">
                          Part No
                        </th>
                        <th className="p-2 text-left border-r border-white/20">
                          Warranty
                        </th>
                        <th className="p-2 text-left border-r border-white/20">
                          Comments
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeads.map((lead) => (
                        <tr
                          key={lead._id}
                          className="even:bg-white/5 odd:bg-white/10"
                        >
                          <td className="p-2 border-r border-white/15 whitespace-nowrap">
                            {lead.createdAt
                              ? formatInTimeZone(
                                  new Date(lead.createdAt),
                                  "America/Chicago",
                                  "do MMM, yyyy"
                                )
                              : "—"}
                          </td>
                          <td className="p-2 border-r border-white/15 whitespace-nowrap">
                            {lead.name || "—"}
                          </td>
                          <td className="p-2 border-r border-white/15 whitespace-nowrap">
                            {lead.email || "—"}
                          </td>
                          <td className="p-2 border-r border-white/15 whitespace-nowrap">
                            {lead.brand || "—"}
                          </td>
                          <td className="p-2 border-r border-white/15 whitespace-nowrap">
                            {lead.salesAgent || "—"}
                          </td>
                          <td className="p-2 border-r border-white/15 whitespace-nowrap">
                            {[lead.year, lead.make, lead.model]
                              .filter(Boolean)
                              .join(" ") || "—"}
                          </td>
                          <td className="p-2 border-r border-white/15 whitespace-nowrap">
                            {lead.partRequired || lead.partDescription || "—"}
                          </td>
                          <td className="p-2 border-r border-white/15 whitespace-nowrap">
                            {lead.vinNo || "—"}
                          </td>
                          <td className="p-2 border-r border-white/15 whitespace-nowrap">
                            {lead.partNo || "—"}
                          </td>
                          <td className="p-2 border-r border-white/15 whitespace-nowrap">
                            {lead.warranty && lead.warrantyField
                              ? `${lead.warranty} ${lead.warrantyField}`
                              : lead.warranty || "—"}
                          </td>
                          <td className="p-2 border-r border-white/15">
                            {lead.comments || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
};

function InputField({ label, value, onChange, error, type = "text" }) {
  return (
    <div>
      <label className="block text-sm font-medium text-white mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        className={`w-full px-3 py-2 rounded-lg bg-white/10 border text-white outline-none focus:ring-2 focus:ring-white/30 ${
          error ? "border-red-400" : "border-white/20"
        }`}
      />
      {error && (
        <p className="mt-1 text-xs text-red-200">
          {typeof error === "string" ? error : "Required"}
        </p>
      )}
    </div>
  );
}

export default AddLeadNotes;

