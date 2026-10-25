import { unitsAt, RAMPS } from "./advantage";
import { CORE_INDEX_COUNT, decideHand, DEFAULT_TABLE_RULES, explainDecision, fromBlackjackRules, indexList, takeInsurance } from "@/lib/strategy";
import { calculateHandValue, isSoft } from "./hand";
import { hiLoValue, runningCount, trueCount, TrueCountRounding } from "./hiLo";
import { BlackjackShoe } from "./shoe";
import { Action, BlackjackRules, Card } from "./types";
import { parseAnswer } from "./numericAnswer";
import type { CountingErrorCategory, Mistake, Session } from "../statistics/storage";

export type DeckResolution = 1 | 0.5 | 0.25;
export type CountBias = "none" | "positive" | "negative";
export type CountingPreset = "one-deck-speed" | "two-card-cancellation" | "six-deck-casino" | "recovery";

export const COUNTING_PRESETS: Record<CountingPreset, {
  label: string; decks: number; cards: number; group: "1" | "2" | "random"; speed: number;
  checkpoint: "final" | "5" | "10" | "random" | "sign"; interruption: boolean;
}> = {
  "one-deck-speed": { label: "One-deck speed", decks: 1, cards: 52, group: "1", speed: 500, checkpoint: "final", interruption: false },
  "two-card-cancellation": { label: "Two-card cancellation", decks: 2, cards: 104, group: "2", speed: 650, checkpoint: "10", interruption: false },
  "six-deck-casino": { label: "Six-deck casino", decks: 6, cards: 234, group: "random", speed: 750, checkpoint: "random", interruption: false },
  recovery: { label: "Interruption recovery", decks: 6, cards: 156, group: "random", speed: 850, checkpoint: "sign", interruption: true },
};

let coreCounts: number[] | undefined;
/** The counts of the Illustrious 18 and Fab 4 cells, in Wong's numbers: what the "index" focus practises near. */
const coreIndexCounts = () => (coreCounts ??= indexList(DEFAULT_TABLE_RULES).slice(0, CORE_INDEX_COUNT).map((entry) => entry.at));

export function makeCountSequence(decks: number, amount: number, bias: CountBias = "none", rng: () => number = Math.random) {
  const shoe = new BlackjackShoe(decks, rng);
  shoe.deal(); // burn one random card so a full-deck session doesn't always resolve to a running count of 0
  const cards: Card[] = [];
  while (cards.length < Math.min(amount, decks * 52 - 1)) {
    const card = shoe.deal();
    if (card) cards.push(card);
  }
  if (bias !== "none") {
    cards.sort((a, b) => {
      const direction = bias === "positive" ? -1 : 1;
      return direction * (hiLoValue(a) - hiLoValue(b)) + (rng() - 0.5) * 0.2;
    });
  }
  return cards;
}

export const roundDeckEstimate = (decks: number, resolution: DeckResolution) =>
  Math.max(resolution, Math.round(decks / resolution) * resolution);

const STEP_WORDS: Record<DeckResolution, string> = { 1: "a deck", 0.5: "half a deck", 0.25: "a quarter deck" };
/** Why an estimate under one step is graded as one step, or "" when plain rounding explains the answer. */
export const minimumStepNote = (decks: number, resolution: DeckResolution) =>
  Math.round(decks / resolution) * resolution < resolution
    ? `Under ${STEP_WORDS[resolution]} counts as ${resolution}: an estimate never goes below one step, so a true count never divides by less.`
    : "";

export interface TrueCountScenario {
  runningCount: number;
  exactDecksRemaining: number;
  estimatedDecksRemaining: number;
  cardsDealt: number;
  totalDecks: number;
  answer: number;
}

