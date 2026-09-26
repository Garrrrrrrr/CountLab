"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cvcxLibrary, type CvcxTemplate, type CvcxTemplateConfig, templateHandSchedule } from "@/lib/blackjack/cvcxLibrary";
import { DEFAULT_ADVANTAGE_RULES } from "@/lib/blackjack/advantage";
import { GhostButton, Select } from "./ui";

export function scenarioRules(config: CvcxTemplateConfig) {
  return { ...DEFAULT_ADVANTAGE_RULES, decks: config.decks, penetration: config.dealt / config.decks, dealerHitsSoft17: config.dealerHitsSoft17, doubleAfterSplit: config.doubleAfterSplit, resplitAces: config.resplitAces, lateSurrender: config.lateSurrender, blackjackPayout: config.blackjackPayout, useIndices: config.useIndices !== false };
}
export const scenarioRamp = (config: CvcxTemplateConfig) => config.ramp.map((point) => ({ ...point, units: config.wongInAt !== null && point.trueCount < config.wongInAt ? 0 : point.units }));
export function unsupportedScenario(config: CvcxTemplateConfig, simulation = false) {
  if (config.europeanNoHoleCard || (config.doubleRule && config.doubleRule !== "any2")) return "This tool does not support that hole-card or doubling rule. Keep this scenario in the Game & Bankroll Lab.";
  if (new Set(templateHandSchedule(config).map((point) => point.hands)).size > 1 && simulation) return "The simulator requires the same number of simultaneous hands at every count. Save a separate scenario with a constant hand count.";
  if (simulation && (!config.dealerHitsSoft17 || !config.doubleAfterSplit || !config.resplitAces || !config.lateSurrender || config.blackjackPayout !== 1.5)) return "The simulator supports the audited H17 / DAS / RSA / late surrender / 3:2 game. This scenario's rules were not loaded.";
  return undefined;
}

/** The tools a saved scenario can be opened in, each reading `?scenario=<id>`. */
export const SCENARIO_DESTINATIONS = [["Lab", "/cvcx"], ["Simulate", "/simulation"], ["Compare", "/compare"], ["Plan trip", "/trip-planner"], ["Journal", "/journal"]] as const;
export const scenarioHref = (href: string, id: string) => `${href}?scenario=${encodeURIComponent(id)}`;

export type ScenarioArrival =
  | { status: "none" }
  | { status: "loaded"; scenario: CvcxTemplate }
  | { status: "unsupported"; scenario: CvcxTemplate; reason: string }
  | { status: "missing"; id: string };

/**
 * Applies `?scenario=<id>` once on arrival: loads the saved template through
 * `onLoad` unless `unsupported` gives a reason, and reports what happened so
 * each tool can say so in its own words.
 */
export function useScenarioFromUrl(onLoad: (scenario: CvcxTemplate) => void, unsupported?: (config: CvcxTemplateConfig) => string | undefined): ScenarioArrival {
  const [arrival, setArrival] = useState<ScenarioArrival>({ status: "none" });
  const loadRef = useRef(onLoad), unsupportedRef = useRef(unsupported);
  useEffect(() => { loadRef.current = onLoad; unsupportedRef.current = unsupported; }, [onLoad, unsupported]);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("scenario");
    if (!id) return;
    const scenario = cvcxLibrary.templates().find((entry) => entry.id === id);
    if (!scenario) { setArrival({ status: "missing", id }); return; }
    const reason = unsupportedRef.current?.(scenario.config);
    if (reason) setArrival({ status: "unsupported", scenario, reason });
    else { loadRef.current(scenario); setArrival({ status: "loaded", scenario }); }
  }, []);
  return arrival;
}

/** Reuses the existing, versioned Lab template library across analysis tools. */
export function ScenarioPicker({ onLoad, current, unsupported, disabled = false }: { disabled?: boolean; onLoad: (scenario: CvcxTemplate) => void; current?: () => CvcxTemplateConfig; unsupported?: (config: CvcxTemplateConfig) => string | undefined }) {
  const [templates, setTemplates] = useState<CvcxTemplate[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const arrival = useScenarioFromUrl(onLoad, unsupported);
  useEffect(() => {
    const refresh = () => setTemplates(cvcxLibrary.templates());
    refresh();
    addEventListener(cvcxLibrary.event, refresh);
    return () => removeEventListener(cvcxLibrary.event, refresh);
  }, []);
  useEffect(() => {
    if (arrival.status === "none") return;
    if (arrival.status === "missing") { setNotice("This scenario is not saved on this account and device. Choose a saved scenario below."); return; }
    setSelected(arrival.scenario.id);
    setNotice(arrival.status === "unsupported" ? arrival.reason : `Loaded ${arrival.scenario.name}. Edits here apply to this tool until you save a scenario.`);
  }, [arrival]);
  const chosen = templates.find((entry) => entry.id === selected);
  return <section className="surface no-print mb-5 rounded-xl p-4" aria-label="Shared analysis scenario">
    <details>
      <summary className="cursor-pointer py-1 text-sm font-semibold">Saved scenarios{chosen ? ` · ${chosen.name}` : " · load or save a setup"}</summary>
      <p className="my-3 text-sm text-[var(--ink-muted)]">A scenario is a saved snapshot. Load it to replace this tool’s inputs. Destination links use the saved snapshot; edits here do not travel automatically. Save a new snapshot in the Lab to carry changes forward.</p>
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1"><Select label="Saved scenario" disabled={disabled} value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Choose a scenario from the Lab</option>{templates.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</Select></div>
      <GhostButton disabled={disabled || !chosen} onClick={() => { if (!chosen) return; const reason = unsupported?.(chosen.config); if (reason) { setNotice(reason); return; } onLoad(chosen); setNotice(`Loaded ${chosen.name}. Current inputs replaced; saved scenario unchanged.`); }}>Load scenario</GhostButton>
      {current && <><label className="grid min-w-0 gap-2 text-sm">Scenario name<input className="field min-h-11 rounded-lg px-3" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Weekend 6-deck game" /></label><GhostButton disabled={disabled} onClick={() => { const saved = cvcxLibrary.saveTemplate(current(), name); setSelected(saved.id); setNotice(`Saved ${saved.name}. Use a destination below to carry it forward.`); }}>Save shared scenario</GhostButton></>}
    </div>
    </details>
    {chosen && <p className="mt-3 text-xs text-[var(--ink-muted)]">Open saved snapshot: {chosen.name}</p>}
    {chosen && <div className="mt-3 flex flex-wrap gap-4 text-sm">{SCENARIO_DESTINATIONS.map(([label, href]) => <Link key={href} className="inline-flex min-h-9 items-center text-[var(--accent)] underline" href={scenarioHref(href, chosen.id)}>{label} →</Link>)}</div>}
    {notice && <p role="status" className="mt-3 text-sm text-[var(--ink-muted)]">{notice}</p>}
  </section>;
}
