"use client";
import Link from "next/link";
import { Fragment, useId, useMemo, useState, type ReactNode } from "react";
import { Ban, ChevronDown, Clock, SlidersHorizontal } from "lucide-react";
import { Button, Callout, Segmented, SelectField, TextField, Toggle, cx, toast } from "@/components/ui";
import { analytics } from "@/lib/analytics";
import { track } from "@/lib/analytics/track";
import { calculateCountRows, fillRampFromTrueCount, RAMPS, type AdvantageRules, type CountRow, type RampPoint } from "@/lib/blackjack/advantage";
import { GAME_OPTIONS } from "@/lib/blackjack/coefficients";
import type { CvcxTemplate } from "@/lib/blackjack/cvcxLibrary";
import {
  applyVenue, expandRamp, gameFromScenario, gameFromSimulationSetup, handsScheduleOf, handsSummary, normalizeHands,
  penetrationLabel, penetrationOptions, rampSummary, rulesOf, rulesSummary, sourceLabel, spreadLabel,
  type GameDraft, type GameSource,
} from "@/lib/blackjack/journalForm";
import { shortDate } from "@/lib/blackjack/journalFormat";
import { isEstimated, ruleAdjustmentFlagsFromRules, sumRuleAdjustment } from "@/lib/blackjack/ruleAdjustments";
import { scenarioRamp, unsupportedScenario } from "@/lib/blackjack/scenarios";
import type { SimulationTemplate } from "@/lib/blackjack/simulationLibrary";
import { venuePresetLibrary, type VenuePreset } from "@/lib/blackjack/venuePresets";
import { exactMoney } from "./model";
import { Disclosure, NumberField } from "./parts";
import { calculatorHref } from "./useScenarioArrival";

