"use client";
import Link from "next/link";
import { ReactNode, useEffect, useId, useState } from "react";
import { ButtonLink, Callout, Disclosure, GhostButton, SegmentedControl } from "@/components/ui";
import { ConfirmModal } from "@/components/ConfirmModal";
import { checklistProgress, relativeTime } from "@/lib/statistics/drillRound";
import { storage, type DrillType, type Session, type Settings, type SurrenderRule } from "@/lib/statistics/storage";

/** The page-header link to the matching reference chart: one per page, visible from Setup. */
export function ReferenceLink({ href, label, className = "" }: { href: string; label: string; className?: string }) {
  return (
    <ButtonLink href={href} variant="quiet" className={`gap-2 text-sm ${className}`}>
      <i className="fa-solid fa-table-cells text-xs text-[var(--ink-muted)]" aria-hidden="true" />{label}
    </ButtonLink>
  );
}

/** The table rules in words: "6 decks · Dealer hits soft 17 · Double after split · Resplit aces · Late surrender". */
export function rulesSummary(settings: Settings, { resplit = true }: { resplit?: boolean } = {}) {
  return [
    `${settings.decks} deck${settings.decks === 1 ? "" : "s"}`,
    settings.dealerHitsSoft17 ? "Dealer hits soft 17" : "Dealer stands on soft 17",
    settings.doubleAfterSplit ? "Double after split" : "No double after split",
    ...(resplit ? [settings.resplitAces ? "Resplit aces" : "No resplitting aces"] : []),
    settings.surrender === "none" ? "No surrender" : settings.surrender === "late" ? "Late surrender" : "Early surrender vs 10",
  ].join(" · ");
}

/**
 * The rules a drill is using, with an inline editor. Only the surrender rule
 * changes here; the rest is set once in Settings.
 */
