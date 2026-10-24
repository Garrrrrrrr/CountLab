"use client";
import type { ReactNode } from "react";
import { DrillSetup, PresetPicker, SetupGroup } from "@/components/drill/DrillKit";
import { Badge, Segmented, SelectField, Toggle } from "@/components/ui";
import type { CountBias } from "@/lib/blackjack/countingTraining";
import {
  checkpointsFor,
  CHECKPOINT_LABEL,
  dealOf,
  describeRunningSession,
  effectiveCardCount,
  fitCheckpoint,
  formatInterval,
  RUNNING_INTERVALS,
  runningCardMeta,
  SHOE_SIZES,
  spotsOf,
  TABLE_SPOTS,
  type FeedbackMode,
  type RunningCardId,
  type RunningCheckpoint,
  type RunningGroup,
  type RunningValues,
} from "@/lib/blackjack/countingSetup";
import { CustomNote, Disclosure, HiLoValues, AsideCard, ProgressAside, SessionLine } from "../counting-shared/parts";

export type RunningSetupState = RunningValues & {
  bias: CountBias;
  feedbackMode: FeedbackMode;
  /** Show each card's Hi-Lo value under it (on for the Beginner session). */
  hints: boolean;
};

/** Titles and one-line pitches for the picker; the values live in countingSetup. */
export const RUNNING_CARD_COPY: Record<RunningCardId, { title: string; detail: string }> = {
  starter: { title: "Beginner", detail: "Single cards with their values shown, checked every 5 cards." },
  "two-card-cancellation": { title: "Pairs that cancel", detail: "Cards in pairs, so +1 and −1 cancel at a glance." },
  "one-deck-speed": { title: "One-deck speed", detail: "A full deck and one check at the end: the 30-second benchmark." },
  "six-deck-casino": { title: "Six-deck casino speed", detail: "Groups of 1–4 cards at table pace, checked at random." },
  table: { title: "Full table", detail: "Whole rounds at a three-spot table: players draw, then the dealer." },
  recovery: { title: "Interruption recovery", detail: "You are interrupted halfway and must hold the count." },
};

type Deal = "single" | "groups" | "table";

const AMOUNTS = [10, 20, 30, 52, 78, 104, 156, 208, 234, 312, 416];
/** Session lengths that fit the shoe (one card is burned), plus the current one if a preset set something else. */
function amountOptions(decks: number, current: number) {
  const max = decks * 52;
  const list = AMOUNTS.filter((amount) => amount < max - 1);
  list.push(max);
  if (current <= max && !list.includes(current) && effectiveCardCount(decks, current) < max - 1) list.push(current);
  return [...new Set(list)].sort((a, b) => a - b);
}
const dealChoice = (setup: RunningSetupState): Deal => (dealOf(setup) === "table" ? "table" : setup.group === "1" ? "single" : "groups");

