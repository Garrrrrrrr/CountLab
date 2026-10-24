/**
 * Chart recall: the reader fills in the strategy chart for their rules from
 * memory, one table at a time, and each table is graded against `buildChart`.
 *
 * A cell's answer has two parts:
 *   base  the play without a count: "H", "S", "D", "Ds" (double, otherwise
 *         stand), "P" in the play tables; "R" or "-" in the surrender table.
 *   dev   "With indices" only: the play the count switches to and the index.
 *         In the surrender table the play is always surrender, so only the
 *         count is asked ("surrender at +3 or higher").
 */
import type { Action } from "@/lib/blackjack/types";
import type { Mistake } from "@/lib/statistics/storage";
import { ACTION_NAMES, cellDecision, cellKey, DEALERS, explainDecision, handLabel, rowLabel, signedCount, thresholdPhrase, type CellRef, type Dealer, type Section, type TableRules } from "@/lib/strategy";
import { chartFor, playToken } from "./chartRow";

export type RecallTableId = "surrender" | "hard" | "soft" | "pairs";
export const RECALL_TABLE_IDS: readonly RecallTableId[] = ["surrender", "hard", "soft", "pairs"];
export type RecallLevel = "basic" | "indices";
export const recallLevelOf = (value: unknown): RecallLevel => (value === "indices" ? "indices" : "basic");

export interface Deviation { play: Action; at: number }
export interface CellEntry { base?: string; dev?: Deviation }

export interface RecallCell {
  /** Unique across tables: "hard|hard:16v10", "surrender|hard:16v10". */
  key: string;
  table: RecallTableId;
  ref: CellRef;
  /** "Hard 16 versus dealer 10", the cell button's accessible name. */
  name: string;
  /** "16 vs 10", for captions. */
  short: string;
  expected: CellEntry;
  /** Which way the index runs, for printing the answer ("S +4↑"). */
  dir?: "up" | "down";
}

export interface RecallRow { row: string; section: Section; label: string; cells: RecallCell[] }

export interface RecallTable {
  id: RecallTableId;
  title: string;
  rows: RecallRow[];
  /** Row-major: the order auto-advance walks. */
  cells: RecallCell[];
  /** The answer keys this table offers. */
  baseKeys: string[];
}

export const TABLE_TITLE: Record<RecallTableId, string> = { surrender: "Surrender", hard: "Hard totals", soft: "Soft totals", pairs: "Pairs" };

/** Keys every table offers whatever the rules, so a key's presence never gives an answer away. */
const STANDARD_KEYS: Record<RecallTableId, string[]> = { surrender: ["R", "-"], hard: ["H", "S", "D"], soft: ["H", "S", "D", "Ds"], pairs: ["H", "S", "D", "P"] };
const KEY_ORDER = ["H", "S", "D", "Ds", "P", "R", "-"];
export const DEV_KEYS: readonly Action[] = ["H", "S", "D", "P"];

export const BASE_NAME: Record<string, string> = { H: "Hit", S: "Stand", D: "Double", Ds: "Double, otherwise stand", P: "Split", R: "Surrender", "-": "No surrender" };
/** The action whose colour a base token takes. */
export const baseAction = (base: string): Action | undefined => (base === "-" ? undefined : base === "Ds" ? "D" : (base as Action));

const dealerWord = (dealer: Dealer) => (dealer === "A" ? "ace" : dealer);

/** Which tables a chart has under these rules, in the order they are filled. */
export function availableTables(rules: TableRules): RecallTableId[] {
  return RECALL_TABLE_IDS.filter((id) => id !== "surrender" || chartFor(rules).surrender !== null);
}

const SURRENDER_DEALERS: readonly string[] = ["8", "9", "10", "A"];

