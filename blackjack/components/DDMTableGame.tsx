"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { track } from "@/lib/analytics/track";
import { chipColorClasses, chipLabel, chipOptions } from "@/lib/blackjack/chips";
import type { Card, Rank, Suit } from "@/lib/blackjack/types";
import {
  ACTION_NAMES,
  createShoe,
  dealerShouldHit,
  formatUpcard,
  handValue,
  hiLoTag,
  insuranceRecommended,
  isBlackjack,
  rampUnits,
  recommendAction,
  settleRound,
  shuffled,
  trueCount,
  type DDMAction,
  type DDMCard,
  type DDMRank,
} from "@/lib/ddm/engine";
import type { ExactEvInput, ExactEvResult } from "@/lib/ddm/exactEv";
import { useWakeLock } from "@/lib/pwa/useWakeLock";
import { CoachPanel, EvMetrics, GameHistory, type CoachNote, type GameHistoryRow } from "./CasinoGameUI";
import { PlayingCard } from "./PlayingCard";
import { Button, GhostButton, MobileActionDock, NumberField, Panel, Select } from "./ui";

type Phase = "setup" | "bet" | "dealing" | "insurance" | "play" | "dealer" | "shoe-end";
type HandStatus = "playing" | "stood" | "busted";
type Spread = "flat" | "1-8" | "1-16";
type CoachCategory = "bet" | "insurance" | "strategy" | "deviation";

interface DDMHand {
  cards: DDMCard[];
  /** The wager placed before the deal; insurance and blackjack pay off this. */
  baseBet: number;
  /** The base bet after every double on this hand. */
  bet: number;
  doubles: number;
  spot: number;
  player: number;
  status: HandStatus;
  insurance: number;
}

type CategoryStats = Record<CoachCategory, { correct: number; total: number }>;

const INITIAL_STATS: CategoryStats = {
  bet: { correct: 0, total: 0 },
  insurance: { correct: 0, total: 0 },
  strategy: { correct: 0, total: 0 },
  deviation: { correct: 0, total: 0 },
};

const SPREAD_LABELS: Record<Spread, string> = { flat: "Flat", "1-8": "1–8", "1-16": "1–16" };
const ACTION_ORDER: DDMAction[] = ["S", "H", "D"];
const SUIT_NAMES: Record<DDMCard["suit"], Suit> = { c: "clubs", d: "diamonds", h: "hearts", s: "spades" };
const FACE_BY_PIP: Record<number, Rank> = { 10: "10", 11: "J", 12: "Q", 13: "K" };

/** The solved 1–16 ramp is the benchmark spread; the other two are training wheels. */
const spreadUnits = (spread: Spread, tc: number) => {
  if (spread === "flat") return 1;
  if (spread === "1-16") return rampUnits(tc);
  return tc <= 0 ? 1 : [2, 4, 6, 8][Math.min(tc, 4) - 1];
};

const money = (value: number) => (value % 1 === 0 ? `${value}` : value.toFixed(2));
const signed = (value: number) => `${value >= 0 ? "+" : ""}${value}`;
const pause = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** The engine only tracks a rank, so the face value rides along for the felt. */
function displayCard(card: DDMCard): Card {
  const rank: Rank = card.rank === 1 ? "A" : card.rank === 10 ? FACE_BY_PIP[card.pip ?? 10] ?? "10" : (String(card.rank) as Rank);
  return { rank, suit: SUIT_NAMES[card.suit] };
}

// Each card in a hand is dealt slightly lower and more rotated than the one
// before it, so a hand reads as cards stacked diagonally on the felt rather
// than a flat overlapping row. `extraRotate` layers in the table-arc tilt so
// a spot's whole hand also leans a few degrees toward the dealer.
const cardCascade = (index: number, extraRotate = 0) => ({
  transform: `translateY(${index * 7}px) rotate(${index * 5 + extraRotate}deg)`,
});

function sound(kind: "deal" | "chip" | "good" | "bad" | "win", enabled: boolean) {
  if (!enabled) return;
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const frequencies = { deal: 330, chip: 440, good: 660, bad: 180, win: 880 };
    oscillator.type = kind === "bad" ? "sawtooth" : "sine";
    oscillator.frequency.setValueAtTime(frequencies[kind], context.currentTime);
    gain.gain.setValueAtTime(0.055, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.1);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.1);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Audio is enhancement-only.
  }
}

function handLabel(cards: readonly DDMCard[]): string {
  if (!cards.length) return "—";
  if (isBlackjack(cards)) return "Blackjack";
  const value = handValue(cards);
  return value.bust ? `${value.hardTotal} bust` : `${value.soft ? "Soft " : ""}${value.total}`;
}

function dealerLabel(cards: readonly DDMCard[]): string {
  if (isBlackjack(cards)) return "Blackjack";
  const value = handValue(cards);
  if (value.hardTotal === 22) return "22 · pushes";
  return value.bust ? `${value.hardTotal} bust` : `${value.total}`;
}

