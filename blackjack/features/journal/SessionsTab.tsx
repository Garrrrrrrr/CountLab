"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, StickyNote, TriangleAlert } from "lucide-react";
import { Button, EmptyState, Segmented, announce, cx } from "@/components/ui";
import { analytics } from "@/lib/analytics";
import { isJournalDate, type JournalSession } from "@/lib/blackjack/journal";
import { classifySessionAssessment, sessionZScore, type TheoreticalOutcome } from "@/lib/blackjack/journalAnalysis";
import { hoursLabel, plural, signedMoney } from "@/lib/blackjack/journalFormat";
import { newestFirst, sessionMatches, type ResultFilter } from "@/lib/blackjack/journalView";
import { groupByMonth, toneClass } from "./model";
import { SearchField, Verdict } from "./parts";

export const SESSION_SEARCH_ID = "journal-session-search";
const PAGE = 60;
const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const dayMonth = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function DateLabel({ date }: { date: string }) {
  if (!isJournalDate(date)) return <span className="inline-flex items-center gap-1.5 text-warn"><TriangleAlert size={14} aria-hidden />Invalid date</span>;
  const day = new Date(`${date}T12:00:00`);
  return <>{weekday.format(day)}, {dayMonth.format(day)}</>;
}

/**
 * Past sessions as cards grouped by month, newest first. Tapping a card opens
 * its details, where it can be edited or deleted; nothing hides behind a swipe.
 */
