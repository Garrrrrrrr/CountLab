import { describe, expect, it } from "vitest";
import { computeLiveEv } from "./liveEv";
import { BlackjackRules, Card, Rank, RANKS } from "./types";

const RULES: BlackjackRules = { decks: 6, dealerHitsSoft17: true, doubleAfterSplit: true, resplitAces: true, lateSurrender: true, doubleRule: "any" };

const card = (rank: Rank): Card => ({ rank, suit: "spades" });

/** A shoe of one rank only, which makes the whole rollout deterministic. */
const only = (rank: Rank, count: number): Record<Rank, number> =>
  Object.fromEntries(RANKS.map((r) => [r, r === rank ? count : 0])) as Record<Rank, number>;

const splitEv = (player: Rank, dealer: Rank, shoe: Rank, rules: BlackjackRules = RULES) =>
  computeLiveEv({
    playerCards: [card(player), card(player)],
    dealerUpcard: card(dealer),
    composition: only(shoe, 24),
    rules,
    legalActions: ["P"],
    samples: 32,
    seed: 7,
  });

describe("live EV split rollout", () => {
  /**
   * A post-split hand is two cards, so `getBasicStrategyDecision` still offers
   * it a surrender — but surrender is illegal once a hand has been split, and
   * `autoPlayPlayerHand` resolves anything that is not a plain hit or stand
   * through `decision.fallback ?? "S"`. That fallback only exists now that
   * basic strategy reads the chart's `Rh` code; the branch-based engine
   * returned a bare `R`, which this rollout read as "not a hit" and stood on.
   *
   * Pinned deterministically. Splitting tens against a ten in an all-sixes shoe
   * gives two hard 16s; hitting each busts it, for -2. Standing on them would
   * win both, because the dealer's own 10,6 draws a six and busts too, for +2.
   * The sign of this number is the whole behaviour.
   */
  it("hits a post-split hard 16 v 10 instead of standing on a surrender it cannot take", () => {
    const result = splitEv("10", "10", "6");
    expect(result.evs.P).toBe(-2);
    expect(result.standardErrors.P).toBe(0);
  });

  it("reaches the same answer with surrender off the table", () => {
    // The rollout must not depend on whether the table offers surrender: a
    // post-split 16 v 10 hits either way. That is what makes the case above a
    // fix to the rollout rather than a change of rules.
    expect(splitEv("10", "10", "6", { ...RULES, lateSurrender: false }).evs.P).toBe(-2);
  });

  it("still stands the rollout where basic strategy stands", () => {
    // Same construction, all tens: splitting eights against a six gives two
    // hard 18s, which stand, and the dealer's 6,10 draws a ten and busts. A
    // rollout that hit them instead would bust both and return -2.
    expect(splitEv("8", "6", "10").evs.P).toBe(2);
  });
});
