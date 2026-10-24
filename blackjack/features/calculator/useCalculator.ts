"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics/track";
import { RAMPS } from "@/lib/blackjack/advantage";
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
import { labBlocker, priceLab, type GameComparison, type SpreadSuggestion } from "@/lib/blackjack/labModel";
import { applySteps, expandHands, type RampStep } from "@/lib/blackjack/rampSteps";
import { venuePresetLibrary, type VenuePreset } from "@/lib/blackjack/venuePresets";
import { accountScope } from "@/lib/supabase/accountStorage";
import { announce, toast } from "@/components/ui";

/** Where the control that made a bulk change sits, so its Undo can appear right beside it. */
export type UndoSource = "header" | "preset" | "suggest" | "ramp" | "rules" | "results" | "compare";
export type PendingUndo = { source: UndoSource; message: string };
export type Arrival = { status: "none" } | { status: "loaded"; name: string } | { status: "missing" };

const DEFAULT_KEY = configKey(DEFAULT_LAB_CONFIG);
const RAMP_FIELDS: (keyof LabConfig)[] = ["ramp", "hands", "wongInAt"];
const useClientLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
export const presetLabel = (name: string) => name.replace("-", "–");
const TEXT_ENTRY = new Set(["text", "search", "email", "url", "tel", "password", "number"]);
/** Fields where Ctrl+Z belongs to the browser's own text undo. */
const isTextEntry = (element: Element) =>
  element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && TEXT_ENTRY.has(element.type)) || (element instanceof HTMLElement && element.isContentEditable);

/**
 * The Calculator's working state and every action on it, carried over from the
 * Game & Bankroll Lab. Direct edits apply at once; changes that replace several
 * inputs together (a preset over a custom ramp, a suggested spread, a reset, a
 * load, another game) get an Undo beside the control that made them, which
 * Ctrl+Z (⌘Z) also answers, until the next direct edit.
 */
