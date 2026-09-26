"use client";
import type { JournalVenueSummary } from "@/lib/blackjack/journalAnalysis";
import { rulesSummary, spreadLabel } from "@/lib/blackjack/journalForm";
import { hoursLabel, plural, shortDate, signedMoney } from "@/lib/blackjack/journalFormat";
import { periodPhrase, type Period } from "@/lib/blackjack/journalView";
import type { VenuePreset } from "@/lib/blackjack/venuePresets";
import { GhostButton } from "../ui";
import { VerdictBadge, toneText } from "./parts";

const venueName = (venue: JournalVenueSummary) => venue.location || "No casino recorded";

/** Casinos compared with the EV of the games played there, and the venue rules saved for reuse. */
export function VenuesTab({ venues, presets, period, onShowAllTime, onUse, onDelete }: {
  venues: JournalVenueSummary[];
  presets: VenuePreset[];
  period: Period;
  onShowAllTime: () => void;
  onUse: (preset: VenuePreset) => void;
  onDelete: (preset: VenuePreset) => void;
}) {
  return (
    <div className="grid gap-8">
      <section aria-labelledby="journal-venue-results" className="grid gap-3">
        <div>
          <h3 id="journal-venue-results" className="text-base font-semibold">Results by venue</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">Each casino compared with the EV of the games you logged there. Over a few hours, differences are just swings.</p>
          {period !== "all" && (
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-[var(--ink-muted)]">
              Showing {periodPhrase(period)}.
              <button type="button" onClick={onShowAllTime} className="min-h-11 font-semibold text-[var(--accent)] underline underline-offset-2 hover:no-underline">Show all time</button>
            </p>
          )}
        </div>
        {venues.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--rule)] px-4 py-6 text-center text-sm text-[var(--ink-muted)]">Add a casino name when you log sessions to compare venues.</p>
        ) : (
          <>
            <ul aria-label="Results by venue" className="grid gap-2 md:hidden">
              {venues.map((venue) => (
                <li key={venue.location || "unspecified"} className="rounded-xl border border-[var(--rule)] p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`truncate font-semibold ${venue.location ? "" : "text-[var(--ink-muted)]"}`}>{venueName(venue)}</p>
                      <p className="text-xs text-[var(--ink-muted)]">{plural(venue.sessionCount, "session")} · {hoursLabel(venue.totalHours)}</p>
                    </div>
                    <p className={`shrink-0 font-data font-semibold ${toneText(venue.totalActual)}`}>{signedMoney(venue.totalActual)}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-muted)]">
                    <span>Expected <span className="font-data">{signedMoney(venue.totalTheoretical)}</span> · <span className="font-data">{signedMoney(venue.actualPerHour)}</span>/hour</span>
                    <VerdictBadge assessment={venue.assessment} size="sm" />
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[36rem] text-left font-[family-name:var(--font-ui)] text-sm">
                <caption className="sr-only">Results by venue</caption>
                <thead className="text-xs text-[var(--ink-muted)]">
                  <tr>
                    <th scope="col" className="px-2 pb-2 font-medium">Casino</th>
                    <th scope="col" className="px-2 pb-2 text-right font-medium">Hours</th>
                    <th scope="col" className="px-2 pb-2 text-right font-medium">Result</th>
                    <th scope="col" className="px-2 pb-2 text-right font-medium">Expected</th>
                    <th scope="col" className="px-2 pb-2 text-right font-medium">Per hour</th>
                    <th scope="col" className="px-2 pb-2 font-medium">Versus expected</th>
                  </tr>
                </thead>
                <tbody>
                  {venues.map((venue) => (
                    <tr key={venue.location || "unspecified"} className="border-t border-[var(--rule)]">
                      <td className="max-w-[16rem] px-2 py-2.5">
                        <span className={`block truncate ${venue.location ? "" : "text-[var(--ink-muted)]"}`}>{venueName(venue)}</span>
                        <span className="block text-xs text-[var(--ink-muted)]">{plural(venue.sessionCount, "session")}</span>
                      </td>
                      <td className="px-2 py-2.5 text-right font-data">{hoursLabel(venue.totalHours)}</td>
                      <td className={`px-2 py-2.5 text-right font-data font-semibold ${toneText(venue.totalActual)}`}>{signedMoney(venue.totalActual)}</td>
                      <td className="px-2 py-2.5 text-right font-data text-[var(--ink-muted)]">{signedMoney(venue.totalTheoretical)}</td>
                      <td className={`px-2 py-2.5 text-right font-data ${toneText(venue.actualPerHour)}`}>{signedMoney(venue.actualPerHour)}</td>
                      <td className="px-2 py-2.5"><VerdictBadge assessment={venue.assessment} size="sm" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="journal-saved-venues" className="grid gap-3">
        <div>
          <h3 id="journal-saved-venues" className="text-base font-semibold">Saved venues</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">Rules and spreads you saved for reuse, shared with the Lab, Simulator, Compare and Trip Planner. Stored on this device only. Up to 20; saving more removes the oldest.</p>
        </div>
        {presets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--rule)] px-4 py-6 text-center text-sm text-[var(--ink-muted)]">Save a venue from Log session → Change game to reuse its rules.</p>
        ) : (
          <ul aria-label="Saved venues" className="grid gap-2 lg:grid-cols-2">
            {presets.map((preset) => (
              <li key={preset.id} className="flex flex-col justify-between gap-3 rounded-xl border border-[var(--rule)] p-3.5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <b title={preset.name} className="truncate font-semibold">{preset.name}</b>
                    <span className="text-xs text-[var(--ink-muted)]">Saved {shortDate(preset.createdAt.slice(0, 10))}</span>
                  </p>
                  <p className="mt-1 text-sm text-[var(--ink-muted)]">{rulesSummary(preset.rules)} · {spreadLabel(preset.ramp)} spread</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <GhostButton type="button" size="compact" data-venue-row={preset.id} onClick={() => onUse(preset)}><i className="fa-solid fa-plus mr-2 text-xs" aria-hidden="true" />Use for a session</GhostButton>
                  <GhostButton type="button" size="compact" aria-label={`Delete saved venue ${preset.name}`} className="text-[var(--negative)]" onClick={() => onDelete(preset)}>Delete</GhostButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
