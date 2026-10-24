"use client";
/**
 * The frame every drill shares, so all of them feel like one product:
 *
 *   Setup    a short page of choices with one Start button (pinned to the
 *            thumb on phones).
 *   Play     full screen. `useFocusMode(true)` hides the app chrome; the
 *            PlayHeader gives the only way out, progress and the clock.
 *   Summary  the score, what went wrong, and what to do next.
 *
 * Drills compose these pieces; none of them owns state.
 */
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { Check, ChevronRight, Flame, RotateCcw, Timer, X } from "lucide-react";
import { Button, ButtonLink, Card, Kbd } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { useFocusMode } from "@/components/shell/FocusMode";
import { BottomDock } from "@/components/shell/BottomDock";
import type { Mistake } from "@/lib/statistics/storage";

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

export function DrillSetup({ title, intro, children, onStart, startLabel = "Start", aside, resume, eyebrow = "Train" }: {
  title: string;
  intro: ReactNode;
  children?: ReactNode;
  onStart: () => void;
  startLabel?: string;
  /** Desktop right column: recent results, a tip, a photo. Shown below the options on phones. */
  aside?: ReactNode;
  /** A banner offering to continue a saved session. */
  resume?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="pb-24 lg:pb-0">
      <Link href="/train" className="-ml-1 mb-3 inline-flex h-8 items-center gap-1 rounded-lg pr-2 text-sm font-medium text-ink-2 hover:text-ink">
        <ChevronRight size={16} className="rotate-180" aria-hidden /> {eyebrow}
      </Link>
      <h1 className="text-[1.625rem] leading-tight sm:text-3xl">{title}</h1>
      <p className="mt-1.5 max-w-2xl text-[0.9375rem] leading-6 text-ink-2">{intro}</p>
      {resume && <div className="mt-5">{resume}</div>}
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-5">
          {children}
          <Button size="lg" className="hidden min-w-48 lg:inline-flex" onClick={onStart}>{startLabel}</Button>
        </div>
        {aside && <div className="space-y-4">{aside}</div>}
      </div>
      {/* Phones: Start sits above the tab bar, where the thumb already is. */}
      <BottomDock>
        <Button size="lg" block onClick={onStart}>{startLabel}</Button>
      </BottomDock>
    </div>
  );
}

