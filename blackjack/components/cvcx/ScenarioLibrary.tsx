"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { CvcxTemplate } from "@/lib/blackjack/cvcxLibrary";
import { normalizeConfig, rampSpread, venueGaps } from "@/lib/blackjack/labConfig";
import { dealtPercent, money } from "@/lib/blackjack/labFormat";
import { labBlocker, playedRamp, playedSpread, type Destination } from "@/lib/blackjack/labModel";
import { unitLabel } from "@/lib/blackjack/rampSteps";
import type { VenuePreset } from "@/lib/blackjack/venuePresets";
import { ConfirmModal } from "@/components/ConfirmModal";
import { scenarioHref, unsupportedScenario } from "@/components/ScenarioPicker";
import { Button, EmptyState, GhostButton, Sheet, TextField } from "@/components/ui";
import { StatusMark } from "./parts";
import { TabList } from "./TabList";
import type { Lab } from "./useLab";

const DESTINATIONS: ReadonlyArray<{ key: Destination; label: string; href: string }> = [
  { key: "simulation", label: "Session Simulator", href: "/simulation" },
  { key: "compare", label: "Compare Scenarios", href: "/compare" },
  { key: "trip-planner", label: "Trip Planner", href: "/trip-planner" },
  { key: "journal", label: "Session Journal", href: "/journal" },
];

/**
 * Links that open a saved scenario in the other planning tools. A tool that
 * would refuse the scenario is shown as unavailable, with the reason, rather
 * than as a link into an error.
 */
