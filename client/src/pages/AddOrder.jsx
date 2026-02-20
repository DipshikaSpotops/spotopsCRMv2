import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { STATES } from "../data/states";
import { getCurrentBrand } from "../utils/brand";

// Mapping from 50STARS agent firstName to PROLANE agent firstName
const AGENT_BRAND_MAPPING = {
  "Richard": "Victor",
  "Mark": "Sam",
  "David": "Steve",
  "Michael": "Charlie",
  "Dipsikha": "Dipsikha", // Same for both brands
};

const REQUIRED_FIELD_LABELS = {
  orderNo: "Order No",
  salesAgent: "Sales Agent",
  fName: "First Name",
  lName: "Last Name",
  email: "Email",
  phone: "Phone",
  bAddressStreet: "Billing Street",
  bAddressCity: "Billing City",
  bAddressState: "Billing State",
  bAddressZip: "Billing Zip",
  bAddressAcountry: "Billing Country",
  paymentSource: "Payment Source",
  authorizationId: "Authorization ID",
  sAddressStreet: "Shipping Street",
  sAddressCity: "Shipping City",
  sAddressState: "Shipping State",
  sAddressZip: "Shipping Zip",
  sAddressAcountry: "Shipping Country",
  make: "Make",
  model: "Model",
  year: "Year",
  pReq: "Part Required",
  desc: "Description",
  warranty: "Warranty",
  warrantyField: "Warranty Units",
  vin: "VIN",
  soldP: "Sale Price",
  costP: "Est. Yard Price",
  shippingFee: "Est. Shipping",
  last4digits: "Last 4 Digits",
};
import API from "../api";

const getStoredFirstName = () => {
  if (typeof window === "undefined") return "";
  const stored = localStorage.getItem("firstName");
  return stored ? stored.trim() : "";
};

const buildInitialFormData = (defaultSalesAgent = "") => ({
  // Order basics
  orderNo: "",
  salesAgent: defaultSalesAgent,
  orderDateDisplay: "",
  orderDateISO: "",
  orderStatus: "Placed",

  // Customer Info
  fName: "",
  lName: "",
  email: "",
  phone: "",
  altPhone: "",

  // Billing Info
  bName: "",
  bAddressStreet: "",
  bAddressCity: "",
  bAddressState: "",
  bAddressZip: "",
  bAddressAcountry: "",
  paymentSource: "",
  authorizationId: "",

  // Shipping Info
  sAttention: "",
  sAddressStreet: "",
  sAddressCity: "",
  sAddressState: "",
  sAddressZip: "",
  sAddressAcountry: "",
  businessName: "",

  // Part Info
  make: "",
  model: "",
  year: "",
  pReq: "",
  desc: "",
  warranty: "",
  warrantyField: "days",
  vin: "",
  partNo: "",

  // Price & GP
  soldP: "",
  chargedAmount: "",
  costP: "",
  shippingFee: "",
  salestax: "",
  grossProfit: "",
  last4digits: "",
  notes: "",

  // Toggles
  expediteShipping: false,
  dsCall: false,
  programmingRequired: false,
  programmingCost: "",
  sameAsBilling: false,
});

function Toast({ toast, onClose }) {
  if (!toast) return null;

  const isError = toast.variant === "error";
  const background = isError ? "bg-red-100 text-red-900" : "bg-white text-black";
  const buttonStyles = isError
    ? "bg-red-500 text-white hover:bg-red-600"
    : "bg-[#04356d] text-white hover:bg-[#021f4b]";

  return (
    <div
      className={`fixed bottom-5 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg border border-gray-300 z-[200] text-sm font-medium flex items-center gap-4 ${background}`}
    >
      <span>{toast.message}</span>
      <button
        onClick={onClose}
        className={`ml-3 px-3 py-1 text-sm font-semibold rounded-md transition ${buttonStyles}`}
      >
        OK
      </button>
    </div>
  );
}

