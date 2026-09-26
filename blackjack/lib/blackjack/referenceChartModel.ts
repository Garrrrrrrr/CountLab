/**
 * Everything the reference charts show, computed without React.
 *
 * The pages under /reference render a strategy card for the reader's table
 * rules (basic strategy, optionally with Hi-Lo index plays) and a replica of
 * the printed H17 deviation chart. This module turns the strategy tables, the
 * deviation catalogs and the measured EV ranking into one model per chart: the
 * text and colour of every cell, what it means in plain words, and which index
 * plays are worth learning first. Keeping it here means the copy and ordering
 * are unit-tested rather than living in JSX.
 */
import { ACTION_LABEL } from "./actionStyles";
import { CHART_DEALERS, formatToken } from "./bjaH17Chart";
import type { ChartSectionId, ChartToken } from "./bjaH17Chart";
import { explainToken } from "./chartEntry";
import { deviationGridCells } from "./deviationChart";
import type { DeviationCell } from "./deviationChart";
import { DEVIATION_RANKING } from "./deviationRanking";
import type { DeviationRankingProfile } from "./deviationRanking";
import { DEVIATION_ACTION_NAMES, deviationSentence, deviationTransition, getDeviationCatalog } from "./deviations";
import type { Deviation, DeviationAction } from "./deviations";
import { chartSections } from "./es10Chart";
import type { ChartSurrenderRule } from "./es10Chart";
import { chartCell } from "./strategyChart";
import type { StrategyChartRules, StrategySectionId } from "./strategyChart";
import { STRATEGY_ROWS } from "./strategyTables";
import { surrenderChart } from "./surrenderChart";
import type { SurrenderChart } from "./surrenderChart";
import type { Action } from "./types";

export type ChartView = "basic" | "index";
export type RulesSectionId = StrategySectionId | "surrender";

/** What the prerendered page shows before saved rules load: the most common shoe game. */
export const DEFAULT_CHART_RULES: StrategyChartRules = {
  decks: 6,
  dealerHitsSoft17: true,
  doubleAfterSplit: true,
  surrender: "late",
  doubleRule: "any",
  europeanNoHoleCard: false,
};

/** Deck counts the saved settings may hold that the chart can show; anything else reads as 6. */
export const CHART_DECKS: readonly number[] = [1, 2, 4, 6, 8];

/** The saved rules the chart reads. Double restrictions and ENHC are never saved, so they start at their defaults. */
export function chartRulesFromSettings(settings: Pick<StrategyChartRules, "decks" | "dealerHitsSoft17" | "doubleAfterSplit" | "surrender">): StrategyChartRules {
  return {
    ...DEFAULT_CHART_RULES,
    decks: CHART_DECKS.includes(settings.decks) ? settings.decks : 6,
    dealerHitsSoft17: settings.dealerHitsSoft17,
    doubleAfterSplit: settings.doubleAfterSplit,
    surrender: settings.surrender,
  };
}

/** 1, 2 and 4–8 decks are the three games the strategy tables distinguish. */
export type DeckChoice = "1" | "2" | "4-8";
export const deckChoice = (decks: number): DeckChoice => (decks === 1 ? "1" : decks === 2 ? "2" : "4-8");
/** Choosing "4–8" keeps a saved 4, 6 or 8 rather than flattening it to 6. */
export const decksForChoice = (choice: DeckChoice, savedDecks: number) =>
  choice === "1" ? 1 : choice === "2" ? 2 : [4, 6, 8].includes(savedDecks) ? savedDecks : 6;

/* ------------------------------------------------------------------------ */
/* Names and notation                                                        */
/* ------------------------------------------------------------------------ */

const MINUS = "−";
/** A true count as printed on the page: +4, 0, −1 (a real minus sign). */
export const signedCount = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `${MINUS}${Math.abs(value)}` : "0");

/**
 * The chip an index play wears in its cell: the play, the count, and an arrow
 * for the direction. "S+4↑" is stand at +4 and higher; "H−1↓" is hit at −1 and
 * lower. Arrows rather than ≥/≤ because they read the same way the printed
 * charts' "4+" does and they are in the page's font.
 */
export function chipText(departure: DeviationAction, index: number, atOrBelow: boolean): string {
  return `${departure}${signedCount(index)}${atOrBelow ? "↓" : "↑"}`;
}

