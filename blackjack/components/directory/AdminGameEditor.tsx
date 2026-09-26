"use client";

import { useState } from "react";
import { Button, GhostButton, Panel } from "@/components/ui";
import { saveGame } from "@/lib/directory/admin";
import type { DirectoryGame } from "@/lib/directory/types";

type Draft = Partial<DirectoryGame>;
const fieldClass = "field min-h-11 w-full rounded-lg px-3 text-[var(--ink)]";

function initialDraft(locationId: string, game?: DirectoryGame): Draft {
  if (game) return { ...game };
  return {
    location_id: locationId, game_type: "blackjack", table_count: null, decks: null, decks_cut: null,
    min_bet: null, max_bet: null, currency: "USD", payout: null, soft_17: null,
    double_rules: null, double_after_split: null, max_split_hands: null, resplit_aces: null,
    surrender: null, dealer_procedure: null, dealer_blackjack_wager_treatment: null,
    mid_shoe_entry: null, dealing_method: null, shuffle_method: null,
    reported_house_edge_pct: null, availability: "reported", publication_status: "draft",
    reported_month: null, verified_at: null, extra_rules: {},
  };
}

const textOrNull = (value: string | null | undefined) => value?.trim() || null;

export function AdminGameEditor({ locationId, game, onSaved, onCancel, onReload }: {
  locationId: string;
  game?: DirectoryGame;
  onSaved: (saved: DirectoryGame) => void;
  onCancel: () => void;
  onReload: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(locationId, game));
  const [extraRules, setExtraRules] = useState(JSON.stringify(game?.extra_rules ?? {}, null, 2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((previous) => ({ ...previous, [key]: value }));
  const field = (label: string, key: keyof Draft, hint?: string) => <label className="grid gap-2 text-sm text-[var(--ink-muted)]">{label}<input className={fieldClass} value={String(draft[key] ?? "")} placeholder={hint} onChange={(event) => change(key, event.target.value as never)} /></label>;
  const number = (label: string, key: keyof Draft, step = "1", min = "0") => <label className="grid gap-2 text-sm text-[var(--ink-muted)]">{label}<input className={fieldClass} type="number" min={min} step={step} value={draft[key] == null ? "" : String(draft[key])} onChange={(event) => change(key, (event.target.value === "" ? null : Number(event.target.value)) as never)} /></label>;
  const select = (label: string, key: keyof Draft, options: Array<[string, string]>) => <label className="grid gap-2 text-sm text-[var(--ink-muted)]">{label}<select className={fieldClass} value={String(draft[key] ?? "")} onChange={(event) => change(key, (event.target.value || null) as never)}><option value="">Unknown</option>{options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>;
  const boolSelect = (label: string, key: keyof Draft) => <label className="grid gap-2 text-sm text-[var(--ink-muted)]">{label}<select className={fieldClass} value={draft[key] == null ? "" : String(draft[key])} onChange={(event) => change(key, (event.target.value === "" ? null : event.target.value === "true") as never)}><option value="">Unknown</option><option value="true">Yes</option><option value="false">No</option></select></label>;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!draft.game_type?.trim()) { setError("Game type is required."); return; }
    if (draft.decks != null && draft.decks_cut != null && draft.decks_cut > draft.decks) { setError("Decks cut cannot exceed decks in the shoe."); return; }
    if (draft.min_bet != null && draft.max_bet != null && draft.min_bet > draft.max_bet) { setError("Minimum bet cannot exceed maximum bet."); return; }
    let parsedRules: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(extraRules);
      if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
      parsedRules = value as Record<string, unknown>;
    } catch { setError("Extra rules must be a JSON object."); return; }
    setSaving(true);
    try {
      const values: Draft = {
        location_id: locationId,
        game_type: draft.game_type.trim(), table_count: draft.table_count, decks: draft.decks,
        decks_cut: draft.decks_cut, min_bet: draft.min_bet, max_bet: draft.max_bet,
        currency: textOrNull(draft.currency)?.toUpperCase() ?? null,
        payout: textOrNull(draft.payout), soft_17: textOrNull(draft.soft_17),
        double_rules: textOrNull(draft.double_rules), double_after_split: draft.double_after_split,
        max_split_hands: draft.max_split_hands, resplit_aces: draft.resplit_aces,
        surrender: textOrNull(draft.surrender), dealer_procedure: textOrNull(draft.dealer_procedure),
        dealer_blackjack_wager_treatment: textOrNull(draft.dealer_blackjack_wager_treatment),
        mid_shoe_entry: textOrNull(draft.mid_shoe_entry), dealing_method: textOrNull(draft.dealing_method),
        shuffle_method: textOrNull(draft.shuffle_method), reported_house_edge_pct: draft.reported_house_edge_pct,
        availability: draft.availability, publication_status: draft.publication_status,
        reported_month: draft.reported_month || null, verified_at: draft.verified_at || null,
        extra_rules: parsedRules,
      };
      onSaved(await saveGame(values, game?.id ? game : undefined));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save game."); }
    finally { setSaving(false); }
  }

  return <Panel>
    <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{game?.id ? "Edit game offering" : "Add game offering"}</h2><p className="mt-1 text-sm text-[var(--ink-muted)]">One offering describes tables with the same limits and rules. Leave uncertain values blank.</p></div><GhostButton type="button" onClick={onCancel}>Close</GhostButton></div>
    <form className="space-y-6" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {select("Game type", "game_type", [["blackjack", "Blackjack"], ["spanish_21", "Spanish 21"], ["other", "Other"]])}
        {number("Tables", "table_count")}{number("Decks", "decks")}{number("Decks cut (left undealt)", "decks_cut", "0.1")}
        {number("Minimum bet", "min_bet", "0.01")}{number("Maximum bet", "max_bet", "0.01")}{field("Currency code", "currency", "USD")}
        {select("Payout", "payout", [["3:2", "3:2"], ["6:5", "6:5"], ["1:1", "1:1"], ["other", "Other"]])}
        {select("Dealer soft 17", "soft_17", [["H17", "Hits"], ["S17", "Stands"]])}
        {field("Double rules", "double_rules", "Any two, 9–11, 10–11…")}
        {boolSelect("Double after split", "double_after_split")}{number("Maximum split hands", "max_split_hands")}{boolSelect("Resplit aces", "resplit_aces")}
        {select("Surrender", "surrender", [["none", "None"], ["late", "Late"], ["early", "Early"], ["early_except_ace", "Early except ace"], ["mixed", "Mixed exceptions"]])}
        {select("Dealer procedure", "dealer_procedure", [["hole_card_peek", "Hole card peek"], ["no_hole_card", "No hole card"], ["no_peek", "No peek"]])}
        {select("Dealer blackjack wager treatment", "dealer_blackjack_wager_treatment", [["original_bets_only", "Original bets only"], ["all_bets_lost", "All split/double bets lost"]])}
        {select("Mid-shoe entry", "mid_shoe_entry", [["allowed", "Allowed"], ["not_allowed", "Not allowed"], ["restricted", "Restricted"]])}
        {select("Dealing method", "dealing_method", [["shoe", "Shoe"], ["hand_dealt", "Hand dealt"], ["other", "Other"]])}
        {select("Shuffle method", "shuffle_method", [["manual", "Manual"], ["automatic", "Automatic"], ["continuous", "Continuous"], ["other", "Other"]])}
        {number("Reported house edge (%)", "reported_house_edge_pct", "0.001", "-100")}
        {select("Availability", "availability", [["reported", "Reported"], ["unavailable", "Unavailable"], ["unknown", "Unknown"]])}
        {select("Publication", "publication_status", [["draft", "Draft"], ["published", "Published"]])}
        <label className="grid gap-2 text-sm text-[var(--ink-muted)]">Reported month<input className={fieldClass} type="month" value={draft.reported_month?.slice(0, 7) ?? ""} onChange={(event) => change("reported_month", event.target.value ? `${event.target.value}-01` : null)} /></label>
        <label className="grid gap-2 text-sm text-[var(--ink-muted)]">Actually verified on<input className={fieldClass} type="date" value={draft.verified_at?.slice(0, 10) ?? ""} onChange={(event) => change("verified_at", event.target.value || null)} /></label>
      </div>
      <label className="grid gap-2 text-sm text-[var(--ink-muted)]">Extra rules (JSON object)<textarea className={`${fieldClass} min-h-28 py-3 font-mono text-xs`} value={extraRules} onChange={(event) => setExtraRules(event.target.value)} /></label>
      {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-[var(--negative)]"><span>{error}</span>{error.startsWith("Another admin") && <GhostButton type="button" className="min-h-9 px-3 py-1 text-xs" onClick={onReload}>Reload latest</GhostButton>}</div>}
      <div className="flex flex-wrap gap-3"><Button type="submit" disabled={saving}>{saving ? "Saving…" : game ? "Save game" : "Add game"}</Button><GhostButton type="button" onClick={onCancel}>Cancel</GhostButton></div>
    </form>
  </Panel>;
}