export function RulesLine({ label, summary, children }: { label: string; summary: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const editorId = useId();
  return (
    <div className="min-w-0 rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-[.8rem] font-medium tracking-[.01em] text-[var(--ink-muted)]">{label}</p>
          <p className="mt-0.5 text-sm leading-6 text-[var(--ink)]">{summary}</p>
        </div>
        <GhostButton size="compact" aria-expanded={open} aria-controls={editorId} onClick={() => setOpen((current) => !current)}>
          {open ? "Done" : "Change"}
        </GhostButton>
      </div>
      <div id={editorId} hidden={!open}>
        <div className="mt-3 grid gap-3 border-t border-[var(--rule)] pt-3">{children}</div>
      </div>
    </div>
  );
}

const SURRENDER_OPTIONS = [
  { value: "none" as const, label: "None" },
  { value: "late" as const, label: "Late" },
  { value: "early" as const, label: "Early vs 10", ariaLabel: "Early surrender against a 10" },
];

/**
 * The table's surrender rule. It is a saved setting shared with the reference
 * chart and Settings, so it is written only on a real change: re-picking the
 * current option does nothing, and "none" is never turned into "late".
 */
export function SurrenderPicker({ value, disabled = false, note }: { value: SurrenderRule; disabled?: boolean; note?: ReactNode }) {
  const choose = (next: SurrenderRule) => {
    const current = storage.settings();
    if (next === current.surrender) return;
    storage.saveSettings({ ...current, surrender: next });
  };
  return (
    <div className="grid min-w-0 gap-2">
      <SegmentedControl
        label="Surrender"
        value={value}
        onChange={choose}
        options={SURRENDER_OPTIONS.map((option) => ({ ...option, disabled }))}
        fullWidth
        analyticsField="drill_surrender_rule"
        help="Saved to your table rules. Late: give up half the bet after the dealer checks for blackjack. Early vs 10: give up before that check, against a 10."
      />
      {note && <p className="text-xs leading-5 text-[var(--ink-muted)]">{note}</p>}
      <Link href="/settings" className="text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline">Decks, soft 17, doubling and resplitting are set in Settings</Link>
    </div>
  );
}

/**
 * A collapsed group of the choices most readers leave alone, whose summary
 * line still says what they are set to.
 */
export function MoreOptions({ values, analyticsSection, children }: { values: readonly string[]; analyticsSection: string; children: ReactNode }) {
  return (
    <Disclosure
      analyticsSection={analyticsSection}
      summaryClassName="flex-wrap gap-y-0"
      summary={<>More options <span className="text-xs font-normal text-[var(--ink-muted)]">{values.join(" · ")}</span></>}
    >
      <div className="grid gap-5 pt-2">{children}</div>
    </Disclosure>
  );
}

/** A setup's settings in one line, for readers who already know the drill. */
export function SetupSentence({ parts, onChange }: { parts: readonly string[]; onChange: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-3">
      <p className="min-w-0 flex-1 text-sm leading-6 text-[var(--ink)]">
        <span className="sr-only">This round: </span>
        {parts.map((part, index) => <span key={part}>{index > 0 && <span aria-hidden="true" className="text-[var(--ink-muted)]"> · </span>}{index > 0 && <span className="sr-only">, </span>}{part}</span>)}
      </p>
      <GhostButton size="compact" aria-expanded={false} onClick={onChange}>Change</GhostButton>
    </div>
  );
}

/** "Last round" and today's checklist progress, under Start and in the summary. */
export function PracticeLines({ drill, sessions, unit, showLast = true }: { drill: DrillType; sessions: readonly Session[]; unit: { one: string; many: string }; showLast?: boolean }) {
  // Relative times and "today" depend on the clock, so they are filled in after mount.
  const [now, setNow] = useState<number>();
  useEffect(() => { setNow(Date.now()); }, [sessions]);
  if (now === undefined) return null;
  const last = sessions.find((session) => session.drill === drill);
  const today = checklistProgress(sessions, drill, new Date(now));
  return (
    <span className="grid gap-1">
      {showLast && last && <span>Last {drill === "H17 Chart" ? "chart" : "round"}: {last.correct} of {last.questions} correct · {relativeTime(last.date, now)}</span>}
      {today && (
        <span>
          Today: {today.current} of {today.target} {today.target === 1 ? unit.one : unit.many}
          {today.done && <i className="fa-solid fa-check ml-1 text-[var(--accent)]" aria-hidden="true" />}
          {" · "}<Link href="/training/checklist" className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline">Daily checklist</Link>
        </span>
      )}
    </span>
  );
}

/** What a discard confirmation loses: "Its 3 answers will not be saved.", or that nothing is lost. */
function discardedAnswers(answered: number, owner: "Its" | "Your") {
  if (answered === 0) return "Nothing in it has been answered yet, so no answers are lost.";
  const count = answered === 1 ? "1 answer" : `${answered} answers`;
  return owner === "Its" ? `Its ${count} will not be saved.` : `Your ${count} in this round will not be saved.`;
}

/**
 * Resumed progress, made visible: where the round picks up (including a retry
 * or focused round resumed before its first answer), and a way to discard it
 * that says how many answers go with it.
 */
export function RoundResumeNotice({ title, detail, answered, updatedAt, onDiscard }: { title: string; detail: string; answered: number; updatedAt?: string; onDiscard: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState("");
  useEffect(() => { setSaved(relativeTime(updatedAt)); }, [updatedAt]);
  return (
    <>
      <Callout tone="info" title={title} action={<GhostButton size="compact" onClick={() => setConfirming(true)}>Discard round</GhostButton>}>
        {detail}{answered > 0 && " Your earlier answers are kept."}{saved && ` Saved ${saved}.`}
      </Callout>
      <ConfirmModal
        open={confirming}
        tone="danger"
        title="Discard this round?"
        description={`${discardedAnswers(answered, "Your")} Rounds you finished are not affected.`}
        confirmLabel="Discard round"
        cancelLabel="Keep going"
        onCancel={() => setConfirming(false)}
        onConfirm={() => { setConfirming(false); onDiscard(); }}
      />
    </>
  );
}

/** Unfinished progress found while Setup is open (another device, or a focus hand-off): resume or discard. */
export function UnfinishedRoundCallout({ detail, answered, updatedAt, onResume, onDiscard, resumeLabel = "Continue round", noun = "round" }: { detail: string; answered: number; updatedAt?: string; onResume: () => void; onDiscard: () => void; resumeLabel?: string; noun?: "round" | "chart" }) {
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState("");
  useEffect(() => { setSaved(relativeTime(updatedAt)); }, [updatedAt]);
  return (
    <>
      <Callout
        tone="info"
        title={`You have an unfinished ${noun}`}
        action={<><GhostButton size="compact" onClick={onResume}><i className="fa-solid fa-play mr-1.5 text-xs" aria-hidden="true" />{resumeLabel}</GhostButton><GhostButton size="compact" onClick={() => setConfirming(true)}>Discard</GhostButton></>}
      >
        {detail}{saved && ` · saved ${saved}`}
      </Callout>
      <ConfirmModal
        open={confirming}
        tone="danger"
        title={`Discard the unfinished ${noun}?`}
        description={discardedAnswers(answered, "Its")}
        confirmLabel={`Discard ${noun}`}
        cancelLabel="Keep it"
        onCancel={() => setConfirming(false)}
        onConfirm={() => { setConfirming(false); onDiscard(); }}
      />
    </>
  );
}

/** The confirmation behind End round once something has been answered. */
export function EndRoundConfirm({ open, answered, length, onConfirm, onCancel }: { open: boolean; answered: number; length: number; onConfirm: () => void; onCancel: () => void }) {
  return (
    <ConfirmModal
      open={open}
      title="End this round?"
      description={`${answered} of ${length} ${length === 1 ? "hand" : "hands"} answered. ${answered === 1 ? "That answer" : `Those ${answered} answers`} will be saved to your stats as a shorter round.`}
      confirmLabel="End and save"
      cancelLabel="Keep going"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

/** The last few answers of the round, newest first, for the rail beside the table on wide screens. */
export function RoundLog({ entries }: { entries: ReadonlyArray<{ id: number; ok: boolean; text: string; detail?: string; ms: number }> }) {
  return (
    <section aria-label="This round" className="surface rounded-2xl p-4">
      <h2 className="text-sm font-semibold">This round</h2>
      {entries.length === 0 ? (
        <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">Your answers will appear here.</p>
      ) : (
        <ol className="mt-2 space-y-1.5">
          {entries.slice(-8).reverse().map((entry) => (
            <li key={entry.id} className="flex min-w-0 items-baseline gap-2 text-sm">
              <i className={`fa-solid ${entry.ok ? "fa-check text-[var(--accent)]" : "fa-xmark text-[var(--negative)]"} w-3 shrink-0 text-xs`} aria-hidden="true" />
              <span className="sr-only">{entry.ok ? "Right:" : "Wrong:"}</span>
              <span className="min-w-0 flex-1 truncate font-data text-[.8rem] text-[var(--ink)]">{entry.text}{entry.detail && <span className="text-[var(--ink-muted)]"> · {entry.detail}</span>}</span>
              <span className="shrink-0 font-data text-[.7rem] text-[var(--ink-muted)]">{(entry.ms / 1000).toFixed(1)} s</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * The answer just played when the round moved straight on: one line, with
 * the reason one tap away.
 */
export function LastAnswerStrip({ ok, summary, children }: { ok: boolean; summary: ReactNode; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={`mb-4 rounded-xl border px-3 py-2 text-sm ${ok ? "border-emerald-500/25 bg-emerald-400/[.06]" : "border-red-500/25 bg-red-500/[.05]"}`}>
      <div className="flex min-w-0 items-center gap-2">
        <i className={`fa-solid ${ok ? "fa-check text-[var(--accent)]" : "fa-xmark text-[var(--negative)]"} shrink-0 text-xs`} aria-hidden="true" />
        <p className="min-w-0 flex-1 text-[var(--ink)]"><span className="sr-only">{ok ? "Right. " : "Wrong. "}</span>{summary}</p>
        {children && (
          <GhostButton size="compact" aria-expanded={open} aria-controls={id} onClick={() => setOpen((current) => !current)} className="shrink-0">
            Why?
          </GhostButton>
        )}
      </div>
      {children && <div id={id} hidden={!open} className="mt-2 border-t border-[var(--rule)] pt-2 text-[var(--ink-muted)]">{children}</div>}
    </div>
  );
}
