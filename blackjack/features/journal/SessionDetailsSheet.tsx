"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, LoaderCircle, Pencil, Share2, Shuffle, Trash } from "lucide-react";
import { Button, Callout, cx } from "@/components/ui";
import { track } from "@/lib/analytics/track";
import { HEAT_LABEL, isJournalDate, type JournalSession } from "@/lib/blackjack/journal";
import { classifySessionAssessment, sessionZScore, type TheoreticalOutcome } from "@/lib/blackjack/journalAnalysis";
import { gameFromSession, handsSummary, rulesSummary, spreadLabel } from "@/lib/blackjack/journalForm";
import { hoursLabel, longDate, money, percent, plural, signedMoney } from "@/lib/blackjack/journalFormat";
import { ShoeSimulationCancelled, simulateShoeSession, type ShoeSimulationResult } from "@/lib/blackjack/shoeSimulation";
import { RampLine } from "./GameEditor";
import { exactMoney, simulationHands, SIMULATION_HAND_CAP, toneClass } from "./model";
import { JournalSheet, KeyValueList, RangeBar, Verdict } from "./parts";
import { ShoeViewer } from "./ShoeViewer";

type Simulation =
  | { status: "idle" }
  | { status: "running"; done: number; total: number }
  | { status: "error" }
  | { status: "done"; result: ShoeSimulationResult };

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
/** Waits until the browser has painted, so "Simulating" shows before the work starts. */
const afterPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

/**
 * One session in full: the result against its normal range, the game, the
 * notes, and what can be done with it. The shoe simulation opens inside the
 * same sheet, so Back to session is one tap.
 */
