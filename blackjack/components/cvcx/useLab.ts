"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics/track";
import { RAMPS } from "@/lib/blackjack/advantage";
import { analyzeCvcx, createOptimalRamp, riskSizedUnit } from "@/lib/blackjack/cvcx";
import { cvcxLibrary, type CvcxTemplate } from "@/lib/blackjack/cvcxLibrary";
import {
  AUDITED_RULES,
  changedFields,
  configKey,
  CUSTOM_RAMP_NAME,
  DEFAULT_LAB_CONFIG,
  isPresetName,
  labDraftKey,
  normalizeConfig,
  OPTIMAL_RAMP_NAME,
  parseLabDraft,
  presetRamp,
  rampSpread,
  toTemplateConfig,
  uniqueName,
  venuePatch,
  type ActiveScenario,
  type LabConfig,
  type LabDraft,
} from "@/lib/blackjack/labConfig";
import { dealtPercent } from "@/lib/blackjack/labFormat";
import {
  bankrollFit,
  bettingNothing,
  extraRuleAdjustment,
  labRuleFlags,
  labRules,
  labScenario,
  playedRamp,
  reusableSimulationTemplate,
  simulationConfigFor,
  type GameComparison,
} from "@/lib/blackjack/labModel";
import { applySteps, expandHands, sameRamp, type RampStep } from "@/lib/blackjack/rampSteps";
import { isEstimated, sumRuleAdjustment } from "@/lib/blackjack/ruleAdjustments";
import { simulationLibrary } from "@/lib/blackjack/simulationLibrary";
import { venuePresetLibrary, type VenuePreset } from "@/lib/blackjack/venuePresets";
import { directoryGameToLab } from "@/lib/directory/labCompatibility";
import { monthLabel } from "@/lib/directory/format";
import { getDirectoryLocation } from "@/lib/directory/queries";
import { accountScope } from "@/lib/supabase/accountStorage";
import { useScenarioFromUrl } from "@/components/ScenarioPicker";
import { announce, dismissToast, toast } from "@/components/ui";

export type DirectoryHandoff = { title: string; detail: string; error: boolean };
/** Where the control that made a bulk change sits, so its Undo can appear right beside it. */
export type UndoSource = "header" | "preset" | "optimal" | "ramp" | "rules" | "results" | "compare";
export type PendingUndo = { source: UndoSource; message: string };
/** Facts from a directory game that matter next to specific controls. */
export type DirectoryHints = { midShoeUnverified: boolean; maxBet: number | null };

const DEFAULT_KEY = configKey(DEFAULT_LAB_CONFIG);
const RAMP_FIELDS: (keyof LabConfig)[] = ["ramp", "hands", "wongInAt"];
const useClientLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
const presetLabel = (name: string) => name.replace("-", "–");
/** Undo is retired by the next direct edit, not by a clock; the toast only needs to stay long enough to be read and reached. */
const UNDO_TOAST_MS = 120_000;
const TEXT_ENTRY = new Set(["text", "search", "email", "url", "tel", "password", "number"]);
/** Fields where Ctrl+Z belongs to the browser's own text undo. */
const isTextEntry = (element: Element) =>
  element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && TEXT_ENTRY.has(element.type)) || (element instanceof HTMLElement && element.isContentEditable);

/** Pricing for the current inputs. Everything on the page reads from this one computation. */
function useLabModel(config: LabConfig) {
  return useMemo(() => {
    const rules = labRules(config);
    const flags = labRuleFlags(config);
    const activeRamp = playedRamp(config);
    const scenario = labScenario(config, rules);
    const result = analyzeCvcx(scenario, activeRamp, config.baseBet);
    const optimalRamp = createOptimalRamp(rules, config.maxSpread, config.wongInAt, config.chipIncrement, extraRuleAdjustment(config));
    const noBets = bettingNothing(activeRamp);
    return {
      rules,
      activeRamp,
      scenario,
      result,
      optimalRamp,
      /** The optimal ramp's SCORE, so its trade-off against the current ramp shows before anyone builds it. */
      optimalScore: analyzeCvcx(scenario, optimalRamp, config.baseBet).cScore,
      usingOptimal: sameRamp(activeRamp, optimalRamp),
      /** The unit the optimal ramp would suit at the target risk; shown as guidance, never applied by the ramp builder. */
      optimalUnit: riskSizedUnit(scenario, optimalRamp),
      noBets,
      estimated: isEstimated(flags),
      /** The full rule adjustment, for display; the engine receives only the part it cannot derive. */
      ruleAdjustment: sumRuleAdjustment(flags),
      fit: bankrollFit({ bankroll: config.bankroll, unit: config.baseBet, required: result.requiredBankroll, evPerRound: result.evPerRound, riskSizedUnit: riskSizedUnit(scenario, activeRamp), noBets }),
      staleOptimal: config.rampName === OPTIMAL_RAMP_NAME && !sameRamp(config.ramp, optimalRamp),
    };
  }, [config]);
}

