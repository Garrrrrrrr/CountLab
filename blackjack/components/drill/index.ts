/**
 * The drill kit: one structure for every training drill.
 *
 *   <DrillFrame phase="setup">   PageHeader + <SetupCard> (choices + the one Start)
 *   <DrillFrame phase="play">    compact title + <DrillHud> + <DrillStage> + answer
 *                                entry + <FeedbackPanel> after each answer
 *   <DrillSummary>               score, tiles, weakest areas, misses, next drill
 *
 * Rules the pieces rely on:
 * - Exactly one visible Button with the Enter action per phase (Start, then
 *   Submit/Continue, then Go again). Everything else is a GhostButton or a
 *   Button with enterAction={false}.
 * - Speak verdicts and new prompts with announce() from components/ui; do not
 *   add live regions.
 * - Answer entry differs by drill (number fields with a keypad for counting,
 *   action buttons for strategy) and lives with each drill.
 */
export { DrillFrame, DrillHud, DrillStage, type DrillPhase, type HudStat } from "./frame";
export { SetupCard, ChoiceCards, KeyLegend, type ChoiceOption } from "./setup";
export { FeedbackPanel, ResumeBanner } from "./feedback";
export { DrillSummary, NEXT_DRILL, type SummaryTile } from "./summary";
export { formatClock, useDrillKeys, useDrillSetupPref } from "./hooks";
