import { useEffect, useState, useRef, useCallback } from "react";
import API from "../../../api";
import Field from "../../ui/Field";
import Input from "../../ui/Input";
import Select, {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/Select";

const ALLOWED_COUNTRIES = ["US", "Canada"];
const normalizeCountry = (value) => {
  const normalized = String(value ?? "").trim();
  return ALLOWED_COUNTRIES.includes(normalized) ? normalized : "US";
};

export default function YardAddModal({ open, onClose, onSubmit, order }) {
  const [yards, setYards] = useState([]);
  const [storeCreditsByYard, setStoreCreditsByYard] = useState({});
  const [form, setForm] = useState({
    yardName: "",
    agentName: "",
    yardRating: "",
    phone: "",
    altPhone: "",
    ext: "",
    email: "",
    street: "",
    city: "",
    state: "",
    zipcode: "",
    country: "US",
    partPrice: "",
    status: "Yard located",
    ownShipping: "",
    yardShipping: "",
    others: "",
    faxNo: "",
    expShipDate: "",
    warranty: "",
    yardWarrantyField: "days",
    stockNo: "",
  });
  const [errors, setErrors] = useState({});
  const [filterText, setFilterText] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load yards from backend and sort A→Z, and prefetch store credit history per yard
  useEffect(() => {
    if (open) {
      setErrors({});
      setIsSubmitting(false); // Reset submitting state when modal opens

      // Fetch yards list
      fetch("/api/yards")
        .then((res) => res.json())
        .then((data) => {
          const sorted = data.sort((a, b) =>
            a.yardName.localeCompare(b.yardName, undefined, {
              sensitivity: "base",
            })
          );
          setYards(sorted);
        })
        .catch((err) => console.error("Failed to load yards", err));

      // Fetch store credits and build a history map keyed by yardName
      (async () => {
        try {
          const token = localStorage.getItem("token");
          const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
          const res = await API.get("/orders/storeCredits", { headers });
          const orders = Array.isArray(res.data) ? res.data : [];

          const map = {};
          orders.forEach((ord) => {
            const addl = Array.isArray(ord.additionalInfo)
              ? ord.additionalInfo
              : [];

            addl.forEach((ai) => {
              const name = (ai.yardName || "").trim();
              const creditNum =
                ai.storeCredit !== undefined && ai.storeCredit !== null
                  ? Number(ai.storeCredit)
                  : 0;
              const refundedRaw =
                ai.refundedAmount !== undefined && ai.refundedAmount !== null
                  ? Number(ai.refundedAmount)
                  : 0;
              if (!name || !Number.isFinite(creditNum) || creditNum <= 0) return;

              const used = Array.isArray(ai.storeCreditUsedFor)
                ? ai.storeCreditUsedFor.reduce(
                    (sum, entry) => sum + (Number(entry.amount) || 0),
                    0
                  )
                : 0;

              const entry = {
                sourceOrderNo: ord.orderNo,
                remaining: creditNum,
                used,
                refunded: Number.isFinite(refundedRaw) ? refundedRaw : 0,
                usedBreakdown: Array.isArray(ai.storeCreditUsedFor)
                  ? ai.storeCreditUsedFor.map((u) => ({
                      orderNo: u.orderNo,
                      amount: Number(u.amount) || 0,
                    }))
                  : [],
              };

              if (!map[name]) {
                map[name] = {
                  totalRemaining: 0,
                  totalUsed: 0,
                  totalRefunded: 0,
                  entries: [],
                };
              }

              map[name].entries.push(entry);
              map[name].totalRemaining += creditNum;
              map[name].totalUsed += used;
              map[name].totalRefunded += entry.refunded;
            });
          });

          setStoreCreditsByYard(map);
        } catch (err) {
          console.error("Failed to load store credit history for yards", err);
          setStoreCreditsByYard({});
        }
      })();
    } else {
      setIsSubmitting(false); // Reset when modal closes
    }
  }, [open]);

  const zipLookupTimer = useRef(null);

  const fetchZipDetails = useCallback(async (zipRaw) => {
    const trimmed = (zipRaw || "").trim();
    if (!trimmed) return null;

    try {
      const res = await API.get("/utils/zip-lookup", {
        params: { zip: trimmed },
      });
      return res.data || null;
    } catch (error) {
      console.debug("ZIP lookup skipped", error);
      return null;
    }
  }, []);

  useEffect(() => {
    const zip = form.zipcode;
    if (zipLookupTimer.current) clearTimeout(zipLookupTimer.current);
    if (!zip) return undefined;

    zipLookupTimer.current = setTimeout(async () => {
      const result = await fetchZipDetails(zip);
      if (result) {
        setForm((prev) => ({
          ...prev,
          city: result.city || prev.city,
          state: result.state || prev.state,
          country: normalizeCountry(result.country || prev.country),
        }));
      }
    }, 400);

    return () => {
      if (zipLookupTimer.current) clearTimeout(zipLookupTimer.current);
    };
  }, [form.zipcode, fetchZipDetails]);

  const ownSet =
    String(form.ownShipping ?? "").trim() !== "" &&
    !Number.isNaN(Number(form.ownShipping));
  const yardSet =
    String(form.yardShipping ?? "").trim() !== "" &&
    !Number.isNaN(Number(form.yardShipping));

  const set = (k) => (ev) => {
    const value =
      k === "country" ? normalizeCountry(ev.target.value) : ev.target.value;
    setForm((p) => ({
      ...p,
      [k]: value,
    }));
  };

  const onOwnChange = (ev) => {
    const v = ev.target.value;
    setForm((p) => ({
      ...p,
      ownShipping: v,
      yardShipping: v && String(v).trim() !== "" ? "" : p.yardShipping,
    }));
  };

  const onYardChange = (ev) => {
    const v = ev.target.value;
    setForm((p) => ({
      ...p,
      yardShipping: v,
      ownShipping: v && String(v).trim() !== "" ? "" : p.ownShipping,
    }));
  };

  const req = [
    "yardName",
    "agentName",
    "yardRating",
    "phone",
    "street",
    "city",
    "state",
    "zipcode",
    "partPrice",
  ];

  const validate = () => {
    const e = {};
    req.forEach((k) => {
      if (!String(form[k] || "").trim()) e[k] = "Required";
    });
    const ownTrim = String(form.ownShipping ?? "").trim();
    const yardTrim = String(form.yardShipping ?? "").trim();
    const ownIsNumber = ownTrim !== "" && !Number.isNaN(Number(ownTrim));
    const yardIsNumber = yardTrim !== "" && !Number.isNaN(Number(yardTrim));
    if (ownTrim && yardTrim) {
      e.ownShipping = "Choose either Own or Yard shipping, not both";
      e.yardShipping = "Choose either Own or Yard shipping, not both";
    }
    if (!ownTrim && !yardTrim) {
      e.ownShipping = "Enter an amount in Own or Yard shipping";
      e.yardShipping = "Enter an amount in Own or Yard shipping";
    }
    if (ownTrim && !ownIsNumber) {
      e.ownShipping = "Enter a valid number";
    }
    if (yardTrim && !yardIsNumber) {
      e.yardShipping = "Enter a valid number";
    }
    setErrors(e);
    
    // Show alert if validation fails
    if (Object.keys(e).length > 0) {
      const missingFields = Object.keys(e).filter(k => e[k] === "Required");
      if (missingFields.length > 0) {
        alert(`Please fill in all required fields:\n${missingFields.map(f => `- ${f}`).join('\n')}`);
      } else {
        alert(`Please fix the following errors:\n${Object.entries(e).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`);
      }
      // Scroll to first error field
      const firstErrorField = document.querySelector(`[name="${Object.keys(e)[0]}"]`) || 
                              document.querySelector(`input[value="${form[Object.keys(e)[0]]}"]`);
      if (firstErrorField) {
        firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstErrorField.focus();
      }
    }
    
    return Object.keys(e).length === 0;
  };

  // Filter yards dynamically as user types in dropdown
  const filteredYards = yards.filter((y) =>
    y.yardName.toLowerCase().includes(filterText.toLowerCase())
  );

  const selectYard = (yard) => {
    if (!yard) return;
    setForm((p) => ({
      ...p,
      yardName: yard.yardName,
      yardRating: yard.yardRating,
      phone: yard.phone,
      altPhone: yard.altNo,
      email: yard.email,
      street: yard.street,
      city: yard.city,
      state: yard.state,
      zipcode: yard.zipcode,
      country: yard.country,
    }));
    setDropdownOpen(false);
    setFilterText(yard.yardName);
  };

  if (!open) return null;

  return (
    <>
      <style>{`
        /* YardAddModal Light Mode Styles */
        
        /* Modal backdrop */
        html:not(.dark) .yard-add-modal-backdrop {
          background: rgba(0, 0, 0, 0.3) !important;
        }
        
        /* Modal container */
        html:not(.dark) .yard-add-modal-container {
          background: rgba(240, 249, 255, 0.95) !important;
          border: 1.5px solid rgba(59, 130, 246, 0.3) !important;
          color: #1a1a1a !important;
          backdrop-filter: blur(12px);
          overflow: hidden !important;
        }
        
        /* Modal header - rounded top corners */
        html:not(.dark) .yard-add-modal-container header {
          background: rgba(240, 249, 255, 0.9) !important;
          border-bottom: 2px solid rgba(59, 130, 246, 0.3) !important;
          border-top-left-radius: 1rem !important;
          border-top-right-radius: 1rem !important;
        }
        
        /* Dark mode header rounded corners */
        html.dark .yard-add-modal-container header {
          border-top-left-radius: 1rem !important;
          border-top-right-radius: 1rem !important;
        }
        
        html:not(.dark) .yard-add-modal-container header h3 {
          color: #0f172a !important;
          font-weight: 700 !important;
        }
        
        /* Close button */
        html:not(.dark) .yard-add-modal-close-btn {
          background: #dbeafe !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        
        html:not(.dark) .yard-add-modal-close-btn:hover {
          background: #bfdbfe !important;
          border-color: rgba(59, 130, 246, 0.5) !important;
        }
        
        /* Field labels */
        html:not(.dark) .yard-add-modal-container label span {
          color: #1a1a1a !important;
          font-weight: 600 !important;
        }
        
        /* Input fields - override Input component styles */
        html:not(.dark) .yard-add-modal-container input[type="text"],
        html:not(.dark) .yard-add-modal-container input[type="email"],
        html:not(.dark) .yard-add-modal-container input[type="number"],
        html:not(.dark) .yard-add-modal-container input[type="tel"],
        html:not(.dark) .yard-add-modal-container input[type="date"],
        html:not(.dark) .yard-add-modal-container input {
          background: #e0f2fe !important;
          border: 1.5px solid rgba(59, 130, 246, 0.4) !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        
        html:not(.dark) .yard-add-modal-container input::placeholder {
          color: #6b7280 !important;
        }
        
        html:not(.dark) .yard-add-modal-container input:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15) !important;
          background: #ffffff !important;
          outline: none !important;
        }
        
        html:not(.dark) .yard-add-modal-container input:disabled {
          background: #e5e7eb !important;
          color: #9ca3af !important;
          border-color: #d1d5db !important;
          cursor: not-allowed !important;
        }
        
        /* Select dropdowns - override Select component default styles */
        html:not(.dark) .yard-add-modal-container select {
          background: #e0f2fe !important;
          border: 1.5px solid rgba(59, 130, 246, 0.4) !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
          backdrop-filter: none !important;
        }
        
        html:not(.dark) .yard-add-modal-container select:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15) !important;
          background: #ffffff !important;
          outline: none !important;
        }
        
        html:not(.dark) .yard-add-modal-container select:hover {
          border-color: rgba(59, 130, 246, 0.5) !important;
        }
        
        html:not(.dark) .yard-add-modal-container select option {
          background: #ffffff !important;
          color: #1a1a1a !important;
        }
        
        /* Special select with dark bg override - for yard name dropdown and warranty select */
        html:not(.dark) .yard-add-modal-container select.yard-select-dark-bg {
          background: #dbeafe !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        
        html:not(.dark) .yard-add-modal-container select.yard-select-dark-bg:hover {
          background: #bfdbfe !important;
          border-color: rgba(59, 130, 246, 0.5) !important;
        }
        
        html:not(.dark) .yard-add-modal-container select.yard-select-dark-bg:focus {
          background: #ffffff !important;
          border-color: #2563eb !important;
        }
        
        /* Error messages */
        html:not(.dark) .yard-add-modal-container .text-red-200 {
          color: #dc2626 !important;
        }
        
        /* Footer - rounded bottom corners */
        html:not(.dark) .yard-add-modal-container footer {
          border-top: 2px solid rgba(59, 130, 246, 0.3) !important;
          border-bottom-left-radius: 1rem !important;
          border-bottom-right-radius: 1rem !important;
        }
        
        /* Dark mode footer rounded corners */
        html.dark .yard-add-modal-container footer {
          border-bottom-left-radius: 1rem !important;
          border-bottom-right-radius: 1rem !important;
        }
        
        /* Close button in footer */
        html:not(.dark) .yard-add-modal-close-footer-btn {
          background: #dbeafe !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        
        html:not(.dark) .yard-add-modal-close-footer-btn:hover {
          background: #bfdbfe !important;
          border-color: rgba(59, 130, 246, 0.5) !important;
        }
        
        /* Submit button */
        html:not(.dark) .yard-add-modal-submit-btn {
          background: #1e40af !important;
          color: #ffffff !important;
          border-color: #1e40af !important;
          font-weight: 500 !important;
        }
        
        html:not(.dark) .yard-add-modal-submit-btn:hover:not(:disabled) {
          background: #1e3a8a !important;
          border-color: #1e3a8a !important;
        }
        
        html:not(.dark) .yard-add-modal-submit-btn:disabled {
          background: #e5e7eb !important;
          color: #9ca3af !important;
          border-color: #d1d5db !important;
          cursor: not-allowed !important;
        }
        /* Part Info Section - make text visible in light mode with high specificity */
        html:not(.dark) .yard-add-modal-container header div.text-white\/80,
        html:not(.dark) .yard-add-modal-container header div[class*="text-white/80"],
        html:not(.dark) .yard-add-modal-container header .text-white\/80,
        html:not(.dark) .yard-add-modal-container header [class*="text-white/80"],
        html:not(.dark) .yard-add-modal-container header > div.mt-1[class*="text-white"],
        html:not(.dark) .yard-add-modal-container header div.underline[class*="text-white"] {
          color: #1a1a1a !important;
          font-weight: 600 !important;
        }
        /* Override any general text-white inheritance from container */
        html:not(.dark) .yard-add-modal-container.text-white header div[class*="text-white/80"],
        html:not(.dark) .yard-add-modal-container[class*="text-white"] header div[class*="text-white/80"] {
          color: #1a1a1a !important;
          font-weight: 600 !important;
        }
      `}</style>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm yard-add-modal-backdrop" onClick={onClose} />
        <div className="relative w-full max-w-3xl rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-xl shadow-2xl yard-add-modal-container overflow-hidden dark:border-white/20 dark:bg-white/10 dark:text-white">
          <header className="flex flex-col px-5 py-3 border-b border-white/20 rounded-t-2xl dark:border-white/20">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Add New Yard</h3>
              <button
                onClick={onClose}
                className="px-2 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20 yard-add-modal-close-btn dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/20 dark:text-white"
              >
                ✕
              </button>
            </div>
            {/* Part Info Section */}
            {order && (
              <div className="mt-1 text-sm text-white/80 underline underline-offset-2">
                Part Required: {order?.pReq || "—"} | For {order?.year || "—"}{" "}
                {order?.make || ""} {order?.model || ""}  |
                Desc: {order?.desc || order?.description || "—"}
              </div>
            )}
          </header>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Yard Dropdown — behaves like a searchable select */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Yard Name (Select or Add New)">
  <select
    className="w-full p-2 rounded-md text-white mb-2 bg-[#2b2d68] hover:bg-[#090c6c] yard-select-dark-bg dark:bg-[#2b2d68] dark:hover:bg-[#090c6c] dark:text-white"
    value={yards.find((y) => y.yardName === form.yardName)?._id || "new"}
    onChange={(e) => {
      const yardId = e.target.value;

      // If user picks "+ Add New Yard" — reset form
      if (yardId === "new") {
        setForm({
          yardName: "",
          agentName: "",
          yardRating: "",
          phone: "",
          altPhone: "",
          ext: "",
          email: "",
          street: "",
          city: "",
          state: "",
          zipcode: "",
          country: "US",
          partPrice: "",
          status: "Yard located",
          ownShipping: "",
          yardShipping: "",
          others: "",
          faxNo: "",
          expShipDate: "",
          warranty: "",
          yardWarrantyField: "days",
          stockNo: "",
        });
        return;
      }

      // Otherwise, autofill form using selected yard
      const selected = yards.find((y) => y._id === yardId);
      if (selected) {
        setForm((p) => ({
          ...p,
          yardName: selected.yardName,
          yardRating: selected.yardRating,
          phone: selected.phone,
          altPhone: selected.altNo,
          email: selected.email,
          street: selected.street,
          city: selected.city,
          state: selected.state,
          zipcode: selected.zipcode,
          country: normalizeCountry(selected.country),
          yardWarrantyField: selected.yardWarrantyField || "days",
          warranty: selected.warranty || "",
        }));
      }
    }}
    onInput={(e) => {
      const query = e.target.value.toLowerCase();
      const matched = yards.find((y) =>
        y.yardName.toLowerCase().includes(query)
      );

      // live filtering with browser built-in jump-to
      if (!matched && query === "") {
        // clear all yard info when yardName is cleared
        setForm((p) => ({
          ...p,
          yardName: "",
          yardRating: "",
          phone: "",
          altPhone: "",
          email: "",
          street: "",
          city: "",
          state: "",
          zipcode: "",
          country: "US",
          warranty: "",
          yardWarrantyField: "days",
        }));
      }
    }}
  >
    <option value="new">+ Add New Yard</option>
    {yards
      .slice()
      .sort((a, b) => a.yardName.localeCompare(b.yardName))
      .map((y) => (
        <option key={y._id} value={y._id}>
          {y.yardName}
        </option>
      ))}
  </select>

  {/* Input for adding a new yard */}
  {!yards.find((y) => y.yardName === form.yardName) && (
    <Input
      value={form.yardName}
      onChange={(e) => {
        const val = e.target.value;
        setForm((p) => ({ ...p, yardName: val }));

        // clear other fields if name is blanked out
        if (val.trim() === "") {
          setForm((p) => ({
            ...p,
            yardRating: "",
            phone: "",
            altPhone: "",
            email: "",
            street: "",
            city: "",
            state: "",
            zipcode: "",
            country: "US",
          }));
        }
      }}
      placeholder="Enter new yard name"
    />
  )}

  {errors.yardName && (
    <p className="text-xs text-red-200 mt-1 dark:text-red-200">{errors.yardName}</p>
  )}
</Field>

            {/* Store credit history for selected yard, if any */}
            {form.yardName &&
              storeCreditsByYard[form.yardName] &&
              storeCreditsByYard[form.yardName].entries.length > 0 && (
                <div className="md:col-span-3 text-xs rounded-lg border border-blue-200 bg-blue-50 text-[#09325d] shadow-sm space-y-1 dark:border-white/20 dark:bg-white/10 dark:text-white">
                  <div className="px-3 py-2 border-b border-blue-100/70 dark:border-white/15 flex items-center justify-between">
                    <span className="font-semibold">
                      Store Credit History for {form.yardName}
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-blue-700 dark:text-blue-100">
                      Summary
                    </span>
                  </div>
                  <div className="px-3 pb-2 pt-1 space-y-1">
                    <div className="grid grid-cols-3 gap-3 text-[11px] font-medium">
                      <div>
                        <span className="font-semibold">Total Refunded:</span>{" "}
                        ${storeCreditsByYard[form.yardName].totalRefunded.toFixed(2)}
                      </div>
                      <div>
                        <span className="font-semibold">Total Used:</span>{" "}
                        ${storeCreditsByYard[form.yardName].totalUsed.toFixed(2)}
                      </div>
                      <div>
                        <span className="font-semibold">Store Credit Balance:</span>{" "}
                        ${storeCreditsByYard[form.yardName].totalRemaining.toFixed(2)}
                      </div>
                    </div>

                    <div className="max-h-40 overflow-y-auto mt-1 space-y-1">
                      {storeCreditsByYard[form.yardName].entries.map((sc, idx) => (
                        <div
                          key={idx}
                          className="rounded-md bg-white/60 border border-blue-100 px-3 py-1.5 text-[11px] dark:bg-white/5 dark:border-white/15"
                        >
                          <div className="mb-1">
                            <span className="font-semibold">From Order:</span>{" "}
                            {sc.sourceOrderNo}
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <span className="font-semibold">Refunded:</span>{" "}
                              ${sc.refunded.toFixed(2)}
                            </div>
                            <div>
                              {sc.usedBreakdown.length > 0 ? (
                                <div className="space-y-0.5">
                                  {sc.usedBreakdown.map((u, i) => (
                                    <div key={i}>
                                      <span className="font-semibold">Used For:</span>{" "}
                                      {u.orderNo} — ${u.amount.toFixed(2)}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div>
                                  <span className="font-semibold">Used For:</span>{" —"}
                                </div>
                              )}
                            </div>
                            <div>
                              <span className="font-semibold">Remaining:</span>{" "}
                              ${sc.remaining.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}


            <Field label="Agent Name">
              <Input value={form.agentName} onChange={set("agentName")} />
              {errors.agentName && (
                <p className="text-xs text-red-200 mt-1 dark:text-red-200">{errors.agentName}</p>
              )}
            </Field>

            <Field label="Yard Rating">
              <Input value={form.yardRating} onChange={set("yardRating")} />
              {errors.yardRating && (
                <p className="text-xs text-red-200 mt-1 dark:text-red-200">{errors.yardRating}</p>
              )}
            </Field>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Phone">
              <Input value={form.phone} onChange={set("phone")} />
              {errors.phone && (
                <p className="text-xs text-red-200 mt-1 dark:text-red-200">{errors.phone}</p>
              )}
            </Field>
            <Field label="Alt. Phone">
              <Input value={form.altPhone} onChange={set("altPhone")} />
            </Field>
            <Field label="Extension">
              <Input type="number" value={form.ext} onChange={set("ext")} />
            </Field>
          </div>

          {/* Row 3 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Email">
              <Input type="email" value={form.email} onChange={set("email")} />
            </Field>
            <Field label="Fax No.">
              <Input value={form.faxNo} onChange={set("faxNo")} />
            </Field>
            <Field label="Exp. Shipping">
              <Input type="date" value={form.expShipDate} onChange={set("expShipDate")} />
            </Field>
          </div>

          {/* Address */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Street">
              <Input value={form.street} onChange={set("street")} />
              {errors.street && <p className="text-xs text-red-200 dark:text-red-200">{errors.street}</p>}
            </Field>
            <Field label="City">
              <Input value={form.city} onChange={set("city")} />
              {errors.city && <p className="text-xs text-red-200 dark:text-red-200">{errors.city}</p>}
            </Field>
            <Field label="State / Province">
              <Input value={form.state} onChange={set("state")} />
              {errors.state && <p className="text-xs text-red-200 dark:text-red-200">{errors.state}</p>}
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Zip">
              <Input value={form.zipcode} onChange={set("zipcode")} />
              {errors.zipcode && <p className="text-xs text-red-200 dark:text-red-200">{errors.zipcode}</p>}
            </Field>
            <Field label="Country">
              <Select
                value={form.country}
            onValueChange={(val) =>
              setForm((prev) => ({
                ...prev,
                country: normalizeCountry(val),
              }))
            }
              >
                <SelectTrigger className="!bg-[#2b2d68] hover:!bg-[#090c6c] yard-select-dark-bg dark:!bg-[#2b2d68] dark:hover:!bg-[#090c6c]">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">US</SelectItem>
                  <SelectItem value="Canada">Canada</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div />
          </div>

          {/* Price & misc */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Part Price ($)">
              <Input type="number" value={form.partPrice} onChange={set("partPrice")} />
              {errors.partPrice && <p className="text-xs text-red-200 dark:text-red-200">{errors.partPrice}</p>}
            </Field>
            <Field label="Warranty">
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" value={form.warranty} onChange={set("warranty")} />
                <Select
                  value={form.yardWarrantyField}
                  onValueChange={(val) =>
                    setForm((prev) => ({
                      ...prev,
                      yardWarrantyField: val,
                    }))
                  }
                >
                  <SelectTrigger className="!bg-[#2b2d68] hover:!bg-[#090c6c] yard-select-dark-bg dark:!bg-[#2b2d68] dark:hover:!bg-[#090c6c]">
                    <SelectValue placeholder="Units" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="days">
                      {Number(form.warranty) === 1 ? "Day" : "Day(s)"}
                    </SelectItem>
                    <SelectItem value="months">
                      {Number(form.warranty) === 1 ? "Month" : "Month(s)"}
                    </SelectItem>
                    <SelectItem value="years">
                      {Number(form.warranty) === 1 ? "Year" : "Year(s)"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Field>
            <Field label="Stock No.">
              <Input value={form.stockNo} onChange={set("stockNo")} />
            </Field>
          </div>

          {/* Own + Yard + Others */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Own Shipping ($)">
              <Input type="number" step="0.01" value={form.ownShipping} onChange={onOwnChange} disabled={yardSet} />
              {errors.ownShipping && <p className="text-xs text-red-200 dark:text-red-200">{errors.ownShipping}</p>}
            </Field>
            <Field label="Yard Shipping ($)">
              <Input type="number" step="0.01" value={form.yardShipping} onChange={onYardChange} disabled={ownSet} />
              {errors.yardShipping && <p className="text-xs text-red-200 dark:text-red-200">{errors.yardShipping}</p>}
            </Field>
            <Field label="Other Charges ($)">
              <Input type="number" step="0.01" value={form.others} onChange={set("others")} />
            </Field>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/20 rounded-b-2xl dark:border-white/20">
          <button 
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3 py-1.5 rounded-md bg-white/10 border border-white/20 hover:bg-white/20 yard-add-modal-close-footer-btn dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/20 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Close
          </button>
          <button
            onClick={async () => {
              if (isSubmitting) return; // Prevent multiple clicks
              if (!validate()) return;
              
              setIsSubmitting(true);
              try {
                const ownTrim = String(form.ownShipping || "").trim();
                const yardTrim = String(form.yardShipping || "").trim();
                const normalizedCountry = normalizeCountry(form.country);
                await onSubmit({
                  ...form,
                  country: normalizedCountry,
                  ownShipping: ownTrim,
                  yardShipping: yardTrim,
                  address: `${form.street} ${form.city} ${form.state} ${form.zipcode}`.trim(),
                  shippingDetails: [
                    ownTrim ? `Own shipping: ${ownTrim}` : "",
                    yardTrim ? `Yard shipping: ${yardTrim}` : "",
                  ]
                    .filter(Boolean)
                    .join(" | "),
                });
              } catch (error) {
                console.error("Error submitting yard:", error);
                setIsSubmitting(false);
              }
            }}
            disabled={isSubmitting}
            className="px-3 py-1.5 rounded-md bg-white text-[#04356d] border border-white/20 hover:bg-white/90 yard-add-modal-submit-btn dark:bg-white dark:text-[#04356d] dark:hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Submitting..." : "Submit"}
          </button>
        </footer>
      </div>
    </div>
    </>
  );
}
