"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_ADVANTAGE_RULES, RAMPS, RampPoint, unitsAt } from "@/lib/blackjack/advantage";
import { GAME_OPTIONS } from "@/lib/blackjack/coefficients";
import { planTrip } from "@/lib/blackjack/tripPlanning";
import { journalLibrary } from "@/lib/blackjack/journal";
import { currentBankroll } from "@/lib/blackjack/journalAnalysis";
import { venuePresetLibrary, VenuePreset } from "@/lib/blackjack/venuePresets";
import { isEstimated, ruleAdjustmentFlagsFromRules, sumRuleAdjustment } from "@/lib/blackjack/ruleAdjustments";
import { GhostButton, Metric, NumberField, Panel, PinnedStat, Section, Select, Switch } from "./ui";

const money = (value: number, digits = 0) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: "auto" }).format(value);
const percent = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const expandRamp = (ramp: RampPoint[]) => Array.from({ length: 17 }, (_, index) => ({ trueCount: index - 8, units: unitsAt(index - 8, ramp) }));

export function TripPlanner() {
  const [decks, setDecks] = useState<6 | 8>(6);
  const [dealt, setDealt] = useState(4.5);
  const [dealerHitsSoft17, setDealerHitsSoft17] = useState(true);
  const [doubleAfterSplit, setDoubleAfterSplit] = useState(true);
  const [resplitAces, setResplitAces] = useState(true);
  const [lateSurrender, setLateSurrender] = useState(true);
  const [blackjackPayout, setBlackjackPayout] = useState<1.5 | 1.2>(1.5);
  const [ramp, setRamp] = useState<RampPoint[]>(() => expandRamp(RAMPS["1-8"]));
  const [bankroll, setBankroll] = useState(5000);
  const [bettingUnit, setBettingUnit] = useState(25);
  const [playerHands, setPlayerHands] = useState(1);
  const [handsPerHour, setHandsPerHour] = useState(100);
  const [tripHours, setTripHours] = useState(8);
  const [lossThreshold, setLossThreshold] = useState(1000);
  const [goalAmount, setGoalAmount] = useState(1000);
  const [venuePresets, setVenuePresets] = useState<VenuePreset[]>([]);

  useEffect(() => {
    const refresh = () => setVenuePresets(venuePresetLibrary.presets());
    refresh();
    addEventListener(venuePresetLibrary.event, refresh);
    return () => removeEventListener(venuePresetLibrary.event, refresh);
  }, []);

  const rules = useMemo(() => ({ ...DEFAULT_ADVANTAGE_RULES, decks, penetration: dealt / decks, dealerHitsSoft17, doubleAfterSplit, resplitAces, lateSurrender, blackjackPayout }), [blackjackPayout, decks, dealt, dealerHitsSoft17, doubleAfterSplit, resplitAces, lateSurrender]);
  const ruleFlags = useMemo(() => ruleAdjustmentFlagsFromRules(rules), [rules]);
  const plan = useMemo(
    () => planTrip({ bankroll, bettingUnit, playerHands, handsPerHour, hours: tripHours, rules, ramp }),
    [bankroll, bettingUnit, playerHands, handsPerHour, tripHours, rules, ramp],
  );

  const loadVenuePreset = (id: string) => {
    const preset = venuePresets.find((item) => item.id === id);
    if (!preset) return;
    const nextDecks = preset.rules.decks === 8 ? 8 : 6;
    setDecks(nextDecks);
    setDealt(Number((preset.rules.penetration * nextDecks).toFixed(2)));
    setDealerHitsSoft17(preset.rules.dealerHitsSoft17);
    setDoubleAfterSplit(preset.rules.doubleAfterSplit);
    setResplitAces(preset.rules.resplitAces);
    setLateSurrender(preset.rules.lateSurrender);
    setBlackjackPayout(preset.rules.blackjackPayout);
    setRamp(expandRamp(preset.ramp));
  };
  const useJournalBankroll = () => {
    const bankrolls = journalLibrary.bankrolls();
    if (bankrolls.length === 0) return;
    const total = currentBankroll(journalLibrary.sessions(), journalLibrary.transactions());
    setBankroll(Math.max(0, Math.round(total)));
  };

  return (
    <>
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">Analyze · Plan</p>
        <h1 className="mt-2 text-3xl font-semibold">Trip Bankroll Planner</h1>
        <p className="mt-2 max-w-2xl text-zinc-400">
          Estimate how a specific bankroll holds up over a trip of a given length: chance of busting, chance of finishing ahead, and how a loss or a win goal is likely to play out.
        </p>
      </div>

      <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 -mx-4 mb-4 border-y border-white/[.07] bg-[#0c100d]/95 px-4 py-2.5 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <PinnedStat label="Trip EV" value={money(plan.tripEv)} sub={`${tripHours} hours`} />
          <PinnedStat label="Finish ahead" value={percent(plan.chanceOfProfit)} sub="chance" />
          <PinnedStat label="Trip bust" value={percent(plan.bustProbability)} sub="crosses zero" />
          <PinnedStat label="95% range" value={money(plan.ci95Low)} sub={`to ${money(plan.ci95High)}`} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Section title="Trip setup" summary={`${decks}D · ${money(bankroll)} bankroll · ${tripHours} hours`} icon="fa-suitcase" collapseOnMobile>
          {venuePresets.length > 0 && (
            <div className="mt-4">
              <Select label="Load a venue" defaultValue="" onChange={(event) => event.target.value && loadVenuePreset(event.target.value)}>
                <option value="">Choose a venue…</option>
                {venuePresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
              </Select>
            </div>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Select label="Decks" value={decks} onChange={(event) => { const next = Number(event.target.value) as 6 | 8; setDecks(next); setDealt(GAME_OPTIONS[next][1].dealt); }}><option value={6}>6 decks</option><option value={8}>8 decks</option></Select>
            <Select label="Penetration" value={dealt} onChange={(event) => setDealt(Number(event.target.value))}>{GAME_OPTIONS[decks].map((option) => <option key={option.dealt} value={option.dealt}>{option.dealt} / {decks} dealt</option>)}</Select>
            <div className="flex items-end gap-2">
              <NumberField label="Starting bankroll" value={bankroll} min={0} prefix="$" onValueChange={setBankroll} />
            </div>
            <div className="flex items-end">
              <GhostButton className="w-full" onClick={useJournalBankroll}>Use journal bankroll</GhostButton>
            </div>
            <NumberField label="Betting unit" value={bettingUnit} min={0.01} prefix="$" onValueChange={setBettingUnit} />
            <Select label="Simultaneous hands" value={playerHands} onChange={(event) => setPlayerHands(Number(event.target.value))}>{[1, 2, 3].map((value) => <option key={value} value={value}>{value} hand{value === 1 ? "" : "s"}</option>)}</Select>
            <NumberField label="Hands / hour" value={handsPerHour} min={1} onValueChange={setHandsPerHour} />
            <NumberField label="Trip length (hours)" value={tripHours} min={0.5} step={0.5} onValueChange={setTripHours} />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Switch label="H17" checked={dealerHitsSoft17} onChange={setDealerHitsSoft17} />
            <Switch label="DAS" checked={doubleAfterSplit} onChange={setDoubleAfterSplit} />
            <Switch label="RSA" checked={resplitAces} onChange={setResplitAces} />
            <Switch label="Late surrender" checked={lateSurrender} onChange={setLateSurrender} />
          </div>
          <div className="mt-3">
            <Select label="Blackjack payout" value={blackjackPayout} onChange={(event) => setBlackjackPayout(Number(event.target.value) as 1.5 | 1.2)}><option value={1.5}>3:2</option><option value={1.2}>6:5</option></Select>
          </div>
          {isEstimated(ruleFlags) && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[.06] p-3 text-xs leading-5 text-amber-100/80">
              <i className="fa-solid fa-triangle-exclamation mt-0.5 text-amber-300" aria-hidden="true" />
              <span>Rules away from the audited baseline apply a flat literature-estimated {(sumRuleAdjustment(ruleFlags) * 100).toFixed(2)}pp edge delta rather than a resimulated audit, the same as the Bankroll Lab.</span>
            </p>
          )}
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between"><p className="text-[.8rem] font-medium text-zinc-400">Ramp</p><div className="w-40"><Select label="" aria-label="Ramp preset" defaultValue="1-8" onChange={(event) => RAMPS[event.target.value] && setRamp(expandRamp(RAMPS[event.target.value]))}>{Object.keys(RAMPS).map((name) => <option key={name}>{name}</option>)}</Select></div></div>
            <div className="grid grid-cols-4 gap-2">{ramp.filter((point) => point.trueCount >= -1 && point.trueCount <= 6).map((point) => <NumberField key={point.trueCount} label={`TC ${point.trueCount > 0 ? "+" : ""}${point.trueCount}`} value={point.units} min={0} step={1} onValueChange={(value) => setRamp((current) => current.map((p) => p.trueCount === point.trueCount || (point.trueCount === -1 && p.trueCount < -1) || (point.trueCount === 6 && p.trueCount > 6) ? { ...p, units: Math.max(0, value) } : p))} />)}</div>
          </div>
        </Section>

        <div className="space-y-5">
          <Panel>
            <h2 className="font-semibold">Trip outlook</h2>
            <p className="mt-1 text-xs leading-5 text-amber-200/80"><i className="fa-solid fa-triangle-exclamation mr-1.5" aria-hidden="true" />Analytical (normal-approximation) estimate, not a Monte Carlo simulation. It can understate ruin probability very close to a zero bankroll.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Metric label="Expected ending bankroll" value={money(plan.expectedEndingBankroll, 0)} sub={`95% CI ${money(plan.ci95Low, 0)} to ${money(plan.ci95High, 0)}`} />
              <Metric label="Trip EV" value={money(plan.tripEv, 0)} sub={`± ${money(plan.standardDeviation, 0)} SD`} />
              <Metric label="Chance of finishing ahead" value={percent(plan.chanceOfProfit)} />
              <Metric label="Chance of busting the trip" value={percent(plan.bustProbability)} sub="crosses zero bankroll at any point" />
            </div>
          </Panel>

          <Panel>
            <h2 className="font-semibold">Loss threshold</h2>
            <p className="mt-1 text-xs text-zinc-500">Probability the trip ends down at least this much.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <NumberField label="Loss amount" value={lossThreshold} min={0} prefix="$" onValueChange={setLossThreshold} />
              <Metric label={`P(loss ≥ ${money(lossThreshold, 0)})`} value={percent(plan.lossProbability(lossThreshold))} />
            </div>
          </Panel>

          <Panel>
            <h2 className="font-semibold">Win goal</h2>
            <p className="mt-1 text-xs text-zinc-500">Probability the trip reaches this net win at some point.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <NumberField label="Goal amount" value={goalAmount} min={0} prefix="$" onValueChange={setGoalAmount} />
              <Metric label={`P(reach +${money(goalAmount, 0).replace("+", "")})`} value={percent(plan.goalProbability(goalAmount))} />
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
