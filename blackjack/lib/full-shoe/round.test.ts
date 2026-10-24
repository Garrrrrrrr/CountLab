import { describe, expect, it } from "vitest";
import type { Card, Rank } from "@/lib/blackjack/types";
import { DEFAULT_TABLE_RULES, type TableRules } from "@/lib/strategy";
import {
  applyAction,
  dealerDraw,
  dealerNeedsCard,
  dealRound,
  dealSplitCard,
  insuranceOffer,
  legalActions,
  needsSplitCard,
  resolveInsurance,
  revealHole,
  settleRound,
  visibleCards,
  type Round,
  type TableConfig,
} from "./round";

const card = (rank: Rank): Card => ({ rank, suit: "spades" });
/** Cards in deal order. Running out is a test bug, so it throws. */
const shoe = (...ranks: Rank[]) => {
  const cards = ranks.map(card);
  return () => {
    const next = cards.shift();
    if (!next) throw new Error("test shoe ran out");
    return next;
  };
};
const config = (rules: Partial<TableRules> = {}, extra: Partial<TableConfig> = {}): TableConfig => ({
  rules: { ...DEFAULT_TABLE_RULES, ...rules },
  resplitAces: true,
  blackjackPayout: 1.5,
  maxHandsPerSeat: 4,
  ...extra,
});
const one = (amount = 10) => [{ seat: 2, owner: 0, amount }];
/** Deals one seat: player p1, p2 against up/hole, then the given extra cards. */
const deal1 = (table: TableConfig, p1: Rank, p2: Rank, up: Rank, hole: Rank, ...rest: Rank[]) => {
  const draw = shoe(p1, up, p2, hole, ...rest);
  return { round: dealRound(table, one(), draw), draw };
};
/** Finishes the dealer's hand and settles. */
const finish = (table: TableConfig, round: Round, draw: () => Card) => {
  let next = revealHole(round);
  while (dealerNeedsCard(table, next)) next = dealerDraw(next, draw);
  return { round: next, settlement: settleRound(table, next) };
};

describe("dealing", () => {
  it("deals one card to each seat in seat order, the up card, a second card each, then the hole card", () => {
    const draw = shoe("2", "3", "4", "5", "6", "7");
    const round = dealRound(config(), [{ seat: 3, owner: 0, amount: 5 }, { seat: 0, owner: 1, amount: 10 }], draw);
    expect(round.hands.map((hand) => [hand.seat, hand.cards.map((c) => c.rank)])).toEqual([[0, ["2", "5"]], [3, ["3", "6"]]]);
    expect(round.dealer.map((c) => c.rank)).toEqual(["4", "7"]);
    expect(round.phase).toBe("playing");
    expect(round.active).toBe(0);
  });

  it("keeps the hole card out of the count until it is turned", () => {
    const { round } = deal1(config(), "10", "6", "9", "K");
    expect(visibleCards(round).map((c) => c.rank)).toEqual(["10", "6", "9"]);
    expect(visibleCards(revealHole(round)).map((c) => c.rank)).toEqual(["10", "6", "9", "K"]);
  });

  it("offers insurance with an ace up before anyone plays", () => {
    const { round } = deal1(config(), "10", "6", "A", "7");
    expect(round.phase).toBe("insurance");
    expect(legalActions(config(), round, 100)).toEqual([]);
    expect(insuranceOffer(round)).toEqual({ full: 5, evenMoney: 0, blackjacks: 0, others: 1 });
  });

  it("peeks under a ten and ends the round on a dealer natural", () => {
    const { round } = deal1(config(), "10", "6", "K", "A");
    expect(round.phase).toBe("dealer");
    expect(settleRound(config(), revealHole(round)).net).toBe(-10);
  });
});

