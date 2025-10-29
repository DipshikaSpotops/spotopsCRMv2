import { useState, useEffect } from "react";
import axios from "axios";
import { STATES } from "../data/states";
const SALES_AGENTS = ["David", "Dipshika", "John", "Mark", "Michael", "Richard", "Tristan"];
import API from "../api";

export default function AddOrder() {
  const [formData, setFormData] = useState({
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

    // Shipping Info
    attention: "",
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

    //  Toggles
    expediteShipping: false,
    dsCall: false,
    programmingRequired: false,
    programmingCost: "",
    sameAsBilling: false,
  });
  const [partNames, setPartNames] = useState([]);

  useEffect(() => {
    fetchParts();
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
          await API.post("/parts", { name: newPart.trim() }); await fetchParts();
          setFormData({ ...formData, pReq: newPart.trim() });
        } catch (err) {
          alert(err.response?.data?.message || "Error adding part");
        }
      }
    } else {
      setFormData({ ...formData, pReq: value });
    }
  }
  let zipTimer;

  const handleZipChange = (zip, type) => {
    clearTimeout(zipTimer);
    zipTimer = setTimeout(async () => {
      if (!zip) return;

      const cleanZip = zip.trim().toUpperCase().replace(/\s+/g, "");

      try {
        if (cleanZip.length === 5 && /^\d{5}$/.test(cleanZip)) {
          const res = await axios.get(`https://api.zippopotam.us/us/${cleanZip}`);
          const place = res.data.places[0];

          setFormData((prev) => ({
            ...prev,
            ...(type === "b"
              ? {
                bAddressCity: place["place name"],
                bAddressState: place["state abbreviation"],
                bAddressAcountry: res.data["country abbreviation"],
              }
              : {
                sAddressCity: place["place name"],
                sAddressState: place["state abbreviation"],
                sAddressAcountry: res.data["country abbreviation"],
              }),
          }));
        }
        // 🇨🇦 Canada ZIP Logic
        else if (
          cleanZip.length >= 3 &&
          /^[A-Z]\d[A-Z]$/.test(cleanZip.slice(0, 3))
        ) {
          const res = await axios.get(
            `https://api.zippopotam.us/CA/${cleanZip.slice(0, 3)}`
          );
          const place = res.data.places[0];

          setFormData((prev) => ({
            ...prev,
            ...(type === "b"
              ? {
                bAddressState: place["state abbreviation"],
                bAddressAcountry: res.data["country"],
              }
              : {
                sAddressState: place["state abbreviation"],
                sAddressAcountry: res.data["country"],
              }),
          }));
        }
      } catch (err) {
        console.warn("Invalid ZIP:", cleanZip);
      }
    }, 400);
  };
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

    try {
      const firstName = localStorage.getItem("firstName") || "";

      const payload = {
        ...formData,
        customerName: `${formData.fName} ${formData.lName}`.trim(),
        programmingCostQuoted: formData.programmingRequired
          ? formData.programmingCost
          : "",
      };

      const res = await API.post(
        `/orders/orders?firstName=${encodeURIComponent(firstName)}`,
        payload
      );


      alert(`Order ${res.data.newOrder.orderNo} created!`);
    } catch (err) {
      if (err.response && err.response.status === 409) {
        alert("Order No already exists! Please enter a unique Order No.");
      } else {
        console.error(err);
        alert("Error saving order");
      }
    }
  };

  return (
    <div className="h-screen flex flex-col p-6">
      <h1 className="text-3xl font-bold text-white mb-4">Add New Order</h1>

      <form className="flex-1 overflow-y-auto" onSubmit={handleSubmit}>
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
              options={SALES_AGENTS}
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
                handleZipChange(e.target.value, "b");
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
            <Dropdown
              placeholder="Country"
              options={["US", "Canada"]}
              value={formData.sAddressAcountry}
              onChange={(e) => setFormData({ ...formData, sAddressAcountry: e.target.value })}
            />
            <Input placeholder="Zip" value={formData.sAddressZip}
              onChange={(e) => {
                setFormData({ ...formData, sAddressZip: e.target.value });
                handleZipChange(e.target.value, "s");
              }} />
          </Section>

          {/* Part Info */}
          <Section title="Part Info">
            <Input placeholder="Make" value={formData.make}
              onChange={(e) => setFormData({ ...formData, make: e.target.value })} />
            <Input placeholder="Model" value={formData.model}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })} />
            <Input
              placeholder="Year"
              value={formData.year}
              onChange={(e) => setFormData({ ...formData, year: e.target.value })}
            />
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
            <Input placeholder="Warranty" value={formData.warranty}
              onChange={(e) => setFormData({ ...formData, warranty: e.target.value })} />
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
                calculateProfit(val, formData.costP, formData.shippingFee);
              }}
            />

            <Input
              placeholder="Est. Yard Price"
              prefix="$"
              value={formData.costP}
              onChange={(e) => {
                const val = e.target.value;
                setFormData({ ...formData, costP: val });
                calculateProfit(formData.soldP, val, formData.shippingFee);
              }}
            />

            <Input
              placeholder="Est. Shipping"
              prefix="$"
              value={formData.shippingFee}
              onChange={(e) => {
                const val = e.target.value;
                setFormData({ ...formData, shippingFee: val });
                calculateProfit(formData.soldP, formData.costP, val);
              }}
            />
            <Input
              placeholder="Sales Tax"
              prefix="%"
              value="5"
              disabled
            />
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

        {/* Submit Button */}
        <div className="flex mt-6">
          <button
            type="submit"
            className="px-6 py-3 bg-gradient-to-r from-[#504fad] to-[#5a80c7] text-white font-semibold rounded-xl shadow-lg hover:scale-105 transition"
          >
            Add / Edit Order
          </button>
        </div>
      </form>
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
