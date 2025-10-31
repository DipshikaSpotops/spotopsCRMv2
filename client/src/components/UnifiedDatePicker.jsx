// import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
// import { DateRange } from "react-date-range";
// import moment from "moment-timezone";
// import "react-date-range/dist/styles.css";
// import "react-date-range/dist/theme/default.css";
// import "./unifiedDatePicker.css";

// const ZONE = "America/Chicago";
// const LS_RANGE = "udp_range";
// const LS_SHOWN = "udp_shownDate";

// const toDallasDayUTCBounds = (startLike, endLike) => {
//   const startUTC = moment.tz(startLike, ZONE).startOf("day").utc().format();
//   const endUTC   = moment.tz(endLike,   ZONE).endOf("day").utc().format();
//   return { startUTC, endUTC };
// };

// const sameDallasDay = (a, b) =>
//   moment.tz(a, ZONE).format("YYYY-MM-DD") === moment.tz(b, ZONE).format("YYYY-MM-DD");

// const UnifiedDatePicker = ({ onFilterChange }) => {
//   const triggerRef = useRef(null);
//   const popoverRef = useRef(null);
//   const wrapperRef = useRef(null);

//   const [showCalendar, setShowCalendar] = useState(false);

//   const todayDallas = moment().tz(ZONE);
//   const [range, setRange] = useState(() => {
//     try {
//       const saved = JSON.parse(localStorage.getItem(LS_RANGE) || "null");
//       if (saved?.startDate && saved?.endDate) {
//         return [{
//           startDate: new Date(saved.startDate),
//           endDate: new Date(saved.endDate),
//           key: "selection",
//         }];
//       }
//     } catch {}
//     return [{
//       startDate: todayDallas.startOf("day").toDate(),
//       endDate: todayDallas.endOf("day").toDate(),
//       key: "selection",
//     }];
//   });

//   const [shownDate, setShownDate] = useState(() => {
//     try {
//       const saved = localStorage.getItem(LS_SHOWN);
//       if (saved) return new Date(saved);
//     } catch {}
//     return todayDallas.toDate();
//   });

//   const [lastClick, setLastClick] = useState({ date: null, time: 0 });

//   useEffect(() => {
//     const r = range?.[0];
//     if (!r) return;
//     localStorage.setItem(
//       LS_RANGE,
//       JSON.stringify({ startDate: r.startDate, endDate: r.endDate })
//     );
//   }, [range]);

//   useEffect(() => {
//     if (shownDate) {
//       localStorage.setItem(LS_SHOWN, shownDate.toISOString());
//     }
//   }, [shownDate]);

//   const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });

//   const computePopoverPosition = () => {
//     const btn = triggerRef.current;
//     const pop = popoverRef.current;
//     if (!btn || !pop) return;

//     const margin = 8;
//     const vw = window.innerWidth;
//     const vh = window.innerHeight;

//     const btnRect = btn.getBoundingClientRect();
//     const popRect = pop.getBoundingClientRect();
//     const width = popRect.width || 300;
//     const height = popRect.height || 320;

//     let top = btnRect.bottom + margin;
//     if (top + height > vh && btnRect.top - margin - height > margin) {
//       top = btnRect.top - margin - height;
//     }

//     let left = btnRect.right - width;
//     if (left < margin) left = margin;
//     if (left + width > vw - margin) left = vw - margin - width;

//     setPopoverPos({ top, left });
//   };

//   useLayoutEffect(() => {
//     if (showCalendar) {
//       requestAnimationFrame(computePopoverPosition);
//     }
//   }, [showCalendar, range, shownDate]);

//   useEffect(() => {
//     const onResize = () => showCalendar && computePopoverPosition();
//     window.addEventListener("resize", onResize);
//     window.addEventListener("scroll", onResize, true);
//     return () => {
//       window.removeEventListener("resize", onResize);
//       window.removeEventListener("scroll", onResize, true);
//     };
//   }, [showCalendar]);

//   useEffect(() => {
//     function handleClickOutside(event) {
//       if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
//         setShowCalendar(false);
//       }
//     }
//     document.addEventListener("mousedown", handleClickOutside);
//     return () => document.removeEventListener("mousedown", handleClickOutside);
//   }, []);

//   const emitRangeToBackend = (startLike, endLike) => {
//     const { startUTC, endUTC } = toDallasDayUTCBounds(startLike, endLike);
//     onFilterChange?.({ start: startUTC, end: endUTC });
//   };

//   const handleSelect = (ranges) => {
//     const { startDate, endDate } = ranges.selection;
//     const now = moment.tz(ZONE).valueOf();

//     if (lastClick.date && sameDallasDay(lastClick.date, startDate) && now - lastClick.time < 300) {
//       const singleDay = { startDate, endDate: startDate, key: "selection" };
//       setRange([singleDay]);
//       setShownDate(startDate);
//       emitRangeToBackend(startDate, startDate);
//       return;
//     }