export function makeTrueCountScenario({
  decks,
  resolution,
  rounding,
  focus = "all",
  discarded,
  rng = Math.random,
}: {
  decks: number;
  resolution: DeckResolution;
  rounding: TrueCountRounding;
  focus?: "all" | "positive" | "negative" | "zero" | "index" | "last-deck";
  /**
   * Decks already in the discard tray, when the question shows a tray photo:
   * that many cards are dealt, so the running count is one a shoe this deep
   * could really have, and the decks left are the photo's.
   */
  discarded?: number;
  rng?: () => number;
}): TrueCountScenario {
  let fallback: TrueCountScenario | undefined;
  const fromPhoto = discarded !== undefined && Number.isFinite(discarded);
  for (let attempt = 0; attempt < 80; attempt++) {
    const shoe = new BlackjackShoe(decks, rng);
    const maxDealt = Math.max(1, Math.floor(decks * 52 * 0.8));
    const minDealt = focus === "last-deck" ? Math.max(1, (decks - 1) * 52) : 1;
    const count = fromPhoto
      ? Math.min(decks * 52 - 1, Math.max(1, Math.round((discarded as number) * 52)))
      : minDealt + Math.floor(rng() * Math.max(1, maxDealt - minDealt));
    for (let i = 0; i < count; i++) shoe.deal();
    const rc = shoe.runningCount();
    const exact = fromPhoto ? Math.max(0.01, Number((decks - (discarded as number)).toFixed(2))) : shoe.decksRemaining();
    const estimated = roundDeckEstimate(exact, resolution);
    const scenario = {
      runningCount: rc,
      exactDecksRemaining: exact,
      estimatedDecksRemaining: estimated,
      cardsDealt: count,
      totalDecks: decks,
      answer: trueCount(rc, estimated, rounding),
    };
    fallback = scenario;
    const match = focus === "all"
      || (focus === "positive" && rc > 0)
      || (focus === "negative" && rc < 0)
      || (focus === "zero" && rc === 0)
      || (focus === "last-deck" && (fromPhoto || exact <= 1))
      || (focus === "index" && coreIndexCounts().some((at) => Math.abs(scenario.answer - at) <= 1));
    if (match) return scenario;
  }
  return fallback!;
}

/**
 * The likeliest cause of a wrong running count, most specific first:
 * `previous` is the count before the last group of `cards`. Off by one or two
 * is a dropped or doubled card; three or more with no other sign is a lost count.
 */
export function classifyCountError({ expected, actual, previous = 0, cards = [], interrupted = false }: {
  expected: number; actual: number; previous?: number; cards?: Card[]; interrupted?: boolean;
}): CountingErrorCategory {
  const off = Math.abs(actual - expected);
  if (interrupted) return "interruption recovery";
  if (expected !== 0 && actual === -expected) return "sign flip";
  if ((previous < 0 && expected >= 0) || (previous > 0 && expected <= 0)) return "zero crossing";
  if (cards.length > 1 && runningCount(cards) === 0) return "missed cancellation";
  if (off === 1) return "off by one";
  if (off === 2) return "off by two";
  if (expected < 0 || actual < 0) return "negative arithmetic";
  return "lost the count";
}

/** One line on a missed running count for the review list: what went wrong, then the habit that fixes it. */
export function countMissExplanation({ expected, actual, category }: { expected: number; actual: number | null; category: CountingErrorCategory }) {
  const signed = (value: number) => (value > 0 ? `+${value}` : String(value));
  const off = actual === null ? 0 : actual - expected;
  const what = actual === null ? "You lost the count here."
    : category === "sign flip" ? `Right size, wrong sign: ${signed(actual)} instead of ${signed(expected)}.`
    : category === "off by one" ? `One too ${off > 0 ? "high" : "low"}: a card was ${off > 0 ? "counted twice or given the wrong sign" : "missed"}.`
    : category === "off by two" ? `Two too ${off > 0 ? "high" : "low"}: likely one card counted the wrong way, or two missed.`
    : `${Math.abs(off)} too ${off > 0 ? "high" : "low"}.`;
  const tip = ERROR_CATEGORY_TIP[actual === null ? "lost the count" : category];
  return tip ? `${what} ${tip}` : what;
}

