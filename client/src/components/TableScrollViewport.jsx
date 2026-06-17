import React from "react";

const SCROLLBAR =
  "scrollbar scrollbar-thin scrollbar-thumb-[#4986bf] scrollbar-track-[#98addb]";

/**
 * Keeps the native blue horizontal scrollbar pinned to the bottom of a fixed
 * viewport while rows scroll vertically inside.
 */
export default function TableScrollViewport({
  outerRef,
  innerRef,
  onInnerWheel,
  children,
  outerClassName = "",
  innerClassName = "",
  minTableWidth = "1200px",
}) {
  return (
    <div
      ref={outerRef}
      className={`h-[76vh] overflow-x-auto overflow-y-hidden rounded-xl ring-1 ring-white/10 shadow ${SCROLLBAR} ${outerClassName}`}
    >
      <div
        ref={innerRef}
        onWheel={onInnerWheel}
        className={`h-full overflow-y-auto overflow-x-hidden ${SCROLLBAR} ${innerClassName}`}
        style={{ width: "max-content", minWidth: "100%" }}
      >
        <div style={{ minWidth: minTableWidth }}>{children}</div>
      </div>
    </div>
  );
}

export function handleTableHorizontalWheel(e, outerRef) {
  const outer = outerRef?.current;
  if (!outer) return;
  const { deltaX, deltaY } = e;
  if (!e.shiftKey && Math.abs(deltaX) <= Math.abs(deltaY)) return;
  const delta = deltaX !== 0 ? deltaX : deltaY;
  if (!delta) return;
  outer.scrollLeft += delta;
  e.preventDefault();
}
