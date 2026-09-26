"use client";
import type { ReactNode } from "react";
import { ChoiceCards, SetupCard, type ChoiceOption } from "@/components/drill";
import { Disclosure, GhostButton, SegmentedControl } from "@/components/ui";
import { CHART_SURRENDER_LABEL, chartSections, type ChartSurrenderRule } from "@/lib/blackjack/es10Chart";
import { cellKeysOf, indexCellKeys, type SectionChoice } from "@/lib/blackjack/chartDrill";
import type { Settings } from "@/lib/statistics/storage";
import { RulesLine, SurrenderPicker } from "../parts";
import { HowToEnter } from "./ChartKeys";

export type ChartPick = SectionChoice | "index";
export type ChartFeedback = "live" | "end";

const FEEDBACK_HELP: Record<ChartFeedback, string> = {
  live: "Each cell turns green or red as soon as its answer is complete.",
  end: "Nothing is marked until you grade the chart, like a written test.",
};

/**
 * What to fill in, how it is checked, and which surrender table, before
 * committing to up to 350 cells. Answers already typed are kept: Start says
 * how many and continues them.
 */
export function ChartSetup({ settings, table, pick, onPick, feedback, onFeedback, filled, surrenderLocked, onClearSurrender, notices, firstTime, onStart, onClear, footnote }: {
  settings: Settings;
  table: ChartSurrenderRule;
  pick: ChartPick;
  onPick: (pick: ChartPick) => void;
  feedback: ChartFeedback;
  onFeedback: (feedback: ChartFeedback) => void;
  filled: number;
  /** Surrender answers exist, so the table cannot switch under them. */
  surrenderLocked: boolean;
  onClearSurrender: () => void;
  notices?: ReactNode;
  firstTime: boolean;
  onStart: () => void;
  onClear: () => void;
  footnote?: ReactNode;
}) {
  const sections = chartSections(table);
  const count = (keys: readonly string[]) => `${keys.length} cells`;
  const options: ChoiceOption<ChartPick>[] = [
    { value: "all", title: "Whole chart", description: "Every table, as printed.", meta: count(cellKeysOf(sections)), icon: "fa-table-cells" },
    ...sections.map((section): ChoiceOption<ChartPick> => ({ value: section.id, title: section.label, meta: count(cellKeysOf([section])) })),
    { value: "index", title: "Index cells only", description: "Just the count-dependent cells. The rest are filled in.", meta: count(indexCellKeys(sections)), icon: "fa-bullseye" },
  ];
  return (
    <div className="max-w-3xl">
      <SetupCard
        title="Set up your chart"
        notice={notices}
        startLabel={filled ? `Continue (${filled} filled)` : "Start filling in"}
        onStart={onStart}
        secondaryAction={filled > 0 && <GhostButton onClick={onClear}>Clear chart</GhostButton>}
        footnote={footnote}
      >
        <ChoiceCards legend="What to fill in" name="h17-scope" value={pick} onChange={onPick} options={options} columns={3} />
        <div className="grid gap-2">
          <SegmentedControl
            label="Feedback"
            value={feedback}
            onChange={onFeedback}
            options={[{ value: "live" as const, label: "Check as I go" }, { value: "end" as const, label: "Grade at the end" }]}
            size="compact"
            fullWidth
            analyticsField="h17_feedback"
          />
          <p className="text-xs leading-5 text-[var(--ink-muted)]">{FEEDBACK_HELP[feedback]}</p>
        </div>
        <RulesLine label="Surrender table" summary={CHART_SURRENDER_LABEL[table]}>
          <SurrenderPicker
            value={settings.surrender}
            disabled={surrenderLocked}
            note={surrenderLocked
              ? <span className="flex flex-wrap items-center gap-2">Your surrender answers are for this table, so it stays until you clear them. <GhostButton size="compact" onClick={onClearSurrender}>Clear surrender answers</GhostButton></span>
              : settings.surrender === "none"
                ? "Your table has no surrender. The chart still includes the late-surrender table, as the printed chart does."
                : "Only the surrender table changes; the other tables are the same for both rules."}
          />
        </RulesLine>
        <Disclosure summary="How to enter answers" defaultOpen={firstTime} analyticsSection="h17_how_to">
          <HowToEnter />
        </Disclosure>
      </SetupCard>
    </div>
  );
}
