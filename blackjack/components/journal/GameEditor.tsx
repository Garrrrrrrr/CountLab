"use client";
import Link from "next/link";
import { Fragment, useId, useMemo, useState } from "react";
import { analytics } from "@/lib/analytics";
import { track } from "@/lib/analytics/track";
import { calculateCountRows, fillRampFromTrueCount, RAMPS } from "@/lib/blackjack/advantage";
import { GAME_OPTIONS } from "@/lib/blackjack/coefficients";
import type { CvcxTemplate } from "@/lib/blackjack/cvcxLibrary";
import {
  applyVenue, expandRamp, gameFromScenario, gameFromSimulationSetup, handsScheduleOf, handsSummary, normalizeHands,
  penetrationLabel, penetrationOptions, rampSummary, rulesOf, rulesSummary, sourceLabel, spreadLabel,
  type GameDraft, type GameSource,
} from "@/lib/blackjack/journalForm";
import { money, shortDate } from "@/lib/blackjack/journalFormat";
import { isEstimated, ruleAdjustmentFlagsFromRules, sumRuleAdjustment } from "@/lib/blackjack/ruleAdjustments";
import type { SimulationTemplate } from "@/lib/blackjack/simulationLibrary";
import { venuePresetLibrary, type VenuePreset } from "@/lib/blackjack/venuePresets";
import { BetSpreadTable } from "../BetSpreadTable";
import { SCENARIO_DESTINATIONS, scenarioHref, scenarioRamp, unsupportedScenario } from "../ScenarioPicker";
import { Callout, Disclosure, GhostButton, NumberField, Select, Switch, TextField, toast } from "../ui";
import { FieldGroupTitle } from "./parts";

const MAX_VENUES = 20;

/** Links that carry a Lab scenario on to the other tools that read `?scenario=`. */
export function ScenarioLinks({ id }: { id: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>Open in:</span>
      {SCENARIO_DESTINATIONS.filter(([, href]) => href !== "/journal").map(([label, href]) => (
        <Link key={href} href={scenarioHref(href, id)} className="inline-flex min-h-9 items-center font-semibold text-[var(--accent)] underline underline-offset-2 hover:no-underline">{label}</Link>
      ))}
    </span>
  );
}

/**
 * The game a session was played under, summarised in three lines and edited
 * on demand. It starts from the latest session (or a saved venue, Lab
 * scenario or Simulator setup), so a typical log never opens it.
 */
