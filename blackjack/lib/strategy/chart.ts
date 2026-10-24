/**
 * Everything a strategy chart shows, computed from the engine without React.
 *
 * The layout follows the printed charts players learn from: hard, soft and pair
 * tables give the play, and surrender gets a table of its own because it is
 * decided first. A hard or pair cell that basic strategy surrenders is flagged,
 * so nobody reads "hit 16 v 10" off the hard table and forgets to surrender.
 */
import { STRATEGY_ROWS } from "@/lib/blackjack/strategyTables";
import type { Action } from "@/lib/blackjack/types";
import { basicPlay, basicSurrenders, cellDecision, insuranceAt, playIndex, signedCount, surrenderRule, type ActiveIndex, type CellRef, type Permissions, type Resolved, type Section, type SurrenderThreshold } from "./engine";
import { DEALERS, type Dealer, type IndexSource } from "./indices";
import { effectiveSurrender, type TableRules } from "./rules";

export const cellKey = (ref: { section: string; row: string; dealer: string }) => `${ref.section}:${ref.row}v${ref.dealer}`;

export interface ChartCell {
  ref: CellRef;
  /** The play when the hand is not surrendered. */
  basic: Resolved;
  /** The count-based change to that play, if the rules have one. */
  index?: ActiveIndex;
  /** Basic strategy surrenders this hand where the table allows it. */
  surrenderFirst: boolean;
}

export interface PlayTable {
  id: Section;
  title: string;
  /** Row labels top to bottom, as printed. */
  rows: readonly string[];
  cells: ReadonlyMap<string, ChartCell>;
}

export interface SurrenderTable {
  rows: readonly { row: string; section: Section }[];
  /** Keyed by `cellKey`, present only where the hand is ever surrendered. */
  cells: ReadonlyMap<string, SurrenderThreshold>;
}

export interface StrategyChart {
  rules: TableRules;
  tables: { hard: PlayTable; soft: PlayTable; pairs: PlayTable };
  /** Null when the table offers no surrender. */
  surrender: SurrenderTable | null;
  /** Wong's table 11: it depends on the deck count, and is not a whole number. */
  insuranceAt: number;
}

const TITLES: Record<Section, string> = { hard: "Hard totals", soft: "Soft totals", pairs: "Pairs" };

export function buildChart(rules: TableRules): StrategyChart {
  const table = (id: Section): PlayTable => {
    const cells = new Map<string, ChartCell>();
    for (const row of STRATEGY_ROWS[id]) {
      for (const dealer of DEALERS) {
        const ref = { section: id, row, dealer };
        cells.set(cellKey(ref), { ref, basic: basicPlay(rules, ref), index: playIndex(rules, ref), surrenderFirst: id !== "soft" && basicSurrenders(rules, ref) });
      }
    }
    return { id, title: TITLES[id], rows: STRATEGY_ROWS[id], cells };
  };
  return {
    rules,
    tables: { hard: table("hard"), soft: table("soft"), pairs: table("pairs") },
    surrender: buildSurrenderTable(rules),
    insuranceAt: insuranceAt(rules),
  };
}

function buildSurrenderTable(rules: TableRules): SurrenderTable | null {
  if (effectiveSurrender(rules) === "none") return null;
  const rows: { row: string; section: Section }[] = [];
  const cells = new Map<string, SurrenderThreshold>();
  for (const section of ["hard", "pairs"] as const) {
    for (const row of STRATEGY_ROWS[section]) {
      let used = false;
      for (const dealer of DEALERS) {
        const rule = surrenderRule(rules, { section, row, dealer });
        // A hand neither basic strategy nor the count ever surrenders is left out.
        if (rule.at === Infinity && !rule.basic) continue;
        cells.set(cellKey({ section, row, dealer }), rule);
        used = true;
      }
      if (used) rows.push({ row, section });
    }
  }
  return { rows, cells };
}

/* ------------------------------------------------------------------ */
/* The count ladder: one cell's play across the count range            */
/* ------------------------------------------------------------------ */

export interface LadderSegment { from: number; to: number; action: Action; fallback?: Action }

/**
 * A cell's play from `min` to `max`, merged into runs. The ends are open: "−6"
 * means "−6 or lower". Defaults to an original two-card hand; pass the hand's
 * permissions for one that has drawn or split (it switches at the stand index,
 * not at the surrender threshold).
 */
export function countLadder(rules: TableRules, ref: CellRef, min = -6, max = 10, permissions?: Permissions): LadderSegment[] {
  const segments: LadderSegment[] = [];
  for (let tc = min; tc <= max; tc++) {
    const decision = cellDecision(rules, ref, tc, permissions);
    const last = segments[segments.length - 1];
    if (last && last.action === decision.action && last.fallback === decision.fallback) last.to = tc;
    else segments.push({ from: tc, to: tc, action: decision.action, fallback: decision.fallback });
  }
  return segments;
}

/* ------------------------------------------------------------------ */
/* The index list                                                      */
/* ------------------------------------------------------------------ */

