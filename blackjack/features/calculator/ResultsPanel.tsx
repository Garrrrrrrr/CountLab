"use client";
import type { ReactNode } from "react";
import { BookOpen, CircleAlert, CircleCheck, Info, Sparkles, TriangleAlert } from "lucide-react";
import { chance, count, DASH, money, percent, riskLabel, signedMoney } from "@/lib/blackjack/labFormat";
import type { TripOutlook } from "@/lib/blackjack/labModel";
import { Badge, Button, Callout, cx } from "@/components/ui";
import { Figure, InlineUndo } from "./parts";
import type { Calc } from "./useCalculator";

const twoPlaces = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : DASH);

/** One of the four questions the page answers, with its figures. */
function Question({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cx("border-t border-line pt-4", className)}>
      <h3 className="eyebrow mb-2.5">{title}</h3>
      {children}
    </section>
  );
}

function FitLine({ tone, children }: { tone: "pos" | "warn" | "neutral"; children: ReactNode }) {
  const Icon = tone === "pos" ? CircleCheck : tone === "warn" ? TriangleAlert : Info;
  return (
    <div className="mt-3 flex gap-2.5 rounded-xl border border-line bg-surface-2/60 p-3 text-sm leading-6">
      <Icon size={17} aria-hidden className={cx("mt-1 shrink-0", tone === "pos" ? "text-pos" : tone === "warn" ? "text-warn" : "text-ink-3")} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Whether the bankroll covers the ramp, and the largest whole-dollar unit that keeps risk at or under the target. */
function BankrollFit({ calc }: { calc: Calc }) {
  const { config, pricing } = calc;
  const fit = pricing.fit;
  const risk = riskLabel(config.targetRisk);
  const unitButton = (unit: number) => (
    <Button variant="secondary" size="sm" className="mt-2 min-h-11 sm:min-h-9" onClick={() => calc.applyUnit(unit)} aria-label={`Use a ${money(unit)} betting unit`}>Use a {money(unit)} unit</Button>
  );
  switch (fit.kind) {
    case "no-bets":
      return null;
    case "no-edge":
      return <FitLine tone="neutral">No bankroll is enough while this setup has no edge.</FitLine>;
    case "unaffordable":
      return <FitLine tone="warn">Even a $1 unit is over {risk} risk with this ramp. Lower the top bet or add to the bankroll.</FitLine>;
    case "covered":
      return (
        <FitLine tone="pos">
          <p>Your {money(config.bankroll)} covers the {money(fit.required)} needed.</p>
          {fit.raiseTo !== null && <p className="text-ink-2">Your <b className="tnum text-ink">{money(config.baseBet, config.baseBet % 1 ? 2 : 0)}</b> unit could rise to {money(fit.raiseTo)} and keep risk at or under {risk}.</p>}
          {fit.raiseTo !== null && unitButton(fit.raiseTo)}
        </FitLine>
      );
    case "short":
      return (
        <FitLine tone="warn">
          <p>You are {money(fit.shortBy)} short of the {money(fit.required)} needed.</p>
          <p className="text-ink-2">At {risk} risk your bankroll supports a unit up to {money(fit.maxUnit)}; you bet <b className="tnum text-ink">{money(config.baseBet, config.baseBet % 1 ? 2 : 0)}</b>.</p>
          {unitButton(fit.maxUnit)}
        </FitLine>
      );
  }
}

/**
 * The live answer to the page's four questions: what the game earns, how much
 * it swings, whether the bankroll can take it, and what the trip looks like.
 * A <section>, not an <aside>, so it prints.
 */
export function ResultsPanel({ calc, trip, onShowRules, onSuggest, className }: { calc: Calc; trip: TripOutlook; onShowRules: () => void; onSuggest: () => void; className?: string }) {
  const { config, pricing } = calc;
  const { result, figures, noBets } = pricing;
  const ruinTone = result.riskOfRuin <= config.targetRisk ? "pos" : result.riskOfRuin <= 0.135 ? "warn" : "neg";
  const winning = result.evPerRound > 0;
  const blank = (value: string) => (noBets ? DASH : value);
  const target = calc.journalTarget();
  return (
    <section id="results" aria-labelledby="results-title" className={cx("card scroll-mt-28 p-4 sm:p-5", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="results-title" tabIndex={-1} className="text-lg outline-none">Results</h2>
        {pricing.estimated ? (
          <button type="button" onClick={onShowRules} className="rounded-full" aria-label="Estimated results: see the rules that differ">
            <Badge tone="warn"><TriangleAlert size={12} aria-hidden />Estimated</Badge>
          </button>
        ) : (
          <Badge tone="pos"><CircleCheck size={12} aria-hidden />From the simulations</Badge>
        )}
      </div>

      {noBets ? (
        <Callout tone="warn" title="You are not betting at any count">Set a bet on at least one step of your bet ramp to see results.</Callout>
      ) : (
        <div>
          <p className="eyebrow">What it earns</p>
          <p className={cx("tnum mt-1.5 text-4xl font-semibold leading-none tracking-tight", !winning && "text-neg")} data-testid="calc-verdict">
            {money(result.hourlyEv, 2)}<span className="ml-2 text-base font-medium tracking-normal text-ink-3">an hour</span>
          </p>
          <p className="tnum mt-2 text-sm text-ink-2">Plays {percent(result.playedFrequency, 0)} of rounds at {count(config.handsPerHour)} rounds an hour</p>
          <p className="mt-2 text-sm leading-6 text-ink-2">
            {winning
              ? <>On average about {money(result.hourlyEv)} an hour, but any single hour typically lands within ±{money(result.sdPerHour)} of that.</>
              : <>This setup loses about {money(Math.abs(result.hourlyEv))} an hour on average. Try a bigger top bet, sitting out low counts, or a deeper-dealt game.</>}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            <Figure label="Per round" value={money(result.evPerRound, 2)} sub={`${money(result.evPer100, 2)} per 100 rounds`} />
            <Figure label="Units an hour" value={twoPlaces(figures.unitsPerHour)} sub={`of ${money(config.baseBet, config.baseBet % 1 ? 2 : 0)} each`} />
            <Figure label="Average bet" value={money(result.averageBet, 2)} sub="per round, all hands" />
            <Figure label="Your edge" tone={winning ? undefined : "neg"} value={percent(result.playerEdge, 3, true)} sub="on the money you bet" />
          </dl>
        </div>
      )}

      <Question title="How much it swings" className="mt-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Figure label="Standard deviation an hour" value={blank(`±${money(result.sdPerHour)}`)} sub="about 2 in 3 hours land within it" />
          <Figure label="Standard deviation a round" value={blank(`±${money(result.sdPerRound, 2)}`)} sub={`${twoPlaces(result.sdPerRound / config.baseBet)} units`} />
          <Figure label="N₀" value={!noBets && Number.isFinite(result.nZeroRounds) ? `${count(result.nZeroRounds)}` : DASH} sub={!noBets && Number.isFinite(result.nZeroHours) ? `rounds, about ${count(result.nZeroHours)} hours, before skill outweighs luck` : "needs an edge"} />
          <Figure label="SCORE" value={!noBets && Number.isFinite(figures.score) ? money(figures.score, 2) : DASH} sub="per 100 rounds on a $10,000 bankroll at 13.5% risk" />
          <Figure label="DI" value={!noBets && Number.isFinite(figures.desirabilityIndex) ? twoPlaces(figures.desirabilityIndex) : DASH} sub="1,000 × win ÷ swing per round" />
          <Figure label="Kelly-weighted SCORE" value={pricing.optimalScore > 0 ? money(pricing.optimalScore, 2) : DASH} sub="the suggested Kelly ramp, same game" />
        </dl>
      </Question>

      <Question title="Can your bankroll take it" className="mt-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Figure label="Risk of ruin" tone={noBets ? undefined : ruinTone} value={blank(percent(result.riskOfRuin))} sub={`of losing all ${money(config.bankroll)}, playing on forever`} />
          <Figure label="Bankroll needed" value={noBets || !Number.isFinite(result.requiredBankroll) ? DASH : money(result.requiredBankroll)} sub={noBets ? "nothing is bet" : Number.isFinite(result.requiredBankroll) ? `for ${riskLabel(config.targetRisk)} risk of ruin` : "no edge to size against"} />
          <Figure label={`Largest unit at ${riskLabel(config.targetRisk)} risk`} value={!noBets && Number.isFinite(pricing.riskSizedUnit) && pricing.riskSizedUnit > 0 ? money(pricing.riskSizedUnit, 2) : DASH} sub="this ramp, this bankroll" />
          <Figure label="Bankroll in units" value={config.baseBet > 0 ? count(config.bankroll / config.baseBet) : DASH} sub={`of ${money(config.baseBet, config.baseBet % 1 ? 2 : 0)}`} />
        </dl>
        <BankrollFit calc={calc} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" className="min-h-11 sm:min-h-9" onClick={onSuggest} aria-haspopup="dialog" icon={<Sparkles size={15} aria-hidden />}>Suggest a ramp for this bankroll</Button>
        </div>
      </Question>

      <Question title="Your trip" className="mt-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Figure label="Expected result" tone={!noBets && trip.expected < 0 ? "neg" : undefined} value={blank(signedMoney(trip.expected))} sub={`over ${count(config.hours)} hours (${count(trip.rounds)} rounds)`} />
          <Figure label="Chance of finishing ahead" value={blank(percent(trip.chanceAhead, 1))} sub={`a loss ${blank(percent(trip.chanceOfLoss, 1))} of the time`} />
          <Figure label="Risk of ruin on this trip" value={blank(chance(trip.riskOfRuin))} sub="going broke before it ends" />
          <Figure label="Bad trip (1 in 20)" value={blank(signedMoney(trip.percentiles[0].value))} sub="or worse" />
        </dl>
      </Question>

      <div className="mt-4 border-t border-line pt-4">
        <Button variant="secondary" block disabled={Boolean(calc.journalBlocker) || noBets} onClick={calc.logSession} icon={<BookOpen size={17} aria-hidden />}>Log a session with this game</Button>
        {calc.journalBlocker ? (
          <div className="mt-2 text-xs leading-5 text-ink-3">
            <p className="flex gap-1.5"><CircleAlert size={14} aria-hidden className="mt-0.5 shrink-0" />The Journal {calc.journalBlocker.reason.charAt(0).toLowerCase() + calc.journalBlocker.reason.slice(1)}</p>
            <Button variant="ghost" size="sm" className="-ml-2 mt-1 min-h-11" onClick={() => calc.resetRules("results")}>Reset to simulated rules</Button>
          </div>
        ) : (
          <p className="mt-2 text-xs leading-5 text-ink-3">
            {target.reuse ? <>Opens the Journal with “{target.name}” filled in.</> : <>Saves this setup as “{target.name}” and opens the Journal with it filled in.</>}
          </p>
        )}
        <InlineUndo calc={calc} source="results" className="mt-2" />
      </div>
    </section>
  );
}
