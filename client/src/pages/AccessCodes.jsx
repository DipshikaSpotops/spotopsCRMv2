import React, { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectRole } from "../store/authSlice";
import API from "../api";

function useEffectiveRole() {
  const fromRedux = useSelector(selectRole);
  return useMemo(() => {
    if (fromRedux) return fromRedux;
    try {
      const raw = localStorage.getItem("auth");
      if (raw) return JSON.parse(raw)?.user?.role || undefined;
    } catch {
      /* ignore */
    }
    return localStorage.getItem("role") || undefined;
  }, [fromRedux]);
}

function parseEmails(raw) {
  const set = new Set();
  for (const line of String(raw || "").split(/[\n,;]+/)) {
    const e = line.trim().toLowerCase();
    if (e && e.includes("@")) set.add(e);
  }
  return [...set];
}

export default function AccessCodes() {
  const role = useEffectiveRole();
  const [emailsText, setEmailsText] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [loadingDebug, setLoadingDebug] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [results, setResults] = useState(null);

  if (role != null && role !== "Admin") {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });
    setResults(null);

    const emails = parseEmails(emailsText);
    if (emails.length === 0) {
      setMessage({ type: "error", text: "Enter at least one valid email." });
      return;
    }

    setSubmitting(true);
    try {
      const invites = emails.map((email) => ({
        email,
        sendEmail,
      }));
      const { data } = await API.post("/auth/admin/access-invites", { invites });
      const rows = data.results || [];
      setResults(rows);
      const mailFailures = rows.filter((r) => r.emailError);
      if (mailFailures.length) {
        const first = mailFailures[0];
        alert(
          `Email was not delivered for ${mailFailures.length} invite(s).\n\n` +
            `${first?.email || ""}\n${first?.emailError || ""}\n\n` +
            `If a code appears in the results table below, copy it manually. ` +
            `Also check the backend console for [access-code-mail] and Gmail Spam.`
        );
      }
      const failed = rows.filter((r) => r.error || r.emailError).length;
      setMessage({
        type: failed ? "error" : "success",
        text:
          failed > 0
            ? `Issued with ${failed} issue(s). Review the table below.`
            : `Sent ${rows.length} invite(s).`,
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.message || err.message || "Request failed.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onMailDebug = async () => {
    setLoadingDebug(true);
    try {
      const { data } = await API.get("/auth/admin/access-mail-debug");
      alert(
        `Access-code mail setup (read carefully):\n\n` +
          `Brand tab: ${data.brand}\n` +
          `Sends FROM mailbox: ${data.sendFromMailbox || "—"}\n` +
          `App password set: ${data.hasAppPassword ? `yes (${data.appPasswordLength} chars)` : "NO — fix .env"}\n` +
          `Emails go TO (only these): ${(data.notifyTo || []).join(", ") || "— set ACCESS_CODE_NOTIFY_TO"}\n` +
          `Transport: ${data.transport}\n` +
          `SMTP verify: ${data.smtpVerified === true ? "OK" : data.smtpVerified === false ? "FAILED" : "—"}\n` +
          `${data.verifyError ? `Verify error: ${data.verifyError}\n` : ""}\n` +
          `${data.note || ""}`
      );
    } catch (err) {
      alert(err.response?.data?.message || err.message || "Debug failed");
    } finally {
      setLoadingDebug(false);
    }
  };

  const onTestSmtp = async () => {
    setTestingSmtp(true);
    try {
      const { data } = await API.post("/auth/admin/test-access-smtp");
      if (data?.ok) {
        alert(
          `Test email sent.\n\nCheck inboxes for: ${data.to || "ACCESS_CODE_NOTIFY_TO"}\nBrand: ${data.brand || "—"} (same mail account as order emails for that tab)\nSMTP login: ${data.smtpLogin || ""}\nMessage id: ${data.messageId || "n/a"}`
        );
      } else {
        alert(data?.message || "Test failed");
      }
    } catch (err) {
      alert(err.response?.data?.message || err.message || "Test request failed");
    } finally {
      setTestingSmtp(false);
    }
  };

  return (
    <div className="min-h-screen p-6 flex items-start justify-center">
      <div className="w-full max-w-2xl space-y-6">
        <form
          onSubmit={onSubmit}
          className="rounded-lg bg-white/15 backdrop-blur-lg border border-white/30 shadow-md p-6 space-y-5"
        >
          <div>
            <h1 className="text-2xl font-semibold text-white">Access codes</h1>
            <p className="text-sm text-white/70 mt-1">
              List the <strong>CRM user login email</strong> each code is for (one per line). That
              user must sign in with that exact email; the code only works for them. When
              &quot;Send email&quot; is on, the message goes only to{" "}
              <code className="text-cyan-200">ACCESS_CODE_NOTIFY_TO</code> in server{" "}
              <code className="text-cyan-200">.env</code> (e.g. Dipsikha + admin) — not to the
              user. Requires <code className="text-cyan-200">APP_ACCESS_GATE_ENABLED=true</code>{" "}
              and Gmail <code className="text-cyan-200">SERVICE_EMAIL</code> /{" "}
              <code className="text-cyan-200">SERVICE_PASS</code> (App Password).
            </p>
          </div>

          {message.text && (
            <div
              className={`p-3 rounded text-sm ${
                message.type === "success"
                  ? "bg-green-100 text-green-900"
                  : "bg-red-100 text-red-900"
              }`}
            >
              {message.text}
            </div>
          )}

          <div>
            <label className="block text-sm text-white/90 mb-2">Emails (one per line, or comma-separated)</label>
            <textarea
              className="w-full min-h-[140px] rounded-md bg-gray-900/80 border border-white/20 text-white px-3 py-2 text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-accentPink"
              placeholder={"user1@company.com\nuser2@company.com"}
              value={emailsText}
              onChange={(e) => setEmailsText(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-white text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="rounded border-white/30"
            />
            Email code to NOTIFY list only (<code className="text-cyan-200 text-xs">ACCESS_CODE_NOTIFY_TO</code>)
          </label>

          <div className="flex flex-wrap gap-3 items-center">
            <button
              type="submit"
              disabled={submitting}
              className="bg-accentPink text-white px-4 py-2 rounded-md hover:bg-pink-600 transition disabled:opacity-60"
            >
              {submitting ? "Working…" : "Issue invites"}
            </button>
            <button
              type="button"
              disabled={testingSmtp}
              onClick={onTestSmtp}
              className="bg-slate-600 text-white px-4 py-2 rounded-md hover:bg-slate-500 transition disabled:opacity-60 text-sm"
            >
              {testingSmtp ? "Sending test…" : "Send test email (NOTIFY list only)"}
            </button>
            <button
              type="button"
              disabled={loadingDebug}
              onClick={onMailDebug}
              className="bg-slate-700 text-white px-4 py-2 rounded-md hover:bg-slate-600 transition disabled:opacity-60 text-sm"
            >
              {loadingDebug ? "Loading…" : "Check SMTP setup (no email sent)"}
            </button>
          </div>
        </form>

        {results && results.length > 0 && (
          <div className="rounded-lg bg-white/15 backdrop-blur-lg border border-white/30 shadow-md overflow-hidden">
            <h2 className="text-lg font-semibold text-white p-4 border-b border-white/20">Results</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-white/90">
                <thead className="bg-black/20 text-white/70">
                  <tr>
                    <th className="p-3 font-medium">Email</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Code / note</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-t border-white/10">
                      <td className="p-3 font-mono text-xs">{r.email}</td>
                      <td className="p-3">
                        {r.error
                          ? "Invalid"
                          : r.emailed
                            ? "Emailed"
                            : r.emailError
                              ? "Email failed"
                              : "Created"}
                      </td>
                      <td className="p-3 font-mono text-xs break-all">
                        {r.error && <span className="text-red-300">{r.error}</span>}
                        {r.emailError && (
                          <span className="text-amber-200">{r.emailError}</span>
                        )}
                        {r.code && <span className="text-cyan-200">{r.code}</span>}
                        {!r.code && !r.error && !r.emailError && r.emailed && "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
