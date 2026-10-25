"use client";
import Link from "next/link";
import { CalendarClock, Check, Grid3x3, X } from "lucide-react";
import { Button, Card, ConfirmSheet, cx, Segmented } from "@/components/ui";
import { REVIEW_LIMIT } from "@/lib/strategy-drills/review";
import { ROUND_LENGTHS, relativeTime, type ExplainMode, type RoundLength } from "@/lib/statistics/drillRound";
import type { Session } from "@/lib/statistics/storage";
import { SURRENDER_SHORT, type TableRules } from "@/lib/strategy";

export const EXPLAIN_HELP: Record<ExplainMode, string> = {
  mistakes: "Stop with the reason when you get one wrong. Right answers move straight on.",
  every: "Stop after every hand to read the reason and see the chart.",
  never: "Keep going. The last hand shows at the top; every miss is explained at the end.",
};

export function LengthPicker({ value, onChange, unit = "hands" }: { value: RoundLength; onChange: (value: RoundLength) => void; unit?: string }) {
  return <Segmented label={`${unit[0].toUpperCase()}${unit.slice(1)} per round`} value={value} onChange={onChange} options={ROUND_LENGTHS.map((length) => ({ value: length, label: String(length) }))} />;
}

export function ExplainPicker({ value, onChange }: { value: ExplainMode; onChange: (value: ExplainMode) => void }) {
  return (
    <div>
      <Segmented label="Explain" value={value} onChange={onChange}
        options={[{ value: "mistakes", label: "Mistakes" }, { value: "every", label: "Every hand" }, { value: "never", label: "Never" }]} />
      <p className="mt-1.5 text-sm leading-5 text-ink-3">{EXPLAIN_HELP[value]}</p>
    </div>
  );
}

/** The rules part of the drill_started payload, in the shape the analytics adapter already reads. */
export function startedRules(rules: TableRules) {
  return {
    decks: rules.decks,
    rulesPreset: `${rules.decks}d_${rules.hitSoft17 ? "h17" : "s17"}_${rules.das ? "das" : "ndas"}_${SURRENDER_SHORT[rules.surrender].toLowerCase()}`,
    dealerRule: rules.hitSoft17 ? "H17" : "S17",
    das: rules.das,
    surrender: rules.surrender,
  };
}

/** One line at the top of the play area when answers do not pause: what the last hand was, and whether it was right. */
export function LastAnswer({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p className={cx("animate-fade flex items-center gap-2 rounded-xl border px-3 py-2 text-sm", ok ? "border-pos/25 bg-pos/10" : "border-neg/25 bg-neg/10")}>
      <span className={cx("grid h-5 w-5 shrink-0 place-items-center rounded-full text-white", ok ? "bg-pos" : "bg-neg")}>
        {ok ? <Check size={12} strokeWidth={3} aria-hidden /> : <X size={12} strokeWidth={3} aria-hidden />}
      </span>
      <span className="min-w-0 truncate"><span className="sr-only">{ok ? "Right. " : "Missed. "}</span>{text}</span>
    </p>
  );
}

export function EndRoundSheet({ open, answered, length, onConfirm, onClose }: { open: boolean; answered: number; length: number; onConfirm: () => void; onClose: () => void }) {
  return (
    <ConfirmSheet open={open} onClose={onClose} onConfirm={onConfirm} title="End this round?" confirmLabel="End and save" tone="primary">
      You have answered {answered} of {length}. Those answers are saved to your history; the rest of the round is dropped.
    </ConfirmSheet>
  );
}

/** Start was pressed while a saved round waits: starting over discards it, so ask first. */
export function ReplaceRoundSheet({ open, detail, onConfirm, onClose }: { open: boolean; detail: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <ConfirmSheet open={open} onClose={onClose} onConfirm={onConfirm} title="Start over?" confirmLabel="Discard and start">
      {detail} Starting a new one discards it.
    </ConfirmSheet>
  );
}

/**
 * Missed items whose review has come round: a miss comes back at once, then
 * after 1, 3, 7 and 16 days of right answers. Nothing shows when none are due.
 */
export function ReviewDue({ count, unit, onStart }: { count: number; unit: [string, string]; onStart: () => void }) {
  if (!count) return null;
  const noun = count === 1 ? unit[0] : unit[1];
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-brand/30 bg-brand/10 p-4 sm:flex-row sm:items-center">
      <p className="flex min-w-0 flex-1 items-start gap-2.5 text-sm leading-6">
        <CalendarClock size={18} aria-hidden className="mt-0.5 shrink-0 text-brand-text" />
        <span><span className="font-semibold">Review due: <span className="tnum">{count}</span> {noun}.</span> Ones you missed before come back on later days until they stick.</span>
      </p>
      <Button onClick={onStart} className="shrink-0">Review {count > REVIEW_LIMIT ? REVIEW_LIMIT : count}</Button>
    </div>
  );
}

/** The setup screen's side column: the last few rounds, and a way to the chart. */
export function RecentRounds({ sessions, unit = "hands", chartHref = "/charts", chartLabel = "Open the strategy chart" }: { sessions: readonly Session[]; unit?: string; chartHref?: string; chartLabel?: string }) {
  const recent = sessions.slice(0, 5);
  const total = sessions.reduce((sum, session) => sum + session.questions, 0);
  return (
    <Card>
      <h2 className="text-base font-semibold">Your recent rounds</h2>
      {recent.length ? (
        <>
          <p className="mt-0.5 text-sm text-ink-2"><span className="tnum">{total}</span> {unit} practised so far.</p>
          <ul className="mt-3 divide-y divide-line">
            {recent.map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-ink-2">{relativeTime(session.date)}{session.tags?.includes("retry") ? " · retry" : ""}</span>
                <span className="tnum font-semibold">{session.accuracy}% <span className="font-normal text-ink-3">of {session.questions}</span></span>
              </li>
            ))}
          </ul>
        </>
      ) : <p className="mt-1 text-sm leading-6 text-ink-2">No rounds yet. Your accuracy and misses will show here.</p>}
      <Link href={chartHref} className="mt-3 inline-flex h-11 items-center gap-2 text-sm font-semibold text-brand-text hover:underline">
        <Grid3x3 size={16} aria-hidden /> {chartLabel}
      </Link>
    </Card>
  );
}
