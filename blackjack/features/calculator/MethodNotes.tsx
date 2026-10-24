"use client";
import { SIMULTANEOUS_HAND_CORRELATION } from "@/lib/blackjack/advantage";
import { COEFFICIENT_METADATA, GAME_OPTIONS } from "@/lib/blackjack/coefficients";
import { H17_PRO_METADATA } from "@/lib/blackjack/h17ProCoefficients";
import { NO_INDEX_METADATA } from "@/lib/blackjack/noIndexCoefficients";
import { RULE_DELTAS } from "@/lib/blackjack/ruleAdjustments";
import { cx } from "@/components/ui";
import { points } from "./GameCard";
import { Disclosure } from "./parts";

const billions = (rounds: number) => `${(rounds / 1e9).toFixed(1)} billion`;
const millions = (shoes: number) => `${Math.round(shoes / 1e6)} million`;
const exact = (value: number) => value.toLocaleString("en-US");
const profiles = ([6, 8] as const).map((decks) => `${decks} decks: ${GAME_OPTIONS[decks].map((option) => `${option.dealt}`).join(", ")} dealt`).join("; ");

const RULE_ROWS: { rule: string; delta: number }[] = [
  { rule: "Dealer stands on soft 17", delta: RULE_DELTAS.dealerStandsSoft17 },
  { rule: "Blackjack pays 6:5", delta: RULE_DELTAS.blackjackPays6to5 },
  { rule: "No double after split", delta: RULE_DELTAS.noDoubleAfterSplit },
  { rule: "No resplitting aces", delta: RULE_DELTAS.noResplitAces },
  { rule: "No surrender", delta: RULE_DELTAS.noLateSurrender },
  { rule: "No hole card (European)", delta: RULE_DELTAS.europeanNoHoleCard },
  { rule: "Double on 9–11 only", delta: RULE_DELTAS.doubleOnly9to11 },
  { rule: "Double on 10–11 only", delta: RULE_DELTAS.doubleOnly10to11 },
];

function Block({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("mt-4 first:mt-0", className)}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-1.5 text-sm leading-6 text-ink-2">{children}</div>
    </div>
  );
}

/** Exactly what the figures rest on, and what they leave out. */
export function MethodNotes({ useIndices, className }: { useIndices: boolean; className?: string }) {
  return (
    <section aria-labelledby="method-title" className={cx("card p-4 sm:p-5", className)}>
      <h2 id="method-title" className="sr-only">How these numbers are calculated</h2>
      <Disclosure section="scope_and_method" summary={<>How these numbers are calculated <span className="block text-xs font-normal text-ink-3">Simulated profiles, the formulas, and what is not modelled</span></>}>
        <Block title="Where the numbers come from">
          <p>
            Every figure is built from per-true-count profiles measured in card-by-card simulations: for each true count, how often it comes up, the player&apos;s edge there and the standard deviation of a hand. Nothing is interpolated between profiles.
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 marker:text-ink-3">
            <li className={cx(useIndices && "text-ink")}>
              <b className="font-semibold">Hi-Lo with indices</b>{useIndices && " (in use)"}: the H17 Pro chart, 34 index plays and insurance at +3. {exact(H17_PRO_METADATA.totalRounds)} rounds ({billions(H17_PRO_METADATA.totalRounds)}), {millions(H17_PRO_METADATA.shoesPerProfile)} shoes per profile, seed {H17_PRO_METADATA.seed}.
            </li>
            <li className={cx(!useIndices && "text-ink")}>
              <b className="font-semibold">Basic strategy</b>{!useIndices && " (in use)"}: no index plays and no insurance. {exact(NO_INDEX_METADATA.totalRounds)} rounds ({billions(NO_INDEX_METADATA.totalRounds)}), {millions(NO_INDEX_METADATA.shoesPerProfile)} shoes per profile, seed {NO_INDEX_METADATA.seed}.
            </li>
            <li>Nine profiles each: {profiles}.</li>
            <li>One spot, splits to four hands, H17 · 3:2 · DAS · RSA · late surrender · dealer peeks. The true count is {COEFFICIENT_METADATA.trueCount}.</li>
          </ul>
          <p className="mt-2">
            The first audited Hi-Lo run ({exact(COEFFICIENT_METADATA.totalRounds)} rounds, {millions(COEFFICIENT_METADATA.shoesPerProfile)} shoes per profile, seed {COEFFICIENT_METADATA.seed}) is published in full, with every profile&apos;s rounds, edges and confidence intervals: <a href={COEFFICIENT_METADATA.dataUrl} className="font-semibold text-brand-text underline-offset-2 hover:underline">blackjack-coefficients.json</a>. The two runs above use the same simulator with the H17 Pro chart and with indices switched off.
          </p>
        </Block>
        <Block title="How the figures are worked out">
          <ul className="list-disc space-y-1.5 pl-5 marker:text-ink-3">
            <li>Win per round: the sum over true counts of how often it comes up × edge × total bet. Sitting out a count bets nothing but still takes table time.</li>
            <li>Standard deviation: from each count&apos;s per-hand variance plus the spread of the bets themselves. Two or three hands at once are correlated at ρ = {SIMULTANEOUS_HAND_CORRELATION}, measured on the same simulator, because they all face one dealer hand.</li>
            <li>Risk of ruin (lifetime): e^(−2 × bankroll × win ÷ variance), playing on forever at fixed stakes. Bankroll needed inverts it for your target risk.</li>
            <li>Trip figures: a normal approximation over the trip&apos;s rounds; the trip risk of ruin and the chance of being up use the reflection formula for touching a level at any time.</li>
            <li>N₀ = variance ÷ win², the rounds before your expected win equals one standard deviation. SCORE = win per 100 rounds with a $10,000 bankroll at 13.5% risk of ruin, your ramp resized to fit. DI = 1,000 × win ÷ standard deviation per round, the square root of SCORE.</li>
            <li>Suggested spreads use whole-dollar units, rounded down so risk never ends up above your target. The Kelly-weighted ramp bets in proportion to edge ÷ variance at each count.</li>
          </ul>
        </Block>
        <Block title="Rules outside the simulations">
          <p>Other rules shift the edge by a flat, published estimate at every count rather than a new simulation, and the results are marked Estimated:</p>
          <ul className="tnum mt-1.5 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
            {RULE_ROWS.map((row) => <li key={row.rule} className="flex justify-between gap-3"><span>{row.rule}</span><span className="text-ink">{points(row.delta)} points</span></li>)}
          </ul>
        </Block>
        <Block title="Not modelled">
          <ul className="list-disc space-y-1.5 pl-5 marker:text-ink-3">
            <li>Single-, double- and four-deck games, and penetrations other than the nine above; continuous shufflers.</li>
            <li>Early surrender, split limits other than four hands, and other side rules; other counting systems or index sets.</li>
            <li>Leaving the table at low counts (only joining at a count is modelled), table maximums, resizing bets as the bankroll changes, and playing errors.</li>
            <li>Comps, tips, travel costs, heat and back-offs. SCORE here is the plain figure for your ramp, with nothing netted out.</li>
          </ul>
        </Block>
      </Disclosure>
    </section>
  );
}
