"use client";
import type { ReactNode } from "react";
import { ArrowLeftRight, BookOpen, Plus, Upload } from "lucide-react";
import { Button, Callout, Card, CardTitle, EmptyState, ProgressBar, Skeleton, cx } from "@/components/ui";
import type { BankrollHealth, JournalAggregate, JournalCumulativePoint } from "@/lib/blackjack/journalAnalysis";
import { hoursLabel, money, percent, plural, shortDate, signedMoney } from "@/lib/blackjack/journalFormat";
import { toneClass, unitMoney } from "./model";
import { Disclosure, Figure, KeyValueList, Verdict } from "./parts";
import { ResultsChart } from "./ResultsChart";

const tone = (value: number) => value > 0 ? "pos" as const : value < 0 ? "neg" as const : undefined;

const longRunSentence = (progress: number | null) => progress === null
  ? "These sessions had no positive expectation, so there is no long run to reach."
  : progress >= 1
    ? "Past the long run: your edge now outweighs one standard deviation of swing, so results reflect how you play."
    : `${percent(progress, 0)} of the way. Until then swings outweigh your edge, so a losing stretch says little about how well you play.`;

/**
 * Whether results reflect the game or a swing: actual against expected for
 * the filtered sessions, the trend, and how far into the long run all the
 * hours played go.
 */
