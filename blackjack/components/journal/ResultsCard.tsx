"use client";
import type { JournalAggregate, JournalCumulativePoint } from "@/lib/blackjack/journalAnalysis";
import { hoursLabel, money, percent, plural, shortDate, signedMoney } from "@/lib/blackjack/journalFormat";
import { PERIODS, periodPhrase, periodTitle, type Period } from "@/lib/blackjack/journalView";
import { Disclosure, EmptyState, GhostButton, HelpTip, Panel, ProgressMeter, SegmentedControl, Select, StatTile } from "../ui";
import { KeyValueList, VerdictBadge, toneOf } from "./parts";
import { ResultsChart } from "./ResultsChart";

const longRunSentence = (longRun: { progress: number } | null) => !longRun
  ? "No long run: these sessions had no positive expectation."
  : longRun.progress >= 1
    ? "Past the long run: your edge now outweighs one standard deviation, so your results reflect how you play."
    : `At ${percent(longRun.progress, 0)} of the long run, swings still outweigh your edge — a losing stretch says little about how well you play.`;

const RANGE_HELP = "95% of outcomes for the sessions you logged fall in this range, modeled from their rules, spread and hours. It's a range of results, not a confidence interval for your average.";

/**
 * Whether results so far reflect the game or a swing: actual against
 * expected over the chosen period, the modeled range, the trend, and how far
 * into the long run all the hours played go.
 */
