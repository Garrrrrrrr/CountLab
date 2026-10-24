import { describe, expect, it } from "vitest";
import { BET_SPREAD_PRESETS, betUnitsAt } from "@/lib/blackjack/fullShoeSession";
import { BlackjackShoe } from "@/lib/blackjack/shoe";
import { RANKS, type Card, type Rank } from "@/lib/blackjack/types";
import { DEFAULT_TABLE_RULES, decideHand, takeInsurance } from "@/lib/strategy";
import { permissionsFor } from "./round";
import { FullShoeGame, type FullShoeSetup, type ShoeLike } from "./session";

function mulberry(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const setup = (patch: Partial<FullShoeSetup> = {}): FullShoeSetup => ({
  mode: "checkout",
  rules: { ...DEFAULT_TABLE_RULES },
  resplitAces: true,
  blackjackPayout: 1.5,
  penetration: 0.75,
  resolution: 0.5,
  rounding: "floor",
  bankroll: 5000,
  unit: 10,
  spread: "1-8",
  ramp: { ...BET_SPREAD_PRESETS["1-8"] },
  players: 1,
  countChecks: "off",
  countDepth: "true",
  holeCard: "hidden",
  stacked: false,
  speed: "fast",
  animations: false,
  sound: false,
  ...patch,
});

/** A shoe dealt in a fixed order, for steering one round. */
class ScriptedShoe implements ShoeLike {
  constructor(private cards: Card[], private readonly extra = 300) {}
  deal() { return this.cards.shift() ?? (this.extra > 0 ? { rank: "9" as Rank, suit: "clubs" as const } : undefined); }
  cardsRemaining() { return this.cards.length + this.extra; }
  remainingComposition() { return Object.fromEntries(RANKS.map((rank) => [rank, 0])) as Record<Rank, number>; }
}
const c = (rank: Rank): Card => ({ rank, suit: "diamonds" });

/** Plays the game the way the grader wants, through every phase, until the shoe ends. */
function playPerfectly(game: FullShoeGame, seats = [2]) {
  let guard = 0;
  while (game.phase !== "over" && guard++ < 5000) {
    switch (game.phase) {
      case "betting": {
        const bet = Math.min(game.rampBet, Math.floor((game.cash / seats.length) * 2) / 2);
        for (const seat of seats) {
          game.selectSeat(seat);
          // Build the exact bet from the smallest chip, as a player could.
          let left = bet;
          for (const chip of [1000, 500, 100, 25, 5, 1, 0.5]) while (left >= chip - 1e-9) { game.placeChip(chip); left = Math.round((left - chip) * 100) / 100; }
        }
        game.deal();
        break;
      }
      case "dealing": game.dealt(); break;
      case "insurance": game.chooseInsurance(takeInsurance(game.setup.rules, game.tc) ? "insure" : "decline"); break;
      case "playing": {
        if (game.waitingForSplitCard) { game.dealSplitCard(); break; }
        const hand = game.activeHand!;
        const permissions = permissionsFor(game.table, game.round!, game.cash);
        const answer = decideHand({ cards: hand.cards, upcard: game.round!.dealer[0], rules: game.table.rules, tc: game.tc, ...permissions }).action;
        expect(game.legal).toContain(answer);
        game.act(answer);
        break;
      }
      case "dealer":
        if (!game.holeRevealed) game.revealHole();
        else if (game.dealerNeedsCard) game.dealerDraw();
        else game.settle();
        break;
      case "count-check": {
        const check = game.countCheck!;
        if (check.step === "rc") game.submitCount(game.rc);
        else if (check.step === "decks") game.submitCount(game.divisor);
        else if (check.step === "tc") game.submitCount(game.tc);
        else game.closeCountCheck();
        break;
      }
    }
  }
  expect(guard).toBeLessThan(5000);
}

describe("a whole shoe", () => {
  for (const [label, patch, seats] of [
    ["six decks, one seat", {}, [2]],
    ["two decks S17, ES10, two seats, count checks every round", { rules: { ...DEFAULT_TABLE_RULES, decks: 2, hitSoft17: false, surrender: "early" as const }, countChecks: "every" as const }, [1, 3]],
    ["one deck, no surrender, no DAS, no resplit, 6:5, stacked", { rules: { ...DEFAULT_TABLE_RULES, decks: 1, surrender: "none" as const, das: false }, resplitAces: false, blackjackPayout: 1.2 as const, stacked: true }, [2]],
    ["eight decks, whole-deck precision, nearest rounding, coached", { rules: { ...DEFAULT_TABLE_RULES, decks: 8 }, resolution: 1 as const, rounding: "nearest" as const, mode: "coached" as const, countChecks: "3" as const }, [0, 2, 4]],
  ] as const) {
    it(`grades a perfect player 100% and keeps every dollar accounted for: ${label}`, () => {
      for (const seed of [1, 2, 3]) {
        const config = setup(patch as Partial<FullShoeSetup>);
        const shoe = new BlackjackShoe(config.rules.decks, mulberry(seed), config.stacked ? { targetTrueCount: 6, depth: 0.5 } : undefined);
        const game = new FullShoeGame(config, shoe, { rng: mulberry(seed + 99), now: () => 0 });
        playPerfectly(game, [...seats]);
        expect(game.completionReason).toBe("shoe-complete");
        expect(game.history.length).toBeGreaterThan(3);
        expect(game.score.total).toBeGreaterThan(game.history.length);
        expect(game.score.correct).toBe(game.score.total);
        const net = game.history.reduce((sum, round) => sum + round.netResult, 0);
        expect(game.cash).toBeCloseTo(config.bankroll + net, 6);
        expect(game.discarded + game.cardsRemaining).toBe(config.rules.decks * 52);
        if (config.countChecks !== "off") expect(game.score.categories["Running count"].total).toBeGreaterThan(0);
        expect(game.report()).toMatchObject({ accuracy: 100, handsPlayed: game.history.length });
      }
    });
  }
});

describe("checkout count credit", () => {
  it("grades a reported count once, then keeps grading plays at the player's own count", () => {
    const game = new FullShoeGame(setup({ countChecks: "every", countDepth: "running", bankroll: 5000 }), new ScriptedShoe([
      // Round 1 shows ten low cards and the dealer busts: RC +10 with 5.5 decks left → TC +1.
      c("2"), c("3"), c("4"), c("5"), c("6"), c("2"), c("3"), c("4"), c("5"), c("6"),
    ]), { now: () => 0 });
    game.selectSeat(0); game.placeChip(5); game.placeChip(5);
    game.selectSeat(1); game.placeChip(5); game.placeChip(5);
    game.selectSeat(2); game.placeChip(5); game.placeChip(5);
    game.selectSeat(3); game.placeChip(5); game.placeChip(5);
    game.deal(); game.dealt();
    while (game.phase === "playing") game.act("S");
    game.revealHole();
    while (game.dealerNeedsCard) game.dealerDraw();
    game.settle();
    const real = game.tc;
    expect(real).toBeGreaterThanOrEqual(1);
    game.submitCount(0); // the player lost the count
    // At their count the ramp says one unit; the real count says more.
    game.placeChip(5); game.placeChip(5);
    expect(betUnitsAt(game.setup.ramp, real)).toBeGreaterThan(1);
    game.deal();
    const bet = game.history.length ? game.score.categories.Betting : undefined;
    expect(bet).toEqual({ correct: 2, total: 2 });
  });
});

describe("ending early", () => {
  it("refunds the money on the table and files the hands played so far", () => {
    const game = new FullShoeGame(setup(), new ScriptedShoe([c("10"), c("9"), c("6"), c("7")]), { now: () => 0 });
    game.placeChip(25);
    game.deal(); game.dealt();
    expect(game.cash).toBe(4975);
    game.end();
    expect(game.phase).toBe("over");
    expect(game.cash).toBe(5000);
    expect(game.completionReason).toBe("ended");
    expect(game.score.categories.Betting).toEqual({ correct: 0, total: 1 });
    expect(game.sessionMetrics()).toMatchObject({ completionReason: "ended", mode: "checkout", rampTc1: 20, rampTc6Plus: 80 });
    expect(game.sessionTags()).toEqual(["checkout", "random", "late"]);
  });
});

describe("count checks", () => {
  it("asks running count, decks left and true count, and shows the result in coached mode", () => {
    const game = new FullShoeGame(setup({ mode: "coached", countChecks: "every" }), new ScriptedShoe([c("2"), c("4"), c("3"), c("5"), c("6"), c("K")]), { now: () => 0 });
    game.placeChip(10);
    game.deal(); game.dealt();
    game.act("S");
    game.revealHole();
    while (game.dealerNeedsCard) game.dealerDraw();
    game.settle();
    expect(game.countCheck?.step).toBe("rc");
    game.submitCount(game.rc);
    expect(game.countCheck?.step).toBe("decks");
    game.submitCount(game.divisor);
    expect(game.countCheck?.step).toBe("tc");
    game.submitCount(game.tc + 1);
    expect(game.countCheck?.step).toBe("result");
    expect(game.countCheck?.result).toMatchObject({ rcOk: true, decksOk: true, tcOk: false });
    expect(game.carriedOffset).toBeUndefined();
    expect(game.history[0].decisions.map((decision) => decision.category)).toEqual(["Betting", "Basic Strategy", "Running count", "True count"]);
    game.closeCountCheck();
    expect(game.phase).toBe("betting");
  });
});
