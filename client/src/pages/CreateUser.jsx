import React, { useEffect, useState } from "react";
import API from "../api";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import PermissionsEditor from "../components/PermissionsEditor";
import { permissionsForStorage } from "../../../shared/constants/userPermissions.js";

const ROLES = ["Admin", "Sales", "Support"];

export default function CreateUser() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "",
    team: "",
    password: "",
  });
  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [onAttendanceRoster, setOnAttendanceRoster] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await API.get("teams");
        if (mounted) {
          setTeams(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        console.error("Failed to load teams:", e);
      } finally {
        if (mounted) setLoadingTeams(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => {
      const next = { ...f, [name]: value };
      if (name === "role" && value === "Admin") {
        next.team = "";
        setOnAttendanceRoster(false);
      } else if (name === "role" && value) {
        setOnAttendanceRoster(true);
      }
      return next;
    });
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
      const payload = { ...form };
      if (!payload.team) delete payload.team;
      payload.permissions = permissionsForStorage(selectedPermissions);
      if (form.role !== "Admin") {
        payload.onAttendanceRoster = onAttendanceRoster;
      }
      const { data } = await API.post("/users", payload);
      setMessage({ type: "success", text: `User ${data.firstName} created.` });
      setForm({
        firstName: "",
        lastName: "",
        email: "",
        role: "",
        team: "",
        password: "",
      });
      setSelectedPermissions([]);
      setOnAttendanceRoster(true);
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

          <div className="mt-3">
            <span className="block text-sm text-white/90 mb-2">Permissions</span>
            <PermissionsEditor
              value={selectedPermissions}
              onChange={setSelectedPermissions}
            />
          </div>

          {form.role && form.role !== "Admin" && (
            <label className="mt-3 flex items-center gap-2 text-sm text-white/90 cursor-pointer">
              <input
                type="checkbox"
                checked={onAttendanceRoster}
                onChange={(e) => setOnAttendanceRoster(e.target.checked)}
                className="h-4 w-4 rounded border-white/40"
              />
              <span>Include on attendance &amp; authorization roster</span>
            </label>
          )}
        </div>

        {form.role !== "Admin" && (
        <div>
          <label className="block text-sm text-white/90 mb-1">Team</label>
          <select
            name="team"
            value={form.team}
            onChange={onChange}
            disabled={loadingTeams}
            className="w-full rounded border border-white/40 bg-white text-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3b89bf] disabled:opacity-60"
          >
            <option value="">
              {loadingTeams ? "Loading teams..." : "Select team"}
            </option>
            {teams.map((t) => (
              <option key={t._id} value={t.teamName}>
                {t.teamName}
              </option>
            ))}
          </select>
        </div>
        )}

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