const softTotal = (row: string) => 11 + (row.endsWith(",A") ? 1 : Number(row.slice(2)));
const PAIR_NAMES: Record<string, string> = { "A,A": "aces", "T,T": "tens" };

/** "Hard 16", "Soft 18 (A,7)", "Pair of 8s". */
export function handName(section: StrategySectionId, row: string): string {
  if (section === "hard") return `Hard ${row}`;
  if (section === "soft") return `Soft ${softTotal(row)} (${row})`;
  return `Pair of ${PAIR_NAMES[row] ?? `${row.split(",")[0]}s`}`;
}

/** The soft total a soft row stands for, printed under its label on the chart. */
export const softRowTotal = (row: string) => String(softTotal(row));

export const dealerName = (dealer: string) => (dealer === "A" ? "dealer ace" : `dealer ${dealer}`);

/** Which strategy grid a surrender-table row belongs to: pairs carry a comma, totals do not. */
const surrenderRowSection = (row: string): StrategySectionId => (row.includes(",") ? "pairs" : "hard");

/** The explanation card's heading, e.g. "Hard 16 vs dealer 10". */
export function cellTitle(section: RulesSectionId, row: string, dealer: string): string {
  return `${handName(section === "surrender" ? surrenderRowSection(row) : section, row)} vs ${dealerName(dealer)}`;
}

const ARIA_PREFIX: Record<StrategySectionId, string> = { hard: "Hard", soft: "Soft", pairs: "Pair" };
/** How a cell introduces itself to a screen reader; always contains "{row} versus dealer {dealer}". */
export function cellAriaPrefix(section: RulesSectionId | ChartSectionId, row: string, dealer: string): string {
  const hand = section === "surrender"
    ? `Surrender table, ${surrenderRowSection(row) === "pairs" ? "pair" : "hard"} ${row}`
    : `${ARIA_PREFIX[section]} ${row}`;
  return `${hand} versus dealer ${dealer}`;
}

/** A short cell reference for announcements: "11 v A", "soft A,8 v 6". */
export function shortCellName(section: RulesSectionId, row: string, dealer: string): string {
  const prefix = section === "soft" ? "soft " : section === "surrender" ? "surrender " : "";
  return `${prefix}${row} v ${dealer}`;
}

const SURRENDER_SHORT: Record<StrategyChartRules["surrender"], string> = { none: "No surrender", late: "LS", early: "ES10" };
const SURRENDER_LONG: Record<StrategyChartRules["surrender"], string> = { none: "no surrender", late: "late surrender", early: "early surrender vs 10" };
const DOUBLE_SHORT: Record<StrategyChartRules["doubleRule"], string> = { any: "", "9-11": "9–11", "10-11": "10–11" };
const DOUBLE_LONG: Record<StrategyChartRules["doubleRule"], string> = { any: "double on any two cards", "9-11": "double on hard 9–11 only", "10-11": "double on hard 10–11 only" };

/**
 * The rules in one line. `short` matches the header's training pill
 * ("6D · H17 · DAS · LS"); `long` is the printed card's rules line.
 */
export function rulesSummary(rules: StrategyChartRules, form: "short" | "long"): string {
  if (form === "short") {
    return [
      `${rules.decks}D`,
      rules.dealerHitsSoft17 ? "H17" : "S17",
      rules.doubleAfterSplit ? "DAS" : "No DAS",
      SURRENDER_SHORT[rules.surrender],
      DOUBLE_SHORT[rules.doubleRule],
      rules.europeanNoHoleCard ? "ENHC" : "",
    ].filter(Boolean).join(" · ");
  }
  return [
    `${rules.decks} ${rules.decks === 1 ? "deck" : "decks"}`,
    rules.dealerHitsSoft17 ? "dealer hits soft 17" : "dealer stands on soft 17",
    rules.doubleAfterSplit ? "double after split" : "no double after split",
    SURRENDER_LONG[rules.surrender],
    DOUBLE_LONG[rules.doubleRule],
    rules.europeanNoHoleCard ? "no hole card (European)" : "dealer peeks for blackjack",
  ].join(" · ");
}

/* ------------------------------------------------------------------------ */
/* Measured values                                                           */
/* ------------------------------------------------------------------------ */

