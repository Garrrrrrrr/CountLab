"use client";
import { useMemo, useState } from "react";
import {
  calculateAdvantage,
  DEFAULT_ADVANTAGE_RULES,
  getCountProfile,
  RAMPS,
  unitsAt,
} from "@/lib/blackjack/advantage";
import { GAME_OPTIONS } from "@/lib/blackjack/coefficients";
import { Metric, NumberField, Panel, Select } from "./ui";
const money = (value: number, digits = 2) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
type Candidate = {
  name: string;
  baseBet: number;
  maxBet: number;
  hourlyEv: number;
  risk: number;
  feasible: boolean;
  withinRisk: boolean;
  status: "met" | "risk-limited" | "minimum-too-high";
  bets: Array<{ label: string; bet: number }>;
};
export function BankrollRecommender() {
  const [bankroll, setBankroll] = useState(25000),
    [minimumBet, setMinimumBet] = useState(10),
    [desiredEv, setDesiredEv] = useState(50),
    [targetRisk, setTargetRisk] = useState(0.05),
    [rph, setRph] = useState(100),
    [playerHands, setPlayerHands] = useState(1),
    [decks, setDecks] = useState<6 | 8>(6),
    [dealt, setDealt] = useState(4.5);
  const rules = useMemo(
      () => ({ ...DEFAULT_ADVANTAGE_RULES, decks, penetration: dealt / decks }),
      [decks, dealt],
    ),
    profile = useMemo(() => getCountProfile(rules), [rules]);
  const candidates = useMemo<Candidate[]>(
      () =>
        Object.entries(RAMPS).map(([name, ramp]) => {
          const oneDollar = calculateAdvantage({
              bankroll: 1,
              bettingUnit: 1,
              playerHands,
              handsPerHour: rph,
              hours: 1,
              rules,
              ramp,
            }),
            requiredRaw =
              oneDollar.evPerRound > 0
                ? desiredEv / (oneDollar.evPerRound * rph)
                : Infinity,
            allowedRaw =
              targetRisk >= 1
                ? Infinity
                : oneDollar.evPerRound > 0
                  ? (-2 * bankroll * oneDollar.evPerRound) /
                    (oneDollar.sdPerRound ** 2 * Math.log(targetRisk))
                  : 0,
            minimumWhole = Math.max(1, Math.ceil(minimumBet)),
            requiredWhole = Math.max(minimumWhole, Math.ceil(requiredRaw)),
            allowedWhole = Math.floor(allowedRaw);
          let baseBet: number,
            status: Candidate["status"],
            withinRisk: boolean,
            feasible: boolean;
          if (allowedWhole < minimumWhole) {
            baseBet = minimumWhole;
            status = "minimum-too-high";
            withinRisk = false;
            feasible = false;
          } else if (requiredWhole <= allowedWhole) {
            baseBet = requiredWhole;
            status = "met";
            withinRisk = true;
            feasible = true;
          } else {
            baseBet = allowedWhole;
            status = "risk-limited";
            withinRisk = true;
            feasible = false;
          }
          const actual = calculateAdvantage({
              bankroll,
              bettingUnit: baseBet,
              playerHands,
              handsPerHour: rph,
              hours: 1,
              rules,
              ramp,
            }),
            bets = profile.map((row) => ({
              label: row.label,
              bet: Math.round(unitsAt(row.tc, ramp) * baseBet),
            }));
          return {
            name,
            baseBet,
            maxBet: Math.max(...bets.map((item) => item.bet)),
            hourlyEv: actual.hourlyEv,
            risk: actual.riskOfRuin,
            feasible,
            withinRisk,
            status,
            bets,
          };
        }),
      [bankroll, minimumBet, desiredEv, targetRisk, rph, playerHands, rules, profile],
    ),
    recommendation = candidates
      .filter((candidate) => candidate.withinRisk)
      .sort(
        (a, b) =>
          Number(b.feasible) - Number(a.feasible) || a.maxBet - b.maxBet,
      )[0];
  return (
    <>
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">
          Coefficient optimizer
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Bankroll Recommender</h1>
        <p className="mt-2 max-w-4xl text-zinc-400">
          Size a whole-dollar bet spread around the table minimum while
          targeting an hourly EV and maximum lifetime risk of ruin.
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <Panel>
          <h2 className="mb-5 font-semibold">Targets</h2>
          <div className="grid gap-4">
            <NumberField
              label="Bankroll"
              value={bankroll}
              min={1}
              step={1}
              prefix="$"
              onValueChange={setBankroll}
            />
            <NumberField
              label="Minimum table bet"
              value={minimumBet}
              min={1}
              step={1}
              prefix="$"
              onValueChange={setMinimumBet}
            />
            <NumberField
              label="Desired hourly EV"
              value={desiredEv}
              min={0}
              prefix="$"
              onValueChange={setDesiredEv}
            />
            <Select
              label="Maximum risk of ruin"
              value={targetRisk}
              onChange={(event) => setTargetRisk(+event.target.value)}
            >
              <option value={0.01}>1%</option>
              <option value={0.025}>2.5%</option>
              <option value={0.05}>5%</option>
              <option value={0.1}>10%</option>
              <option value={0.25}>25%</option>
              <option value={0.5}>50%</option>
              <option value={0.75}>75%</option>
              <option value={1}>100% (no ceiling)</option>
            </Select>
            <NumberField
              label="Rounds per hour"
              value={rph}
              min={1}
              step={1}
              onValueChange={setRph}
            />
            <Select label="Simultaneous player hands" value={playerHands} onChange={(event) => setPlayerHands(+event.target.value)}>
              {[1, 2, 3, 4, 5, 6, 7].map((value) => <option key={value} value={value}>{value} hand{value === 1 ? "" : "s"}</option>)}
            </Select>
            <Select
              label="Number of decks"
              value={decks}
              onChange={(event) => {
                const nextDecks = Number(event.target.value) as 6 | 8;
                setDecks(nextDecks);
                setDealt(nextDecks === 6 ? 4.5 : 6);
              }}
            >
              <option value={6}>6 decks</option>
              <option value={8}>8 decks</option>
            </Select>
            <Select
              label="Penetration"
              value={dealt}
              onChange={(event) => setDealt(Number(event.target.value))}
            >
              {GAME_OPTIONS[decks].map((option) => (
                <option key={option.dealt} value={option.dealt}>
                  {option.label} ({Math.round((option.dealt / decks) * 100)}%)
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-5 rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {decks}D · {dealt}/{decks} penetration · {playerHands} simultaneous hand{playerHands === 1 ? "" : "s"} · H17 · DAS · RSA · LS · Peek · 3:2 · audited H17 Pro policy
          </div>
        </Panel>
        <div className="space-y-5">
          <Panel className="md:overflow-x-auto">
            <h2 className="mb-4 font-semibold">Candidate spreads</h2>
            <div className="space-y-3 md:hidden">
              {candidates.map((candidate) => (
                <article key={candidate.name} className="rounded-2xl bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-xs text-zinc-500">Spread</p><b className="text-xl">{candidate.name}</b></div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${candidate.status === "met" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{candidate.status === "met" ? "Both met" : candidate.status === "risk-limited" ? "EV risk-limited" : "Minimum exceeds RoR"}</span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-xs text-zinc-500">Bet / hand</dt><dd className="mt-1 font-semibold">{money(candidate.baseBet, 0)}–{money(candidate.maxBet, 0)}</dd></div>
                    <div className="text-right"><dt className="text-xs text-zinc-500">Hourly EV</dt><dd className="mt-1 font-semibold text-emerald-300">{money(candidate.hourlyEv)}</dd></div>
                    <div><dt className="text-xs text-zinc-500">Risk of ruin</dt><dd className="mt-1 font-semibold">{(candidate.risk * 100).toFixed(2)}%</dd></div>
                  </dl>
                </article>
              ))}
            </div>
            <table className="hidden w-full min-w-[650px] text-right text-sm md:table">
              <thead className="text-zinc-500">
                <tr>
                  <th className="pb-3 text-left">Spread</th>
                  <th className="pb-3">Minimum / hand</th>
                  <th className="pb-3">Maximum / hand</th>
                  <th className="pb-3">Hourly EV</th>
                  <th className="pb-3">RoR</th>
                  <th className="pb-3">Constraints</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <tr
                    key={candidate.name}
                    className="border-t border-white/[.06]"
                  >
                    <td className="py-3 text-left font-medium">
                      {candidate.name}
                    </td>
                    <td>{money(candidate.baseBet, 0)}</td>
                    <td>{money(candidate.maxBet, 0)}</td>
                    <td>{money(candidate.hourlyEv)}</td>
                    <td>{(candidate.risk * 100).toFixed(2)}%</td>
                    <td
                      className={
                        candidate.status === "met"
                          ? "text-emerald-400"
                          : "text-amber-300"
                      }
                    >
                      {candidate.status === "met"
                        ? "Both met"
                        : candidate.status === "risk-limited"
                          ? "EV risk-limited"
                          : "Minimum exceeds RoR"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          {recommendation ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  label="Recommended spread"
                  value={recommendation.name}
                />
                <Metric
                  label="Minimum / hand"
                  value={money(recommendation.baseBet, 0)}
                />
                <Metric
                  label="Maximum / hand"
                  value={money(recommendation.maxBet, 0)}
                />
                <Metric
                  label="Hourly EV"
                  value={money(recommendation.hourlyEv)}
                />
              </div>
              <Panel>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">
                      Detailed whole-dollar spread
                    </h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      Per-hand wager for every true-count bucket, including repeated minimum and maximum bets. Total action is {playerHands}× the displayed amount.
                    </p>
                  </div>
                  <span className="text-sm text-zinc-400">
                    RoR {(recommendation.risk * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:hidden">
                  {recommendation.bets.map((item) => (
                    <div key={item.label} className="flex items-center justify-between rounded-xl bg-black/20 p-3">
                      <span className="text-sm text-zinc-400">TC {item.label}</span>
                      <b>{money(item.bet, 0)}</b>
                    </div>
                  ))}
                </div>
                <table className="hidden w-full min-w-[420px] text-right text-sm sm:table">
                  <thead className="text-zinc-500">
                    <tr>
                      <th className="pb-3 text-left">True count</th>
                      <th className="pb-3">Bet / hand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recommendation.bets.map((item) => (
                      <tr
                        key={item.label}
                        className="border-t border-white/[.06]"
                      >
                        <td className="py-2.5 text-left font-medium">
                          {item.label}
                        </td>
                        <td className="text-base font-semibold">
                          {money(item.bet, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p
                  className={`mt-5 text-sm ${recommendation.feasible ? "text-emerald-400" : "text-amber-300"}`}
                >
                  {recommendation.feasible
                    ? "This integer-dollar spread meets both requested targets."
                    : "The requested hourly EV exceeds the selected RoR ceiling. This is the highest whole-dollar base bet allowed by the risk constraint."}
                </p>
              </Panel>
            </>
          ) : (
            <Panel>
              <h2 className="font-semibold text-amber-300">
                No compatible spread
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                The specified table minimum alone exceeds the selected
                risk-of-ruin limit for every available spread. Increase the
                bankroll, allow more risk, or choose a lower table minimum.
              </p>
            </Panel>
          )}
        </div>
      </div>
      <p className="mt-5 text-xs leading-5 text-zinc-500">
        EV and variance use the audited fixed-strategy simulation coefficients.
        Multiple-hand results retain shared true-count-state variance and price simultaneous hands as correlated (ρ = 0.372, measured on the audited kernel), because every hand in a round is settled against the same dealer hand. {" "}
        Lifetime risk of ruin is a diffusion approximation; it is not a guarantee
        and does not model bankroll resizing, playing errors, table limits, heat,
        or backoffs.
      </p>
    </>
  );
}