export interface IndexEntry {
  id: string;
  kind: "insurance" | "play" | "surrender";
  ref?: CellRef;
  /** The play the count switches to. */
  play: Action | "insurance";
  /** What basic strategy does instead. */
  basic: Action | "no insurance";
  dir: "up" | "down";
  at: number;
  source: IndexSource;
  /** Lower is learned first. */
  priority: number;
}

/**
 * Learning order. The numbers are Wong's; the order is Schlesinger's ranking
 * of the Illustrious 18 and Fab 4 by how much each play is worth, still the
 * standard way to learn them. Everything else follows, with the indices
 * closest to zero (the ones that come up most often) first.
 */
const LEARNING_ORDER = [
  "insurance", "hard:16v10", "hard:15v10", "pairs:T,Tv5", "pairs:T,Tv6", "hard:10v10", "hard:12v3", "hard:12v2", "hard:11vA", "hard:9v2", "hard:10vA", "hard:9v7", "hard:16v9", "hard:13v2", "hard:12v4", "hard:12v5", "hard:12v6", "hard:13v3",
  "R:hard:14v10", "R:hard:15v10", "R:hard:15v9", "R:hard:15vA",
];

/** Entries with a priority below this are the Illustrious 18 (insurance included) and the Fab 4. */
export const CORE_INDEX_COUNT = LEARNING_ORDER.length;

/** Every index that changes a two-card play under these rules, in learning order. */
const indexLists = new Map<string, readonly IndexEntry[]>();

/** Cached per rule set: drills ask for it on every question. Callers must not mutate it. */
export function indexList(rules: TableRules): readonly IndexEntry[] {
  const key = JSON.stringify(rules);
  let list = indexLists.get(key);
  if (!list) indexLists.set(key, (list = buildIndexList(rules)));
  return list;
}

function buildIndexList(rules: TableRules): IndexEntry[] {
  const chart = buildChart(rules);
  const entries: IndexEntry[] = [{ id: "insurance", kind: "insurance", play: "insurance", basic: "no insurance", dir: "up", at: chart.insuranceAt, source: "T11", priority: 0 }];
  for (const table of Object.values(chart.tables)) {
    for (const cell of table.cells.values()) {
      // An index has a switch point to learn; a play Wong makes at every count does not.
      if (!cell.index || !Number.isFinite(cell.index.at)) continue;
      // A pair is only ever played on its first two cards; where surrender takes the hand on both
      // sides of the number (one-deck 7,7 v 10 gives up from −1, its stand number is 0), it never decides.
      if (cell.ref.section === "pairs" && effectiveSurrender(rules) !== "none") {
        const index = cell.index.dir === "up" ? Math.ceil(cell.index.at) : Math.floor(cell.index.at);
        if (cellDecision(rules, cell.ref, index).action !== cell.index.play) continue;
      }
      const key = cellKey(cell.ref);
      entries.push({ id: key, kind: "play", ref: cell.ref, play: cell.index.play, basic: cell.basic.action, dir: cell.index.dir, at: cell.index.at, source: cell.index.source, priority: 0 });
    }
  }
  if (chart.surrender) {
    for (const [key, rule] of chart.surrender.cells) {
      if (!Number.isFinite(rule.at) || !rule.source) continue;
      const [section, rest] = key.split(":");
      const [row, dealer] = rest.split("v");
      const ref = { section: section as Section, row, dealer: dealer as Dealer };
      const fallback = cellDecision(rules, ref, rule.at, { canDouble: true, canSplit: true, canSurrender: false }).action;
      entries.push({ id: `R:${key}`, kind: "surrender", ref, play: "R", basic: fallback, dir: "up", at: rule.at, source: rule.source, priority: 0 });
    }
  }
  const rank = (entry: IndexEntry) => {
    const known = LEARNING_ORDER.indexOf(entry.id);
    return known >= 0 ? known : LEARNING_ORDER.length + Math.abs(entry.at) * 10 + (entry.kind === "surrender" ? 1 : 0);
  };
  return entries.map((entry) => ({ ...entry, priority: rank(entry) })).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

/* ------------------------------------------------------------------ */
/* Notation                                                            */
/* ------------------------------------------------------------------ */

/** The short tag printed in a cell: "+4", "−1", "0". Direction is carried by the arrow in `indexTag`. */
export const indexNumber = (index: { at: number }) => signedCount(index.at);

/** "S +4↑": the play, the count and which way it applies; "S any" at every count. */
export const indexTag = (index: { play: Action | string; at: number; dir: "up" | "down" }) => `${index.play} ${Number.isFinite(index.at) ? `${signedCount(index.at)}${index.dir === "up" ? "↑" : "↓"}` : "any"}`;

/** Surrender thresholds, as the surrender table prints them. */
export function surrenderTag(rule: SurrenderThreshold): string {
  if (rule.at === -Infinity) return "R";
  return `R ${signedCount(rule.at)}↑`;
}

/** Row label as printed on the chart's left edge. */
export function rowLabel(section: Section, row: string): string {
  if (section === "soft") return row;
  if (section === "pairs") return row.replace("T,T", "10,10");
  return row;
}
