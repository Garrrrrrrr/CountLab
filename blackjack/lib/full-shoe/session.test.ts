import { describe, expect, it } from "vitest";
import { BET_SPREAD_PRESETS, betUnitsAt } from "@/lib/blackjack/fullShoeSession";
import { BlackjackShoe } from "@/lib/blackjack/shoe";
import { RANKS, type Card, type Rank } from "@/lib/blackjack/types";
import { DEFAULT_TABLE_RULES, decideHand, takeInsurance } from "@/lib/strategy";
import { permissionsFor } from "./round";
import { FullShoeGame, tableChips, type FullShoeSetup, type ShoeLike } from "./session";

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
  decisionSeconds: 0,
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
    expect(game.score.categories.Betting).toEqual({ correct: 0, total: 1 });
    game.end();
    expect(game.phase).toBe("over");
    expect(game.cash).toBe(5000);
    expect(game.completionReason).toBe("ended");
    // The unfinished round is not graded, so the score agrees with the rounds the report lists.
    expect(game.score.total).toBe(0);
    expect(game.mistakes).toEqual([]);
    expect(game.sessionMetrics()).toMatchObject({ completionReason: "ended", mode: "checkout", rampTc1: 20, rampTc6Plus: 80 });
    expect(game.sessionTags()).toEqual(["checkout", "random", "late"]);
  });

  it("keeps the finished rounds' grades", () => {
    const game = new FullShoeGame(setup(), new ScriptedShoe([c("10"), c("9"), c("10"), c("7"), c("10"), c("9"), c("6"), c("7")]), { now: () => 0 });
    game.placeChip(25);
    game.deal(); game.dealt();
    game.act("S");
    game.revealHole();
    game.settle();
    game.placeChip(10);
    game.deal(); game.dealt();
    game.end();
    expect(game.score).toMatchObject({ total: 2, correct: 1 });
    expect(game.history[0].decisions).toHaveLength(2);
    expect(game.mistakes.map((mistake) => mistake.question)).toEqual(["Bet before round 1"]);
  });
});

describe("table limits", () => {
  it("offers chips that fit the unit and the maximum", () => {
    expect(tableChips(10, BET_SPREAD_PRESETS["1-8"])).toEqual([5, 25, 100, 500, 1000]);
    expect(tableChips(25, BET_SPREAD_PRESETS["1-12"])).toEqual([25, 100, 500, 1000]);
    expect(tableChips(1, BET_SPREAD_PRESETS["1-8"])).toEqual([1, 5, 25, 100]);
    expect(tableChips(12.5, { ...BET_SPREAD_PRESETS["1-8"], 1: 2.96 })).toEqual([0.5, 1, 5, 25, 100, 500, 1000]);
  });

  it("deals only bets between the minimum and the maximum on every seat", () => {
    const game = new FullShoeGame(setup(), new ScriptedShoe([]), { now: () => 0 });
    game.placeChip(5);
    expect(game.underMinimum).toBe(2);
    expect(game.canDeal).toBe(false);
    game.placeChip(5);
    expect(game.canDeal).toBe(true);
    game.selectSeat(0); game.placeChip(5);
    expect(game.underMinimum).toBe(0);
    expect(game.canDeal).toBe(false);
    game.clearBets();
    game.selectSeat(2);
    expect(game.placeChip(1000)).toBe(true);
    expect(game.canAdd(5)).toBe(false);
  });

  it("grades a bet at the table maximum when the ramp asks for more", () => {
    const game = new FullShoeGame(setup({ unit: 5, ramp: { ...BET_SPREAD_PRESETS["1-8"], 1: 200 }, spread: "custom" }), new ScriptedShoe([c("2"), c("3"), c("4"), c("5"), c("6"), c("2")]), { now: () => 0 });
    game.placeChip(5);
    game.deal(); game.dealt();
    while (game.phase === "playing") game.act("S");
    game.revealHole();
    while (game.dealerNeedsCard) game.dealerDraw();
    game.settle();
    expect(game.tc).toBeGreaterThanOrEqual(1);
    expect(game.rampBet).toBe(500);
  });
});

describe("coached notes", () => {
  it("names the right play first when the play was wrong", () => {
    const game = new FullShoeGame(setup({ mode: "coached" }), new ScriptedShoe([c("10"), c("10"), c("2"), c("7")]), { now: () => 0 });
    game.placeChip(10);
    game.deal(); game.dealt();
    game.act("S"); // 12 v 10
    expect(game.note).toMatchObject({ ok: false, title: "Hit, not stand" });
  });
});

