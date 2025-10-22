import React, { useEffect, useRef, useState, useMemo } from "react";
import { FaSort, FaSortUp, FaSortDown, FaSort as FaSortIcon } from "react-icons/fa";
import { useLocation, useNavigate } from "react-router-dom";

import UnifiedDatePicker from "../components/UnifiedDatePicker";
import StickyDataPage from "./StickyDataPage";
import SearchBar from "../components/SearchBar";
import AgentDropdown from "../components/AgentDropdown";

import { buildDefaultFilter, prettyFilterLabel } from "../utils/dateUtils";
import { baseHeadClass, baseCellClass } from "../utils/tableStyles";

export default function MonthlyDataPage({
  title,
  useDataQuery,      // RTK query hook
  buildQueryArgs,    // function to map UI state -> query params
  columns,
  cellRenderer,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const contentRef = useRef(null);

  // ---------- state ----------
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState(buildDefaultFilter());
  const [sortBy, setSortBy] = useState(undefined);
  const [sortOrder, setSortOrder] = useState("asc");
  const [agentFilter, setAgentFilter] = useState("Select");
  const [hilite, setHilite] = useState(null);

  // ---------- build query ----------
  const queryArgs = buildQueryArgs({
    filter: activeFilter,
    search: appliedQuery,
    sortBy,
    sortOrder,
    agent: agentFilter,
    page,
  });

  const { data, isFetching, isLoading, error } = useDataQuery(queryArgs, {
    skip: !activeFilter,
  });

  const orders = data?.orders || [];
  const totalPages = data?.totalPages || 1;
  const totalOrders = data?.totalOrders || orders.length;

  // ---------- agent options ----------
  const agentOptions = useMemo(() => {
    const set = new Set();
    orders.forEach((o) => {
      const a = (o?.salesAgent || "").trim();
      if (a) set.add(a);
    });
    return ["Select", "All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [orders]);

  // ---------- sort ----------
  const handleSort = (field) => {
    if (field === "action") return;
    let nextSortBy = field;
    let nextSortOrder = "asc";
    if (sortBy === field) nextSortOrder = sortOrder === "asc" ? "desc" : "asc";
    setSortBy(nextSortBy);
    setSortOrder(nextSortOrder);
    setPage(1);
  };

  // ---------- right controls ----------
  const rightControls = (
    <>
      <SearchBar
        value={searchInput}
        onChange={(v) => {
          setSearchInput(v);
          if (v.trim() === "" && appliedQuery !== "") setAppliedQuery("");
        }}
        onApply={(q) => {
          setAppliedQuery(q);
          setPage(1);
        }}
        onClear={() => {
          setSearchInput("");
          setAppliedQuery("");
          setPage(1);
        }}
        placeholder="Search… (press Enter)"
      />

      <UnifiedDatePicker
        key={JSON.stringify(activeFilter)}
        value={activeFilter}
        onFilterChange={(filter) => {
          const nextFilter =
            filter && Object.keys(filter).length ? filter : buildDefaultFilter();
          setActiveFilter(nextFilter);
          setPage(1);
        }}
      />
    </>
  );

  if (isLoading) return <div className="p-6 text-center text-white">⏳ Loading…</div>;
  if (error) return <div className="p-6 text-center text-red-300">{String(error)}</div>;

  return (
    <StickyDataPage
      title={
        <div className="flex items-center gap-3">
          <h2 className="text-3xl font-bold text-white underline decoration-1">
            {title}
          </h2>
          <AgentDropdown
            options={agentOptions}
            value={agentFilter}
            onChange={(val) => {
              setAgentFilter(val);
              setPage(1);
            }}
          />
        </div>
      }
      totalLabel={`Total Orders: ${totalOrders}`}
      badge={
        activeFilter && (
          <span className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/15 px-3 py-1 text-xs text-white/70">
            {prettyFilterLabel(activeFilter)}
            {agentFilter && agentFilter !== "Select" ? ` • Agent: ${agentFilter}` : ""}
          </span>
        )
      }
      page={page}
      totalPages={totalPages}
      onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
      onNextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
      rightControls={rightControls}
      ref={contentRef}
    >
      <table className="table-fixed min-w-full bg-black/20 backdrop-blur-md text-white">
        <thead className="sticky top-0 bg-[#5c8bc1] z-20">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                onClick={() => handleSort(c.key)}
                className={`${baseHeadClass} ${c.className || ""}`}
              >
                <div className="flex items-center justify-center gap-1">
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
                        <FaSortIcon className="opacity-70 text-xs" />
                      )}
                    </>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((row, i) => {
            const isHi = hilite === String(row.orderNo);
            return (
              <tr
                key={row._id}
                id={`row-${row._id}`}
                onClick={() => setHilite(String(row.orderNo))}
                className={`transition text-sm cursor-pointer ${
                  isHi
                    ? "bg-yellow-500/20 ring-2 ring-yellow-400"
                    : i % 2 === 0
                    ? "bg-white/10"
                    : "bg-white/5"
                } hover:bg-white/20`}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`${baseCellClass} ${c.className || ""}`}
                  >
                    {cellRenderer(row, c.key)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {isFetching && (
        <div className="p-2 text-center text-xs text-white/70">Updating…</div>
      )}
    </StickyDataPage>
  );
}