export function classifyTrueCountError(rc: number, decks: number, expected: number, actual: number) {
  const raw = rc / decks;
  return Math.abs(actual - raw) < Math.abs(expected - raw) ? "true-count rounding" as const : "true-count division" as const;
}

export interface SimulatedRound {
  playerHands: Card[][];
  /** The same hands by spot: `seats[spot]` is one hand, or several after a split. */
  seats: Card[][][];
  dealerHand: Card[];
  heroInitial: Card[];
  dealerUpcard: Card;
  exposedCards: Card[];
  /** The hero's first decision at the round's true count, from lib/strategy. */
  correctPlay: Action;
  insurancePlay?: "I" | "N";
  basicPlay: Action;
  explanation: string;
}

/** Plays a box out by basic strategy so the round deals the cards a real table would. */
function playHand(hand: Card[], dealer: Card, shoe: BlackjackShoe, rules: BlackjackRules, fromSplit = false): Card[][] {
  const table = fromBlackjackRules(rules);
  const first = decideHand({ cards: hand, upcard: dealer, rules: table, canSplit: !fromSplit, canSurrender: !fromSplit }).action;
  if (first === "P") {
    const left = [hand[0], shoe.deal()].filter(Boolean) as Card[];
    const right = [hand[1], shoe.deal()].filter(Boolean) as Card[];
    return [left, right].flatMap((split) => playHand(split, dealer, shoe, rules, true));
  }
  if (first === "R" || first === "S") return [hand];
  if (first === "D") {
    const card = shoe.deal();
    return [card ? [...hand, card] : hand];
  }
  const result = [...hand];
  while (calculateHandValue(result) < 21 && decideHand({ cards: result, upcard: dealer, rules: table, canSplit: false, canSurrender: false }).action === "H") {
    const card = shoe.deal();
    if (!card) break;
    result.push(card);
  }
  return [result];
}

export function simulateRound(shoe: BlackjackShoe, spots: number, rules: BlackjackRules, currentTrueCount: number): SimulatedRound {
  const before = shoe.dealtCards().length;
  const initial: Card[][] = Array.from({ length: spots }, () => []);
  const dealer: Card[] = [];
  for (let pass = 0; pass < 2; pass++) {
    for (const hand of initial) {
      const card = shoe.deal();
      if (card) hand.push(card);
    }
    const card = shoe.deal();
    if (card) dealer.push(card);
  }
  const heroInitial = [...initial[0]];
  const dealerUpcard = dealer[0];
  const table = fromBlackjackRules(rules);
  const basic = decideHand({ cards: heroInitial, upcard: dealerUpcard, rules: table });
  const counted = decideHand({ cards: heroInitial, upcard: dealerUpcard, rules: table, tc: currentTrueCount });
  const seats = initial.map((hand) => playHand(hand, dealerUpcard, shoe, rules));
  const playerHands = seats.flat();
  while (calculateHandValue(dealer) < 17 || (calculateHandValue(dealer) === 17 && isSoft(dealer) && rules.dealerHitsSoft17)) {
    const card = shoe.deal();
    if (!card) break;
    dealer.push(card);
  }
  return {
    playerHands,
    seats,
    dealerHand: dealer,
    heroInitial,
    dealerUpcard,
    exposedCards: shoe.dealtCards().slice(before),
    correctPlay: counted.action,
    insurancePlay: dealerUpcard.rank === "A" ? (takeInsurance(table, currentTrueCount) ? "I" : "N") : undefined,
    basicPlay: basic.action,
    explanation: counted.cell ? explainDecision(counted.cell, counted, currentTrueCount) : `${calculateHandValue(heroInitial)} is played the same at every count.`,
  };
}

/** A card on the table in a Running Count table round. */
export interface TableCard {
  card: Card;
  /** Its place in the round's reveal order: face up once more than `at` cards of the round are showing. */
  at: number;
  /** The dealer's hole card: on the table face down once `downFrom` cards are showing, turned over at `at`. */
  downFrom?: number;
}
/** One round as the table shows it: the dealer's cards and each spot's hands. */
export interface TableRound {
  dealer: TableCard[];
  seats: TableCard[][][];
  /** Cards the round reveals; the hole card counts once, when it is turned over. */
  size: number;
}

