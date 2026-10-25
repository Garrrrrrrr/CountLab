"use client";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Share2, SlidersHorizontal } from "lucide-react";
import { PlayingCard } from "@/components/blackjack";
import { Badge, Button, Card, ProgressBar, cx, toast } from "@/components/ui";
import { DrillSummary, ScoreDial } from "@/components/drill/DrillKit";
import { GRADING_CATEGORIES, type FullShoeGradingCategory, type FullShoeLiveRound, type FullShoeMode, type FullShoeReport } from "@/lib/blackjack/fullShoeSession";
import { betJumps } from "@/lib/full-shoe/cover";
import type { WongPlan } from "@/lib/full-shoe/grading";
import { WONG_QUESTION, type FullShoeGame } from "@/lib/full-shoe/session";
import { GraderStrip, HistoryTable, RoundReplay } from "./HandReplay";
import { durationLabel, money, signed } from "./format";

export interface ReportData {
  report: FullShoeReport;
  rounds: FullShoeLiveRound[];
  mode: FullShoeMode;
  completionReason: "shoe-complete" | "ended";
  rulesLine: string;
  date: string;
  startingBankroll?: number;
  endMessage?: string;
  saved?: boolean;
  /** The table minimum, for the cover note. */
  unit?: number;
  /** Live shoes only: saved shoes keep neither. */
  pace?: ReturnType<FullShoeGame["pace"]>;
  wong?: WongPlan;
}

const CATEGORY_TITLE: Record<FullShoeGradingCategory, string> = { Betting: "Betting", "Basic Strategy": "Basic strategy", Deviations: "Index plays", "Running count": "Running count", "True count": "True count" };
const CATEGORY_NOTE: Record<FullShoeGradingCategory, string> = {
  Betting: "Each bet against your ramp",
  "Basic Strategy": "Plays the count does not change",
  Deviations: "Insurance and plays the count changes",
  "Running count": "Count checks between rounds",
  "True count": "Decks left and the division",
};
const PRACTICE: Partial<Record<FullShoeGradingCategory, { href: string; label: string }>> = {
  "Basic Strategy": { href: "/train/basic-strategy", label: "Practise basic strategy" },
  Deviations: { href: "/train/deviations", label: "Practise index plays" },
  "Running count": { href: "/train/running-count", label: "Practise the running count" },
  "True count": { href: "/train/true-count", label: "Practise the true count" },
  Betting: { href: "/train/true-count", label: "Practise the true count" },
};

/** Target for a shoe that says you are ready for a real table (the Progress page uses the same 95%). */
export const READY_AT = 95;

const count = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

function categories(report: FullShoeReport) {
  return GRADING_CATEGORIES.map((category) => ({ category, stat: report.categories[category] })).filter((entry): entry is { category: FullShoeGradingCategory; stat: NonNullable<typeof entry.stat> } => Boolean(entry.stat && entry.stat.total > 0));
}

function shareText(data: ReportData) {
  const lines = [
    `CountLab Full Shoe · ${data.mode === "checkout" ? "Checkout" : "Coached"}`,
    `${data.report.accuracy}% overall · ${data.report.handsPlayed} rounds · ${data.rulesLine}`,
    categories(data.report).map(({ category, stat }) => `${CATEGORY_TITLE[category]} ${stat.accuracy}% (${stat.correct}/${stat.total})`).join(" · "),
    `Net ${money(data.report.netResult, { sign: true })}`,
  ];
  return lines.join("\n");
}

async function share(data: ReportData) {
  const text = shareText(data);
  try {
    if (navigator.share) { await navigator.share({ title: "CountLab Full Shoe", text }); return; }
    await navigator.clipboard.writeText(text);
    toast("Result copied", "pos");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return;
    toast("Could not share the result", "neg");
  }
}