export function ResultsCard({ scopeLabel, aggregate, lifetime, points, filtered, onClearFilters, onLog }: {
  /** "All time · Main", shown under the title. */
  scopeLabel: string;
  aggregate: JournalAggregate;
  lifetime: JournalAggregate;
  points: JournalCumulativePoint[];
  /** True when the date or venue filter narrows the sessions. */
  filtered: boolean;
  onClearFilters: () => void;
  onLog: () => void;
}) {
  const hasLifetime = lifetime.sessionCount > 0;
  const longRun = lifetime.nZeroHours !== null && lifetime.longRunProgress !== null ? { hours: lifetime.nZeroHours, progress: lifetime.longRunProgress } : null;
  let body: ReactNode;
  if (!hasLifetime) {
    body = <EmptyState className="py-8" title="No results yet" action={<Button variant="secondary" icon={<Plus size={17} aria-hidden />} onClick={onLog}>Log session</Button>}>Log a session to compare your results with what the game should pay.</EmptyState>;
  } else if (aggregate.sessionCount === 0) {
    body = (
      <EmptyState className="py-8" title="No sessions match these filters" action={<Button variant="secondary" onClick={onClearFilters}>Clear filters</Button>}>
        All time: {signedMoney(lifetime.totalActual)} over {hoursLabel(lifetime.totalHours)} ({plural(lifetime.sessionCount, "session")}).
      </EmptyState>
    );
  } else {
    body = (
      <div className="grid grid-cols-1 gap-5">
        <div className="grid grid-cols-2 gap-4">
          <Figure label="Your result" value={signedMoney(aggregate.totalActual)} tone={tone(aggregate.totalActual)} sub={`${plural(aggregate.sessionCount, "session")}`} size="lg" />
          <Figure label="Expected (EV)" value={signedMoney(aggregate.totalTheoretical)} sub={`Range ${signedMoney(aggregate.ci95[0])} to ${signedMoney(aggregate.ci95[1])}`} size="lg" />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Verdict assessment={aggregate.assessment} />
          <span className="text-sm text-ink-2">{aggregate.resultPercentile === null ? "No swing to measure yet." : `Better than ${Math.round(aggregate.resultPercentile * 100)}% of outcomes for these games.`}</span>
        </div>
        <div className="grid grid-cols-3 gap-3 rounded-xl bg-surface-2 p-3">
          <Figure label="Hours" value={hoursLabel(aggregate.totalHours)} />
          <Figure label="Per hour" value={signedMoney(aggregate.actualPerHour)} tone={tone(aggregate.actualPerHour)} sub={`EV ${signedMoney(aggregate.theoreticalPerHour)}`} />
          <Figure label="Winning" value={percent(aggregate.winRate, 0)} sub="of sessions" />
        </div>
        {points.length >= 2
          ? <ResultsChart points={points} label={`Cumulative result ${signedMoney(aggregate.totalActual)} against expected ${signedMoney(aggregate.totalTheoretical)}; 95% range ${signedMoney(aggregate.ci95[0])} to ${signedMoney(aggregate.ci95[1])}.`} />
          : <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-2">Log a second session to see the trend against EV.</p>}
        {filtered && <p className="text-sm text-ink-2">All time: <span className={cx("tnum font-semibold", toneClass(lifetime.totalActual))}>{signedMoney(lifetime.totalActual)}</span> over {hoursLabel(lifetime.totalHours)} ({plural(lifetime.sessionCount, "session")}).</p>}
      </div>
    );
  }

  return (
    <Card as="section" aria-labelledby="journal-results-title" className="min-w-0">
      <CardTitle sub={scopeLabel}><span id="journal-results-title">Results vs expected</span></CardTitle>
      {body}
      {hasLifetime && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">Progress to the long run</span>
            {longRun && <span className="tnum text-xs text-ink-3">{hoursLabel(lifetime.totalHours)} of {hoursLabel(longRun.hours)} · all time</span>}
          </div>
          {longRun && <ProgressBar className="mt-2" label="Progress to the long run" value={Math.min(1, longRun.progress)} tone={longRun.progress >= 1 ? "pos" : "brand"} />}
          <p className="mt-2 text-xs leading-5 text-ink-2">The long run is the hours it takes for expected profit to outgrow one standard deviation of swing. {longRunSentence(longRun?.progress ?? null)}</p>
        </div>
      )}
      {aggregate.sessionCount > 0 && (
        <Disclosure className="mt-3 border-t border-line pt-2" summary="More statistics">
          <div className="grid grid-cols-1 gap-5 pb-1">
            <KeyValueList title="Volume" items={[
              { label: "Total wagered", value: money(aggregate.totalAction), sub: aggregate.totalAction > 0 ? `${percent(aggregate.totalActual / aggregate.totalAction, 2)} of it won` : undefined },
              { label: "Swing (1 SD)", value: `±${money(aggregate.combinedStandardDeviation)}`, sub: aggregate.combinedZ === null ? "No variance yet" : `z = ${aggregate.combinedZ.toFixed(2).replace("-", "−")}` },
            ]} />
            <KeyValueList title="Swings" items={[
              { label: "Largest drawdown", value: money(aggregate.maxDrawdown), sub: aggregate.currentDrawdown > 0 ? `${money(aggregate.currentDrawdown)} below the peak now` : "At a new peak" },
              { label: "Streaks", value: `${aggregate.longestWinStreak} won · ${aggregate.longestLossStreak} lost`, sub: "Longest in a row" },
              { label: "Best session", value: aggregate.bestSession ? signedMoney(aggregate.bestSession.netResult) : "—", sub: aggregate.bestSession ? shortDate(aggregate.bestSession.date) : undefined },
              { label: "Worst session", value: aggregate.worstSession ? signedMoney(aggregate.worstSession.netResult) : "—", sub: aggregate.worstSession ? shortDate(aggregate.worstSession.date) : undefined },
            ]} />
            <KeyValueList title="Other" items={[
              { label: "Expenses", value: money(aggregate.totalExpenses), sub: `${signedMoney(aggregate.netAfterExpenses)} after expenses` },
              { label: "Long run for these sessions", value: aggregate.nZeroHours === null ? "n/a" : hoursLabel(aggregate.nZeroHours), sub: aggregate.nZeroHours === null ? "Needs a positive expectation" : undefined },
            ]} />
            <p className="text-xs leading-5 text-ink-3">Expected results and swings come from CountLab&apos;s audited true-count model for the rules, spread and pace you logged. They are never fitted to your results.</p>
          </div>
        </Disclosure>
      )}
    </Card>
  );
}

