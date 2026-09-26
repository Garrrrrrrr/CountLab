"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { FloatingCard } from "./FloatingCard";

export type ExplainSource = "hover" | "focus" | "pin";
type Active = { key: string; source: ExplainSource } | null;

export interface ExplainerApi {
  /** Focus a cell and pin its explanation, e.g. from the ranked list. */
  show(key: string): void;
}

const HOVER_DELAY_MS = 120;
const cellFrom = (target: EventTarget | null) =>
  target instanceof Element ? target.closest<HTMLElement>("[data-cell]") : null;

/**
 * One explanation card for every chart cell on the page.
 *
 * Mouse hover previews a cell in a steady readout docked to the bottom of the
 * content area (it never follows the pointer over the rows ahead of it).
 * Keyboard focus and taps show the card beside the cell; a click or tap pins
 * it, and a second one on the same cell closes it. Escape hides it and keeps
 * focus; a tap or click elsewhere, or scrolling the cell out of view, closes
 * it. The cells themselves never re-render: the active cell is marked with
 * data attributes for the row and column highlight, and aria-describedby
 * points at the card.
 */
export function CellExplainer({ containerRef, render, apiRef }: { containerRef: RefObject<HTMLElement | null>; render: (key: string, source: ExplainSource) => ReactNode; apiRef?: RefObject<ExplainerApi | null> }) {
  const [active, setActive] = useState<Active>(null);
  const current = useRef<Active>(null);
  const id = useId();
  const update = useCallback((next: Active) => {
    current.current = next;
    setActive((previous) => (previous?.key === next?.key && previous?.source === next?.source ? previous : next));
  }, []);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    let hoverTimer: ReturnType<typeof setTimeout> | undefined;
    const clearHover = () => clearTimeout(hoverTimer);
    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || current.current?.source === "pin") return;
      const cell = cellFrom(event.target);
      clearHover();
      if (!cell) {
        if (current.current?.source === "hover") hoverTimer = setTimeout(() => update(null), HOVER_DELAY_MS);
        return;
      }
      hoverTimer = setTimeout(() => update({ key: cell.dataset.cell!, source: "hover" }), HOVER_DELAY_MS);
    };
    const onPointerLeave = () => {
      clearHover();
      if (current.current?.source === "hover") update(null);
    };
    const onFocusIn = (event: FocusEvent) => {
      const cell = cellFrom(event.target);
      if (!cell) return;
      clearHover();
      const key = cell.dataset.cell!;
      if (current.current?.source === "pin" && current.current.key === key) return;
      update({ key, source: "focus" });
    };
    const onFocusOut = (event: FocusEvent) => {
      if (cellFrom(event.relatedTarget) && root.contains(event.relatedTarget as Node)) return;
      if (current.current?.source === "focus") update(null);
    };
    const onClick = (event: MouseEvent) => {
      const cell = cellFrom(event.target);
      if (!cell) return;
      clearHover();
      const key = cell.dataset.cell!;
      update(current.current?.source === "pin" && current.current.key === key ? null : { key, source: "pin" });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!current.current || cellFrom(event.target)) return;
      update(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !current.current) return;
      update(null);
    };
    root.addEventListener("pointerover", onPointerOver);
    root.addEventListener("pointerleave", onPointerLeave);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    root.addEventListener("click", onClick);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearHover();
      root.removeEventListener("pointerover", onPointerOver);
      root.removeEventListener("pointerleave", onPointerLeave);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      root.removeEventListener("click", onClick);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [containerRef, update]);

  const anchor = active ? containerRef.current?.querySelector<HTMLElement>(`[data-cell="${CSS.escape(active.key)}"]`) ?? null : null;

  // Mark the active cell for the header highlight and the pinned outline, and
  // describe it by the card, without re-rendering any cell.
  useEffect(() => {
    if (!anchor || !active) return;
    anchor.setAttribute("data-active", "");
    anchor.setAttribute("aria-describedby", id);
    if (active.source === "pin") anchor.setAttribute("data-pinned", "");
    return () => {
      anchor.removeAttribute("data-active");
      anchor.removeAttribute("data-pinned");
      anchor.removeAttribute("aria-describedby");
    };
  }, [anchor, active, id]);

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      show(key) {
        const cell = containerRef.current?.querySelector<HTMLElement>(`[data-cell="${CSS.escape(key)}"]`);
        if (!cell) return;
        const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
        cell.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
        cell.focus({ preventScroll: true });
        // Pin once the scroll settles, so the card lands beside the cell rather than where it was.
        let done = false;
        const pin = () => { if (done) return; done = true; removeEventListener("scrollend", pin); update({ key, source: "pin" }); };
        addEventListener("scrollend", pin, { once: true });
        setTimeout(pin, smooth ? 400 : 0);
      },
    };
    return () => { apiRef.current = null; };
  }, [apiRef, containerRef, update]);

  const hide = useCallback(() => update(null), [update]);
  if (!active || !anchor) return null;
  return (
    <FloatingCard anchor={anchor} id={id} placement={active.source === "hover" ? "dock" : "anchor"} onAnchorHidden={hide}>
      {render(active.key, active.source)}
    </FloatingCard>
  );
}