export interface PlayValue {
  /** Units won per 100 rounds by adding this one play to basic strategy. */
  ev: number;
  /** Standard error of `ev`. */
  se: number;
  /** Rounds per 100 in which the play actually changes a decision. */
  fires: number;
}

export const rankingProfile = (dealerHitsSoft17: boolean, surrenderAvailable: boolean): DeviationRankingProfile =>
  `${dealerHitsSoft17 ? "h17" : "s17"}-${surrenderAvailable ? "ls" : "no-ls"}` as DeviationRankingProfile;

/**
 * The profile a play is priced on. Plays are ranked with the table's own
 * surrender rule, except the starred stands (16 v 10 at 0 and friends): those
 * only ever apply once surrender is no longer offered, so at a surrender table
 * they are priced as they were measured, without it.
 */
function valueProfile(rules: StrategyChartRules, overridesSurrender: boolean): DeviationRankingProfile {
  const surrenderOn = rules.surrender !== "none";
  return rankingProfile(rules.dealerHitsSoft17, surrenderOn && !overridesSurrender);
}

function measuredValue(row: Deviation, profile: DeviationRankingProfile): PlayValue | null {
  const id = (row as { id?: string }).id;
  const entry = id ? DEVIATION_RANKING[profile][id] : undefined;
  return entry ? { ev: entry[0], se: entry[1], fires: entry[2] } : null;
}

/* ------------------------------------------------------------------------ */
/* The rules chart                                                           */
/* ------------------------------------------------------------------------ */

/** A cell's colour: an action, the double-otherwise-stand variant, or an empty surrender cell. */
export type CellTone = Action | "Ds" | "none";

export interface IndexPlay {
  departure: DeviationAction;
  baseline: DeviationAction;
  index: number;
  atOrBelow: boolean;
  chip: string;
  sentence: string;
  /** False where the table's double or hole-card rule makes the play impossible. */
  available: boolean;
  /** A starred stand index, which applies only once surrender is off the table. */
  overridesSurrender: boolean;
  value: PlayValue | null;
}

export interface RulesCell {
  /** `${section}:${row}v${dealer}`, also written to the button as data-cell. */
  key: string;
  section: RulesSectionId;
  row: string;
  dealer: string;
  /** Null for a surrender-table cell the hand is not given up in. */
  action: Action | null;
  fallback?: Action;
  text: "H" | "S" | "D" | "Ds" | "P" | "R" | "—";
  tone: CellTone;
  title: string;
  /** A hand cell the surrender table takes first. */
  surrenderFirst: boolean;
  /** Plain-language reasons this cell differs from other common rules. */
  notes: string[];
  play?: IndexPlay;
  ariaLabel: string;
}

export interface RulesSection {
  id: RulesSectionId;
  label: string;
  description: string;
  rows: readonly string[];
  /** Row-major, one entry per dealer column. */
  cells: RulesCell[][];
}

export interface RulesChart {
  rules: StrategyChartRules;
  view: ChartView;
  sections: RulesSection[];
  cells: ReadonlyMap<string, RulesCell>;
  /** Index plays shown on the hand and surrender tables. */
  indexCount: number;
}

export const RULES_SECTIONS: ReadonlyArray<{ id: RulesSectionId; label: string; description: string }> = [
  { id: "hard", label: "Hard totals", description: "Hands without an ace counted as 11" },
  { id: "soft", label: "Soft totals", description: "Hands with an ace counted as 11" },
  { id: "pairs", label: "Pairs", description: "Two matching cards: split or not" },
  { id: "surrender", label: "Surrender", description: "Decide this first, before playing the hand" },
];

const VERB_INFINITIVE: Record<CellTone, string> = { H: "hit", S: "stand", D: "double (if you can't, hit)", Ds: "double (if you can't, stand)", P: "split", R: "surrender", none: "play the hand out" };
const VERB_THIRD: Record<Action, string> = { H: "hits", S: "stands", D: "doubles", P: "splits", R: "surrenders" };
const lower = (action: DeviationAction) => DEVIATION_ACTION_NAMES[action].toLowerCase();

const toneOf = (action: Action, fallback?: Action): CellTone => (action === "D" && fallback === "S" ? "Ds" : action);

const isTenOrAce = (dealer: string) => dealer === "10" || dealer === "A";

