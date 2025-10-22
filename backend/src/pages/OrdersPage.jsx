import { useState } from "react";
import MainLayout from "../layouts/MainLayout";
import NavbarForm from "../components/NavbarForm";

/* ===== Small building blocks ===== */
const Card = ({ title, actions, children }) => (
  <section className="rounded-xl border border-slate-200/70 bg-white/90 dark:bg-slate-900/70 dark:border-slate-700 shadow-sm">
    {(title || actions) && (
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <h3 className="font-semibold">{title}</h3>
        <div className="flex gap-2">{actions}</div>
      </header>
    )}
    <div className="p-4">{children}</div>
  </section>
);

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
    <div className="mt-1">{children}</div>
  </label>
);

const Input = (p) => (
  <input
    {...p}
    className={
      "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 " +
      (p.className || "")
    }
  />
);
const Select = (p) => (
  <select
    {...p}
    className={
      "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 " +
      (p.className || "")
    }
  />
);

/* ===== Pretty header stats ===== */
const Stat = ({ label, value, tone = "sky" }) => (
  <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-4 border border-slate-200/70 dark:border-slate-700">
    <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    <div className={`mt-1 text-xl font-semibold text-${tone}-600 dark:text-${tone}-400`}>{value}</div>
  </div>
);

/* ===== Timeline ===== */
const TimelineItem = ({ by, when, text }) => (
  <li className="relative">
    <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-sky-600 ring-2 ring-white dark:ring-slate-900" />
    <div className="rounded border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/70 p-3">
      <div className="text-xs text-slate-500 dark:text-slate-400">{by} · {when}</div>
      <div className="mt-1 font-medium">{text}</div>
    </div>
  </li>
);