/** The largest unit a table would take within the risk: whole $5 chips from $5 up, whole dollars below. */
export const tableUnit = (unit: number) => (unit >= 5 ? Math.floor(unit / 5) * 5 : Math.floor(unit));

/**
 * What to do about a unit that is too big, in amounts that can be acted on: a unit a table takes,
 * or the deposit that makes the current unit safe. The safe unit grows in step with the bankroll,
 * so the bankroll the current unit needs is the bankroll times the overbet ratio.
 */
export function overbetAdvice(health: { bettingUnit: number; unitRatio: number; recommendedUnit: number; targetRisk: number }, bankroll: number) {
  const risk = percent(health.targetRisk, 0);
  const needed = bankroll * health.unitRatio;
  const smaller = tableUnit(health.recommendedUnit);
  const drop = smaller >= 1 ? `bet a ${money(smaller)} unit` : "lower the top bet";
  return `Your ${unitMoney(health.bettingUnit)} unit is ${health.unitRatio.toFixed(1)}× what this bankroll supports at ${risk} risk of ruin. Either ${drop}, or add ${money(Math.ceil(needed - bankroll))} so the bankroll reaches the ${money(Math.ceil(needed))} a ${unitMoney(health.bettingUnit)} unit needs.`;
}

/**
 * How much money there is and whether the unit still suits it. Priced on the
 * game from the latest session, over the bankroll's whole history.
 */
export function BankrollHealthCard({ scopeName, bankroll, results, cash, sessionCount, health, onCash, onStartingBankroll }: {
  scopeName: string;
  bankroll: number;
  results: number;
  cash: { deposits: number; withdrawals: number };
  sessionCount: number;
  health: BankrollHealth | null;
  onCash: () => void;
  onStartingBankroll: () => void;
}) {
  const unit = health?.bettingUnit;
  const breakdown = [
    sessionCount > 0 ? `Results ${signedMoney(results)}` : null,
    cash.deposits > 0 ? `Deposits ${money(cash.deposits)}` : null,
    cash.withdrawals > 0 ? `Withdrawals ${money(cash.withdrawals)}` : null,
  ].filter(Boolean).join(" · ");
  // Risk of ruin priced on session results alone is not a real bankroll.
  const provisional = sessionCount > 0 && cash.deposits === 0;
  const overbet = health?.unitRatio != null && health.unitRatio > 1;
  const verdict = health === null ? null
    : health.unitRatio === null ? "This game has no positive expectation, so no unit size makes it safe."
    : overbet ? overbetAdvice({ ...health, unitRatio: health.unitRatio }, bankroll)
    : `Your ${unitMoney(health.bettingUnit)} unit is within what this bankroll supports. ${unitMoney(health.recommendedUnit)} would be the full ${percent(health.targetRisk, 0)}-risk size.`;

  let body: ReactNode;
  if (sessionCount === 0) {
    body = <p className="text-sm leading-6 text-ink-2">Log a session to check your risk of ruin with this bankroll.</p>;
  } else if (provisional) {
    body = (
      <Callout tone="warn" title="No starting bankroll recorded" action={<Button size="sm" variant="secondary" icon={<Plus size={16} aria-hidden />} onClick={onStartingBankroll}>Record starting bankroll</Button>}>
        This bankroll is only your session results ({signedMoney(results)}).{verdict ? ` ${verdict}` : ""} Record what you set aside for play to get a real risk of ruin.
      </Callout>
    );
  } else if (!health) {
    body = (
      <Callout tone="warn" action={<Button size="sm" variant="secondary" icon={<ArrowLeftRight size={16} aria-hidden />} onClick={onCash}>Deposit or withdrawal</Button>}>
        The bankroll is $0 or less. Record a deposit to check risk of ruin.
      </Callout>
    );
  } else {
    body = <Callout tone={overbet || health.unitRatio === null ? "warn" : "pos"}>{verdict}</Callout>;
  }

  return (
    <Card as="section" aria-labelledby="journal-health-title" className="min-w-0">
      <CardTitle sub={scopeName}><span id="journal-health-title">Bankroll health</span></CardTitle>
      <div className="grid grid-cols-1 gap-4">
        <div>
          <p className="text-xs font-medium text-ink-3">Current bankroll</p>
          <p className={cx("tnum mt-1 text-3xl font-semibold tracking-tight", bankroll < 0 ? "text-neg" : "text-ink")}>{money(bankroll)}</p>
          <p className="mt-1 text-xs leading-5 text-ink-3">
            {breakdown || "Nothing recorded yet"}
            {unit ? <><br />{Math.max(0, Math.floor(bankroll / Math.max(0.01, unit))).toLocaleString("en-US")} units of {unitMoney(unit)}</> : null}
          </p>
        </div>
        {health && (
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface-2 p-3 xs:grid-cols-3">
            <Figure label="Risk of ruin" value={percent(health.riskOfRuin, 1)} tone={health.riskOfRuin > health.targetRisk ? "neg" : "pos"} sub={`Target ${percent(health.targetRisk, 0)}`} />
            <Figure label="Safe unit" value={health.recommendedUnit > 0 && Number.isFinite(health.recommendedUnit) ? unitMoney(health.recommendedUnit) : "—"} sub={health.unitRatio === null ? "No edge" : `You bet ${unitMoney(health.bettingUnit)}`} />
            <Figure label="EV per hour" value={signedMoney(health.hourlyEv)} tone={tone(health.hourlyEv)} sub="At your unit" className="col-span-2 xs:col-span-1" />
          </div>
        )}
        {body}
        {health && <p className="text-xs leading-5 text-ink-3">Risk of ruin is the chance of losing this whole bankroll playing on at this unit. It uses the game from your latest session ({shortDate(health.referenceDate)}) and is not affected by the date or venue filters.</p>}
      </div>
    </Card>
  );
}

