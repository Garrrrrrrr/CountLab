"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export type Placement = "anchor" | "dock";

const MARGIN = 12;
const OFFSET = 8;

/** The bottom of whatever is pinned to the top of the viewport: the app header and a sticky chart toolbar. */
function topInset() {
  let bottom = 0;
  for (const element of document.querySelectorAll<HTMLElement>("body header, [data-reference-toolbar]")) {
    if (!element.getClientRects().length) continue;
    const position = getComputedStyle(element).position;
    if (position === "sticky" || position === "fixed") bottom = Math.max(bottom, element.getBoundingClientRect().bottom);
  }
  return bottom;
}

/** The top of the phone navigation bar, which floats over the bottom of the page. */
function bottomLimit() {
  const nav = document.querySelector<HTMLElement>("nav[aria-label='Mobile navigation']");
  return nav && nav.getClientRects().length ? Math.min(innerHeight, nav.getBoundingClientRect().top) : innerHeight;
}

/**
 * Keeps a fixed card beside an anchor element and inside the viewport,
 * clear of the sticky header and toolbar. `anchor` sits above the anchor if it
 * fits under the toolbar, otherwise below. `dock` is a steady readout along
 * the bottom of the content area that moves to the top only when the anchor
 * would be underneath it, so sweeping the mouse over a grid never covers the
 * rows ahead of it.
 */
function useAnchoredPosition(anchor: HTMLElement | null, placement: Placement, onAnchorHidden: () => void) {
  const card = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<{ left: number; top: number; width?: number } | null>(null);
  const hidden = useRef(onAnchorHidden);
  useEffect(() => { hidden.current = onAnchorHidden; }, [onAnchorHidden]);

  const place = useCallback(() => {
    const element = card.current;
    if (!anchor || !element) return;
    if (!anchor.isConnected) { hidden.current(); return; }
    const rect = anchor.getBoundingClientRect();
    const top = topInset();
    const bottom = bottomLimit();
    if (rect.bottom < top || rect.top > bottom) { hidden.current(); return; }
    const height = element.offsetHeight;
    if (placement === "dock") {
      const main = document.querySelector("main")?.getBoundingClientRect();
      const areaLeft = main?.left ?? 0;
      const areaWidth = main?.width ?? innerWidth;
      const width = Math.min(640, areaWidth - MARGIN * 2);
      const left = areaLeft + (areaWidth - width) / 2;
      const atBottom = bottom - MARGIN - height;
      setStyle({ left, width, top: rect.bottom > atBottom - OFFSET ? top + MARGIN : atBottom });
      return;
    }
    const width = element.offsetWidth;
    const left = Math.max(MARGIN, Math.min(innerWidth - width - MARGIN, rect.left + rect.width / 2 - width / 2));
    const above = rect.top - OFFSET - height;
    const below = rect.bottom + OFFSET;
    // Prefer the space between the sticky bars; failing that, the card may
    // briefly cover a bar rather than the cell it explains.
    const placed = above >= top + MARGIN ? above
      : below + height <= bottom - MARGIN ? below
      : above >= MARGIN ? above
      : below + height <= innerHeight - MARGIN ? below
      : rect.top > innerHeight - rect.bottom ? Math.max(MARGIN, above) : Math.min(below, innerHeight - MARGIN - height);
    setStyle({ left, top: placed });
  }, [anchor, placement]);

  useLayoutEffect(() => {
    if (!anchor) { setStyle(null); return; }
    place();
  }, [anchor, place]);

  useEffect(() => {
    if (!anchor) return;
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    addEventListener("scroll", schedule, true);
    addEventListener("resize", schedule);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
    if (card.current) observer?.observe(card.current);
    return () => { cancelAnimationFrame(frame); removeEventListener("scroll", schedule, true); removeEventListener("resize", schedule); observer?.disconnect(); };
  }, [anchor, place]);

  return { card, style };
}

/**
 * A non-interactive card anchored to an element (role=tooltip by default),
 * portalled to the body so no table or panel clips it. It never takes pointer
 * events, so it cannot block the cell it explains.
 */
export function FloatingCard({ anchor, id, placement = "anchor", onAnchorHidden, children }: { anchor: HTMLElement | null; id: string; placement?: Placement; onAnchorHidden: () => void; children: ReactNode }) {
  const { card, style } = useAnchoredPosition(anchor, placement, onAnchorHidden);
  if (!anchor || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={card}
      id={id}
      role="tooltip"
      data-placement={placement}
      style={style ? { left: style.left, top: style.top, width: style.width } : { left: 0, top: 0, visibility: "hidden" }}
      className={`no-print pointer-events-none fixed z-[100] rounded-xl border border-[var(--rule)] bg-[var(--paper-raised)] p-3 text-left text-sm leading-5 text-[var(--ink)] shadow-2xl ${placement === "dock" ? "" : "w-[min(20rem,calc(100vw-1.5rem))]"}`}
    >
      {children}
    </div>,
    document.body,
  );
}
