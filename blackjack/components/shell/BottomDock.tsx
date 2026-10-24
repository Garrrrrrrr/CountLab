"use client";
import { useRef, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { useBottomDock } from "./useBottomDock";

/**
 * A bar pinned above the phone tab bar for a page's main action (Start, Log
 * session). It publishes its height so toasts sit above it, and hides from
 * `lg` up, where the action lives in the page itself.
 */
export function BottomDock({ children, className }: { children: ReactNode; className?: string }) {
  const dock = useRef<HTMLDivElement>(null);
  useBottomDock(dock);
  return (
    <div ref={dock} className={cx("fixed inset-x-0 z-30 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur-xl lg:hidden", className)} style={{ bottom: "calc(var(--tabbar-h) + var(--safe-b))" }}>
      {children}
    </div>
  );
}