function canDoubleHere(rules: StrategyChartRules, section: StrategySectionId, row: string, dealer: string) {
  if (rules.europeanNoHoleCard && isTenOrAce(dealer)) return false;
  if (rules.doubleRule === "any") return true;
  return section === "hard" && (rules.doubleRule === "9-11" ? ["9", "10", "11"] : ["10", "11"]).includes(row);
}

function canSplitHere(rules: StrategyChartRules, row: string, dealer: string) {
  return !(rules.europeanNoHoleCard && isTenOrAce(dealer) && !(row === "A,A" && dealer === "10"));
}

/**
 * The index markers are the 6-deck sets and know nothing of double
 * restrictions or ENHC, so a play that needs a double or split the table
 * refuses is marked unavailable rather than silently dropped.
 */
function playAvailable(rules: StrategyChartRules, section: StrategySectionId, row: string, dealer: string, marker: DeviationCell) {
  const { departure, baseline } = marker.row.transition;
  if ((departure === "D" || baseline === "D") && !canDoubleHere(rules, section, row, dealer)) return false;
  if ((departure === "P" || baseline === "P") && !canSplitHere(rules, row, dealer)) return false;
  return true;
}

function indexPlay(rules: StrategyChartRules, section: StrategySectionId, row: string, dealer: string, marker: DeviationCell): IndexPlay {
  const { transition } = marker.row;
  const overridesSurrender = marker.row.row.overridesSurrender === true;
  return {
    departure: transition.departure,
    baseline: transition.baseline,
    index: marker.index,
    atOrBelow: marker.atOrBelow,
    chip: chipText(transition.departure, marker.index, marker.atOrBelow),
    sentence: deviationSentence(marker.row.row, transition),
    available: playAvailable(rules, section, row, dealer, marker),
    overridesSurrender,
    value: measuredValue(marker.row.row, valueProfile(rules, overridesSurrender)),
  };
}

/** Why this cell reads as it does, when another common rule would change it. */
function handNotes(rules: StrategyChartRules, section: StrategySectionId, row: string, dealer: string, surrenderFirst: boolean): string[] {
  const notes: string[] = [];
  const read = (variant: StrategyChartRules) => chartCell(variant, section, row, dealer, { canSurrender: false });
  const cell = read(rules);
  if (surrenderFirst) notes.push("If the table lets you surrender this hand, do that first; this is the play once surrender is off.");
  if (rules.doubleRule !== "any" && read({ ...rules, doubleRule: "any" }).action === "D" && cell.action !== "D") {
    notes.push(`Your table only lets you double on hard ${DOUBLE_SHORT[rules.doubleRule]}, so this hand ${VERB_THIRD[cell.action]} instead.`);
  }
  if (rules.europeanNoHoleCard && read({ ...rules, europeanNoHoleCard: false }).action !== cell.action) {
    notes.push(`No hole card: doubling or splitting against ${dealer === "A" ? "an ace" : "a 10"} risks the extra bet to a dealer blackjack, so this hand ${VERB_THIRD[cell.action]} instead.`);
  }
  if (section === "pairs" && ["Ph", "Pd", "Ps"].includes(cell.code)) {
    const other = read({ ...rules, doubleAfterSplit: !rules.doubleAfterSplit });
    if (other.action !== cell.action) {
      notes.push(rules.doubleAfterSplit
        ? `You split because your table lets you double after splitting; without that rule you would ${VERB_INFINITIVE[toneOf(other.action, other.fallback)]}.`
        : `Your table doesn't let you double after splitting, so this pair ${VERB_THIRD[cell.action]} instead of splitting.`);
    }
  }
  const other17 = read({ ...rules, dealerHitsSoft17: !rules.dealerHitsSoft17 });
  if (toneOf(other17.action, other17.fallback) !== toneOf(cell.action, cell.fallback)) {
    notes.push(rules.dealerHitsSoft17
      ? `Where the dealer stands on soft 17 (S17), ${VERB_INFINITIVE[toneOf(other17.action, other17.fallback)]} instead.`
      : `Where the dealer hits soft 17 (H17), ${VERB_INFINITIVE[toneOf(other17.action, other17.fallback)]} instead.`);
  }
  return notes;
}

function ariaFor(prefix: string, answer: string, extras: Array<string | false | undefined>) {
  const rest = extras.filter(Boolean).join(" ");
  return `${prefix}: ${answer}.${rest ? ` ${rest}` : ""}`;
}

