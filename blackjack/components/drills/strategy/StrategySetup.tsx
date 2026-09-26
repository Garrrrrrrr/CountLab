"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { KeyLegend, SetupCard } from "@/components/drill";
import { Disclosure, SegmentedControl } from "@/components/ui";
import { ROUND_LENGTHS, type ExplainMode, type RoundLength } from "@/lib/statistics/drillRound";
import type { Settings } from "@/lib/statistics/storage";
import { RulesLine, SetupSentence, SurrenderPicker, rulesSummary } from "./parts";

export const EXPLAIN_OPTIONS = [
  { value: "mistakes" as const, label: "Mistakes", ariaLabel: "Pause on mistakes" },
  { value: "every" as const, label: "Every hand", ariaLabel: "Pause on every hand" },
  { value: "never" as const, label: "Never", ariaLabel: "Never pause" },
];

export const EXPLAIN_HELP: Record<ExplainMode, string> = {
  mistakes: "Stop with the reason when you get one wrong. Correct answers move straight on.",
  every: "Stop after every hand to read the reason.",
  never: "Keep going. The last hand and its reason show at the top.",
};

export const EXPLAIN_SHORT: Record<ExplainMode, string> = { mistakes: "Pause on mistakes", every: "Pause every hand", never: "No pauses" };

/** "6D H17 DAS RSA LS", for the one-line setup summary. */
export const rulesShort = (settings: Settings) =>
  [`${settings.decks}D`, settings.dealerHitsSoft17 ? "H17" : "S17", settings.doubleAfterSplit ? "DAS" : "NDAS", settings.resplitAces ? "RSA" : "NRSA", settings.surrender === "none" ? "NS" : settings.surrender === "late" ? "LS" : "ES10"].join(" ");

export interface ModeOption<T extends string> {
  value: T;
  label: string;
  ariaLabel?: string;
  help: ReactNode;
}

/**
 * The strategy drills' setup: what to practise, how long, when to pause, and
 * the table rules, above the one Start. Readers with history see the choices
 * as one line with Change, so the common case is a single Enter.
 */
export function StrategySetup<T extends string>({ settings, notices, compact, onExpand, modeLabel, modes, mode, onMode, modeNote, length, onLength, explain, onExplain, rulesNote, keys, onStart, footnote }: {
  settings: Settings;
  notices?: ReactNode;
  compact: boolean;
  onExpand: () => void;
  modeLabel: string;
  modes: ReadonlyArray<ModeOption<T>>;
  mode: T;
  onMode: (mode: T) => void;
  /** Under the mode's description, e.g. "Next focus: Soft totals". */
  modeNote?: ReactNode;
  length: RoundLength;
  onLength: (length: RoundLength) => void;
  explain: ExplainMode;
  onExplain: (explain: ExplainMode) => void;
  rulesNote?: ReactNode;
  keys: ReadonlyArray<{ keys: readonly string[]; label: ReactNode }>;
  onStart: () => void;
  footnote?: ReactNode;
}) {
  const current = modes.find((option) => option.value === mode) ?? modes[0];
  return (
    <div className="max-w-2xl">
      <SetupCard title="Set up your round" notice={notices} startLabel={`Start ${length} hands`} onStart={onStart} footnote={footnote}>
        {compact ? (
          <SetupSentence parts={[`${length} hands`, current.label, EXPLAIN_SHORT[explain], rulesShort(settings)]} onChange={onExpand} />
        ) : (
          <>
            <div className="grid gap-2">
              <SegmentedControl label={modeLabel} value={mode} onChange={onMode} options={modes} fullWidth analyticsField="drill_mode" />
              <p className="text-xs leading-5 text-[var(--ink-muted)]">{current.help}</p>
              {modeNote && <p className="text-xs font-medium leading-5 text-[var(--ink)]">{modeNote}</p>}
            </div>
            <SegmentedControl
              label="Hands per round"
              value={String(length)}
              onChange={(value) => onLength(Number(value) as RoundLength)}
              options={ROUND_LENGTHS.map((value) => ({ value: String(value), label: String(value), ariaLabel: `${value} hands` }))}
              fullWidth
              analyticsField="drill_length"
            />
            <div className="grid gap-2">
              <SegmentedControl label="Pause to explain" value={explain} onChange={onExplain} options={EXPLAIN_OPTIONS} fullWidth analyticsField="drill_explain" />
              <p className="text-xs leading-5 text-[var(--ink-muted)]">{EXPLAIN_HELP[explain]}</p>
            </div>
            <RulesLine label="Table rules" summary={rulesSummary(settings)}>
              <SurrenderPicker value={settings.surrender} />
            </RulesLine>
            {rulesNote && <p className="-mt-2 text-xs leading-5 text-[var(--ink-muted)]">{rulesNote}</p>}
            <div className="hidden [@media(pointer:fine)]:block">
              {settings.shortcuts ? (
                <Disclosure summary="Keyboard shortcuts" analyticsSection="drill_shortcuts">
                  <KeyLegend label="Answer with one key" items={keys} />
                </Disclosure>
              ) : (
                <p className="text-xs text-[var(--ink-muted)]">Keyboard shortcuts are off. <Link href="/settings" className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline">Turn them on in Settings.</Link></p>
              )}
            </div>
          </>
        )}
      </SetupCard>
    </div>
  );
}