//     setLastClick({ date: startDate, time: now });
//     setRange([ranges.selection]);

//     if (startDate && endDate) {
//       setShownDate(startDate);
//       emitRangeToBackend(startDate, endDate);
//     }
//   };

// const handleMonthYearChange = (date) => {
//   const y = date.getFullYear();
//   const m = date.getMonth(); 

//   const start = moment.tz({ year: y, month: m, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 }, ZONE);
//   const end   = start.clone().endOf("month");

//   const startDate = start.toDate();
//   const endDate   = end.toDate();

//   setShownDate(startDate); 
//   setRange([{ startDate, endDate, key: "selection" }]);
//   emitRangeToBackend(startDate, endDate);
// };


//   const handleShortcut = (type) => {
//     let start, end;
//     const now = moment().tz(ZONE);

//     if (type === "today") {
//       start = now.clone().startOf("day").toDate();
//       end   = now.clone().endOf("day").toDate();
//     } else if (type === "thisMonth") {
//       start = now.clone().startOf("month").toDate();
//       end   = now.clone().endOf("month").toDate();
//     } else if (type === "lastMonth") {
//       const m = now.clone().subtract(1, "month");
//       start = m.clone().startOf("month").toDate();
//       end   = m.clone().endOf("month").toDate();
//     } else if (type === "last3Months") {
//       start = now.clone().subtract(3, "month").startOf("month").toDate();
//       end   = now.clone().endOf("month").toDate();
//     }

//     setRange([{ startDate: start, endDate: end, key: "selection" }]);
//     setShownDate(start);
//     emitRangeToBackend(start, end);
//     setShowCalendar(false);
//   };

//   return (
//     <div className="relative inline-block" ref={wrapperRef}>
//       <button
//         ref={triggerRef}
//         onClick={() => setShowCalendar((s) => !s)}
//         className="px-4 py-2 bg-[#04356d] hover:bg-[#3b89bf] text-white rounded shadow"
//       >
//         Select Range
//       </button>

//       {showCalendar && (
//         <div
//           ref={popoverRef}
//           className="fixed z-50 bg-white shadow-lg rounded-lg p-3"
//           style={{
//             top: popoverPos.top,
//             left: popoverPos.left,
//             minWidth: 300,
//             maxWidth: "90vw",
//             maxHeight: "90vh",
//             overflow: "auto",
//           }}
//         >
//           <div className="flex justify-end gap-3 mb-2 flex-wrap text-xs">
//             <button onClick={() => handleShortcut("today")} className="text-blue-600 hover:underline">
//               Today
//             </button>
//             <button onClick={() => handleShortcut("thisMonth")} className="text-blue-600 hover:underline">
//               This Month
//             </button>
//             <button onClick={() => handleShortcut("lastMonth")} className="text-blue-600 hover:underline">
//               Last Month
//             </button>
//             <button onClick={() => handleShortcut("last3Months")} className="text-blue-600 hover:underline">
//               Last 3 Months
//             </button>
//           </div>

//           <DateRange
//               editableDateInputs={false}
//               showDateDisplay={false}
//               onChange={handleSelect}
//               onShownDateChange={handleMonthYearChange}
//               moveRangeOnFirstSelection={false}
//               ranges={range}
//               shownDate={shownDate}
//               rangeColors={["#4f46e5"]}
//               direction="horizontal"
//               showMonthAndYearPickers={true}
//               months={1}    
//           />
// {/* #3b89bf] to-[#04356d */}
//           <div className="flex justify-end mt-2">
//             <button
//               onClick={() => setShowCalendar(false)}
//               className="px-2 py-1 text-xs bg-[#3b89bf] rounded hover:bg-[#04356d]"
//             >
//               Close
//             </button>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default UnifiedDatePicker;
import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { DateRange } from "react-date-range";
import moment from "moment-timezone";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";
import "./unifiedDatePicker.css";

/**
 * Props:
 * - value?: { month: 'Aug', year: 2025 } | { start: stringISO, end: stringISO }
 * - onFilterChange?: (filter: { start: stringISO, end: stringISO }) => void
 * - buttonLabel?: string
 */
const ZONE = "America/Chicago";

// Namespaced LS keys (only used when component is UNCONTROLLED: no `value` prop)
const LS_RANGE = "udp_v2_range";
const LS_SHOWN = "udp_v2_shownDate";