describe("legal actions", () => {
  it("offers surrender only on the original two cards, and only where the rules deal it", () => {
    const table = config();
    const { round, draw } = deal1(table, "10", "6", "9", "7", "2");
    expect(legalActions(table, round, 100)).toEqual(["H", "S", "D", "R"]);
    const hit = applyAction(table, round, "H", draw);
    expect(hit.hands[0].cards).toHaveLength(3);
    expect(legalActions(table, hit, 100)).toEqual(["H", "S"]);
    expect(legalActions(config({ surrender: "none" }), deal1(config({ surrender: "none" }), "10", "6", "9", "7").round, 100)).toEqual(["H", "S", "D"]);
  });

  it("needs a second bet's worth of cash to double or split", () => {
    const table = config({ surrender: "none" });
    const { round } = deal1(table, "8", "8", "6", "10");
    expect(legalActions(table, round, 10)).toEqual(["H", "S", "D", "P"]);
    expect(legalActions(table, round, 9.5)).toEqual(["H", "S"]);
  });

  it("follows the doubling rule: hard 9–11 or 10–11 only, never soft", () => {
    const nine = config({ doubling: "9-11", surrender: "none" });
    expect(legalActions(nine, deal1(nine, "5", "4", "6", "10").round, 100)).toContain("D");
    expect(legalActions(nine, deal1(nine, "A", "7", "6", "10").round, 100)).not.toContain("D");
    const ten = config({ doubling: "10-11", surrender: "none" });
    expect(legalActions(ten, deal1(ten, "5", "4", "6", "10").round, 100)).not.toContain("D");
    expect(legalActions(ten, deal1(ten, "5", "5", "6", "10").round, 100)).toContain("D");
  });

  it("doubles after a split only with DAS, and never surrenders a split hand", () => {
    for (const das of [true, false]) {
      const table = config({ das });
      const { round, draw } = deal1(table, "8", "8", "6", "10", "3", "K");
      const split = applyAction(table, round, "P", draw);
      expect(split.hands.map((hand) => hand.cards.map((c) => c.rank))).toEqual([["8", "3"], ["8"]]);
      expect(legalActions(table, split, 100)).toEqual(das ? ["H", "S", "D"] : ["H", "S"]);
    }
  });

  it("splits up to four hands in a seat and no further", () => {
    const table = config();
    const dealt = deal1(table, "8", "8", "6", "10", "8", "8", "2", "3");
    const draw = dealt.draw;
    let round = applyAction(table, dealt.round, "P", draw); // 8,8 | 8
    expect(legalActions(table, round, 100)).toContain("P");
    round = applyAction(table, round, "P", draw); // 8,8 | 8 | 8
    round = applyAction(table, round, "P", draw); // 8,8 | 8 | 8 | 8
    expect(round.hands).toHaveLength(4);
    expect(round.hands[0].cards.map((c) => c.rank)).toEqual(["8", "2"]);
    expect(legalActions(table, round, 100)).not.toContain("P");
    round = applyAction(table, round, "S", draw);
    expect(needsSplitCard(round)).toBe(true);
    round = dealSplitCard(table, round, draw);
    expect(round.hands[1].cards.map((c) => c.rank)).toEqual(["8", "3"]);
    expect(legalActions(table, round, 100)).not.toContain("P");
  });

  it("gives split aces one card each, and lets them resplit only when the table allows", () => {
    const table = config();
    const { round, draw } = deal1(table, "A", "A", "6", "10", "A", "9", "5", "K");
    const split = applyAction(table, round, "P", draw);
    // First ace drew an ace: resplit or stand, nothing else.
    expect(split.hands[0].cards.map((c) => c.rank)).toEqual(["A", "A"]);
    expect(legalActions(table, split, 100)).toEqual(["S", "P"]);
    const resplit = applyAction(table, split, "P", draw);
    expect(resplit.hands.map((hand) => hand.status)).toEqual(["stood", "waiting", "waiting"]);
    const second = dealSplitCard(table, resplit, draw);
    expect(second.hands[1].status).toBe("stood");
    const third = dealSplitCard(table, second, draw);
    expect(third.hands.map((hand) => hand.cards.map((c) => c.rank))).toEqual([["A", "9"], ["A", "5"], ["A", "K"]]);
    expect(third.phase).toBe("dealer");

    const noResplit = config({}, { resplitAces: false });
    const again = deal1(noResplit, "A", "A", "6", "10", "A", "9");
    const once = applyAction(noResplit, again.round, "P", again.draw);
    expect(once.hands[0].status).toBe("stood");
    expect(legalActions(noResplit, once, 100)).toEqual([]);
  });

  it("deals a split hand its second card only when its turn comes", () => {
    const table = config();
    const { round, draw } = deal1(table, "9", "9", "6", "10", "2", "K", "7");
    const split = applyAction(table, round, "P", draw);
    expect(split.hands[1].cards).toHaveLength(1);
    expect(needsSplitCard(split)).toBe(false);
    const hit = applyAction(table, split, "H", draw); // 9,2,K = 21: stands itself
    expect(hit.hands[0].status).toBe("stood");
    expect(needsSplitCard(hit)).toBe(true);
    expect(dealSplitCard(table, hit, draw).hands[1].cards.map((c) => c.rank)).toEqual(["9", "7"]);
  });
});

