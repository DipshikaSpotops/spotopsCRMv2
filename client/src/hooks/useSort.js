import { useState } from "react";

export default function useSort(defaultField = null, defaultOrder = "asc") {
  const [sortBy, setSortBy] = useState(defaultField);
  const [sortOrder, setSortOrder] = useState(defaultOrder);

  // Centralized list of all date fields
  const DATE_FIELDS = ["orderDate", "cancelledDate", "refundedDate", "custRefundDate", "disputeDate"];

  const handleSort = (field) => {
    if (field === "action") return;
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };
 
  const sortData = (data) => {
    if (!sortBy) return data;

    // for date fields
    if (DATE_FIELDS.includes(sortBy)) {
    return [...data].sort((a, b) => {
        const dateA = a[sortBy] instanceof Date ? a[sortBy] : new Date(a[sortBy]);
        const dateB = b[sortBy] instanceof Date ? b[sortBy] : new Date(b[sortBy]);

        if (isNaN(dateA) || isNaN(dateB)) return 0;

        return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    });
    }

    // Handle number and string sorting
    return [...data].sort((a, b) => {
      const valA = a[sortBy] ?? "";
      const valB = b[sortBy] ?? "";

      if (typeof valA === "number" && typeof valB === "number") {
        return sortOrder === "asc" ? valA - valB : valB - valA;
      }
          if (sortBy === "disputeDate") {
          console.log("disputeDate sortOrder:", sortOrder);
          console.log("disputeDates before sort:", data.map(o => o.disputeDate));
}

      return sortOrder === "asc"
        ? valA.toString().localeCompare(valB.toString(), undefined, { numeric: true })
        : valB.toString().localeCompare(valA.toString(), undefined, { numeric: true });
    });
  };

  return { sortBy, sortOrder, handleSort, sortData };
}