export function recallTable(rules: TableRules, id: RecallTableId, level: RecallLevel): RecallTable | null {
  const chart = chartFor(rules);
  const rows: RecallRow[] = [];
  if (id === "surrender") {
    if (!chart.surrender) return null;
    const table = chart.surrender;
    for (const { row, section } of table.rows) {
      const cells = DEALERS.map((dealer): RecallCell => {
        const ref = { section, row, dealer };
        const rule = table.cells.get(cellKey(ref));
        const finite = rule && Number.isFinite(rule.at);
        return {
          key: `surrender|${cellKey(ref)}`,
          table: id,
          ref,
          name: `Surrender, ${handLabel(section, row)} versus dealer ${dealerWord(dealer)}`,
          short: `${rowLabel(section, row)} vs ${dealer}`,
          expected: { base: rule?.basic ? "R" : "-", dev: level === "indices" && finite ? { play: "R", at: rule!.at } : undefined },
          dir: finite ? "up" : undefined,
        };
      });
      rows.push({ row, section, label: rowLabel(section, row), cells });
    }
  } else {
    const table = chart.tables[id];
    for (const row of table.rows) {
      const cells = DEALERS.map((dealer): RecallCell => {
        const ref = { section: id, row, dealer };
        const cell = table.cells.get(cellKey(ref))!;
        return {
          key: `${id}|${cellKey(ref)}`,
          table: id,
          ref,
          name: `${handLabel(id, row)} versus dealer ${dealerWord(dealer)}`,
          short: `${rowLabel(id, row)} vs ${dealer}`,
          expected: { base: playToken(cell.basic), dev: level === "indices" && cell.index && Number.isFinite(cell.index.at) ? { play: cell.index.play, at: cell.index.at } : undefined },
          dir: cell.index?.dir,
        };
      });
      rows.push({ row, section: id, label: rowLabel(id, row), cells });
    }
  }
  // Nothing is ever surrendered against a 2 through 7 under any rule set, so
  // those cells are shown as given rather than asked sixty times a chart.
  const cells = rows.flatMap((row) => row.cells).filter((cell) => id !== "surrender" || SURRENDER_DEALERS.includes(cell.ref.dealer));
  const expectedKeys = new Set(cells.map((cell) => cell.expected.base!));
  const baseKeys = KEY_ORDER.filter((key) => STANDARD_KEYS[id].includes(key) || expectedKeys.has(key));
  return { id, title: TABLE_TITLE[id], rows, cells, baseKeys };
}

export function recallTables(rules: TableRules, level: RecallLevel, ids: readonly RecallTableId[] = RECALL_TABLE_IDS): RecallTable[] {
  return ids.map((id) => recallTable(rules, id, level)).filter((table): table is RecallTable => table !== null);
}

const sameDev = (a?: Deviation, b?: Deviation) => (!a && !b) || Boolean(a && b && a.play === b.play && a.at === b.at);

/** Right when the base play matches and, with indices, the deviation matches too (or both have none). */
export function entryMatches(expected: CellEntry, entry: CellEntry | undefined, level: RecallLevel): boolean {
  if (!entry?.base || entry.base !== expected.base) return false;
  return level === "basic" || sameDev(expected.dev, entry.dev);
}

/** "H", "Ds", "H · S +4↑", "—", "R +3↑": an answer as the chart prints it. */
export function formatEntry(entry: CellEntry | undefined, dir?: "up" | "down"): string {
  if (!entry?.base && !entry?.dev) return "";
  const base = entry.base === "-" ? "—" : entry.base ?? "?";
  if (!entry.dev) return base;
  const arrow = dir ? (dir === "up" ? "↑" : "↓") : "";
  return `${base} · ${entry.dev.play} ${signedCount(entry.dev.at)}${arrow}`;
}

/** The same in words, for screen readers and the mistake list. */
export function spokenEntry(entry: CellEntry | undefined, dir?: "up" | "down"): string {
  if (!entry?.base && !entry?.dev) return "empty";
  const base = entry.base ? BASE_NAME[entry.base] : "no play";
  if (!entry.dev) return base;
  const direction = dir === "down" ? " or lower" : dir === "up" ? " or higher" : "";
  return `${base}; ${ACTION_NAMES[entry.dev.play].toLowerCase()} at ${signedCount(entry.dev.at)}${direction}`;
}