export type LabModel = ReturnType<typeof useLabModel>;

/**
 * The Lab's working state and every action on it. Direct edits apply at once;
 * changes that replace several inputs together (a preset over a custom ramp,
 * the optimal ramp, a reset, a load, another game) are confirmed with a toast
 * whose Undo restores exactly the inputs that change touched. Until the next
 * direct edit, the same Undo also sits beside the control that made the
 * change and answers Ctrl+Z, so it never depends on reaching the toast.
 */
export function useLab() {
  const router = useRouter();
  const [config, setConfig] = useState<LabConfig>(DEFAULT_LAB_CONFIG);
  const [active, setActive] = useState<ActiveScenario | null>(null);
  const [draftName, setDraftName] = useState("");
  /** Step starts to keep while someone edits steps, so equal neighbours don't merge mid-typing. */
  const [stepBoundaries, setStepBoundaries] = useState<number[] | null>(null);
  const [templates, setTemplates] = useState<CvcxTemplate[]>([]);
  const [venues, setVenues] = useState<VenuePreset[]>([]);
  const [directoryHandoff, setDirectoryHandoff] = useState<DirectoryHandoff | null>(null);
  const [directoryHints, setDirectoryHints] = useState<DirectoryHints | null>(null);
  const undo = useRef<{ toastId: number; token: object; source: UndoSource; restore: () => void } | null>(null);
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const model = useLabModel(config);

  const key = useMemo(() => configKey(config), [config]);
  const edited = active !== null && key !== active.snapshot;
  const pristine = active === null && key === DEFAULT_KEY;

  const retireUndo = useCallback(() => {
    if (!undo.current) return;
    dismissToast(undo.current.toastId);
    undo.current = null;
    setPendingUndo(null);
  }, []);

  /** Restores what the pending bulk change replaced: from the toast, the inline Undo button, or Ctrl+Z. */
  const undoLast = useCallback(() => {
    const pending = undo.current;
    if (!pending) return;
    retireUndo();
    pending.restore();
    track("cvcx_input_changed", { input: "undo" });
    announce("Change undone.");
  }, [retireUndo]);

  /** Confirms a bulk change with a toast, and keeps its Undo beside the control that made it until the next direct edit. */
  const offerUndo = (message: string, source: UndoSource, restore: () => void) => {
    retireUndo();
    const token = {};
    const toastId = toast({ message, tone: "good", duration: UNDO_TOAST_MS, action: { label: "Undo", onClick: () => { if (undo.current?.token === token) undoLast(); } } });
    undo.current = { toastId, token, source, restore };
    setPendingUndo({ source, message });
  };

  // Ctrl+Z (⌘Z) undoes a pending bulk change, except where it belongs to a text field or an open dialog.
  useEffect(() => {
    if (!pendingUndo) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      const target = event.target instanceof Element ? event.target : null;
      if (target && (isTextEntry(target) || target.closest("[role='dialog']"))) return;
      event.preventDefault();
      undoLast();
    };
    addEventListener("keydown", onKeyDown);
    return () => removeEventListener("keydown", onKeyDown);
  }, [pendingUndo, undoLast]);

  /** A direct edit. Re-entering the same value is not an edit and keeps any pending Undo. */
  const edit = (patch: Partial<LabConfig>, options: { boundaries?: number[] } = {}) => {
    if (!Object.keys(changedFields(config, patch)).length) return;
    retireUndo();
    setConfig((current) => ({ ...current, ...patch }));
    if (options.boundaries) setStepBoundaries(options.boundaries);
    else if (RAMP_FIELDS.some((field) => field in patch)) setStepBoundaries(null);
  };

  /** Several inputs at once, with an Undo that restores only those inputs (and the open scenario, when it changes). */
  const bulk = (patch: Partial<LabConfig>, message: string, source: UndoSource, next?: { active: ActiveScenario | null }) => {
    const previous = changedFields(config, patch);
    const previousActive = active;
    // Nothing to change (a reset of a ramp that is already the preset): say so, offer no Undo.
    if (!Object.keys(previous).length && (!next || next.active?.id === active?.id)) {
      announce(message);
      return;
    }
    setConfig((current) => ({ ...current, ...patch }));
    setStepBoundaries(null);
    if (next) setActive(next.active);
    offerUndo(message, source, () => {
      setConfig((current) => ({ ...current, ...previous }));
      setStepBoundaries(null);
      if (next) setActive(previousActive);
    });
  };

  /* ---------------------------- Library lists ---------------------------- */

  useEffect(() => {
    const refresh = () => setTemplates(cvcxLibrary.templates());
    refresh();
    addEventListener(cvcxLibrary.event, refresh);
    return () => removeEventListener(cvcxLibrary.event, refresh);
  }, []);
  useEffect(() => {
    const refresh = () => setVenues(venuePresetLibrary.presets());
    refresh();
    addEventListener(venuePresetLibrary.event, refresh);
    return () => removeEventListener(venuePresetLibrary.event, refresh);
  }, []);

  /* ------------------------------ Arrivals ------------------------------- */

  /** Whether the URL carries a saved scenario or a directory game that will replace the working inputs. */
  const replacingArrival = () => {
    const params = new URLSearchParams(location.search);
    const scenario = params.get("scenario");
    return Boolean((scenario && cvcxLibrary.templates().some((template) => template.id === scenario)) || (params.get("directoryLocation") && params.get("directoryGame")));
  };

  // Working inputs survive leaving the page, for this tab and account only.
  const draftWritable = useRef(false);
  const latestDraft = useRef<LabDraft | null>(null);
  useClientLayoutEffect(() => {
    if (replacingArrival()) return;
    try {
      const draft = parseLabDraft(sessionStorage.getItem(labDraftKey(accountScope())));
      if (draft) {
        setConfig(draft.config);
        setActive(draft.active && cvcxLibrary.templates().some((template) => template.id === draft.active!.id) ? draft.active : null);
        setDraftName(draft.draftName);
      }
    } catch {
      // Storage can be unavailable (private windows, blocked site data); start from the example.
    }
    draftWritable.current = true;
  }, []);
  useEffect(() => {
    // While an arrival is still resolving (or if it fails), the untouched example must not overwrite the stored draft.
    if (!draftWritable.current && config === DEFAULT_LAB_CONFIG && active === null && !draftName) return;
    draftWritable.current = true;
    const draft: LabDraft = { version: 1, config, active, draftName };
    latestDraft.current = draft;
    const timer = setTimeout(() => writeDraft(draft), 250);
    return () => clearTimeout(timer);
  }, [config, active, draftName]);
  // Leaving the page (in the app or by a full navigation) saves any change still waiting to be written.
  useEffect(() => {
    const flush = () => { if (latestDraft.current) writeDraft(latestDraft.current); };
    addEventListener("pagehide", flush);
    return () => { removeEventListener("pagehide", flush); flush(); };
  }, []);

  const loadTemplate = (template: CvcxTemplate, source: "url" | "library") => {
    const next = normalizeConfig(template.config);
    const nextActive = { id: template.id, name: template.name, snapshot: configKey(next) };
    track("cvcx_template_loaded", { name: template.name });
    if (source === "library") {
      bulk(next, `Loaded “${template.name}”.`, "header", { active: nextActive });
      return;
    }
    setConfig(next);
    setActive(nextActive);
    setStepBoundaries(null);
  };
  const arrival = useScenarioFromUrl((template) => loadTemplate(template, "url"));
  // Once a linked scenario is applied or found missing, Back and reload return to the working draft instead of applying it again.
  useEffect(() => {
    if (arrival.status === "loaded" || arrival.status === "missing") dropSearchParams("scenario");
  }, [arrival.status]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const locationId = params.get("directoryLocation");
    const gameId = params.get("directoryGame");
    if (!locationId || !gameId) return;
    let alive = true;
    setDirectoryHandoff({ title: "Loading directory game", detail: "Checking the published rules before applying them.", error: false });
    getDirectoryLocation(locationId).then((data) => {
      if (!alive) return;
      // Applied or definitely unavailable: Back and reload return to the working draft. A failed fetch keeps them, so reload retries.
      dropSearchParams("directoryLocation", "directoryGame");
      const game = data?.games.find((item) => item.id === gameId);
      if (!data || !game) {
        setDirectoryHandoff({ title: "Directory game unavailable", detail: "This game is unpublished or no longer available. The lab is showing its own default scenario.", error: true });
        return;
      }
      const transfer = directoryGameToLab(game);
      if (!transfer.config) {
        setDirectoryHandoff({ title: "Directory game could not be loaded", detail: `${transfer.reasons.join(" ")} The lab is showing its own default scenario.`, error: true });
        return;
      }
      const imported = transfer.config;
      setConfig((current) => ({
        ...current,
        decks: imported.decks,
        dealt: imported.dealt,
        baseBet: imported.baseBet,
        dealerHitsSoft17: imported.dealerHitsSoft17,
        doubleAfterSplit: imported.doubleAfterSplit,
        resplitAces: imported.resplitAces,
        lateSurrender: imported.lateSurrender,
        europeanNoHoleCard: imported.europeanNoHoleCard,
        blackjackPayout: imported.blackjackPayout,
        doubleRule: imported.doubleRule,
        wongInAt: null,
        useIndices: false,
      }));
      setDraftName(`${data.location.name} · ${game.decks}D`);
      setDirectoryHints({ midShoeUnverified: game.mid_shoe_entry == null || game.mid_shoe_entry === "unknown", maxBet: game.max_bet });
      setDirectoryHandoff({ title: `Loaded ${data.location.name}`, detail: `${monthLabel(game.reported_month)}. The rules the Lab can model are applied, with the table minimum as your betting unit, basic strategy, and play at every count. Next, choose how you play hands and your bet ramp. ${transfer.notes.join(" ")}`, error: false });
    }).catch(() => {
      if (alive) setDirectoryHandoff({ title: "Directory game unavailable", detail: "The game could not be fetched. The lab is showing its own default scenario.", error: true });
    });
    return () => { alive = false; };
  }, []);

  /* ------------------------------ Bet ramp ------------------------------- */

  const setPreset = (name: string) => {
    track("cvcx_preset_selected", { preset: name });
    const patch = { rampName: name, ramp: presetRamp(name), maxSpread: rampSpread(RAMPS[name]) };
    const message = `Switched to the ${presetLabel(name)} ramp.`;
    const pending = undo.current;
    // Replacing a ramp someone built by hand is worth an Undo; switching between presets is not…
    if (!isPresetName(config.rampName)) bulk(patch, message, "preset");
    // …except while comparing presets after replacing one: the Undo still leads back to the ramp they replaced.
    else if (pending?.source === "preset") {
      setConfig((current) => ({ ...current, ...patch }));
      setStepBoundaries(null);
      offerUndo(message, "preset", pending.restore);
    } else edit(patch);
  };

  const buildOptimal = () => {
    track("cvcx_calculation_run", { decks: model.rules.decks, penetration: model.rules.penetration, bankroll: config.bankroll, baseBet: config.baseBet, spread: config.rampName, handsPerHour: config.handsPerHour });
    bulk({ rampName: OPTIMAL_RAMP_NAME, ramp: model.optimalRamp }, "Built the optimal ramp for this game.", "optimal");
  };

  const resetRamp = () => {
    const preset = isPresetName(config.rampName) ? config.rampName : "1-8";
    track("cvcx_preset_selected", { preset });
    track("cvcx_reset", { stage: "bet_spread" });
    bulk({ rampName: preset, ramp: presetRamp(preset), maxSpread: rampSpread(RAMPS[preset]), wongInAt: null, hands: expandHands(undefined) }, `Bet ramp reset to the ${presetLabel(preset)} spread.`, "ramp");
  };

  const scaleRamp = (factor: number) => {
    edit({ rampName: CUSTOM_RAMP_NAME, ramp: config.ramp.map((point) => ({ ...point, units: Math.max(0, point.units * factor) })) });
    announce(factor < 1 ? "Every bet halved." : "Every bet doubled.");
  };

  /** One count's bet from the Every count view. */
  const setBet = (trueCount: number, bet: number) =>
    edit({ rampName: CUSTOM_RAMP_NAME, ramp: config.ramp.map((point) => (point.trueCount === trueCount ? { ...point, units: config.baseBet > 0 ? bet / config.baseBet : 0 } : point)) });

  const setHands = (trueCount: number, hands: number) =>
    edit({ hands: config.hands.map((point) => (point.trueCount === trueCount ? { ...point, hands } : point)) });

  const setSteps = (steps: RampStep[]) => {
    const next = applySteps(config.ramp, config.hands, steps);
    edit({ rampName: CUSTOM_RAMP_NAME, ramp: next.ramp, hands: next.hands }, { boundaries: steps.map((step) => step.from) });
  };

  const oneHandEverywhere = () => bulk({ hands: expandHands(undefined) }, "Now playing 1 hand at every count.", "results");

  /* -------------------------------- Game --------------------------------- */

  const resetRules = (source: "rules" | "results") => {
    track("cvcx_input_changed", { input: "rules_reset" });
    bulk({ ...AUDITED_RULES }, "Rules reset to the audited game.", source);
  };

  const switchGame = (row: GameComparison, withRamp: boolean) => {
    track("cvcx_input_changed", { input: "game_from_compare" });
    const game = `${row.decks} decks, ${row.dealt} dealt`;
    if (withRamp) bulk({ decks: row.decks, dealt: row.dealt, ramp: row.ramp, rampName: OPTIMAL_RAMP_NAME }, `Switched to ${game} with its optimal ramp.`, "compare");
    else bulk({ decks: row.decks, dealt: row.dealt }, `Switched to ${game}.`, "compare");
  };

  const applyUnit = (unit: number) => {
    track("cvcx_input_changed", { input: "unit_from_risk" });
    edit({ baseBet: unit });
    announce(`Betting unit set to $${unit}.`);
  };

  const startOver = () => bulk({ ...DEFAULT_LAB_CONFIG }, "Started over with the example setup.", "header", { active: null });

  /* ------------------------------ Library -------------------------------- */

  const saveScenario = (name: string, mode: "new" | "update") => {
    const record = toTemplateConfig(config);
    const saved = mode === "update" && active
      ? cvcxLibrary.updateTemplate(active.id, record, name) ?? cvcxLibrary.saveTemplate(record, name)
      : cvcxLibrary.saveTemplate(record, uniqueName(name, templates.map((template) => template.name)));
    setActive({ id: saved.id, name: saved.name, snapshot: key });
    track("cvcx_template_saved", { name: saved.name, mode });
    return saved;
  };

  const deleteScenario = (template: CvcxTemplate) => {
    cvcxLibrary.deleteTemplate(template.id);
    track("cvcx_template_deleted", { name: template.name });
    if (active?.id === template.id) setActive(null);
  };

  const loadVenue = (preset: VenuePreset) => bulk(venuePatch(preset), `Loaded venue “${preset.name}”.`, "header");
  const saveVenue = (name: string) => venuePresetLibrary.savePreset(name, model.rules, config.ramp);
  const deleteVenue = (preset: VenuePreset) => venuePresetLibrary.deletePreset(preset.id);

  /** The scenario a Simulate hand-off will open: the open one if unchanged, otherwise a new save. */
  const simulationTarget = () => {
    const reuse = active && !edited ? templates.find((template) => template.id === active.id) : undefined;
    return reuse ? { reuse, name: reuse.name } : { reuse: undefined, name: uniqueName(active?.name || draftName || "Game from Lab", templates.map((template) => template.name)) };
  };

  const simulate = () => {
    const target = simulationTarget();
    const simulationName = active?.name || draftName || `${config.decks}D · ${dealtPercent(config.decks, config.dealt)}% from Lab`;
    const sessionConfig = simulationConfigFor(config, `cvcx-${Date.now()}`);
    if (!reusableSimulationTemplate(simulationLibrary.templates(), sessionConfig, simulationName)) simulationLibrary.saveTemplate(sessionConfig, simulationName);
    track("cvcx_tested_in_simulator", { decks: config.decks, bankroll: config.bankroll, baseBet: config.baseBet });
    const shared = target.reuse ?? cvcxLibrary.saveTemplate(toTemplateConfig(config), target.name);
    if (!target.reuse) {
      const nextActive = { id: shared.id, name: shared.name, snapshot: key };
      setActive(nextActive);
      if (latestDraft.current) latestDraft.current = { ...latestDraft.current, active: nextActive };
    }
    router.push(`/simulation?scenario=${encodeURIComponent(shared.id)}`);
  };

  return {
    config,
    model,
    active,
    edited,
    pristine,
    draftName,
    stepBoundaries,
    templates,
    venues,
    arrival,
    directoryHandoff,
    directoryHints,
    dismissDirectoryHandoff: () => setDirectoryHandoff(null),
    pendingUndo,
    undoLast,
    edit,
    setPreset,
    buildOptimal,
    resetRamp,
    scaleRamp,
    setBet,
    setHands,
    setSteps,
    oneHandEverywhere,
    resetRules,
    switchGame,
    applyUnit,
    startOver,
    loadTemplate,
    saveScenario,
    deleteScenario,
    loadVenue,
    saveVenue,
    deleteVenue,
    simulationTarget,
    simulate,
  };
}

export type Lab = ReturnType<typeof useLab>;

/** Removes arrival parameters that have been handled, keeping any others and the hash. */
function dropSearchParams(...names: string[]) {
  const url = new URL(location.href);
  if (!names.some((name) => url.searchParams.has(name))) return;
  for (const name of names) url.searchParams.delete(name);
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function writeDraft(draft: LabDraft) {
  try {
    sessionStorage.setItem(labDraftKey(accountScope()), JSON.stringify(draft));
  } catch {
    // A full or blocked store only costs the convenience of restoring the draft.
  }
}