export function useCalculator() {
  const router = useRouter();
  const [config, setConfig] = useState<LabConfig>(DEFAULT_LAB_CONFIG);
  const [active, setActive] = useState<ActiveScenario | null>(null);
  const [draftName, setDraftName] = useState("");
  /** Step starts to keep while someone edits steps, so equal neighbours don't merge mid-edit. */
  const [stepBoundaries, setStepBoundaries] = useState<number[] | null>(null);
  const [templates, setTemplates] = useState<CvcxTemplate[]>([]);
  const [venues, setVenues] = useState<VenuePreset[]>([]);
  const [arrival, setArrival] = useState<Arrival>({ status: "none" });
  const undo = useRef<{ source: UndoSource; restore: () => void } | null>(null);
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const pricing = useMemo(() => priceLab(config), [config]);

  const key = useMemo(() => configKey(config), [config]);
  const edited = active !== null && key !== active.snapshot;
  const pristine = active === null && key === DEFAULT_KEY;

  const retireUndo = useCallback(() => {
    if (!undo.current) return;
    undo.current = null;
    setPendingUndo(null);
  }, []);

  /** Restores what the pending bulk change replaced, from the inline Undo button or Ctrl+Z. */
  const undoLast = useCallback(() => {
    const pending = undo.current;
    if (!pending) return;
    retireUndo();
    pending.restore();
    track("cvcx_input_changed", { input: "undo" });
    announce("Change undone.");
  }, [retireUndo]);

  const offerUndo = (message: string, source: UndoSource, restore: () => void) => {
    undo.current = { source, restore };
    setPendingUndo({ source, message });
    toast(message, "pos");
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

  /* --------------------------- Draft and arrival -------------------------- */

  // Working inputs survive leaving the page, for this tab and account only. A
  // saved scenario opened by link (?scenario=<id>) replaces them instead.
  const draftWritable = useRef(false);
  const latestDraft = useRef<LabDraft | null>(null);
  useClientLayoutEffect(() => {
    const id = new URLSearchParams(location.search).get("scenario");
    if (id) {
      const template = cvcxLibrary.templates().find((item) => item.id === id);
      dropSearchParam("scenario");
      if (template) {
        const next = normalizeConfig(template.config);
        setConfig(next);
        setActive({ id: template.id, name: template.name, snapshot: configKey(next) });
        setArrival({ status: "loaded", name: template.name });
        track("cvcx_template_loaded", { name: template.name });
        draftWritable.current = true;
        return;
      }
      setArrival({ status: "missing" });
    }
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
    if (!draftWritable.current && config === DEFAULT_LAB_CONFIG && active === null && !draftName) return;
    draftWritable.current = true;
    const draft: LabDraft = { version: 1, config, active, draftName };
    latestDraft.current = draft;
    const timer = setTimeout(() => writeDraft(draft), 250);
    return () => clearTimeout(timer);
  }, [config, active, draftName]);
  useEffect(() => {
    const flush = () => { if (latestDraft.current) writeDraft(latestDraft.current); };
    addEventListener("pagehide", flush);
    return () => { removeEventListener("pagehide", flush); flush(); };
  }, []);

  // A scenario deleted in another tab, or by sync, is no longer "open".
  useEffect(() => {
    if (active && !cvcxLibrary.templates().some((template) => template.id === active.id)) setActive(null);
  }, [templates, active]);

  const loadTemplate = (template: CvcxTemplate) => {
    const next = normalizeConfig(template.config);
    track("cvcx_template_loaded", { name: template.name });
    bulk(next, `Loaded “${template.name}”.`, "header", { active: { id: template.id, name: template.name, snapshot: configKey(next) } });
  };

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
    track("cvcx_calculation_run", { decks: pricing.rules.decks, penetration: pricing.rules.penetration, bankroll: config.bankroll, baseBet: config.baseBet, spread: config.rampName, handsPerHour: config.handsPerHour });
    bulk({ rampName: OPTIMAL_RAMP_NAME, ramp: pricing.optimalRamp }, "Built the Kelly-weighted ramp for this game.", "suggest");
  };

  /** Applies a suggested spread: its ramp and its whole-dollar unit together. */
  const applySuggestion = (suggestion: SpreadSuggestion) => {
    track("cvcx_calculation_run", { decks: pricing.rules.decks, penetration: pricing.rules.penetration, bankroll: config.bankroll, baseBet: suggestion.baseBet, spread: suggestion.key, handsPerHour: config.handsPerHour });
    const rampName = suggestion.kind === "preset" ? suggestion.key : suggestion.kind === "optimal" ? OPTIMAL_RAMP_NAME : config.rampName;
    const patch: Partial<LabConfig> = { rampName, ramp: suggestion.ramp, baseBet: suggestion.baseBet };
    if (suggestion.kind === "preset") patch.maxSpread = rampSpread(RAMPS[suggestion.key]);
    bulk(patch, `Now betting the ${suggestion.kind === "preset" ? `${presetLabel(suggestion.key)} spread` : suggestion.kind === "optimal" ? "Kelly-weighted ramp" : "same ramp"} with a $${suggestion.baseBet} unit.`, "suggest");
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

  /** One count's bet from the Every count view, in dollars. */
  const setBet = (trueCount: number, bet: number) =>
    edit({ rampName: CUSTOM_RAMP_NAME, ramp: config.ramp.map((point) => (point.trueCount === trueCount ? { ...point, units: config.baseBet > 0 ? Math.max(0, bet) / config.baseBet : 0 } : point)) });

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
    if (withRamp) bulk({ decks: row.decks, dealt: row.dealt, ramp: row.ramp, rampName: OPTIMAL_RAMP_NAME }, `Switched to ${game} with its Kelly-weighted ramp.`, "compare");
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

  const renameScenario = (template: CvcxTemplate, name: string) => {
    const others = templates.filter((item) => item.id !== template.id).map((item) => item.name);
    const renamed = cvcxLibrary.renameTemplate(template.id, uniqueName(name, others));
    if (!renamed) return undefined;
    if (active?.id === template.id) setActive({ ...active, name: renamed.name });
    track("cvcx_input_changed", { input: "scenario_renamed" });
    return renamed;
  };

  const deleteScenario = (template: CvcxTemplate) => {
    cvcxLibrary.deleteTemplate(template.id);
    track("cvcx_template_deleted", { name: template.name });
    if (active?.id === template.id) setActive(null);
  };

  const loadVenue = (preset: VenuePreset) => bulk(venuePatch(preset), `Loaded venue “${preset.name}”.`, "header");
  const saveVenue = (name: string) => venuePresetLibrary.savePreset(name, pricing.rules, config.ramp);
  const deleteVenue = (preset: VenuePreset) => venuePresetLibrary.deletePreset(preset.id);

  /** The scenario a journal hand-off will open: the open one if unchanged, otherwise a new save. */
  const journalTarget = () => {
    const reuse = active && !edited ? templates.find((template) => template.id === active.id) : undefined;
    return reuse ? { reuse, name: reuse.name } : { reuse: undefined, name: uniqueName(active?.name || draftName || "Game from Calculator", templates.map((template) => template.name)) };
  };
  const journalBlocker = labBlocker(config, "journal");

  /** Opens the Journal's log form prefilled with this game, saving it first when it isn't saved as is. */
  const logSession = () => {
    if (journalBlocker) return;
    const target = journalTarget();
    const shared = target.reuse ?? cvcxLibrary.saveTemplate(toTemplateConfig(config), target.name);
    if (!target.reuse) {
      const nextActive = { id: shared.id, name: shared.name, snapshot: key };
      setActive(nextActive);
      track("cvcx_template_saved", { name: shared.name, mode: "journal" });
      latestDraft.current = { version: 1, config, active: nextActive, draftName };
      writeDraft(latestDraft.current);
    }
    router.push(`/journal?scenario=${encodeURIComponent(shared.id)}`);
  };

  return {
    config,
    pricing,
    active,
    edited,
    pristine,
    draftName,
    stepBoundaries,
    templates,
    venues,
    arrival,
    dismissArrival: () => setArrival({ status: "none" }),
    pendingUndo,
    undoLast,
    edit,
    setPreset,
    buildOptimal,
    applySuggestion,
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
    renameScenario,
    deleteScenario,
    loadVenue,
    saveVenue,
    deleteVenue,
    journalTarget,
    journalBlocker,
    logSession,
  };
}

export type Calc = ReturnType<typeof useCalculator>;

/** Removes a handled arrival parameter, keeping any others and the hash, so Back and reload return to the draft. */
function dropSearchParam(name: string) {
  const url = new URL(location.href);
  if (!url.searchParams.has(name)) return;
  url.searchParams.delete(name);
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function writeDraft(draft: LabDraft) {
  try {
    sessionStorage.setItem(labDraftKey(accountScope()), JSON.stringify(draft));
  } catch {
    // A full or blocked store only costs the convenience of restoring the draft.
  }
}
