"use client";
import { useEffect, useRef, useState } from "react";
import { Building2, FolderOpen, Pencil, Trash2 } from "lucide-react";
import type { CvcxTemplate } from "@/lib/blackjack/cvcxLibrary";
import { normalizeConfig, rampSpread, venueGaps } from "@/lib/blackjack/labConfig";
import { dealtPercent, money } from "@/lib/blackjack/labFormat";
import { playedRamp, playedSpread } from "@/lib/blackjack/labModel";
import { unitLabel } from "@/lib/blackjack/rampSteps";
import type { VenuePreset } from "@/lib/blackjack/venuePresets";
import { Badge, Button, ConfirmSheet, EmptyState, IconButton, Sheet, Tabs, TextField } from "@/components/ui";
import { Note } from "./parts";
import { JournalLink } from "./SaveSheet";
import type { Calc } from "./useCalculator";

const savedDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};

function ScenarioItem({ template, open, onLoad, onRename, onDelete }: { template: CvcxTemplate; open: boolean; onLoad: () => void; onRename: (name: string) => void; onDelete: () => void }) {
  const config = normalizeConfig(template.config);
  const spread = playedSpread(playedRamp(config));
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(template.name);
  const renameButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (renaming) (document.getElementById(`rename-${template.id}`) as HTMLInputElement | null)?.select(); }, [renaming, template.id]);
  const finish = (save: boolean) => {
    if (save && draft.trim() && draft.trim() !== template.name) onRename(draft);
    setRenaming(false);
    requestAnimationFrame(() => renameButton.current?.focus());
  };
  const titleId = `scenario-${template.id}`;
  return (
    <li>
      <article aria-labelledby={titleId} className={`rounded-2xl border p-3.5 ${open ? "border-brand bg-brand/[0.05]" : "border-line"}`}>
        {renaming ? (
          <form onSubmit={(event) => { event.preventDefault(); finish(true); }} className="flex flex-wrap items-end gap-2">
            <TextField id={`rename-${template.id}`} label={`New name for ${template.name}`} className="min-w-0 flex-1 basis-48" value={draft} maxLength={80}
              onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(false); } }} />
            <Button type="submit" variant="secondary" disabled={!draft.trim()}>Save name</Button>
            <Button variant="ghost" onClick={() => finish(false)}>Cancel</Button>
          </form>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <h3 id={titleId} className="min-w-0 flex-1 truncate font-semibold">{template.name}</h3>
            {open && <Badge tone="brand">Open now</Badge>}
          </div>
        )}
        <p className="tnum mt-0.5 text-xs leading-5 text-ink-3">
          {config.decks} decks · {dealtPercent(config.decks, config.dealt)}% · {spread ? `${unitLabel(spread.min)}–${unitLabel(spread.max)}` : "no bets"} · {money(config.baseBet)} unit · {money(config.bankroll)}
          {savedDate(template.createdAt) && <> · saved {savedDate(template.createdAt)}</>}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" className="min-h-11 sm:min-h-9" onClick={onLoad} aria-label={`Load ${template.name}`}>Load</Button>
          <JournalLink template={template} className="min-h-11 sm:min-h-9" />
          <span className="ml-auto flex gap-1">
            <IconButton ref={renameButton} label={`Rename ${template.name}`} onClick={() => { setDraft(template.name); setRenaming(true); }}><Pencil size={17} aria-hidden /></IconButton>
            <IconButton label={`Delete ${template.name}`} className="hover:text-neg" onClick={onDelete}><Trash2 size={17} aria-hidden /></IconButton>
          </span>
        </div>
      </article>
    </li>
  );
}

function VenueItem({ preset, onLoad, onDelete }: { preset: VenuePreset; onLoad: () => void; onDelete: () => void }) {
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-2xl border border-line p-3.5">
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold">{preset.name}</h3>
        <p className="tnum text-xs leading-5 text-ink-3">
          {preset.rules.decks} decks · {Math.round(preset.rules.penetration * 100)}% · {preset.rules.dealerHitsSoft17 ? "H17" : "S17"} · {preset.rules.blackjackPayout === 1.5 ? "3:2" : "6:5"} · 1–{unitLabel(rampSpread(preset.ramp))}
        </p>
      </div>
      <Button variant="secondary" size="sm" className="min-h-11 sm:min-h-9" onClick={onLoad} aria-label={`Load venue ${preset.name}`}>Load</Button>
      <IconButton label={`Delete venue ${preset.name}`} className="hover:text-neg" onClick={onDelete}><Trash2 size={17} aria-hidden /></IconButton>
    </li>
  );
}

/**
 * Everything saved from the Calculator: scenarios (the whole page) and venues
 * (one casino's rules and ramp). Load, rename, log a session, delete.
 */
