"use client";
import { ReactNode, RefObject, useEffect, useRef } from "react";
import { GhostButton, HelpTip, PageHeader, ProgressMeter, type Tone } from "../ui";

export type DrillPhase = "setup" | "play" | "summary";

/** The drill phase last shown on this page; module-level so it survives a drill mounting a new frame per phase. */
let lastPhase: { path: string; phase: DrillPhase } | null = null;
/**
 * Entering a new phase of the same drill returns the page to the top and
 * moves focus to that phase's `[data-drill-focus]` element, or its heading.
 * Works whether a drill keeps one frame and changes `phase` or renders a new
 * frame (or summary) per phase.
 */
export function usePhaseEntry(phase: DrillPhase, root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const path = location.pathname;
    const previous = lastPhase;
    lastPhase = { path, phase };
    if (!previous || previous.path !== path || previous.phase === phase) return;
    window.scrollTo({ top: 0 });
    const target = root.current?.querySelector<HTMLElement>("[data-drill-focus]") ?? root.current?.querySelector<HTMLElement>("h1");
    target?.focus({ preventScroll: true });
  }, [phase, root]);
}

/**
 * The page scaffold every drill shares: Setup -> Play -> Summary.
 *
 * Setup and Summary get the full page header (what the drill is and why);
 * Play gets a compact title so the cards and answers own the screen. When the
 * phase changes, the page returns to the top and focus moves to the new
 * phase's `[data-drill-focus]` element (or its heading), so keyboard and
 * screen-reader users land where the action is.
 */
export function DrillFrame({ eyebrow, title, description, actions, phase, width = "default", children }: { eyebrow: string; title: string; description?: ReactNode; actions?: ReactNode; phase: DrillPhase; width?: "default" | "wide"; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  usePhaseEntry(phase, root);
  return (
    <div ref={root} data-drill-phase={phase} className={`mx-auto min-w-0 ${width === "wide" ? "max-w-[90rem]" : "max-w-5xl"}`}>
      {phase === "play" ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-data text-[.7rem] font-semibold uppercase tracking-[.18em] text-[var(--accent)]">{eyebrow}</p>
            <h1 tabIndex={-1} className="mt-1 font-display text-2xl font-semibold outline-none">{title}</h1>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      ) : (
        <PageHeader eyebrow={eyebrow} title={title} description={description} actions={actions} />
      )}
      {children}
    </div>
  );
}

export type HudStat = { id: string; label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; help?: ReactNode; /** Shown on phones; at most two. Without any flags, the first two show. */ phone?: boolean };
const HUD_TONE: Record<Tone, string> = { neutral: "text-[var(--ink)]", good: "text-[var(--accent)]", bad: "text-[var(--negative)]", warn: "text-[var(--warning)]" };

/**
 * Progress and running score for the round, pinned under the app header so
 * it stays visible while the reader scrolls a long hand or chart.
 */
export function DrillHud({ progress, stats, chip, onEnd, endLabel = "End session" }: { progress: { done: number; total: number; label: string }; stats: ReadonlyArray<HudStat>; chip?: ReactNode; onEnd?: () => void; endLabel?: string }) {
  const flagged = stats.some((stat) => stat.phone);
  return (
    <section aria-label="Session progress" className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-10 mb-4 rounded-2xl border border-[var(--rule)] bg-[var(--paper-raised)] px-3 py-2.5 shadow-sm sm:px-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
        <div className="min-w-[8rem] flex-1">
          <p className="font-data text-xs font-semibold text-[var(--ink)]">{progress.label}</p>
          <ProgressMeter label={progress.label} value={progress.done} max={Math.max(1, progress.total)} className="mt-1" />
        </div>
        <dl className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1">
          {stats.map((stat, index) => (
            <div key={stat.id} className={`min-w-0 ${(flagged ? stat.phone : index < 2) ? "" : "hidden sm:block"}`}>
              <dt className="flex items-center gap-1 text-[.65rem] font-semibold uppercase tracking-[.08em] text-[var(--ink-muted)]">{stat.label}{stat.help && <HelpTip label={stat.label}>{stat.help}</HelpTip>}</dt>
              <dd className={`font-data text-sm font-semibold ${HUD_TONE[stat.tone ?? "neutral"]}`}>{stat.value}{stat.sub && <span className="ml-1 text-xs font-normal text-[var(--ink-muted)]">{stat.sub}</span>}</dd>
            </div>
          ))}
        </dl>
        {(chip || onEnd) && (
          <div className="flex items-center gap-2">
            {chip}
            {onEnd && <GhostButton size="compact" onClick={onEnd}>{endLabel}</GhostButton>}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The play surface: one card with steady padding and height, so the page does
 * not jump between questions. It is the focus target when a round starts.
 */
export function DrillStage({ label, children, banner, size = "md", className = "" }: { label: string; children: ReactNode; banner?: ReactNode; size?: "md" | "lg"; className?: string }) {
  return (
    <section aria-label={label} tabIndex={-1} data-drill-focus="" className={`surface min-w-0 rounded-3xl p-4 outline-none sm:p-6 md:p-8 ${size === "lg" ? "min-h-[18rem] sm:min-h-[26rem]" : "min-h-[16rem] sm:min-h-[22rem]"} ${className}`}>
      {banner && <div className="mb-4">{banner}</div>}
      {children}
    </section>
  );
}
