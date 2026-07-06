import React, { useState } from "react";
import API from "../api";

export default function CreateTeam() {
  const [teamName, setTeamName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const onSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });

    const trimmed = teamName.trim();
    if (!trimmed) {
      setMessage({ type: "error", text: "Team name is required." });
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await API.post("/teams", { teamName: trimmed });
      setMessage({ type: "success", text: `Team "${data.teamName}" created.` });
      setTeamName("");
    } catch (err) {
      const text =
        err?.response?.status === 409
          ? "Team name already exists."
          : err?.response?.data?.message || "Failed to create team.";
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
        <h1 className="text-2xl font-semibold text-white">Create Team</h1>

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

        <div>
          <label className="block text-sm text-white/90 mb-1">Team Name</label>
          <input
            name="teamName"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            className="w-full rounded border border-white/40 bg-white/90 text-slate-900 placeholder-slate-500 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3b89bf]"
            placeholder="Enter team name"
            required
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-[#04356d] hover:bg-[#3b89bf] text-white font-medium px-4 py-2 rounded disabled:opacity-60"
        >
          {submitting ? "Saving..." : "Save"}
        </button>
      </form>
    </div>
  );
}
