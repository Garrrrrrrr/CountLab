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

/** Reuses the existing, versioned Lab template library across analysis tools. */
export function ScenarioPicker({ onLoad, current, unsupported, disabled = false }: { disabled?: boolean; onLoad: (scenario: CvcxTemplate) => void; current?: () => CvcxTemplateConfig; unsupported?: (config: CvcxTemplateConfig) => string | undefined }) {
  const [templates, setTemplates] = useState<CvcxTemplate[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const loadRef = useRef(onLoad), unsupportedRef = useRef(unsupported);
  useEffect(() => { loadRef.current = onLoad; unsupportedRef.current = unsupported; }, [onLoad, unsupported]);
  useEffect(() => {
    const refresh = () => setTemplates(cvcxLibrary.templates());
    refresh();
    const id = new URLSearchParams(location.search).get("scenario");
    const scenario = cvcxLibrary.templates().find((entry) => entry.id === id);
    if (scenario) {
      setSelected(scenario.id);
      const reason = unsupportedRef.current?.(scenario.config);
      if (reason) setNotice(reason);
      else { loadRef.current(scenario); setNotice(`Loaded ${scenario.name}. Edits here apply to this tool until you save a scenario.`); }
    } else if (id) setNotice("This scenario is not saved on this account and device. Choose a saved scenario below.");
    addEventListener(cvcxLibrary.event, refresh);
    return () => removeEventListener(cvcxLibrary.event, refresh);
  }, []);
  const chosen = templates.find((entry) => entry.id === selected);
  return <section className="surface no-print mb-5 rounded-xl p-4" aria-label="Shared analysis scenario">
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-48 flex-1"><Select label="Saved scenario" value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Choose a scenario from the Lab</option>{templates.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</Select></div>
      <GhostButton disabled={disabled || !chosen} onClick={() => { if (!chosen) return; const reason = unsupported?.(chosen.config); if (reason) { setNotice(reason); return; } onLoad(chosen); setNotice(`Loaded ${chosen.name}. Current inputs replaced; saved scenario unchanged.`); }}>Load scenario</GhostButton>
      {current && <><label className="grid gap-2 text-sm">Scenario name<input className="field min-h-11 rounded-lg px-3" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Weekend 6-deck game" /></label><GhostButton onClick={() => { const saved = cvcxLibrary.saveTemplate(current(), name); setSelected(saved.id); setNotice(`Saved ${saved.name}. Use a destination below to carry it forward.`); }}>Save shared scenario</GhostButton></>}
    </div>
    {chosen && <div className="mt-3 flex flex-wrap gap-4 text-sm">{[["Lab", "/cvcx"], ["Simulate", "/simulation"], ["Compare", "/compare"], ["Plan trip", "/trip-planner"], ["Journal", "/journal"]].map(([label, href]) => <Link key={href} className="inline-flex min-h-9 items-center text-[var(--accent)] underline" href={`${href}?scenario=${encodeURIComponent(chosen.id)}`}>{label} →</Link>)}</div>}
    {notice && <p role="status" className="mt-3 text-sm text-[var(--ink-muted)]">{notice}</p>}
  </section>;
}
