import { useEffect, useRef, useState, useCallback } from "react";
import Field from "../../ui/Field";
import Input from "../../ui/Input";
import Select, {
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectContent,
} from "../../ui/Select";
import API from "../../../api";
import { extractOwn, extractYard } from "../../../utils/yards";

const ALLOWED_COUNTRIES = ["US", "Canada"];
const normalizeCountry = (value) => {
  const normalized = String(value ?? "").trim();
  return ALLOWED_COUNTRIES.includes(normalized) ? normalized : "US";
};

const buildAddress = (street, city, state, zipcode, country) => {
  const parts = [street, city, state, zipcode, country]
    .map((v) => String(v ?? "").trim().replace(/,+$/, ""))
    .filter(Boolean);
  return parts.join(", ");
};
function Toast({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white text-black px-6 py-4 rounded-lg shadow-lg border border-gray-300 z-[200] text-sm font-medium flex items-center gap-4">
      <span>{message}</span>
      <button
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClose?.();
          }
        }}
        className="ml-3 px-3 py-1 text-sm font-semibold bg-[#04356d] text-white rounded-md hover:bg-[#021f4b] transition"
      >
        OK
      </button>
    </div>
  );
}

export default function YardEditModal({ open, initial, order, orderNo, yardIndex, onClose, onSubmit }) {
  const [form, setForm] = useState(() => ({
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
    trackingNo: "",
    eta: "",
  }));
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState("");
  const zipTimerRef = useRef(null);

  const lookupZip = useCallback(async (rawZip) => {
    const trimmed = (rawZip || "").trim();
    if (!trimmed) return null;

    const normalized = trimmed.replace(/\s+/g, "").toUpperCase();

    try {
      if (/^\d{5}$/.test(normalized)) {
        const response = await fetch(`https://api.zippopotam.us/us/${normalized}`);
        if (!response.ok) return null;
        const data = await response.json();
        const place = data?.places?.[0];
        if (!place) return null;
        return {
          city: place["place name"] || "",
          state: place["state abbreviation"] || "",
          country: data?.["country abbreviation"] || "US",
        };
      }

      if (trimmed.length >= 4 && trimmed.includes(" ")) {
        const segment = trimmed.slice(0, 3).toUpperCase();
        if (!/^[A-Z]\d[A-Z]$/.test(segment)) return null;
        const response = await fetch(`https://api.zippopotam.us/CA/${segment}`);
        if (!response.ok) return null;
        const data = await response.json();
        const place = data?.places?.[0];
        if (!place) return null;
        return {
          city: place["place name"] || "",
          state: place["state abbreviation"] || "",
          country: data?.country || "Canada",
        };
      }
    } catch (err) {
      console.debug("ZIP lookup skipped", err);
    }

    return null;
  }, []);

  useEffect(() => {
    if (!open) return;
    setForm({
      yardName: initial?.yardName || "",
      agentName: initial?.agentName || "",
      yardRating: initial?.yardRating || "",
      phone: initial?.phone || "",
      altPhone: initial?.altPhone || "",
      ext: initial?.ext || "",
      email: initial?.email || "",
      street: initial?.street || initial?.address || "",
      city: initial?.city || "",
      state: initial?.state || "",
      zipcode: initial?.zipcode || "",
      country: normalizeCountry(initial?.country || "US"),
      partPrice: initial?.partPrice || "",
      status: initial?.status || "Yard located",
      ownShipping:
        extractOwn(initial?.shippingDetails) ??
        initial?.ownShipping ??
        "",
      yardShipping:
        extractYard(initial?.shippingDetails) ??
        initial?.yardShipping ??
        "",
      others: initial?.others || "",
      faxNo: initial?.faxNo || "",
      expShipDate: initial?.expShipDate || "",
      warranty: initial?.warranty || "",
      yardWarrantyField: initial?.yardWarrantyField || "days",
      stockNo: initial?.stockNo || "",
      trackingNo: initial?.trackingNo || "",
      eta: initial?.eta || initial?.yardTrackingETA || "",
    });
    setErrors({});
  }, [open, initial]);

  const set = (k) => (ev) => {
    const raw =
      ev.target.type === "checkbox" ? ev.target.checked : ev.target.value;
    const value = k === "country" ? normalizeCountry(raw) : raw;
    setForm((p) => ({
      ...p,
      [k]: value,
    }));
  };

  const ownSet =
    String(form.ownShipping ?? "").trim() !== "" &&
    !Number.isNaN(Number(form.ownShipping));
  const yardSet =
    String(form.yardShipping ?? "").trim() !== "" &&
    !Number.isNaN(Number(form.yardShipping));

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
    const bothSet =
      String(form.ownShipping ?? "").trim() !== "" &&
      String(form.yardShipping ?? "").trim() !== "" &&
      !Number.isNaN(Number(form.ownShipping)) &&
      !Number.isNaN(Number(form.yardShipping));
    if (bothSet) {
      e.ownShipping = "Choose either Own or Yard shipping, not both";
      e.yardShipping = "Choose either Own or Yard shipping, not both";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  useEffect(() => {
    const rawZip = String(form.zipcode || "").trim();
    if (zipTimerRef.current) clearTimeout(zipTimerRef.current);
    if (!rawZip) return () => {};

    zipTimerRef.current = setTimeout(async () => {
      const result = await lookupZip(rawZip);
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
      if (zipTimerRef.current) clearTimeout(zipTimerRef.current);
    };
  }, [form.zipcode, lookupZip]);

  const handleSave = async () => {
    if (!validate()) return;

    const firstName = localStorage.getItem("firstName");
    const orderNo = order?.orderNo;

    const changedFields = {};
    Object.keys(form).forEach((key) => {
      const oldVal = (initial?.[key] ?? "").toString().trim();
      const newVal = (form[key] ?? "").toString().trim();
      if (oldVal !== newVal) {
        changedFields[key] = form[key];
      }
    });

    const oldOwn = (initial?.ownShipping ?? extractOwn(initial?.shippingDetails) ?? "").toString().trim();
    const oldYard = (initial?.yardShipping ?? extractYard(initial?.shippingDetails) ?? "").toString().trim();
    const nextOwn = String(form.ownShipping ?? "").trim();
    const nextYard = String(form.yardShipping ?? "").trim();

    const ownChanged = nextOwn !== oldOwn;
    const yardChanged = nextYard !== oldYard;

    // Handle shipping changes - prioritize the one with a value if both changed
    if (yardChanged && nextYard) {
      // Changing to yard shipping (prioritize this if both changed)
      changedFields.shippingDetails = `Yard shipping: ${nextYard}`;
      changedFields.yardShipping = nextYard; // Send separately for backend fallback
      changedFields.ownShipping = ""; // Clear own shipping
    } else if (ownChanged && nextOwn) {
      // Changing to own shipping
      changedFields.shippingDetails = `Own shipping: ${nextOwn}`;
      changedFields.ownShipping = nextOwn; // Send separately for backend fallback
      changedFields.yardShipping = ""; // Clear yard shipping
    } else if ((ownChanged || yardChanged) && !nextOwn && !nextYard) {
      // Both cleared
      changedFields.shippingDetails = "";
      changedFields.ownShipping = "";
      changedFields.yardShipping = "";
    } else {
      // No shipping changes
      delete changedFields.shippingDetails;
      delete changedFields.ownShipping;
      delete changedFields.yardShipping;
    }

    const shippingChanged = ownChanged || yardChanged;

    if (Object.keys(changedFields).length === 0 && !shippingChanged) {
      setToast("No changes detected.");
      return;
    }

    if (
      changedFields.street ||
      changedFields.city ||
      changedFields.state ||
      changedFields.zipcode ||
      changedFields.country
    ) {
      changedFields.address = buildAddress(
        form.street,
        form.city,
        form.state,
        form.zipcode,
        form.country
      );
    }

    const shippingLabel = shippingChanged ? "Shipping Details" : null;

    try {
      const { data } = await API.patch(
        `/orders/${encodeURIComponent(orderNo)}/additionalInfo/${yardIndex + 1}`,
        changedFields,
        { params: { firstName } }
      );

      const message =
        data?.message || `Yard ${yardIndex + 1} details updated successfully!`;
      const changes = Array.isArray(data?.changes) ? data.changes : [];
      if (message.toLowerCase().includes("no meaningful changes")) {
        setToast("No changes detected. Please enter a different value.");
        return;
      }

      setToast(message);
      const refreshedOrder = data?.order ?? null;
      if (refreshedOrder && typeof yardIndex === "number") {
        const latestYard =
          refreshedOrder.additionalInfo?.[yardIndex] ??
          refreshedOrder.additionalInfo?.[Number(yardIndex)] ??
          null;
        if (latestYard) {
          setForm({
            yardName: latestYard.yardName || "",
            agentName: latestYard.agentName || "",
            yardRating: latestYard.yardRating || "",
            phone: latestYard.phone || "",
            altPhone: latestYard.altPhone || "",
            ext: latestYard.ext || "",
            email: latestYard.email || "",
            street: latestYard.street || latestYard.address || "",
            city: latestYard.city || "",
            state: latestYard.state || "",
            zipcode: latestYard.zipcode || "",
            country: normalizeCountry(latestYard.country || "US"),
            partPrice: latestYard.partPrice || "",
            status: latestYard.status || "Yard located",
            ownShipping:
              extractOwn(latestYard.shippingDetails) ??
              latestYard.ownShipping ??
              "",
            yardShipping:
              extractYard(latestYard.shippingDetails) ??
              latestYard.yardShipping ??
              "",
            others: latestYard.others || "",
            faxNo: latestYard.faxNo || "",
            expShipDate: latestYard.expShipDate || "",
            warranty: latestYard.warranty || "",
            stockNo: latestYard.stockNo || "",
            trackingNo: latestYard.trackingNo || "",
            eta: latestYard.eta || latestYard.yardTrackingETA || "",
          });
        }
      }
      if (typeof onSubmit === "function") {
        await onSubmit(refreshedOrder ?? data ?? null);
      }
    } catch (err) {
      console.error("Error updating yard:", err);
      const message = err?.response?.data?.message || "Server error while updating yard.";
      setToast(message);
    }
  };

  if (!open) return null;

  return (
    <>
      <style>{`
        /* YardEditModal Light Mode Styles */
        html:not(.dark) .yard-edit-modal-container {
          background: rgba(240, 249, 255, 0.95) !important;
          border: 1.5px solid rgba(59, 130, 246, 0.3) !important;
          color: #1a1a1a !important;
          overflow: hidden !important;
        }
        html:not(.dark) .yard-edit-modal-container header {
          background: rgba(240, 249, 255, 0.9) !important;
          border-bottom: 2px solid rgba(59, 130, 246, 0.3) !important;
          border-top-left-radius: 1rem !important;
          border-top-right-radius: 1rem !important;
        }
        html.dark .yard-edit-modal-container header {
          border-top-left-radius: 1rem !important;
          border-top-right-radius: 1rem !important;
        }
        html:not(.dark) .yard-edit-modal-container header h3 {
          color: #0f172a !important;
          font-weight: 700 !important;
        }
        html:not(.dark) .yard-edit-modal-container label span {
          color: #1a1a1a !important;
          font-weight: 600 !important;
        }
        /* Part Info Section - make text visible in light mode with high specificity */
        html:not(.dark) .yard-edit-modal-container header div.text-white\/80,
        html:not(.dark) .yard-edit-modal-container header div[class*="text-white/80"],
        html:not(.dark) .yard-edit-modal-container header .text-white\/80,
        html:not(.dark) .yard-edit-modal-container header [class*="text-white/80"],
        html:not(.dark) .yard-edit-modal-container header > div.mt-1[class*="text-white"],
        html:not(.dark) .yard-edit-modal-container header div.underline[class*="text-white"] {
          color: #1a1a1a !important;
          font-weight: 600 !important;
        }
        /* Override any general text-white inheritance from container */
        html:not(.dark) .yard-edit-modal-container.text-white header div[class*="text-white/80"],
        html:not(.dark) .yard-edit-modal-container[class*="text-white"] header div[class*="text-white/80"] {
          color: #1a1a1a !important;
          font-weight: 600 !important;
        }
        html:not(.dark) .yard-edit-modal-container input,
        html:not(.dark) .yard-edit-modal-container select {
          background: #e0f2fe !important;
          border: 1.5px solid rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .yard-edit-modal-container input:focus,
        html:not(.dark) .yard-edit-modal-container select:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15) !important;
          background: #ffffff !important;
          outline: none !important;
        }
        html:not(.dark) .yard-edit-modal-container input:disabled {
          background: #e5e7eb !important;
          color: #9ca3af !important;
          border-color: #d1d5db !important;
        }
        html:not(.dark) .yard-edit-modal-container select option {
          background: #ffffff !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .yard-edit-modal-container .text-red-200 {
          color: #dc2626 !important;
        }
        html:not(.dark) .yard-edit-modal-container footer {
          border-top: 2px solid rgba(59, 130, 246, 0.3) !important;
          border-bottom-left-radius: 1rem !important;
          border-bottom-right-radius: 1rem !important;
        }
        html.dark .yard-edit-modal-container footer {
          border-bottom-left-radius: 1rem !important;
          border-bottom-right-radius: 1rem !important;
        }
        html:not(.dark) .yard-edit-modal-close-btn {
          background: #dbeafe !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .yard-edit-modal-close-btn:hover {
          background: #bfdbfe !important;
        }
        html:not(.dark) .yard-edit-modal-submit-btn {
          background: #1e40af !important;
          color: #ffffff !important;
          border-color: #1e40af !important;
        }
        html:not(.dark) .yard-edit-modal-submit-btn:hover:not(:disabled) {
          background: #1e3a8a !important;
        }
      `}</style>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-3xl rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-xl shadow-2xl yard-edit-modal-container overflow-hidden dark:border-white/20 dark:bg-white/10 dark:text-white">
          <header className="flex flex-col px-5 py-3 border-b border-white/20 rounded-t-2xl dark:border-white/20">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              Edit Yard Details – {orderNo || "—"}
            </h3>
            <button
              onClick={onClose}
              className="px-2 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20 yard-edit-modal-close-btn dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/20 dark:text-white"
            >
              ✕
            </button>
          </div>

          {/* Part Info Section */}
          <div className="mt-1 text-sm text-white/80 underline underline-offset-2">
            Part Required: {order?.pReq || "—"} | For {order?.year || "—"}{" "}
            {order?.make || ""} {order?.model || ""}  |
            Desc: {order?.desc || order?.description || "—"}
          </div>
        </header>
        <div
          className="p-5 space-y-4 max-h-[80vh] overflow-y-auto"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              const tag = e.target?.tagName?.toLowerCase();
              if (tag && tag !== "textarea") {
                e.preventDefault();
                handleSave();
              }
            }
          }}
        >
          {/* Names / rating */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Yard Name"><Input value={form.yardName} onChange={set("yardName")} /></Field>
            <Field label="Agent Name"><Input value={form.agentName} onChange={set("agentName")} /></Field>
            <Field label="Yard Rating"><Input value={form.yardRating} onChange={set("yardRating")} /></Field>
          </div>

          {/* Phones */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Phone"><Input value={form.phone} onChange={set("phone")} /></Field>
            <Field label="Alt. Phone"><Input value={form.altPhone} onChange={set("altPhone")} /></Field>
            <Field label="Extension"><Input type="number" value={form.ext} onChange={set("ext")} /></Field>
          </div>

          {/* Email / Fax / Expected Ship */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Email"><Input type="email" value={form.email} onChange={set("email")} /></Field>
            <Field label="Fax No."><Input value={form.faxNo} onChange={set("faxNo")} /></Field>
            <Field label="Exp. Shipping"><Input type="date" value={form.expShipDate} onChange={set("expShipDate")} /></Field>
          </div>

          {/* Address */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Street"><Input value={form.street} onChange={set("street")} /></Field>
            <Field label="City"><Input value={form.city} onChange={set("city")} /></Field>
            <Field label="State / Province"><Input value={form.state} onChange={set("state")} /></Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Zip">
              <Input value={form.zipcode} onChange={set("zipcode")} />
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
                <SelectTrigger>
                  <SelectValue placeholder="Select Country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">US</SelectItem>
                  <SelectItem value="Canada">Canada</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div />
          </div>

          {/* Pricing / misc */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Part Price ($)"><Input type="number" value={form.partPrice} onChange={set("partPrice")} /></Field>
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
                  <SelectItem value="days">
                    {Number(form.warranty) === 1 ? "Day" : "Day(s)"}
                  </SelectItem>
                  <SelectItem value="months">
                    {Number(form.warranty) === 1 ? "Month" : "Month(s)"}
                  </SelectItem>
                  <SelectItem value="years">
                    {Number(form.warranty) === 1 ? "Year" : "Year(s)"}
                  </SelectItem>
                </Select>
              </div>
            </Field>
            <Field label="Stock No."><Input value={form.stockNo} onChange={set("stockNo")} /></Field>
          </div>

          {/* Shipping splits */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Own Shipping ($)">
              <Input type="number" step="0.01" value={form.ownShipping} onChange={onOwnChange} disabled={yardSet} />
              {errors.ownShipping && <p className="text-xs text-red-200 mt-1">{errors.ownShipping}</p>}
            </Field>
            <Field label="Yard Shipping ($)">
              <Input type="number" step="0.01" value={form.yardShipping} onChange={onYardChange} disabled={ownSet} />
              {errors.yardShipping && <p className="text-xs text-red-200 mt-1">{errors.yardShipping}</p>}
            </Field>
            <Field label="Other Charges ($)"><Input type="number" step="0.01" value={form.others} onChange={set("others")} /></Field>
          </div>

          {/* Status / tracking / delivery */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Status"><Input value={form.status} onChange={set("status")} /></Field>
            <Field label="Tracking No"><Input value={form.trackingNo} onChange={set("trackingNo")} /></Field>
            <Field label="ETA"><Input type="date" value={form.eta} onChange={set("eta")} /></Field>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/20 rounded-b-2xl dark:border-white/20">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md bg-white/10 border border-white/20 hover:bg-white/20 yard-edit-modal-close-btn dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/20 dark:text-white">Close</button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 rounded-md bg-white text-[#04356d] border border-white/20 hover:bg-white/90 yard-edit-modal-submit-btn dark:bg-white dark:text-[#04356d] dark:hover:bg-white/90"
          >
            Save
          </button>
        </footer>
        <Toast
          message={toast}
          onClose={() => {
            setToast("");
          onClose();
          }}
        />
      </div>
    </div>
    </>
  );
}