/** The exam card: the one thing worth a screenshot. */
function Scorecard({ data, actions }: { data: ReportData; actions?: ReactNode }) {
  const ready = data.report.accuracy >= READY_AT && data.report.decisions > 0;
  const rows = categories(data.report);
  const pace = data.pace;
  return (
    <Card className="space-y-4" data-testid="scorecard">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="eyebrow">{data.mode === "checkout" ? "Checkout" : "Coached shoe"} · {new Date(data.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</p>
          <p className="mt-1 text-sm text-ink-2">{data.rulesLine}</p>
        </div>
        {data.report.decisions > 0 && <Badge tone={ready ? "pos" : "warn"}>{ready ? "Table ready" : `Below the ${READY_AT}% target`}</Badge>}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map(({ category, stat }) => (
          <li key={category} className="rounded-xl bg-surface-2 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">{CATEGORY_TITLE[category]}</span>
              <span className={cx("tnum text-lg font-semibold", stat.accuracy >= READY_AT ? "text-pos" : stat.accuracy >= 70 ? "text-ink" : "text-neg")}>{stat.accuracy}%</span>
            </div>
            <ProgressBar value={stat.correct} max={stat.total} label={`${CATEGORY_TITLE[category]} accuracy`} tone={stat.accuracy >= READY_AT ? "pos" : stat.accuracy >= 70 ? "brand" : "neg"} className="mt-1.5" />
            <p className="tnum mt-1.5 text-xs text-ink-3">{stat.correct} of {stat.total} · {CATEGORY_NOTE[category]}</p>
          </li>
        ))}
      </ul>
      {data.startingBankroll !== undefined && (
        <p className="tnum text-sm text-ink-2">
          Bankroll {money(data.startingBankroll)} → <span className="font-semibold text-ink">{money(data.startingBankroll + data.report.netResult)}</span>{" "}
          (<span className={data.report.netResult >= 0 ? "text-pos" : "text-neg"}>{money(data.report.netResult, { sign: true })}</span>) over {count(data.report.handsPlayed, "round")}.
        </p>
      )}
      {pace?.secondsPerDecision !== undefined && (
        <p className="tnum text-sm text-ink-2" data-testid="pace">
          Pace: <span className="font-semibold text-ink">{pace.secondsPerDecision.toFixed(1)} s</span> a decision
          {pace.handsPerHour !== undefined && <>, <span className="font-semibold text-ink">{Math.round(pace.handsPerHour)}</span> hands an hour</>}
          {pace.limit ? <> · {pace.limit} s limit, <span className={pace.timedOut ? "font-semibold text-neg" : undefined}>{pace.timedOut} timed out</span></> : null}.
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" icon={<Share2 size={17} aria-hidden />} onClick={() => void share(data)}>Share result</Button>
        {actions}
      </div>
    </Card>
  );
}

function Mistakes({ rounds, onReplay }: { rounds: FullShoeLiveRound[]; onReplay: (index: number) => void }) {
  const [all, setAll] = useState(false);
  const missed = rounds.flatMap((round, index) => round.decisions.filter((decision) => !decision.ok).map((decision) => ({ decision, index, round: round.round })));
  if (!missed.length) {
    const graded = rounds.some((round) => round.decisions.length > 0);
    return <Card><h2 className="text-base font-semibold">Mistakes</h2><p className="mt-1 text-sm text-ink-2">{graded ? "None. Every graded decision in this shoe was right." : rounds.length ? "Nothing was graded in this shoe." : "Nothing was graded: no round was played to the end."}</p></Card>;
  }
  const shown = all ? missed : missed.slice(0, 6);
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">Mistakes</h2>
        <span className="text-sm text-ink-3">{missed.length}</span>
      </div>
      <ol className="mt-3 space-y-3">
        {shown.map(({ decision, index, round }, i) => (
          <li key={i} className="rounded-2xl border border-line p-3">
            <div className="flex items-start gap-3">
              {decision.cards && (
                <div className="flex shrink-0 items-center gap-1" aria-label="The hand">
                  <div className="flex">{decision.cards.map((card, c) => <PlayingCard key={c} card={card} size="xs" style={c ? { marginLeft: -18 } : undefined} />)}</div>
                  {decision.upcard && <><span className="px-0.5 text-xs text-ink-3">v</span><PlayingCard card={decision.upcard} size="xs" /></>}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{decision.question ?? `Round ${round}`}</p>
                <p className="tnum mt-0.5 text-sm">
                  You: <span className="font-semibold text-neg">{decision.chosen}</span> · Right: <span className="font-semibold text-pos">{decision.correct}</span> · <span className="text-ink-3">TC {signed(decision.trueCount)}</span>
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-ink-2">{decision.explanation}</p>
            <button type="button" onClick={() => onReplay(index)} className="mt-1 inline-flex h-11 items-center gap-1 text-sm font-semibold text-brand-text">
              Replay round {round} <ChevronRight size={15} aria-hidden />
            </button>
          </li>
        ))}
      </ol>
      {missed.length > shown.length && <Button variant="ghost" block className="mt-2" onClick={() => setAll(true)}>Show all {missed.length} mistakes</Button>}
    </Card>
  );
}

/** Back-counting: every sit-in and leave, against the plan. Shown when the shoe was back-counted. */
function BackCounting({ rounds, plan }: { rounds: FullShoeLiveRound[]; plan?: WongPlan }) {
  const moves = rounds.flatMap((round) => round.decisions.filter((decision) => decision.question?.startsWith(WONG_QUESTION)).map((decision) => ({ decision, round: round.round })));
  if (!plan && !moves.length) return null;
  const watched = rounds.filter((round) => round.bet === 0).length;
  return (
    <Card data-testid="back-counting">
      <h2 className="text-base font-semibold">Back-counting</h2>
      <p className="mt-1 text-sm leading-6 text-ink-2">
        {plan && <>Sit in at {signed(plan.enter)} or higher, leave at {signed(plan.leave)} or lower. </>}
        You watched {watched} of {count(rounds.length, "round")}. {moves.length ? `${moves.filter(({ decision }) => decision.ok).length} of ${count(moves.length, "move")} right.` : "No move was due."}
      </p>
      {moves.length > 0 && (
        <ul className="mt-2 divide-y divide-line text-sm">
          {moves.map(({ decision, round }, i) => (
            <li key={i} className="tnum flex items-center justify-between gap-3 py-2">
              <span>Before round {round} · TC {signed(decision.trueCount)}</span>
              <span className={cx("font-semibold", decision.ok ? "text-pos" : "text-neg")}>{decision.ok ? decision.chosen : `${decision.correct}, not ${decision.chosen.toLowerCase()}`}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Cover: bet jumps a pit boss would notice. Not graded, and separate from whether the bet fit the count. */
function Cover({ rounds, unit }: { rounds: FullShoeLiveRound[]; unit?: number }) {
  if (unit === undefined || !rounds.some((round) => round.bet > 0)) return null;
  const jumps = betJumps(rounds, unit);
  return (
    <Card data-testid="cover">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">Cover</h2>
        <Badge tone="neutral">Not graded</Badge>
      </div>
      <p className="mt-1 text-sm leading-6 text-ink-2">What the pit would notice, right for the count or not: a total bet more than double the round before, or more than double the {money(unit)} minimum as you sit down.</p>
      {jumps.length ? (
        <ul className="mt-2 divide-y divide-line text-sm">
          {jumps.map((jump) => (
            <li key={jump.round} className="tnum flex items-center justify-between gap-3 py-2">
              <span>Round {jump.round}{jump.entered ? " · sitting down" : ""}</span>
              <span className="font-semibold">{money(jump.from)} → {money(jump.to)} <span className="font-normal text-ink-3">({Math.round((jump.to / jump.from) * 10) / 10}×)</span></span>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-sm font-medium">No bet more than doubled.</p>}
    </Card>
  );
}

function ReportBody({ data, scorecardActions }: { data: ReportData; scorecardActions?: ReactNode }) {
  const firstMiss = data.rounds.findIndex((round) => round.decisions.some((decision) => !decision.ok));
  const [selected, setSelected] = useState(Math.max(0, firstMiss));
  const replay = useRef<HTMLDivElement>(null);
  const jump = (index: number) => {
    setSelected(index);
    requestAnimationFrame(() => { replay.current?.scrollIntoView({ behavior: "smooth", block: "start" }); replay.current?.focus({ preventScroll: true }); });
  };
  return (
    <>
      <Scorecard data={data} actions={scorecardActions} />
      <Mistakes rounds={data.rounds} onReplay={jump} />
      <BackCounting rounds={data.rounds} plan={data.wong} />
      <Cover rounds={data.rounds} unit={data.unit} />
      {data.rounds.length > 0 && (
        <Card className="scroll-mt-4">
          <h2 className="text-base font-semibold">Hand-by-hand replay</h2>
          <div className="mt-2"><GraderStrip rounds={data.rounds} selected={selected} onSelect={setSelected} /></div>
          <div className="mt-5 border-t border-line pt-4">
            <RoundReplay ref={replay} rounds={data.rounds} index={selected} onSelect={setSelected} />
          </div>
        </Card>
      )}
      {data.rounds.length > 0 && <HistoryTable rounds={data.rounds} selected={selected} onSelect={jump} />}
    </>
  );
}

/** The report at the end of a live shoe. */
export function ShoeReport({ data, onAgain, onSetup }: { data: ReportData; onAgain: () => void; onSetup: () => void }) {
  const weakest = useMemo(() => categories(data.report).filter(({ stat }) => stat.accuracy < READY_AT).sort((a, b) => a.stat.accuracy - b.stat.accuracy)[0], [data.report]);
  const title = data.completionReason === "ended" ? "Shoe ended early" : data.mode === "checkout" ? "Checkout report" : "Shoe complete";
  return (
    <DrillSummary
      title={title}
      score={data.report.accuracy}
      scoreLabel="Overall accuracy"
      scoreSub={<>{data.report.decisions ? `${count(data.report.decisions, "graded decision")}.` : "Nothing was graded."} {data.endMessage}{data.saved ? " Saved to your shoes." : ""}</>}
      stats={[
        { label: "Rounds", value: data.report.handsPlayed },
        { label: "Decisions", value: data.report.decisions },
        { label: "Net result", value: <span className={data.report.netResult >= 0 ? "text-pos" : "text-neg"}>{money(data.report.netResult, { sign: true })}</span> },
        { label: "Time", value: durationLabel(data.report.durationMs) },
      ]}
      onAgain={onAgain}
      againLabel="Shuffle another shoe"
      next={weakest ? PRACTICE[weakest.category] : undefined}
    >
      <ReportBody data={data} scorecardActions={<Button variant="ghost" icon={<SlidersHorizontal size={17} aria-hidden />} onClick={onSetup}>Change the setup</Button>} />
    </DrillSummary>
  );
}

/** A saved shoe, reopened from the library. */
export function SavedShoeReport({ data, title, onBack }: { data: ReportData; title: string; onBack: () => void }) {
  return (
    <div className="space-y-5">
      <div>
        <button type="button" onClick={onBack} className="-ml-1 mb-3 inline-flex h-11 items-center gap-1 rounded-lg pr-2 text-sm font-medium text-ink-2 hover:text-ink">
          <ChevronRight size={16} className="rotate-180" aria-hidden /> Back to setup
        </button>
        <p className="eyebrow">Saved {data.mode === "checkout" ? "checkout" : "coached shoe"}</p>
        <h1 className="mt-1 text-[1.625rem] leading-tight sm:text-3xl">{title}</h1>
      </div>
      <Card>
        <ScoreDial value={data.report.accuracy} label="Overall accuracy" sub={<>{count(data.report.decisions, "graded decision")} over {count(data.report.handsPlayed, "round")} · {durationLabel(data.report.durationMs)} · <span className={data.report.netResult >= 0 ? "text-pos" : "text-neg"}>{money(data.report.netResult, { sign: true })}</span></>} />
      </Card>
      <ReportBody data={data} />
    </div>
  );
}