const MAX_VENUES = 20;
const pct = (value: number, digits: number) => `${(value * 100).toFixed(digits)}%`;
const signedPct = (value: number, digits: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value * 100).toFixed(digits)}%`;

/** "TC ≤ 0 $25 · +1 $50 · …": each count and its bet stay together and the line wraps between them. */
export function RampLine({ ramp, unit, className }: { ramp: RampPoint[]; unit: number; className?: string }) {
  return (
    <p className={cx("tnum rounded-xl bg-surface-2 px-3 py-2 text-xs leading-6 text-ink", className)}>
      <span className="sr-only">Bet by true count: </span>
      {rampSummary(ramp, unit).map((group, index) => (
        <Fragment key={group.counts}>
          {index > 0 && <span aria-hidden className="text-ink-3"> · </span>}
          <span className="whitespace-nowrap">{index === 0 ? "TC " : ""}{group.counts} <b className={group.bet === "sit out" ? "font-normal italic text-ink-3" : "font-semibold"}>{group.bet}</b></span>
        </Fragment>
      ))}
    </p>
  );
}

/** The table rules: decks, penetration, payout, play, and the four rule switches. Shared by the session form and the venue sheet. */
export function TableRulesFields({ game, onChange }: { game: GameDraft; onChange: (patch: Partial<GameDraft>) => void }) {
  const flags = ruleAdjustmentFlagsFromRules(rulesOf(game));
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 gap-3 xs:grid-cols-2">
        <SelectField label="Decks" value={game.decks} onChange={(event) => { const decks = Number(event.target.value) as 6 | 8; onChange({ decks, dealt: GAME_OPTIONS[decks][1].dealt }); }}>
          <option value={6}>6 decks</option>
          <option value={8}>8 decks</option>
        </SelectField>
        <SelectField label="Penetration" hint="How much of the shoe is dealt before the shuffle." value={game.dealt} onChange={(event) => onChange({ dealt: Number(event.target.value) })}>
          {penetrationOptions(game.decks, game.dealt).map((dealt) => <option key={dealt} value={dealt}>{penetrationLabel(dealt, game.decks)}</option>)}
        </SelectField>
        <SelectField label="Blackjack pays" value={game.blackjackPayout} onChange={(event) => onChange({ blackjackPayout: Number(event.target.value) as 1.5 | 1.2 })}>
          <option value={1.5}>3:2</option>
          <option value={1.2}>6:5</option>
        </SelectField>
        <SelectField label="Play" value={game.useIndices ? "indices" : "basic"} onChange={(event) => onChange({ useIndices: event.target.value === "indices" })}>
          <option value="indices">Basic strategy and index plays</option>
          <option value="basic">Basic strategy only</option>
        </SelectField>
      </div>
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-line p-3">
        <Toggle label="Dealer hits soft 17" checked={game.dealerHitsSoft17} onChange={(value) => onChange({ dealerHitsSoft17: value })} />
        <Toggle label="Double after splitting" checked={game.doubleAfterSplit} onChange={(value) => onChange({ doubleAfterSplit: value })} />
        <Toggle label="Resplit aces" checked={game.resplitAces} onChange={(value) => onChange({ resplitAces: value })} />
        <Toggle label="Late surrender" checked={game.lateSurrender} onChange={(value) => onChange({ lateSurrender: value })} />
      </div>
      {isEstimated(flags) && (
        <Callout tone="warn">Rules away from the audited H17 · DAS · RSA · LS · 3:2 game apply a flat literature-estimated {(sumRuleAdjustment(flags) * 100).toFixed(2)} percentage-point edge change rather than a fresh simulation, as the Calculator does.</Callout>
      )}
    </div>
  );
}

/** The spread preset plus the line it bets. */
export function SpreadField({ game, onChange }: { game: GameDraft; onChange: (patch: Partial<GameDraft>) => void }) {
  return (
    <SelectField label="Bet spread" value={game.spread} onChange={(event) => { const spread = event.target.value; if (RAMPS[spread]) onChange({ spread, ramp: expandRamp(RAMPS[spread]) }); }}>
      {Object.keys(RAMPS).map((spread) => <option key={spread} value={spread}>{spread.replace("-", "–")} units</option>)}
      {game.spread === "Custom" && <option value="Custom">Custom ({spreadLabel(game.ramp)})</option>}
    </SelectField>
  );
}

/**
 * Bet and hands at each true count, one compact row per count so it fits a
 * phone sheet. Typing a bet fills the counts it implies, so bets never drop as
 * the count rises; Sit out removes one count only, which is how you wong out.
 */
function BetPerCount({ rows, onBet, onSitOut, onHands }: { rows: CountRow[]; onBet: (trueCount: number, bet: number) => void; onSitOut: (trueCount: number) => void; onHands: (trueCount: number, hands: number) => void }) {
  const idBase = useId();
  return (
    <div className="grid grid-cols-1 gap-1.5" data-enter-local="">
      <div aria-hidden className="grid grid-cols-[3.25rem_minmax(0,1fr)_4.25rem_2.75rem] gap-1.5 px-0.5 text-[0.6875rem] font-medium text-ink-3">
        <span>Count</span><span>Bet per hand</span><span>Hands</span><span />
      </div>
      {rows.map((row) => (
        <div key={row.trueCount} className="grid grid-cols-[3.25rem_minmax(0,1fr)_4.25rem_2.75rem] items-center gap-1.5">
          <div className="min-w-0 leading-tight">
            <span className={cx("tnum block text-sm font-bold", row.trueCount > 0 ? "text-pos" : row.trueCount < 0 ? "text-neg" : "text-ink")}>{row.label.replace("-", "−")}</span>
            <span className="tnum block text-[0.625rem] text-ink-3" title={`${pct(row.frequency, 2)} of rounds, ${signedPct(row.advantage, 2)} edge`}>{pct(row.frequency, 1)} · {signedPct(row.advantage, 1)}</span>
          </div>
          <NumberField
            label={`Bet at true count ${row.label}`}
            labelClassName="sr-only"
            prefix="$"
            min={0}
            value={Math.round(row.bet * 100) / 100}
            onValueChange={(bet) => onBet(row.trueCount, bet)}
          />
          <div className="relative">
            <label className="sr-only" htmlFor={`${idBase}-hands-${row.trueCount}`}>Hands at true count {row.label}</label>
            <select id={`${idBase}-hands-${row.trueCount}`} value={row.playerHands} onChange={(event) => onHands(row.trueCount, Number(event.target.value))}
              className="h-12 w-full appearance-none rounded-xl border border-line bg-surface-2 pl-3 pr-6 text-base text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25">
              {[1, 2, 3].map((hands) => <option key={hands} value={hands}>{hands}</option>)}
            </select>
            <ChevronDown size={14} aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-3" />
          </div>
          <button type="button" aria-label={`Sit out at true count ${row.label}`} title="Sit out" disabled={row.bet === 0} onClick={() => onSitOut(row.trueCount)}
            className="grid grid-cols-1 h-11 w-11 place-items-center rounded-xl border border-line text-ink-2 transition hover:text-ink disabled:opacity-30">
            <Ban size={17} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Where to start a game from: saved venues, Calculator scenarios and Simulator setups. */
function StartFrom({ presets, scenarios, setups, onPick }: { presets: VenuePreset[]; scenarios: CvcxTemplate[]; setups: SimulationTemplate[]; onPick: (value: string) => void }) {
  const duplicateNames = new Set(presets.map((preset) => preset.name.trim().toLocaleLowerCase()).filter((name, index, all) => all.indexOf(name) !== index));
  if (presets.length + scenarios.length + setups.length === 0) {
    return <p className="text-sm leading-6 text-ink-2">No saved games yet. Save this game as a venue below, or build one in the <Link href="/calculator" className="font-semibold text-brand-text underline underline-offset-4">Calculator</Link>.</p>;
  }
  return (
    <SelectField label="Start from" hint="Replaces the game below. Date, hours and result stay." value="" onChange={(event) => onPick(event.target.value)}>
      <option value="">Choose a saved game…</option>
      {presets.length > 0 && <optgroup label="Saved venues">{presets.map((preset) => <option key={preset.id} value={`venue:${preset.id}`}>{duplicateNames.has(preset.name.trim().toLocaleLowerCase()) ? `${preset.name} (saved ${shortDate(preset.createdAt.slice(0, 10))})` : preset.name}</option>)}</optgroup>}
      {scenarios.length > 0 && <optgroup label="Calculator scenarios">{scenarios.map((scenario) => { const reason = unsupportedScenario(scenario.config); return <option key={scenario.id} value={`scenario:${scenario.id}`} disabled={Boolean(reason)}>{scenario.name}{reason ? " (not supported here)" : ""}</option>; })}</optgroup>}
      {setups.length > 0 && <optgroup label="Simulator setups">{setups.map((setup) => <option key={setup.id} value={`setup:${setup.id}`}>{setup.name}</option>)}</optgroup>}
    </SelectField>
  );
}

/** Saves the game's rules and spread as a named venue, asking before it replaces one with the same name. */
function SaveVenue({ rules, ramp, location, presets, onSaved }: { rules: AdvantageRules; ramp: RampPoint[]; location: string; presets: VenuePreset[]; onSaved: (name: string) => void }) {
  const [venueName, setVenueName] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<VenuePreset | null>(null);
  const [status, setStatus] = useState("");
  const name = (venueName ?? location).trim();
  const existing = presets.filter((preset) => preset.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const oldest = [...presets].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  const save = (mode: "check" | "replace" | "new") => {
    if (!name) return;
    if (mode === "check" && existing) { setReplacing(existing); return; }
    if (mode === "replace" && replacing) venuePresetLibrary.deletePreset(replacing.id);
    venuePresetLibrary.savePreset(name, rules, ramp);
    onSaved(name);
    setReplacing(null);
    setVenueName(null);
    const message = `Venue “${name}” saved.`;
    setStatus(message);
    toast(message, "pos");
  };
  return (
    <div className="grid grid-cols-1 gap-3" data-enter-local="">
      <div className="flex flex-wrap items-end gap-2">
        <TextField
          className="min-w-0 flex-1 basis-48"
          label="Venue name"
          value={venueName ?? location}
          placeholder="e.g. Downtown casino"
          onChange={(event) => { setVenueName(event.target.value); setReplacing(null); }}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); save("check"); } }}
        />
        <Button variant="secondary" disabled={!name} onClick={() => save("check")}>Save venue</Button>
      </div>
      {replacing ? (
        <Callout tone="info" action={<div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" className="h-11" onClick={() => save("replace")}>Replace</Button><Button size="sm" variant="secondary" className="h-11" onClick={() => save("new")}>Save as new</Button></div>}>
          You already have a venue called “{replacing.name}” (saved {shortDate(replacing.createdAt.slice(0, 10))}). Replace it with this game?
        </Callout>
      ) : (
        <p className="text-xs leading-5 text-ink-3">
          Saves these rules and this spread for reuse here and in the Calculator. Stored on this device only.
          {presets.length >= MAX_VENUES && oldest && ` You have ${MAX_VENUES} saved venues, the most CountLab keeps, so saving removes the oldest, “${oldest.name}”.`}
        </p>
      )}
      <p role="status" className="text-sm font-medium text-pos empty:hidden">{status}</p>
    </div>
  );
}

/**
 * The game a session was played under, summarised in two lines and edited on
 * demand. It starts from the latest session (or a saved venue, Calculator
 * scenario or Simulator setup), so a typical log never opens it.
 */
export function GameEditor({ game, source, onGame, location, onLocation, hours, presets, scenarios, setups, defaultOpen, linkedScenarioId }: {
  game: GameDraft;
  source: GameSource;
  onGame: (game: GameDraft, source: GameSource) => void;
  location: string;
  /** Saved venues also name the casino. */
  onLocation: (name: string) => void;
  hours: number;
  presets: VenuePreset[];
  scenarios: CvcxTemplate[];
  setups: SimulationTemplate[];
  defaultOpen: boolean;
  /** A scenario whose Calculator link is already on screen, so the source line doesn't repeat it. */
  linkedScenarioId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const titleId = useId();
  const rules = useMemo(() => rulesOf(game), [game]);
  const schedule = useMemo(() => handsScheduleOf(game), [game]);
  const rows = useMemo(() => calculateCountRows({ bankroll: 0, rules, ramp: game.ramp, bettingUnit: game.bettingUnit, playerHands: game.playerHands, handsByTrueCount: schedule, handsPerHour: game.handsPerHour, hours }), [rules, game, schedule, hours]);
  const edit = (patch: Partial<GameDraft>) => onGame({ ...game, ...patch }, { kind: "edited" });

  const startFrom = (value: string) => {
    const split = value.indexOf(":");
    const [kind, id] = [value.slice(0, split), value.slice(split + 1)];
    if (kind === "venue") {
      const preset = presets.find((item) => item.id === id);
      if (!preset) return;
      onGame(applyVenue(game, preset), { kind: "venue", name: preset.name });
      onLocation(preset.name);
    } else if (kind === "scenario") {
      const scenario = scenarios.find((item) => item.id === id);
      if (!scenario || unsupportedScenario(scenario.config)) return;
      onGame(gameFromScenario(scenario.config, scenarioRamp(scenario.config)), { kind: "scenario", name: scenario.name, id: scenario.id });
    } else if (kind === "setup") {
      const setup = setups.find((item) => item.id === id);
      if (!setup) return;
      onGame(gameFromSimulationSetup(setup.config), { kind: "setup", name: setup.name });
      track("journal_prefilled_from_template", { name: setup.name });
    } else return;
    analytics.track("preset_selected", { calculator: "session_journal", preset: kind });
  };

  const sourceText = source.kind === "scenario" ? sourceLabel(source).replace("Lab scenario", "Calculator scenario") : sourceLabel(source);
  let sourceLink: ReactNode = null;
  if (source.kind === "scenario" && source.id !== linkedScenarioId) sourceLink = <Link href={calculatorHref(source.id)} className="inline-flex min-h-11 items-center font-semibold text-brand-text underline underline-offset-4">Open in Calculator</Link>;

  return (
    <section aria-labelledby={titleId} className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-line bg-surface-2 p-3.5">
        <div className="min-w-0 flex-1 basis-56">
          <h3 id={titleId} className="text-sm font-semibold">Game and betting</h3>
          <p className="mt-1 text-sm text-ink">{rulesSummary(rules)}</p>
          <p className="text-sm text-ink-2">{exactMoney(game.bettingUnit)} unit · {spreadLabel(game.ramp)} spread · {game.handsPerHour} hands/hour · {handsSummary(game)}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-3"><Clock size={13} aria-hidden className="shrink-0" />{sourceText}</p>
          {sourceLink}
        </div>
        <Button variant="outline" size="sm" className="h-11" aria-expanded={open} aria-controls={panelId} icon={<SlidersHorizontal size={16} aria-hidden />}
          trailing={<ChevronDown size={16} aria-hidden className={cx("transition-transform", open && "rotate-180")} />}
          onClick={() => {
            if (!open) track("result_expanded", { feature: "session_journal", section: "change_game" });
            setOpen(!open);
          }}>
          Change game
        </Button>
      </div>
      <div id={panelId} hidden={!open} className="mt-5">
        {open && (
          <div className="grid grid-cols-1 gap-6">
            <StartFrom presets={presets} scenarios={scenarios} setups={setups} onPick={startFrom} />
            <div className="grid grid-cols-1 gap-3">
              <h4 className="eyebrow">Table</h4>
              <TableRulesFields game={game} onChange={edit} />
            </div>
            <div className="grid grid-cols-1 gap-3">
              <h4 className="eyebrow">Betting</h4>
              <div className="grid grid-cols-1 items-start gap-3 xs:grid-cols-2">
                <NumberField label="Betting unit" prefix="$" min={0.01} value={game.bettingUnit} onValueChange={(value) => edit({ bettingUnit: value })} />
                <NumberField label="Hands per hour" min={1} value={game.handsPerHour} onValueChange={(value) => edit({ handsPerHour: value })} />
                <div className="min-w-0">
                  <Segmented<number> label="Hands at once" value={game.playerHands} onChange={(value) => edit({ ...normalizeHands(value, game.handsByCount) })}
                    options={[1, 2, 3].map((value) => ({ value, label: String(value) }))} />
                  <p className="mt-1.5 text-xs leading-5 text-ink-3">Used at every count without its own setting below.</p>
                </div>
                <SpreadField game={game} onChange={edit} />
              </div>
              <RampLine ramp={game.ramp} unit={game.bettingUnit} />
              <Disclosure summary="Customize bet per count" onOpen={() => track("result_expanded", { feature: "session_journal", section: "customize_bet_per_count" })}>
                <p className="mb-3 text-xs leading-5 text-ink-2">Typing a bet fills the higher counts too, so bets never drop as the count rises. Sit out removes one count only. Each count shows how often it comes up and your edge there.</p>
                <BetPerCount
                  rows={rows}
                  onBet={(trueCount, bet) => edit({ spread: "Custom", ramp: fillRampFromTrueCount(game.ramp, trueCount, game.bettingUnit > 0 ? Math.max(0, bet) / game.bettingUnit : 0) })}
                  onSitOut={(trueCount) => edit({ spread: "Custom", ramp: game.ramp.map((point) => point.trueCount === trueCount ? { ...point, units: 0 } : point) })}
                  onHands={(trueCount, hands) => edit(normalizeHands(game.playerHands, { ...game.handsByCount, [trueCount]: hands }))}
                />
              </Disclosure>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <h4 className="eyebrow">Save as a venue</h4>
              <SaveVenue rules={rules} ramp={game.ramp} location={location} presets={presets} onSaved={onLocation} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