/**
 * The order a played round's cards appear in: one card to each spot and the
 * dealer, a second to each spot with the hole card face down, then each spot's
 * draws in turn, the hole card turned over, and the dealer's draws.
 *
 * A split pair shows as two hands from the second pass on (its second card
 * lands on the second hand), which is the only liberty taken with real dealing
 * and changes nothing about the count.
 */
export function tableRoundLayout(round: Pick<SimulatedRound, "seats" | "dealerHand">): TableRound {
  let next = 0;
  const seats: TableCard[][][] = round.seats.map((hands) => hands.map(() => []));
  const placed = round.seats.map((hands) => hands.map(() => 0));
  const place = (spot: number, hand: number) => {
    const card = round.seats[spot]?.[hand]?.[placed[spot][hand]];
    if (!card) return;
    seats[spot][hand].push({ card, at: next++ });
    placed[spot][hand] += 1;
  };
  const dealer: TableCard[] = [];
  const [up, hole, ...draws] = round.dealerHand;
  round.seats.forEach((_, spot) => place(spot, 0));
  if (up) dealer.push({ card: up, at: next++ });
  round.seats.forEach((hands, spot) => place(spot, hands.length > 1 ? 1 : 0));
  const holeShows = next;
  round.seats.forEach((hands, spot) => hands.forEach((cards, hand) => { while (placed[spot][hand] < cards.length) place(spot, hand); }));
  if (hole) dealer.push({ card: hole, at: next++, downFrom: holeShows });
  for (const card of draws) dealer.push({ card, at: next++ });
  return { dealer, seats, size: next };
}

/** Every card of a laid-out round in reveal order. */
export const tableRoundCards = (round: TableRound): Card[] =>
  [...round.dealer, ...round.seats.flat(2)].sort((a, b) => a.at - b.at).map((entry) => entry.card);

/**
 * A Running Count session dealt as full table rounds: `spots` players and the
 * dealer, every hand played out by basic strategy for `rules`, until about
 * `amount` cards have been shown or the shoe runs low. `cards` is every card
 * in reveal order, so a running count at any point is the sum of a prefix.
 */
export function makeTableRounds({ decks, amount, spots, rules, rng = Math.random }: { decks: number; amount: number; spots: number; rules: BlackjackRules; rng?: () => number }) {
  const shoe = new BlackjackShoe(decks, rng);
  shoe.deal(); // burned, as in makeCountSequence
  const rounds: TableRound[] = [];
  const cards: Card[] = [];
  // Room for a long round (splits, several hits) so the shoe never runs out mid-round.
  const reserve = spots * 6 + 8;
  while (cards.length < amount && shoe.cardsRemaining() >= reserve) {
    const tc = trueCount(shoe.runningCount(), Math.max(0.25, shoe.decksRemaining()));
    const layout = tableRoundLayout(simulateRound(shoe, spots, { ...rules, decks }, tc));
    rounds.push(layout);
    cards.push(...tableRoundCards(layout));
  }
  return { rounds, cards };
}

/** Where each round starts in the session's card list. */
export const roundStarts = (rounds: readonly Pick<TableRound, "size">[]) => {
  const starts: number[] = [];
  let total = 0;
  for (const round of rounds) { starts.push(total); total += round.size; }
  return starts;
};

export function expectedBet(trueCountValue: number, baseBet: number, spread: keyof typeof RAMPS, wongOutNegative: boolean) {
  if (wongOutNegative && trueCountValue < 0) return 0;
  return unitsAt(trueCountValue, RAMPS[spread]) * baseBet;
}

/**
 * A full deck was counted with every check right. A one-deck shoe deals 51
 * cards after the burn card, so 51 is a full deck.
 */
export function isPerfectDeck({ cardsLength, seen, correct, checks }: { cardsLength: number; seen: number; correct: number; checks: number }) {
  return cardsLength >= 51 && seen === cardsLength && checks > 0 && correct === checks;
}

