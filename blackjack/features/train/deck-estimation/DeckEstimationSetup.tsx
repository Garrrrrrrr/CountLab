"use client";
import type { ReactNode } from "react";
import { TrayPhoto } from "@/components/blackjack";
import { DrillSetup, PresetPicker, SetupGroup } from "@/components/drill/DrillKit";
import { Segmented } from "@/components/ui";
import type { DeckAsk, DeckResolution } from "@/lib/blackjack/countingTraining";
import { DECK_ESTIMATION_SESSION_CARDS, describeDeckEstimationSession, QUESTION_TARGETS, SHOE_SIZES, type FeedbackMode } from "@/lib/blackjack/countingSetup";
import { TRAY_PHOTOS, trayPhotosForShoe } from "@/lib/blackjack/deckPhotos";
import { AsideCard, ProgressAside, SessionLine } from "../counting-shared/parts";

export type DeckSetupState = { decks: number; resolution: DeckResolution; feedbackMode: FeedbackMode; target: number; ask: DeckAsk };
type ResolutionKey = "1" | "0.5" | "0.25";

/** A mid-shoe photo for the "Reading the tray" card. */
const SAMPLE = TRAY_PHOTOS.find((photo) => photo.discarded >= 2.4) ?? TRAY_PHOTOS[0];

export function DeckEstimationSetup({ setup, onChange, onStart, resume, notice, bestError }: {
  setup: DeckSetupState;
  onChange: (next: Partial<DeckSetupState>) => void;
  onStart: () => void;
  resume?: ReactNode;
  notice?: ReactNode;
  bestError?: number;
}) {
  const photos = trayPhotosForShoe(setup.decks).length;
  return (
    <DrillSetup
      title="Deck Estimation"
      intro="Each question is a real photo of a discard tray. Estimate how many decks are still in the shoe, or how many have been played."
      onStart={onStart}
      startLabel={`Start ${setup.target} photos`}
      resume={resume}
      aside={
        <>
          <AsideCard title="Reading the tray">
            <div className="flex gap-3.5">
              <TrayPhoto photo={SAMPLE} width={96} label="Sample discard tray" caption={`${SAMPLE.discarded.toFixed(1)} decks in it`} />
              <div className="min-w-0">
                <p>The tray holds the cards already played. <span className="font-semibold text-ink">Decks left = shoe size − decks in the tray.</span></p>
                <p className="mt-2 text-xs leading-5 text-ink-3">{TRAY_PHOTOS.length} real photos, from half a deck to seven and a half decks deep.</p>
              </div>
            </div>
          </AsideCard>
          <ProgressAside drill="Deck Estimation" best={{ label: "Best average error", value: bestError === undefined ? "None yet" : `${bestError.toFixed(2)} decks` }} />
        </>
      }
    >
      {notice}
      <SetupGroup title="Answer with" hint={setup.ask === "played" ? "The decks already dealt into the tray: what you read straight off it." : "The decks still in the shoe: what you divide the running count by."}>
        <Segmented<DeckAsk> label="Answer with" hideLabel value={setup.ask} onChange={(ask) => onChange({ ask })}
          options={[{ value: "left", label: "Decks left" }, { value: "played", label: "Decks played" }]} />
      </SetupGroup>
      <SetupGroup title="Round your answer to the nearest">
        <PresetPicker<ResolutionKey>
          label="Precision"
          value={String(setup.resolution) as ResolutionKey}
          onChange={(value) => onChange({ resolution: Number(value) as DeckResolution })}
          options={DECK_ESTIMATION_SESSION_CARDS.map((card) => ({ value: String(card.value) as ResolutionKey, title: card.title, detail: card.description }))}
        />
      </SetupGroup>
      <SetupGroup title="Decks in the shoe" hint={setup.decks === 1 ? `Only ${photos} photos fit a one-deck shoe, so they repeat in longer sessions.` : `${photos} photos fit a ${setup.decks}-deck shoe.`}>
        <Segmented<number> label="Decks in the shoe" hideLabel value={setup.decks} onChange={(decks) => onChange({ decks })}
          options={SHOE_SIZES.map((decks) => ({ value: decks, label: String(decks) }))} />
      </SetupGroup>
      <div className="grid gap-4 sm:grid-cols-2">
        <Segmented<number> label="Photos" value={setup.target} onChange={(target) => onChange({ target })}
          options={QUESTION_TARGETS.map((target) => ({ value: target, label: String(target) }))} />
        <Segmented<FeedbackMode> label="Show results" value={setup.feedbackMode} onChange={(feedbackMode) => onChange({ feedbackMode })}
          options={[{ value: "immediate", label: "After each" }, { value: "end", label: "At the end" }]} />
      </div>
      <SessionLine parts={describeDeckEstimationSession(setup)} />
    </DrillSetup>
  );
}
