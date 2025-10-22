import { useEffect, useState } from "react";
import axios from "axios";
import Field from "../../ui/Field";
import Input from "../../ui/Input";
import Select from "../../ui/Select";

export default function YardAddModal({ open, onClose, onSubmit }) {
  const [yards, setYards] = useState([]);
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
    stockNo: "",
  });
  const [errors, setErrors] = useState({});
  const [filterText, setFilterText] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Load yards from backend and sort A→Z
  useEffect(() => {
    if (open) {
      setErrors({});
      fetch("/api/yards")
        .then((res) => res.json())
        .then((data) => {
          const sorted = data.sort((a, b) =>
            a.yardName.localeCompare(b.yardName, undefined, { sensitivity: "base" })
          );
          setYards(sorted);
        })
        .catch((err) => console.error("Failed to load yards", err));
    }
  }, [open]);

  // Auto-fill location from ZIP
  useEffect(() => {
    const zip = form.zipcode?.trim();
    if (!zip) return;

    if (zip.length === 5 && /^[0-9]+$/.test(zip)) {
      axios
        .get(`https://api.zippopotam.us/us/${zip}`)
        .then((res) => {
          const place = res.data.places[0];
          setForm((p) => ({
            ...p,
            city: place["place name"],
            state: place["state abbreviation"],
            country: res.data["country abbreviation"],
          }));
        })
        .catch(() => console.error("Invalid US ZIP"));
    }
  }, [form.zipcode]);

  const ownSet =
    String(form.ownShipping ?? "").trim() !== "" &&
    !Number.isNaN(Number(form.ownShipping));
  const yardSet =
    String(form.yardShipping ?? "").trim() !== "" &&
    !Number.isNaN(Number(form.yardShipping));

  const set = (k) => (ev) =>
    setForm((p) => ({
      ...p,
      [k]: ev.target.value,
    }));

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-xl shadow-2xl">
        <header className="flex items-center justify-between px-5 py-3 border-b border-white/20">
          <h3 className="text-lg font-semibold">Add New Yard</h3>
          <button
            onClick={onClose}
            className="px-2 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20"
          >
            ✕
          </button>
        </header>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Yard Dropdown — behaves like a searchable select */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Yard Name (Select or Add New)">
  <select
    className="w-full p-2 rounded-md text-white mb-2 bg-[#2b2d68] hover:bg-[#090c6c]"
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
          country: selected.country,
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
    <p className="text-xs text-red-200 mt-1">{errors.yardName}</p>
  )}
</Field>


            <Field label="Agent Name">
              <Input value={form.agentName} onChange={set("agentName")} />
              {errors.agentName && (
                <p className="text-xs text-red-200 mt-1">{errors.agentName}</p>
              )}
            </Field>

            <Field label="Yard Rating">
              <Input value={form.yardRating} onChange={set("yardRating")} />
              {errors.yardRating && (
                <p className="text-xs text-red-200 mt-1">{errors.yardRating}</p>
              )}
            </Field>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Phone">
              <Input value={form.phone} onChange={set("phone")} />
              {errors.phone && (
                <p className="text-xs text-red-200 mt-1">{errors.phone}</p>
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
              {errors.street && <p className="text-xs text-red-200">{errors.street}</p>}
            </Field>
            <Field label="City">
              <Input value={form.city} onChange={set("city")} />
              {errors.city && <p className="text-xs text-red-200">{errors.city}</p>}
            </Field>
            <Field label="State / Province">
              <Input value={form.state} onChange={set("state")} />
              {errors.state && <p className="text-xs text-red-200">{errors.state}</p>}
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Zip">
              <Input value={form.zipcode} onChange={set("zipcode")} />
              {errors.zipcode && <p className="text-xs text-red-200">{errors.zipcode}</p>}
            </Field>
            <Field label="Country">
              <Select value={form.country} onChange={set("country")}>
                <option value="US">US</option>
                <option value="Canada">Canada</option>
              </Select>
            </Field>
            <div />
          </div>

          {/* Price & misc */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Part Price ($)">
              <Input type="number" value={form.partPrice} onChange={set("partPrice")} />
              {errors.partPrice && <p className="text-xs text-red-200">{errors.partPrice}</p>}
            </Field>
            <Field label="Warranty (days)">
              <Input type="number" value={form.warranty} onChange={set("warranty")} />
            </Field>
            <Field label="Stock No.">
              <Input value={form.stockNo} onChange={set("stockNo")} />
            </Field>
          </div>

          {/* Own + Yard + Others */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Own Shipping ($)">
              <Input type="number" step="0.01" value={form.ownShipping} onChange={onOwnChange} disabled={yardSet} />
              {errors.ownShipping && <p className="text-xs text-red-200">{errors.ownShipping}</p>}
            </Field>
            <Field label="Yard Shipping ($)">
              <Input type="number" step="0.01" value={form.yardShipping} onChange={onYardChange} disabled={ownSet} />
              {errors.yardShipping && <p className="text-xs text-red-200">{errors.yardShipping}</p>}
            </Field>
            <Field label="Other Charges ($)">
              <Input type="number" step="0.01" value={form.others} onChange={set("others")} />
            </Field>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/20">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md bg-white/10 border border-white/20 hover:bg-white/20">
            Close
          </button>
          <button
            onClick={() => {
              if (!validate()) return;
              onSubmit({
                ...form,
                address: `${form.street} ${form.city} ${form.state} ${form.zipcode}`.trim(),
                shippingDetails: [
                  String(form.ownShipping || "").trim() !== "" ? `Own shipping: ${form.ownShipping}` : "",
                  String(form.yardShipping || "").trim() !== "" ? `Yard shipping: ${form.yardShipping}` : "",
                ].filter(Boolean).join(" | "),
              });
            }}
            className="px-3 py-1.5 rounded-md bg-white text-[#04356d] border border-white/20 hover:bg-white/90"
          >
            Submit
          </button>
        </footer>
      </div>
    </div>
  );
}
