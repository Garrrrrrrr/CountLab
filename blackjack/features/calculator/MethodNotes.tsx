"use client";
import { SIMULTANEOUS_HAND_CORRELATION } from "@/lib/blackjack/advantage";
import { BASIC_ES10_METADATA } from "@/lib/blackjack/basicEs10Coefficients";
import { BASIC_LS_METADATA } from "@/lib/blackjack/basicLsCoefficients";
import { COEFFICIENT_METADATA, DECK_COUNTS, GAME_OPTIONS } from "@/lib/blackjack/coefficients";
import { deckLabel } from "@/lib/blackjack/labFormat";
import { RULE_DELTAS } from "@/lib/blackjack/ruleAdjustments";
import { WONG_ES10_METADATA } from "@/lib/blackjack/wongEs10Coefficients";
import { WONG_LS_METADATA } from "@/lib/blackjack/wongLsCoefficients";
import { cx } from "@/components/ui";
import { points } from "./GameCard";
import { Disclosure } from "./parts";

const billions = (rounds: number) => `${(rounds / 1e9).toFixed(1)} billion`;
const millions = (shoes: number) => `${Math.round(shoes / 1e6)} million`;
const exact = (value: number) => value.toLocaleString("en-US");
const profiles = DECK_COUNTS.map((decks) => `${deckLabel(decks)}: ${GAME_OPTIONS[decks].map((option) => `${option.dealt}`).join(", ")} dealt`).join("; ");
const profileCount = DECK_COUNTS.reduce((sum, decks) => sum + GAME_OPTIONS[decks].length, 0);

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
export function MethodNotes({ useIndices, earlySurrender, className }: { useIndices: boolean; earlySurrender: boolean; className?: string }) {
  const runs = [
    { key: "wong-ls", inUse: useIndices && !earlySurrender, title: "Hi-Lo with indices, late surrender", what: "Wong's index plays and insurance from Professional Blackjack, exactly as the charts show them.", metadata: WONG_LS_METADATA },
    { key: "wong-es10", inUse: useIndices && earlySurrender, title: "Hi-Lo with indices, early surrender vs 10", what: "the same, with Wong's early-surrender numbers against a ten, decided before the dealer checks for blackjack.", metadata: WONG_ES10_METADATA },
    { key: "basic-ls", inUse: !useIndices && !earlySurrender, title: "Basic strategy, late surrender", what: "no index plays and no insurance.", metadata: BASIC_LS_METADATA },
    { key: "basic-es10", inUse: !useIndices && earlySurrender, title: "Basic strategy, early surrender vs 10", what: "no index plays and no insurance.", metadata: BASIC_ES10_METADATA },
  ];
  return (
    <section aria-labelledby="method-title" className={cx("card p-4 sm:p-5", className)}>
      <h2 id="method-title" className="sr-only">How these numbers are calculated</h2>
      <Disclosure section="scope_and_method" summary={<>How these numbers are calculated <span className="block text-xs font-normal text-ink-3">Simulated profiles, the formulas, and what is not modelled</span></>}>
        <Block title="Where the numbers come from">
          <p>
            Every figure is built from per-true-count profiles measured in card-by-card simulations: for each true count, how often it comes up, the player&apos;s edge there and the standard deviation of a hand. Nothing is interpolated between profiles.
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 marker:text-ink-3">
            {runs.map((run) => (
              <li key={run.key} className={cx(run.inUse && "text-ink")}>
                <b className="font-semibold">{run.title}</b>{run.inUse && " (in use)"}: {run.what} {exact(run.metadata.totalRounds)} rounds ({billions(run.metadata.totalRounds)}), {millions(run.metadata.shoesPerProfile)} shoes per profile, seed {run.metadata.seed}.
              </li>
            ))}
            <li>{profileCount} profiles each: {profiles}. One- and two-deck games are modelled heads-up, one spot against the dealer.</li>
            <li>One spot, splits to four hands, H17 · 3:2 · DAS · RSA · dealer peeks. Plays are decided on the true count truncated toward zero, as Wong&apos;s numbers assume; the profiles are grouped by the true count {COEFFICIENT_METADATA.trueCount}.</li>
            <li>The simulator reads its plays from the same strategy engine as the charts, so the two can never disagree.</li>
            <li>Leaving the table at a count is priced from separately simulated shoes: how often each count is watched and played under each enter-and-leave rule.</li>
          </ul>
          <p className="mt-2">
            The first audited Hi-Lo run ({exact(COEFFICIENT_METADATA.totalRounds)} rounds, {millions(COEFFICIENT_METADATA.shoesPerProfile)} shoes per profile, seed {COEFFICIENT_METADATA.seed}) is published in full, with every profile&apos;s rounds, edges and confidence intervals: <a href={COEFFICIENT_METADATA.dataUrl} className="font-semibold text-brand-text underline-offset-2 hover:underline">blackjack-coefficients.json</a>.
          </p>
        </Block>
        <Block title="How the figures are worked out">
          <ul className="list-disc space-y-1.5 pl-5 marker:text-ink-3">
            <li>Win per round: the sum over true counts of how often it comes up × edge × total bet. Sitting out a count bets nothing but still takes table time.</li>
            <li>Standard deviation: from each count&apos;s per-hand variance plus the spread of the bets themselves. Two or three hands at once are correlated at ρ = {SIMULTANEOUS_HAND_CORRELATION}, measured on the same simulator, because they all face one dealer hand.</li>
            <li>Risk of ruin (lifetime): e^(−2 × bankroll × win ÷ variance), playing on forever at fixed stakes. Bankroll needed inverts it for your target risk.</li>
            <li>Trip figures: a normal approximation over the trip&apos;s rounds; the trip risk of ruin and the chance of being up use the reflection formula for touching a level at any time.</li>
            <li>N₀ = variance ÷ win², the rounds before your expected win equals one standard deviation. SCORE = win per 100 rounds with a $10,000 bankroll at 13.5% risk of ruin, your ramp resized to fit. DI = 1,000 × win ÷ standard deviation per round, the square root of SCORE.</li>
            <li>Suggested spreads use whole-dollar units, rounded down so risk never ends up above your target. The Kelly-weighted ramp bets in proportion to edge ÷ variance at each count, clamped to your spread, with the proportion that maximises SCORE (Brett Harris&apos;s spread-limited optimal betting, as CVCX computes it).</li>
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
            <li>Penetrations other than those above; five- and seven-deck shoes; continuous shufflers; several players at a pitch game.</li>
            <li>Early surrender against an ace, split limits other than four hands, and other side rules; other counting systems or index sets.</li>
            <li>Resizing bets as the bankroll changes, and playing errors.</li>
            <li>Comps, tips, travel costs, heat and back-offs. SCORE here is the plain figure for your ramp, with nothing netted out.</li>
          </ul>
        </Block>
      </Disclosure>
    </section>
  );
}
