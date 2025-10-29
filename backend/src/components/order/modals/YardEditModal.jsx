import { useEffect, useState } from "react";
import Field from "../../ui/Field";
import API from "../api";

import Input from "../../ui/Input";
import Select from "../../ui/Select";
import { extractOwn, extractYard } from "../../../utils/yards";
function Toast({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white text-black px-6 py-4 rounded-lg shadow-lg border border-gray-300 z-[200] text-sm font-medium flex items-center gap-4">
      <span>{message}</span>
      <button
        onClick={onClose}
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
    stockNo: "",
    trackingNo: "",
    eta: "",
  }));
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (open) {
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
        country: initial?.country || "US",
        partPrice: initial?.partPrice || "",
        status: initial?.status || "Yard located",
        ownShipping:
          initial?.ownShipping ?? extractOwn(initial?.shippingDetails) ?? "",
        yardShipping:
          initial?.yardShipping ?? extractYard(initial?.shippingDetails) ?? "",
        others: initial?.others || "",
        faxNo: initial?.faxNo || "",
        expShipDate: initial?.expShipDate || "",
        warranty: initial?.warranty || "",
        stockNo: initial?.stockNo || "",
        trackingNo: initial?.trackingNo || "",
        eta: initial?.eta || initial?.yardTrackingETA || "",
      });
      setErrors({});
    }
  }, [open, initial]);

  const set = (k) => (ev) =>
    setForm((p) => ({
      ...p,
      [k]: ev.target.type === "checkbox" ? ev.target.checked : ev.target.value,
    }));

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-xl shadow-2xl">
        <header className="flex flex-col px-5 py-3 border-b border-white/20">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              Edit Yard Details – {orderNo || "—"}
            </h3>
            <button
              onClick={onClose}
              className="px-2 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20"
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
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
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
            <Field label="Zip"><Input value={form.zipcode} onChange={set("zipcode")} /></Field>
            <Field label="Country">
              <Select value={form.country} onChange={set("country")}>
                <option value="US">US</option>
                <option value="Canada">Canada</option>
              </Select>
            </Field>
            <div />
          </div>

          {/* Pricing / misc */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Part Price ($)"><Input type="number" value={form.partPrice} onChange={set("partPrice")} /></Field>
            <Field label="Warranty (days)"><Input type="number" value={form.warranty} onChange={set("warranty")} /></Field>
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

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/20">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md bg-white/10 border border-white/20 hover:bg-white/20">Close</button>
          <button
            onClick={async () => {
              if (!validate()) return;

              const firstName = localStorage.getItem("firstName") || "System";
              const orderNo = order?.orderNo;

              const changedFields = {};
              Object.keys(form).forEach((key) => {
                const oldVal = (initial?.[key] ?? "").toString().trim();
                const newVal = (form[key] ?? "").toString().trim();
                if (oldVal !== newVal) {
                  changedFields[key] = form[key];
                }
              });

              // 🧹 Frontend cleanup for derived shipping fields
              if (changedFields.ownShipping !== undefined) {
                const oldOwn = (initial?.ownShipping ?? extractOwn(initial?.shippingDetails) ?? "").toString().trim();
                const newOwn = String(form.ownShipping ?? "").trim();
                if (oldOwn === newOwn) delete changedFields.ownShipping;
              }
              if (changedFields.yardShipping !== undefined) {
                const oldYard = (initial?.yardShipping ?? extractYard(initial?.shippingDetails) ?? "").toString().trim();
                const newYard = String(form.yardShipping ?? "").trim();
                if (oldYard === newYard) delete changedFields.yardShipping;
              }

              if (Object.keys(changedFields).length === 0) {
                setToast("No changes detected.");
                return;
              }

              // Add derived fields if relevant
              if (changedFields.street || changedFields.city || changedFields.state || changedFields.zipcode) {
                changedFields.address = `${form.street} ${form.city} ${form.state} ${form.zipcode}`.trim();
              }

              if (changedFields.ownShipping || changedFields.yardShipping) {
                changedFields.shippingDetails = [
                  String(form.ownShipping || "").trim() !== "" ? `Own shipping: ${form.ownShipping}` : "",
                  String(form.yardShipping || "").trim() !== "" ? `Yard shipping: ${form.yardShipping}` : "",
                ]
                  .filter(Boolean)
                  .join(" | ");
              }

              try {
                await API.patch(
                  `/orders/${encodeURIComponent(order?.orderNo)}/additionalInfo/${yardIndex + 1}`,
                  changedFields,
                  { params: { firstName } }
                );

                setToast(`Yard ${yardIndex + 1} details updated successfully!`);
              } catch (err) {
                console.error("Error updating yard:", err);
                setToast(err?.response?.data?.message || "Failed to update yard details");
              }

            }}

            className="px-3 py-1.5 rounded-md bg-white text-[#04356d] border border-white/20 hover:bg-white/90"
          >
            Save
          </button>
        </footer>
        <Toast
          message={toast}
          onClose={() => {
            setToast("");
            onClose();
            window.location.reload();
          }}
        />
      </div>
    </div>
  );
}