/** Deck Estimation accuracy on trays with a deck or less left, from the session's category tallies. */
export function lastDeckAccuracyFromCategories(categories: Record<string, { correct: number; total: number }> = {}) {
  const lastDeck = Object.entries(categories).filter(([key]) => key.endsWith(", last deck")).map(([, value]) => value);
  const total = lastDeck.reduce((sum, value) => sum + value.total, 0);
  return total ? Math.round(lastDeck.reduce((sum, value) => sum + value.correct, 0) / total * 100) : 0;
}

/** Plain-language names for the stored error categories. */
export const ERROR_CATEGORY_LABEL: Record<CountingErrorCategory, string> = {
  "missed cancellation": "Missed a cancellation",
  "negative arithmetic": "Adding negatives",
  "sign flip": "Flipped the sign",
  "off by one": "Off by one card",
  "off by two": "Off by two",
  "lost the count": "Lost the count",
  "zero crossing": "Crossing zero",
  "interruption recovery": "Lost the count after the interruption",
  "true-count rounding": "Rounding",
  "true-count division": "Division",
  "deck estimate": "Deck estimate",
  "hole-card reveal": "Hole-card reveal",
  "bet sizing": "Bet sizing",
  "playing decision": "Playing decision",
};

/**
 * The cause worth naming after a missed running count, or undefined when the
 * evidence is weak. The stored category is a best guess from the last group
 * only; this keeps the confident ones (an interruption, a zero crossing, a
 * group that cancels, a negative count).
 */
export function runningCountCause(category: CountingErrorCategory | undefined, expected: number) {
  if (!category) return undefined;
  if (category === "negative arithmetic" && expected >= 0) return undefined;
  return ERROR_CATEGORY_LABEL[category];
}

const GROUP_LABEL: Record<string, string> = { "1": "One at a time", "2": "Pairs", "3": "Three at a time", "4": "Four at a time", random: "Random groups" };
const SIGN_LABEL: Record<string, string> = { negative: "negative counts", positive: "positive counts", zero: "zero counts" };
const RESOLUTION_PRECISION: Record<string, string> = { "1": "Full-deck", "0.5": "Half-deck", "0.25": "Quarter-deck" };
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * A readable name for a counting drill's category tally key. Keys from other
 * drills (e.g. "Hard totals") come back unchanged.
 */
export function countingCategoryLabel(key: string) {
  const running = /^(1|2|3|4|random)-card groups, (negative|positive|zero)$/.exec(key);
  if (running) return `${GROUP_LABEL[running[1]]} · ${SIGN_LABEL[running[2]]}`;
  const table = /^table rounds, (negative|positive|zero)$/.exec(key);
  if (table) return `Table rounds · ${SIGN_LABEL[table[1]]}`;
  const conversion = /^(negative|positive|zero), (1|0\.5|0\.25)-deck divisor$/.exec(key);
  if (conversion) return `${capitalise(SIGN_LABEL[conversion[1]])} · ${RESOLUTION_PRECISION[conversion[2]].toLowerCase()} divisor`;
  const estimate = /^(1|0\.5|0\.25)-deck(, last deck)?$/.exec(key);
  if (estimate) return `${RESOLUTION_PRECISION[estimate[1]]} precision${estimate[2] ? " · last deck" : ""}`;
  if (SIGN_LABEL[key]) return capitalise(SIGN_LABEL[key]);
  return key;
}

/** Sessions shorter than this do not count toward the True Count and Deck Estimation targets. */
export const BENCHMARK_MIN_QUESTIONS = 10;

const metric = (session: Session | undefined, key: string) => {
  const value = session?.metrics?.[key];
  return typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
};
/** A Running Count session that dealt a whole deck (51 or 52 cards). */
const isFullDeckRun = (session: Session) => {
  const seen = metric(session, "cardsSeen");
  return Number.isFinite(seen) ? seen >= 51 && seen <= 52 : Boolean(session.metrics?.perfectDeck);
};
/** Perfect by the stored flag, or by its definition for runs saved before 51-card decks counted. */
const wasPerfectDeck = (session: Session) => Boolean(session.metrics?.perfectDeck) || (isFullDeckRun(session) && session.questions > 0 && session.correct === session.questions);