export function LibrarySheet({ calc, open, onClose, onLoaded, onSaveCurrent }: { calc: Calc; open: boolean; onClose: () => void; onLoaded: () => void; onSaveCurrent: () => void }) {
  const [tab, setTab] = useState<"scenarios" | "venues">("scenarios");
  const [venueName, setVenueName] = useState("");
  const [status, setStatus] = useState("");
  const [pendingScenario, setPendingScenario] = useState<CvcxTemplate>();
  const [pendingVenue, setPendingVenue] = useState<VenuePreset>();
  const { templates, venues } = calc;
  const gaps = venueGaps(calc.config);
  const close = () => { setStatus(""); onClose(); };

  return (
    <Sheet open={open} onClose={close} title="Scenarios and venues" size="lg" initialFocus={`[id="tab-Saved items-${tab}"]`}>
      <Tabs label="Saved items" value={tab} onChange={(next) => { setTab(next); setStatus(""); }}
        tabs={[{ value: "scenarios", label: `Scenarios (${templates.length})` }, { value: "venues", label: `Venues (${venues.length})` }]} />
      <p role="status" className="mt-3 min-h-5 text-sm font-medium text-pos">{status}</p>

      {tab === "scenarios" ? (
        <div role="tabpanel" aria-label="Scenarios">
          <p className="text-sm leading-6 text-ink-2">A scenario saves everything on this page: game, bankroll, bet ramp, hands and trip length. The Journal can log a session from one.</p>
          {templates.length === 0 ? (
            <EmptyState className="mt-4" icon={<FolderOpen size={22} aria-hidden />} title="No saved scenarios yet" action={<Button variant="secondary" onClick={onSaveCurrent}>Save this setup</Button>}>
              Save a setup to reuse it, compare it, or log a session with it.
            </EmptyState>
          ) : (
            <>
              <ul className="mt-4 grid gap-2" aria-label="Saved scenarios">
                {templates.map((template) => (
                  <ScenarioItem
                    key={template.id}
                    template={template}
                    open={calc.active?.id === template.id}
                    onLoad={() => { calc.loadTemplate(template); close(); onLoaded(); }}
                    onRename={(name) => { const renamed = calc.renameScenario(template, name); if (renamed) setStatus(`Renamed to “${renamed.name}”.`); }}
                    onDelete={() => setPendingScenario(template)}
                  />
                ))}
              </ul>
              <Note className="mt-3">Up to 20 scenarios are kept. Saving a 21st removes the oldest.</Note>
            </>
          )}
        </div>
      ) : (
        <div role="tabpanel" aria-label="Venues">
          <p className="text-sm leading-6 text-ink-2">A venue keeps one casino&apos;s table rules, play mode and your ramp there. Loading one changes the game and ramp only, not your bankroll or unit. The Journal uses venues to fill in the casino.</p>
          <form className="mt-4 flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const name = venueName.trim();
              if (!name) return;
              calc.saveVenue(name);
              setVenueName("");
              setStatus(`Saved venue “${name}”.`);
            }}>
            <TextField label="Venue name" className="min-w-0 flex-1 basis-48" value={venueName} onChange={(event) => setVenueName(event.target.value)} placeholder="e.g. Downtown casino" data-analytics-field="venue_name" maxLength={80} />
            <Button type="submit" variant="secondary" className="h-12" disabled={!venueName.trim()}>Save venue</Button>
          </form>
          {gaps.length > 0 && (
            <p className="mt-2 text-xs leading-5 text-warn">Venues do not store {gaps.join(", ").replace(/, ([^,]*)$/, " or $1")}. Those keep their current settings when you load a venue.</p>
          )}
          {venues.length === 0 ? (
            <EmptyState className="mt-4" icon={<Building2 size={22} aria-hidden />} title="No venues yet">Save the rules and ramp you use at a casino to reload them quickly.</EmptyState>
          ) : (
            <ul className="mt-4 grid gap-2" aria-label="Saved venues">
              {venues.map((preset) => (
                <VenueItem key={preset.id} preset={preset} onLoad={() => { calc.loadVenue(preset); close(); onLoaded(); }} onDelete={() => setPendingVenue(preset)} />
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmSheet open={pendingScenario !== undefined} onClose={() => setPendingScenario(undefined)} title="Delete scenario?" confirmLabel="Delete"
        onConfirm={() => { if (pendingScenario) { calc.deleteScenario(pendingScenario); setStatus(`Deleted “${pendingScenario.name}”.`); } }}>
        {pendingScenario ? `This permanently deletes “${pendingScenario.name}”.` : null}
      </ConfirmSheet>
      <ConfirmSheet open={pendingVenue !== undefined} onClose={() => setPendingVenue(undefined)} title="Delete venue?" confirmLabel="Delete"
        onConfirm={() => { if (pendingVenue) { calc.deleteVenue(pendingVenue); setStatus(`Deleted venue “${pendingVenue.name}”.`); } }}>
        {pendingVenue ? `This permanently deletes the venue “${pendingVenue.name}”.` : null}
      </ConfirmSheet>
    </Sheet>
  );
}