function playAria(view: ChartView, play: IndexPlay | undefined) {
  if (!play) return undefined;
  if (view === "basic") return "The count can change this play.";
  return `Index play: ${play.sentence}${play.available ? "" : " Not available under these rules."}`;
}

function handCell(rules: StrategyChartRules, view: ChartView, section: StrategySectionId, row: string, dealer: string, markers: ReadonlyMap<string, DeviationCell>, surrender: SurrenderChart): RulesCell {
  // Surrender has its own table, so the hand tables answer the question left once it is declined.
  const cell = chartCell(rules, section, row, dealer, { canSurrender: false });
  const key = `${section}:${row}v${dealer}`;
  const marker = markers.get(key);
  const play = marker ? indexPlay(rules, section, row, dealer, marker) : undefined;
  const surrenderFirst = surrender.cells.get(`${row}v${dealer}`)?.surrenders === true
    && surrender.coordinate.get(row)?.section === section;
  const tone = toneOf(cell.action, cell.fallback);
  const answer = ACTION_LABEL[cell.action] + (cell.fallback ? `; otherwise ${lower(cell.fallback)}` : "");
  return {
    key,
    section,
    row,
    dealer,
    action: cell.action,
    fallback: cell.fallback,
    text: tone === "Ds" ? "Ds" : cell.action,
    tone,
    title: cellTitle(section, row, dealer),
    surrenderFirst,
    notes: handNotes(rules, section, row, dealer, surrenderFirst),
    play,
    ariaLabel: ariaFor(cellAriaPrefix(section, row, dealer), answer, [surrenderFirst && "Surrender first if the table allows it.", playAria(view, play)]),
  };
}

function surrenderCell(rules: StrategyChartRules, view: ChartView, row: string, dealer: string, surrender: SurrenderChart): RulesCell {
  const entry = surrender.cells.get(`${row}v${dealer}`);
  const section = surrender.coordinate.get(row)?.section ?? surrenderRowSection(row);
  const play = entry?.marker ? indexPlay(rules, section, row, dealer, entry.marker) : undefined;
  const surrenders = entry?.surrenders === true;
  return {
    key: `surrender:${row}v${dealer}`,
    section: "surrender",
    row,
    dealer,
    action: surrenders ? "R" : null,
    text: surrenders ? "R" : "—",
    tone: surrenders ? "R" : "none",
    title: cellTitle("surrender", row, dealer),
    surrenderFirst: false,
    notes: rules.surrender === "early" && dealer === "10" ? ["Early surrender: you can give up before the dealer checks for blackjack."] : [],
    play,
    ariaLabel: ariaFor(cellAriaPrefix("surrender", row, dealer), surrenders ? "Surrender" : "Do not surrender", [playAria(view, play)]),
  };
}

/** The whole chart for one set of rules, in the order the page shows it. */
export function buildRulesChart(rules: StrategyChartRules, view: ChartView): RulesChart {
  // The hand tables read the 6-deck indices with surrender off, which is what
  // brings the starred stand indices (16 v 10 at 0, 15 v 10 at +4) into view.
  const markers = deviationGridCells({ dealerHitsSoft17: rules.dealerHitsSoft17, lateSurrender: false });
  const surrender = surrenderChart(rules);
  const cells = new Map<string, RulesCell>();
  let indexCount = 0;
  const sections = RULES_SECTIONS.map(({ id, label, description }): RulesSection => {
    const rows = id === "surrender" ? surrender.rows : STRATEGY_ROWS[id];
    const grid = rows.map((row) => CHART_DEALERS.map((dealer) => {
      const cell = id === "surrender" ? surrenderCell(rules, view, row, dealer, surrender) : handCell(rules, view, id, row, dealer, markers, surrender);
      cells.set(cell.key, cell);
      if (cell.play) indexCount++;
      return cell;
    }));
    return { id, label, description, rows, cells: grid };
  });
  return { rules, view, sections, cells, indexCount };
}

/** Cells whose printed answer differs between two charts, in page order. */
export function changedCells(before: RulesChart, after: RulesChart): RulesCell[] {
  const changed: RulesCell[] = [];
  for (const cell of after.cells.values()) {
    const previous = before.cells.get(cell.key);
    if (!previous || previous.text !== cell.text || previous.play?.chip !== cell.play?.chip || previous.play?.available !== cell.play?.available) changed.push(cell);
  }
  return changed;
}