describe("settlement", () => {
  it("pays a natural 3:2 (or 6:5) and a split 21 only even money", () => {
    const { round, draw } = deal1(config(), "A", "K", "9", "8");
    expect(round.hands[0].status).toBe("blackjack");
    expect(round.phase).toBe("dealer");
    expect(finish(config(), round, draw).settlement.net).toBe(15);
    const sixFive = config({}, { blackjackPayout: 1.2 });
    expect(finish(sixFive, deal1(sixFive, "A", "K", "9", "8").round, draw).settlement.net).toBe(12);

    const table = config();
    const split = deal1(table, "A", "A", "9", "8", "K", "5");
    let next = applyAction(table, split.round, "P", split.draw);
    next = dealSplitCard(table, next, split.draw);
    const { settlement } = finish(table, next, split.draw);
    expect(settlement.hands.map((hand) => [hand.outcome, hand.net])).toEqual([["Win", 10], ["Loss", -10]]);
  });

  it("pushes a natural against a dealer natural and loses everything else to it", () => {
    const table = config();
    const draw = shoe("A", "6", "A", "K", "K", "K");
    const round = dealRound(table, [{ seat: 0, owner: 0, amount: 10 }, { seat: 1, owner: 0, amount: 20 }], draw);
    expect(round.phase).toBe("insurance");
    const after = resolveInsurance(round, 0);
    expect(after.phase).toBe("dealer");
    const { settlement } = finish(table, after, draw);
    expect(settlement.hands.map((hand) => [hand.outcome, hand.net])).toEqual([["Push", 0], ["Dealer blackjack", -20]]);
  });

  it("pays insurance 2:1, which makes even money a sure win of one bet", () => {
    const table = config();
    for (const [hole, expected] of [["K", 10], ["7", 10]] as const) {
      const { round, draw } = deal1(table, "A", "K", "A", hole, "2");
      expect(insuranceOffer(round)).toMatchObject({ evenMoney: 5, blackjacks: 1 });
      const { settlement } = finish(table, resolveInsurance(round, 5), draw);
      expect(settlement.net).toBe(expected);
    }
    const insured = deal1(table, "10", "9", "A", "K");
    const { settlement } = finish(table, resolveInsurance(insured.round, 5), insured.draw);
    expect([settlement.insuranceNet, settlement.net]).toEqual([10, 0]);
  });

  it("returns half a surrendered bet and settles a double for twice the bet", () => {
    const table = config();
    const surrendered = deal1(table, "10", "6", "9", "7");
    const given = applyAction(table, surrendered.round, "R", surrendered.draw);
    expect(finish(table, given, surrendered.draw).settlement).toMatchObject({ net: -5, returned: 5 });
    const doubled = deal1(table, "6", "5", "6", "10", "K", "K");
    const next = applyAction(table, doubled.round, "D", doubled.draw);
    expect(next.hands[0]).toMatchObject({ bet: 20, doubled: true, status: "stood" });
    expect(finish(table, next, doubled.draw).settlement).toMatchObject({ net: 20, returned: 40 });
  });
});

describe("the dealer", () => {
  it("hits soft 17 under H17 and stands on it under S17", () => {
    for (const hitSoft17 of [true, false]) {
      const table = config({ hitSoft17 });
      const { round } = deal1(table, "10", "8", "A", "6", "3");
      const next = revealHole(resolveInsurance(round, 0));
      expect(dealerNeedsCard(table, next)).toBe(hitSoft17);
    }
    const table = config();
    const hard17 = deal1(table, "10", "8", "10", "7");
    expect(dealerNeedsCard(table, revealHole(applyAction(table, hard17.round, "S", hard17.draw)))).toBe(false);
  });

  it("does not draw when every hand has busted or surrendered", () => {
    const table = config();
    const { round, draw } = deal1(table, "10", "6", "9", "5", "K");
    const bust = applyAction(table, round, "H", draw);
    expect(bust.hands[0].status).toBe("busted");
    expect(bust.phase).toBe("dealer");
    expect(dealerNeedsCard(table, revealHole(bust))).toBe(false);
  });
});

describe("early surrender against a ten", () => {
  const es = config({ surrender: "early" });

  it("takes the surrender before the peek, so it saves half the bet against a natural", () => {
    const { round, draw } = deal1(es, "10", "6", "K", "A");
    expect(round.phase).toBe("playing");
    expect(round.earlySurrenderOpen).toBe(true);
    expect(legalActions(es, round, 100)).toContain("R");
    const given = applyAction(es, round, "R", draw);
    expect(finish(es, given, draw).settlement.net).toBe(-5);
  });

  it("deals nothing into a known natural: a hand that plays on just loses its bet", () => {
    const { round, draw } = deal1(es, "10", "6", "K", "A");
    const hit = applyAction(es, round, "H", draw);
    expect(hit.hands[0].cards).toHaveLength(2);
    expect(finish(es, hit, draw).settlement.net).toBe(-10);
  });

  it("plays normally when the dealer has no natural", () => {
    const { round, draw } = deal1(es, "10", "2", "K", "7", "5");
    const hit = applyAction(es, round, "H", draw);
    expect(hit.hands[0].cards.map((c) => c.rank)).toEqual(["10", "2", "5"]);
  });
});
