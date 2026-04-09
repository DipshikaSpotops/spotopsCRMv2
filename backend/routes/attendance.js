// routes/attendance.js — IST calendar day + active sales users list (keep in sync with client activeAttendanceUsers.js)
import express from "express";
import moment from "moment-timezone";
import Attendance from "../models/Attendance.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
const IST = "Asia/Kolkata";
const DALLAS = "America/Chicago";
const EDITOR_EMAIL = "50starsauto110@gmail.com";

/** @type {string[]} Same display order as client ACTIVE_ATTENDANCE_USER_LIST */
const ACTIVE_ATTENDANCE_NAMES = [
  "Nik",
  "Tristan",
  "James",
  "Mark",
  "Richard",
  "Ashley",
  "Max",
  "Peter",
  "Jessie",
  "Guru",
  "Suzanne",
  "Tony",
  "Dipsikha",
];

function canonicalFirstName(name) {
  const raw = String(name || "").trim();
  if (!raw) return null;
  const firstToken = raw.split(/\s+/)[0];
  const lower = firstToken.toLowerCase();
  const key = lower === "dipshika" ? "dipsikha" : lower;
  return (
    ACTIVE_ATTENDANCE_NAMES.find((a) => a.toLowerCase() === key) ||
    null
  );
}

/** Shift-attendance date key (matches mark-present / today logic). */
function attendanceShiftDateKeyFromInstant(m) {
  const ist = m.clone().tz(IST);
  const mins = ist.hour() * 60 + ist.minute();
  // After midnight through 04:30 IST → still the previous evening’s shift day.
  if (mins < 4 * 60 + 30) return ist.clone().subtract(1, "day").format("YYYY-MM-DD");
  return ist.format("YYYY-MM-DD");
}

function todayDateKeyIST() {
  return attendanceShiftDateKeyFromInstant(moment().tz(IST));
}

/**
 * One Dallas calendar day → one shift row dateKey (night 6:30 PM–4:30 AM IST rolls up to that shift’s day).
 */
function attendanceDateKeysForSingleDallasDay(startIso) {
  const d = moment(startIso).tz(DALLAS);
  if (!d.isValid()) return [];
  const noonDallas = d.clone().startOf("day").hour(12).minute(0).second(0);
  const istYmd = noonDallas.clone().tz(IST).format("YYYY-MM-DD");
  const anchor = moment.tz(`${istYmd} 18:30`, "YYYY-MM-DD HH:mm", IST);
  return [attendanceShiftDateKeyFromInstant(anchor)];
}

function sameDallasCalendarDay(startIso, endIso) {
  const a = moment(startIso).tz(DALLAS).format("YYYY-MM-DD");
  const b = moment(endIso).tz(DALLAS).format("YYYY-MM-DD");
  return a && b && a === b;
}

/** True when start/end fall in the same Dallas calendar month (e.g. whole April). */
function sameDallasYearMonth(startIso, endIso) {
  const s = moment(startIso).tz(DALLAS);
  const e = moment(endIso).tz(DALLAS);
  return s.isValid() && e.isValid() && s.format("YYYY-MM") === e.format("YYYY-MM");
}

/**
 * Date keys for API range: uses shift rollup (not raw IST calendar) so one Dallas “day” doesn’t duplicate Apr 9 + Apr 10 rows.
 */
function attendanceDateKeysForWallRange(startIso, endIso) {
  const t0 = moment(startIso);
  const t1 = moment(endIso);
  if (!t0.isValid() || !t1.isValid()) return [];
  let a = t0.clone();
  let b = t1.clone();
  if (b.isBefore(a)) [a, b] = [b, a];

  if (sameDallasCalendarDay(a, b)) {
    return attendanceDateKeysForSingleDallasDay(a);
  }

  const set = new Set();
  const endLimit = b.clone().add(1, "minute");
  let cur = a.clone();
  while (cur.isBefore(endLimit)) {
    set.add(attendanceShiftDateKeyFromInstant(cur));
    cur.add(6, "hours");
  }
  set.add(attendanceShiftDateKeyFromInstant(b));
  let keys = Array.from(set).sort();
  // End-of-month wall clock can roll to the next IST calendar day (e.g. May 1 key in an “April”
  // Dallas range). For a single selected month, only include shift keys in that month (YYYY-MM).
  if (sameDallasYearMonth(a, b)) {
    const ym = a.clone().tz(DALLAS).format("YYYY-MM");
    keys = keys.filter((k) => String(k).startsWith(`${ym}-`));
  }
  return keys;
}