export function RunningSetup({ setup, cards, matched, onChange, onPick, onReset, resetLabel, onStart, resume, firstTime, fastestPerfect }: {
  setup: RunningSetupState;
  cards: ReadonlyArray<{ id: RunningCardId; values: RunningValues }>;
  matched: RunningCardId | null;
  onChange: (next: Partial<RunningSetupState>) => void;
  onPick: (id: RunningCardId) => void;
  onReset: () => void;
  resetLabel: string;
  onStart: () => void;
  resume?: ReactNode;
  firstTime: boolean;
  fastestPerfect?: number;
}) {
  const deal = dealChoice(setup);
  const maxCards = setup.decks * 52 - 1;
  const setDeal = (next: Deal) => {
    if (next === "table") onChange({ deal: "table", spots: spotsOf(setup), group: "1", checkpoint: fitCheckpoint(setup.checkpoint, "table") });
    else onChange({ deal: "cards", group: next === "single" ? "1" : setup.group === "1" ? "random" : setup.group, checkpoint: fitCheckpoint(setup.checkpoint, "cards") });
  };
  return (
    <DrillSetup
      title="Running Count"
      intro="Keep the Hi-Lo count in your head while the cards go by. Now and then we stop and ask for it."
      onStart={onStart}
      startLabel="Start counting"
      resume={resume}
      aside={
        <>
          <AsideCard title="Hi-Lo values">
            <HiLoValues />
            <p className="mt-3">Add each card&apos;s value as it appears. The total is the running count.</p>
          </AsideCard>
          <ProgressAside drill="Running Count" best={{ label: "Fastest perfect deck", value: fastestPerfect ? `${fastestPerfect.toFixed(1)} s` : "None yet" }} />
        </>
      }
    >
      <SetupGroup title="Session">
        <PresetPicker
          label="Session"
          value={(matched ?? "custom") as RunningCardId}
          onChange={onPick}
          options={cards.map((card) => ({
            value: card.id,
            title: `${RUNNING_CARD_COPY[card.id].title}${card.id === "starter" && firstTime ? " · start here" : ""}`,
            detail: `${RUNNING_CARD_COPY[card.id].detail} ${runningCardMeta(card.values)}.`,
          }))}
        />
        {matched === null && <div className="mt-2.5"><CustomNote onReset={onReset} resetLabel={resetLabel} /></div>}
      </SetupGroup>

      <SetupGroup title="How the cards come">
        <div className="space-y-4">
          <Segmented<Deal> label="Deal" hideLabel value={deal} onChange={setDeal}
            options={[{ value: "single", label: "Single cards" }, { value: "groups", label: "Groups" }, { value: "table", label: "Table rounds" }]} />
          {deal === "groups" && (
            <Segmented<RunningGroup> label="Cards at once" value={setup.group} onChange={(group) => onChange({ group })}
              options={[{ value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }, { value: "random", label: "1–4", hint: "A random 1 to 4 each time" }]} />
          )}
          {deal === "table" && (
            <Segmented<number> label="Player spots" value={spotsOf(setup)} onChange={(spots) => onChange({ spots })}
              options={TABLE_SPOTS.map((spots) => ({ value: spots, label: String(spots) }))} />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label={deal === "groups" ? "Time per group" : "Time per card"} value={setup.speed} onChange={(event) => onChange({ speed: Number(event.target.value) })}
              hint={setup.speed === 0 ? "The next card waits for a tap, Space or Enter." : undefined}>
              {RUNNING_INTERVALS.map((ms) => <option key={ms} value={ms}>{formatInterval(ms)}</option>)}
            </SelectField>
            <SelectField label="Cards in the session" value={setup.amount} onChange={(event) => onChange({ amount: Number(event.target.value) })}>
              {amountOptions(setup.decks, setup.amount).map((amount) => (
                <option key={amount} value={amount}>{effectiveCardCount(setup.decks, amount) >= maxCards ? `${maxCards} (the whole shoe)` : amount}</option>
              ))}
            </SelectField>
          </div>
          <Segmented<number> label="Decks in the shoe" value={setup.decks}
            onChange={(decks) => onChange({ decks, amount: Math.min(setup.amount, decks * 52) })}
            options={SHOE_SIZES.map((decks) => ({ value: decks, label: String(decks) }))} />
        </div>
      </SetupGroup>

      <Disclosure summary={<span className="inline-flex items-center gap-2">Checks and extras {setup.interruption && <Badge tone="brand">Interruption on</Badge>}</span>}>
        <SelectField label="Ask for the count" value={setup.checkpoint} onChange={(event) => onChange({ checkpoint: event.target.value as RunningCheckpoint })}>
          {checkpointsFor(dealOf(setup)).map((checkpoint) => <option key={checkpoint} value={checkpoint}>{CHECKPOINT_LABEL[checkpoint]}</option>)}
        </SelectField>
        <Segmented<FeedbackMode> label="Show results" value={setup.feedbackMode} onChange={(feedbackMode) => onChange({ feedbackMode })}
          options={[{ value: "immediate", label: "After each check" }, { value: "end", label: "At the end" }]} />
        {deal !== "table" && (
          <SelectField label="Card mix" value={setup.bias} onChange={(event) => onChange({ bias: event.target.value as CountBias })}
            hint="Stretches bunch low or high cards together, so the count swings further than usual.">
            <option value="none">Balanced</option>
            <option value="positive">Positive stretches</option>
            <option value="negative">Negative stretches</option>
          </SelectField>
        )}
        <Toggle label="Interrupt me once, halfway" description="The cards stop and you look away; then we ask for the count." checked={setup.interruption} onChange={(interruption) => onChange({ interruption })} />
        <Toggle label="Show each card's value" description="A +1, 0 or −1 under every card while you learn." checked={setup.hints} onChange={(hints) => onChange({ hints })} />
        <p className="text-xs leading-5 text-ink-3">Show results applies to this session; its default is in Settings.</p>
      </Disclosure>

      <SessionLine parts={describeRunningSession(setup)} />
    </DrillSetup>
  );
}
