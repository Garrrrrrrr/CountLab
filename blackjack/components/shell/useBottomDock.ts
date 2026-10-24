"use client";
import { useEffect, type RefObject } from "react";

/**
 * Publishes the height of a bar docked above the tab bar (a results bar, a
 * pinned Start button) as `--dock-h`, so toasts and the consent bar sit above
 * it instead of covering it. Only one dock is expected on a page at a time.
 */
export function useBottomDock(ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    const element = ref.current;
    const root = document.documentElement;
    if (!element || !active) return;
    const publish = () => {
      // A dock that is not fixed to the bottom at this width (desktop layouts) takes no space.
      const fixed = getComputedStyle(element).position === "fixed";
      root.style.setProperty("--dock-h", fixed ? `${element.offsetHeight}px` : "0px");
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    window.addEventListener("resize", publish);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publish);
      root.style.removeProperty("--dock-h");
    };
  }, [ref, active]);
}