/* ------------------------------------------------------------------------ */
/* Ranking                                                                   */
/* ------------------------------------------------------------------------ */

export interface RankedPlay {
  /** The chart cell it lives in, or "insurance", which has none. */
  key: string;
  kind: "Hard" | "Soft" | "Pair" | "Surrender" | "Insurance";
  /** "16 vs 10"; "Insurance" for insurance. */
  label: string;
  /** Accessible name of the button that shows it on the chart. */
  showLabel?: string;
  chip?: string;
  sentence: string;
  available: boolean;
  value: PlayValue | null;
}

export interface IndexRanking {
  /** Measured plays that apply at this table, most valuable first. */
  ranked: RankedPlay[];
  /** Starred stands at a surrender table: they only apply after hitting or splitting. */
  afterSurrender: RankedPlay[];
  /** Plays with no measured value yet (the early-surrender ten column). */
  unmeasured: RankedPlay[];
  /** Sum of the ranked plays that are available here. */
  total: number;
  /** Largest absolute value on the page, for scaling the bars. */
  max: number;
  /** How few plays carry three quarters of the total. */
  topShare: { count: number; share: number } | null;
  /** Widest 95% interval over every listed measured play. */
  widestInterval: number;
}

const KIND: Record<RulesSectionId, RankedPlay["kind"]> = { hard: "Hard", soft: "Soft", pairs: "Pair", surrender: "Surrender" };
const SHOW_KIND: Record<RulesSectionId, string> = { hard: "hard", soft: "soft", pairs: "pair", surrender: "surrender" };
const byValue = (a: RankedPlay, b: RankedPlay) => (b.value?.ev ?? 0) - (a.value?.ev ?? 0);

/** Index plays for these rules, ranked by what each adds to basic strategy. */
export function rankIndexPlays(rules: StrategyChartRules, chart: RulesChart = buildRulesChart(rules, "index")): IndexRanking {
  const ranked: RankedPlay[] = [];
  const afterSurrender: RankedPlay[] = [];
  const unmeasured: RankedPlay[] = [];
  const surrenderOn = rules.surrender !== "none";

  const insurance = getDeviationCatalog({ dealerHitsSoft17: rules.dealerHitsSoft17 }).find((row) => row.hand === "Insurance");
  if (insurance) {
    const transition = deviationTransition(insurance, { dealerHitsSoft17: rules.dealerHitsSoft17, lateSurrender: surrenderOn });
    ranked.push({
      key: "insurance",
      kind: "Insurance",
      label: "Insurance",
      sentence: `${deviationSentence(insurance, transition)} Even money is the same bet.`,
      available: true,
      value: measuredValue(insurance, rankingProfile(rules.dealerHitsSoft17, surrenderOn)),
    });
  }

  for (const cell of chart.cells.values()) {
    const play = cell.play;
    if (!play) continue;
    const entry: RankedPlay = {
      key: cell.key,
      kind: KIND[cell.section],
      label: `${cell.row} vs ${cell.dealer}`,
      showLabel: `Show ${SHOW_KIND[cell.section]} ${cell.row} vs ${cell.dealer} on the chart`,
      chip: play.chip,
      sentence: play.sentence,
      available: play.available,
      value: play.value,
    };
    if (!play.value) unmeasured.push(entry);
    else if (surrenderOn && play.overridesSurrender) afterSurrender.push(entry);
    else ranked.push(entry);
  }
  ranked.sort(byValue);
  afterSurrender.sort(byValue);

  const counted = ranked.filter((play) => play.available && play.value);
  const total = counted.reduce((sum, play) => sum + play.value!.ev, 0);
  let topShare: IndexRanking["topShare"] = null;
  if (total > 0) {
    let running = 0;
    for (const [position, play] of counted.entries()) {
      running += play.value!.ev;
      if (running >= total * 0.75) { topShare = { count: position + 1, share: running / total }; break; }
    }
  }
  const measured = [...ranked, ...afterSurrender];
  return {
    ranked,
    afterSurrender,
    unmeasured,
    total,
    max: Math.max(0, ...measured.map((play) => Math.abs(play.value?.ev ?? 0))),
    topShare,
    widestInterval: Math.max(0, ...measured.map((play) => 1.96 * (play.value?.se ?? 0))),
  };
}

