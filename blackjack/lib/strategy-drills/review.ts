/**
 * "Review due" for the strategy drills: which missed items have come back
 * round (see `reviewDueKeys`), kept to the ones the current table rules still
 * deal, and the questions that ask them again.
 */
import { reviewDueKeys } from "@/lib/statistics/spacedRepetition";
import type { TableRules } from "@/lib/strategy";
import { parsePracticeKey, questionForCell, type BasicQuestion } from "./basic";
import { availableTables, RECALL_TABLE_IDS, recallTables, type RecallLevel, type RecallTableId } from "./chartRecall";
import { buildIndexQuestion, indexPool, type IndexQuestion } from "./indexPlays";
import type { Rng } from "./cards";

/** A review round asks at most this many, oldest first; the rest wait for the next one. */
export const REVIEW_LIMIT = 50;

/** Chart Recall schedules a cell per level: a cell right as a basic play can still be wrong with its index. */
export const chartReviewKey = (level: RecallLevel, cellKey: string) => `${level}/${cellKey}`;

/**
 * The schedule a cell's answer files under. Only basic and all-indices are kept: an I18 + Fab 4 or
 * custom chart files a cell under indices when it asked that cell's index, else under basic.
 */
export const chartReviewLevel = (level: RecallLevel, askedIndex: boolean): "basic" | "indices" =>
  level === "basic" || (level !== "indices" && !askedIndex) ? "basic" : "indices";

export function basicReviewDue(rules: TableRules, now = new Date()): string[] {
  return reviewDueKeys("Basic Strategy", now, undefined, (key) => parsePracticeKey(key, rules) !== null);
}

export function indexReviewDue(rules: TableRules, now = new Date()): string[] {
  const ids = new Set(indexPool(rules, "all").map((entry) => entry.id));
  return reviewDueKeys("Deviations", now, undefined, (key) => ids.has(key));
}

export function chartReviewDue(rules: TableRules, level: RecallLevel | "any" = "any", now = new Date()): string[] {
  const levels: RecallLevel[] = level === "any" ? ["basic", "indices"] : [level];
  const keys = new Set(levels.flatMap((each) => recallTables(rules, each, availableTables(rules)).flatMap((table) => table.cells.map((cell) => chartReviewKey(each, cell.key)))));
  return reviewDueKeys("H17 Chart", now, undefined, (key) => keys.has(key));
}

/** How many items each drill has due, by drill slug, for the Train hub. */
export function reviewDueCounts(rules: TableRules, now = new Date()): Record<"basic-strategy" | "deviations" | "chart-recall", number> {
  return { "basic-strategy": basicReviewDue(rules, now).length, deviations: indexReviewDue(rules, now).length, "chart-recall": chartReviewDue(rules, "any", now).length };
}

export function basicReviewQuestions(keys: readonly string[], rules: TableRules, rng: Rng = Math.random): BasicQuestion[] {
  return keys.slice(0, REVIEW_LIMIT).flatMap((key) => {
    const parsed = parsePracticeKey(key, rules);
    return parsed ? [questionForCell(parsed.cell, parsed.drawn, rng)] : [];
  });
}

/** One question per index, on a random side of its switch point. */
export function indexReviewQuestions(ids: readonly string[], rules: TableRules, rng: Rng = Math.random): IndexQuestion[] {
  const pool = indexPool(rules, "all");
  return ids.slice(0, REVIEW_LIMIT).flatMap((id) => {
    const entry = pool.find((candidate) => candidate.id === id);
    const question = entry && buildIndexQuestion(entry, rng() < 0.5 ? "index" : "basic", rules, rng);
    return question ? [question] : [];
  });
}

/** The tables and cells a review chart asks, for one level. */
export function chartReviewScope(keys: readonly string[], level: RecallLevel): { ids: RecallTableId[]; only: string[] } {
  const only = keys.filter((key) => key.startsWith(`${level}/`)).map((key) => key.slice(level.length + 1));
  const ids = RECALL_TABLE_IDS.filter((id) => only.some((key) => key.startsWith(`${id}|`)));
  return { ids, only };
}
