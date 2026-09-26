"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { isJournalDate, type JournalSession } from "@/lib/blackjack/journal";
import { classifySessionAssessment, sessionZScore, type TheoreticalOutcome } from "@/lib/blackjack/journalAnalysis";
import { handsSummary, gameFromSession, rulesSummary, spreadLabel } from "@/lib/blackjack/journalForm";
import { hoursLabel, longDate, money, percent, signedMoney } from "@/lib/blackjack/journalFormat";
import { ShoeSimulationCancelled, simulateShoeSession, type ShoeSimulationResult } from "@/lib/blackjack/shoeSimulation";
import { HandReplayer } from "../HandReplayer";
import { ShoeExplorer } from "../ShoeExplorer";
import { Button, Callout, GhostButton, Sheet } from "../ui";
import { KeyValueList, RangeBar, VerdictBadge, toneText } from "./parts";

type Simulation =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error" }
  | { status: "done"; result: ShoeSimulationResult; shoe?: number };

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
/** Waits until the browser has painted, so "Simulating…" shows before the work starts. */
const afterPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

/**
 * One session in full: the result against its normal range, the game and
 * notes, and what can be done with it. Share and Delete confirm on top of
 * this sheet, so Cancel lands back here.
 */
export function SessionDetailsSheet({ session, outcome, bankrollName, onEdit, onShare, onDelete, onClose, children }: {
  session: JournalSession;
  outcome: TheoreticalOutcome;
  bankrollName?: string;
  onEdit: () => void;
  onShare: () => void;
  onDelete: () => void;
  onClose: () => void;
  /** Confirmations (share, delete) that open over this sheet. */
  children?: ReactNode;
}) {
  const [view, setView] = useState<"summary" | "shoes">("summary");
  const [simulation, setSimulation] = useState<Simulation>({ status: "idle" });
  const run = useRef<{ cancelled: boolean } | null>(null);
  const shoesHeading = useRef<HTMLHeadingElement>(null);
  // A run still going when the sheet closes, or another session opens, is abandoned rather than shown later on the wrong session.
  useEffect(() => () => { if (run.current) run.current.cancelled = true; }, []);
  useEffect(() => { if (view === "shoes") shoesHeading.current?.focus(); }, [view]);

  const game = gameFromSession(session);
  const low = outcome.tripEv - 1.96 * outcome.standardDeviation;
  const high = outcome.tripEv + 1.96 * outcome.standardDeviation;
  const assessment = classifySessionAssessment(sessionZScore(session, outcome));
  const created = new Date(session.createdAt);

  const simulate = async () => {
    const token = { cancelled: false };
    run.current = token;
    setSimulation({ status: "running" });
    try {
      await afterPaint();
      if (token.cancelled) return;
      const result = await simulateShoeSession({
        bankroll: 1_000_000_000,
        bettingUnit: session.bettingUnit,
        playerHands: session.playerHands,
        roundsPerHour: session.handsPerHour,
        handsToSimulate: Math.max(1, Math.min(Math.round(session.handsPerHour * session.hours), 2000)),
        highSpeed: false,
        seed: Math.floor(Math.random() * 2 ** 31),
        rules: session.rules,
        ramp: session.ramp,
        deviationGroups: ["h17-pro"],
      }, { isCancelled: () => token.cancelled, yieldControl: nextTask });
      if (token.cancelled) return;
      setSimulation({ status: "done", result });
      setView("shoes");
    } catch (error) {
      if (token.cancelled || error instanceof ShoeSimulationCancelled) return;
      setSimulation({ status: "error" });
    }
  };

  const running = simulation.status === "running";
  const simulateButton = (className = "") => (
    <GhostButton type="button" size="compact" className={`whitespace-nowrap ${className}`} disabled={running} aria-busy={running || undefined} onClick={() => simulation.status === "done" ? setView("shoes") : void simulate()}>
      <i className={`fa-solid ${running ? "fa-spinner motion-safe:animate-spin" : "fa-shuffle"} mr-2 text-xs`} aria-hidden="true" />{running ? "Simulating…" : "Simulate shoes"}
    </GhostButton>
  );
  const shareButton = (className = "") => <GhostButton type="button" size="compact" className={`whitespace-nowrap ${className}`} onClick={onShare}><i className="fa-solid fa-share-nodes mr-2 text-xs" aria-hidden="true" />Share image</GhostButton>;
  const deleteButton = (className = "") => <GhostButton type="button" size="compact" className={`shrink-0 whitespace-nowrap text-[var(--negative)] ${className}`} onClick={onDelete}><i className="fa-solid fa-trash mr-2 text-xs" aria-hidden="true" />Delete</GhostButton>;
  const editButton = (className = "") => <Button type="button" enterAction={false} className={`whitespace-nowrap ${className}`} onClick={onEdit}><i className="fa-solid fa-pen mr-2 text-xs" aria-hidden="true" />Edit session</Button>;

  const footer = view === "summary" ? (
    <>
      <div className="hidden items-center justify-between gap-2 sm:flex">
        {deleteButton()}
        <div className="flex items-center justify-end gap-2">{shareButton()}{simulateButton()}{editButton()}</div>
      </div>
      <div className="grid gap-2 sm:hidden">
        <div className="flex gap-2">{editButton("flex-1")}{deleteButton()}</div>
        <div className="grid grid-cols-2 gap-2">{shareButton("px-2")}{simulateButton("px-2")}</div>
      </div>
    </>
  ) : undefined;

  return (
    <Sheet
      open
      width={view === "shoes" ? "lg" : "md"}
      title={`Session · ${isJournalDate(session.date) ? longDate(session.date) : "Invalid date"}`}
      description={`${session.location?.trim() || "Casino not recorded"}${bankrollName ? ` · ${bankrollName}` : ""}`}
      onClose={onClose}
      footer={footer}
    >
      <div aria-busy={running || undefined}>
        {view === "shoes" && simulation.status === "done" ? (
          <div className="grid gap-4">
            <div>
              <GhostButton type="button" size="compact" onClick={() => setView("summary")}><i className="fa-solid fa-arrow-left mr-2 text-xs" aria-hidden="true" />Back to session</GhostButton>
            </div>
            <div>
              <h3 ref={shoesHeading} tabIndex={-1} className="text-lg font-semibold outline-none">Simulated shoes</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">A representative simulation using this session&apos;s rules, ramp, and betting unit — not your actual historical hands. CountLab never recorded the real cards from this session, so this shows what a session like it typically looks like.</p>
            </div>
            {simulation.shoe === undefined
              ? <ShoeExplorer shoes={simulation.result.shoes} onSelectShoe={(shoe) => setSimulation({ ...simulation, shoe })} />
              : <HandReplayer shoe={simulation.result.shoes[simulation.shoe]} onBack={() => setSimulation({ ...simulation, shoe: undefined })} />}
          </div>
        ) : (
          <div className="grid gap-5">
            {!isJournalDate(session.date) && <Callout tone="warn">This session&apos;s date is invalid. Edit it to fix.</Callout>}
            {simulation.status === "error" && <Callout tone="bad" live>Couldn&apos;t simulate shoes. Try again.</Callout>}
            <section aria-label="Result" className="grid gap-3 rounded-2xl border border-[var(--rule)] p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[.1em] text-[var(--ink-muted)]">Table result</p>
                  <p className={`font-data text-3xl font-semibold ${toneText(session.netResult)}`}>{signedMoney(session.netResult)}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="text-[var(--ink-muted)]">Expected <b className="font-data text-[var(--ink)]">{signedMoney(outcome.tripEv)}</b></p>
                  <VerdictBadge assessment={assessment} size="sm" />
                </div>
              </div>
              {outcome.standardDeviation > 0 && (
                <>
                  <RangeBar low={low} high={high} expected={outcome.tripEv} value={session.netResult} format={(value) => signedMoney(value)} label={`Result ${signedMoney(session.netResult)}, expected ${signedMoney(outcome.tripEv)}, 95% range ${signedMoney(low)} to ${signedMoney(high)}`} />
                  <p className="text-xs text-[var(--ink-muted)]">95% of sessions like this land between {signedMoney(low)} and {signedMoney(high)}.</p>
                </>
              )}
            </section>
            <KeyValueList title="Details" items={[
              { label: "Hours", value: hoursLabel(session.hours) },
              { label: "Pace", value: `${session.handsPerHour} hands/hour` },
              { label: "Hands at once", value: handsSummary(game) === "hands vary by count" ? "Varies by count" : String(game.playerHands) },
              { label: "Betting unit", value: money(session.bettingUnit, session.bettingUnit % 1 ? 2 : 0) },
              { label: "Bet spread", value: spreadLabel(session.ramp) },
              { label: "Average bet", value: money(outcome.averageBet, 2) },
              { label: "Player edge", value: percent(outcome.playerEdge, 2) },
              { label: "Swing (1 SD)", value: `±${money(outcome.standardDeviation)}` },
              { label: "Expenses", value: money(session.expenses, session.expenses % 1 ? 2 : 0) },
              { label: "Logged", value: Number.isNaN(created.getTime()) ? "—" : created.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) },
            ]} />
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[.1em] text-[var(--ink-muted)]">Game</h3>
              <p className="mt-1 text-sm">{rulesSummary(session.rules)}</p>
            </div>
            {session.notes?.trim() && (
              <div>
                <h3 className="text-base font-semibold">Notes</h3>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{session.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
      {children}
    </Sheet>
  );
}