export function ResultsCard({ period, onPeriod, aggregate, lifetime, points, onLog }: {
  period: Period;
  onPeriod: (period: Period) => void;
  aggregate: JournalAggregate;
  lifetime: JournalAggregate;
  points: JournalCumulativePoint[];
  onLog: () => void;
}) {
  const periodControl = (
    <>
      <SegmentedControl<string>
        label="Period"
        hideLabel
        size="compact"
        className="hidden min-[370px]:grid"
        name="journal-period"
        analyticsField="period"
        value={String(period)}
        onChange={(value) => onPeriod(value === "all" ? "all" : (Number(value) as Period))}
        options={PERIODS.map((option) => ({ value: String(option.value), label: option.label }))}
      />
      <div className="w-full min-[370px]:hidden">
        <Select label="Period" data-analytics-field="period" value={String(period)} onChange={(event) => onPeriod(event.target.value === "all" ? "all" : (Number(event.target.value) as Period))}>
          {PERIODS.map((option) => <option key={option.value} value={String(option.value)}>{option.label}</option>)}
        </Select>
      </div>
    </>
  );
  const hasLifetime = lifetime.sessionCount > 0;
  const longRun = lifetime.nZeroHours !== null && lifetime.longRunProgress !== null ? { hours: lifetime.nZeroHours, progress: lifetime.longRunProgress } : null;

  return (
    <Panel aria-labelledby="journal-results-title" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="journal-results-title" className="text-lg font-semibold">Results vs expected</h2>
        {hasLifetime && periodControl}
      </div>
      {!hasLifetime ? (
        <EmptyState icon="fa-chart-line" title="No results yet" description="Log a session to compare your results with what the game should pay." action={<GhostButton onClick={onLog}>Log your first session</GhostButton>} className="py-8" />
      ) : aggregate.sessionCount === 0 ? (
        <EmptyState icon="fa-calendar-xmark" title={`No sessions in ${periodPhrase(period)}.`} description={`All time: ${signedMoney(lifetime.totalActual)} over ${hoursLabel(lifetime.totalHours)} (${plural(lifetime.sessionCount, "session")}).`} action={<GhostButton onClick={() => onPeriod("all")}>Show all time</GhostButton>} className="py-8" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatTile
              size="lg"
              label={`Result · ${periodTitle(period)}`}
              value={signedMoney(aggregate.totalActual)}
              tone={toneOf(aggregate.totalActual)}
              sub={`${hoursLabel(aggregate.totalHours)} · ${plural(aggregate.sessionCount, "session")}`}
              help="What you won or lost at the tables in this period, before expenses."
            />
            <StatTile
              size="lg"
              label="Expected (EV)"
              value={signedMoney(aggregate.totalTheoretical)}
              sub={`95% modeled outcome range ${signedMoney(aggregate.ci95[0])} to ${signedMoney(aggregate.ci95[1])}`}
              help={<>Expected value: what the rules, spread and hours you logged pay on average, from CountLab&apos;s audited simulation. {RANGE_HELP}</>}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <VerdictBadge assessment={aggregate.assessment} />
            <span className="text-sm text-[var(--ink-muted)]">
              {aggregate.resultPercentile === null ? "No swing to measure yet" : `Better than ${Math.round(aggregate.resultPercentile * 100)}% of modeled outcomes`}
            </span>
            <HelpTip label="how results are judged">Within 1 standard deviation of expected is within the expected range; 1–2 is better or worse than expected; beyond 2 is a statistical outlier.</HelpTip>
          </div>
          {period !== "all" && <p className="text-sm text-[var(--ink-muted)]">All time: <span className="font-data">{signedMoney(lifetime.totalActual)}</span> over {hoursLabel(lifetime.totalHours)} ({plural(lifetime.sessionCount, "session")})</p>}
          {points.length >= 2
            ? <ResultsChart points={points} label={`Cumulative result ${signedMoney(aggregate.totalActual)} against expected ${signedMoney(aggregate.totalTheoretical)}; 95% modeled outcome range ${signedMoney(aggregate.ci95[0])} to ${signedMoney(aggregate.ci95[1])}.`} />
            : <p className="rounded-xl border border-dashed border-[var(--rule)] px-4 py-6 text-center text-sm text-[var(--ink-muted)]">Log at least two sessions to see a trend line.</p>}
        </>
      )}
      {hasLifetime && (
        <div className="rounded-xl border border-[var(--rule)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1 font-medium">Progress to the long run<HelpTip label="the long run (N₀)">The hours it takes for your expected profit to outgrow one standard deviation of swing. Past it, results start to reflect how you play more than luck. Counted over all your hours, whatever the period.</HelpTip></span>
            {longRun && <span className="font-data text-xs text-[var(--ink-muted)]">{hoursLabel(lifetime.totalHours)} of {hoursLabel(longRun.hours)} · all time</span>}
          </div>
          {longRun && <ProgressMeter className="mt-2" label="Progress to the long run" value={Math.min(1, longRun.progress)} valueText={`${hoursLabel(lifetime.totalHours)} of ${hoursLabel(longRun.hours)} (${percent(Math.min(1, longRun.progress), 0)})`} tone={longRun.progress >= 1 ? "good" : "info"} />}
          <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">{longRunSentence(longRun)}</p>
        </div>
      )}
      {aggregate.sessionCount > 0 && (
        <Disclosure summary="More statistics" analyticsSection="more_statistics">
          <div className="grid gap-5 pt-2">
            <KeyValueList title="Volume" columns={2} items={[
              { label: "Hours played", value: hoursLabel(aggregate.totalHours) },
              { label: "Sessions", value: aggregate.sessionCount.toLocaleString("en-US") },
              { label: "Total amount wagered", value: money(aggregate.totalAction), sub: aggregate.totalAction > 0 ? `${percent(aggregate.totalActual / aggregate.totalAction, 2)} of wagers won` : undefined, help: "Every dollar put at risk across all rounds, which is what a casino rates you on." },
              { label: "Actual per hour", value: signedMoney(aggregate.actualPerHour), sub: `Expected ${signedMoney(aggregate.theoreticalPerHour)}` },
            ]} />
            <KeyValueList title="Swings" columns={2} items={[
              { label: "Swing (1 SD)", value: `±${money(aggregate.combinedStandardDeviation)}`, sub: aggregate.combinedZ === null ? "No variance to measure yet" : `z = ${aggregate.combinedZ.toFixed(2)}`, help: "One standard deviation: about two in three periods like this land within this distance of expected. z is how many of them your result is away." },
              { label: "Max drawdown", value: money(aggregate.maxDrawdown), sub: aggregate.currentDrawdown > 0 ? `${money(aggregate.currentDrawdown)} below the peak now` : "At a new peak" },
              { label: "Best session", value: aggregate.bestSession ? signedMoney(aggregate.bestSession.netResult) : "—", sub: aggregate.bestSession ? shortDate(aggregate.bestSession.date) : undefined },
              { label: "Worst session", value: aggregate.worstSession ? signedMoney(aggregate.worstSession.netResult) : "—", sub: aggregate.worstSession ? shortDate(aggregate.worstSession.date) : undefined },
            ]} />
            <KeyValueList title="Habits" columns={2} items={[
              { label: "Winning sessions", value: percent(aggregate.winRate, 0), sub: `Longest: ${aggregate.longestWinStreak} won / ${aggregate.longestLossStreak} lost in a row` },
              { label: "Expenses", value: money(aggregate.totalExpenses), sub: `${signedMoney(aggregate.netAfterExpenses)} after expenses` },
              { label: "Long run (N₀) for this period", value: aggregate.nZeroHours === null ? "n/a" : hoursLabel(aggregate.nZeroHours), sub: aggregate.nZeroHours === null ? "Needs a positive expectation" : undefined },
            ]} />
          </div>
        </Disclosure>
      )}
    </Panel>
  );
}