export function GameEditor({ game, source, onGame, location, onLocation, hours, presets, scenarios, setups, defaultOpen }: {
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
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [venueName, setVenueName] = useState<string | null>(null);
  const [venueStatus, setVenueStatus] = useState("");
  const [replacing, setReplacing] = useState<VenuePreset | null>(null);
  const panelId = useId();
  const titleId = useId();
  const rules = useMemo(() => rulesOf(game), [game]);
  const schedule = useMemo(() => handsScheduleOf(game), [game]);
  const rows = useMemo(() => calculateCountRows({ bankroll: 0, rules, ramp: game.ramp, bettingUnit: game.bettingUnit, playerHands: game.playerHands, handsByTrueCount: schedule, handsPerHour: game.handsPerHour, hours }), [rules, game, schedule, hours]);
  const flags = ruleAdjustmentFlagsFromRules(rules);
  const edit = (patch: Partial<GameDraft>) => onGame({ ...game, ...patch }, { kind: "edited" });
  const duplicateNames = new Set(presets.map((preset) => preset.name.trim().toLocaleLowerCase()).filter((name, index, all) => all.indexOf(name) !== index));

  const startFrom = (value: string) => {
    const [kind, id] = [value.slice(0, value.indexOf(":")), value.slice(value.indexOf(":") + 1)];
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

  const name = (venueName ?? location).trim();
  const existing = presets.filter((preset) => preset.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const oldest = [...presets].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  const saveVenue = (mode: "check" | "replace" | "new") => {
    if (!name) return;
    if (mode === "check" && existing) { setReplacing(existing); return; }
    if (mode === "replace" && replacing) venuePresetLibrary.deletePreset(replacing.id);
    venuePresetLibrary.savePreset(name, rules, game.ramp);
    onLocation(name);
    setReplacing(null);
    setVenueName(null);
    const message = `Venue “${name}” saved.`;
    setVenueStatus(message);
    toast({ message });
  };

  return (
    <section aria-labelledby={titleId}>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[var(--rule)] bg-[var(--paper)] p-3.5">
        <div className="min-w-0 flex-1 basis-60">
          <h3 id={titleId} className="text-sm font-semibold">Game &amp; betting</h3>
          <p className="mt-1 text-sm text-[var(--ink)]">{rulesSummary(rules)}</p>
          <p className="text-sm text-[var(--ink-muted)]">{money(game.bettingUnit, game.bettingUnit % 1 ? 2 : 0)} unit · {spreadLabel(game.ramp)} spread · {game.handsPerHour} hands/hour · {handsSummary(game)}</p>
          <div role="status" className="mt-1 text-xs text-[var(--ink-muted)]">
            <p><i className="fa-solid fa-clock-rotate-left mr-1.5" aria-hidden="true" />{sourceLabel(source)}</p>
            {venueStatus && <p className="mt-0.5 font-medium text-[var(--accent)]"><i className="fa-solid fa-check mr-1.5" aria-hidden="true" />{venueStatus}</p>}
          </div>
          {source.kind === "scenario" && <div className="mt-1 text-xs text-[var(--ink-muted)]"><ScenarioLinks id={source.id} /></div>}
        </div>
        <GhostButton
          type="button"
          size="compact"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            if (!open) analytics.track("result_expanded", { feature: "session_journal", section: "change_game" });
            setOpen(!open);
          }}
        >
          <i className="fa-solid fa-sliders mr-2 text-xs" aria-hidden="true" />Change game<i className={`fa-solid fa-chevron-down ml-2 text-[.65rem] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </GhostButton>
      </div>
      {open && (
        <div id={panelId} className="mt-5 grid gap-6">
          <div>
            {presets.length + scenarios.length + setups.length > 0 ? (
              <>
                <Select label="Start from" value="" data-analytics-field="start_from" onChange={(event) => startFrom(event.target.value)}>
                  <option value="">Choose a saved game…</option>
                  {presets.length > 0 && <optgroup label="Saved venues">{presets.map((preset) => <option key={preset.id} value={`venue:${preset.id}`}>{duplicateNames.has(preset.name.trim().toLocaleLowerCase()) ? `${preset.name} (saved ${shortDate(preset.createdAt.slice(0, 10))})` : preset.name}</option>)}</optgroup>}
                  {scenarios.length > 0 && <optgroup label="Lab scenarios">{scenarios.map((scenario) => { const reason = unsupportedScenario(scenario.config); return <option key={scenario.id} value={`scenario:${scenario.id}`} disabled={Boolean(reason)}>{scenario.name}{reason ? " — not supported here" : ""}</option>; })}</optgroup>}
                  {setups.length > 0 && <optgroup label="Simulator setups">{setups.map((setup) => <option key={setup.id} value={`setup:${setup.id}`}>{setup.name}</option>)}</optgroup>}
                </Select>
                <p className="mt-1.5 text-xs text-[var(--ink-muted)]">Replaces the game below. Date, hours and result stay.</p>
              </>
            ) : (
              <p className="text-sm text-[var(--ink-muted)]">No saved games yet. Save this game as a venue below, or build one in the <Link href="/cvcx" className="font-semibold text-[var(--accent)] underline underline-offset-2">Game &amp; Bankroll Lab</Link>.</p>
            )}
          </div>

          <div className="grid gap-3">
            <FieldGroupTitle>Table</FieldGroupTitle>
            <div className="grid grid-cols-1 items-start gap-3 min-[420px]:grid-cols-2">
              <Select label="Decks" data-analytics-field="decks" value={game.decks} onChange={(event) => { const decks = Number(event.target.value) as 6 | 8; edit({ decks, dealt: GAME_OPTIONS[decks][1].dealt }); }}>
                <option value={6}>6 decks</option>
                <option value={8}>8 decks</option>
              </Select>
              <div className="grid gap-1.5">
                <Select label="Penetration" data-analytics-field="penetration" value={game.dealt} onChange={(event) => edit({ dealt: Number(event.target.value) })}>
                  {penetrationOptions(game.decks, game.dealt).map((dealt) => <option key={dealt} value={dealt}>{penetrationLabel(dealt, game.decks)}</option>)}
                </Select>
                <p className="text-xs text-[var(--ink-muted)]">How much of the shoe is dealt before the shuffle.</p>
              </div>
              <Select label="Blackjack payout" data-analytics-field="blackjack_payout" value={game.blackjackPayout} onChange={(event) => edit({ blackjackPayout: Number(event.target.value) as 1.5 | 1.2 })}>
                <option value={1.5}>3:2</option>
                <option value={1.2}>6:5</option>
              </Select>
              <Select label="Play variation" data-analytics-field="play_variation" value={game.useIndices ? "indices" : "basic"} onChange={(event) => edit({ useIndices: event.target.value === "indices" })}>
                <option value="indices">H17/S17 Pro indices</option>
                <option value="basic">Basic strategy only</option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Switch label="Dealer hits soft 17" checked={game.dealerHitsSoft17} onChange={(value) => edit({ dealerHitsSoft17: value })} />
              <Switch label="Double after splitting" checked={game.doubleAfterSplit} onChange={(value) => edit({ doubleAfterSplit: value })} />
              <Switch label="Resplitting aces" checked={game.resplitAces} onChange={(value) => edit({ resplitAces: value })} />
              <Switch label="Late surrender" checked={game.lateSurrender} onChange={(value) => edit({ lateSurrender: value })} />
            </div>
            {isEstimated(flags) && (
              <Callout tone="warn">Rules set away from the audited baseline apply a flat literature-estimated {(sumRuleAdjustment(flags) * 100).toFixed(2)}pp edge delta rather than a resimulated audit, the same as the Bankroll Lab.</Callout>
            )}
          </div>

          <div className="grid gap-3">
            <FieldGroupTitle>Betting</FieldGroupTitle>
            <div className="grid grid-cols-1 items-start gap-3 min-[420px]:grid-cols-2">
              <NumberField label="Betting unit" prefix="$" min={0.01} inputStep="any" analyticsField="betting_unit" value={game.bettingUnit} onValueChange={(value) => edit({ bettingUnit: value })} />
              <NumberField label="Hands per hour" min={1} analyticsField="hands_hour" value={game.handsPerHour} onValueChange={(value) => edit({ handsPerHour: value })} />
              <div className="grid gap-1.5">
                <Select label="Hands at once" data-analytics-field="default_hands" value={game.playerHands} onChange={(event) => edit({ ...normalizeHands(Number(event.target.value), game.handsByCount) })}>
                  {[1, 2, 3].map((value) => <option key={value} value={value}>{value} hand{value === 1 ? "" : "s"}</option>)}
                </Select>
                <p className="text-xs text-[var(--ink-muted)]">Used at every count unless you set hands per count below.</p>
              </div>
              <Select label="Bet spread" data-analytics-field="ramp_preset" value={game.spread} onChange={(event) => { const spread = event.target.value; if (RAMPS[spread]) edit({ spread, ramp: expandRamp(RAMPS[spread]) }); }}>
                {Object.keys(RAMPS).map((spread) => <option key={spread} value={spread}>{spread}</option>)}
                {game.spread === "Custom" && <option value="Custom">Custom</option>}
              </Select>
            </div>
            <p className="rounded-xl bg-overlay/[.04] px-3 py-2 font-data text-xs leading-6 text-[var(--ink)]">
              <span className="sr-only">Bet by true count: </span>
              {rampSummary(game.ramp, game.bettingUnit).map((group, index) => (
                // Each count and its bet stay together; the line wraps between them.
                <Fragment key={group.counts}>
                  {index > 0 && <span aria-hidden="true" className="text-[var(--ink-muted)]"> · </span>}
                  <span className="whitespace-nowrap">{index === 0 ? "TC " : ""}{group.counts} <b className={group.bet === "sit out" ? "font-normal italic text-[var(--ink-muted)]" : ""}>{group.bet}</b></span>
                </Fragment>
              ))}
            </p>
            <Disclosure summary="Customize bet per count" analyticsSection="customize_bet_per_count">
              <p className="mb-3 text-xs leading-5 text-[var(--ink-muted)]">Typing a bet fills the counts it implies, so bets never drop as the count rises. <b className="font-semibold text-[var(--ink)]">Sit out</b> removes one count only — that&apos;s how you wong out. Hands per count override Hands at once.</p>
              {/* Bleeds to the sheet's edges so the compact table fits a 40rem sheet without scrolling sideways. */}
              <div data-enter-local="" className="-mx-5 px-2">
                <BetSpreadTable
                  layout="container"
                  density="compact"
                  rows={rows}
                  onBetChange={(trueCount, bet) => edit({ spread: "Custom", ramp: fillRampFromTrueCount(game.ramp, trueCount, game.bettingUnit > 0 ? Math.max(0, bet) / game.bettingUnit : 0) })}
                  onZeroBet={(trueCount) => edit({ spread: "Custom", ramp: game.ramp.map((point) => point.trueCount === trueCount ? { ...point, units: 0 } : point) })}
                  onHandsChange={(trueCount, hands) => edit(normalizeHands(game.playerHands, { ...game.handsByCount, [trueCount]: hands }))}
                />
              </div>
            </Disclosure>
          </div>

          <div className="grid gap-3" data-enter-local="">
            <FieldGroupTitle>Save as a venue</FieldGroupTitle>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1 basis-48">
                <TextField
                  label="Venue name"
                  data-analytics-field="venue_name"
                  value={venueName ?? location}
                  placeholder="e.g. Downtown casino"
                  onChange={(event) => { setVenueName(event.target.value); setReplacing(null); }}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveVenue("check"); } }}
                />
              </div>
              <GhostButton type="button" disabled={!name} onClick={() => saveVenue("check")}>Save venue</GhostButton>
            </div>
            {replacing ? (
              <Callout tone="info" action={<><GhostButton type="button" size="compact" onClick={() => saveVenue("replace")}>Replace</GhostButton><GhostButton type="button" size="compact" onClick={() => saveVenue("new")}>Save as new</GhostButton></>}>
                You already have a saved venue called “{replacing.name}” (saved {shortDate(replacing.createdAt.slice(0, 10))}). Replace it with this game?
              </Callout>
            ) : (
              <p className="text-xs leading-5 text-[var(--ink-muted)]">
                Saves these rules and this spread for reuse here and in the Lab, Simulator, Compare and Trip Planner. Stored on this device only.
                {presets.length >= MAX_VENUES && oldest && ` You have ${MAX_VENUES} saved venues, the most CountLab keeps, so saving removes the oldest, “${oldest.name}”.`}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
