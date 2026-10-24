"use client";
import { useId, useState } from "react";
import { Button, Callout, toast } from "@/components/ui";
import { rulesOf, type GameDraft } from "@/lib/blackjack/journalForm";
import { shortDate } from "@/lib/blackjack/journalFormat";
import { venuePresetLibrary, type VenuePreset } from "@/lib/blackjack/venuePresets";
import { RampLine, SpreadField, TableRulesFields } from "./GameEditor";
import { exactMoney } from "./model";
import { DiscardBar, InputField, JournalSheet, useDiscardGuard } from "./parts";

const MAX_VENUES = 20;

/**
 * A new saved venue: a casino's table rules and the spread you play there.
 * Logging a session at that casino then starts from this game.
 */
export function VenueSheet({ base, presets, onSaved, onClose, registerGuard }: {
  /** The game to start from, usually the latest session's. */
  base: GameDraft;
  presets: VenuePreset[];
  onSaved: (preset: VenuePreset) => void;
  onClose: () => void;
  registerGuard: (guard: (() => boolean) | null) => void;
}) {
  const [name, setName] = useState("");
  const [game, setGame] = useState(base);
  const [attempted, setAttempted] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const formId = useId();
  const nameId = useId();
  const dirty = name.trim() !== "" || JSON.stringify(game) !== JSON.stringify(base);
  const { discarding, requestClose, keepEditing, onSheetClose, actionsRef } = useDiscardGuard({ dirty, onClose, registerGuard });
  const trimmed = name.trim();
  const existing = presets.filter((preset) => preset.name.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const oldest = [...presets].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  const edit = (patch: Partial<GameDraft>) => { setGame((current) => ({ ...current, ...patch })); };

  const save = (mode: "check" | "replace" | "new") => {
    setAttempted(true);
    if (!trimmed) { document.getElementById(nameId)?.focus(); return; }
    if (mode === "check" && existing) { setConfirmReplace(true); return; }
    if (mode === "replace" && existing) venuePresetLibrary.deletePreset(existing.id);
    const saved = venuePresetLibrary.savePreset(trimmed, rulesOf(game), game.ramp);
    toast(`Venue “${saved.name}” saved.`, "pos");
    onSaved(saved);
  };

  const footer = discarding ? (
    <DiscardBar message="Discard this venue?" onKeep={keepEditing} onDiscard={onClose} />
  ) : confirmReplace && existing ? (
    <div className="grid grid-cols-1 gap-3">
      <p className="text-sm text-ink-2">You already have “{existing.name}” (saved {shortDate(existing.createdAt.slice(0, 10))}). Replace it, or keep both?</p>
      <div ref={actionsRef} className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => setConfirmReplace(false)}>Back</Button>
        <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => save("new")}>Keep both</Button>
        <Button className="flex-1 sm:flex-none" onClick={() => save("replace")}>Replace</Button>
      </div>
    </div>
  ) : (
    <div ref={actionsRef} className="flex flex-wrap justify-end gap-2">
      <Button variant="secondary" className="flex-1 sm:flex-none" onClick={requestClose}>Cancel</Button>
      <Button type="submit" form={formId} className="flex-[2] sm:flex-none">Save venue</Button>
    </div>
  );

  return (
    <JournalSheet open title="New venue" description="Save a casino's rules and your spread there. Logging a session at that casino starts from this game." onClose={onSheetClose} footer={footer}>
      <form id={formId} noValidate className="grid grid-cols-1 gap-5" onSubmit={(event) => { event.preventDefault(); save("check"); }}>
        <InputField id={nameId} label="Casino name" value={name} placeholder="e.g. Downtown casino" autoComplete="off" error={attempted && !trimmed ? "Name the venue." : undefined} onChange={(event) => { setName(event.target.value); setConfirmReplace(false); }} />
        <div className="grid grid-cols-1 gap-3">
          <h3 className="eyebrow">Table rules</h3>
          <TableRulesFields game={game} onChange={edit} />
        </div>
        <div className="grid grid-cols-1 gap-3">
          <h3 className="eyebrow">Your spread</h3>
          <SpreadField game={game} onChange={edit} />
          <RampLine ramp={game.ramp} unit={game.bettingUnit} />
          <p className="text-xs leading-5 text-ink-3">Shown at a {exactMoney(game.bettingUnit)} unit. A venue keeps the spread in units, so it works at any unit. Fine-tune bets per count from Log session → Change game.</p>
        </div>
        {presets.length >= MAX_VENUES && oldest && <Callout tone="warn">You have {MAX_VENUES} saved venues, the most CountLab keeps, so saving removes the oldest, “{oldest.name}”.</Callout>}
      </form>
    </JournalSheet>
  );
}
