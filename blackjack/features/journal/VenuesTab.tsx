"use client";
import { MapPin, Plus, Trash } from "lucide-react";
import { Button, cx } from "@/components/ui";
import type { JournalVenueSummary } from "@/lib/blackjack/journalAnalysis";
import { rulesSummary, spreadLabel } from "@/lib/blackjack/journalForm";
import { hoursLabel, plural, shortDate, signedMoney } from "@/lib/blackjack/journalFormat";
import type { VenuePreset } from "@/lib/blackjack/venuePresets";
import { toneClass } from "./model";
import { Verdict } from "./parts";

/** Casinos compared with the EV of the games played there, and the venues saved for reuse. */
export function VenuesTab({ venues, presets, scopePhrase, onAdd, onUse, onDelete }: {
  venues: JournalVenueSummary[];
  presets: VenuePreset[];
  /** "all time" or "the last 30 days", the dates the results cover. */
  scopePhrase: string;
  onAdd: () => void;
  onUse: (preset: VenuePreset) => void;
  onDelete: (preset: VenuePreset) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-8">
      <section aria-labelledby="journal-saved-venues" className="grid grid-cols-1 gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 max-w-xl">
            <h3 id="journal-saved-venues" className="text-base font-semibold">Saved venues</h3>
            <p className="mt-1 text-sm leading-6 text-ink-2">Each casino&apos;s rules and your spread there, shared with the Calculator. Kept on this device, up to 20.</p>
          </div>
          <Button variant="secondary" icon={<Plus size={16} aria-hidden />} onClick={onAdd}>New venue</Button>
        </div>
        {presets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-2">No saved venues yet. Add one, or save the game from Log session → Change game.</p>
        ) : (
          <ul aria-label="Saved venues" className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {presets.map((preset) => (
              <li key={preset.id} className="card flex flex-col justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <b title={preset.name} className="min-w-0 truncate font-semibold">{preset.name}</b>
                    <span className="text-xs text-ink-3">Saved {shortDate(preset.createdAt.slice(0, 10))}</span>
                  </p>
                  <p className="mt-1 text-sm leading-6 text-ink-2">{rulesSummary(preset.rules)} · {spreadLabel(preset.ramp)} spread</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" className="h-11" data-venue-row={preset.id} icon={<Plus size={16} aria-hidden />} onClick={() => onUse(preset)}>Log a session here</Button>
                  <Button size="sm" variant="ghost" className="h-11 text-neg hover:text-neg" aria-label={`Delete saved venue ${preset.name}`} icon={<Trash size={16} aria-hidden />} onClick={() => onDelete(preset)}>Delete</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="journal-venue-results" className="grid grid-cols-1 gap-3">
        <div className="max-w-xl">
          <h3 id="journal-venue-results" className="text-base font-semibold">Results by casino</h3>
          <p className="mt-1 text-sm leading-6 text-ink-2">Each casino against the EV of the games you logged there, for {scopePhrase}. Over a few hours, differences are just swings.</p>
        </div>
        {venues.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-2">Add a casino when you log sessions to compare venues.</p>
        ) : (
          <ul aria-label="Results by casino" className="card divide-y divide-line overflow-hidden">
            {venues.map((venue) => (
              <li key={venue.location.toLocaleLowerCase() || "unspecified"} className="grid grid-cols-1 gap-1.5 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <MapPin size={15} aria-hidden className="shrink-0 text-ink-3" />
                    <p className={cx("truncate font-semibold", !venue.location && "text-ink-3")}>{venue.location || "No casino recorded"}</p>
                  </div>
                  <p className={cx("tnum shrink-0 font-semibold", toneClass(venue.totalActual))}>{signedMoney(venue.totalActual)}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pl-6 text-xs text-ink-3">
                  <span className="tnum">{plural(venue.sessionCount, "session")} · {hoursLabel(venue.totalHours)} · EV {signedMoney(venue.totalTheoretical)} · <span className={toneClass(venue.actualPerHour)}>{signedMoney(venue.actualPerHour)}</span>/h</span>
                  <Verdict assessment={venue.assessment} size="sm" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