export function ScenarioDestinations({ template }: { template: CvcxTemplate }) {
  const config = normalizeConfig(template.config);
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2">
      {DESTINATIONS.map((destination) => {
        const blocked = unsupportedScenario(template.config, destination.key === "simulation") ? labBlocker(config, destination.key) : undefined;
        return (
          <li key={destination.key} className="min-w-0">
            {blocked ? (
              <p className="rounded-lg border border-dashed border-[var(--rule)] px-3 py-2 text-sm text-[var(--ink-muted)]">
                <span className="font-semibold">{destination.label}</span> unavailable
                <span className="block text-xs leading-5">{blocked.reason}</span>
              </p>
            ) : (
              <Link href={scenarioHref(destination.href, template.id)} className="pressable flex min-h-11 items-center justify-between gap-2 rounded-lg border border-[var(--rule)] bg-[var(--paper-raised)] px-3 text-sm font-semibold outline-none hover:border-[var(--ink-muted)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
                {destination.label}<i className="fa-solid fa-arrow-right text-xs text-[var(--ink-muted)]" aria-hidden="true" />
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const savedDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};

function ScenarioItem({ template, open, onLoad, onDelete }: { template: CvcxTemplate; open: boolean; onLoad: () => void; onDelete: () => void }) {
  const config = normalizeConfig(template.config);
  const spread = playedSpread(playedRamp(config));
  const titleId = `scenario-${template.id}`;
  return (
    <li>
      <article aria-labelledby={titleId} className={`rounded-xl border p-3 ${open ? "border-[var(--accent)]" : "border-[var(--rule)]"}`}>
        <div className="flex min-w-0 items-center gap-2">
          <h3 id={titleId} className="min-w-0 flex-1 truncate font-semibold">{template.name}</h3>
          {open && <StatusMark tone="good">Open now</StatusMark>}
        </div>
        <p className="mt-0.5 font-data text-xs leading-5 text-[var(--ink-muted)]">
          {config.decks} decks · {dealtPercent(config.decks, config.dealt)}% · {spread ? `${unitLabel(spread.min)}–${unitLabel(spread.max)}` : "no bets"} spread · {money(config.baseBet)} unit · {money(config.bankroll)}
        </p>
        {savedDate(template.createdAt) && <p className="text-xs text-[var(--ink-muted)]">Created {savedDate(template.createdAt)}</p>}
        <div className="mt-2.5 flex flex-wrap items-start gap-2">
          <GhostButton size="compact" onClick={onLoad} aria-label={`Load ${template.name}`}>Load</GhostButton>
          <details className="group min-w-0 flex-1 basis-40">
            <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-sm font-semibold outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-[var(--focus)] [@media(pointer:coarse)]:min-h-11 [&::-webkit-details-marker]:hidden">
              <i className="fa-solid fa-chevron-right text-[.65rem] text-[var(--ink-muted)] transition-transform group-open:rotate-90" aria-hidden="true" />
              Open in…<span className="sr-only"> another tool: {template.name}</span>
            </summary>
            <div className="pt-2"><ScenarioDestinations template={template} /></div>
          </details>
          <button type="button" onClick={onDelete} aria-label={`Delete ${template.name}`} className="pressable grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--rule)] text-sm text-[var(--ink-muted)] outline-none hover:border-[var(--negative)] hover:text-[var(--negative)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
            <i className="fa-solid fa-trash-can" aria-hidden="true" />
          </button>
        </div>
      </article>
    </li>
  );
}

function VenueItem({ preset, onLoad, onDelete }: { preset: VenuePreset; onLoad: () => void; onDelete: () => void }) {
  const decks = preset.rules.decks;
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-xl border border-[var(--rule)] p-3">
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold">{preset.name}</h3>
        <p className="font-data text-xs leading-5 text-[var(--ink-muted)]">
          {decks} decks · {Math.round(preset.rules.penetration * 100)}% · {preset.rules.dealerHitsSoft17 ? "H17" : "S17"} · {preset.rules.blackjackPayout === 1.5 ? "3:2" : "6:5"} · 1–{unitLabel(rampSpread(preset.ramp))}
        </p>
      </div>
      <GhostButton size="compact" onClick={onLoad} aria-label={`Load venue ${preset.name}`}>Load</GhostButton>
      <button type="button" onClick={onDelete} aria-label={`Delete venue ${preset.name}`} className="pressable grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--rule)] text-sm text-[var(--ink-muted)] outline-none hover:border-[var(--negative)] hover:text-[var(--negative)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
        <i className="fa-solid fa-trash-can" aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * Everything saved from the Lab in one place: scenarios (the whole page) and
 * venues (one casino's rules and ramp). Load, open in another tool, delete.
 */
export function ScenarioLibrary({ lab, open, onClose, onLoaded, onSaveCurrent }: { lab: Lab; open: boolean; onClose: () => void; onLoaded: () => void; onSaveCurrent: () => void }) {
  const [tab, setTab] = useState<"scenarios" | "venues">("scenarios");
  const [venueName, setVenueName] = useState("");
  const [status, setStatus] = useState("");
  const [pendingScenario, setPendingScenario] = useState<CvcxTemplate>();
  const [pendingVenue, setPendingVenue] = useState<VenuePreset>();
  const selectedTab = useRef<HTMLButtonElement>(null);
  const { templates, venues } = lab;
  const gaps = venueGaps(lab.config);
  const refocus = () => requestAnimationFrame(() => selectedTab.current?.focus());
  const close = () => { setStatus(""); onClose(); };

  return (
    <Sheet open={open} onClose={close} title="Scenarios & venues" initialFocusRef={selectedTab}>
      <TabList
        label="Saved items"
        value={tab}
        onChange={(next) => { setTab(next); setStatus(""); }}
        idFor={(value) => `library-tab-${value}`}
        panelIdFor={(value) => `library-panel-${value}`}
        selectedRef={selectedTab}
        items={[{ value: "scenarios", label: `Scenarios (${templates.length})` }, { value: "venues", label: `Venues (${venues.length})` }]}
      />
      <p role="status" className="mt-3 min-h-5 text-sm font-medium text-[var(--accent)]">{status}</p>

      <div id="library-panel-scenarios" role="tabpanel" aria-labelledby="library-tab-scenarios" hidden={tab !== "scenarios"}>
        <p className="text-sm leading-6 text-[var(--ink-muted)]">
          A scenario saves everything on this page: game, bankroll, bet ramp and hands. It also opens in the Session Simulator, Compare Scenarios, Trip Planner and Session Journal, which use the saved copy; later changes here travel only when you update it.
        </p>
        {templates.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon="fa-folder-open"
            title="No saved scenarios yet"
            description="Save this page's setup to reuse it here and in the other planning tools."
            action={<Button enterAction={false} onClick={onSaveCurrent}>Save current setup</Button>}
          />
        ) : (
          <>
            <ul className="mt-4 grid gap-2" aria-label="Saved scenarios">
              {templates.map((template) => (
                <ScenarioItem
                  key={template.id}
                  template={template}
                  open={lab.active?.id === template.id}
                  onLoad={() => { lab.loadTemplate(template, "library"); close(); onLoaded(); }}
                  onDelete={() => setPendingScenario(template)}
                />
              ))}
            </ul>
            <p className="mt-3 text-xs text-[var(--ink-muted)]">Up to 20 scenarios are kept. Saving a 21st removes the oldest.</p>
          </>
        )}
      </div>

      <div id="library-panel-venues" role="tabpanel" aria-labelledby="library-tab-venues" hidden={tab !== "venues"}>
        <p className="text-sm leading-6 text-[var(--ink-muted)]">
          A venue stores one casino&apos;s table rules, play mode and your bet ramp there. Loading a venue changes the game and ramp only, not your bankroll or unit. The Session Journal uses venues to fill in the casino name.
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const name = venueName.trim();
            if (!name) return;
            lab.saveVenue(name);
            setVenueName("");
            setStatus(`Saved venue “${name}”.`);
          }}
        >
          <div className="min-w-0 flex-1 basis-48">
            <TextField label="Venue name" value={venueName} onChange={(event) => setVenueName(event.target.value)} placeholder="e.g. Downtown casino" data-analytics-field="venue_name" />
          </div>
          <GhostButton type="submit" disabled={!venueName.trim()}>Save venue</GhostButton>
        </form>
        {gaps.length > 0 && (
          <p className="mt-2 text-xs leading-5 text-[var(--warning)]">
            <i className="fa-solid fa-triangle-exclamation mr-1.5" aria-hidden="true" />
            Venues don&apos;t store {gaps.join(", ").replace(/, ([^,]*)$/, " or $1")}. Those keep their current settings when you load a venue.
          </p>
        )}
        {venues.length === 0 ? (
          <EmptyState className="mt-4" icon="fa-building" title="No venues yet" description="Save the rules and ramp you use at a casino to reload them quickly." />
        ) : (
          <ul className="mt-4 grid gap-2" aria-label="Saved venues">
            {venues.map((preset) => (
              <VenueItem
                key={preset.id}
                preset={preset}
                onLoad={() => { lab.loadVenue(preset); close(); }}
                onDelete={() => setPendingVenue(preset)}
              />
            ))}
          </ul>
        )}
      </div>

      <ConfirmModal
        open={pendingScenario !== undefined}
        title="Delete scenario?"
        description={pendingScenario ? `This permanently deletes “${pendingScenario.name}”.` : ""}
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setPendingScenario(undefined)}
        onConfirm={() => {
          if (pendingScenario) {
            lab.deleteScenario(pendingScenario);
            setStatus(`Deleted “${pendingScenario.name}”.`);
          }
          setPendingScenario(undefined);
          refocus();
        }}
      />
      <ConfirmModal
        open={pendingVenue !== undefined}
        title="Delete venue?"
        description={pendingVenue ? `This permanently deletes the venue “${pendingVenue.name}”.` : ""}
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setPendingVenue(undefined)}
        onConfirm={() => {
          if (pendingVenue) {
            lab.deleteVenue(pendingVenue);
            setStatus(`Deleted venue “${pendingVenue.name}”.`);
          }
          setPendingVenue(undefined);
          refocus();
        }}
      />
    </Sheet>
  );
}