export interface CellGrade { cell: RecallCell; entry?: CellEntry; ok: boolean; blank: boolean }
export interface TableGrade { id: RecallTableId; title: string; cells: CellGrade[]; correct: number; total: number; blank: number; wrong: number; bestRun: number }

export function gradeTable(table: RecallTable, entries: Readonly<Record<string, CellEntry>>, level: RecallLevel): TableGrade {
  let run = 0, bestRun = 0;
  const cells = table.cells.map((cell): CellGrade => {
    const entry = entries[cell.key];
    const ok = entryMatches(cell.expected, entry, level);
    run = ok ? run + 1 : 0;
    bestRun = Math.max(bestRun, run);
    return { cell, entry, ok, blank: !entry?.base };
  });
  const correct = cells.filter((cell) => cell.ok).length;
  const blank = cells.filter((cell) => cell.blank).length;
  return { id: table.id, title: table.title, cells, correct, total: cells.length, blank, wrong: cells.length - correct - blank, bestRun };
}

/** Longest run of right cells across tables, in the order they were filled. */
export const bestRunAcross = (grades: readonly TableGrade[]) => {
  let run = 0, best = 0;
  for (const grade of grades) for (const cell of grade.cells) { run = cell.ok ? run + 1 : 0; best = Math.max(best, run); }
  return best;
};

/** What the chart says about a cell, in a sentence or two. */
export function explainCell(rules: TableRules, cell: RecallCell): string {
  const { ref } = cell;
  const hand = `${handLabel(ref.section, ref.row)} vs ${ref.dealer === "A" ? "an ace" : ref.dealer === "8" ? "an 8" : `a ${ref.dealer}`}`;
  const chart = chartFor(rules);
  if (cell.table === "surrender") {
    const rule = chart.surrender?.cells.get(cellKey(ref));
    if (!rule) return `${hand}: never surrendered under these rules.`;
    if (rule.at === -Infinity) return `${hand}: always surrender (basic strategy).`;
    return `${hand}: surrender ${thresholdPhrase({ dir: "up", at: rule.at })}${rule.basic ? "; basic strategy surrenders it" : "; basic strategy plays it"}.`;
  }
  const decision = cellDecision(rules, ref, undefined, { canDouble: true, canSplit: ref.section === "pairs", canSurrender: false });
  const index = chart.tables[ref.section].cells.get(cellKey(ref));
  let text = explainDecision(ref, decision);
  if (index?.index) text += ` With a count: ${ACTION_NAMES[index.index.play].toLowerCase()} ${thresholdPhrase(index.index)}.`;
  if (index?.surrenderFirst) text += " Surrender first where the table allows it.";
  return text;
}

export function cellMistake(rules: TableRules, grade: CellGrade, table: RecallTable): Mistake {
  return {
    question: `${table.title}: ${grade.cell.short}`,
    userAnswer: grade.blank ? "(blank)" : formatEntry(grade.entry),
    correctAnswer: formatEntry(grade.cell.expected, grade.cell.dir),
    explanation: explainCell(rules, grade.cell),
    category: "playing decision",
    context: { key: grade.cell.key },
  };
}

/** Saved entries, checked: anything malformed (from another version) is dropped. */
export function cleanEntries(value: unknown): Record<string, CellEntry> {
  const result: Record<string, CellEntry> = {};
  if (!value || typeof value !== "object") return result;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const entry = raw as CellEntry | null;
    if (!entry || typeof entry !== "object" || !/^(surrender|hard|soft|pairs)\|/.test(key)) continue;
    const base = typeof entry.base === "string" && KEY_ORDER.includes(entry.base) ? entry.base : undefined;
    const dev = entry.dev && typeof entry.dev === "object" && ["H", "S", "D", "P", "R"].includes(entry.dev.play) && Number.isInteger(entry.dev.at) ? { play: entry.dev.play, at: entry.dev.at } : undefined;
    if (base || dev) result[key] = { base, dev };
  }
  return result;
}

export const filledIn = (table: RecallTable, entries: Readonly<Record<string, CellEntry>>) => table.cells.filter((cell) => entries[cell.key]?.base).length;
