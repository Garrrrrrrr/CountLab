"use client";
import { ReactNode } from "react";
import { ChoiceCards, SetupCard } from "@/components/drill";
import { SegmentedControl } from "@/components/ui";
import type { DeckResolution } from "@/lib/blackjack/countingTraining";
import { DECK_ESTIMATION_SESSION_CARDS, describeDeckEstimationSession, type FeedbackMode } from "@/lib/blackjack/countingSetup";
import { DRILL_PHOTO_DECK_OPTIONS, PHOTO_DECK_OPTIONS } from "@/lib/blackjack/deckPhotos";
import { Customize } from "../Customize";
import { SessionSentence } from "../SetupParts";
import { QUESTION_TARGETS } from "../true-count/TrueCountSetup";

export type DeckEstimationSetupState = { decks: number; resolution: DeckResolution; feedbackMode: FeedbackMode; target: number };

const ICON: Record<string, string> = { "1": "fa-square", "0.5": "fa-table-cells-large", "0.25": "fa-table-cells" };
const toNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function DeckEstimationSetup({ setup, onChange, customizeOpen, onCustomizeOpen, notice, onStart }: {
  setup: DeckEstimationSetupState;
  onChange: (next: Partial<DeckEstimationSetupState>) => void;
  customizeOpen: boolean;
  onCustomizeOpen: (open: boolean) => void;
  notice?: ReactNode;
  onStart: () => void;
}) {
  const tooFew = PHOTO_DECK_OPTIONS.filter((decks) => !DRILL_PHOTO_DECK_OPTIONS.includes(decks));
  return (
    <SetupCard
      title="Choose a precision"
      description="Each question is a real photo of a discard tray. Estimate how many decks are still in the shoe."
      notice={notice}
      startLabel={`Start ${setup.target} estimates`}
      onStart={onStart}
    >
      <ChoiceCards
        legend="Precision"
        hideLegend
        name="deck-estimation-precision"
        columns={3}
        value={String(setup.resolution)}
        onChange={(value) => { const resolution = Number(value); if (resolution === 1 || resolution === 0.5 || resolution === 0.25) onChange({ resolution }); }}
        options={DECK_ESTIMATION_SESSION_CARDS.map((card) => ({
          value: String(card.value),
          title: card.title,
          description: card.description,
          icon: ICON[String(card.value)],
        }))}
      />
      <SegmentedControl
        label="Shoe size (decks)"
        name="deck-estimation-shoe"
        value={String(setup.decks)}
        onChange={(value) => onChange({ decks: toNumber(value, setup.decks) })}
        options={PHOTO_DECK_OPTIONS.map((decks) => ({ value: String(decks), label: String(decks), disabled: !DRILL_PHOTO_DECK_OPTIONS.includes(decks), ariaLabel: DRILL_PHOTO_DECK_OPTIONS.includes(decks) ? undefined : `${decks} (not enough photos yet)` }))}
        help={tooFew.length ? `The ${tooFew.join(" and ")}-deck ${tooFew.length === 1 ? "shoe has" : "shoes have"} too few distinct photos for a session, so ${tooFew.length === 1 ? "it is" : "they are"} not offered yet.` : undefined}
        fullWidth
      />
      <SessionSentence parts={describeDeckEstimationSession(setup)} />
      <Customize open={customizeOpen} onOpenChange={onCustomizeOpen} custom={false} footnote="These apply to this session only. Their defaults are in Settings.">
        <SegmentedControl<FeedbackMode>
          label="Show results"
          value={setup.feedbackMode}
          onChange={(feedbackMode) => onChange({ feedbackMode })}
          options={[{ value: "immediate", label: "After each photo" }, { value: "end", label: "At the end" }]}
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