/* -------------------- helpers -------------------- */
const toDallasDayUTCBounds = (startLike, endLike) => {
  // Rebuild as Dallas calendar dates from Y/M/D (ignores original timezone)
  const mkDallasDay = (dLike) => {
    const d = dLike instanceof Date ? dLike : new Date(dLike);
    return moment.tz(
      { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() },
      ZONE
    );
  };
  const startUTC = mkDallasDay(startLike).startOf("day").utc().format();
  const endUTC   = mkDallasDay(endLike).endOf("day").utc().format();
  return { startUTC, endUTC };
};

const sameDallasDay = (a, b) =>
  moment.tz(a, ZONE).format("YYYY-MM-DD") === moment.tz(b, ZONE).format("YYYY-MM-DD");

const monthNameToIndex = (name) => {
  const idx = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(name);
  return idx >= 0 ? idx : null;
};

const filterToDates = (filter) => {
  // Returns { startDate: Date, endDate: Date }
  if (!filter) return null;

  if (filter.start && filter.end) {
    const startDate = new Date(filter.start);
    const endDate = new Date(filter.end);
    if (!isNaN(startDate) && !isNaN(endDate)) {
      // Map from UTC bounds to visible Dallas dates (drop time)
      const s = moment.tz(startDate, ZONE).startOf("day").toDate();
      const e = moment.tz(endDate, ZONE).endOf("day").toDate();
      return { startDate: s, endDate: e };
    }
  }

  if (filter.month && filter.year) {
    const mIdx = monthNameToIndex(filter.month);
    if (mIdx !== null) {
      const start = moment.tz({ year: filter.year, month: mIdx, day: 1 }, ZONE).startOf("day");
      const end = start.clone().endOf("month");
      return { startDate: start.toDate(), endDate: end.toDate() };
    }
  }

  return null;
};
/* ------------------------------------------------- */

