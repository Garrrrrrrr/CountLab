import { CHART_DEALERS, type ChartSection, type ChartSectionId } from "./bjaH17Chart";
import { gradeChart, parseEntry, type ChartGrade } from "./chartEntry";
import { chartSections, type ChartSurrenderRule } from "./es10Chart";
import type { SurrenderRule } from "../statistics/storage";

/**
 * The H17 chart drill's scope and grading, around the unchanged entry grammar
 * in `chartEntry.ts`.
 */

export type SectionChoice = "all" | ChartSectionId;

/** A table without surrender still fills in the late-surrender table, as the printed chart does. */
export const chartTableFor = (surrender: SurrenderRule): ChartSurrenderRule => (surrender === "early" ? "early10" : "late");

export const sectionsFor = (choice: SectionChoice, table: ChartSurrenderRule): readonly ChartSection[] => {
  const all = chartSections(table);
  return choice === "all" ? all : all.filter((section) => section.id === choice);
};

/** Cell keys in printed order. */
export const cellKeysOf = (sections: readonly ChartSection[]) =>
  sections.flatMap((section) => section.rows.flatMap((row) => CHART_DEALERS.map((dealer) => `${section.id}:${row}v${dealer}`)));

/** The cells the chart prints as a count (`4+`, `-1-`): the chart's red cells. */
export const indexCellKeys = (sections: readonly ChartSection[]) =>
  sections.flatMap((section) => [...section.cells].filter(([, token]) => token.kind === "index").map(([key]) => key));

/**
 * The grade for the cells in play. `only` narrows it to a subset (index cells,
 * or the wrong cells of a retry); the other cells are shown filled in and are
 * neither asked nor counted. The best run follows printed order within the
 * subset.
 */
export function gradeScope(sections: readonly ChartSection[], entries: Record<string, string>, only?: ReadonlySet<string>): ChartGrade {
  const full = gradeChart(sections, entries);
  if (!only) return full;
  const cells = full.cells.filter((cell) => only.has(cell.key));
  const bySection: ChartGrade["bySection"] = {};
  let streak = 0, bestStreak = 0;
  for (const cell of cells) {
    bySection[cell.sectionLabel] ??= { correct: 0, total: 0 };
    bySection[cell.sectionLabel].total += 1;
    if (cell.correct) {
      bySection[cell.sectionLabel].correct += 1;
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    } else streak = 0;
  }
  const answered = cells.filter((cell) => cell.answered).length;
  const correct = cells.filter((cell) => cell.correct).length;
  return { cells, total: cells.length, answered, correct, wrong: answered - correct, skipped: cells.length - answered, bestStreak, bySection };
}

/** Live checking counts only cells whose entry is a finished answer, so a half-typed `4` is neither. */
export function settledCounts(grade: ChartGrade, entries: Record<string, string>) {
  let right = 0, wrong = 0;
  for (const cell of grade.cells) {
    if (parseEntry(cell.section, entries[cell.key] ?? "") === null) continue;
    if (cell.correct) right += 1;
    else wrong += 1;
  }
  return { right, wrong };
}

/** Entries typed into the surrender table, which the late and early tables share keys for. */
export const surrenderEntryKeys = (entries: Record<string, string>) =>
  Object.keys(entries).filter((key) => key.startsWith("surrender:") && entries[key]);

export const withoutKeys = (entries: Record<string, string>, keys: readonly string[]) => {
  const next = { ...entries };
  for (const key of keys) delete next[key];
  return next;
};

/** Accessible description of a cell's state once it is checked. */
export function cellStatus(cell: { answered: boolean; correct: boolean; expected: string }): string {
  if (cell.correct) return "Correct";
  return cell.answered ? `Wrong, the chart says ${cell.expected}` : `Blank, the chart says ${cell.expected}`;
}