type BenchmarkDrill = "Running Count" | "True Count" | "Deck Estimation" | "Full Shoe";
const qualifies: Record<BenchmarkDrill, (session: Session) => boolean> = {
  "Running Count": isFullDeckRun,
  "True Count": (session) => session.questions >= BENCHMARK_MIN_QUESTIONS,
  "Deck Estimation": (session) => session.questions >= BENCHMARK_MIN_QUESTIONS,
  "Full Shoe": () => true,
};
/** The newest session of a drill that is a fair test of its target, so a warm-up never removes "met". */
const latestQualifying = (sessions: Session[], drill: BenchmarkDrill) => sessions.find((session) => session.drill === drill && qualifies[drill](session));

/**
 * The four table-ready targets. Each is judged on the latest qualifying
 * session of its drill: a full-deck Running Count run (its time includes
 * answering the final check), and True Count or Deck Estimation sessions of
 * at least 10 questions.
 */
export function countingMastery(sessions: Session[]) {
  const running = latestQualifying(sessions, "Running Count");
  const tc = latestQualifying(sessions, "True Count");
  const deck = latestQualifying(sessions, "Deck Estimation");
  const shoe = latestQualifying(sessions, "Full Shoe");
  const mae = metric(deck, "meanAbsoluteDeckError");
  const checks = [
    { label: "Count a deck perfectly in 30 seconds", met: Boolean(running && wasPerfectDeck(running)) && metric(running, "elapsedSeconds") <= 30, href: "/train/running-count" },
    { label: "Reach 95% true-count accuracy", met: (tc?.accuracy ?? 0) >= 95, href: "/train/true-count" },
    { label: "Estimate within 0.25 decks on average", met: (Number.isFinite(mae) ? mae : Infinity) <= 0.25, href: "/train/deck-estimation" },
    { label: "Reach 95% across a casino shoe", met: (shoe?.accuracy ?? 0) >= 95, href: "/train/full-shoe" },
  ];
  return { score: Math.round(checks.filter((x) => x.met).length / checks.length * 100), checks, next: checks.find((x) => !x.met) ?? checks[0] };
}

export type BenchmarkDetail = {
  label: string;
  met: boolean;
  href: string;
  drill: BenchmarkDrill;
  /** The reader's latest qualifying number against the target, in words. */
  latest: string;
  /** Why a newer session did not count, when one did not. */
  note?: string;
  /** 0..1 toward the target, for targets measured on a scale. */
  progress?: number;
  /** Opens the drill already set up for this target. */
  practiceHref: string;
};

const seconds = (value: number) => `${value.toFixed(1)} s`;

function runningLatest(session: Session | undefined) {
  if (!session) return "No full-deck run yet";
  const elapsed = metric(session, "elapsedSeconds");
  const missed = session.questions - session.correct;
  const answering = metric(session, "averageAnswerLatency") * session.questions / 1000;
  const split = Number.isFinite(answering) && answering > 0 && answering < elapsed ? ` (${seconds(elapsed - answering)} dealing + ${seconds(answering)} answering)` : "";
  const time = Number.isFinite(elapsed) ? `${seconds(elapsed)}${split}` : "Time not recorded";
  return wasPerfectDeck(session) ? `${time} · perfect` : `${time} · ${missed} missed ${missed === 1 ? "check" : "checks"}`;
}

/**
 * Each target with the reader's latest number, how close it is, and where to
 * practise it. Judged exactly as `countingMastery`.
 */
