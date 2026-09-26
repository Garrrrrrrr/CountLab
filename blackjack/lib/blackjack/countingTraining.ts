import { unitsAt, RAMPS } from "./advantage";
import { getBasicStrategyDecision } from "./basicStrategy";
import { DEVIATIONS, deviationDecision, DeviationAction, getDeviationCatalog, resolveDeviation } from "./deviations";
import { calculateHandValue, isPair, isSoft } from "./hand";
import { hiLoValue, runningCount, trueCount, TrueCountRounding } from "./hiLo";
import { BlackjackShoe } from "./shoe";
import { Action, BlackjackRules, Card } from "./types";
import { CountingErrorCategory, Session } from "../statistics/storage";

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
  rng = Math.random,
}: {
  decks: number;
  resolution: DeckResolution;
  rounding: TrueCountRounding;
  focus?: "all" | "positive" | "negative" | "zero" | "index" | "last-deck";
  rng?: () => number;
}): TrueCountScenario {
  let fallback: TrueCountScenario | undefined;
  for (let attempt = 0; attempt < 80; attempt++) {
    const shoe = new BlackjackShoe(decks, rng);
    const maxDealt = Math.max(1, Math.floor(decks * 52 * 0.8));
    const minDealt = focus === "last-deck" ? Math.max(1, (decks - 1) * 52) : 1;
    const count = minDealt + Math.floor(rng() * Math.max(1, maxDealt - minDealt));
    for (let i = 0; i < count; i++) shoe.deal();
    const rc = shoe.runningCount();
    const estimated = roundDeckEstimate(shoe.decksRemaining(), resolution);
    const scenario = {
      runningCount: rc,
      exactDecksRemaining: shoe.decksRemaining(),
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
      || (focus === "last-deck" && shoe.decksRemaining() <= 1)
      || (focus === "index" && DEVIATIONS.some((d) => Math.abs(scenario.answer - d.index) <= 1));
    if (match) return scenario;
  }
  return fallback!;
}

export function classifyCountError({ expected, actual, previous = 0, cards = [], interrupted = false }: {
  expected: number; actual: number; previous?: number; cards?: Card[]; interrupted?: boolean;
}): CountingErrorCategory {
  if (interrupted) return "interruption recovery";
  if ((previous < 0 && expected >= 0) || (previous > 0 && expected <= 0)) return "zero crossing";
  if (expected < 0 || actual < 0) return "negative arithmetic";
  if (cards.length > 1 && runningCount(cards) === 0) return "missed cancellation";
  return "negative arithmetic";
}

export function classifyTrueCountError(rc: number, decks: number, expected: number, actual: number) {
  const raw = rc / decks;
  return Math.abs(actual - raw) < Math.abs(expected - raw) ? "true-count rounding" as const : "true-count division" as const;
}

export interface SimulatedRound {
  playerHands: Card[][];
  dealerHand: Card[];
  heroInitial: Card[];
  dealerUpcard: Card;
  exposedCards: Card[];
  correctPlay: DeviationAction;
  insurancePlay?: "I" | "N";
  basicPlay: Action;
  explanation: string;
}

function playHand(hand: Card[], dealer: Card, shoe: BlackjackShoe, rules: BlackjackRules, allowSplit = true): Card[][] {
  const first = getBasicStrategyDecision({ playerCards: hand, dealerUpcard: dealer, rules }).action;
  if (first === "P" && hand.length === 2 && allowSplit) {
    const left = [hand[0], shoe.deal()].filter(Boolean) as Card[];
    const right = [hand[1], shoe.deal()].filter(Boolean) as Card[];
    return [left, right].flatMap((split) => playHand(split, dealer, shoe, { ...rules, lateSurrender: false }, false));
  }
  if (first === "P") return [hand];
  if (first === "R" || first === "S") return [hand];
  if (first === "D") {
    const card = shoe.deal();
    return [card ? [...hand, card] : hand];
  }
  const result = [...hand];
  while (calculateHandValue(result) < 21 && getBasicStrategyDecision({ playerCards: result, dealerUpcard: dealer, rules }).action === "H") {
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
  const basic = getBasicStrategyDecision({ playerCards: heroInitial, dealerUpcard, rules });
  const total = calculateHandValue(heroInitial);
  const handLabel = isPair(heroInitial)
    ? `${heroInitial[0].rank === "J" || heroInitial[0].rank === "Q" || heroInitial[0].rank === "K" ? "10" : heroInitial[0].rank},${heroInitial[1].rank === "J" || heroInitial[1].rank === "Q" || heroInitial[1].rank === "K" ? "10" : heroInitial[1].rank}`
    : isSoft(heroInitial)
      ? `Soft ${total}`
      : String(total);
  const dealerLabel = dealerUpcard.rank === "J" || dealerUpcard.rank === "Q" || dealerUpcard.rank === "K" ? "10" : dealerUpcard.rank;
  const resolvedDeviation = resolveDeviation(basic.action, handLabel, dealerLabel, currentTrueCount, rules);
  const deviation = resolvedDeviation.deviation;
  const correctPlay = resolvedDeviation.action;
  const insurance = dealerUpcard.rank === "A" ? getDeviationCatalog(rules).find((d) => d.hand === "Insurance") : undefined;
  const playerHands = initial.flatMap((hand) => playHand(hand, dealerUpcard, shoe, rules));
  while (calculateHandValue(dealer) < 17 || (calculateHandValue(dealer) === 17 && isSoft(dealer) && rules.dealerHitsSoft17)) {
    const card = shoe.deal();
    if (!card) break;
    dealer.push(card);
  }
  return {
    playerHands,
    dealerHand: dealer,
    heroInitial,
    dealerUpcard,
    exposedCards: shoe.dealtCards().slice(before),
    correctPlay,
    insurancePlay: insurance ? deviationDecision(insurance, currentTrueCount) as "I" | "N" : undefined,
    basicPlay: basic.action,
    explanation: deviation
      ? `${deviation.hand} vs ${deviation.dealer} changes at ${deviation.index > 0 ? "+" : ""}${deviation.index}.`
      : basic.explanation,
  };
}

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
    { label: "Count a deck perfectly in 30 seconds", met: Boolean(running && wasPerfectDeck(running)) && metric(running, "elapsedSeconds") <= 30, href: "/training/running-count" },
    { label: "Reach 95% true-count accuracy", met: (tc?.accuracy ?? 0) >= 95, href: "/training/true-count" },
    { label: "Estimate within 0.25 decks on average", met: (Number.isFinite(mae) ? mae : Infinity) <= 0.25, href: "/training/deck-estimation" },
    { label: "Reach 95% across a casino shoe", met: (shoe?.accuracy ?? 0) >= 95, href: "/training/full-shoe" },
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
      practiceHref: "/training/running-count?focus=one-deck-speed",
    },
    {
      ...checks[1], drill: "True Count",
      latest: tc ? `${tc.accuracy}% (target 95%)` : `No ${BENCHMARK_MIN_QUESTIONS}-question session yet`,
      note: noteFor("True Count", tc, `Sessions under ${BENCHMARK_MIN_QUESTIONS} questions do not count.`),
      progress: tc ? Math.min(1, tc.accuracy / 95) : undefined,
      practiceHref: "/training/true-count",
    },
    {
      ...checks[2], drill: "Deck Estimation",
      latest: deck && Number.isFinite(mae) ? `${mae.toFixed(2)} decks off on average (target 0.25 or less)` : `No ${BENCHMARK_MIN_QUESTIONS}-photo session yet`,
      note: noteFor("Deck Estimation", deck, `Sessions under ${BENCHMARK_MIN_QUESTIONS} photos do not count.`),
      progress: deck && Number.isFinite(mae) ? (mae <= 0 ? 1 : Math.min(1, 0.25 / mae)) : undefined,
      practiceHref: "/training/deck-estimation?focus=0.25-deck",
    },
    {
      ...checks[3], drill: "Full Shoe",
      latest: shoe ? `${shoe.accuracy}% (target 95%)` : "Not tried yet",
      progress: shoe ? Math.min(1, shoe.accuracy / 95) : undefined,
      practiceHref: "/training/full-shoe",
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
