"use client";
/**
 * Full Shoe: count, bet and play a whole shoe at a live table.
 *
 *   setup   rules, mode (coached or a silent checkout), bankroll and ramp,
 *           count checks, plus the library of saved shoes
 *   play    the felt, full screen (Table.tsx)
 *   report  the graded shoe: scorecard, mistakes, replay of every round
 *   review  a saved shoe reopened from the library
 *
 * The rules live in lib/full-shoe (round engine, grading, session) and every
 * strategy answer comes from lib/strategy.
 */
import { useState } from "react";
import { Skeleton } from "@/components/ui";
import { track } from "@/lib/analytics/track";
import type { FullShoeLiveRound } from "@/lib/blackjack/fullShoeSession";
import { BlackjackShoe } from "@/lib/blackjack/shoe";
import { shoeLibrary, type SavedShoe } from "@/lib/blackjack/shoeLibrary";
import { FullShoeGame, type FullShoeSetup } from "@/lib/full-shoe/session";
import { useSettings } from "@/lib/hooks/useSettings";
import { makeSession, storage } from "@/lib/statistics/storage";
import { rulesSummary } from "@/lib/strategy";
import { SavedShoeReport, ShoeReport, type ReportData } from "./Report";
import { savedRules, Setup } from "./Setup";
import { setupFromSettings, setupSummary } from "./tableSetup";
import { Table } from "./Table";

type Screen =
  | { name: "setup" }
  | { name: "play"; game: FullShoeGame }
  | { name: "report"; data: ReportData }
  | { name: "review"; shoe: SavedShoe; rounds?: FullShoeLiveRound[]; loading: boolean };

const HOT_SHOE = { targetTrueCount: 6, depth: 0.5 };

function newGame(setup: FullShoeSetup) {
  const shoe = new BlackjackShoe(setup.rules.decks, Math.random, setup.stacked ? HOT_SHOE : undefined);
  return new FullShoeGame(setup, shoe, { emit: track, makeEmergencyShoe: () => new BlackjackShoe(1) });
}

/** Files a finished shoe: the drill session (for Progress) and the full shoe (for the library). */
function save(game: FullShoeGame): ReportData {
  const report = game.report();
  const { score, setup } = game;
  // A shoe abandoned before a single bet has nothing to grade, so it does not drag Progress down.
  if (score.total > 0) {
    storage.addSession(makeSession("Full Shoe", score.total, score.correct, game.durationMs, score.bestStreak, game.mistakes, score.categories, game.sessionMetrics(), game.sessionTags()));
  }
  let saved = false;
  if (game.history.length) {
    shoeLibrary.save({
      mode: setup.mode,
      completionReason: game.completionReason ?? "ended",
      table: {
        decks: setup.rules.decks,
        dealerHitsSoft17: setup.rules.hitSoft17,
        surrenderRule: setup.rules.surrender,
        stacked: setup.stacked,
        penetration: setup.penetration,
        doubleAfterSplit: setup.rules.das,
        resplitAces: setup.resplitAces,
        doubling: setup.rules.doubling,
        blackjackPayout: setup.blackjackPayout,
        deckResolution: setup.resolution,
        rounding: setup.rounding,
        unit: setup.unit,
        startingBankroll: setup.bankroll,
      },
      report,
      rounds: game.history,
    });
    saved = true;
  }
  return {
    report,
    rounds: game.history,
    mode: setup.mode,
    completionReason: game.completionReason ?? "ended",
    rulesLine: setupSummary(setup),
    date: new Date().toISOString(),
    startingBankroll: setup.bankroll,
    endMessage: game.endMessage,
    saved,
  };
}

// The Train hub links straight to a mode with ?mode=coached or ?mode=checkout. Read from
// location rather than useSearchParams so the page needs no Suspense boundary; it only
// runs once settings are ready, which is after hydration.
const modeFromUrl = (): FullShoeSetup["mode"] => (new URLSearchParams(location.search).get("mode") === "checkout" ? "checkout" : "coached");

const savedTitle = (shoe: SavedShoe) => new Date(shoe.savedAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function FullShoe() {
  const { settings, ready } = useSettings();
  const [draft, setDraft] = useState<FullShoeSetup>();
  const [screen, setScreen] = useState<Screen>({ name: "setup" });
  const setup = draft ?? (ready ? { ...setupFromSettings(settings), mode: modeFromUrl() } : undefined);

  const start = (chosen: FullShoeSetup) => {
    const game = newGame(chosen);
    const { rules } = chosen;
    track("drill_started", { drill: "Full Shoe", mode: chosen.mode, decks: rules.decks, penetration: chosen.penetration, dealerRule: rules.hitSoft17 ? "H17" : "S17", das: rules.das, rsa: chosen.resplitAces, surrender: rules.surrender, rulesPreset: rulesSummary(rules) });
    track("full_shoe_started", { decks: rules.decks, penetration: chosen.penetration, deckResolution: chosen.resolution, spread: chosen.spread, blackjackPayout: chosen.blackjackPayout, startingBankroll: chosen.bankroll, mode: chosen.mode, stacked: chosen.stacked });
    setScreen({ name: "play", game });
  };

  const review = async (shoe: SavedShoe) => {
    setScreen({ name: "review", shoe, loading: true });
    track("full_shoe_saved_shoe_opened", { mode: shoe.mode, accuracy: shoe.report.accuracy, handsPlayed: shoe.report.handsPlayed });
    const rounds = await shoeLibrary.loadRounds(shoe.id);
    setScreen((current) => (current.name === "review" && current.shoe.id === shoe.id ? { ...current, rounds, loading: false } : current));
  };

  if (!setup) {
    return (
      <div aria-busy="true" aria-label="Loading" className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (screen.name === "play") {
    return <Table key={screen.game.startedAt} game={screen.game} onFinish={() => setScreen({ name: "report", data: save(screen.game) })} />;
  }

  if (screen.name === "report") {
    return <ShoeReport data={screen.data} onAgain={() => start(setup)} onSetup={() => setScreen({ name: "setup" })} />;
  }

  if (screen.name === "review") {
    const { shoe, rounds, loading } = screen;
    if (!rounds) {
      return (
        <div className="space-y-4">
          <button type="button" onClick={() => setScreen({ name: "setup" })} className="-ml-1 inline-flex h-8 items-center rounded-lg pr-2 text-sm font-medium text-ink-2 hover:text-ink">‹ Back to setup</button>
          <h1 className="text-[1.625rem] leading-tight">{savedTitle(shoe)}</h1>
          {loading ? <Skeleton className="h-64" /> : <p className="text-sm leading-6 text-ink-2">This shoe&rsquo;s hands are not stored on this device. Sign in on the device that played it to see them.</p>}
        </div>
      );
    }
    const data: ReportData = {
      report: shoe.report,
      rounds,
      mode: shoe.mode,
      completionReason: shoe.completionReason,
      rulesLine: savedRules(shoe),
      date: shoe.savedAt,
      startingBankroll: shoe.table.startingBankroll,
    };
    return <SavedShoeReport data={data} title={savedTitle(shoe)} onBack={() => setScreen({ name: "setup" })} />;
  }

  return <Setup setup={setup} onChange={setDraft} onStart={() => start(setup)} onReview={(shoe) => void review(shoe)} />;
}