export default function OrderPage() {
  const [tab, setTab] = useState("Customer");
  const timeline = [
    { by: "Mark", when: "7 Jul 2025 09:08", text: "Order placed" },
    { by: "Ashley", when: "7 Jul 2025 09:18", text: "Customer approved" },
    { by: "Suzanne", when: "7 Jul 2025 10:42", text: "Moved to Yard Processing" },
  ];

  return (
    <>
        <NavbarForm />
      {/* Title + quick stats */}
      <div className="mb-6">
        <div className="flex items-end justify-between gap-4">
          <h1 className="text-2xl font-semibold">Order · 50STARS4956</h1>
          <div className="hidden md:flex gap-2">
            <span className="px-2.5 py-1 rounded-full text-amber-700 bg-amber-50 dark:text-amber-200 dark:bg-amber-900/30 text-xs">
              Yard Processing
            </span>
            <span className="px-2.5 py-1 rounded-full text-sky-700 bg-sky-50 dark:text-sky-200 dark:bg-sky-900/30 text-xs">
              ETA 2–3 days
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <Stat label="Sales Agent" value="Mark" />
          <Stat label="Quoted" value="$365" tone="emerald" />
          <Stat label="Est. GP" value="$95" tone="indigo" />
          <Stat label="Tax" value="Included" tone="violet" />
        </div>
      </div>

      {/* 3-column layout */}
      <div className="grid grid-cols-12 gap-6">
        {/* LEFT: timeline */}
        <aside className="col-span-12 xl:col-span-3">
          <div className="sticky top-20 space-y-6">
            <Card title="Order History">
              <ul className="relative pl-6 space-y-5">
                <span className="absolute left-2 top-1 bottom-0 w-px bg-slate-300 dark:bg-slate-600" />
                {timeline.map((t, i) => <TimelineItem key={i} {...t} />)}
              </ul>
            </Card>

            <Card title="Quick Actions">
              <div className="grid grid-cols-2 gap-2">
                <button className="px-3 py-2 rounded-md border hover:bg-slate-50 dark:hover:bg-slate-800">Send PO</button>
                <button className="px-3 py-2 rounded-md border hover:bg-slate-50 dark:hover:bg-slate-800">Void Label</button>
                <button className="px-3 py-2 rounded-md border hover:bg-slate-50 dark:hover:bg-slate-800">Refund</button>
                <button className="px-3 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-500">Save</button>
              </div>
            </Card>
          </div>
        </aside>

        {/* CENTER: form */}
        <section className="col-span-12 xl:col-span-6 space-y-6">
          <Card title="Order Meta">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Order Date"><Input placeholder="2025-07-07 15:07" /></Field>
              <Field label="Sales Agent"><Input placeholder="Mark" /></Field>
            </div>
          </Card>

          <Card
            title="Edit Order"
            actions={
              <div className="flex gap-2 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
                {["Customer", "Part", "Pricing", "Shipping"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-1.5 rounded-md text-sm transition ${
                      tab === t
                        ? "bg-white dark:bg-slate-900 shadow border border-slate-200 dark:border-slate-700"
                        : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            }
          >
            {/* CUSTOMER TAB */}
            {tab === "Customer" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="First Name"><Input placeholder="Bryan" /></Field>
                <Field label="Last Name"><Input placeholder="Egan" /></Field>
                <Field label="Email"><Input type="email" placeholder="seabeesauto@aol.com" /></Field>
                <Field label="Phone"><Input placeholder="4074785400" /></Field>
                <Field label="Billing Address"><Input placeholder="1075 North St, Longwood, FL, 32750, US" /></Field>
                <Field label="Shipping Address"><Input placeholder="1075 North St, Longwood, FL, 32750, US" /></Field>
              </div>
            )}

            {/* PART TAB */}
            {tab === "Part" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Make"><Input placeholder="Cadillac" /></Field>
                <Field label="Model"><Input placeholder="SRX" /></Field>
                <Field label="Year"><Input type="number" placeholder="2016" /></Field>
                <Field label="Part Required"><Input placeholder="ABS Module" /></Field>
                <Field label="Description"><Input placeholder="Assembly, adaptive cruise (opt KSG) / 3.6L" /></Field>
                <Field label="Warranty (days)"><Input type="number" placeholder="365" /></Field>
                <Field label="VIN"><Input placeholder="…" /></Field>
                <Field label="Part No."><Input placeholder="…" /></Field>
              </div>
            )}

            {/* PRICING TAB */}
            {tab === "Pricing" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Quoted Price ($)"><Input type="number" placeholder="365" /></Field>
                <Field label="Yard Price ($)"><Input type="number" placeholder="270" /></Field>
                <Field label="Est. Shipping ($)"><Input type="number" placeholder="30" /></Field>
                <Field label="Sales Tax (%)"><Input type="number" placeholder="Included" /></Field>
                <Field label="Est. GP ($)"><Input readOnly placeholder="95" /></Field>
                <Field label="Actual GP ($)"><Input readOnly placeholder="—" /></Field>
              </div>
            )}

            {/* SHIPPING TAB */}
            {tab === "Shipping" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Order Status">
                  <Select defaultValue="Yard Processing">
                    {["Placed","Customer approved","Yard Processing","In Transit","Escalation","Order Fulfilled","Order Cancelled","Dispute","Refunded","Voided"].map(s=>(
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Last 4 Digits"><Input placeholder="1234" /></Field>
                <label className="inline-flex items-center gap-2 mt-2">
                  <input type="checkbox" className="h-4 w-4" /> <span>Escalation</span>
                </label>
                <Field label="Attention"><Input placeholder="Notes…" /></Field>
              </div>
            )}
          </Card>

          <Card title="Yards">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600 dark:text-slate-300">Yard 1: Benzeen Auto Parts, Los Angeles, CA</div>
              <button className="px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700">
                Edit
              </button>
            </div>
            <button className="mt-4 w-full rounded-md border border-dashed py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
              + Add Yard
            </button>
          </Card>
        </section>

        {/* RIGHT: sale note & comments */}
        <aside className="col-span-12 xl:col-span-3">
          <div className="sticky top-20 space-y-6">
            <Card title="Sale Note">
              <textarea
                className="w-full h-32 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Programming required? Shipping notes? …"
              />
            </Card>

            <Card
              title="Comments"
              actions={<button className="px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-500 text-sm">Add</button>}
            >
              <div className="space-y-4">
                <Comment name="Suzanne" time="7 Jul, 10:42" text="Called Benzeen; PO sent; refund processing." />
                <Comment name="Katherine" time="9 Jul, 12:05" text="PO confirmed via mail." />
                <Comment name="Richard" time="11 Jul, 12:16" text="Yard 2 doesn’t have the part." />
              </div>
            </Card>

            <Card title="Tasks">
              <div className="space-y-2">
                <TaskRow title="Confirm tracking with yard" due="Today" />
                <TaskRow title="Update customer via email" due="Tomorrow" />
              </div>
              <button className="mt-3 w-full px-3 py-2 rounded-md border hover:bg-slate-50 dark:hover:bg-slate-800">
                + Create Task
              </button>
            </Card>
          </div>
        </aside>
      </div>
    </>
  );
}

/* ===== Small right-panel items ===== */
function Comment({ name, time, text }) {
  return (
    <div className="flex gap-3">
      <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700 grid place-items-center font-semibold">
        {name[0]}
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium">
          {name} <span className="text-slate-500">• {time}</span>
        </div>
        <div className="mt-1 text-slate-700 dark:text-slate-200">{text}</div>
      </div>
    </div>
  );
}
function TaskRow({ title, due }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-slate-500">Due: {due}</div>
      </div>
      <input type="checkbox" className="h-4 w-4" />
    </div>
  );
}