export function SessionDetailsSheet({ session, outcome, bankrollName, onEdit, onDelete, onShare, onClose }: {
  session: JournalSession;
  outcome: TheoreticalOutcome;
  bankrollName?: string;
  onEdit: () => void;
  onDelete: () => void;
  onShare: () => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<"summary" | "shoes">("summary");
  const [simulation, setSimulation] = useState<Simulation>({ status: "idle" });
  const run = useRef<{ cancelled: boolean } | null>(null);
  const shoesHeading = useRef<HTMLHeadingElement>(null);
  const summaryTop = useRef<HTMLDivElement>(null);
  // A run still going when the sheet closes is abandoned rather than shown later on the wrong session.
  useEffect(() => () => { if (run.current) run.current.cancelled = true; }, []);
  useEffect(() => { if (view === "shoes") shoesHeading.current?.focus(); }, [view]);

  const game = gameFromSession(session);
  const planTopBet = Math.max(0, ...session.ramp.map((point) => point.units)) * session.bettingUnit;
  const low = outcome.tripEv - 1.96 * outcome.standardDeviation;
  const high = outcome.tripEv + 1.96 * outcome.standardDeviation;
  const assessment = classifySessionAssessment(sessionZScore(session, outcome));
  const created = new Date(session.createdAt);
  const hands = simulationHands(session);
  const totalHands = Math.round(session.handsPerHour * session.hours);

  const simulate = async () => {
    const token = { cancelled: false };
    run.current = token;
    setSimulation({ status: "running", done: 0, total: hands });
    try {
      await afterPaint();
      if (token.cancelled) return;
      const result = await simulateShoeSession({
        // Large enough that the simulated player never goes broke mid-session.
        bankroll: 1_000_000_000,
        bettingUnit: session.bettingUnit,
        playerHands: session.playerHands,
        roundsPerHour: session.handsPerHour,
        handsToSimulate: hands,
        highSpeed: false,
        seed: Math.floor(Math.random() * 2 ** 31),
        rules: session.rules,
        ramp: session.ramp,
        deviationGroups: ["h17-pro"],
      }, {
        isCancelled: () => token.cancelled,
        yieldControl: nextTask,
        onProgress: (done, total) => { if (!token.cancelled) setSimulation({ status: "running", done, total }); },
      });
      if (token.cancelled) return;
      track("result_expanded", { feature: "session_journal", section: "simulated_shoes" });
      setSimulation({ status: "done", result });
      setView("shoes");
    } catch (error) {
      if (token.cancelled || error instanceof ShoeSimulationCancelled) return;
      setSimulation({ status: "error" });
    }
  };

  const running = simulation.status === "running";
  const title = isJournalDate(session.date) ? longDate(session.date) : "Session with an invalid date";
  const description = `${session.location?.trim() || "No casino recorded"}${bankrollName ? ` · ${bankrollName}` : ""}`;

  const footer = view === "summary" ? (
    <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:order-2 sm:flex">
        <Button icon={<Pencil size={16} aria-hidden />} onClick={onEdit}>Edit session</Button>
        <Button variant="secondary" className="text-neg" icon={<Trash size={16} aria-hidden />} onClick={onDelete}>Delete</Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:order-1 sm:flex">
        <Button variant="secondary" icon={<Share2 size={16} aria-hidden />} onClick={onShare}>Share image</Button>
        {hands > 0 && (
          <Button variant="secondary" disabled={running} aria-busy={running || undefined}
            icon={running ? <LoaderCircle size={16} aria-hidden className="animate-spin" /> : <Shuffle size={16} aria-hidden />}
            onClick={() => simulation.status === "done" ? setView("shoes") : void simulate()}>
            {running ? "Simulating" : simulation.status === "done" ? "View shoes" : "Simulate shoes"}
          </Button>
        )}
      </div>
    </div>
  ) : undefined;

  return (
    <JournalSheet open size="lg" title={title} description={description} onClose={onClose} footer={footer}>
      {view === "shoes" && simulation.status === "done" ? (
        <div className="grid grid-cols-1 gap-4">
          <div>
            <Button variant="ghost" size="sm" className="-ml-2 h-11" icon={<ArrowLeft size={16} aria-hidden />} onClick={() => { setView("summary"); requestAnimationFrame(() => summaryTop.current?.focus()); }}>Back to session</Button>
            <h3 ref={shoesHeading} tabIndex={-1} className="mt-1 text-lg font-semibold outline-none">Simulated shoes</h3>
            <p className="mt-1 text-sm leading-6 text-ink-2">What a session on this game typically looks like: this session&apos;s rules, spread and unit played by the simulator with basic strategy and index plays. These are not your real hands, which CountLab never recorded.</p>
          </div>
          <ShoeViewer result={simulation.result} capped={totalHands > SIMULATION_HAND_CAP} />
          <Button variant="secondary" className="justify-self-start" icon={<Shuffle size={16} aria-hidden />} onClick={() => { setView("summary"); void simulate(); }}>Simulate again</Button>
        </div>
      ) : (
        <div ref={summaryTop} tabIndex={-1} className="grid grid-cols-1 gap-5 outline-none" aria-busy={running || undefined}>
          {!isJournalDate(session.date) && <Callout tone="warn">This session&apos;s date is invalid. Edit it to fix.</Callout>}
          {simulation.status === "error" && <Callout tone="neg">The shoes couldn&apos;t be simulated. Try again.</Callout>}
          {running && <p role="status" className="tnum text-sm text-ink-2">Simulating {simulation.done.toLocaleString("en-US")} of {plural(simulation.total, "hand")}…</p>}
          <section aria-label="Result" className="grid grid-cols-1 gap-3 rounded-2xl border border-line p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Table result</p>
                <p className={cx("tnum text-3xl font-semibold tracking-tight", toneClass(session.netResult))}>{signedMoney(session.netResult, session.netResult % 1 ? 2 : 0)}</p>
              </div>
              <div className="text-right text-sm">
                <p className="text-ink-2">Expected <b className="tnum font-semibold text-ink">{signedMoney(outcome.tripEv)}</b></p>
                <Verdict assessment={assessment} size="sm" />
              </div>
            </div>
            {outcome.standardDeviation > 0 && (
              <>
                <RangeBar low={low} high={high} expected={outcome.tripEv} value={session.netResult} format={(value) => signedMoney(value)} label={`Result ${signedMoney(session.netResult)}, expected ${signedMoney(outcome.tripEv)}, 95% range ${signedMoney(low)} to ${signedMoney(high)}`} />
                <p className="text-xs leading-5 text-ink-3">95% of sessions like this land between {signedMoney(low)} and {signedMoney(high)}.</p>
              </>
            )}
          </section>
          {session.notes?.trim() && (
            <section aria-labelledby="journal-details-notes">
              <h3 id="journal-details-notes" className="text-base font-semibold">Notes</h3>
              <p className="mt-1 whitespace-pre-wrap break-words text-[0.9375rem] leading-6 text-ink">{session.notes}</p>
            </section>
          )}
          <KeyValueList title="Details" items={[
            { label: "Hours", value: hoursLabel(session.hours) },
            { label: "Pace", value: `${session.handsPerHour} rounds/hour` },
            ...(session.details?.roundsPlayed !== undefined ? [{ label: "Rounds played", value: session.details.roundsPlayed.toLocaleString("en-US") }] : []),
            ...(session.details?.buyIn !== undefined ? [{ label: "Bought in for", value: exactMoney(session.details.buyIn) }] : []),
            ...(session.details?.cashOut !== undefined ? [{ label: "Cashed out", value: exactMoney(session.details.cashOut) }] : []),
            ...(session.details?.topBet !== undefined ? [{ label: "Top bet", value: `${exactMoney(session.details.topBet)}${session.details.topBet > planTopBet ? ` (plan ${exactMoney(planTopBet)})` : ""}` }] : []),
            ...(session.details?.heat?.length ? [{ label: "Heat", value: session.details.heat.map((kind) => HEAT_LABEL[kind]).join(", ") }] : []),
            { label: "Hands at once", value: handsSummary(game) === "hands vary by count" ? "Varies by count" : String(game.playerHands) },
            { label: "Betting unit", value: exactMoney(session.bettingUnit) },
            { label: "Bet spread", value: spreadLabel(session.ramp) },
            { label: "Average bet", value: money(outcome.averageBet, 2) },
            { label: "Player edge", value: percent(outcome.playerEdge, 2) },
            { label: "Swing (1 SD)", value: `±${money(outcome.standardDeviation)}` },
            { label: "Expenses", value: exactMoney(session.expenses) },
            { label: "Logged", value: Number.isNaN(created.getTime()) ? "—" : created.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) },
          ]} />
          <section aria-labelledby="journal-details-game" className="grid grid-cols-1 gap-2">
            <h3 id="journal-details-game" className="eyebrow">Game</h3>
            <p className="text-sm text-ink">{rulesSummary(session.rules)}</p>
            <RampLine ramp={session.ramp} unit={session.bettingUnit} />
          </section>
        </div>
      )}
    </JournalSheet>
  );
}