function ensureChangeLog(doc) {
  if (!doc) return;
  if (!Array.isArray(doc.changeLog)) doc.changeLog = [];
}

function buildLogEntry(req, action, prevLogin, prevLogout, newLogin, newLogout) {
  return {
    at: new Date(),
    editorUserId: req.user?.id ? String(req.user.id) : "",
    editorEmail: String(req.user?.email || ""),
    editorFirstName: String(req.user?.firstName || ""),
    editorRole: String(req.user?.role || ""),
    action,
    previousLoginAt: prevLogin ?? null,
    previousLogoutAt: prevLogout ?? null,
    newLoginAt: newLogin ?? null,
    newLogoutAt: newLogout ?? null,
  };
}

function canManageAttendance(user) {
  const roleOk = user?.role === "Admin";
  const emailOk = String(user?.email || "").trim().toLowerCase() === EDITOR_EMAIL;
  return roleOk || emailOk;
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const isAdmin = canManageAttendance(req.user);
    const start = String(req.query.start || "").trim();
    const end = String(req.query.end || "").trim();

    if (start && end) {
      const dateKeys = attendanceDateKeysForWallRange(start, end);
      if (dateKeys.length === 0) {
        return res.json({
          mode: "range",
          start,
          end,
          dateKeys: [],
          activeUsers: ACTIVE_ATTENDANCE_NAMES,
          rows: [],
        });
      }

      const docs = await Attendance.find({ dateKey: { $in: dateKeys } }).lean();
      const byKeyName = new Map();
      for (const d of docs) {
        const dk = String(d.dateKey ?? "").trim();
        const fn = String(d.firstName ?? "").trim();
        if (!dk || !fn) continue;
        byKeyName.set(`${dk}|${fn}`, d);
      }

      const merged = [];
      for (const dateKey of dateKeys) {
        for (const firstName of ACTIVE_ATTENDANCE_NAMES) {
          const doc = byKeyName.get(`${dateKey}|${firstName.trim()}`);
          const base = {
            dateKey,
            firstName,
            loginAt: doc?.loginAt || null,
            logoutAt: doc?.logoutAt || null,
          };
          if (isAdmin) {
            merged.push({
              ...base,
              changeLog: Array.isArray(doc?.changeLog) ? doc.changeLog : [],
            });
          } else {
            merged.push(base);
          }
        }
      }

      return res.json({
        mode: "range",
        start,
        end,
        dateKeys,
        activeUsers: ACTIVE_ATTENDANCE_NAMES,
        rows: merged,
      });
    }

    let dateKey = (req.query.date || "").trim();
    if (!dateKey) dateKey = todayDateKeyIST();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return res.status(400).json({ message: "Invalid date; use YYYY-MM-DD" });
    }

    const rows = await Attendance.find({ dateKey }).lean();
    const byName = new Map(
      rows.map((r) => [String(r.firstName ?? "").trim(), r]).filter(([k]) => k)
    );

    const merged = ACTIVE_ATTENDANCE_NAMES.map((firstName) => {
      const doc = byName.get(String(firstName).trim());
      const base = {
        firstName,
        dateKey,
        loginAt: doc?.loginAt || null,
        logoutAt: doc?.logoutAt || null,
      };
      if (isAdmin) {
        return {
          ...base,
          changeLog: Array.isArray(doc?.changeLog) ? doc.changeLog : [],
        };
      }
      return base;
    });

    res.json({
      mode: "day",
      dateKey,
      activeUsers: ACTIVE_ATTENDANCE_NAMES,
      rows: merged,
    });
  } catch (e) {
    console.error("[attendance] GET error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/mark-present", requireAuth, async (req, res) => {
  try {
    const canonical = canonicalFirstName(req.user?.firstName);
    if (!canonical) {
      return res.status(403).json({
        message: "Your account is not in the attendance roster for Mark Present.",
      });
    }

    const dateKey = todayDateKeyIST();
    const now = new Date();

    let doc = await Attendance.findOne({ dateKey, firstName: canonical });
    if (doc?.loginAt) {
      return res.status(200).json({
        message: "Already marked present for today.",
        record: doc.toObject(),
      });
    }

    const prevLogin = doc?.loginAt ?? null;
    const prevLogout = doc?.logoutAt ?? null;
    if (!doc) {
      doc = new Attendance({ dateKey, firstName: canonical, changeLog: [] });
    }
    ensureChangeLog(doc);
    doc.loginAt = now;
    doc.changeLog.push(
      buildLogEntry(
        req,
        "self_mark_present",
        prevLogin,
        prevLogout,
        doc.loginAt,
        doc.logoutAt
      )
    );
    await doc.save();

    res.json({ message: "Marked present.", record: doc.toObject() });
  } catch (e) {
    console.error("[attendance] mark-present error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/logout", requireAuth, async (req, res) => {
  try {
    const canonical = canonicalFirstName(req.user?.firstName);
    if (!canonical) {
      return res.status(200).json({ message: "No attendance roster user; skipped." });
    }

    const now = new Date();

    const doc = await Attendance.findOne({
      firstName: canonical,
      loginAt: { $ne: null },
    }).sort({ loginAt: -1 });
    if (!doc || !doc.loginAt) {
      return res.status(200).json({ message: "No login record; nothing to update." });
    }

    const prevLogin = doc.loginAt;
    const prevLogout = doc.logoutAt;
    ensureChangeLog(doc);
    doc.logoutAt = now;
    doc.changeLog.push(
      buildLogEntry(
        req,
        "self_logout",
        prevLogin,
        prevLogout,
        doc.loginAt,
        doc.logoutAt
      )
    );
    await doc.save();

    res.json({ message: "Logout time saved.", record: doc.toObject() });
  } catch (e) {
    console.error("[attendance] logout error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/admin/entry", requireAuth, async (req, res) => {
  try {
    if (!canManageAttendance(req.user)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const dateKey = String(req.body?.dateKey || "").trim();
    const firstName = canonicalFirstName(req.body?.firstName);
    const action = String(req.body?.action || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return res.status(400).json({ message: "Invalid dateKey; use YYYY-MM-DD" });
    }
    if (!firstName) {
      return res.status(400).json({ message: "Invalid firstName" });
    }
    if (!["markPresentNow", "markLogoutNow", "clear"].includes(action)) {
      return res.status(400).json({ message: "Invalid action" });
    }

    const now = new Date();
    let doc = await Attendance.findOne({ dateKey, firstName });
    const prevLogin = doc?.loginAt ?? null;
    const prevLogout = doc?.logoutAt ?? null;
    if (!doc) {
      doc = new Attendance({ dateKey, firstName, changeLog: [] });
    }
    ensureChangeLog(doc);

    let logAction = "admin_clear";
    if (action === "markPresentNow") {
      doc.loginAt = now;
      logAction = "admin_mark_present";
    } else if (action === "markLogoutNow") {
      doc.logoutAt = now;
      logAction = "admin_mark_logout";
    } else {
      doc.loginAt = null;
      doc.logoutAt = null;
      logAction = "admin_clear";
    }

    doc.changeLog.push(
      buildLogEntry(
        req,
        logAction,
        prevLogin,
        prevLogout,
        doc.loginAt,
        doc.logoutAt
      )
    );
    await doc.save();

    return res.json({ message: "Attendance updated.", record: doc.toObject() });
  } catch (e) {
    console.error("[attendance] admin update error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
