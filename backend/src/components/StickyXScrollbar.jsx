// src/components/StickyXScrollbar.jsx
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function StickyXScrollbar({
  targetRef,
  bottom = 0,
  height = 14,
  zIndex = 2147483000,   // large but below modals if you use higher z-index there
  reserveSpace = true,
}) {
  const barRef = useRef(null);
  const innerRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = targetRef?.current;
    const bar = barRef.current;
    const inner = innerRef.current;
    if (!el || !bar || !inner) return;

    let syncing = false;
    const syncFromEl = () => {
      if (syncing) return;
      syncing = true;
      bar.scrollLeft = el.scrollLeft;
      syncing = false;
    };
    const syncFromBar = () => {
      if (syncing) return;
      syncing = true;
      el.scrollLeft = bar.scrollLeft;
      syncing = false;
    };

    const update = () => {
      const need = el.scrollWidth > el.clientWidth + 1;
      setVisible(need);
      inner.style.width = `${el.scrollWidth}px`;
      bar.scrollLeft = el.scrollLeft;
      if (reserveSpace) {
        el.style.paddingBottom = need ? `${height}px` : "";
      }
    };

    el.addEventListener("scroll", syncFromEl, { passive: true });
    bar.addEventListener("scroll", syncFromBar, { passive: true });
    window.addEventListener("resize", update);

    const ro = new ResizeObserver(update);
    ro.observe(el);

    // If table width/rows change (e.g., Show Details), keep in sync
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true, attributes: true });

    update();

    return () => {
      el.removeEventListener("scroll", syncFromEl);
      bar.removeEventListener("scroll", syncFromBar);
      window.removeEventListener("resize", update);
      ro.disconnect();
      mo.disconnect();
      if (reserveSpace) el.style.paddingBottom = "";
    };
  }, [targetRef, height, reserveSpace]);

  const bar = (
    <div
      ref={barRef}
      hidden={!visible}
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: `calc(${bottom}px + env(safe-area-inset-bottom, 0px))`,
        height,
        overflowX: "scroll",   // <-- force always-visible scrollbar
        overflowY: "hidden",
        zIndex,
        background: "transparent",
        // Allows clicking/dragging the thumb but not blocking clicks elsewhere
        // (the track itself is the only interactive area)
      }}
    >
      <div ref={innerRef} style={{ height: 1 }} />
    </div>
  );

  return createPortal(bar, document.body);
}