describe("casino pace", () => {
  it("times each decision and grades a timeout as a mistake, standing the hand", () => {
    let clock = 0;
    const game = new FullShoeGame(setup({ decisionSeconds: 5 }), new ScriptedShoe([c("10"), c("10"), c("2"), c("7"), c("10"), c("10"), c("9"), c("8")]), { now: () => clock });
    game.placeChip(10);
    game.deal(); game.dealt();
    game.startClock();
    expect(game.clockEndsAt).toBe(5000);
    clock = 5000;
    expect(game.timeOut()).toBe(true);
    expect(game.phase).toBe("dealer");
    game.revealHole();
    game.settle();
    expect(game.history[0].decisions[1]).toMatchObject({ category: "Basic Strategy", ok: false, chosen: "No decision (time ran out)", correct: "Hit" });
    game.placeChip(10);
    game.deal(); game.dealt();
    game.startClock();
    clock = 7000;
    game.act("S"); // 19 v 10
    expect(game.decisionMs).toEqual([5000, 2000]);
    clock = 3_600_000;
    expect(game.pace()).toMatchObject({ secondsPerDecision: 3.5, handsPerHour: 1, timedOut: 1, limit: 5 });
  });

  it("has no clock without a limit, but still measures the decision", () => {
    let clock = 0;
    const game = new FullShoeGame(setup(), new ScriptedShoe([c("10"), c("10"), c("9"), c("8")]), { now: () => clock });
    game.placeChip(10);
    game.deal(); game.dealt();
    game.startClock();
    expect(game.clockEndsAt).toBeUndefined();
    expect(game.timeOut()).toBe(false);
    clock = 1500;
    game.act("S");
    expect(game.decisionMs).toEqual([1500]);
  });
});

describe("back-counting", () => {
  /** Plays out a round with whatever is on the felt: you stand, or the others play. */
  const finishRound = (game: FullShoeGame) => {
    game.dealt();
    for (let guard = 0; game.phase === "playing" && guard < 50; guard++) {
      if (game.waitingForSplitCard) game.dealSplitCard();
      else if (game.othersToAct) game.othersAct();
      else game.act("S");
    }
    game.revealHole();
    while (game.dealerNeedsCard) game.dealerDraw();
    game.settle();
  };

  it("deals the other seats while you watch, and leaves your bankroll alone", () => {
    const game = new FullShoeGame(setup({ wong: { enter: 2, leave: -1 } }), new BlackjackShoe(6, mulberry(5)), { now: () => 0 });
    expect(game.watching).toBe(true);
    expect(game.canAdd(5)).toBe(false);
    expect(game.canDeal).toBe(true);
    game.deal();
    expect(game.round!.hands.map((hand) => hand.seat)).toEqual([0, 1, 3, 4]);
    expect(game.staked).toBe(0);
    finishRound(game);
    expect(game.cash).toBe(5000);
    expect(game.history[0]).toMatchObject({ bet: 0, netResult: 0 });
    // You still count every card the others were dealt.
    expect(game.discarded).toBeGreaterThanOrEqual(10);
    expect(game.discarded + game.cardsRemaining).toBe(312);
  });

  it("grades sitting in below the entry count, and missing the exit", () => {
    const low = Array.from({ length: 30 }, () => c("10"));
    const game = new FullShoeGame(setup({ wong: { enter: 2, leave: -1 } }), new ScriptedShoe(low), { now: () => 0 });
    game.sitIn();
    game.placeChip(10);
    game.deal(); // TC 0: below +2
    expect(game.history.length).toBe(0);
    finishRound(game);
    expect(game.history[0].decisions[0]).toMatchObject({ category: "Betting", ok: false, chosen: "Sit in", correct: "Keep watching", question: "Sit in or out before round 1" });
    // Ten-cards drove the count down: staying in is a mistake, leaving is right.
    expect(game.tc).toBeLessThanOrEqual(-1);
    game.placeChip(10);
    game.deal();
    finishRound(game);
    expect(game.history[1].decisions[0]).toMatchObject({ ok: false, chosen: "Stay in", correct: "Leave" });
    game.sitOut();
    game.deal();
    finishRound(game);
    expect(game.history[2].decisions).toEqual([expect.objectContaining({ ok: true, chosen: "Leave" })]);
    // Watching on at a low count is not a decision.
    game.deal();
    finishRound(game);
    expect(game.history[3].decisions).toEqual([]);
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