export function SessionsTab({ sessions, lifetimeCount, outcomes, bankrollNames, showBankroll, scopePhrase, filtered, onClearFilters, onOpen }: {
  /** Sessions in the current bankroll, dates and venue. */
  sessions: JournalSession[];
  /** Sessions in the current bankroll over all time. */
  lifetimeCount: number;
  outcomes: Map<string, TheoreticalOutcome>;
  bankrollNames: Map<string, string>;
  showBankroll: boolean;
  /** "the last 30 days at Bellagio", when filters narrow the list. */
  scopePhrase: string;
  filtered: boolean;
  onClearFilters: () => void;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ResultFilter>("all");
  const [visible, setVisible] = useState(PAGE);
  const sorted = useMemo(() => newestFirst(sessions), [sessions]);
  const matching = useMemo(() => sorted.filter((session) => sessionMatches(session, query, result)), [sorted, query, result]);
  const groups = useMemo(() => groupByMonth(matching.slice(0, visible)), [matching, visible]);
  const searching = query.trim() !== "" || result !== "all";
  const status = `Showing ${matching.length.toLocaleString("en-US")} of ${plural(sorted.length, "session")}`;
  // Spoken once typing settles, not on every keystroke.
  useEffect(() => {
    if (!searching) return;
    const timer = setTimeout(() => announce(status), 700);
    return () => clearTimeout(timer);
  }, [status, searching]);

  // The overview above already explains the journal, so an empty list stays one quiet line.
  if (lifetimeCount === 0) return <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-2">No sessions yet. They show up here, grouped by month.</p>;
  if (sorted.length === 0) {
    return <EmptyState title={`No sessions in ${scopePhrase}`} action={<Button variant="secondary" onClick={onClearFilters}>Clear filters</Button>}>You have {plural(lifetimeCount, "session")} in all.</EmptyState>;
  }

  const assessmentOf = (session: JournalSession) => { const outcome = outcomes.get(session.id); return classifySessionAssessment(outcome ? sessionZScore(session, outcome) : null); };

  return (
    <div className="grid grid-cols-1 gap-4">
      {filtered && (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
          Showing {scopePhrase}.
          <button type="button" onClick={onClearFilters} className="inline-flex h-11 items-center font-semibold text-brand-text underline underline-offset-4 hover:no-underline">Clear filters</button>
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center">
        <SearchField id={SESSION_SEARCH_ID} label="Search sessions" placeholder="Casino, notes or date" value={query} onChange={(value) => { setQuery(value); setVisible(PAGE); }} />
        <Segmented<ResultFilter> label="Show" hideLabel value={result} onChange={(value) => { setResult(value); setVisible(PAGE); analytics.track("filter_applied", { surface: "session_journal", filter: "result", value }); }}
          options={[{ value: "all", label: "All" }, { value: "win", label: "Wins" }, { value: "loss", label: "Losses" }]} />
      </div>
      {searching && <p className="-mt-1 text-xs text-ink-3">{status}</p>}

      {matching.length === 0 ? (
        <EmptyState title="No sessions match" action={<Button variant="secondary" onClick={() => { setQuery(""); setResult("all"); }}>Clear search</Button>}>Try a casino name, a month like “Sep”, or a word from your notes.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`journal-month-${group.key}`}>
              <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
                <h3 id={`journal-month-${group.key}`} className="text-sm font-semibold text-ink">{group.label}</h3>
                <p className="tnum text-xs text-ink-3">{plural(group.sessions.length, "session")} · {hoursLabel(group.hours)} · <span className={cx("font-semibold", toneClass(group.total))}>{signedMoney(group.total)}</span></p>
              </div>
              <ul className="card divide-y divide-line overflow-hidden" aria-label={`Sessions in ${group.label}`}>
                {group.sessions.map((session) => {
                  const outcome = outcomes.get(session.id);
                  const casino = session.location?.trim();
                  const notes = Boolean(session.notes?.trim());
                  return (
                    <li key={session.id}>
                      {/* Phones: two lines with the result on the right. From md the same cells line up in columns. */}
                      <button type="button" data-session-row={session.id} onClick={() => onOpen(session.id)}
                        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2 focus-visible:bg-surface-2 md:grid md:grid-cols-[minmax(0,1fr)_4rem_6.5rem_7rem_12.5rem_1.125rem] md:gap-4">
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-1.5 font-semibold text-ink">
                            <span className="truncate"><DateLabel date={session.date} /><span className={cx("font-normal", casino ? "text-ink-2" : "text-ink-3")}> · {casino || "No casino"}</span></span>
                            {notes && <><StickyNote size={13} aria-hidden className="shrink-0 text-ink-3" /><span className="sr-only">, has notes</span></>}
                          </span>
                          <span className="tnum mt-0.5 block truncate text-xs text-ink-3 md:hidden">
                            {hoursLabel(session.hours)} · EV {outcome ? signedMoney(outcome.tripEv) : "—"}{showBankroll ? ` · ${bankrollNames.get(session.bankrollId) ?? ""}` : ""}
                          </span>
                          {showBankroll && <span className="mt-0.5 hidden truncate text-xs text-ink-3 md:block">{bankrollNames.get(session.bankrollId)}</span>}
                        </span>
                        <span className="tnum hidden text-right text-sm text-ink-2 md:block">{hoursLabel(session.hours)}</span>
                        <span className="tnum hidden text-right text-sm text-ink-2 md:block">EV {outcome ? signedMoney(outcome.tripEv) : "—"}</span>
                        <span className="flex shrink-0 flex-col items-end gap-0.5">
                          <span className={cx("tnum font-semibold", toneClass(session.netResult))}>{signedMoney(session.netResult)}</span>
                          <Verdict assessment={assessmentOf(session)} size="sm" className="hidden xs:inline-flex md:hidden" />
                        </span>
                        <Verdict assessment={assessmentOf(session)} size="sm" className="hidden md:inline-flex" />
                        <ChevronRight size={18} aria-hidden className="-mr-1 shrink-0 text-ink-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {matching.length > visible && (
            <div><Button variant="secondary" onClick={() => setVisible((count) => count + PAGE)}>Show {Math.min(PAGE, matching.length - visible)} more ({matching.length - visible} left)</Button></div>
          )}
        </div>
      )}
    </div>
  );
}