/** A labelled block of setup choices. */
export function SetupGroup({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {hint && <p className="mt-0.5 text-sm leading-5 text-ink-3">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** Large tappable choice cards for presets ("Beginner", "Casino speed"). */
export function PresetPicker<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly { value: T; title: string; detail: string }[]; onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button key={option.value} type="button" role="radio" aria-checked={checked} onClick={() => onChange(option.value)}
            className={cx("flex items-start gap-3 rounded-2xl border p-3.5 text-left transition", checked ? "border-brand bg-brand/10" : "border-line bg-surface hover:border-line-strong")}>
            <span className={cx("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", checked ? "border-brand bg-brand text-brand-ink" : "border-line-strong")}>
              {checked && <Check size={12} strokeWidth={3} aria-hidden />}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{option.title}</span>
              <span className="mt-0.5 block text-sm leading-5 text-ink-2">{option.detail}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Play                                                                */
/* ------------------------------------------------------------------ */

export const formatClock = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/**
 * The full-screen play frame. Turns focus mode on while mounted, so the tab
 * bar and sidebar are gone and the drill has the whole screen. The children
 * are laid out as a column that fills the viewport: put the question at the
 * top and the answer controls at the bottom (`<PlayDock>`), where thumbs are.
 */
export function PlayFrame({ title, onExit, progress, clock, streak, children, className }: {
  title: string;
  onExit: () => void;
  /** e.g. { done: 3, total: 20 }; `unit` names what is counted for screen readers ("Question", "Card"). */
  progress?: { done: number; total: number; unit?: string };
  clock?: number;
  streak?: number;
  children: ReactNode;
  className?: string;
}) {
  useFocusMode(true);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, []);
  const pct = progress && progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0;
  return (
    <div className={cx("mx-auto flex min-h-dvh max-w-3xl flex-col", className)}>
      <header className="sticky top-0 z-30 -mx-4 bg-bg/90 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6" style={{ paddingTop: "var(--safe-t)" }}>
        <div className="flex h-14 items-center gap-3">
          <button type="button" onClick={onExit} aria-label="End drill" className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-2 hover:bg-surface-2 hover:text-ink">
            <X size={22} aria-hidden />
          </button>
          <h1 ref={heading} tabIndex={-1} className="min-w-0 flex-1 truncate text-base font-semibold outline-none">{title}</h1>
          <div className="flex shrink-0 items-center gap-3 text-sm font-medium text-ink-2">
            {streak !== undefined && streak > 1 && <span className="inline-flex items-center gap-1 text-brand-text" aria-label={`${streak} in a row`}><Flame size={16} aria-hidden />{streak}</span>}
            {clock !== undefined && <span className="tnum inline-flex items-center gap-1" aria-label="Time"><Timer size={16} aria-hidden />{formatClock(clock)}</span>}
            {progress && <span className="tnum" aria-label={`${progress.unit ?? "Question"} ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`}>{Math.min(progress.done + 1, progress.total)}/{progress.total}</span>}
          </div>
        </div>
        {progress && (
          <div className="h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
        )}
      </header>
      <div className="flex flex-1 flex-col pb-4 pt-4">{children}</div>
    </div>
  );
}

/** The answer area, pinned to the bottom of the play frame. */
export function PlayDock({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("sticky bottom-0 z-20 -mx-4 mt-auto bg-bg/95 px-4 pt-3 backdrop-blur-xl sm:-mx-6 sm:px-6", className)} style={{ paddingBottom: "calc(var(--safe-b) + 0.75rem)" }}>{children}</div>;
}

/**
 * Right/wrong after an answer, with the reason. Enter or Space continues on a
 * keyboard; the button is the phone path.
 */
export function Feedback({ ok, title, children, onContinue, continueLabel = "Next" }: {
  ok: boolean; title: ReactNode; children?: ReactNode; onContinue?: () => void; continueLabel?: string;
}) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { button.current?.focus({ preventScroll: true }); }, []);
  return (
    <div role="status" className={cx("animate-pop rounded-2xl border p-3.5", ok ? "border-pos/30 bg-pos/10" : "border-neg/30 bg-neg/10")}>
      <div className="flex items-start gap-3">
        <span className={cx("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-white", ok ? "bg-pos" : "bg-neg")}>
          {ok ? <Check size={14} strokeWidth={3} aria-hidden /> : <X size={14} strokeWidth={3} aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          {children && <div className="mt-0.5 text-sm leading-6 text-ink-2">{children}</div>}
        </div>
      </div>
      {onContinue && (
        <Button ref={button} block className="mt-3" onClick={onContinue} trailing={<span className="hidden [@media(hover:hover)]:inline"><Kbd>↵</Kbd></span>}>{continueLabel}</Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

/** A score dial: the one number a summary leads with. */
export function ScoreDial({ value, label, sub }: { value: number; label: string; sub?: ReactNode }) {
  const pct = Math.max(0, Math.min(100, value));
  const radius = 44, circumference = 2 * Math.PI * radius;
  const tone = pct >= 90 ? "rgb(var(--pos))" : pct >= 70 ? "rgb(var(--brand))" : "rgb(var(--neg))";
  return (
    <div className="flex items-center gap-4">
      <svg width="104" height="104" viewBox="0 0 104 104" role="img" aria-label={`${label}: ${Math.round(pct)}%`} className="shrink-0 -rotate-90">
        <circle cx="52" cy="52" r={radius} fill="none" stroke="rgb(var(--surface-3))" strokeWidth="10" />
        <circle cx="52" cy="52" r={radius} fill="none" stroke={tone} strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct / 100)} />
        <text x="52" y="52" transform="rotate(90 52 52)" textAnchor="middle" dominantBaseline="central" className="fill-ink text-[1.375rem] font-semibold">{Math.round(pct)}%</text>
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-3">{label}</p>
        {sub && <div className="mt-1 text-sm leading-6 text-ink-2">{sub}</div>}
      </div>
    </div>
  );
}

export function DrillSummary({ title, score, scoreLabel = "Accuracy", scoreSub, stats, mistakes, onAgain, againLabel = "Go again", next, children }: {
  title: string;
  score: number;
  scoreLabel?: string;
  scoreSub?: ReactNode;
  stats?: readonly { label: string; value: ReactNode }[];
  mistakes?: readonly Mistake[];
  onAgain: () => void;
  againLabel?: string;
  /** A suggested next step, e.g. { href: "/train/true-count", label: "Try True Count" }. */
  next?: { href: string; label: string };
  children?: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, []);
  return (
    <div className="space-y-5">
      <div>
        <Link href="/train" className="-ml-1 mb-3 inline-flex h-8 items-center gap-1 rounded-lg pr-2 text-sm font-medium text-ink-2 hover:text-ink">
          <ChevronRight size={16} className="rotate-180" aria-hidden /> Train
        </Link>
        <h1 ref={heading} tabIndex={-1} className="text-[1.625rem] leading-tight outline-none sm:text-3xl">{title}</h1>
      </div>
      <Card className="space-y-5">
        <ScoreDial value={score} label={scoreLabel} sub={scoreSub} />
        {stats && stats.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 sm:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="min-w-0">
                <dt className="truncate text-xs font-medium text-ink-3">{stat.label}</dt>
                <dd className="tnum mt-0.5 text-lg font-semibold">{stat.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" onClick={onAgain} icon={<RotateCcw size={18} aria-hidden />}>{againLabel}</Button>
          {next && <ButtonLink size="lg" variant="secondary" href={next.href} trailing={<ChevronRight size={18} aria-hidden />}>{next.label}</ButtonLink>}
        </div>
      </Card>
      {children}
      {mistakes && mistakes.length > 0 && <MistakeList mistakes={mistakes} />}
    </div>
  );
}

export function MistakeList({ mistakes, title = "Review your misses" }: { mistakes: readonly Mistake[]; title?: string }) {
  return (
    <Card>
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      <ol className="divide-y divide-line">
        {mistakes.map((mistake, index) => (
          <li key={index} className="py-3 first:pt-0 last:pb-0">
            <p className="font-medium">{mistake.question}</p>
            <p className="mt-1 text-sm text-ink-2">
              You said <span className="font-semibold text-neg">{mistake.userAnswer}</span> · correct <span className="font-semibold text-pos">{mistake.correctAnswer}</span>
            </p>
            {mistake.explanation && <p className="mt-1 text-sm leading-6 text-ink-3">{mistake.explanation}</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** "You were last here 2 hours ago" with Continue / Start over. */
export function ResumeBanner({ detail, onResume, onDiscard }: { detail: ReactNode; onResume: () => void; onDiscard: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-brand/30 bg-brand/10 p-4 sm:flex-row sm:items-center">
      <p className="min-w-0 flex-1 text-sm leading-6"><span className="font-semibold">Unfinished session.</span> {detail}</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={onResume}>Continue</Button>
        <Button size="sm" variant="secondary" onClick={onDiscard}>Start over</Button>
      </div>
    </div>
  );
}
