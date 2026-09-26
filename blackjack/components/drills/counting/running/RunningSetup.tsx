"use client";
import { ReactNode } from "react";
import { ChoiceCards, SetupCard } from "@/components/drill";
import { NumberField, Select, SegmentedControl, Switch } from "@/components/ui";
import type { CountBias } from "@/lib/blackjack/countingTraining";
import {
  describeRunningSession,
  formatInterval,
  RUNNING_INTERVALS,
  RUNNING_SESSION_CARDS,
  runningCardMeta,
  type FeedbackMode,
  type RunningCardId,
  type RunningCheckpoint,
  type RunningGroup,
  type RunningValues,
} from "@/lib/blackjack/countingSetup";
import { Customize, OptionGroup, WithHelp } from "../Customize";
import { CustomNote, HiLoStrip, SessionSentence } from "../SetupParts";

export type RunningSetupState = RunningValues & {
  bias: CountBias;
  feedbackMode: FeedbackMode;
  /** Show each card's Hi-Lo value under it (on for the Starter session). */
  hints: boolean;
};

const CARD_ICON: Record<RunningCardId, string> = {
  starter: "fa-seedling",
  "one-deck-speed": "fa-stopwatch",
  "two-card-cancellation": "fa-clone",
  "six-deck-casino": "fa-layer-group",
  recovery: "fa-phone",
};

const toNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Running Count setup: pick a session (one tap sets everything), read what
 * will happen, press Start. Every individual option is under Customize.
 */
export function RunningSetup({ setup, matched, onChange, onPickCard, onReset, resetLabel, customizeOpen, onCustomizeOpen, firstTime, notice, onStart }: {
  setup: RunningSetupState;
  matched: RunningCardId | null;
  onChange: (next: Partial<RunningSetupState>) => void;
  onPickCard: (id: RunningCardId) => void;
  onReset: () => void;
  resetLabel: string;
  customizeOpen: boolean;
  onCustomizeOpen: (open: boolean) => void;
  firstTime: boolean;
  notice?: ReactNode;
  onStart: () => void;
}) {
  const maxCards = setup.decks * 52;
  return (
    <SetupCard
      title="Choose a session"
      description="Cards appear one group at a time. Keep the Hi-Lo count in your head; we stop now and then to ask for it."
      notice={notice || matched === "starter" ? <div className="grid gap-3">{notice}{matched === "starter" && <HiLoStrip />}</div> : undefined}
      startLabel="Start counting"
      onStart={onStart}
    >
      <ChoiceCards
        legend="Session"
        hideLegend
        name="running-count-session"
        value={matched}
        onChange={onPickCard}
        options={RUNNING_SESSION_CARDS.map((card) => ({
          value: card.id,
          title: card.title,
          description: card.description,
          meta: runningCardMeta(card.values),
          icon: CARD_ICON[card.id],
          badge: card.id === "starter" && firstTime ? "Recommended first" : undefined,
        }))}
      />
      {matched === null && <CustomNote resetLabel={resetLabel} onReset={onReset} />}
      <SessionSentence parts={describeRunningSession(setup)} />
      <Customize open={customizeOpen} onOpenChange={onCustomizeOpen} custom={matched === null} footnote="Show results applies to this session only. Change its default in Settings.">
        <OptionGroup title="Cards">
          <SegmentedControl
            label="Decks in the shoe"
            value={String(setup.decks)}
            onChange={(value) => {
              const decks = toNumber(value, setup.decks);
              onChange({ decks, amount: Math.min(setup.amount, decks * 52) });
            }}
            options={[1, 2, 4, 6, 8].map((decks) => ({ value: String(decks), label: String(decks) }))}
            fullWidth
          />
          <NumberField label="Cards in session" value={setup.amount} min={10} max={maxCards} onValueChange={(amount) => onChange({ amount: Math.min(maxCards, Math.max(1, Math.round(amount))) })} help={`Up to ${maxCards - 1}; one card is burned.`} />
        </OptionGroup>
        <OptionGroup title="Pace">
          <SegmentedControl<RunningGroup>
            label="Cards shown at once"
            value={setup.group}
            onChange={(group) => onChange({ group })}
            options={[
              { value: "1", label: "1" },
              { value: "2", label: "2" },
              { value: "3", label: "3" },
              { value: "4", label: "4" },
              { value: "random", label: "1–4", ariaLabel: "Random, 1 to 4" },
            ]}
            fullWidth
          />
          <WithHelp label="Time on screen" help="How long each group stays up. Self-paced waits for you: tap Deal next or press Space. It suits screen readers and first runs.">
            <Select label="Time on screen" value={setup.speed} onChange={(event) => onChange({ speed: toNumber(event.target.value, setup.speed) })}>
              {RUNNING_INTERVALS.map((ms) => <option key={ms} value={ms}>{formatInterval(ms)}</option>)}
            </Select>
          </WithHelp>
        </OptionGroup>
        <OptionGroup title="Checks and results" wide>
          <div className="grid min-w-0 gap-5 sm:grid-cols-2">
            <WithHelp label="Ask for the count" help="A check is when we stop the cards and ask for your running count.">
              <Select label="Ask for the count" value={setup.checkpoint} onChange={(event) => onChange({ checkpoint: event.target.value as RunningCheckpoint })}>
                <option value="final">At the end only</option>
                <option value="5">Every 5 cards</option>
                <option value="10">Every 10 cards</option>
                <option value="random">At random moments</option>
                <option value="sign">When the count reaches or crosses zero</option>
              </Select>
            </WithHelp>
            <WithHelp label="Card mix" help="Stretches bunch low or high cards together, so the count swings further than usual.">
              <Select label="Card mix" value={setup.bias} onChange={(event) => onChange({ bias: event.target.value as CountBias })}>
                <option value="none">Balanced</option>
                <option value="positive">Positive stretches</option>
                <option value="negative">Negative stretches</option>
              </Select>
            </WithHelp>
            <SegmentedControl<FeedbackMode>
              label="Show results"
              value={setup.feedbackMode}
              onChange={(feedbackMode) => onChange({ feedbackMode })}
              options={[{ value: "immediate", label: "After each check" }, { value: "end", label: "At the end" }]}
              fullWidth
            />
            <Switch label="Interrupt me once, halfway" checked={setup.interruption} onChange={(interruption) => onChange({ interruption })} />
            <Switch label="Show each card's value" checked={setup.hints} onChange={(hints) => onChange({ hints })} />
          </div>
        </OptionGroup>
      </Customize>
    </SetupCard>
  );
}
