"use client";

import { useEffect, useRef } from "react";
import { DASH, money, percent } from "@/lib/blackjack/labFormat";
import { GhostButton } from "@/components/ui";
import type { LabModel } from "./useLab";

/**
 * The live answer in one line while the inputs are on screen (compact layouts
 * only). It is sticky inside the page rather than fixed to the window, so it
 * never slides under the sidebar or over the footer; on the Results tab it
 * becomes a way back to the step being tuned.
 */
export function ResultDock({ model, onResults, back }: { model: LabModel; onResults: () => void; back?: { label: string; onClick: () => void } }) {
  const dock = useRef<HTMLDivElement>(null);
  // Toasts float above the phone dock; publish its height the way MobileActionDock does.
  useEffect(() => {
    const element = dock.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--dock-clearance", `${element.offsetHeight}px`);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => { observer.disconnect(); root.style.removeProperty("--dock-clearance"); };
  }, []);
  const { result, noBets, estimated } = model;
  const required = Number.isFinite(result.requiredBankroll) ? money(result.requiredBankroll) : DASH;
  return (
    <div ref={dock} role="group" aria-label="Live results" className="lab-dock no-print">
      {back ? (
        <GhostButton className="w-full" onClick={back.onClick}>
          <i className="fa-solid fa-arrow-left mr-2" aria-hidden="true" />Back to {back.label}
        </GhostButton>
      ) : (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 pl-1">
            {noBets ? (
              <p className="text-sm font-semibold">Not betting at any count</p>
            ) : (
              <>
                <p className={`truncate font-data text-lg font-semibold leading-tight ${result.hourlyEv < 0 ? "text-[var(--negative)]" : ""}`}>
                  {money(result.hourlyEv, 2)}/hr{estimated && <span className="ml-1 text-xs font-medium text-[var(--warning)]">est.</span>}
                </p>
                <p className="truncate text-xs text-[var(--ink-muted)]">Ruin {percent(result.riskOfRuin)} · Need {required}</p>
              </>
            )}
          </div>
          <GhostButton className="shrink-0" onClick={onResults}>
            Results<i className="fa-solid fa-arrow-right ml-2 text-xs" aria-hidden="true" />
          </GhostButton>
        </div>
      )}
    </div>
  );
}
