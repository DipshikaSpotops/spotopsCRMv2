import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { STATES } from "../data/states";
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
  sAttention: "Shipping Attention",
  sAddressStreet: "Shipping Street",
  sAddressCity: "Shipping City",
  sAddressState: "Shipping State",
  sAddressZip: "Shipping Zip",
  sAddressAcountry: "Shipping Country",
  make: "Make",
  model: "Model",
  year: "Year",
  pReq: "Part Required",
  warranty: "Warranty",
  warrantyField: "Warranty Units",
  vin: "VIN",
  soldP: "Sale Price",
  costP: "Est. Yard Price",
  shippingFee: "Est. Shipping",
  last4digits: "Last 4 Digits",
  notes: "Order Notes",
};
import API from "../api";

const getStoredFirstName = () => {
  if (typeof window === "undefined") return "";
  const stored = localStorage.getItem("firstName");
  return stored ? stored.trim() : "";
};

const resolveSalesAgentValue = (value) => {
  if (!value) return "";
  const match = SALES_AGENTS.find(
    (agent) => agent.toLowerCase() === value.toLowerCase()
  );
  return match || value;
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
  const defaultSalesAgent = useMemo(
    () => resolveSalesAgentValue(getStoredFirstName()),
    []
  );
  const salesAgentOptions = useMemo(() => {
    if (!defaultSalesAgent) return SALES_AGENTS;
    const exists = SALES_AGENTS.some(
      (agent) => agent.toLowerCase() === defaultSalesAgent.toLowerCase()
    );
    return exists ? SALES_AGENTS : [defaultSalesAgent, ...SALES_AGENTS];
  }, [defaultSalesAgent]);
  const [toast, setToast] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState(() =>
    buildInitialFormData(defaultSalesAgent)
  );
  const [partNames, setPartNames] = useState([]);

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

    let missingFields = Object.entries(REQUIRED_FIELD_LABELS)
      .filter(([key]) => {
        const value = formData[key];
        if (typeof value === "boolean") return false;
        return String(value ?? "").trim() === "";
      })
      .map(([, label]) => label);

    if (formData.programmingRequired && !String(formData.programmingCost || "").trim()) {
      missingFields = [...missingFields, "Programming Cost"];
    }

    if (missingFields.length) {
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

      const payload = {
        ...formData,
        warranty: warrantyQty,
        warrantyField: warrantyUnit,
        customerName: `${formData.fName} ${formData.lName}`.trim(),
        programmingCostQuoted: formData.programmingRequired
          ? formData.programmingCost
          : "",
      };

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
                onChange={(e) =>
                  setFormData({ ...formData, orderNo: e.target.value })
                }
              />
            </Section>

            <Section title="Sales Agent">
              <Dropdown
                placeholder="Select Sales Agent"
                options={salesAgentOptions}
                value={formData.salesAgent}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, salesAgent: e.target.value }))
                }
              />
            </Section>

            <Section title="Order Date">
              <Input placeholder="Order Date" value={formData.orderDateDisplay} disabled />
              <input type="hidden" value={formData.orderDateISO} />
            </Section>
          </div>

          {/* Main Sections */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">

            {/* 🟦 Customer Info */}
            <Section title="Customer Info">
              <Input placeholder="First Name" value={formData.fName}
                onChange={(e) => setFormData({ ...formData, fName: e.target.value })} />
              <Input placeholder="Last Name" value={formData.lName}
                onChange={(e) => setFormData({ ...formData, lName: e.target.value })} />
              <Input placeholder="Email" type="email" value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              <Input placeholder="Phone" value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              <Input placeholder="Alt Phone" value={formData.altPhone}
                onChange={(e) => setFormData({ ...formData, altPhone: e.target.value })} />
            </Section>

            {/* 🟧 Billing Info */}
            <Section title="Billing Info">
              <Input placeholder="Billing Name" value={formData.bName}
                onChange={(e) => setFormData({ ...formData, bName: e.target.value })} />
              <Input placeholder="Address" value={formData.bAddressStreet}
                onChange={(e) => setFormData({ ...formData, bAddressStreet: e.target.value })} />
              <Input placeholder="City" value={formData.bAddressCity}
                onChange={(e) => setFormData({ ...formData, bAddressCity: e.target.value })} />

              {/* ✅ State Dropdown */}
              <select
                className="w-full p-2 border border-gray-300 bg-white/20 text-white rounded-md"
                value={formData.bAddressState}
                onChange={(e) => setFormData({ ...formData, bAddressState: e.target.value })}
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
                onChange={(e) => setFormData({ ...formData, bAddressAcountry: e.target.value })}
              />

              <Input placeholder="Zip" value={formData.bAddressZip}
                onChange={(e) => {
                  setFormData({ ...formData, bAddressZip: e.target.value });
                }} />
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

              <Input placeholder="Attention" value={formData.sAttention}
                onChange={(e) => setFormData({ ...formData, sAttention: e.target.value })} />
              <Input placeholder="Address" value={formData.sAddressStreet}
                onChange={(e) => setFormData({ ...formData, sAddressStreet: e.target.value })} />
              <Input placeholder="City" value={formData.sAddressCity}
                onChange={(e) => setFormData({ ...formData, sAddressCity: e.target.value })} />
              <select
                className="w-full p-2 border border-gray-300 bg-white/20 text-white rounded-md"
                value={formData.sAddressState}
                onChange={(e) => setFormData({ ...formData, sAddressState: e.target.value })}
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
                onChange={(e) => setFormData({ ...formData, sAddressAcountry: e.target.value })}
              />
              <Input placeholder="Zip" value={formData.sAddressZip}
                onChange={(e) => {
                  setFormData({ ...formData, sAddressZip: e.target.value });
                }} />
            </Section>

            {/* Part Info */}
            <Section title="Part Info">
              <Input placeholder="Year" value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: e.target.value })} />
              <Input placeholder="Make" value={formData.make}
                onChange={(e) => setFormData({ ...formData, make: e.target.value })} />
              <Input placeholder="Model" value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })} />
              <select
                className="w-full p-2 border border-gray-300 bg-white/20 text-white rounded-md"
                value={formData.pReq}
                onChange={(e) => handlePartChange(e.target.value)}
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
              <Input placeholder="Description" value={formData.desc}
                onChange={(e) => setFormData({ ...formData, desc: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Warranty"
                  type="number"
                  value={formData.warranty}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData((prev) => ({ ...prev, warranty: value }));
                  }}
                />
                <select
                  className="w-full p-2 border border-gray-300 bg-white/20 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={formData.warrantyField}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, warrantyField: e.target.value }))
                  }
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
              <Input placeholder="VIN" value={formData.vin}
                onChange={(e) => setFormData({ ...formData, vin: e.target.value })} />
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
                  const val = e.target.value;
                  setFormData({ ...formData, soldP: val });
                }}
              />
              <Input
                placeholder="Est. Yard Price"
                prefix="$"
                value={formData.costP}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ ...formData, costP: val });
                }}
              />
              <Input
                placeholder="Est. Shipping"
                prefix="$"
                value={formData.shippingFee}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ ...formData, shippingFee: val });
                }}
              />
              <Input placeholder="Sales Tax" prefix="%" value="5" disabled />
              <Input placeholder="Estimated GP" prefix="$" value={formData.grossProfit}
                onChange={(e) => setFormData({ ...formData, grossProfit: e.target.value })} />
              <Input placeholder="Last 4 Digits" value={formData.last4digits}
                onChange={(e) => setFormData({ ...formData, last4digits: e.target.value })} />
              <Input placeholder="Order Notes" value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />

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
                <Input placeholder="Programming Cost" prefix="$"
                  value={formData.programmingCost}
                  onChange={(e) => setFormData({ ...formData, programmingCost: e.target.value })} />
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

function Input({ placeholder, type = "text", prefix, value, onChange, disabled }) {
  return (
    <div className="flex">
      {prefix && (
        <span className="px-2 flex items-center bg-gray-200 text-gray-800 rounded-l-md border border-gray-300">
          {prefix}
        </span>
      )}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`w-full p-2 border border-gray-300 bg-white/20 text-white placeholder-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 ${prefix ? "rounded-l-none" : ""
          } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
      />
    </div>
  );
}

function Dropdown({ placeholder, options, value, onChange }) {
  return (
    <select
      className="w-full p-2 border border-gray-300 bg-white/20 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
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
