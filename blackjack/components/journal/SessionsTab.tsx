"use client";
import { useEffect, useMemo, useState } from "react";
import { analytics } from "@/lib/analytics";
import { isJournalDate, type JournalSession } from "@/lib/blackjack/journal";
import { classifySessionAssessment, sessionZScore, type TheoreticalOutcome } from "@/lib/blackjack/journalAnalysis";
import { hoursLabel, plural, shortDate, signedMoney } from "@/lib/blackjack/journalFormat";
import { newestFirst, periodPhrase, sessionMatches, type Period, type ResultFilter } from "@/lib/blackjack/journalView";
import { announce, EmptyState, GhostButton, SegmentedControl } from "../ui";
import { SearchField, VerdictBadge, toneText } from "./parts";

export const SESSION_SEARCH_ID = "journal-session-search";
const PAGE = 50;

const casinoText = (session: JournalSession) => session.location?.trim() || "";

function DateCell({ date }: { date: string }) {
  return isJournalDate(date)
    ? <>{shortDate(date)}</>
    : <span className="inline-flex items-center gap-1.5 text-[var(--warning)]"><i className="fa-solid fa-triangle-exclamation text-xs" aria-hidden="true" />Invalid date</span>;
}

/** Past sessions, searchable and filterable, each opening its details. */
export function SessionsTab({ sessions, lifetimeCount, outcomes, bankrollNames, showBankroll, period, onShowAllTime, onOpen, onEdit }: {
  /** Sessions in the current bankroll and period. */
  sessions: JournalSession[];
  /** Sessions in the current bankroll over all time. */
  lifetimeCount: number;
  outcomes: Map<string, TheoreticalOutcome>;
  bankrollNames: Map<string, string>;
  showBankroll: boolean;
  period: Period;
  onShowAllTime: () => void;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [visible, setVisible] = useState(PAGE);
  const sorted = useMemo(() => newestFirst(sessions), [sessions]);
  const filtered = useMemo(() => sorted.filter((session) => sessionMatches(session, query, filter)), [sorted, query, filter]);
  const shown = filtered.slice(0, visible);
  const filtering = query.trim() !== "" || filter !== "all";
  const status = `Showing ${filtered.length.toLocaleString("en-US")} of ${plural(sorted.length, "session")}`;
  // Spoken once typing settles, not on every keystroke.
  useEffect(() => {
    if (!filtering) return;
    const timer = setTimeout(() => announce(status), 700);
    return () => clearTimeout(timer);
  }, [status, filtering]);

  if (lifetimeCount === 0) {
    // The overview above already offers the first steps, so this stays a plain note.
    return <EmptyState icon="fa-book-open" title="No sessions yet" description="Log your first session after you play." />;
  }
  if (sorted.length === 0) {
    return <EmptyState icon="fa-calendar-xmark" title={`No sessions in ${periodPhrase(period)}.`} description={`You have ${plural(lifetimeCount, "session")} in all.`} action={<GhostButton onClick={onShowAllTime}>Show all time</GhostButton>} />;
  }

  const outcomeOf = (session: JournalSession) => outcomes.get(session.id);
  const assessmentOf = (session: JournalSession) => { const outcome = outcomeOf(session); return classifySessionAssessment(outcome ? sessionZScore(session, outcome) : null); };
  // The casino is read out as the button's description rather than in its name,
  // so the Casino cell stays the only cell named after the casino.
  const detailsLabel = (session: JournalSession) => `Details for ${shortDate(session.date)}${session.notes?.trim() ? ", has notes" : ""}`;
  const casinoId = (session: JournalSession) => `journal-casino-${session.id}`;

  return (
    <div className="grid grid-cols-1 gap-4">
      {period !== "all" && (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-[var(--ink-muted)]">
          Showing {periodPhrase(period)}.
          <button type="button" onClick={onShowAllTime} className="min-h-11 font-semibold text-[var(--accent)] underline underline-offset-2 hover:no-underline">Show all time</button>
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <SearchField id={SESSION_SEARCH_ID} label="Search sessions" placeholder="Date, casino, or notes" analyticsField="search_journal_sessions" value={query} onChange={(value) => { setQuery(value); setVisible(PAGE); }} />
        </div>
        <SegmentedControl<ResultFilter>
          label="Result"
          hideLabel
          name="journal-result-filter"
          analyticsField="result_filter"
          value={filter}
          onChange={(value) => { setFilter(value); setVisible(PAGE); analytics.track("filter_applied", { surface: "session_journal", filter: "result", value }); }}
          options={[{ value: "all", label: "All" }, { value: "win", label: "Wins" }, { value: "loss", label: "Losses" }]}
        />
        <p className="basis-full text-xs text-[var(--ink-muted)] sm:basis-auto">{status}</p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="fa-magnifying-glass" title="No sessions match your search." action={<GhostButton onClick={() => { setQuery(""); setFilter("all"); }}>Clear search and filters</GhostButton>} />
      ) : (
        <>
          <ul aria-label="Sessions" className="grid grid-cols-1 gap-2 md:hidden">
            {shown.map((session) => {
              const outcome = outcomeOf(session);
              return (
                <li key={session.id}>
                  <button type="button" data-session-row={session.id} onClick={() => onOpen(session.id)} className="pressable flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border border-[var(--rule)] bg-[var(--paper)] px-3.5 py-3 text-left hover:border-[var(--ink-muted)]">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold"><DateCell date={session.date} /></span>
                      <span className="block truncate text-sm text-[var(--ink-muted)]">
                        {casinoText(session) || "Not recorded"}
                        {session.notes?.trim() && <i className="fa-solid fa-note-sticky ml-1.5 text-xs" aria-hidden="true" />}
                        {session.notes?.trim() && <span className="sr-only">, has notes</span>}
                        {showBankroll && ` · ${bankrollNames.get(session.bankrollId) ?? ""}`}
                      </span>
                      <span className="block text-xs text-[var(--ink-muted)]">{hoursLabel(session.hours)} · Expected {outcome ? signedMoney(outcome.tripEv) : "—"}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={`block font-data font-semibold ${toneText(session.netResult)}`}>{signedMoney(session.netResult)}</span>
                      <VerdictBadge assessment={assessmentOf(session)} size="sm" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[40rem] text-left font-[family-name:var(--font-ui)] text-sm">
              <caption className="sr-only">Sessions</caption>
              <thead className="text-xs text-[var(--ink-muted)]">
                <tr>
                  <th scope="col" className="px-2 pb-2 font-medium">Date</th>
                  <th scope="col" className="px-2 pb-2 font-medium">Casino</th>
                  <th scope="col" className="hidden px-2 pb-2 text-right font-medium xl:table-cell">Hours</th>
                  <th scope="col" className="px-2 pb-2 text-right font-medium">Result</th>
                  <th scope="col" className="px-2 pb-2 text-right font-medium">Expected</th>
                  <th scope="col" className="px-2 pb-2 font-medium">Versus expected</th>
                  <th scope="col" className="px-2 pb-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((session) => {
                  const outcome = outcomeOf(session);
                  return (
                    // The row is a large mouse target; the Details button is the keyboard and screen-reader path.
                    <tr key={session.id} onClick={() => onOpen(session.id)} className="cursor-pointer border-t border-[var(--rule)] hover:bg-overlay/[.04]">
                      <td className="whitespace-nowrap px-2 py-2.5">
                        <DateCell date={session.date} />
                        <span className="block text-xs text-[var(--ink-muted)] xl:hidden">{hoursLabel(session.hours)}</span>
                      </td>
                      <td className="max-w-[14rem] px-2 py-2.5">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span id={casinoId(session)} title={casinoText(session) || undefined} className={`truncate ${casinoText(session) ? "" : "text-[var(--ink-muted)]"}`}>{casinoText(session) || "Not recorded"}</span>
                          {session.notes?.trim() && <i className="fa-solid fa-note-sticky shrink-0 text-xs text-[var(--ink-muted)]" title="Has notes" aria-hidden="true" />}
                        </span>
                        {showBankroll && <span className="block truncate text-xs text-[var(--ink-muted)]">{bankrollNames.get(session.bankrollId)}</span>}
                      </td>
                      <td className="hidden whitespace-nowrap px-2 py-2.5 text-right font-data xl:table-cell">{hoursLabel(session.hours)}</td>
                      <td className={`whitespace-nowrap px-2 py-2.5 text-right font-data font-semibold ${toneText(session.netResult)}`}>{signedMoney(session.netResult)}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right font-data text-[var(--ink-muted)]">{outcome ? signedMoney(outcome.tripEv) : "—"}</td>
                      <td className="px-2 py-2.5"><VerdictBadge assessment={assessmentOf(session)} size="sm" /></td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        <span className="inline-flex items-center gap-1">
                          <button type="button" aria-label={`Edit session on ${shortDate(session.date)}`} title="Edit" onClick={(event) => { event.stopPropagation(); onEdit(session.id); }} className="hidden h-9 w-9 place-items-center rounded-lg text-[var(--ink-muted)] hover:bg-overlay/[.06] hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] xl:inline-grid">
                            <i className="fa-solid fa-pen text-xs" aria-hidden="true" />
                          </button>
                          <GhostButton type="button" size="compact" data-session-row={session.id} aria-label={detailsLabel(session)} aria-describedby={casinoId(session)} onClick={(event) => { event.stopPropagation(); onOpen(session.id); }}>Details</GhostButton>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > visible && (
            <div><GhostButton onClick={() => setVisible((count) => count + PAGE)}>Show 50 more sessions ({filtered.length - visible} remaining)</GhostButton></div>
          )}
        </>
      )}
    </div>
  );
}