/* ------------------------------------------------------------------------ */
/* The printed H17 chart                                                     */
/* ------------------------------------------------------------------------ */

/** A printed token's colour. Y reads as a split, blank surrender cells as empty. */
export type H17Tone = "Y" | "N" | "YN" | "H" | "S" | "D" | "Ds" | "SUR" | "index" | "none";

export interface H17Cell {
  key: string;
  section: ChartSectionId;
  row: string;
  dealer: string;
  token: ChartToken;
  /** The printed token, exactly: "4+", "-1-", "Y/N". */
  text: string;
  tone: H17Tone;
  title: string;
  explain: string;
  /** A plain-language reading of an index token, when a catalog row backs it. */
  plain?: string;
  value?: PlayValue | null;
  ariaLabel: string;
}

export interface H17Section {
  id: ChartSectionId;
  label: string;
  rows: readonly string[];
  cells: H17Cell[][];
}

export const H17_CHART_RULES = (rule: ChartSurrenderRule): StrategyChartRules => ({
  ...DEFAULT_CHART_RULES,
  surrender: rule === "early10" ? "early" : "late",
});

function h17Tone(section: ChartSectionId, token: ChartToken): H17Tone {
  if (token.kind === "index") return "index";
  if (token.value === "N") return section === "surrender" ? "none" : "N";
  if (token.value === "Y/N") return "YN";
  return token.value;
}

const h17HandMarkers = deviationGridCells({ dealerHitsSoft17: true, lateSurrender: false });

function h17Marker(section: ChartSectionId, row: string, dealer: string, rule: ChartSurrenderRule): DeviationCell | undefined {
  if (section === "surrender") return surrenderChart(H17_CHART_RULES(rule)).cells.get(`${row}v${dealer}`)?.marker;
  return h17HandMarkers.get(`${section}:${row}v${dealer}`);
}

/**
 * "Stand when the true count is +4 or higher; otherwise hit." for a printed
 * index, read from the catalog row behind it. The chart's own legend makes 0+
 * and 0- running-count conditions, so they are never called a true count of 0.
 * Undefined when no catalog row agrees with the printed direction and count;
 * the printed-token explanation then stands alone rather than guessing.
 */
export function h17PlainSentence(section: ChartSectionId, token: ChartToken, row: string, dealer: string, rule: ChartSurrenderRule): string | undefined {
  if (token.kind !== "index") return undefined;
  const marker = h17Marker(section, row, dealer, rule);
  const atOrBelow = token.when === "atOrBelow";
  if (!marker || marker.atOrBelow !== atOrBelow || marker.index !== token.value) return undefined;
  const { departure, baseline } = marker.row.transition;
  const when = token.value === 0
    ? `the running count is ${atOrBelow ? "negative" : "positive"}`
    : `the true count is ${signedCount(token.value)} or ${atOrBelow ? "lower" : "higher"}`;
  return `${DEVIATION_ACTION_NAMES[departure]} when ${when}; otherwise ${lower(baseline)}.`;
}

/** The printed chart in its own section order (pairs, soft, hard, surrender). */
export function buildH17Chart(rule: ChartSurrenderRule): H17Section[] {
  return chartSections(rule).map((chartSection) => ({
    id: chartSection.id,
    label: chartSection.label,
    rows: chartSection.rows,
    cells: chartSection.rows.map((row) => CHART_DEALERS.map((dealer): H17Cell => {
      const token = chartSection.cells.get(`${chartSection.id}:${row}v${dealer}`)!;
      const explain = explainToken(chartSection.id, token);
      const plain = h17PlainSentence(chartSection.id, token, row, dealer, rule);
      const marker = plain ? h17Marker(chartSection.id, row, dealer, rule) : undefined;
      return {
        key: `${chartSection.id}:${row}v${dealer}`,
        section: chartSection.id,
        row,
        dealer,
        token,
        text: formatToken(token),
        tone: h17Tone(chartSection.id, token),
        title: cellTitle(chartSection.id === "surrender" ? "surrender" : chartSection.id, row, dealer),
        explain,
        plain,
        value: marker ? measuredValue(marker.row.row, rankingProfile(true, chartSection.id === "surrender")) : undefined,
        ariaLabel: `${cellAriaPrefix(chartSection.id, row, dealer)}: ${explain}`,
      };
    })),
  }));
}
