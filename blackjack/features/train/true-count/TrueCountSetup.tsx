"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { DrillSetup, PresetPicker, SetupGroup } from "@/components/drill/DrillKit";
import { Segmented, SelectField } from "@/components/ui";
import type { DeckResolution } from "@/lib/blackjack/countingTraining";
import {
  describeTrueCountSession,
  QUESTION_TARGETS,
  RESOLUTION_LABEL,
  RESOLUTION_WORD,
  roundingExamples,
  ROUNDING_LABEL,
  SHOE_SIZES,
  TRUE_COUNT_FOCUS_LABEL,
  TRUE_COUNT_MODE_LABEL,
  TRUE_COUNT_SESSION_CARDS,
  type FeedbackMode,
  type TrueCountCardId,
  type TrueCountFocus,
  type TrueCountMode,
} from "@/lib/blackjack/countingSetup";
import { trueCount, type TrueCountRounding } from "@/lib/blackjack/hiLo";
import { AsideCard, CustomNote, Disclosure, ProgressAside, SessionLine, signedText } from "../counting-shared/parts";

export type TrueCountSetupState = { decks: number; mode: TrueCountMode; resolution: DeckResolution; focus: TrueCountFocus; feedbackMode: FeedbackMode; target: number };

export function TrueCountSetup({ setup, rounding, matched, onChange, onPick, onReset, resetLabel, onStart, resume, notice, bestAccuracy }: {
  setup: TrueCountSetupState;
  rounding: TrueCountRounding;
  matched: TrueCountCardId | null;
  onChange: (next: Partial<TrueCountSetupState>) => void;
  onPick: (id: TrueCountCardId) => void;
  onReset: () => void;
  resetLabel: string;
  onStart: () => void;
  resume?: ReactNode;
  notice?: ReactNode;
  bestAccuracy?: number;
}) {
  const exampleA = trueCount(7, 2.5, rounding), exampleB = trueCount(-3, 2, rounding);
  return (
    <DrillSetup
      title="True Count"
      intro="Turn a running count into a true count: work out the decks left, divide, and round."
      onStart={onStart}
      startLabel={`Start ${setup.target} questions`}
      resume={resume}
      aside={
        <>
          <AsideCard title="How to convert">
            <p className="font-semibold text-ink">True count = running count ÷ decks left.</p>
            <p className="tnum mt-2">With {ROUNDING_LABEL[rounding].toLowerCase()} rounding: +7 ÷ 2.5 = 2.8 → {signedText(exampleA)}; −3 ÷ 2 = −1.5 → {signedText(exampleB)}.</p>
          </AsideCard>
          <ProgressAside drill="True Count" best={{ label: "Best accuracy (10+ questions)", value: bestAccuracy === undefined ? "None yet" : `${bestAccuracy}%` }} />
        </>
      }
    >
      {notice}
      <SetupGroup title="Session">
        <PresetPicker<TrueCountCardId>
          label="Session"
          value={(matched ?? "custom") as TrueCountCardId}
          onChange={onPick}
          options={TRUE_COUNT_SESSION_CARDS.map((card) => ({ value: card.id, title: card.title, detail: card.description }))}
        />
        {matched === null && <div className="mt-2.5"><CustomNote onReset={onReset} resetLabel={resetLabel} /></div>}
      </SetupGroup>

      <SetupGroup title="Decks left" hint={setup.mode === "combined" ? "Each question shows a real photo of the discard tray. You estimate the decks left, then divide." : "We tell you the decks left. You divide and round."}>
        <Segmented<TrueCountMode> label="Decks left" hideLabel value={setup.mode} onChange={(mode) => onChange({ mode })}
          options={[{ value: "combined", label: "From the tray", hint: TRUE_COUNT_MODE_LABEL.combined }, { value: "division", label: TRUE_COUNT_MODE_LABEL.division }]} />
      </SetupGroup>

      <SetupGroup title="Decks in the shoe">
        <Segmented<number> label="Decks in the shoe" hideLabel value={setup.decks} onChange={(decks) => onChange({ decks })}
          options={SHOE_SIZES.map((decks) => ({ value: decks, label: String(decks) }))} />
      </SetupGroup>

      <Disclosure summary="Precision, focus and length">
        <Segmented<number> label="Round decks to the nearest" value={setup.resolution} onChange={(resolution) => onChange({ resolution: resolution as DeckResolution })}
          options={([1, 0.5, 0.25] as const).map((value) => ({ value, label: RESOLUTION_WORD[value].replace(/^./, (letter) => letter.toUpperCase()), hint: RESOLUTION_LABEL[value] }))} />
        <SelectField label="Practice focus" value={setup.focus} onChange={(event) => onChange({ focus: event.target.value as TrueCountFocus })}
          hint="Adaptive brings back the kinds of counts you miss. Near index plays: true counts within 1 of a number where the right play changes.">
          {(Object.keys(TRUE_COUNT_FOCUS_LABEL) as TrueCountFocus[]).map((focus) => <option key={focus} value={focus}>{TRUE_COUNT_FOCUS_LABEL[focus]}</option>)}
        </SelectField>
        <div className="grid gap-4 sm:grid-cols-2">
          <Segmented<number> label="Questions" value={setup.target} onChange={(target) => onChange({ target })}
            options={QUESTION_TARGETS.map((target) => ({ value: target, label: String(target) }))} />
          <Segmented<FeedbackMode> label="Show results" value={setup.feedbackMode} onChange={(feedbackMode) => onChange({ feedbackMode })}
            options={[{ value: "immediate", label: "After each" }, { value: "end", label: "At the end" }]} />
        </div>
      </Disclosure>

      <p className="text-sm leading-6 text-ink-2">
        True counts use <span className="font-semibold text-ink">{ROUNDING_LABEL[rounding].toLowerCase()}</span> rounding ({roundingExamples(rounding).replace(/-/g, "−")}).{" "}
        <Link href="/settings" className="font-semibold text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">Change it in Settings</Link>.
      </p>
      <SessionLine parts={describeTrueCountSession({ ...setup, rounding })} />
    </DrillSetup>
  );
}
