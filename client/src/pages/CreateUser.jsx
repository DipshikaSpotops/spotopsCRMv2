import React, { useState } from "react";
import API from "../api";
import { FaEye, FaEyeSlash } from "react-icons/fa";


const ROLES = ["Admin", "Sales", "Support"];

export default function CreateUser() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "",
    password: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [showPassword, setShowPassword] = useState(false);
  
  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const validate = () => {
    if (!form.firstName.trim()) return "First name is required.";
    if (!form.lastName.trim()) return "Last name is required.";
    if (!form.email.trim()) return "Email is required.";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return "Enter a valid email.";
    if (!form.role) return "Role is required.";
    if (!form.password || form.password.length < 6)
      return "Password must be at least 6 characters.";
    return null;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });
    const err = validate();
    if (err) {
      setMessage({ type: "error", text: err });
      return;
    }
    setSubmitting(true);
    try {
      // Adjust base URL as needed (env var recommended)
      const { data } = await API.post("/users", form);
      setMessage({ type: "success", text: `User ${data.firstName} created.` });
      setForm({
        firstName: "",
        lastName: "",
        email: "",
        role: "",
        password: "",
      });
    } catch (e) {
      const text =
        e?.response?.status === 409
          ? "Email already exists."
          : e?.response?.data?.message || "Failed to create user.";
      setMessage({ type: "error", text });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen p-6 flex items-start justify-center">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-xl rounded-lg bg-white/15 backdrop-blur-lg border border-white/30 shadow-md hover:shadow-xl transition-all duration-300 p-6 space-y-5"
      >
        <h1 className="text-2xl font-semibold text-white">Create User</h1>

        {message.text ? (
          <div
            className={`p-3 rounded ${
              message.type === "success"
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {message.text}
          </div>
        ) : null}
{/*  */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-white/90 mb-1">First Name</label>
            <input
              name="firstName"
              value={form.firstName}
              onChange={onChange}
              className="w-full rounded border border-white/40 bg-white/90 text-slate-900 placeholder-slate-500 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3b89bf]"
              placeholder="Jane"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-white/90 mb-1">Last Name</label>
            <input
              name="lastName"
              value={form.lastName}
              onChange={onChange}
              className="w-full rounded border border-white/40 bg-white/90 text-slate-900 placeholder-slate-500 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3b89bf]"
              placeholder="Doe"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-white/90 mb-1">Email</label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={onChange}
            className="w-full rounded border border-white/40 bg-white/90 text-slate-900 placeholder-slate-500 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3b89bf]"
            placeholder="jane@example.com"
            required
          />
        </div>

        <div>
          <label className="block text-sm text-white/90 mb-1">Role</label>
          <select
            name="role"
            value={form.role}
            onChange={onChange}
            className="w-full rounded border border-white/40 bg-white text-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3b89bf]"
            required
          >
            <option value="">Select role</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div>
        <label className="block text-sm text-white/90 mb-1">Password</label>
        <div className="relative">
            <input
            type={showPassword ? "text" : "password"}
            name="password"
            value={form.password}
            onChange={onChange}
            className="w-full rounded border border-white/40 bg-white/90 text-slate-900 placeholder-slate-500 px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-[#3b89bf]"
            placeholder="•••••••"
            required
            />
            <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500"
            >
            {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
        </div>
        
        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#04356d] hover:bg-[#3b89bf] text-white font-medium px-4 py-2 rounded disabled:opacity-60"
          >
            {submitting ? "Creating..." : "Create"}
          </button>
        </div>
        </div>
      </form>
    </div>
  );
}
