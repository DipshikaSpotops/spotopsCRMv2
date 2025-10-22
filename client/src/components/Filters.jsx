import React from "react";

const Filters = ({ onSearch, onDateChange }) => {
  return (
    <div className="flex flex-wrap gap-4 items-center mb-4">
      {/* Search box */}
      <input
        type="text"
        placeholder="Search by order number or customer"
        className="border p-2 rounded-md w-64"
        onChange={(e) => onSearch(e.target.value)}
      />

      {/* Date range picker placeholder */}
      <input
        type="date"
        className="border p-2 rounded-md"
        onChange={(e) => onDateChange((prev) => ({ ...prev, start: e.target.value }))}
      />
      <input
        type="date"
        className="border p-2 rounded-md"
        onChange={(e) => onDateChange((prev) => ({ ...prev, end: e.target.value }))}
      />
    </div>
  );
};

export default Filters;
