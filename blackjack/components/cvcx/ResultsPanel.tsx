"use client";

import type { ReactNode, Ref } from "react";
import { toTemplateConfig } from "@/lib/blackjack/labConfig";
import { DASH, money, percent, riskLabel } from "@/lib/blackjack/labFormat";
import { labBlocker } from "@/lib/blackjack/labModel";
import { unsupportedScenario } from "@/components/ScenarioPicker";
import { Button, Callout, GhostButton, HelpTip, StatTile, Term, type Tone } from "@/components/ui";
import { InlineUndo, StatusMark } from "./parts";
import type { Lab } from "./useLab";

/**
 * The single live answer: expected win, swing, risk and the bankroll it needs,
 * whether the bankroll covers it, and the hand-off to the Session Simulator.
 * A <section>, not an <aside>, so it prints.
 */
export function ResultsPanel({ lab, onShowRules, className = "", ref }: { lab: Lab; onShowRules: () => void; className?: string; ref?: Ref<HTMLElement> }) {
  const { config, model } = lab;
  const { result } = model;
  const risk = config.targetRisk;
  const ruinTone: Tone = result.riskOfRuin <= risk ? "good" : result.riskOfRuin <= 0.135 ? "warn" : "bad";
  const winning = result.evPerRound > 0;
  const blocker = model.noBets
    ? { reason: "Set a bet on at least one count before simulating.", fix: undefined }
    : unsupportedScenario(toTemplateConfig(config), true) ? labBlocker(config, "simulation") : undefined;
  const target = lab.simulationTarget();
  return (
    <section ref={ref} id="results" aria-labelledby="results-title" className={`surface lab-results min-w-0 scroll-mt-20 rounded-[1.35rem] p-4 sm:p-5 xl:p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="results-title" tabIndex={-1} className="font-display text-lg font-semibold outline-none">Results</h2>
        <span className="inline-flex items-center gap-1">
          {model.estimated ? (
            <button type="button" onClick={onShowRules} className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]" aria-label="Estimated results: see the rules that differ">
              <StatusMark tone="warn" icon="fa-triangle-exclamation">Estimated</StatusMark>
            </button>
          ) : (
            <StatusMark tone="good" icon="fa-circle-check">Audited</StatusMark>
          )}
          <HelpTip label={model.estimated ? "an estimated result" : "an audited result"}>
            {model.estimated
              ? "Some rules differ from the simulated game, so the edge uses a published estimate for them. See Game → Change rules."
              : "These rules match the simulated game exactly, so every figure comes from the audited simulation."}
          </HelpTip>
        </span>
      </div>

      {model.noBets ? (
        <Callout tone="warn" title="You aren't betting at any count">Set a bet on at least one step of your bet ramp to see results.</Callout>
      ) : (
        <div>
          <p className="text-[.7rem] font-semibold uppercase tracking-[.08em] text-[var(--ink-muted)]">Expected win</p>
          <p className={`mt-1 font-display text-4xl font-semibold leading-none tracking-[-.03em] ${winning ? "text-[var(--ink)]" : "text-[var(--negative)]"}`} data-testid="lab-verdict">
            {money(result.hourlyEv, 2)}<span className="ml-2 text-base font-medium tracking-normal text-[var(--ink-muted)]">an hour</span>
          </p>
          <p className="mt-2 font-data text-[.8rem] text-[var(--ink-muted)]">
            {percent(result.playerEdge, 3, true)} <Term definition="Your average profit as a share of the money you bet, across every round you play.">edge</Term> · plays {percent(result.playedFrequency, 0)} of rounds
          </p>
          <p className="mt-2 text-sm leading-6">
            {winning
              ? <>On average you&apos;d win about {money(result.hourlyEv)} an hour, but any single hour typically lands within ±{money(result.sdPerHour)} of that.</>
              : <>This setup loses about {money(Math.abs(result.hourlyEv))} an hour on average. Try a bigger top bet, sitting out low counts, or a deeper-dealt game.</>}
          </p>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatTile size="sm" label="Hourly swing" value={model.noBets ? DASH : `±${money(result.sdPerHour)}`} sub="1 standard deviation" help="About 2 in 3 hours finish within this amount of the expected win." />
        <StatTile size="sm" label="Risk of ruin" tone={model.noBets ? "neutral" : ruinTone} value={model.noBets ? DASH : percent(result.riskOfRuin)} sub={`of losing all ${money(config.bankroll)}`} help="The chance of losing your whole bankroll if you keep playing these stakes indefinitely." />
        <StatTile size="sm" label="Bankroll needed" value={model.noBets || !Number.isFinite(result.requiredBankroll) ? DASH : money(result.requiredBankroll)} sub={model.noBets ? "nothing is bet" : Number.isFinite(result.requiredBankroll) ? `for ${riskLabel(risk)} risk of ruin` : "no edge to size against"} />
        <StatTile size="sm" label="Average bet" value={model.noBets ? DASH : money(result.averageBet, 2)} sub="per round, all hands" />
      </div>

      <BankrollFit lab={lab} />

      <div className="mt-3 border-t border-[var(--rule)] pt-3">
        <Button enterAction={false} disabled={Boolean(blocker)} onClick={lab.simulate} className="w-full">
          <i className="fa-solid fa-dice mr-2" aria-hidden="true" />Simulate this game
        </Button>
        {blocker ? (
          <div className="mt-2 text-xs leading-5 text-[var(--ink-muted)]" id="simulate-blocked">
            <p>{blocker.reason}</p>
            {blocker.fix === "rules" && <GhostButton size="compact" className="mt-2" onClick={() => lab.resetRules("results")}>Reset to audited rules</GhostButton>}
            {blocker.fix === "hands" && <GhostButton size="compact" className="mt-2" onClick={lab.oneHandEverywhere}>Use 1 hand everywhere</GhostButton>}
          </div>
        ) : (
          <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">
            {target.reuse ? <>Opens “{target.name}” in the Session Simulator to run simulated shoes.</> : <>Saves this setup as “{target.name}” and opens it in the Session Simulator to run simulated shoes.</>}
          </p>
        )}
        <InlineUndo lab={lab} source="results" className="mt-2" />
      </div>
    </section>
  );
}

function FitLine({ icon, tone, children }: { icon: string; tone: "good" | "warn" | "neutral"; children: ReactNode }) {
  const color = tone === "good" ? "text-[var(--accent)]" : tone === "warn" ? "text-[var(--warning)]" : "text-[var(--ink-muted)]";
  return (
    <div className="mt-3 flex gap-2.5 rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-3 text-sm leading-6">
      <i className={`fa-solid ${icon} mt-1 shrink-0 ${color}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Whether the bankroll covers the ramp, and the largest unit that keeps risk at or under the target. */
function BankrollFit({ lab }: { lab: Lab }) {
  const { config, model } = lab;
  const fit = model.fit;
  const risk = riskLabel(config.targetRisk);
  const unitButton = (unit: number) => (
    <GhostButton size="compact" className="mt-2" onClick={() => lab.applyUnit(unit)} aria-label={`Use a ${money(unit)} betting unit`}>Use {money(unit)}</GhostButton>
  );
  switch (fit.kind) {
    case "no-bets":
      return null;
    case "no-edge":
      return <FitLine icon="fa-circle-info" tone="neutral">No bankroll is enough while this setup has no edge.</FitLine>;
    case "unaffordable":
      return <FitLine icon="fa-triangle-exclamation" tone="warn">Even a $1 unit exceeds {risk} risk with this ramp. Lower your top bet or add to your bankroll.</FitLine>;
    case "covered":
      return (
        <FitLine icon="fa-circle-check" tone="good">
          <p>Your {money(config.bankroll)} covers the {money(fit.required)} needed.</p>
          {fit.raiseTo !== null && <p className="text-[var(--ink-muted)]">Your <b className="font-data text-[var(--ink)]">{money(config.baseBet, config.baseBet % 1 ? 2 : 0)}</b> unit could rise to {money(fit.raiseTo)} and keep risk at or under {risk}.</p>}
          {fit.raiseTo !== null && unitButton(fit.raiseTo)}
        </FitLine>
      );
    case "short":
      return (
        <FitLine icon="fa-triangle-exclamation" tone="warn">
          <p>You&apos;re {money(fit.shortBy)} short of the {money(fit.required)} needed.</p>
          <p className="text-[var(--ink-muted)]">At {risk} risk your bankroll supports a unit up to {money(fit.maxUnit)}; you bet <b className="font-data text-[var(--ink)]">{money(config.baseBet, config.baseBet % 1 ? 2 : 0)}</b>.</p>
          {unitButton(fit.maxUnit)}
        </FitLine>
      );
  }
}