const UnifiedDatePicker = ({ value, onFilterChange, buttonLabel = "Select Range" }) => {
  const isControlled = value != null;

  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const wrapperRef = useRef(null);

  const [showCalendar, setShowCalendar] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });

  const todayDallas = useMemo(() => moment().tz(ZONE), []);

  // Internal state only used when UNCONTROLLED
  const [range, setRange] = useState(() => {
    if (isControlled) return [{ startDate: todayDallas.startOf("day").toDate(), endDate: todayDallas.endOf("day").toDate(), key: "selection" }];
    try {
      const saved = JSON.parse(localStorage.getItem(LS_RANGE) || "null");
      if (saved?.startDate && saved?.endDate) {
        return [{
          startDate: new Date(saved.startDate),
          endDate: new Date(saved.endDate),
          key: "selection",
        }];
      }
    } catch {}
    return [{
      startDate: todayDallas.startOf("day").toDate(),
      endDate: todayDallas.endOf("day").toDate(),
      key: "selection",
    }];
  });

  const [shownDate, setShownDate] = useState(() => {
    if (isControlled) return todayDallas.toDate();
    try {
      const saved = localStorage.getItem(LS_SHOWN);
      if (saved) return new Date(saved);
    } catch {}
    return todayDallas.toDate();
  });

  const [lastClick, setLastClick] = useState({ date: null, time: 0 });

  /* ------------ keep internal state in sync when controlled ------------- */
  useEffect(() => {
    if (!isControlled) return;

    const dates = filterToDates(value);
    if (dates) {
      const sel = [{ startDate: dates.startDate, endDate: dates.endDate, key: "selection" }];
      setRange(sel);
      setShownDate(dates.startDate);
    } else {
      // fallback to today if value is invalid
      const sel = [{
        startDate: todayDallas.startOf("day").toDate(),
        endDate: todayDallas.endOf("day").toDate(),
        key: "selection",
      }];
      setRange(sel);
      setShownDate(sel[0].startDate);
    }
  }, [isControlled, value, todayDallas]);

  /* ---------------- persist to LS only when uncontrolled ---------------- */
  useEffect(() => {
    if (isControlled) return;
    const r = range?.[0];
    if (!r) return;
    localStorage.setItem(LS_RANGE, JSON.stringify({ startDate: r.startDate, endDate: r.endDate }));
  }, [isControlled, range]);

  useEffect(() => {
    if (isControlled) return;
    if (shownDate) {
      localStorage.setItem(LS_SHOWN, shownDate.toISOString());
    }
  }, [isControlled, shownDate]);

  /* ---------------- popover positioning + events ---------------- */
  const computePopoverPosition = () => {
    const btn = triggerRef.current;
    const pop = popoverRef.current;
    if (!btn || !pop) return;

    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const btnRect = btn.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    const width = popRect.width || 300;
    const height = popRect.height || 320;

    let top = btnRect.bottom + margin;
    if (top + height > vh && btnRect.top - margin - height > margin) {
      top = btnRect.top - margin - height;
    }

    let left = btnRect.right - width;
    if (left < margin) left = margin;
    if (left + width > vw - margin) left = vw - margin - width;

    setPopoverPos({ top, left });
  };

  useLayoutEffect(() => {
    if (showCalendar) {
      requestAnimationFrame(computePopoverPosition);
    }
  }, [showCalendar, range, shownDate]);

  useEffect(() => {
    const onResize = () => showCalendar && computePopoverPosition();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [showCalendar]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* ---------------------- emit helper ---------------------- */
  const emitRangeToParent = (startLike, endLike) => {
    const { startUTC, endUTC } = toDallasDayUTCBounds(startLike, endLike);
    onFilterChange?.({ start: startUTC, end: endUTC });
  };

  /* ------------------ handlers: selection ------------------ */
  const handleSelect = (ranges) => {
    const { startDate, endDate } = ranges.selection;
    const now = moment.tz(ZONE).valueOf();

    // Double-click on same day => single-day range
    if (lastClick.date && sameDallasDay(lastClick.date, startDate) && now - lastClick.time < 300) {
      const singleDay = { startDate, endDate: startDate, key: "selection" };
      setRange([singleDay]);
      setShownDate(startDate);
      emitRangeToParent(startDate, startDate);
      return;
    }

    setLastClick({ date: startDate, time: now });
    setRange([ranges.selection]);

    if (startDate && endDate) {
      setShownDate(startDate);
      emitRangeToParent(startDate, endDate);
    }
  };

  // Month/Year nav => snap to whole month
  const handleMonthYearChange = (date) => {
    const y = date.getFullYear();
    const m = date.getMonth();

    const start = moment.tz({ year: y, month: m, day: 1 }, ZONE).startOf("day");
    const end = start.clone().endOf("month");

    const startDate = start.toDate();
    const endDate = end.toDate();

    setShownDate(startDate);
    setRange([{ startDate, endDate, key: "selection" }]);
    emitRangeToParent(startDate, endDate);
  };

  const handleShortcut = (type) => {
    let start, end;
    const now = moment().tz(ZONE);

    if (type === "today") {
      start = now.clone().startOf("day").toDate();
      end = now.clone().endOf("day").toDate();
    } else if (type === "thisMonth") {
      start = now.clone().startOf("month").toDate();
      end = now.clone().endOf("month").toDate();
    } else if (type === "lastMonth") {
      const m = now.clone().subtract(1, "month");
      start = m.clone().startOf("month").toDate();
      end = m.clone().endOf("month").toDate();
    } else if (type === "last3Months") {
      start = now.clone().subtract(3, "month").startOf("month").toDate();
      end = now.clone().endOf("month").toDate();
    }

    setRange([{ startDate: start, endDate: end, key: "selection" }]);
    setShownDate(start);
    emitRangeToParent(start, end);
    setShowCalendar(false);
  };

  /* ----------------- derived values for picker ----------------- */
  const rangesProp = range;
  const shownDateProp = shownDate;

  return (
    <div className="relative inline-block" ref={wrapperRef}>
      <button
        ref={triggerRef}
        onClick={() => setShowCalendar((s) => !s)}
        className="px-4 py-2 bg-[#04356d] hover:bg-[#3b89bf] text-white rounded shadow"
        type="button"
      >
        {buttonLabel}
      </button>

      {showCalendar && (
        <div
          ref={popoverRef}
          className="fixed z-50 bg-white shadow-lg rounded-lg p-3"
          style={{
            top: popoverPos.top,
            left: popoverPos.left,
            minWidth: 300,
            maxWidth: "90vw",
            maxHeight: "90vh",
            overflow: "auto",
          }}
        >
          <div className="flex justify-end gap-3 mb-2 flex-wrap text-xs">
            <button onClick={() => handleShortcut("today")} className="text-blue-600 hover:underline" type="button">
              Today
            </button>
            <button onClick={() => handleShortcut("thisMonth")} className="text-blue-600 hover:underline" type="button">
              This Month
            </button>
            <button onClick={() => handleShortcut("lastMonth")} className="text-blue-600 hover:underline" type="button">
              Last Month
            </button>
            <button onClick={() => handleShortcut("last3Months")} className="text-blue-600 hover:underline" type="button">
              Last 3 Months
            </button>
          </div>

          <DateRange
            editableDateInputs={false}
            showDateDisplay={false}
            onChange={handleSelect}
            onShownDateChange={handleMonthYearChange}
            moveRangeOnFirstSelection={false}
            ranges={rangesProp}
            shownDate={shownDateProp}
            rangeColors={["#4f46e5"]}
            direction="horizontal"
            showMonthAndYearPickers={true}
            months={1}
          />

          <div className="flex justify-end mt-2">
            <button
              onClick={() => setShowCalendar(false)}
              className="px-2 py-1 text-xs bg-[#3b89bf] rounded hover:bg-[#04356d]"
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedDatePicker;
