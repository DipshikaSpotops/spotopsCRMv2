import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { DateRange } from "react-date-range";
import moment from "moment-timezone";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";
import "./unifiedDatePicker.css";

const ZONE = "America/Chicago";
const LS_RANGE = "udp_range";
const LS_SHOWN = "udp_shownDate";

const toDallasDayUTCBounds = (startLike, endLike) => {
  // The Date objects from the calendar represent dates in the user's local timezone
  // We need to extract the date components (year, month, day) and treat them as Dallas dates
  const startDate = new Date(startLike);
  const endDate = new Date(endLike);
  
  // Extract date components from the Date object (these are in local timezone, but we'll treat them as Dallas dates)
  const startYear = startDate.getFullYear();
  const startMonth = startDate.getMonth();
  const startDay = startDate.getDate();
  
  const endYear = endDate.getFullYear();
  const endMonth = endDate.getMonth();
  const endDay = endDate.getDate();
  
  // Create moments in Dallas timezone using these date components
  // This ensures December 4th stays December 4th in Dallas time
  const startDallas = moment.tz({ year: startYear, month: startMonth, day: startDay }, ZONE).startOf("day");
  const endDallas = moment.tz({ year: endYear, month: endMonth, day: endDay }, ZONE).endOf("day");
  
  const startUTC = startDallas.utc().format();
  const endUTC = endDallas.utc().format();
  return { startUTC, endUTC };
};

const sameDallasDay = (a, b) =>
  moment.tz(a, ZONE).format("YYYY-MM-DD") === moment.tz(b, ZONE).format("YYYY-MM-DD");

const UnifiedDatePicker = ({ onFilterChange }) => {
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const wrapperRef = useRef(null);

  const [showCalendar, setShowCalendar] = useState(false);

  const todayDallas = moment().tz(ZONE);
  const [range, setRange] = useState(() => {
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
    try {
      const saved = localStorage.getItem(LS_SHOWN);
      if (saved) return new Date(saved);
    } catch {}
    return todayDallas.toDate();
  });

  const [lastClick, setLastClick] = useState({ date: null, time: 0 });

  useEffect(() => {
    const r = range?.[0];
    if (!r) return;
    localStorage.setItem(
      LS_RANGE,
      JSON.stringify({ startDate: r.startDate, endDate: r.endDate })
    );
  }, [range]);

  useEffect(() => {
    if (shownDate) {
      localStorage.setItem(LS_SHOWN, shownDate.toISOString());
    }
  }, [shownDate]);

  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });

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

  const emitRangeToBackend = (startLike, endLike) => {
    const { startUTC, endUTC } = toDallasDayUTCBounds(startLike, endLike);
    onFilterChange?.({ start: startUTC, end: endUTC });
  };

  const handleSelect = (ranges) => {
    const { startDate, endDate } = ranges.selection;
    if (!startDate) return;
    
    const now = moment.tz(ZONE).valueOf();

    if (lastClick.date && sameDallasDay(lastClick.date, startDate) && now - lastClick.time < 300) {
      const singleDay = { startDate, endDate: startDate, key: "selection" };
      setRange([singleDay]);
      setShownDate(startDate);
      emitRangeToBackend(startDate, startDate);
      return;
    }

    setLastClick({ date: startDate, time: now });
    setRange([ranges.selection]);

    if (startDate && endDate) {
      setShownDate(startDate);
      emitRangeToBackend(startDate, endDate);
    }
  };

  const handleMonthYearChange = (date) => {
    // date parameter is the month/year the user selected in the picker
    // Use it directly for shownDate so calendar displays that month
    setShownDate(date);
    
    const y = date.getFullYear();
    const m = date.getMonth();

    // Create the date range in Dallas timezone for the selected month
    // Start: first day of the month at 00:00:00 Dallas time
    const start = moment.tz({ year: y, month: m, day: 1 }, ZONE).startOf("day");
    // End: last day of the month - get the last day number explicitly
    const lastDay = moment.tz({ year: y, month: m }, ZONE).daysInMonth();
    // End date: last day at start of day (midnight) to avoid timezone issues
    const end = moment.tz({ year: y, month: m, day: lastDay }, ZONE).startOf("day");

    // Extract date components from moment objects (which are in Dallas timezone)
    // These represent the actual calendar dates we want (Dec 1 and Dec 31)
    const startYear = start.year();
    const startMonth = start.month();
    const startDay = start.date();
    
    const endYear = end.year();
    const endMonth = end.month();
    const endDay = end.date();

    // Create Date objects directly using local Date constructor
    // This ensures getDate(), getMonth(), getFullYear() return the exact values we pass
    // We use a safe time (noon) to avoid any midnight timezone edge cases
    // The Date constructor (year, month, day, hour, minute) creates dates in local timezone
    // and getDate() will return the same day value we pass in
    const startDate = new Date(startYear, startMonth, startDay, 12, 0, 0);
    const endDate = new Date(endYear, endMonth, endDay, 12, 0, 0);

    setRange([{ startDate, endDate, key: "selection" }]);
    
    // For backend, pass the Date objects we created for the calendar
    // toDallasDayUTCBounds will extract date components and treat them as Dallas dates
    // This ensures the correct date range is sent to the backend
    emitRangeToBackend(startDate, endDate);
  };

  const handleShortcut = (type) => {
    let startMoment, endMoment;
    const now = moment().tz(ZONE);

    if (type === "today") {
      // For "today", both start and end should be the same day
      startMoment = now.clone().startOf("day");
      endMoment = now.clone().startOf("day"); // Use startOf for both to avoid timezone issues
    } else if (type === "thisMonth") {
      startMoment = now.clone().startOf("month");
      // Get the last day of the month explicitly to avoid timezone issues
      const lastDay = now.daysInMonth();
      endMoment = now.clone().date(lastDay).startOf("day");
    } else if (type === "lastMonth") {
      const m = now.clone().subtract(1, "month");
      startMoment = m.clone().startOf("month");
      // Get the last day of the month explicitly
      const lastDay = m.daysInMonth();
      endMoment = m.clone().date(lastDay).startOf("day");
    } else if (type === "last3Months") {
      startMoment = now.clone().subtract(3, "month").startOf("month");
      // Get the last day of the current month explicitly
      const lastDay = now.daysInMonth();
      endMoment = now.clone().date(lastDay).startOf("day");
    }

    // Extract date components from moment objects to avoid timezone conversion issues
    const startYear = startMoment.year();
    const startMonth = startMoment.month();
    const startDay = startMoment.date();
    
    const endYear = endMoment.year();
    const endMonth = endMoment.month();
    const endDay = endMoment.date();

    // Create Date objects using extracted components
    // Using noon (12:00) to avoid any midnight timezone edge cases
    const start = new Date(startYear, startMonth, startDay, 12, 0, 0);
    const end = new Date(endYear, endMonth, endDay, 12, 0, 0);

    setRange([{ startDate: start, endDate: end, key: "selection" }]);
    setShownDate(start);
    emitRangeToBackend(start, end);
    setShowCalendar(false);
  };

  return (
    <div className="relative inline-block" ref={wrapperRef}>
      <button
        ref={triggerRef}
        onClick={() => setShowCalendar((s) => !s)}
        className="inline-flex items-center justify-center h-6 px-3 rounded-full text-xs leading-none bg-[#04356d] hover:bg-[#3b89bf] text-white border border-white/15 shadow"
        type="button"
      >
        Select Range
      </button>

      {showCalendar && (
        <div
          ref={popoverRef}
          className="fixed z-[9999] bg-white shadow-lg rounded-lg p-3"
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
            ranges={range}
            shownDate={shownDate}
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