export function DDMTableGame({ active = true }: { active?: boolean }) {
  const [phase, setPhase] = useState<Phase>("setup");
  useWakeLock(active && phase !== "setup");
  const [decks, setDecks] = useState(6);
  const [penetration, setPenetration] = useState(0.83);
  const [spread, setSpread] = useState<Spread>("1-16");
  const [unit, setUnit] = useState(10);
  const [startingBankroll, setStartingBankroll] = useState(1000);
  const [players, setPlayers] = useState(1);
  const [holePeek, setHolePeek] = useState(false);
  const [coachHints, setCoachHints] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [animations, setAnimations] = useState(true);
  const [fastMode, setFastMode] = useState(false);

  const [bankroll, setBankroll] = useState(1000);
  const [wagers, setWagers] = useState<number[]>(() => Array(5).fill(0));
  const [lastWagers, setLastWagers] = useState<number[]>(() => Array(5).fill(0));
  const [selectedSpot, setSelectedSpot] = useState(2);
  const [spotOwners, setSpotOwners] = useState<number[]>(() => Array(5).fill(0));
  const [chipHistory, setChipHistory] = useState<Array<{ spot: number; value: number }>>([]);
  const [dealerCards, setDealerCards] = useState<DDMCard[]>([]);
  const [hands, setHands] = useState<DDMHand[]>([]);
  const [activeHand, setActiveHand] = useState(0);
  const [exposed, setExposed] = useState<number[]>(() => Array(11).fill(0));
  const [discarded, setDiscarded] = useState(0);
  const [round, setRound] = useState(1);
  const [shoeNumber, setShoeNumber] = useState(1);
  const [note, setNote] = useState<CoachNote>();
  const [roundMessage, setRoundMessage] = useState("Build the wager the ramp calls for, then deal.");
  const [dealing, setDealing] = useState(false);
  const [stats, setStats] = useState<CategoryStats>(INITIAL_STATS);
  const [history, setHistory] = useState<GameHistoryRow[]>([]);
  const [visibleIntel, setVisibleIntel] = useState<Record<string, boolean>>({});
  const [evResult, setEvResult] = useState<ExactEvResult>();
  const [evLoading, setEvLoading] = useState(false);
  const [evError, setEvError] = useState("");
  const [evDuration, setEvDuration] = useState(0);

  const shoe = useRef<{ cards: DDMCard[]; position: number }>({ cards: [], position: 0 });
  /** Exposed cards by rank, index 1 through 10 — the count and the EV solver share it. */
  const exposedRef = useRef<number[]>(Array(11).fill(0));
  const bankrollRef = useRef(1000);
  const activeRef = useRef(active);
  const evWorker = useRef<Worker | undefined>(undefined);
  const evRequestId = useRef(0);
  const evSignatureRef = useRef("");
  const tableRef = useRef<HTMLDivElement>(null);
  const spotsRailRef = useRef<HTMLDivElement>(null);
  const previousPhase = useRef<Phase>("setup");

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const worker = new Worker(new URL("../workers/ddmExact.worker.ts", import.meta.url));
    evWorker.current = worker;
    worker.onmessage = (event: MessageEvent<{ id: number; result?: ExactEvResult; error?: string; durationMs: number }>) => {
      if (event.data.id !== evRequestId.current) return;
      setEvLoading(false);
      setEvDuration(event.data.durationMs);
      if (event.data.error) {
        setEvError(event.data.error);
        setEvResult(undefined);
      } else {
        setEvError("");
        setEvResult(event.data.result);
      }
    };
    return () => worker.terminate();
  }, []);

  const casinoPause = async (milliseconds: number) => {
    await pause(animations ? milliseconds * (fastMode ? 0.35 : 1) : 40);
    while (!activeRef.current) await pause(100);
  };

  const cardsTotal = decks * 52;
  const cutCard = Math.floor(cardsTotal * penetration);
  const exposedTotal = useMemo(() => exposed.reduce((sum, count) => sum + count, 0), [exposed]);
  const runningCount = useMemo(
    () => exposed.reduce((sum, count, rank) => sum + (rank ? hiLoTag(rank as DDMRank) * count : 0), 0),
    [exposed],
  );
  // The hole card stays in the unseen denominator until the dealer turns it over.
  const unseenCards = Math.max(1, cardsTotal - exposedTotal);
  const tc = trueCount(runningCount, unseenCards);
  const units = spreadUnits(spread, tc);
  const expectedWager = unit * units;
  const totalWager = wagers.reduce((sum, value) => sum + value, 0);
  const occupiedSpots = wagers.filter(Boolean).length;
  const committed = hands.reduce((sum, hand) => sum + hand.bet + hand.insurance, 0);
  const available = bankroll - (phase === "bet" ? totalWager : committed);
  const insuranceTotal = hands.reduce((sum, hand) => sum + hand.baseBet / 2, 0);
  const gradedTotal = Object.values(stats).reduce((sum, item) => sum + item.total, 0);
  const gradedCorrect = Object.values(stats).reduce((sum, item) => sum + item.correct, 0);
  const accuracy = gradedTotal ? Math.round((gradedCorrect / gradedTotal) * 100) : 100;
  const current = hands[activeHand];
  const dealerUp = dealerCards[0];
  const holeHidden = (phase === "dealing" || phase === "insurance" || phase === "play") && !holePeek;

  useEffect(() => {
    const prior = previousPhase.current;
    previousPhase.current = phase;
    if (!active || phase === "setup" || prior === phase || !matchMedia("(max-width: 1023px)").matches) return;
    if (prior === "setup" || (prior === "bet" && phase === "dealing")) {
      const frame = requestAnimationFrame(() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return () => cancelAnimationFrame(frame);
    }
  }, [active, phase]);

  useEffect(() => {
    if (!matchMedia("(max-width: 639px)").matches) return;
    const targetSpot = phase === "play" && current ? current.spot : phase === "bet" ? selectedSpot : undefined;
    if (targetSpot === undefined) return;
    const centerSpot = () => {
      const spot = spotsRailRef.current?.querySelector<HTMLElement>(`[data-table-spot="${targetSpot}"]`);
      if (!spot || !spotsRailRef.current) return;
      spotsRailRef.current.scrollTo({
        left: Math.max(0, spot.offsetLeft - (spotsRailRef.current.clientWidth - spot.offsetWidth) / 2),
        behavior: phase === "bet" ? "auto" : "smooth",
      });
    };
    if (phase === "bet") {
      const timer = window.setTimeout(centerSpot, 100);
      return () => window.clearTimeout(timer);
    }
    const frame = requestAnimationFrame(centerSpot);
    return () => cancelAnimationFrame(frame);
  }, [activeHand, current, phase, selectedSpot]);

  const currentCardCount = hands[activeHand]?.cards.length;
  useEffect(() => {
    evRequestId.current += 1;
    setEvResult(undefined);
    setEvLoading(false);
    setEvError("");
  }, [phase, activeHand, currentCardCount]);

  const expose = (cards: readonly DDMCard[]) => {
    const next = [...exposedRef.current];
    for (const card of cards) next[card.rank] += 1;
    exposedRef.current = next;
    setExposed(next);
  };

  const draw = (): DDMCard | undefined => {
    const card = shoe.current.cards[shoe.current.position];
    if (card) shoe.current.position += 1;
    return card;
  };

  const outOfCards = () => {
    setDealing(false);
    setRoundMessage("The shoe ran out of cards. Shuffle to keep playing.");
    setPhase("shoe-end");
  };

  const coach = (category: CoachCategory, ok: boolean, title: string, detail: string) => {
    setNote({ ok, title, detail });
    setStats((value) => ({
      ...value,
      [category]: { correct: value[category].correct + Number(ok), total: value[category].total + 1 },
    }));
    sound(ok ? "good" : "bad", soundEnabled);
  };

  const startShoe = (keepBankroll = false) => {
    shoe.current = { cards: shuffled(createShoe(decks)), position: 0 };
    exposedRef.current = Array(11).fill(0);
    setExposed(exposedRef.current);
    const opening = keepBankroll ? bankrollRef.current : startingBankroll;
    bankrollRef.current = opening;
    setBankroll(opening);
    setDiscarded(0);
    setRound(1);
    setShoeNumber((value) => (keepBankroll ? value + 1 : 1));
    setHands([]);
    setDealerCards([]);
    setActiveHand(0);
    setWagers(Array(5).fill(0));
    setLastWagers(Array(5).fill(0));
    setChipHistory([]);
    setDealing(false);
    setNote(undefined);
    setEvResult(undefined);
    setEvLoading(false);
    setEvError("");
    if (!keepBankroll) {
      setStats(INITIAL_STATS);
      setHistory([]);
      setVisibleIntel({});
    }
    setRoundMessage(`Fresh ${decks}-deck shoe. The count starts at zero — build the wager the ramp calls for.`);
    setPhase("bet");
    track("ddm_started", { decks, penetration, spread, unit, startingBankroll: opening, players });
  };

  const settle = (settledHands: DDMHand[], dealerHand: DDMCard[]) => {
    let net = 0;
    const details = settledHands.map((hand) => {
      const settlement = settleRound({
        player: hand.cards,
        dealer: dealerHand,
        wager: hand.bet,
        baseBet: hand.baseBet,
        insuranceTaken: hand.insurance > 0,
      });
      net += settlement.net;
      const insurance = hand.insurance ? ` · insurance ${settlement.insurance >= 0 ? "+" : "−"}$${money(Math.abs(settlement.insurance))}` : "";
      return `Spot ${hand.spot + 1}: ${settlement.detail}${insurance}`;
    });
    const finalBankroll = bankrollRef.current + net;
    bankrollRef.current = finalBankroll;
    setBankroll(finalBankroll);
    setHands(settledHands);
    setDiscarded(shoe.current.position);
    setWagers(Array(5).fill(0));
    setChipHistory([]);
    setDealing(false);
    const resultMessage = `${details.join(" · ")} · Dealer ${dealerLabel(dealerHand)}.`;
    const reachedCut = shoe.current.position >= cutCard;
    setHistory((rows) => [{
      id: Date.now(),
      result: net > 0 ? "Win" : net < 0 ? "Loss" : "Push",
      net,
      bankroll: finalBankroll,
      detail: resultMessage,
    }, ...rows]);
    sound(net > 0 ? "win" : "deal", soundEnabled);
    track("ddm_hand_settled", { round, net, finalBankroll, reachedCut, spots: settledHands.length });
    if (finalBankroll <= 0) {
      setRoundMessage(`${resultMessage} Bankroll exhausted.`);
      setPhase("shoe-end");
    } else if (reachedCut) {
      setRoundMessage(`${resultMessage} Cut card reached.`);
      setPhase("shoe-end");
    } else {
      setRound((value) => value + 1);
      setRoundMessage(`${resultMessage} Place the next wager when ready.`);
      setPhase("bet");
    }
  };

  const playDealer = async (settledHands: DDMHand[], dealerHand: DDMCard[]) => {
    setDealing(true);
    setRoundMessage("Dealer prepares to reveal…");
    await casinoPause(700);
    setPhase("dealer");
    setRoundMessage("Dealer reveals the hole card…");
    const next = [...dealerHand];
    if (next[1]) {
      expose([next[1]]);
      sound("deal", soundEnabled);
    }
    await casinoPause(660);
    // A table of busted hands is already settled, so the dealer never draws to it.
    const allBusted = settledHands.every((hand) => hand.status === "busted");
    while (!allBusted && dealerShouldHit(next)) {
      setRoundMessage("Dealer draws…");
      await casinoPause(660);
      const card = draw();
      if (!card) break;
      next.push(card);
      expose([card]);
      setDealerCards([...next]);
      sound("deal", soundEnabled);
    }
    await casinoPause(500);
    settle(settledHands, next);
  };

  const beginRound = async () => {
    if (dealing || !shoe.current.cards.length || totalWager <= 0 || totalWager > bankroll) return;
    const activeBets = wagers.map((bet, spot) => ({ bet, spot })).filter(({ bet }) => bet > 0);
    const betOk = activeBets.every(({ bet }) => bet === expectedWager);
    coach(
      "bet",
      betOk,
      betOk ? "Bet sizing on target" : "Bet spread mismatch",
      `At TC ${signed(tc)} the ${SPREAD_LABELS[spread]} ramp calls for ${units} unit${units === 1 ? "" : "s"} — $${money(expectedWager)} on every occupied spot.`,
    );
    track("ddm_hand_dealt", { round, totalWager, spots: activeBets.length, expectedWager, betOk, tc, decks });

    const spotCards = activeBets.map(() => draw());
    const up = draw();
    const hole = draw();
    if (!up || !hole || spotCards.some((card) => !card)) return outOfCards();
    const nextHands: DDMHand[] = activeBets.map(({ bet, spot }, index) => ({
      cards: [spotCards[index] as DDMCard],
      baseBet: bet,
      bet,
      doubles: 0,
      spot,
      player: spotOwners[spot],
      status: "playing",
      insurance: 0,
    }));
    setHands(nextHands);
    setDealerCards([up, hole]);
    setActiveHand(0);
    setLastWagers([...wagers]);
    expose([...(spotCards as DDMCard[]), up]);
    sound("deal", soundEnabled);
    setDealing(true);
    setPhase("dealing");
    setRoundMessage("One card to every spot, two to the dealer…");
    await casinoPause(820 + (activeBets.length + 2) * 300);
    if (up.rank === 1) {
      setDealing(false);
      setRoundMessage("Dealer shows an ace. Insurance pays 2 to 1 — the solved index is TC +4.");
      setPhase("insurance");
      return;
    }
    if (up.rank === 10 && hole.rank === 1) {
      await playDealer(nextHands, [up, hole]);
      return;
    }
    setDealing(false);
    setRoundMessage(`Player ${nextHands[0].player + 1} · spot ${nextHands[0].spot + 1} holds ${handLabel(nextHands[0].cards)}. Hit, stand, or double.`);
    setPhase("play");
  };

  const chooseInsurance = async (take: boolean) => {
    if (dealing || !dealerCards.length) return;
    const correct = insuranceRecommended(tc);
    coach(
      "insurance",
      take === correct,
      take === correct ? "Correct insurance decision" : correct ? "Insurance was called for" : "Insurance should be declined",
      `The solved Hi-Lo insurance index is TC +4 and the decision count is ${signed(tc)}. Insurance is graded before the dealer peeks.`,
    );
    const nextHands = hands.map((hand) => ({ ...hand, insurance: take ? hand.baseBet / 2 : 0 }));
    setHands(nextHands);
    track("ddm_insurance_decision", { take, correct, ok: take === correct, tc, stake: take ? insuranceTotal : 0 });
    setDealing(true);
    setPhase("dealing");
    setRoundMessage("Dealer checks the hole card…");
    await casinoPause(700);
    if (dealerCards[1]?.rank === 10) {
      await playDealer(nextHands, dealerCards);
      return;
    }
    setDealing(false);
    setActiveHand(0);
    setRoundMessage(take ? `Insurance placed for $${money(insuranceTotal)}. No dealer blackjack — play the table.` : "No dealer blackjack. Play the table.");
    setPhase("play");
  };

  const legalActions = (hand: DDMHand): DDMAction[] => {
    if (hand.status !== "playing") return [];
    const value = handValue(hand.cards);
    if (value.bust || value.total >= 21) return [];
    // The strict ace rule: a lone ace must take exactly one more card.
    const loneAce = hand.cards.length === 1 && hand.cards[0].rank === 1;
    const actions: DDMAction[] = loneAce ? ["H"] : ["H", "S"];
    if (available >= hand.bet) actions.push("D");
    return actions;
  };

  const advance = async (nextHands: DDMHand[], from: number) => {
    setHands(nextHands);
    const next = nextHands.findIndex((hand, index) => index > from && hand.status === "playing");
    if (next < 0) {
      await playDealer(nextHands, dealerCards);
      return;
    }
    await casinoPause(420);
    setActiveHand(next);
    setDealing(false);
    setRoundMessage(`Player ${nextHands[next].player + 1} · spot ${nextHands[next].spot + 1} holds ${handLabel(nextHands[next].cards)}.`);
  };

  const act = async (action: DDMAction) => {
    const hand = hands[activeHand];
    if (dealing || !hand || phase !== "play" || !dealerUp || !legalActions(hand).includes(action)) return;
    const recommendation = recommendAction(hand.cards, dealerUp.rank, tc);
    const ok = action === recommendation.action;
    const category: CoachCategory = recommendation.deviation ? "deviation" : "strategy";
    const plane = recommendation.plane === "first" ? "First card" : recommendation.plane === "ace" ? "First ace" : recommendation.plane === "soft" ? "Soft" : "Hard";
    const row = recommendation.plane === "ace" ? "A" : recommendation.row;
    const reason = recommendation.deviation
      ? `The TC ${signed(recommendation.deviation.threshold)} ${recommendation.deviation.direction === 1 ? "or higher" : "or lower"} departure turns ${ACTION_NAMES[recommendation.baseAction]} into ${ACTION_NAMES[recommendation.action]}.`
      : "This is the off-the-top chart play.";
    coach(
      category,
      ok,
      ok ? `${ACTION_NAMES[action]} is correct` : `${ACTION_NAMES[recommendation.action]} is the play`,
      `${plane} ${row} vs ${formatUpcard(dealerUp.rank)} at TC ${signed(tc)}. ${reason}`,
    );
    track("ddm_playing_decision", {
      action,
      expected: recommendation.action,
      ok,
      tc,
      total: handValue(hand.cards).total,
      deviation: Boolean(recommendation.deviation),
    });

    setDealing(true);
    const nextHands = hands.map((item, index) => (index === activeHand ? { ...item, cards: [...item.cards] } : item));
    const next = nextHands[activeHand];
    if (action === "S") {
      next.status = "stood";
      setRoundMessage(`Stand on ${handLabel(next.cards)}. Moving on…`);
      await advance(nextHands, activeHand);
      return;
    }
    const loneAce = next.cards.length === 1 && next.cards[0].rank === 1;
    if (action === "D") {
      next.bet *= 2;
      next.doubles += 1;
    }
    const card = draw();
    if (!card) return outOfCards();
    next.cards.push(card);
    expose([card]);
    sound(action === "D" ? "chip" : "deal", soundEnabled);
    const value = handValue(next.cards);
    const natural = isBlackjack(next.cards);
    if (loneAce || value.bust || natural || value.total === 21) {
      next.status = value.bust ? "busted" : "stood";
      setRoundMessage(
        value.bust
          ? `Bust with ${value.hardTotal}. Moving on…`
          : natural
            ? "Blackjack! Moving on…"
            : loneAce
              ? `The ace takes exactly one card — ${handLabel(next.cards)}. Moving on…`
              : `${handLabel(next.cards)}. Moving on…`,
      );
      await advance(nextHands, activeHand);
      return;
    }
    setHands(nextHands);
    setDealing(false);
    setRoundMessage(
      action === "D"
        ? `Doubled to $${money(next.bet)} · ${handLabel(next.cards)}. You may double again.`
        : `${handLabel(next.cards)}. Hit, stand, or double.`,
    );
  };

  const handSignature = (hand: DDMHand) => `${hand.cards.map((card) => card.id).join(",")}|${dealerUp?.id ?? ""}`;

  const requestEv = (hand: DDMHand) => {
    if (!evWorker.current || !dealerUp) return;
    // The solver removes this hand and the upcard itself, and it keeps the hole
    // card in the unseen composition so the answer is peek-conditioned.
    const deadCards = Array.from({ length: 10 }, (_, index) => {
      const rank = (index + 1) as DDMRank;
      return exposedRef.current[rank] - hand.cards.filter((card) => card.rank === rank).length - Number(dealerUp.rank === rank);
    });
    evSignatureRef.current = handSignature(hand);
    const id = ++evRequestId.current;
    setEvLoading(true);
    setEvResult(undefined);
    setEvError("");
    track("ddm_ev_requested", { total: handValue(hand.cards).total, tc });
    evWorker.current.postMessage({
      id,
      input: { decks, player: hand.cards.map((card) => card.rank), dealerUp: dealerUp.rank, deadCards } satisfies ExactEvInput,
    });
  };

  // Real casino chip denominations — build any bet by clicking several, same
  // as at an actual table, instead of scaling with the training "unit".
  const chipValues: readonly number[] = chipOptions;
  // Positions each of the 5 spots on a semicircle curving around the dealer,
  // like a real table's rail: the two end spots sit close to the dealer near
  // the top, the center spot sits farthest away at the bottom, and every
  // spot's cards tilt a few degrees toward the dealer to match.
  const tableArc = useMemo(() => {
    const angleRange = 78;
    const topNear = 34;
    const topFar = 92;
    const cosNear = Math.cos((angleRange * Math.PI) / 180);
    return Array.from({ length: 5 }, (_, spot) => {
      const angleDeg = -angleRange + (spot / 4) * angleRange * 2;
      const angleRad = (angleDeg * Math.PI) / 180;
      const factor = (Math.cos(angleRad) - cosNear) / (1 - cosNear);
      return {
        left: 50 + Math.sin(angleRad) * 44,
        top: topNear + factor * (topFar - topNear),
        rotate: angleDeg * 0.12,
      };
    });
  }, []);

  const clearPreviousHandForBet = () => {
    if (phase !== "bet" || (!hands.length && !dealerCards.length)) return;
    setHands([]);
    setDealerCards([]);
    setRoundMessage("Build the next wager, then deal when ready.");
  };

  const placeChip = (value: number) => {
    if (totalWager + value > bankroll) return;
    clearPreviousHandForBet();
    setWagers((currentWagers) => currentWagers.map((bet, spot) => (spot === selectedSpot ? bet + value : bet)));
    setChipHistory((rows) => [...rows, { spot: selectedSpot, value }]);
    sound("chip", soundEnabled);
  };

  const undoChip = () => {
    const last = chipHistory.at(-1);
    if (!last) return;
    setWagers((currentWagers) => currentWagers.map((bet, spot) => (spot === last.spot ? Math.max(0, bet - last.value) : bet)));
    setChipHistory((rows) => rows.slice(0, -1));
  };

  const repeatLastBet = () => {
    const previousTotal = lastWagers.reduce((sum, bet) => sum + bet, 0);
    if (!previousTotal || previousTotal > bankroll) return;
    clearPreviousHandForBet();
    setWagers([...lastWagers]);
    setChipHistory([]);
  };

  if (phase === "setup") return (
    <div className="mt-5 pb-24 lg:pb-0">
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">Casino session setup</p>
        <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Take a seat at the Madness table</h2>
        <p className="mt-2 max-w-3xl text-zinc-400">Choose the shoe, the shared bankroll, how many players sit down, and the ramp the coach grades you against. One card starts every hand and you may keep doubling until you stand.</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel>
          <h3 className="mb-5 text-lg font-semibold">Shoe and dealing</h3>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Select label="Decks" value={decks} onChange={(event) => setDecks(+event.target.value)}>
              {[1, 2, 4, 6, 8].map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
            <Select label="Penetration" value={penetration} onChange={(event) => setPenetration(+event.target.value)}>
              <option value={0.65}>65%</option>
              <option value={0.75}>75%</option>
              <option value={0.8}>80%</option>
              <option value={0.83}>83% · one deck cut off</option>
              <option value={0.85}>85%</option>
            </Select>
            <Select label="Dealer hole card" value={holePeek ? "peek" : "hidden"} onChange={(event) => setHolePeek(event.target.value === "peek")}>
              <option value="hidden">Hidden (realistic)</option>
              <option value="peek">Face up every hand</option>
            </Select>
          </div>
          <div className="mt-5 rounded-xl border border-emerald-400/15 bg-emerald-400/[.06] p-4 text-xs leading-5 text-emerald-100">
            <b className="mb-2 block uppercase tracking-wider">Fixed Madness rules</b>
            One card to start · unlimited doubles · a lone ace takes exactly one card · dealer hits soft 17 · dealer 22 pushes · blackjack pays 3:2, suited 2:1 · insurance pays 2:1.
          </div>
        </Panel>
        <Panel>
          <h3 className="mb-5 text-lg font-semibold">Table and pace</h3>
          <div className="space-y-3 text-sm">
            <Select label="Players" value={players} onChange={(event) => {
              const count = +event.target.value;
              setPlayers(count);
              setSpotOwners((owners) => owners.map((owner, spot) => (owner < count ? owner : spot % count)));
            }}>
              {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} player{value === 1 ? "" : "s"}</option>)}
            </Select>
            <label className="flex items-center justify-between rounded-xl bg-black/20 p-3"><span>Card animations</span><input type="checkbox" checked={animations} onChange={(event) => setAnimations(event.target.checked)} className="h-5 w-5 accent-emerald-400" /></label>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-black/20 p-3"><span><b className="block font-medium">Fast mode</b><small className="text-zinc-500">Shorter casino pauses</small></span><button type="button" role="switch" aria-label="Fast dealing mode" aria-checked={fastMode} onClick={() => setFastMode((value) => !value)} className={`pressable flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors ${fastMode ? "justify-end bg-emerald-400" : "justify-start bg-zinc-700"}`}><span className="h-6 w-6 rounded-full bg-white shadow" /></button></div>
            <label className="flex items-center justify-between rounded-xl bg-black/20 p-3"><span>Sound effects</span><input type="checkbox" checked={soundEnabled} onChange={(event) => setSoundEnabled(event.target.checked)} className="h-5 w-5 accent-emerald-400" /></label>
            <label className="flex items-center justify-between rounded-xl bg-black/20 p-3"><span><b className="block font-medium">Strategy hint</b><small className="text-zinc-500">Names the chart play before you act</small></span><input type="checkbox" checked={coachHints} onChange={(event) => setCoachHints(event.target.checked)} className="h-5 w-5 accent-emerald-400" /></label>
          </div>
        </Panel>
        <Panel>
          <h3 className="mb-5 text-lg font-semibold">Bankroll and ramp</h3>
          <div className="space-y-4">
            <NumberField label="Shared starting bankroll" prefix="$" min={100} step={100} value={startingBankroll} onValueChange={setStartingBankroll} />
            <NumberField label="One unit" prefix="$" min={1} step={5} value={unit} onValueChange={setUnit} />
            <Select label="Bet spread" value={spread} onChange={(event) => setSpread(event.target.value as Spread)}>
              <option value="flat">Flat bet · 1 unit</option>
              <option value="1-8">1–8 · 1/2/4/6/8</option>
              <option value="1-16">1–16 · solved benchmark ramp</option>
            </Select>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              {[0, 1, 2, 3, 4, 5].map((level) => <div key={level} className="rounded-lg bg-black/20 p-2">
                <span className="text-zinc-500">TC {level === 0 ? "≤0" : signed(level)}</span>
                <b className="mt-1 block text-sm">{spreadUnits(spread, level)}u</b>
                <span className="text-[.65rem] text-zinc-600">${money(unit * spreadUnits(spread, level))}</span>
              </div>)}
            </div>
            <p className="text-xs leading-5 text-zinc-500">The 1–16 ramp is the benchmark spread from the solver: 1/3/7/11/15/16 units. The coach flags missed increases and oversized bets on every occupied spot.</p>
          </div>
        </Panel>
      </div>
      <Button className="mt-5 hidden lg:inline-flex" onClick={() => startShoe()}>Buy in and shuffle</Button>
      <MobileActionDock label="Start the table">
        <Button className="w-full" onClick={() => startShoe()}>Buy in and shuffle</Button>
      </MobileActionDock>
    </div>
  );

  const metrics: Array<{ label: string; value: string | number; intel?: "rc" | "tc" | "decks" | "discard" }> = [
    { label: "Bankroll", value: `$${bankroll.toFixed(2)}` },
    { label: phase === "bet" ? "Available" : "In action", value: phase === "bet" ? `$${available.toFixed(2)}` : `$${committed.toFixed(2)}` },
    { label: "Running count", value: signed(runningCount), intel: "rc" },
    { label: "True count", value: signed(tc), intel: "tc" },
    { label: "Decks unseen", value: (unseenCards / 52).toFixed(2), intel: "decks" },
    { label: "Coach accuracy", value: `${accuracy}%` },
    { label: "Cards discarded", value: discarded, intel: "discard" },
  ];

  const evEntries = evResult && evSignatureRef.current === (current ? handSignature(current) : "")
    ? Object.fromEntries(ACTION_ORDER.filter((action) => evResult.actionEv[action] !== undefined).map((action) => [ACTION_NAMES[action], evResult.actionEv[action] as number]))
    : undefined;
  const hint = coachHints && phase === "play" && current?.status === "playing" && dealerUp ? recommendAction(current.cards, dealerUp.rank, tc) : undefined;

  const playButtons = current ? legalActions(current).map((action) => (
    <Button disabled={dealing} className="w-full sm:w-auto" key={action} onClick={() => act(action)}>
      {ACTION_NAMES[action]}{action === "D" ? ` · $${money(current.bet * 2)}` : ""}
    </Button>
  )) : null;

  return (
    <div className="mt-5 pb-24 lg:pb-0 2xl:-mx-6">
      <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:mb-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">Shoe {shoeNumber} · Round {round} · {decks}D H17 · {SPREAD_LABELS[spread]} spread</p>
          <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Double Down Madness table</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" role="switch" aria-label="Fast dealing mode" aria-checked={fastMode} title="Toggle fast dealing" disabled={dealing} onClick={() => setFastMode((value) => !value)} className={`pressable flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold disabled:opacity-40 ${fastMode ? "border-amber-300/40 bg-amber-300/15 text-amber-200" : "border-white/10 bg-white/[.05] text-zinc-400"}`}>
            <i className="fa-solid fa-bolt" aria-hidden="true" /><span className="hidden sm:inline">Fast</span><span className={`h-2 w-2 rounded-full ${fastMode ? "bg-amber-300" : "bg-zinc-600"}`} />
          </button>
          <GhostButton disabled={dealing} className="px-3 text-sm sm:px-4" onClick={() => setPhase("setup")}>End</GhostButton>
        </div>
      </div>

      <div className="casino-stat-strip mobile-scroll-rail -mx-4 mb-4 flex gap-px overflow-x-auto px-4 py-1 sm:mx-0 sm:mb-5 sm:grid sm:grid-cols-4 sm:gap-px sm:overflow-hidden sm:px-1 xl:grid-cols-7">
        {metrics.map(({ label, value, intel }) => <div key={label} className="casino-stat relative min-w-[8.25rem] snap-start px-3 py-2 sm:min-w-0">
          <p className="pr-7 text-[.67rem] uppercase tracking-wider text-zinc-500">{label}</p>
          {intel && <button type="button" aria-label={`${visibleIntel[intel] ? "Hide" : "Reveal"} ${label.toLowerCase()}`} aria-pressed={Boolean(visibleIntel[intel])} onClick={() => setVisibleIntel((shown) => ({ ...shown, [intel]: !shown[intel] }))} className="pressable absolute right-2.5 top-2 grid h-7 w-7 place-items-center rounded-full text-xs text-zinc-500 hover:bg-white/10 hover:text-emerald-300">
            <i aria-hidden="true" className={`fas ${visibleIntel[intel] ? "fa-eye-slash" : "fa-eye"}`} />
          </button>}
          <p className={`mt-1 truncate text-lg font-semibold sm:text-xl ${intel && !visibleIntel[intel] ? "select-none tracking-[.18em] text-zinc-600" : ""}`}>{intel && !visibleIntel[intel] ? "•••" : value}</p>
        </div>)}
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div ref={tableRef} className="min-w-0 scroll-mt-[calc(4.5rem+env(safe-area-inset-top))]">
          <Panel className="casino-table-frame overflow-hidden p-0">
            <div className="casino-table-rail">
              <div className="casino-felt relative min-h-[370px] sm:min-h-[590px] xl:min-h-[620px] 2xl:min-h-[660px]">
                <div className="casino-table-print pointer-events-none absolute inset-0 hidden sm:block" aria-hidden="true">
                  <p className="casino-table-title">BLACKJACK PAYS 3 TO 2</p>
                  <p className="casino-table-rules">Suited blackjack pays 2 to 1 · Dealer must hit soft 17 · Dealer 22 pushes</p>
                  <div className="casino-insurance-line"><span>INSURANCE PAYS 2 TO 1</span></div>
                </div>

                <div className="casino-table-hardware pointer-events-none absolute inset-x-10 top-4 z-[1] hidden items-start justify-between sm:flex xl:inset-x-12" aria-hidden="true">
                  <div className="casino-hardware-unit casino-discard-tray-mini">
                    <span className="casino-hardware-label">Discard</span>
                    <div className="casino-discard-cards" style={{ height: `${Math.max(5, Math.min(72, (discarded / Math.max(1, cutCard)) * 72))}%` }} />
                  </div>
                  <div className="casino-chip-rack-mini">
                    {chipValues.slice(1).map((value) => <span key={value} className={chipColorClasses(value)} />)}
                  </div>
                  <div className="casino-table-limits"><b>MIN ${money(unit)}</b><b>MAX ${money(unit * 100)}</b></div>
                  <div className="casino-card-shoe-mini"><span /><i /></div>
                </div>

                <div className="relative z-[2] pt-4 text-center sm:pt-16">
                  <p className="mb-2 text-[.65rem] font-bold uppercase tracking-[.28em] text-emerald-50/55">Dealer {dealerCards.length && !holeHidden ? `· ${dealerLabel(dealerCards)}` : ""}</p>
                  <div className="flex min-h-24 justify-center -space-x-5 sm:min-h-32">
                    {dealerCards.map((card, index) => <div key={card.id} style={cardCascade(index)}>
                      <PlayingCard card={displayCard(card)} hidden={index === 1 && holeHidden} size="table" animated={animations} fast={fastMode} dealIndex={phase === "dealing" ? occupiedSpots + index : 0} flip={index === 1 && !holeHidden} />
                    </div>)}
                  </div>
                </div>

                {/* Below sm this stays a horizontally-scrolling row (5 spots don't fit a small screen);
                    at sm+ it becomes a semicircle around the dealer via the --spot-left/--spot-top
                    custom properties computed in tableArc. */}
                <div ref={spotsRailRef} className="casino-spots relative -mx-3 mt-6 flex min-h-48 snap-x snap-mandatory items-start gap-3 overflow-x-auto px-3 pb-3 sm:absolute sm:inset-0 sm:mx-0 sm:mt-0 sm:block sm:min-h-0 sm:overflow-visible sm:px-0 sm:pb-0">
                  {Array.from({ length: 5 }, (_, spot) => {
                    const hand = hands.find((item) => item.spot === spot);
                    const handIndex = hand ? hands.indexOf(hand) : -1;
                    const activeHere = phase === "play" && current?.spot === spot;
                    const selected = phase === "bet" && selectedSpot === spot;
                    const bet = wagers[spot];
                    const spotOrder = wagers.slice(0, spot).filter(Boolean).length;
                    const arc = tableArc[spot];
                    return <button
                      key={spot}
                      data-table-spot={spot}
                      type="button"
                      disabled={phase !== "bet"}
                      onClick={() => setSelectedSpot(spot)}
                      style={{ "--spot-left": `${arc.left}%`, "--spot-top": `${arc.top}%` } as CSSProperties}
                      className={`casino-seat relative min-h-44 w-40 min-w-40 snap-center rounded-[2rem] px-1 py-3 text-center transition duration-200 disabled:cursor-default sm:absolute sm:left-[var(--spot-left)] sm:top-[var(--spot-top)] sm:min-h-56 sm:w-40 sm:min-w-0 sm:-translate-x-1/2 sm:-translate-y-1/2 xl:min-h-72 xl:w-44 xl:px-2 xl:py-4 2xl:w-48 ${activeHere ? "casino-seat-active" : selected ? "casino-seat-selected" : ""}`}
                    >
                      <p className="mb-2 text-[.58rem] font-bold uppercase tracking-[.18em] text-emerald-50/55">P{spotOwners[spot] + 1} · Seat {spot + 1}</p>
                      {hand ? <div className={phase === "play" && handIndex === activeHand ? "rounded-xl bg-amber-200/10 p-1" : "p-1"}>
                        <div className="flex justify-center -space-x-7 lg:-space-x-10 2xl:-space-x-12">
                          {hand.cards.map((card, cardIndex) => <div key={card.id} style={cardCascade(cardIndex, arc.rotate)}>
                            <PlayingCard card={displayCard(card)} size="table" animated={animations} fast={fastMode} dealIndex={phase === "dealing" ? spotOrder : 0} />
                          </div>)}
                        </div>
                        <p className="mt-1 text-[.62rem] font-semibold">${money(hand.bet)} · {handLabel(hand.cards)}</p>
                        {hand.doubles > 0 && <span className="text-[.55rem] font-bold uppercase text-amber-200/70">{hand.doubles}× doubled</span>}
                        {hand.status !== "playing" && <span className="ml-1 text-[.55rem] font-bold uppercase text-emerald-100/55">{hand.status}</span>}
                      </div> : <div className={`casino-bet-circle mx-auto grid h-20 w-20 place-items-center rounded-full ${selected ? "casino-bet-circle-selected" : ""}`}>
                        {bet > 0 ? <div key={`${spot}-${bet}`} className={`casino-chip-drop grid h-14 w-14 place-items-center rounded-full border-4 border-dashed text-xs font-black shadow-[0_8px_18px_#0008] ${chipColorClasses(bet)}`}>{chipLabel(bet)}</div> : <span className="text-[.6rem] font-semibold uppercase text-emerald-100/35">Bet</span>}
                      </div>}
                      {phase === "bet" && bet > 0 && <p className={`mt-2 text-[.6rem] font-semibold ${bet === expectedWager ? "text-emerald-200" : "text-amber-200"}`}>${money(bet)} · {bet === expectedWager ? "On ramp" : `Target $${money(expectedWager)}`}</p>}
                    </button>;
                  })}
                </div>
              </div>
            </div>

            <div className="casino-control-rail relative p-3 sm:p-4">
              <p aria-live="polite" className="mb-4 text-center text-sm text-zinc-200">{roundMessage}</p>
              {phase === "bet" && <div>
                <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
                  <span className="text-sm text-zinc-400">Selected: spot {selectedSpot + 1}</span>
                  <strong className="text-3xl">${money(wagers[selectedSpot])}</strong>
                  <span className="rounded-full bg-emerald-300/15 px-3 py-1 text-xs text-emerald-200">{occupiedSpots} spot{occupiedSpots === 1 ? "" : "s"} · ${money(totalWager)} total</span>
                </div>
                {players > 1 && <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
                  <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Spot owner</span>
                  {Array.from({ length: players }, (_, player) => <button key={player} type="button" aria-pressed={spotOwners[selectedSpot] === player} onClick={() => setSpotOwners((owners) => owners.map((owner, spot) => (spot === selectedSpot ? player : owner)))} className={`pressable min-h-10 rounded-full px-3 text-sm font-semibold ${spotOwners[selectedSpot] === player ? "bg-emerald-300 text-emerald-950" : "border border-white/10 bg-white/[.05] text-zinc-300"}`}>Player {player + 1}</button>)}
                </div>}
                <div className="casino-chip-rail mx-auto flex max-w-2xl flex-wrap items-end justify-center gap-2 rounded-[1.4rem] p-2 sm:gap-3 sm:p-3">
                  {chipValues.map((value) => <button key={value} type="button" disabled={totalWager + value > bankroll} onClick={() => placeChip(value)} className={`casino-chip grid h-14 w-14 place-items-center rounded-full border-4 border-dashed text-[.65rem] font-black shadow-xl disabled:opacity-30 sm:h-16 sm:w-16 sm:text-xs xl:h-[4.5rem] xl:w-[4.5rem] xl:text-sm ${chipColorClasses(value)}`}>{chipLabel(value)}</button>)}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-center">
                  <GhostButton className="px-2 text-sm" disabled={dealing || !chipHistory.length} onClick={undoChip}>Undo</GhostButton>
                  <GhostButton className="px-2 text-sm" disabled={dealing} onClick={() => { setWagers(Array(5).fill(0)); setChipHistory([]); }}>Clear</GhostButton>
                  <GhostButton className="px-2 text-sm" disabled={dealing || !lastWagers.some(Boolean) || lastWagers.reduce((sum, bet) => sum + bet, 0) > bankroll} onClick={repeatLastBet}>Repeat</GhostButton>
                  <GhostButton className="px-2 text-sm" disabled={dealing || expectedWager * Math.max(1, occupiedSpots) > bankroll} onClick={() => {
                    clearPreviousHandForBet();
                    setWagers((currentWagers) => {
                      const anyBet = currentWagers.some(Boolean);
                      return currentWagers.map((bet, spot) => (anyBet ? (bet > 0 ? expectedWager : 0) : spot === selectedSpot ? expectedWager : 0));
                    });
                    setChipHistory([]);
                  }}>Ramp ${money(expectedWager)}</GhostButton>
                  <Button className="hidden lg:inline-flex" disabled={dealing || !totalWager || totalWager > bankroll} onClick={beginRound}>Deal {occupiedSpots} spot{occupiedSpots === 1 ? "" : "s"}</Button>
                </div>
              </div>}
              {phase === "insurance" && <div className="hidden text-center lg:block">
                <p className="mb-3 text-sm text-amber-200">Dealer shows an ace. Insurance costs half the base bet on every spot and pays 2 to 1.</p>
                <div className="flex flex-wrap justify-center gap-3">
                  <GhostButton disabled={dealing} onClick={() => chooseInsurance(false)}>Decline insurance</GhostButton>
                  <Button disabled={dealing || available < insuranceTotal} onClick={() => chooseInsurance(true)}>Insure all spots for ${money(insuranceTotal)}</Button>
                </div>
              </div>}
              {phase === "play" && current?.status === "playing" && <>
                <div className="hidden lg:flex lg:flex-wrap lg:justify-center lg:gap-2">
                  {playButtons}
                  <GhostButton disabled={dealing || evLoading} className="w-full sm:w-auto" onClick={() => requestEv(current)}>{evLoading ? "Solving…" : "Calculate exact EV"}</GhostButton>
                </div>
                {hint && <p className="mt-3 text-center text-xs text-amber-200">Coach hint: {ACTION_NAMES[hint.action]}{hint.deviation ? ` · departure at TC ${signed(hint.deviation.threshold)}` : " · chart play"}</p>}
                {(evLoading || evEntries) && <EvMetrics
                  evs={evEntries}
                  loading={evLoading}
                  note={evResult ? `Removal-exact enumeration over the ${evResult.unseenCards} unseen cards, conditioned on the dealer already peeking${evResult.dealerBlackjackProbability > 0 ? ` (${(evResult.dealerBlackjackProbability * 100).toFixed(2)}% blackjack risk was priced out)` : ""}. Best action: ${ACTION_NAMES[evResult.action]}. Solved in ${Math.round(evDuration)} ms.` : undefined}
                />}
                {evError && <p className="mt-3 text-center text-xs text-red-300">{evError}</p>}
              </>}
              {(phase === "dealing" || phase === "dealer") && <div className="hidden min-h-12 items-center justify-center gap-3 text-sm font-medium text-emerald-100/70 lg:flex"><i className="fa-solid fa-circle-notch animate-spin" aria-hidden="true" />{phase === "dealer" ? "Dealer playing" : "Cards in motion"}</div>}
              {phase === "shoe-end" && <div className="hidden text-center lg:block">
                <p className="mb-4 text-2xl font-semibold">Session result: {bankroll >= startingBankroll ? "+" : "−"}${Math.abs(bankroll - startingBankroll).toFixed(2)}</p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Button disabled={bankroll <= 0} onClick={() => startShoe(true)}>Shuffle · keep ${money(Number(bankroll.toFixed(2)))}</Button>
                  <GhostButton onClick={() => startShoe()}>Fresh buy-in</GhostButton>
                </div>
              </div>}
            </div>
          </Panel>
        </div>

        <div className="grid gap-5 md:grid-cols-2 2xl:block 2xl:space-y-5">
          <Panel>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Discard tray</p>
                <div className="mt-1 flex items-center gap-2 text-sm text-zinc-300">
                  <span className={!visibleIntel.discard ? "select-none tracking-[.16em] text-zinc-600" : ""}>{visibleIntel.discard ? `${(discarded / 52).toFixed(2)} decks seen` : "•••"}</span>
                  <button type="button" aria-label={`${visibleIntel.discard ? "Hide" : "Reveal"} exact discard amount`} aria-pressed={Boolean(visibleIntel.discard)} onClick={() => setVisibleIntel((shown) => ({ ...shown, discard: !shown.discard }))} className="pressable grid h-7 w-7 place-items-center rounded-full text-xs text-zinc-500 hover:bg-white/10 hover:text-emerald-300"><i aria-hidden="true" className={`fas ${visibleIntel.discard ? "fa-eye-slash" : "fa-eye"}`} /></button>
                </div>
              </div>
              <span className="text-xs text-zinc-500">Cut at {Math.round(penetration * 100)}%</span>
            </div>
            <div className="mt-4 flex h-32 items-end rounded-b-2xl border-x-4 border-b-4 border-zinc-500/60 bg-black/25 p-2 sm:h-48">
              <div className="w-full rounded-sm bg-[repeating-linear-gradient(0deg,#f4f1e8,#f4f1e8_2px,#aaa_3px)] shadow-[0_0_25px_#0008] transition-[height] duration-500" style={{ height: `${Math.max(2, Math.min(100, (discarded / Math.max(1, cutCard)) * 100))}%` }} />
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full bg-emerald-400 transition-[width]" style={{ width: `${Math.min(100, (discarded / Math.max(1, cutCard)) * 100)}%` }} /></div>
          </Panel>
          <CoachPanel
            note={note}
            accuracyLabel={gradedTotal ? `${accuracy}% · ${gradedCorrect}/${gradedTotal}` : undefined}
            emptyHint="The coach grades the pre-deal spread, insurance at +4, the one-card and continued-play charts, and all 18 selected departures."
          >
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              {(Object.entries(stats) as Array<[CoachCategory, { correct: number; total: number }]>).map(([category, value]) => <div key={category} className="rounded-lg bg-black/20 p-2"><span className="capitalize text-zinc-500">{category}</span><b className="float-right">{value.correct}/{value.total}</b></div>)}
            </div>
          </CoachPanel>
          <Panel className="md:col-span-2 2xl:col-span-1">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Session</h3>
              <span className={bankroll >= startingBankroll ? "text-emerald-300" : "text-red-300"}>{bankroll >= startingBankroll ? "+" : "−"}${Math.abs(bankroll - startingBankroll).toFixed(2)}</span>
            </div>
            <p className="mt-2 text-xs text-zinc-500">{history.length} round{history.length === 1 ? "" : "s"} · {history.filter((row) => row.net > 0).length} profitable</p>
            <div className="mt-4"><GameHistory rows={history} /></div>
          </Panel>
        </div>
      </div>

      {phase === "bet" && <MobileActionDock label="Betting actions">
        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
          <div className="min-w-0 px-2">
            <p className="text-[.65rem] uppercase tracking-wider text-zinc-500">Spot {selectedSpot + 1} · {occupiedSpots} active</p>
            <p className="truncate text-sm font-semibold">${money(wagers[selectedSpot])} selected · ${money(totalWager)} total</p>
          </div>
          <Button disabled={dealing || !totalWager || totalWager > bankroll} onClick={beginRound}>Deal</Button>
        </div>
      </MobileActionDock>}
      {phase === "insurance" && <MobileActionDock label="Insurance decision">
        <p className="mb-2 px-1 text-xs text-zinc-400">Dealer shows an ace. Choose before the peek.</p>
        <div className="grid grid-cols-2 gap-2">
          <GhostButton disabled={dealing} onClick={() => chooseInsurance(false)}>No insurance</GhostButton>
          <Button disabled={dealing || available < insuranceTotal} onClick={() => chooseInsurance(true)}>Insure · ${money(insuranceTotal)}</Button>
        </div>
      </MobileActionDock>}
      {phase === "play" && current?.status === "playing" && <MobileActionDock label={`Actions for player ${current.player + 1}, spot ${current.spot + 1}`}>
        <div className="mb-2 flex items-center justify-between gap-2 px-1 text-xs">
          <span className="text-zinc-400">P{current.player + 1} · Spot {current.spot + 1}</span>
          <b>{handLabel(current.cards)} · ${money(current.bet)}</b>
        </div>
        <div className="grid grid-cols-2 gap-2">{playButtons}</div>
        {hint && <p className="mt-2 px-1 text-center text-[.7rem] text-amber-200">Hint: {ACTION_NAMES[hint.action]}{hint.deviation ? ` · TC ${signed(hint.deviation.threshold)} departure` : ""}</p>}
      </MobileActionDock>}
      {(phase === "dealing" || phase === "dealer") && <MobileActionDock label="Table status" className="text-center text-sm text-emerald-100/75"><i className="fa-solid fa-circle-notch mr-2 animate-spin" aria-hidden="true" />{phase === "dealer" ? "Dealer playing…" : "Cards in motion…"}</MobileActionDock>}
      {phase === "shoe-end" && <MobileActionDock label="Shoe complete">
        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
          <p className="px-2 text-sm font-semibold">Result {bankroll >= startingBankroll ? "+" : "−"}${Math.abs(bankroll - startingBankroll).toFixed(2)}</p>
          <Button disabled={bankroll <= 0} onClick={() => startShoe(true)}>Shuffle</Button>
        </div>
      </MobileActionDock>}
    </div>
  );
}
