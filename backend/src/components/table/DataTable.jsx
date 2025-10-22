import React from "react";
import { FaSort, FaSortUp, FaSortDown } from "react-icons/fa";

const DataTable = ({
  columns,
  rows,
  sortBy,
  sortOrder,
  onSort,
  rowRenderer,
  cellRenderer,
  hiliteId,
  onRowClick,
}) => {
  return (
    <div className="overflow-x-auto">
      <div className="max-h-[80vh] overflow-y-auto scrollbar-thin scrollbar-thumb-[#4986bf] scrollbar-track-[#98addb]">
        <table className="min-w-[1200px] w-full bg-black/20 backdrop-blur-md text-white">
          <thead className="sticky top-0 bg-[#5c8bc1] z-20">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  onClick={() => c.sortable && onSort?.(c.key)}
                  className={`p-3 text-left text-tHead border-r border-white/30 whitespace-nowrap cursor-pointer ${c.className || ""}`}
                >
                  <div className="flex items-center gap-1">
                    {c.label}
                    {c.sortable && (
                      <>
                        {sortBy === c.key ? (
                          sortOrder === "asc" ? (
                            <FaSortUp className="text-xs" />
                          ) : (
                            <FaSortDown className="text-xs" />
                          )
                        ) : (
                          <FaSort className="opacity-70 text-xs" />
                        )}
                      </>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, i) =>
              rowRenderer ? (
                rowRenderer(row, i, columns, cellRenderer)
              ) : (
                <tr
                  key={row._id || i}
                  id={`row-${row._id}`}
                  onClick={() => onRowClick?.(row)}
                  className={`transition text-sm cursor-pointer ${
                    hiliteId === String(row.orderNo)
                      ? "bg-yellow-500/20 ring-2 ring-yellow-400"
                      : i % 2 === 0
                      ? "bg-white/10"
                      : "bg-white/5"
                  } hover:bg-white/20`}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-2.5 align-top border-r border-white/20 whitespace-nowrap text-[#e1ebeb] ${c.className || ""}`}
                    >
                      {cellRenderer ? cellRenderer(row, c.key) : String(row[c.key] ?? "")}
                    </td>
                  ))}
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataTable;