export default function AddOrder() {
  const navigate = useNavigate();
  const [salesAgents, setSalesAgents] = useState([]);
  const [salesAgentsMap, setSalesAgentsMap] = useState({}); // firstName -> fullName mapping
  const [currentBrand, setCurrentBrand] = useState(() => getCurrentBrand());
  
  // Fetch sales agents from database
  const fetchSalesAgents = useCallback(async (brand) => {
    try {
      const { data } = await API.get("/salesAgents");
      // Create mapping: firstName -> fullName
      const map = {};
      const firstNames = [];
      data.forEach((agent) => {
        map[agent.firstName] = agent.fullName;
        firstNames.push(agent.firstName);
      });
      setSalesAgentsMap(map);
      setSalesAgents(firstNames.sort());
    } catch (err) {
      console.error("Error fetching sales agents:", err);
      // Fallback to empty array if API fails
      setSalesAgents([]);
      setSalesAgentsMap({});
    }
  }, []);

  // Get full name from first name for current brand
  const getFullName = useCallback((firstName) => {
    return salesAgentsMap[firstName] || firstName;
  }, [salesAgentsMap]);

  // Update brand when it changes
  useEffect(() => {
    const handleBrandChange = () => {
      setCurrentBrand(getCurrentBrand());
    };
    window.addEventListener("brand-changed", handleBrandChange);
    return () => window.removeEventListener("brand-changed", handleBrandChange);
  }, []);

  // Fetch sales agents when brand changes
  useEffect(() => {
    fetchSalesAgents(currentBrand);
  }, [currentBrand, fetchSalesAgents]);

  // Reset salesAgent when brand changes - map to corresponding agent
  const prevBrandRef = useRef(currentBrand);
  useEffect(() => {
    // Only check when brand actually changes
    if (prevBrandRef.current === currentBrand) return;
    prevBrandRef.current = currentBrand;
    
    if (salesAgents.length === 0) return;
    
    // When brand changes, map the stored firstName to the corresponding agent for the new brand
    const storedFirstName = getStoredFirstName();
    if (storedFirstName) {
      const mappedFirstName = getMappedFirstName(storedFirstName, currentBrand);
      const newDefault = resolveSalesAgentValue(mappedFirstName, salesAgents);
      
      setFormData((prev) => ({
        ...prev,
        salesAgent: newDefault || "",
      }));
    } else {
      // If no stored firstName, check if current salesAgent is valid for new brand
      setFormData((prev) => {
        if (!prev.salesAgent) return prev;
        
        const isValid = salesAgents.some(
          (agent) => agent.toLowerCase() === prev.salesAgent.toLowerCase()
        );
        if (!isValid) {
          return {
            ...prev,
            salesAgent: "",
          };
        }
        return prev;
      });
    }
  }, [currentBrand, salesAgents, resolveSalesAgentValue, getMappedFirstName]);

  const resolveSalesAgentValue = useCallback((value, agents) => {
    if (!value || !agents.length) return "";
    const match = agents.find(
      (agent) => agent.toLowerCase() === value.toLowerCase()
    );
    return match || value;
  }, []);

  // Map 50STARS firstName to PROLANE firstName if brand is PROLANE
  const getMappedFirstName = useCallback((firstName, brand) => {
    if (brand === "PROLANE" && firstName && AGENT_BRAND_MAPPING[firstName]) {
      return AGENT_BRAND_MAPPING[firstName];
    }
    return firstName;
  }, []);

  const defaultSalesAgent = useMemo(() => {
    const storedFirstName = getStoredFirstName();
    if (!storedFirstName) return "";
    
    // Map the firstName based on current brand
    const mappedFirstName = getMappedFirstName(storedFirstName, currentBrand);
    
    // Find matching agent in the current brand's agent list
    return resolveSalesAgentValue(mappedFirstName, salesAgents);
  }, [salesAgents, currentBrand, resolveSalesAgentValue, getMappedFirstName]);
  
  const salesAgentOptions = useMemo(() => {
    if (!defaultSalesAgent) return salesAgents;
    const exists = salesAgents.some(
      (agent) => agent.toLowerCase() === defaultSalesAgent.toLowerCase()
    );
    return exists ? salesAgents : [defaultSalesAgent, ...salesAgents];
  }, [defaultSalesAgent, salesAgents]);
  const [toast, setToast] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState(() =>
    buildInitialFormData("")
  );
  const [partNames, setPartNames] = useState([]);
  const [fieldErrors, setFieldErrors] = useState(new Set());

  // Update salesAgent when defaultSalesAgent becomes available (after salesAgents are fetched)
  useEffect(() => {
    if (defaultSalesAgent && !formData.salesAgent) {
      setFormData((prev) => ({
        ...prev,
        salesAgent: defaultSalesAgent,
      }));
    }
  }, [defaultSalesAgent, formData.salesAgent]);

  // Helper to clear error when field is updated
  const handleFieldChange = (fieldKey, value) => {
    setFormData((prev) => ({ ...prev, [fieldKey]: value }));
    if (fieldErrors.has(fieldKey)) {
      setFieldErrors((prev) => {
        const next = new Set(prev);
        next.delete(fieldKey);
        return next;
      });
    }
  };

  useEffect(() => {
    fetchParts();
  }, []);

  const normalizeWarrantyField = useCallback((quantity, unit) => {
    const base = (unit || "").replace(/s$/i, "");
    if (!quantity || quantity === 0) return `${base}s` || "days";
    return quantity === 1 ? base : `${base}s`;
  }, []);

  async function fetchParts() {
    try {
      const res = await API.get("/parts");
      console.log("Fetched parts:", res.data);
      setPartNames(res.data);
    } catch (err) {
      console.error("Error fetching parts:", err);
    }
  }

  async function handlePartChange(value) {
    if (value === "add_new_part") {
      const newPart = prompt("Enter new part name:");
      if (newPart && newPart.trim() !== "") {
        try {
          await API.post("/parts", { name: newPart.trim() });
          await fetchParts();
          setFormData({ ...formData, pReq: newPart.trim() });
        } catch (err) {
          alert(err.response?.data?.message || "Error adding part");
        }
      }
    } else {
      setFormData({ ...formData, pReq: value });
    }
  }
  const billingZipTimer = useRef(null);
  const shippingZipTimer = useRef(null);

  const fetchZipDetails = useCallback(async (zipRaw) => {
    const trimmed = (zipRaw || "").trim();
    if (!trimmed) return null;

    try {
      const res = await API.get("/utils/zip-lookup", { params: { zip: trimmed } });
      return res.data || null;
    } catch (error) {
      console.debug("ZIP lookup skipped", error);
      return null;
    }
  }, []);

  useEffect(() => {
    const zip = formData.bAddressZip;
    if (billingZipTimer.current) clearTimeout(billingZipTimer.current);
    if (!zip) return;

    billingZipTimer.current = setTimeout(async () => {
      const result = await fetchZipDetails(zip);
      if (result) {
        setFormData((prev) => ({
          ...prev,
          bAddressCity: result.city || prev.bAddressCity,
          bAddressState: result.state || prev.bAddressState,
          bAddressAcountry: result.country || prev.bAddressAcountry,
        }));
      }
    }, 400);

    return () => {
      if (billingZipTimer.current) clearTimeout(billingZipTimer.current);
    };
  }, [formData.bAddressZip, fetchZipDetails]);

  useEffect(() => {
    const zip = formData.sAddressZip;
    if (shippingZipTimer.current) clearTimeout(shippingZipTimer.current);
    if (!zip) return;

    shippingZipTimer.current = setTimeout(async () => {
      const result = await fetchZipDetails(zip);
      if (result) {
        setFormData((prev) => ({
          ...prev,
          sAddressCity: result.city || prev.sAddressCity,
          sAddressState: result.state || prev.sAddressState,
          sAddressAcountry: result.country || prev.sAddressAcountry,
        }));
      }
    }, 400);

    return () => {
      if (shippingZipTimer.current) clearTimeout(shippingZipTimer.current);
    };
  }, [formData.sAddressZip, fetchZipDetails]);
  useEffect(() => {

    // Get Dallas Time
    const now = new Date();
    const dallasFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "long",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const parts = dallasFormatter.formatToParts(now);
    const year = parts.find((p) => p.type === "year").value;
    const monthName = parts.find((p) => p.type === "month").value;
    const day = parts.find((p) => p.type === "day").value;
    const hour = parts.find((p) => p.type === "hour").value;
    const minute = parts.find((p) => p.type === "minute").value;

    const displayDate = `${day} ${monthName}, ${year} ${hour}:${minute}`;

    const tzOffset = getDallasOffset(now);
    const monthNumber = new Date(
      now.toLocaleString("en-US", { timeZone: "America/Chicago" })
    ).getMonth() + 1;
    const isoDallas = `${year}-${pad(monthNumber)}-${pad(
      day
    )}T${hour}:${minute}:00.000${tzOffset}`;

    setFormData((prev) => ({
      ...prev,
      orderDateDisplay: displayDate,
      orderDateISO: isoDallas,
    }));
  }, []);

  //  Helpers functions
  useEffect(() => {
    const quoted = parseFloat(formData.soldP) || 0;
    const yardPrice = parseFloat(formData.costP) || 0;
    const shipping = parseFloat(formData.shippingFee) || 0;

    const salesTax = quoted * 0.05; // always 5%
    const grossProfit = quoted - yardPrice - shipping - salesTax;

    setFormData((prev) => ({
      ...prev,
      salestax: salesTax.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
    }));
  }, [formData.soldP, formData.costP, formData.shippingFee]);
  function pad(num) {
    return String(num).padStart(2, "0");
  }
  function getDallasOffset(date) {
    const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
    const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
    const isDST = Math.max(jan, jul) !== date.getTimezoneOffset();
    const offsetHours = isDST ? -5 : -6;
    return `${offsetHours > 0 ? "-" : "+"}${String(
      Math.abs(offsetHours)
    ).padStart(2, "0")}:00`;
  }

  // SUBMIT HANDLER
  const handleSubmit = async (e) => {
    e.preventDefault();

    setToast(null);
    setFieldErrors(new Set());

    const missingFieldKeys = Object.entries(REQUIRED_FIELD_LABELS)
      .filter(([key]) => {
        const value = formData[key];
        if (typeof value === "boolean") return false;
        return String(value ?? "").trim() === "";
      })
      .map(([key]) => key);

    const missingFields = missingFieldKeys.map((key) => REQUIRED_FIELD_LABELS[key]);

    if (formData.programmingRequired && !String(formData.programmingCost || "").trim()) {
      missingFields.push("Programming Cost");
      missingFieldKeys.push("programmingCost");
    }

    if (missingFields.length) {
      setFieldErrors(new Set(missingFieldKeys));
      setToast({
        message: `Please fill all required fields: ${missingFields.join(", ")}.`,
        variant: "error",
      });
      return;
    }

    if (!/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/.test((formData.email || "").trim())) {
      setToast({ message: "Enter a valid email address.", variant: "error" });
      return;
    }

    if (!/^\d{10}$/.test((formData.phone || "").replace(/\D/g, ""))) {
      setToast({ message: "Enter a 10-digit phone number.", variant: "error" });
      return;
    }

    try {
      setSubmitting(true);
      const firstName = localStorage.getItem("firstName") || "";

      const warrantyQty = parseInt(formData.warranty, 10) || 0;
      const warrantyUnit = normalizeWarrantyField(
        warrantyQty,
        formData.warrantyField
      );

      // Determine orderStatus based on chargedAmount vs soldP
      const soldPNum = parseFloat(formData.soldP) || 0;
      const chargedNum = parseFloat(formData.chargedAmount) || soldPNum;
      const orderStatus = chargedNum === soldPNum ? "Placed" : "Partially charged order";

      // Get full name for sales agent based on current brand
      const salesAgentFullName = getFullName(formData.salesAgent);

      const payload = {
        ...formData,
        bName: formData.businessName || formData.bName,
        warranty: warrantyQty,
        warrantyField: warrantyUnit,
        customerName: `${formData.fName} ${formData.lName}`.trim(),
        programmingCostQuoted: formData.programmingRequired
          ? formData.programmingCost
          : "",
        chargedAmount: chargedNum,
        orderStatus: orderStatus,
        attention: formData.sAttention || formData.attention || "", // Map sAttention to attention
        salesAgent: salesAgentFullName, // Save full name to database
      };
      // Remove sAttention from payload since we've mapped it to attention
      delete payload.sAttention;

      const res = await API.post(
        `/orders/orders?firstName=${encodeURIComponent(firstName)}`,
        payload
      );

      const createdOrderNo = res?.data?.orderNo || payload.orderNo || "";
      setToast({ message: `Order ${createdOrderNo} created successfully!`, variant: "success" });
      setFormData(buildInitialFormData(defaultSalesAgent));
      navigate("/monthly-orders");
    } catch (err) {
      if (err.response && err.response.status === 409) {
        setToast({
          message: "Order No already exists! Please enter a unique Order No.",
          variant: "error",
        });
      } else {
        console.error(err);
        const message = err?.response?.data?.message || "Error saving order";
        setToast({ message, variant: "error" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-screen flex flex-col p-6">
      <h1 className="text-3xl font-bold text-white mb-4">Add New Order</h1>

      <form className="flex-1 overflow-y-auto overflow-x-auto" onSubmit={handleSubmit}>
        <div className="min-w-[1100px] md:min-w-0 md:w-full">
          {/* 🔹 Order Header */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <Section title="Order No">
              <Input
                placeholder="Enter Order No"
                value={formData.orderNo}
                onChange={(e) => handleFieldChange("orderNo", e.target.value)}
                error={fieldErrors.has("orderNo")}
              />
            </Section>

            <Section title="Sales Agent">
              <Dropdown
                placeholder="Select Sales Agent"
                options={salesAgentOptions}
                value={formData.salesAgent}
                onChange={(e) => handleFieldChange("salesAgent", e.target.value)}
                error={fieldErrors.has("salesAgent")}
              />
            </Section>

            <Section title="Order Date">
              <Input placeholder="Order Date" value={formData.orderDateDisplay} disabled />
              <input type="hidden" value={formData.orderDateISO} />
            </Section>
          </div>

          {/* Main Sections */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-6 mb-6">

            {/* 🟦 Customer Info */}
            <Section title="Customer Info">
              <Input 
                placeholder="First Name" 
                value={formData.fName}
                onChange={(e) => handleFieldChange("fName", e.target.value)}
                error={fieldErrors.has("fName")}
              />
              <Input 
                placeholder="Last Name" 
                value={formData.lName}
                onChange={(e) => handleFieldChange("lName", e.target.value)}
                error={fieldErrors.has("lName")}
              />
              <Input 
                placeholder="Email" 
                type="email" 
                value={formData.email}
                onChange={(e) => handleFieldChange("email", e.target.value)}
                error={fieldErrors.has("email")}
              />
              <Input 
                placeholder="Phone" 
                value={formData.phone}
                onChange={(e) => handleFieldChange("phone", e.target.value)}
                error={fieldErrors.has("phone")}
              />
              <Input placeholder="Alt Phone" value={formData.altPhone}
                onChange={(e) => setFormData({ ...formData, altPhone: e.target.value })} />
            </Section>

            {/* 🟧 Billing Info */}
            <Section title="Billing Info">
              <Input 
                placeholder="Billing Name" 
                value={formData.bName}
                onChange={(e) => handleFieldChange("bName", e.target.value)}
                error={fieldErrors.has("bName")}
              />
              <Input 
                placeholder="Address" 
                value={formData.bAddressStreet}
                onChange={(e) => handleFieldChange("bAddressStreet", e.target.value)}
                error={fieldErrors.has("bAddressStreet")}
              />
              <Input 
                placeholder="City" 
                value={formData.bAddressCity}
                onChange={(e) => handleFieldChange("bAddressCity", e.target.value)}
                error={fieldErrors.has("bAddressCity")}
              />

              {/* ✅ State Dropdown */}
              <select
                className={`w-full p-2 border rounded-md bg-white/20 text-white focus:outline-none focus:ring-2 ${
                  fieldErrors.has("bAddressState")
                    ? "border-red-500 focus:ring-red-400"
                    : "border-gray-300 focus:ring-blue-400"
                }`}
                value={formData.bAddressState}
                onChange={(e) => handleFieldChange("bAddressState", e.target.value)}
              >
                <option value="">Select State/Province</option>
                {STATES.map((s) => (
                  <option key={s.code} value={s.code} className="text-black">
                    {s.name}
                  </option>
                ))}
              </select>

              <Dropdown
                placeholder="Country"
                options={["US", "Canada"]}
                value={formData.bAddressAcountry}
                onChange={(e) => handleFieldChange("bAddressAcountry", e.target.value)}
                error={fieldErrors.has("bAddressAcountry")}
              />

              <Input 
                placeholder="Zip" 
                value={formData.bAddressZip}
                onChange={(e) => handleFieldChange("bAddressZip", e.target.value)}
                error={fieldErrors.has("bAddressZip")}
              />
              <Dropdown
                placeholder="Payment Source"
                options={[
                  "Affirm",
                  "Bank/Wire Transfer",
                 " Both (VPS & SA Authorized)",
                 " Both (VPS & SA Payment)",
                  "Paypal",
                  "RP Authorize",
                  "RP Payment",
                  "SA Authorized",
                  "SA Payment Link",
                  "VPS Authorized",
                  "VPS Payment Link",
                  "Zelle",
                ]}
                value={formData.paymentSource}
                onChange={(e) => handleFieldChange("paymentSource", e.target.value)}
                error={fieldErrors.has("paymentSource")}
              />
              <Input
                placeholder="Authorization ID"
                value={formData.authorizationId}
                onChange={(e) => handleFieldChange("authorizationId", e.target.value)}
                error={fieldErrors.has("authorizationId")}
              />
            </Section>

            {/* Shipping Info */}
            <Section title="Shipping Info">
              <Checkbox
                label="Same as Billing"
                checked={formData.sameAsBilling}
                onChange={(e) => {
                  const isChecked = e.target.checked;
                  setFormData((prev) => ({
                    ...prev,
                    sameAsBilling: isChecked,
                    ...(isChecked
                      ? {
                        sAttention: prev.bName,
                        sAddressStreet: prev.bAddressStreet,
                        sAddressCity: prev.bAddressCity,
                        sAddressState: prev.bAddressState,
                        sAddressZip: prev.bAddressZip,
                        sAddressAcountry: prev.bAddressAcountry,
                      }
                      : {
                        sAttention: "",
                        sAddressStreet: "",
                        sAddressCity: "",
                        sAddressState: "",
                        sAddressZip: "",
                        sAddressAcountry: "",
                      }),
                  }));
                }}
              />
              <Input 
                placeholder="Business Name" 
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
              />
              <Input 
                placeholder="Attention" 
                value={formData.sAttention}
                onChange={(e) => handleFieldChange("sAttention", e.target.value)}
                error={fieldErrors.has("sAttention")}
              />
              <Input 
                placeholder="Address" 
                value={formData.sAddressStreet}
                onChange={(e) => handleFieldChange("sAddressStreet", e.target.value)}
                error={fieldErrors.has("sAddressStreet")}
              />
              <Input 
                placeholder="City" 
                value={formData.sAddressCity}
                onChange={(e) => handleFieldChange("sAddressCity", e.target.value)}
                error={fieldErrors.has("sAddressCity")}
              />
              <select
                className={`w-full p-2 border rounded-md bg-white/20 text-white focus:outline-none focus:ring-2 ${
                  fieldErrors.has("sAddressState")
                    ? "border-red-500 focus:ring-red-400"
                    : "border-gray-300 focus:ring-blue-400"
                }`}
                value={formData.sAddressState}
                onChange={(e) => handleFieldChange("sAddressState", e.target.value)}
              >
                <option value="">Select State/Province</option>
                {STATES.map((s) => (
                  <option key={s.code} value={s.code} className="text-black">
                    {s.name}
                  </option>
                ))}
              </select>
              <Dropdown
                placeholder="Country"
                options={["US", "Canada"]}
                value={formData.sAddressAcountry}
                onChange={(e) => handleFieldChange("sAddressAcountry", e.target.value)}
                error={fieldErrors.has("sAddressAcountry")}
              />
              <Input 
                placeholder="Zip" 
                value={formData.sAddressZip}
                onChange={(e) => handleFieldChange("sAddressZip", e.target.value)}
                error={fieldErrors.has("sAddressZip")}
              />
            </Section>

            {/* Part Info */}
            <Section title="Part Info">
              <Input 
                placeholder="Year" 
                value={formData.year}
                onChange={(e) => handleFieldChange("year", e.target.value)}
                error={fieldErrors.has("year")}
              />
              <Input 
                placeholder="Make" 
                value={formData.make}
                onChange={(e) => handleFieldChange("make", e.target.value)}
                error={fieldErrors.has("make")}
              />
              <Input 
                placeholder="Model" 
                value={formData.model}
                onChange={(e) => handleFieldChange("model", e.target.value)}
                error={fieldErrors.has("model")}
              />
              <select
                className={`w-full p-2 border rounded-md bg-white/20 text-white focus:outline-none focus:ring-2 ${
                  fieldErrors.has("pReq")
                    ? "border-red-500 focus:ring-red-400"
                    : "border-gray-300 focus:ring-blue-400"
                }`}
                value={formData.pReq}
                onChange={(e) => {
                  handlePartChange(e.target.value);
                  if (fieldErrors.has("pReq")) {
                    setFieldErrors((prev) => {
                      const next = new Set(prev);
                      next.delete("pReq");
                      return next;
                    });
                  }
                }}
              >
                <option value="">Select Part Required</option>
                {partNames.map((p) => (
                  <option key={p._id} value={p.name} className="text-black">
                    {p.name}
                  </option>
                ))}
                <option value="add_new_part" className="text-blue-600 font-semibold">
                  Add New Part
                </option>
              </select>
              <Input 
                placeholder="Description" 
                value={formData.desc}
                onChange={(e) => handleFieldChange("desc", e.target.value)}
                error={fieldErrors.has("desc")}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Warranty"
                  type="number"
                  value={formData.warranty}
                  onChange={(e) => handleFieldChange("warranty", e.target.value)}
                  error={fieldErrors.has("warranty")}
                />
                <select
                  className={`w-full p-2 border rounded-md bg-white/20 text-white focus:outline-none focus:ring-2 ${
                    fieldErrors.has("warrantyField")
                      ? "border-red-500 focus:ring-red-400"
                      : "border-gray-300 focus:ring-blue-400"
                  }`}
                  value={formData.warrantyField}
                  onChange={(e) => handleFieldChange("warrantyField", e.target.value)}
                >
                  <option value="days" className="text-black">
                    {Number(formData.warranty) === 1 ? "Day" : "Day(s)"}
                  </option>
                  <option value="months" className="text-black">
                    {Number(formData.warranty) === 1 ? "Month" : "Month(s)"}
                  </option>
                  <option value="years" className="text-black">
                    {Number(formData.warranty) === 1 ? "Year" : "Year(s)"}
                  </option>
                </select>
              </div>
              <Input 
                placeholder="VIN" 
                value={formData.vin}
                onChange={(e) => handleFieldChange("vin", e.target.value)}
                error={fieldErrors.has("vin")}
              />
              <Input placeholder="Part No" value={formData.partNo}
                onChange={(e) => setFormData({ ...formData, partNo: e.target.value })} />
            </Section>

            {/* Price & GP */}
            <Section title="Price & GP">
              <Input
                placeholder="Sale Price"
                prefix="$"
                value={formData.soldP}
                onChange={(e) => {
                  const value = e.target.value;
                  handleFieldChange("soldP", value);
                  // Auto-fill chargedAmount with soldP value if chargedAmount is empty or matches previous soldP
                  if (!formData.chargedAmount || formData.chargedAmount === formData.soldP) {
                    setFormData((prev) => ({ ...prev, chargedAmount: value }));
                  }
                }}
                error={fieldErrors.has("soldP")}
              />
              <Input
                placeholder="Charged Price"
                prefix="$"
                value={formData.chargedAmount}
                onChange={(e) => handleFieldChange("chargedAmount", e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Est. Price"
                  prefix="$"
                  value={formData.costP}
                  onChange={(e) => handleFieldChange("costP", e.target.value)}
                  error={fieldErrors.has("costP")}
                />
                <Input
                  placeholder="Est. Shipping"
                  prefix="$"
                  value={formData.shippingFee}
                  onChange={(e) => handleFieldChange("shippingFee", e.target.value)}
                  error={fieldErrors.has("shippingFee")}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Sales Tax" prefix="%" value="5" disabled />
                <Input placeholder="Estimated GP" prefix="$" value={formData.grossProfit}
                  onChange={(e) => setFormData({ ...formData, grossProfit: e.target.value })} />
              </div>
              <Input 
                placeholder="Last 4 Digits" 
                value={formData.last4digits}
                onChange={(e) => handleFieldChange("last4digits", e.target.value)}
                error={fieldErrors.has("last4digits")}
              />
              <Input 
                placeholder="Order Notes" 
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />

              <Checkbox
                label="Expedite Shipping"
                checked={formData.expediteShipping}
                onChange={(e) => setFormData({ ...formData, expediteShipping: e.target.checked })}
              />
              <Checkbox
                label="DS Call"
                checked={formData.dsCall}
                onChange={(e) => setFormData({ ...formData, dsCall: e.target.checked })}
              />
              <Checkbox
                label="Programming Required"
                checked={formData.programmingRequired}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    programmingRequired: e.target.checked,
                    programmingCost: e.target.checked ? "70" : "",
                  })
                }
              />
              {formData.programmingRequired && (
                <Input 
                  placeholder="Programming Cost" 
                  prefix="$"
                  value={formData.programmingCost}
                  onChange={(e) => {
                    handleFieldChange("programmingCost", e.target.value);
                  }}
                  error={fieldErrors.has("programmingCost")}
                />
              )}
            </Section>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex mt-6">
          <button
            type="submit"
            disabled={submitting}
            className={`px-6 py-3 bg-gradient-to-r from-[#504fad] to-[#5a80c7] text-white font-semibold rounded-xl shadow-lg transition ${
              submitting ? "opacity-70 cursor-not-allowed" : "hover:scale-105"
            }`}
          >
            {submitting ? "Saving..." : "Add / Edit Order"}
          </button>
        </div>
      </form>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

/* COMPONENTS */
function Section({ title, children }) {
  return (
    <div className="bg-white/30 dark:bg-white/5 text-white p-4 rounded-2xl shadow-md backdrop-blur-sm flex flex-col gap-2">
      <h3 className="text-md font-semibold mb-1">{title}</h3>
      {children}
    </div>
  );
}

function Input({ placeholder, type = "text", prefix, value, onChange, disabled, error = false }) {
  return (
    <div className="flex">
      {prefix && (
        <span className={`px-2 flex items-center bg-gray-200 text-gray-800 rounded-l-md border ${
          error ? "border-red-500" : "border-gray-300"
        }`}>
          {prefix}
        </span>
      )}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`w-full p-2 border bg-white/20 text-white placeholder-gray-300 rounded-md focus:outline-none focus:ring-2 ${
          prefix ? "rounded-l-none" : ""
        } ${
          error
            ? "border-red-500 focus:ring-red-400"
            : "border-gray-300 focus:ring-blue-400"
        } ${
          disabled ? "opacity-60 cursor-not-allowed" : ""
        }`}
      />
    </div>
  );
}

function Dropdown({ placeholder, options, value, onChange, error = false }) {
  return (
    <select
      className={`w-full p-2 border bg-white/20 text-white rounded-md focus:outline-none focus:ring-2 ${
        error
          ? "border-red-500 focus:ring-red-400"
          : "border-gray-300 focus:ring-blue-400"
      }`}
      value={value}
      onChange={onChange}
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt} value={opt} className="text-black">
          {opt}
        </option>
      ))}
    </select>
  );
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center space-x-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="w-4 h-4 accent-blue-500"
      />
      <span>{label}</span>
    </label>
  );
}
