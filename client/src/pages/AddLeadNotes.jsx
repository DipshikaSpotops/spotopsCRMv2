import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
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
  Dipshika: "Dipsikha", // Handle alternate spelling for safety
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
  const navigate = useNavigate();
  
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

  const createEmptyForm = () => ({
    name: "",
    email: "",
    phoneNo: "",
    year: "",
    make: "",
    model: "",
    partRequired: "",
    partDescription: "",
    vinNo: "",
    partNo: "",
    warranty: "",
    warrantyField: "",
    brand: "",
    salesAgent: "",
    leadOrigin: "",
    leadNo: "",
    leadStatus: "",
    comments: "$ with programming and 1 year",
  });

  const [form, setForm] = useState(createEmptyForm);
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
  const [editingLeadId, setEditingLeadId] = useState(null);
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
    "phoneNo",
    "partRequired",
    "year",
    "make",
    "model",
    "partDescription",
    "vinNo",
    "warranty",
    "warrantyField",
    "brand",
    "salesAgent",
    "leadOrigin",
    "leadNo",
    "comments",
  ];

  const validate = () => {
    const e = {};
    requiredFields.forEach((k) => {
      if (!String(form[k] || "").trim()) e[k] = "Required";
    });
    // Special case: Other Details should not stay at the default placeholder text
    const defaultComments = "$ with programming and 1 year";
    const commentsValue = String(form.comments || "").trim();
    if (!e.comments && commentsValue === defaultComments) {
      e.comments = "Required";
    }
    // Ensure Other Details starts with `$` followed by a valid number like 300 or 300.14
    if (
      !e.comments && // only if not already marked as error
      commentsValue
    ) {
      const moneyPattern = /^\$\s*\d+(\.\d{0,2})?(\b|[^0-9])/;
      if (!moneyPattern.test(commentsValue)) {
        e.comments = "Enter amount after $ like $300 or $300.14";
      }
    }
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

    // Validation failed – show a visible error toast
    if (!validate()) {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      setToast("Please fix the highlighted fields before saving.");
      toastTimeoutRef.current = setTimeout(() => {
        setToast("");
        toastTimeoutRef.current = null;
      }, 5000);
      return;
    }

    try {
      setSubmitting(true);
      setToast("");
      
      // Clear any existing timeout
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      
      const payload = { ...form };
      console.log("Submitting lead:", editingLeadId ? "UPDATE" : "CREATE", payload);
      
      // Create or update depending on editingLeadId
      let response;
      if (editingLeadId) {
        response = await API.put(`/lead-notes/${editingLeadId}`, payload);
        setToast("Lead updated successfully.");
      } else {
        response = await API.post("/lead-notes", payload);
        setToast("Lead note saved successfully.");
      }
      
      console.log("Lead saved successfully:", response.data);
      
      // Auto-hide success toast after 5 seconds
      toastTimeoutRef.current = setTimeout(() => {
        setToast("");
        toastTimeoutRef.current = null;
      }, 5000);
      
      setForm(createEmptyForm());
      setEditingLeadId(null);
      if (showLeads || showAllLeads) {
        fetchLeads(dateFilter);
      }
    } catch (err) {
      console.error("Error saving lead note:", err);
      console.error("Error details:", err.response?.data);
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

  // Whenever both "Show My Leads" and "Show All Leads" are off (form visible),
  // ensure the form is reset to an empty state *only when not editing*.
  useEffect(() => {
    if (!showLeads && !showAllLeads && !editingLeadId) {
      setForm(createEmptyForm());
      setEditingLeadId(null);
      setErrors({});
      // Do not clear toast here so success messages can still be seen
    }
  }, [showLeads, showAllLeads, editingLeadId]);

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

  // Normalize firstName for edge cases (e.g., Dipshika vs Dipsikha)
  const normalizeFirstName = (name) => {
    if (!name) return "";
    const trimmed = String(name).trim();
    const lower = trimmed.toLowerCase();
    if (lower === "dipshika" || lower === "dipsikha") return "Dipsikha";
    return trimmed;
  };

  // Compute which agent names belong to the logged-in user (for "My Leads")
  const myAgentNames = useMemo(() => {
    const baseRaw = (firstName || "").trim();
    if (!baseRaw) return [];
    const base = normalizeFirstName(baseRaw);
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
      `Phone: ${formatValue(form.phoneNo)}`,
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

  // Fetch next lead number for current user / selected brand (server-calculated)
  const fetchNextLeadNo = async (brand) => {
    if (!brand) return;
    try {
      const { data } = await API.get("/lead-notes/next-number", {
        params: { brand },
      });
      if (data?.leadNo) {
        setForm((prev) => ({
          ...prev,
          leadNo: data.leadNo, // Always update when brand changes (for new leads)
        }));
      }
    } catch (err) {
      console.error("Error fetching next lead number:", err);
    }
  };

  // Helper to save a lead with an optional status and optional redirect to AddOrder
  const saveLeadWithStatus = async (status, { redirectToOrder = false } = {}) => {
    // Validation & top-level error toast are handled by handleSubmit-style logic
    if (!validate()) {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      setToast("Please fix the highlighted fields before saving.");
      toastTimeoutRef.current = setTimeout(() => {
        setToast("");
        toastTimeoutRef.current = null;
      }, 5000);
      return null;
    }

    try {
      setSubmitting(true);
      setToast("");

      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }

      const payload = {
        ...form,
        ...(status ? { leadStatus: status } : {}),
      };

      let response;
      if (editingLeadId) {
        response = await API.put(`/lead-notes/${editingLeadId}`, payload);
      } else {
        response = await API.post("/lead-notes", payload);
      }

      const lead = response?.data || payload;

      if (!redirectToOrder) {
        setToast(
          status
            ? `Lead saved as ${status}.`
            : editingLeadId
            ? "Lead updated successfully."
            : "Lead note saved successfully."
        );

        // Auto-hide toast after 5 seconds
        toastTimeoutRef.current = setTimeout(() => {
          setToast("");
          toastTimeoutRef.current = null;
        }, 5000);

        setForm(createEmptyForm());
        setEditingLeadId(null);
        if (showLeads || showAllLeads) {
          fetchLeads(dateFilter);
        }
      }

      return lead;
    } catch (err) {
      console.error("Error saving lead:", err);
      const message =
        err?.response?.data?.message || "Failed to save lead note.";
      setToast(message);

      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      toastTimeoutRef.current = setTimeout(() => {
        setToast("");
        toastTimeoutRef.current = null;
      }, 5000);

      return null;
    } finally {
      setSubmitting(false);
    }
  };

  // Buttons for quick status changes without redirect
  const handleStatusSave = async (status) => {
    await saveLeadWithStatus(status, { redirectToOrder: false });
  };

  // Save lead and immediately start sale (prefill AddOrder)
  const handleSale = async () => {
    const lead = await saveLeadWithStatus("Sale", { redirectToOrder: true });
    if (!lead) return;

    try {
      // Persist leadDraft so AddOrder can prefill
      localStorage.setItem(
        "leadDraft",
        JSON.stringify({
          _id: lead._id,
          name: lead.name || form.name || "",
          email: lead.email || form.email || "",
              phoneNo: lead.phone || form.phone || "",
          year: lead.year || form.year || "",
          make: lead.make || form.make || "",
          model: lead.model || form.model || "",
          partRequired: lead.partRequired || form.partRequired || "",
          partDescription: lead.partDescription || form.partDescription || "",
          vinNo: lead.vinNo || form.vinNo || "",
          partNo: lead.partNo || form.partNo || "",
          warranty: lead.warranty || form.warranty || "",
          warrantyField: lead.warrantyField || form.warrantyField || "days",
          brand: lead.brand || form.brand || "",
          salesAgent: lead.salesAgent || form.salesAgent || "",
          leadOrigin: lead.leadOrigin || form.leadOrigin || "",
          comments: lead.comments || form.comments || "",
        })
      );
    } catch (storageErr) {
      console.error("Failed to save leadDraft to localStorage:", storageErr);
    }

    // Switch active brand to the lead's brand so order is created under correct brand
    const leadBrand = lead.brand || form.brand;
    if (leadBrand) {
      try {
        localStorage.setItem("currentBrand", leadBrand);
        window.dispatchEvent(new Event("brand-changed"));
      } catch (err) {
        console.error("Failed to update currentBrand from lead:", err);
      }
    }

    navigate("/add-order");
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
        {!showLeads && !showAllLeads && (
          <form
            onSubmit={handleSubmit}
            className="bg-white/10 rounded-2xl p-5 border border-white/20 shadow-md backdrop-blur-md space-y-3 max-w-4xl"
          >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-white">
              {editingLeadId ? "Edit Lead" : "New Lead"}
              {form.leadNo ? ` - ${form.leadNo}` : ""}
            </h3>
            <div className="flex items-center gap-2 flex-wrap justify-end">
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
              <button
                type="button"
                onClick={() => handleStatusSave("Voicemail")}
                disabled={submitting}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-60"
              >
                Voicemail
              </button>
              <button
                type="button"
                onClick={() => handleStatusSave("Quoted")}
                disabled={submitting}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-60"
              >
                Quoted
              </button>
              <button
                type="button"
                onClick={() => handleStatusSave("Invalid")}
                disabled={submitting}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white disabled:opacity-60"
              >
                Invalid
              </button>
              <button
                type="button"
                onClick={handleSale}
                disabled={submitting}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-500 text-white disabled:opacity-60"
              >
                Sale
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  Brand
                </label>
                <AgentDropdown
                  options={["Select", "50STARS", "PROLANE"]}
                  value={form.brand || "Select"}
                  onChange={async (val) => {
                    const brandValue = val === "Select" ? "" : val;
                    setForm((prev) => ({
                      ...prev,
                      brand: brandValue,
                      // Clear leadNo when brand is cleared
                      leadNo: brandValue ? prev.leadNo : "",
                    }));
                    if (errors.brand) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.brand;
                        return next;
                      });
                    }
                    // Only auto-generate Lead No for new leads (not when editing)
                    if (brandValue && !editingLeadId) {
                      await fetchNextLeadNo(brandValue);
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
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  Lead Origin
                </label>
                <AgentDropdown
                  options={["Select", "Chat", "Call", "Lead"]}
                  value={form.leadOrigin || "Select"}
                  onChange={(val) => {
                    setForm((prev) => ({
                      ...prev,
                      leadOrigin: val === "Select" ? "" : val,
                    }));
                    if (errors.leadOrigin) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.leadOrigin;
                        return next;
                      });
                    }
                  }}
                  placeholder="Select Lead Origin"
                  className="w-full"
                />
                {errors.leadOrigin && (
                  <p className="mt-1 text-xs text-red-200">
                    {typeof errors.leadOrigin === "string"
                      ? errors.leadOrigin
                      : "Required"}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <InputField
                label="Name"
                value={form.name}
                onChange={setField("name")}
                error={errors.name}
              />
              <InputField
                label="Phone"
                value={form.phoneNo}
                onChange={setField("phoneNo")}
                error={errors.phoneNo}
              />
              <InputField
                label="Email"
                value={form.email}
                onChange={setField("email")}
                error={errors.email}
                type="email"
              />
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
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
              <InputField
                label="Part Description"
                value={form.partDescription}
                onChange={setField("partDescription")}
                error={errors.partDescription}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
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
                  className={`w-full px-3 py-2 rounded-lg bg-white/10 border text-white outline-none focus:ring-2 focus:ring-white/30 ${
                    errors.warrantyField ? "border-red-400" : "border-white/20"
                  }`}
                >
                  <option value="" className="text-black">
                    Select Warranty Units
                  </option>
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
                {errors.warrantyField && (
                  <p className="mt-1 text-xs text-red-200">
                    {typeof errors.warrantyField === "string"
                      ? errors.warrantyField
                      : "Required"}
                  </p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Other Details
              </label>
              <textarea
                value={form.comments}
                onChange={setField("comments")}
                rows={8}
                className={`w-full px-3 py-3 rounded-lg bg-white/10 border border-white/20 text-white outline-none focus:ring-2 focus:ring-white/30 ${
                  errors.comments ? "border-red-400" : "border-white/20"
                }`}
                style={{ caretColor: "#ffff00" }}
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
                          Lead Number
                        </th>
                        <th className="p-2 text-left border-r border-white/20">
                          Sales Agent
                        </th>
                        <th className="p-2 text-left border-r border-white/20">
                          Name Email Phone
                        </th>
                        <th className="p-2 text-left border-r border-white/20">
                          Part Info
                        </th>
                        <th className="p-2 text-left border-r border-white/20">
                          Part Required
                        </th>
                        <th className="p-2 text-left border-r border-white/20">
                          Comments
                        </th>
                        <th className="p-2 text-left border-r border-white/20">
                          Status
                        </th>
                        {showLeads && !showAllLeads && (
                          <th className="p-2 text-left">
                            Action
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeads.map((lead) => (
                        <tr
                          key={lead._id}
                          className="even:bg-white/5 odd:bg-white/10"
                        >
                          <td className="p-2 border-r border-white/15 whitespace-nowrap">
                            {(lead.leadDate || lead.createdAt)
                              ? formatInTimeZone(
                                  new Date(lead.leadDate || lead.createdAt),
                                  "America/Chicago",
                                  "do MMM, yyyy"
                                )
                              : "—"}
                          </td>
                          <td className="p-2 border-r border-white/15 whitespace-nowrap">
                            {lead.leadNo || "—"}
                          </td>
                          <td className="p-2 border-r border-white/15 whitespace-nowrap">
                            {lead.salesAgent || "—"}
                          </td>
                          <td className="p-2 border-r border-white/15">
                            {lead.name && (
                              <div className="whitespace-nowrap">
                                <span className="font-semibold">Name:</span>{" "}
                                {lead.name}
                              </div>
                            )}
                            {lead.email && (
                              <div className="whitespace-nowrap">
                                <span className="font-semibold">Email:</span>{" "}
                                {lead.email}
                              </div>
                            )}
                            {lead.phoneNo && (
                              <div className="whitespace-nowrap">
                                <span className="font-semibold">Ph:</span>{" "}
                                {lead.phoneNo}
                              </div>
                            )}
                            {!lead.name && !lead.email && !lead.phoneNo && "—"}
                          </td>
                          <td className="p-2 border-r border-white/15">
                            {[lead.year, lead.make, lead.model].some(Boolean) && (
                              <div className="whitespace-nowrap">
                                <span className="font-semibold">Year/Make/Model:</span>{" "}
                                {[lead.year, lead.make, lead.model]
                                  .filter(Boolean)
                                  .join(" ")}
                              </div>
                            )}
                            {lead.vinNo && (
                              <div className="whitespace-nowrap">
                                <span className="font-semibold">VIN:</span>{" "}
                                {lead.vinNo}
                              </div>
                            )}
                            {lead.warranty && (
                              <div className="whitespace-nowrap">
                                <span className="font-semibold">Warranty:</span>{" "}
                                {lead.warranty} {lead.warrantyField || ""}
                              </div>
                            )}
                            {![
                              lead.year,
                              lead.make,
                              lead.model,
                              lead.vinNo,
                              lead.warranty,
                            ].some(Boolean) && "—"}
                          </td>
                          <td className="p-2 border-r border-white/15">
                            {lead.partRequired && (
                              <div className="whitespace-nowrap">
                                <span className="font-semibold">Part Required:</span>{" "}
                                {lead.partRequired}
                              </div>
                            )}
                            {lead.partDescription && (
                              <div>
                                <span className="font-semibold">Description:</span>{" "}
                                {lead.partDescription}
                              </div>
                            )}
                            {!lead.partRequired && !lead.partDescription && "—"}
                          </td>
                          <td className="p-2 border-r border-white/15">
                            {lead.comments || "—"}
                          </td>
                          <td className="p-2 border-r border-white/15 whitespace-nowrap">
                            {lead.leadStatus || "—"}
                          </td>
                          {showLeads && !showAllLeads && (
                            <td className="p-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const leadId = lead._id || null;
                                  console.log("Editing lead:", leadId, lead);
                                  setEditingLeadId(leadId);
                                  setForm({
                                    name: lead.name || "",
                                    email: lead.email || "",
                                    phoneNo: lead.phoneNo || "",
                                    year: lead.year || "",
                                    make: lead.make || "",
                                    model: lead.model || "",
                                    partRequired: lead.partRequired || "",
                                    partDescription: lead.partDescription || "",
                                    vinNo: lead.vinNo || "",
                                    partNo: lead.partNo || "",
                                    warranty: lead.warranty || "",
                                    warrantyField: lead.warrantyField || "days",
                                    brand: lead.brand || "",
                                    salesAgent: lead.salesAgent || "",
                                    leadOrigin: lead.leadOrigin || "",
                                    leadNo: lead.leadNo || "",
                                    leadStatus: lead.leadStatus || "",
                                    comments:
                                      lead.comments ||
                                      "$ with programming and 1 year",
                                  });
                                  // Show form for editing
                                  setShowLeads(false);
                                  setShowAllLeads(false);
                                  setErrors({});
                                  console.log(
                                    "Form set for editing, editingLeadId:",
                                    leadId
                                  );
                                }}
                                className="px-3 py-1 rounded-lg text-xs font-semibold bg-yellow-500 hover:bg-yellow-400 text-black shadow-sm"
                              >
                                Edit
                              </button>
                            </td>
                          )}
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