export function countingBenchmarkDetails(sessions: Session[]): BenchmarkDetail[] {
  const { checks } = countingMastery(sessions);
  /** Only when a counted session exists and a newer one was left out. */
  const noteFor = (drill: BenchmarkDrill, counted: Session | undefined, why: string) => {
    const newest = sessions.find((session) => session.drill === drill);
    return counted && newest && newest !== counted ? why : undefined;
  };
  const running = latestQualifying(sessions, "Running Count");
  const tc = latestQualifying(sessions, "True Count");
  const deck = latestQualifying(sessions, "Deck Estimation");
  const shoe = latestQualifying(sessions, "Full Shoe");
  const mae = metric(deck, "meanAbsoluteDeckError");
  return [
    {
      ...checks[0], drill: "Running Count",
      latest: runningLatest(running),
      note: noteFor("Running Count", running, "Only full-deck runs count, and your latest run was shorter."),
      practiceHref: "/train/running-count?focus=one-deck-speed",
    },
    {
      ...checks[1], drill: "True Count",
      latest: tc ? `${tc.accuracy}% (target 95%)` : `No ${BENCHMARK_MIN_QUESTIONS}-question session yet`,
      note: noteFor("True Count", tc, `Sessions under ${BENCHMARK_MIN_QUESTIONS} questions do not count.`),
      progress: tc ? Math.min(1, tc.accuracy / 95) : undefined,
      practiceHref: "/train/true-count",
    },
    {
      ...checks[2], drill: "Deck Estimation",
      latest: deck && Number.isFinite(mae) ? `${mae.toFixed(2)} decks off on average (target 0.25 or less)` : `No ${BENCHMARK_MIN_QUESTIONS}-photo session yet`,
      note: noteFor("Deck Estimation", deck, `Sessions under ${BENCHMARK_MIN_QUESTIONS} photos do not count.`),
      progress: deck && Number.isFinite(mae) ? (mae <= 0 ? 1 : Math.min(1, 0.25 / mae)) : undefined,
      practiceHref: "/train/deck-estimation?focus=0.25-deck",
    },
    {
      ...checks[3], drill: "Full Shoe",
      latest: shoe ? `${shoe.accuracy}% (target 95%)` : "Not tried yet",
      progress: shoe ? Math.min(1, shoe.accuracy / 95) : undefined,
      practiceHref: "/train/full-shoe",
    },
  ];
}

/**
 * Whether a wrong true count was nonetheless the right division of the
 * reader's own (wrong) deck estimate, so the feedback can say which skill
 * slipped: the tray reading, not the division.
 */
export function rightForOwnEstimate({ runningCount: rc, decksAnswer, trueCountAnswer, rounding }: { runningCount: number; decksAnswer: number; trueCountAnswer: number; rounding: TrueCountRounding }) {
  return Number.isFinite(decksAnswer) && decksAnswer > 0 && Number.isFinite(trueCountAnswer) && trueCount(rc, decksAnswer, rounding) === trueCountAnswer;
}

/**
 * A True Count answer, graded from the typed text so a resumed feedback
 * screen shows the same verdict. "combined" also grades the decks-left
 * estimate, which must match the estimate at the session's resolution.
 *
 * `ownEstimate` is true when the decks estimate was wrong but the true count
 * is exactly right for it: the division was sound and the tray reading slipped.
 */
export function gradeTrueCount({ question, mode, tcText, deckText, rounding }: {
  question: Pick<TrueCountScenario, "runningCount" | "estimatedDecksRemaining" | "answer">;
  mode: "division" | "combined";
  tcText: string;
  deckText: string;
  rounding: TrueCountRounding;
}) {
  const tc = parseAnswer(tcText, "signed-int");
  const deck = parseAnswer(deckText, "decimal");
  const tcValue = tc.ok ? tc.value : null;
  const deckValue = deck.ok && deck.value > 0 ? deck.value : null;
  const tcOk = tcValue !== null && tcValue === question.answer;
  const deckOk = mode === "division" || (deckValue !== null && Math.abs(deckValue - question.estimatedDecksRemaining) < 0.001);
  const ok = tcOk && deckOk;
  const ownEstimate = mode === "combined" && !deckOk && deckValue !== null && tcValue !== null
    && rightForOwnEstimate({ runningCount: question.runningCount, decksAnswer: deckValue, trueCountAnswer: tcValue, rounding });
  const category: CountingErrorCategory | undefined = ok
    ? undefined
    : !deckOk ? "deck estimate" : classifyTrueCountError(question.runningCount, question.estimatedDecksRemaining, question.answer, tcValue ?? 0);
  return { ok, tcOk, deckOk, tc: tcValue, deck: deckValue, ownEstimate, category };
}

