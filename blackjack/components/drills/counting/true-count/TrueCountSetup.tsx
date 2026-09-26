"use client";
import Link from "next/link";
import { ReactNode } from "react";
import { ChoiceCards, SetupCard } from "@/components/drill";
import { SegmentedControl, Select } from "@/components/ui";
import type { DeckResolution } from "@/lib/blackjack/countingTraining";
import {
  describeTrueCountSession,
  roundingExamples,
  ROUNDING_LABEL,
  TRUE_COUNT_FOCUS_LABEL,
  TRUE_COUNT_SESSION_CARDS,
  type FeedbackMode,
  type TrueCountCardId,
  type TrueCountFocus,
  type TrueCountMode,
} from "@/lib/blackjack/countingSetup";
import type { TrueCountRounding } from "@/lib/blackjack/hiLo";
import { Customize, WithHelp } from "../Customize";
import { CustomNote, SessionSentence } from "../SetupParts";

export type TrueCountSetupState = { decks: number; mode: TrueCountMode; resolution: DeckResolution; focus: TrueCountFocus; feedbackMode: FeedbackMode; target: number };

const CARD_ICON: Record<TrueCountCardId, string> = { starter: "fa-seedling", division: "fa-divide", tray: "fa-layer-group", index: "fa-bullseye", "last-deck": "fa-hourglass-half" };
export const SHOE_SIZES = [1, 2, 4, 6, 8];
export const QUESTION_TARGETS = [5, 10, 20];

const toNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function TrueCountSetup({ setup, rounding, matched, onChange, onPickCard, onReset, resetLabel, customizeOpen, onCustomizeOpen, firstTime, notice, onStart }: {
  setup: TrueCountSetupState;
  rounding: TrueCountRounding;
  matched: TrueCountCardId | null;
  onChange: (next: Partial<TrueCountSetupState>) => void;
  onPickCard: (id: TrueCountCardId) => void;
  onReset: () => void;
  resetLabel: string;
  customizeOpen: boolean;
  onCustomizeOpen: (open: boolean) => void;
  firstTime: boolean;
  notice?: ReactNode;
  onStart: () => void;
}) {
  return (
    <SetupCard
      title="Choose a session"
      description="Each question gives a running count partway through a shoe. You turn it into a true count."
      notice={notice}
      startLabel={`Start ${setup.target} questions`}
      onStart={onStart}
    >
      <ChoiceCards
        legend="Session"
        hideLegend
        name="true-count-session"
        value={matched}
        onChange={onPickCard}
        options={TRUE_COUNT_SESSION_CARDS.map((card) => ({
          value: card.id,
          title: card.title,
          description: card.description,
          meta: card.meta,
          icon: CARD_ICON[card.id],
          badge: card.id === "starter" && firstTime ? "Recommended first" : undefined,
        }))}
      />
      {matched === null && <CustomNote resetLabel={resetLabel} onReset={onReset} />}
      <SegmentedControl
        label="Shoe size (decks)"
        name="true-count-shoe"
        value={String(setup.decks)}
        onChange={(value) => onChange({ decks: toNumber(value, setup.decks) })}
        options={SHOE_SIZES.map((decks) => ({ value: String(decks), label: String(decks) }))}
        fullWidth
      />
      <SessionSentence parts={describeTrueCountSession({ ...setup, rounding })} />
      <Customize
        open={customizeOpen}
        onOpenChange={onCustomizeOpen}
        custom={matched === null}
        footnote={<>True counts use {ROUNDING_LABEL[rounding]} rounding: {roundingExamples(rounding)}. <Link href="/settings" className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline">Change it in Settings</Link>. Show results and Questions apply to this session only; their defaults are in Settings too.</>}
      >
        <SegmentedControl<TrueCountMode>
          label="What you answer"
          value={setup.mode}
          onChange={(mode) => onChange({ mode })}
          options={[{ value: "combined", label: "Decks left + true count" }, { value: "division", label: "True count only" }]}
          fullWidth
          className="sm:col-span-2"
        />
        <SegmentedControl
          label="Round decks to the nearest"
          value={String(setup.resolution)}
          onChange={(value) => { const resolution = toNumber(value, setup.resolution); if (resolution === 1 || resolution === 0.5 || resolution === 0.25) onChange({ resolution }); }}
          options={[{ value: "1", label: "Full deck" }, { value: "0.5", label: "Half deck" }, { value: "0.25", label: "Quarter deck" }]}
          help="How precisely you estimate the decks left before dividing. Most counters use half decks."
          fullWidth
        />
        <WithHelp label="Practice focus" help="Which counts come up. Adaptive brings back the kinds you miss. Near index plays: true counts within 1 of a Hi-Lo index number, where the right play changes.">
          <Select label="Practice focus" value={setup.focus} onChange={(event) => onChange({ focus: event.target.value as TrueCountFocus })}>
            {(Object.keys(TRUE_COUNT_FOCUS_LABEL) as TrueCountFocus[]).map((focus) => <option key={focus} value={focus}>{TRUE_COUNT_FOCUS_LABEL[focus]}</option>)}
          </Select>
        </WithHelp>
        <SegmentedControl<FeedbackMode>
          label="Show results"
          value={setup.feedbackMode}
          onChange={(feedbackMode) => onChange({ feedbackMode })}
          options={[{ value: "immediate", label: "After each question" }, { value: "end", label: "At the end" }]}
          fullWidth
        />
        <SegmentedControl
          label="Questions"
          value={String(setup.target)}
          onChange={(value) => onChange({ target: toNumber(value, setup.target) })}
          options={QUESTION_TARGETS.map((target) => ({ value: String(target), label: String(target) }))}
          fullWidth
        />
      </Customize>
    </SetupCard>
  );
}
