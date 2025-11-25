import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { STATES } from "../data/states";
import { selectRole } from "../store/authSlice";
const SALES_AGENTS = ["David", "Dipshika", "John", "Mark", "Michael", "Richard", "Tristan"];
const REQUIRED_FIELD_LABELS = {
  orderNo: "Order No",
  salesAgent: "Sales Agent",
  fName: "First Name",
  lName: "Last Name",
  email: "Email",
  phone: "Phone",
  bName: "Billing Name",
  bAddressStreet: "Billing Street",
  bAddressCity: "Billing City",
  bAddressState: "Billing State",
  bAddressZip: "Billing Zip",
  bAddressAcountry: "Billing Country",
  attention: "Shipping Attention",
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

const buildInitialFormData = () => ({
  // Order basics
  orderNo: "",
  salesAgent: "",
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
  businessName: "",

  // Shipping Info
  attention: "",
  sAddressStreet: "",
  sAddressCity: "",
  sAddressState: "",
  sAddressZip: "",
  sAddressAcountry: "",

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

export default function EditOrder() {
  const navigate = useNavigate();
  const userRole = useSelector(selectRole);
  const [orderNoInput, setOrderNoInput] = useState("");
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [toast, setToast] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState(buildInitialFormData());
  const [partNames, setPartNames] = useState([]);
  const [fieldErrors, setFieldErrors] = useState(new Set());

  // Get role with fallback to localStorage (like Sidebar does)
  const role = userRole ?? (() => {
    try {
      const raw = localStorage.getItem("auth");
      if (raw) return JSON.parse(raw)?.user?.role || undefined;
    } catch {}
    return localStorage.getItem("role") || undefined;
  })();

  // Check if user is Admin (only after role is loaded)
  useEffect(() => {
    // Wait for role to be available before checking
    if (role === undefined) return;
    
    if (role !== "Admin") {
      setToast({
        message: "Access denied. Admin access required.",
        variant: "error",
      });
      setTimeout(() => navigate("/dashboard"), 2000);
    }
  }, [role, navigate]);

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

  // Helper functions for date formatting
  const pad = (num) => String(num).padStart(2, "0");
  const getDallasOffset = (date) => {
    const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
    const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
    const isDST = Math.max(jan, jul) !== date.getTimezoneOffset();
    const offsetHours = isDST ? -5 : -6;
    return `${offsetHours > 0 ? "-" : "+"}${String(
      Math.abs(offsetHours)
    ).padStart(2, "0")}:00`;
  };

  const formatOrderDate = (orderDate) => {
    if (!orderDate) return { display: "", iso: "" };
    
    // Handle both Date objects and ISO strings
    const date = orderDate instanceof Date ? orderDate : new Date(orderDate);
    if (isNaN(date.getTime())) return { display: "", iso: "" };

    // Format for display (Dallas timezone)
    const dallasFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "long",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const parts = dallasFormatter.formatToParts(date);
    const year = parts.find((p) => p.type === "year").value;
    const monthName = parts.find((p) => p.type === "month").value;
    const day = parts.find((p) => p.type === "day").value;
    const hour = parts.find((p) => p.type === "hour").value;
    const minute = parts.find((p) => p.type === "minute").value;

    const displayDate = `${day} ${monthName}, ${year} ${hour}:${minute}`;

    // Format ISO string (Dallas timezone)
    const tzOffset = getDallasOffset(date);
    const monthNumber = new Date(
      date.toLocaleString("en-US", { timeZone: "America/Chicago" })
    ).getMonth() + 1;
    const isoDallas = `${year}-${pad(monthNumber)}-${pad(day)}T${hour}:${minute}:00.000${tzOffset}`;

    return { display: displayDate, iso: isoDallas };
  };

  // Fetch order when order number is entered
  const handleLoadOrder = async () => {
    if (!orderNoInput.trim()) {
      setToast({ message: "Please enter an order number.", variant: "error" });
      return;
    }

    setLoadingOrder(true);
    setToast(null);
    try {
      const res = await API.get(`/orders/${encodeURIComponent(orderNoInput.trim())}`);
      const order = res.data;

      // Format order date if it exists
      const dateFormatted = formatOrderDate(order.orderDate);

      // Map order data to form data
      setFormData({
        orderNo: order.orderNo || "",
        salesAgent: order.salesAgent || "",
        orderDateDisplay: order.orderDateDisplay || dateFormatted.display,
        orderDateISO: order.orderDateISO || dateFormatted.iso,
        orderStatus: order.orderStatus || "Placed",

        // Customer Info
        fName: order.fName || "",
        lName: order.lName || "",
        email: order.email || "",
        phone: order.phone || "",
        altPhone: order.altPhone || "",

        // Billing Info
        bName: order.bName || "",
        businessName: order.businessName || "",
        bAddressStreet: order.bAddressStreet || "",
        bAddressCity: order.bAddressCity || "",
        bAddressState: order.bAddressState || "",
        bAddressZip: order.bAddressZip || "",
        bAddressAcountry: order.bAddressAcountry || "",

        // Shipping Info
        attention: order.attention || order.sAttention || "",
        sAddressStreet: order.sAddressStreet || "",
        sAddressCity: order.sAddressCity || "",
        sAddressState: order.sAddressState || "",
        sAddressZip: order.sAddressZip || "",
        sAddressAcountry: order.sAddressAcountry || "",
        sameAsBilling: false,

        // Part Info
        make: order.make || "",
        model: order.model || "",
        year: order.year || "",
        pReq: order.pReq || "",
        desc: order.desc || "",
        warranty: order.warranty || "",
        warrantyField: order.warrantyField || "days",
        vin: order.vin || "",
        partNo: order.partNo || "",

        // Price & GP
        soldP: order.soldP || "",
        costP: order.costP || "",
        shippingFee: order.shippingFee || "",
        salestax: order.salestax || "",
        grossProfit: order.grossProfit || "",
        last4digits: order.last4digits || "",
        notes: Array.isArray(order.notes) ? order.notes.join("\n") : (order.notes || ""),

        // Toggles
        expediteShipping: order.expediteShipping === true || order.expediteShipping === "true",
        dsCall: order.dsCall === true || order.dsCall === "true",
        programmingRequired: order.programmingRequired === true || order.programmingRequired === "true",
        programmingCost: order.programmingCostQuoted || order.programmingCost || "",
      });

      setToast({ message: `Order ${order.orderNo} loaded successfully!`, variant: "success" });
    } catch (err) {
      console.error("Error loading order:", err);
      const message = err?.response?.data?.message || "Order not found";
      setToast({ message, variant: "error" });
    } finally {
      setLoadingOrder(false);
    }
  };

  // Calculate GP
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

  // SUBMIT HANDLER
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.orderNo) {
      setToast({ message: "Please load an order first.", variant: "error" });
      return;
    }

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

      // Build payload, ensuring attention is used instead of sAttention
      const { sAttention, ...formDataWithoutSAttention } = formData;
      
      // Convert notes string to array if needed (backend expects array)
      const notesArray = formData.notes 
        ? (Array.isArray(formData.notes) 
            ? formData.notes 
            : String(formData.notes).split('\n').filter(n => n.trim()))
        : [];
      
      const payload = {
        ...formDataWithoutSAttention,
        bName: formData.businessName || formData.bName,
        warranty: warrantyQty,
        warrantyField: warrantyUnit,
        customerName: `${formData.fName} ${formData.lName}`.trim(),
        programmingCostQuoted: formData.programmingRequired
          ? formData.programmingCost
          : "",
        notes: notesArray,
        // Convert boolean toggles to strings (backend expects strings)
        expediteShipping: formData.expediteShipping ? "true" : "false",
        dsCall: formData.dsCall ? "true" : "false",
        programmingRequired: formData.programmingRequired ? "true" : "false",
      };

      await API.put(`/orders/${encodeURIComponent(formData.orderNo)}`, payload);

      setToast({ message: `Order ${formData.orderNo} updated successfully!`, variant: "success" });
    } catch (err) {
      console.error(err);
      const message = err?.response?.data?.message || "Error updating order";
      setToast({ message, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  // Show loading state while role is being determined
  if (role === undefined) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (role !== "Admin") {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-white text-xl">Access denied. Admin access required.</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col p-6">
      <h1 className="text-3xl font-bold text-white mb-4">Edit Order (Admin Only)</h1>

      {/* Order Number Input */}
      <div className="mb-6 flex gap-4 items-end">
        <div className="flex-1 max-w-md">
          <label className="block text-white mb-2">Enter Order Number</label>
          <input
            type="text"
            placeholder="Enter Order No"
            value={orderNoInput}
            onChange={(e) => setOrderNoInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleLoadOrder();
              }
            }}
            className="w-full p-2 border bg-white/20 text-white placeholder-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 border-gray-300"
          />
        </div>
        <button
          type="button"
          onClick={handleLoadOrder}
          disabled={loadingOrder || !orderNoInput.trim()}
          className={`px-6 py-2 bg-gradient-to-r from-[#504fad] to-[#5a80c7] text-white font-semibold rounded-xl shadow-lg transition ${
            loadingOrder || !orderNoInput.trim()
              ? "opacity-70 cursor-not-allowed"
              : "hover:scale-105"
          }`}
        >
          {loadingOrder ? "Loading..." : "Load Order"}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            handleSubmit(e);
          }}
          disabled={submitting || !formData.orderNo}
          className={`px-6 py-2 bg-gradient-to-r from-[#504fad] to-[#5a80c7] text-white font-semibold rounded-xl shadow-lg transition ${
            submitting || !formData.orderNo
              ? "opacity-70 cursor-not-allowed"
              : "hover:scale-105"
          }`}
        >
          {submitting ? "Updating..." : "Update Order"}
        </button>
      </div>

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
                disabled
              />
            </Section>

            <Section title="Sales Agent">
              <Dropdown
                placeholder="Select Sales Agent"
                options={SALES_AGENTS}
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
              <Input
                placeholder="Alt Phone"
                value={formData.altPhone}
                onChange={(e) => setFormData({ ...formData, altPhone: e.target.value })}
              />
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
                placeholder="Business Name"
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
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
                          attention: prev.bName,
                          sAddressStreet: prev.bAddressStreet,
                          sAddressCity: prev.bAddressCity,
                          sAddressState: prev.bAddressState,
                          sAddressZip: prev.bAddressZip,
                          sAddressAcountry: prev.bAddressAcountry,
                        }
                      : {
                          attention: "",
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
                placeholder="Attention"
                value={formData.attention}
                onChange={(e) => handleFieldChange("attention", e.target.value)}
                error={fieldErrors.has("attention")}
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
              <Input
                placeholder="Part No"
                value={formData.partNo}
                onChange={(e) => setFormData({ ...formData, partNo: e.target.value })}
              />
            </Section>

            {/* Price & GP */}
            <Section title="Price & GP">
              <Input
                placeholder="Sale Price"
                prefix="$"
                value={formData.soldP}
                onChange={(e) => handleFieldChange("soldP", e.target.value)}
                error={fieldErrors.has("soldP")}
              />
              <Input
                placeholder="Est. Yard Price"
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
              <Input placeholder="Sales Tax" prefix="%" value="5" disabled />
              <Input
                placeholder="Estimated GP"
                prefix="$"
                value={formData.grossProfit}
                onChange={(e) => setFormData({ ...formData, grossProfit: e.target.value })}
              />
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
            disabled={submitting || !formData.orderNo}
            className={`px-6 py-3 bg-gradient-to-r from-[#504fad] to-[#5a80c7] text-white font-semibold rounded-xl shadow-lg transition ${
              submitting || !formData.orderNo
                ? "opacity-70 cursor-not-allowed"
                : "hover:scale-105"
            }`}
          >
            {submitting ? "Saving..." : "Update Order"}
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
        <span
          className={`px-2 flex items-center bg-gray-200 text-gray-800 rounded-l-md border ${
            error ? "border-red-500" : "border-gray-300"
          }`}
        >
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