/** The division written out: "+7 ÷ 2.5 = 2.80". */
export const divisionText = (rc: number, decks: number) => {
  const sign = (value: number) => (value < 0 ? `−${Math.abs(value)}` : value > 0 ? `+${value}` : "0");
  const raw = decks > 0 ? rc / decks : rc;
  return `${sign(rc)} ÷ ${decks} = ${raw.toFixed(2).replace("-", "−")}`;
};

/**
 * One Deck Estimation answer. `remaining` is the tray's exact decks left and
 * the answer must match it rounded to the session's resolution. A blank
 * answer counts as missing by the whole shoe, as it always has.
 */
export function gradeDeckEstimate({ remaining, resolution, value, decks }: { remaining: number; resolution: DeckResolution; value: number | null; decks: number }) {
  const expected = roundDeckEstimate(remaining, resolution);
  const ok = value !== null && Math.abs(value - expected) < 0.001;
  const signedError = value === null ? null : Number((value - remaining).toFixed(2));
  const error = value === null ? decks : Number(Math.abs(value - remaining).toFixed(2));
  return { expected, ok, error, signedError };
}

/**
 * Which way a reader's deck estimates lean: "over" means they see more decks
 * left than there are (the tray looks emptier to them than it is). Under a
 * tenth of a deck either way is no lean at all.
 */
export function estimateBias(signedErrors: readonly number[]) {
  const values = signedErrors.filter(Number.isFinite);
  if (!values.length) return { mean: 0, direction: "even" as const };
  const mean = Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
  return { mean, direction: mean >= 0.1 ? "over" as const : mean <= -0.1 ? "under" as const : "even" as const };
}

/** One habit that fixes each kind of slip, for the summary. */
export const ERROR_CATEGORY_TIP: Partial<Record<CountingErrorCategory, string>> = {
  "missed cancellation": "Pair each +1 with a −1 and drop both; carry only what is left over.",
  "negative arithmetic": "Below zero a low card moves you toward zero: −3 and then a 5 is −2.",
  "sign flip": "Hold the sign as part of the number: think “minus two”, never just “two”.",
  "off by one": "Keep your eyes on each card until it is added; a 7, 8 or 9 adds nothing.",
  "off by two": "Check the card values: 2–6 are +1, 7–9 are 0, tens and aces are −1.",
  "lost the count": "Slow the cards down a step until the count holds, then speed up again.",
  "zero crossing": "Say the sign to yourself whenever the count passes zero.",
  "interruption recovery": "Repeat the count to yourself the moment you look away.",
  "true-count rounding": "Round only after dividing, and the same way every time.",
  "true-count division": "Divide first, round last. When the decks end in .5, double both numbers: +7 ÷ 2.5 is +14 ÷ 5.",
  "deck estimate": "Read the tray first, then subtract it from the shoe size.",
};

/**
 * The slips behind a session's misses, most common first. Only causes worth
 * naming count: "Adding negatives" is the classifier's fallback, so it only
 * counts when the right answer really was negative.
 */
export function mistakeCauses(mistakes: readonly Mistake[]) {
  const tally = new Map<CountingErrorCategory, number>();
  for (const mistake of mistakes) {
    const category = mistake.category;
    if (!category) continue;
    if (category === "negative arithmetic" && !(Number(String(mistake.correctAnswer).replace("−", "-")) < 0)) continue;
    tally.set(category, (tally.get(category) ?? 0) + 1);
  }
  return [...tally]
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({ category, count, label: ERROR_CATEGORY_LABEL[category], tip: ERROR_CATEGORY_TIP[category] }));
}