/** The journal before anything is in it: what it is for, in two lines, and the one thing to do. */
export function JournalEmpty({ onLog, onStartingBankroll, onImport }: { onLog: () => void; onStartingBankroll: () => void; onImport: () => void }) {
  return (
    <div className="grid grid-cols-1 gap-4">
      <EmptyState
        icon={<BookOpen size={22} aria-hidden />}
        title="Log your casino sessions"
        action={<Button size="lg" icon={<Plus size={18} aria-hidden />} onClick={onLog}>Log session</Button>}
      >
        After you play, record the hours and what you won or lost. The journal compares it with what your game should pay and keeps your bankroll honest.
      </EmptyState>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="ghost" size="sm" className="h-11" icon={<ArrowLeftRight size={16} aria-hidden />} onClick={onStartingBankroll}>Record a starting bankroll</Button>
        <Button variant="ghost" size="sm" className="h-11" icon={<Upload size={16} aria-hidden />} onClick={onImport}>Import a backup</Button>
      </div>
    </div>
  );
}

/** Stands in for the overview until the journal has been read, so it never flashes "$0". */
export function OverviewSkeleton({ message }: { message?: string }) {
  return (
    <div aria-busy="true" className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <Card className="grid grid-cols-1 gap-3"><Skeleton className="h-6 w-44" /><Skeleton className="h-16" /><Skeleton className="h-52" /></Card>
      <Card className="grid grid-cols-1 content-start gap-3"><Skeleton className="h-6 w-36" /><Skeleton className="h-12 w-40" /><Skeleton className="h-20" /></Card>
      <p role="status" className="text-sm text-ink-2 lg:col-span-2">{message ?? "Loading your journal…"}</p>
    </div>
  );
}
