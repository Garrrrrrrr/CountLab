"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight, Plus } from "lucide-react";
import { Button, Callout, ConfirmSheet, PageHeader, Tabs, toast } from "@/components/ui";
import { BottomDock } from "@/components/shell/BottomDock";
import { analytics } from "@/lib/analytics";
import { track } from "@/lib/analytics/track";
import { journalLibrary, type BankrollTransaction, type JournalSession } from "@/lib/blackjack/journal";
import { heatByCasino, theoreticalSessionOutcome } from "@/lib/blackjack/journalAnalysis";
import { applyVenue, draftFromSession, gameFromScenario, newSessionDraft, rememberedGame, type GameDraft, type GameSource, type SessionDraft } from "@/lib/blackjack/journalForm";
import { longDate } from "@/lib/blackjack/journalFormat";
import { neighbourId, targetBankrollId } from "@/lib/blackjack/journalView";
import { scenarioRamp } from "@/lib/blackjack/scenarios";
import { venuePresetLibrary, type VenuePreset } from "@/lib/blackjack/venuePresets";
import { useSettings } from "@/lib/hooks/useSettings";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { BankrollsSheet } from "./BankrollsSheet";
import { CASH_RECORD_ID, CashTab } from "./CashTab";
import { CashMovementSheet, STARTING_NOTE } from "./CashMovementSheet";
import { DataTab } from "./DataTab";
import { Filters } from "./Filters";
import { LogSessionSheet, type SavedSession } from "./LogSessionSheet";
import { ALL_TIME, cashLabel, dateFilterPhrase, deleteAllJournalRecords, filterByDate, isNarrowed, PERIOD_OPTIONS } from "./model";
import { BankrollHealthCard, JournalEmpty, OverviewSkeleton, ResultsCard } from "./Overview";
import { SessionDetailsSheet } from "./SessionDetailsSheet";
import { SESSION_SEARCH_ID, SessionsTab } from "./SessionsTab";
import { ShareSheet } from "./ShareSheet";
import { SyncStatus } from "./SyncStatus";
import { useJournalData } from "./useJournalData";
import { useJournalScope, type JournalFilters } from "./useJournalScope";
import { calculatorHref, stripScenarioParam, useScenarioArrival } from "./useScenarioArrival";
import { addressWith, useSheetHistory } from "./useSheetHistory";
import { VenueSheet } from "./VenueSheet";
import { VenuesTab } from "./VenuesTab";

type Tab = "overview" | "sessions" | "cash" | "venues" | "data";
const TAB_HASHES: Record<string, Tab> = { overview: "overview", sessions: "sessions", cash: "cash", venues: "venues", data: "data" };

type Overlay =
  | { kind: "log"; mode: "new"; draft: SessionDraft; scenario?: { id: string; name: string } }
  | { kind: "log"; mode: "edit"; sessionId: string; draft: SessionDraft }
  | { kind: "details"; sessionId: string; layer?: "delete" | "share" }
  | { kind: "cash"; bankrollId: string; note?: string }
  | { kind: "bankrolls" }
  | { kind: "venue" }
  | { kind: "deleteCash"; transaction: BankrollTransaction }
  | { kind: "deleteVenue"; preset: VenuePreset };
/** Overlays with their own history entry, so Back closes them. Confirmations don't get one. */
const SHEETS = new Set<Overlay["kind"]>(["log", "details", "cash", "bankrolls", "venue"]);

type RowAttribute = "data-session-row" | "data-cash-row" | "data-venue-row";
const shownRows = (attribute: RowAttribute) => Array.from(document.querySelectorAll<HTMLElement>(`[${attribute}]`)).filter((element) => element.getClientRects().length > 0);
/** The row on screen after (or else before) the one being removed, for focus to land on. */
const neighbourOf = (attribute: RowAttribute, id: string) => neighbourId(shownRows(attribute).map((element) => element.getAttribute(attribute) ?? ""), id);
type FocusRequest = { row?: [RowAttribute, string]; fallback: string };
type Notice = { message: string; action?: { label: string; run: () => void } };

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, button, a, [contenteditable], [role=tab], [role=dialog]"));

/**
 * The session journal: results against expectation and bankroll health up
 * front, records in tabs, and every form in its own sheet. All reads and
 * writes go through journalLibrary, so stored data keeps its format.
 */
export function Journal() {
  const { user, syncStatus } = useAuth();
  const { settings } = useSettings();
  const { data, dismiss, batch } = useJournalData();
  const [filters, setFilters] = useState<JournalFilters>({ bankroll: "all", dates: ALL_TIME, venue: null });
  const [tab, setTab] = useState<Tab>("overview");
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [arrivalDismissed, setArrivalDismissed] = useState(false);
  const desktop = useMediaQuery("(min-width: 1024px)", false);
  const guard = useRef<(() => boolean) | null>(null);
  const registerGuard = useCallback((next: (() => boolean) | null) => { guard.current = next; }, []);

  const scoped = useJournalScope(data, filters);
  const effective = scoped.applied;
  const { bankroll: bankrollId, venue } = effective;
  const multiple = data.bankrolls.length > 1;
  const scopeName = bankrollId === "all" ? (multiple ? "All bankrolls" : data.bankrolls[0]?.name ?? "Main") : scoped.bankrollNames.get(bankrollId) ?? "Bankroll";
  const target = targetBankrollId(bankrollId, scoped.defaultBankrollId);
  const hasAnyData = data.sessions.length > 0 || data.transactions.length > 0;
  const venueName = venue === null ? null : scoped.venues.find((choice) => choice.key === venue)?.name ?? null;
  const narrowed = isNarrowed(filters.dates) || venue !== null;
  const scopePhrase = `${dateFilterPhrase(filters.dates)}${venueName ? ` at ${venueName}` : ""}`;
  const periodTitle = filters.dates.period === "custom" ? dateFilterPhrase(filters.dates).replace(/^./, (letter) => letter.toUpperCase()) : PERIOD_OPTIONS.find((option) => option.value === filters.dates.period)?.label ?? "All time";
  const clearFilters = () => setFilters((current) => ({ ...current, dates: ALL_TIME, venue: null }));
  const changeFilters = (next: JournalFilters) => {
    if (next.dates.period !== filters.dates.period) analytics.track("filter_applied", { surface: "session_journal", filter: "period", value: next.dates.period });
    if (next.venue !== filters.venue) analytics.track("filter_applied", { surface: "session_journal", filter: "venue", value: next.venue === null ? "all" : "one" });
    if (next.bankroll !== filters.bankroll) analytics.track("filter_applied", { surface: "session_journal", filter: "bankroll", value: next.bankroll === "all" ? "all" : "one" });
    setFilters(next);
  };

  /* -------------------------------------------------------------------- */
  /* Sheets and Back                                                       */
  /* -------------------------------------------------------------------- */

  const fromScenario = overlay?.kind === "log" && overlay.mode === "new" && Boolean(overlay.scenario);
  const sheetHistory = useSheetHistory(() => {
    if (guard.current && !guard.current()) return false;
    setOverlay(null);
    // Back has already returned to the link's own address.
    if (fromScenario) stripScenarioParam();
    return true;
  });
  const openSheet = (next: Overlay, hash?: string) => {
    if (SHEETS.has(next.kind)) sheetHistory.enter(hash);
    setOverlay(next);
  };
  const closeOverlay = () => {
    const wasSheet = overlay && SHEETS.has(overlay.kind);
    setOverlay(null);
    guard.current = null;
    if (wasSheet) sheetHistory.leave(fromScenario ? stripScenarioParam : undefined);
    else if (fromScenario) stripScenarioParam();
  };

  const openLog = (override?: { game: GameDraft; source: GameSource; location?: string; scenario?: { id: string; name: string } }) => {
    const remembered = rememberedGame(scoped.scopedSessions);
    const draft = newSessionDraft({ game: override?.game ?? remembered.game, source: override?.source ?? remembered.source, hours: remembered.hours, bankrollId: target });
    openSheet({ kind: "log", mode: "new", draft: { ...draft, location: override?.location ?? "" }, scenario: override?.scenario }, "#log");
  };
  const openCash = (note?: string) => openSheet({ kind: "cash", bankrollId: target, note });
  const selectTab = (next: Tab) => {
    setTab(next);
    const isDefault = desktop ? next === "sessions" || next === "overview" : next === "overview";
    history.replaceState(history.state, "", addressWith(isDefault ? "" : `#${next}`));
  };
  const showTab = (next: Tab) => {
    selectTab(next);
    requestAnimationFrame(() => document.getElementById("journal-records")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  // ?scenario=<id> from the Calculator opens the log form with that game, once the journal has loaded.
  const arrival = useScenarioArrival(data.ready);
  const openLogLatest = useRef(openLog);
  useEffect(() => { openLogLatest.current = openLog; });
  const arrivalHandled = useRef(false);
  useEffect(() => {
    if (!data.ready || arrivalHandled.current || arrival.status !== "loaded") return;
    arrivalHandled.current = true;
    const { scenario } = arrival;
    openLogLatest.current({ game: gameFromScenario(scenario.config, scenarioRamp(scenario.config)), source: { kind: "scenario", name: scenario.name, id: scenario.id }, scenario: { id: scenario.id, name: scenario.name } });
  }, [data.ready, arrival]);

  // #sessions, #cash, #venues, #data and #overview pick a tab, and #log opens the log form.
  // Anything else, such as the skip link's #main, is left alone.
  const readHash = useRef<() => void>(() => undefined);
  useEffect(() => {
    readHash.current = () => {
      const hash = location.hash.slice(1);
      if (hash === "log") {
        // A scenario link opens the form itself, with the scenario's game.
        if (overlay || new URLSearchParams(location.search).has("scenario")) return;
        history.replaceState(history.state, "", addressWith(""));
        openLogLatest.current();
        return;
      }
      const next = TAB_HASHES[hash];
      if (next) setTab(next);
    };
  });
  useEffect(() => {
    if (!data.ready) return;
    // Read once the journal is loaded, so #log starts from the remembered game.
    readHash.current();
    const onHash = () => readHash.current();
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, [data.ready]);

  // Enter opens the log form when the page itself has focus, for keyboard users who turned shortcuts on.
  useEffect(() => {
    if (!settings.shortcuts) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat || event.metaKey || event.ctrlKey || event.altKey || !data.ready || overlay || isTyping(event.target)) return;
      event.preventDefault();
      openLogLatest.current();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [settings.shortcuts, data.ready, overlay]);

  useEffect(() => {
    if (!focusRequest) return;
    const [attribute, id] = focusRequest.row ?? [];
    const row = attribute ? shownRows(attribute).find((element) => element.getAttribute(attribute) === id) : undefined;
    (row ?? document.querySelector<HTMLElement>(focusRequest.fallback) ?? document.getElementById("journal-panel"))?.focus();
    setFocusRequest(null);
  }, [focusRequest]);

  /* -------------------------------------------------------------------- */
  /* Saves and deletes                                                     */
  /* -------------------------------------------------------------------- */

  /** Confirms a save, and says so when the record lands outside what is on screen, with a way to show it. */
  const confirmSaved = (noun: string, record: { bankrollId: string; date: string; location?: string }, show: () => void, filtered: boolean) => {
    if (bankrollId !== "all" && record.bankrollId !== bankrollId) {
      setNotice({ message: `${noun} in “${scoped.bankrollNames.get(record.bankrollId) ?? "another bankroll"}”, which isn't the bankroll you're viewing.`, action: { label: "Show it", run: () => { setFilters((current) => ({ ...current, bankroll: record.bankrollId })); show(); } } });
    } else if (filtered) {
      setNotice({ message: `${noun}. It's outside ${scopePhrase}, so the filters hide it.`, action: { label: "Clear filters", run: () => { clearFilters(); show(); } } });
    }
    toast(`${noun}.`, "pos");
  };
  const onSessionSaved = ({ record, another }: SavedSession) => {
    const edit = overlay?.kind === "log" && overlay.mode === "edit";
    const show = () => { selectTab("sessions"); setFocusRequest({ row: ["data-session-row", record.id], fallback: `#${SESSION_SEARCH_ID}` }); };
    const hidden = filterByDate([record], filters.dates).length === 0 || (venue !== null && (record.location?.trim().toLocaleLowerCase() ?? "") !== venue);
    confirmSaved(edit ? "Session updated" : "Session logged", record, show, hidden);
    if (!another) {
      closeOverlay();
      if (edit) setFocusRequest({ row: ["data-session-row", record.id], fallback: "#journal-panel" });
    }
  };
  const onCashSaved = (record: BankrollTransaction, another: boolean) => {
    confirmSaved(record.type === "deposit" ? "Deposit recorded" : "Withdrawal recorded", record, () => { selectTab("cash"); setFocusRequest({ row: ["data-cash-row", record.id], fallback: `#${CASH_RECORD_ID}` }); }, false);
    if (!another) closeOverlay();
  };

  const deleteSession = (session: JournalSession) => {
    const neighbour = neighbourOf("data-session-row", session.id);
    journalLibrary.deleteSession(session.id);
    closeOverlay();
    toast("Session deleted.");
    setFocusRequest({ row: neighbour ? ["data-session-row", neighbour] : undefined, fallback: `#${SESSION_SEARCH_ID}` });
  };
  const deleteCash = (transaction: BankrollTransaction) => {
    const neighbour = neighbourOf("data-cash-row", transaction.id);
    journalLibrary.deleteTransaction(transaction.id);
    setOverlay(null);
    toast(transaction.type === "deposit" ? "Deposit deleted." : "Withdrawal deleted.");
    setFocusRequest({ row: neighbour ? ["data-cash-row", neighbour] : undefined, fallback: `#${CASH_RECORD_ID}` });
  };
  const deleteVenue = (preset: VenuePreset) => {
    const neighbour = neighbourOf("data-venue-row", preset.id);
    venuePresetLibrary.deletePreset(preset.id);
    setOverlay(null);
    toast(`Venue “${preset.name}” deleted.`);
    setFocusRequest({ row: neighbour ? ["data-venue-row", neighbour] : undefined, fallback: "#journal-panel" });
  };
  const deleteEverything = () => {
    const removed = batch(() => deleteAllJournalRecords());
    setFilters({ bankroll: "all", dates: ALL_TIME, venue: null });
    return removed;
  };

  const detailsSession = overlay?.kind === "details" ? data.sessions.find((session) => session.id === overlay.sessionId) : undefined;
  const detailsOutcome = detailsSession && (scoped.outcomes.get(detailsSession.id) ?? theoreticalSessionOutcome(detailsSession));
  // A session deleted by a sync or another tab while its details are open leaves nothing to show; close properly.
  const detailsGone = overlay?.kind === "details" && data.ready && !detailsSession;
  const closeOverlayLatest = useRef(closeOverlay);
  useEffect(() => { closeOverlayLatest.current = closeOverlay; });
  useEffect(() => {
    if (!detailsGone) return;
    closeOverlayLatest.current();
    toast("This session was deleted elsewhere, so its details closed.");
    setFocusRequest({ fallback: "#journal-panel" });
  }, [detailsGone]);
  const openDetails = (id: string) => {
    openSheet({ kind: "details", sessionId: id });
    track("result_expanded", { feature: "session_journal", section: "session_details" });
  };
  const openEdit = (id: string) => {
    const session = data.sessions.find((item) => item.id === id);
    if (session) openSheet({ kind: "log", mode: "edit", sessionId: id, draft: draftFromSession(session) });
  };
  const logAtVenue = (preset: VenuePreset) => openLog({ game: applyVenue(rememberedGame(scoped.scopedSessions).game, preset), source: { kind: "venue", name: preset.name }, location: preset.name });

  /* -------------------------------------------------------------------- */
  /* Page                                                                  */
  /* -------------------------------------------------------------------- */

  const syncingFirstPull = data.ready && Boolean(user) && syncStatus === "syncing" && !hasAnyData;
  const emptyJournal = data.ready && !syncingFirstPull && !hasAnyData;
  const emptyScope = data.ready && !emptyJournal && scoped.scopedSessions.length === 0 && scoped.scopedTransactions.length === 0;

  const notices: ReactNode[] = [
    notice && (
      <Callout key="saved" tone="info" action={<div className="flex flex-wrap gap-2">{notice.action && <Button size="sm" variant="secondary" className="h-11" onClick={() => { notice.action?.run(); setNotice(null); }}>{notice.action.label}</Button>}<Button size="sm" variant="ghost" className="h-11" onClick={() => setNotice(null)}>Dismiss</Button></div>}>
        <span role="status">{notice.message}</span>
      </Callout>
    ),
    data.pruned !== null && (
      <Callout key="pruned" tone="warn" title="Storage limit reached" action={<div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" className="h-11" onClick={() => showTab("data")}>Go to Data</Button><Button size="sm" variant="ghost" className="h-11" onClick={() => dismiss("pruned")}>Dismiss</Button></div>}>
        The {data.pruned} oldest record{data.pruned === 1 ? " was" : "s were"} removed to make room. Export a JSON backup to keep your full history.
      </Callout>
    ),
    data.merged > 0 && (
      <Callout key="merged" tone="info" action={<Button size="sm" variant="ghost" className="h-11" onClick={() => dismiss("merged")}>Dismiss</Button>}>Merged {data.merged} duplicate bankroll{data.merged === 1 ? "" : "s"} with the same name.</Callout>
    ),
    !arrivalDismissed && arrival.status === "missing" && (
      <Callout key="missing" tone="info" action={<Button size="sm" variant="ghost" className="h-11" onClick={() => { setArrivalDismissed(true); stripScenarioParam(); }}>Dismiss</Button>}>
        <span role="status">The linked scenario isn&apos;t saved on this account and device. Choose a saved game under Change game when you log a session.</span>
      </Callout>
    ),
    !arrivalDismissed && arrival.status === "unsupported" && (
      <Callout key="unsupported" tone="warn" title={`“${arrival.scenario.name}” can't be logged here`}
        action={<div className="flex flex-wrap gap-2">
          <Link href={calculatorHref(arrival.scenario.id)} className="inline-flex h-11 items-center rounded-lg border border-line bg-surface-2 px-3 text-sm font-semibold hover:bg-surface-3">Open in Calculator</Link>
          <Button size="sm" variant="ghost" className="h-11" onClick={() => { setArrivalDismissed(true); stripScenarioParam(); openLog(); }}>Log a session anyway</Button>
        </div>}>
        <span role="status">{arrival.reason}</span>
      </Callout>
    ),
  ].filter(Boolean);

  const overview = !data.ready || syncingFirstPull ? (
    <OverviewSkeleton message={syncingFirstPull ? "Loading your journal from your account…" : undefined} />
  ) : emptyJournal ? (
    <JournalEmpty onLog={() => openLog()} onStartingBankroll={() => openCash(STARTING_NOTE)} onImport={() => showTab("data")} />
  ) : (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
      {emptyScope && (
        <Callout className="lg:col-span-2" tone="info" title={`Nothing in “${scopeName}” yet`} action={<Button size="sm" variant="secondary" className="h-11" icon={<ArrowLeftRight size={16} aria-hidden />} onClick={() => openCash(STARTING_NOTE)}>Record its starting amount</Button>}>
          Log a session to it, or record the money you set aside for it.
        </Callout>
      )}
      <ResultsCard scopeLabel={`${periodTitle}${venueName ? ` · ${venueName}` : ""} · ${scopeName}`} aggregate={scoped.aggregate} lifetime={scoped.lifetime} points={scoped.cumulative} filtered={narrowed} onClearFilters={clearFilters} onLog={() => openLog()} />
      <BankrollHealthCard
        scopeName={scopeName}
        bankroll={scoped.bankroll}
        results={scoped.bankroll - scoped.cash.net}
        cash={scoped.cash}
        sessionCount={scoped.scopedSessions.length}
        health={scoped.health}
        onCash={() => openCash()}
        onStartingBankroll={() => openCash(STARTING_NOTE)}
      />
    </div>
  );

  const records: Record<Exclude<Tab, "overview">, ReactNode> = {
    sessions: (
      <SessionsTab sessions={scoped.inRange} lifetimeCount={scoped.scopedSessions.length} outcomes={scoped.outcomes} bankrollNames={scoped.bankrollNames}
        showBankroll={bankrollId === "all" && multiple} scopePhrase={scopePhrase} filtered={narrowed} onClearFilters={clearFilters} onOpen={openDetails} />
    ),
    cash: (
      <CashTab transactions={scoped.scopedTransactions} totals={scoped.cash} bankrollNames={scoped.bankrollNames} showBankroll={bankrollId === "all" && multiple}
        onRecord={() => openCash()} onDelete={(transaction) => setOverlay({ kind: "deleteCash", transaction })} />
    ),
    venues: (
      <VenuesTab venues={scoped.byVenue} heat={heatByCasino(data.sessions)} presets={data.presets} scopePhrase={dateFilterPhrase(filters.dates)} onAdd={() => openSheet({ kind: "venue" })} onUse={logAtVenue}
        onDelete={(preset) => setOverlay({ kind: "deleteVenue", preset })} />
    ),
    data: (
      <DataTab signedIn={Boolean(user)} sessions={data.sessions} transactions={data.transactions} extraBankrolls={Math.max(0, data.bankrolls.length - 1)} onDeleteAll={deleteEverything} />
    ),
  };

  const recordsTab: Exclude<Tab, "overview"> = tab === "overview" ? "sessions" : tab;
  const count = (value: number) => (value > 0 ? ` (${value})` : "");
  const tabs: { value: Tab; label: string }[] = [
    ...(desktop ? [] : [{ value: "overview" as const, label: "Overview" }]),
    { value: "sessions", label: `Sessions${count(scoped.inRange.length)}` },
    { value: "cash", label: `Cash${count(scoped.scopedTransactions.length)}` },
    { value: "venues", label: `Venues${count(data.presets.length)}` },
    { value: "data", label: "Data" },
  ];
  const activeTab: Tab = desktop ? recordsTab : tab;
  const dockHidden = emptyJournal && activeTab === "overview";

  return (
    <>
      <PageHeader
        title="Journal"
        sub="Log casino sessions and bankroll moves, then compare your results with what the game should pay."
        actions={data.ready && !emptyJournal ? (
          <div className="hidden items-center gap-2 lg:flex">
            <Button variant="secondary" icon={<ArrowLeftRight size={17} aria-hidden />} onClick={() => openCash()}>Deposit or withdrawal</Button>
            <Button icon={<Plus size={18} aria-hidden />} aria-keyshortcuts={settings.shortcuts ? "Enter" : undefined} onClick={() => openLog()}>Log session</Button>
          </div>
        ) : undefined}
        className="mb-2 sm:mb-3"
      />
      <SyncStatus className="mb-4" />

      {notices.length > 0 && <div className="mb-4 grid grid-cols-1 gap-3">{notices}</div>}

      {data.ready && hasAnyData && (
        <Filters className="mb-5" filters={effective} onChange={changeFilters} venues={scoped.venues} bankrolls={data.bankrolls} onManageBankrolls={() => openSheet({ kind: "bankrolls" })} />
      )}

      {desktop && <div className="mb-10">{overview}</div>}

      <section id="journal-records" aria-label="Journal" className="scroll-mt-20">
        {data.ready && (
          <Tabs<Tab> label="Journal" value={activeTab} tabs={tabs} onChange={(next) => { selectTab(next); analytics.track("tab_changed", { surface: "session_journal", tab: next }); }} />
        )}
        <div id="journal-panel" role="tabpanel" tabIndex={-1} aria-labelledby={`tab-Journal-${activeTab}`} className="mt-5 rounded-lg outline-none">
          {!desktop && activeTab === "overview" ? overview : !data.ready ? (!desktop ? overview : null) : records[activeTab === "overview" ? "sessions" : activeTab]}
        </div>
      </section>

      {/* Phones: Log session waits above the tab bar, where the thumb already is. */}
      {data.ready && !dockHidden && (
        <>
          <div aria-hidden className="h-20 lg:hidden" />
          <BottomDock>
            <div role="group" aria-label="Journal actions" className="mx-auto flex max-w-xl gap-2">
              <Button block icon={<Plus size={18} aria-hidden />} onClick={() => openLog()}>Log session</Button>
              <Button variant="secondary" className="shrink-0" aria-label="Cash: deposit or withdrawal" icon={<ArrowLeftRight size={18} aria-hidden />} onClick={() => openCash()}>Cash</Button>
            </div>
          </BottomDock>
        </>
      )}

      {overlay?.kind === "log" && (
        <LogSessionSheet
          key={overlay.mode === "edit" ? overlay.sessionId : "new"}
          mode={overlay.mode}
          sessionId={overlay.mode === "edit" ? overlay.sessionId : undefined}
          initial={overlay.draft}
          sessions={data.sessions}
          bankrolls={data.bankrolls}
          presets={data.presets}
          scenarios={data.scenarios}
          setups={data.setups}
          scenarioLoaded={overlay.mode === "new" ? overlay.scenario : undefined}
          onSaved={onSessionSaved}
          onClose={closeOverlay}
          registerGuard={registerGuard}
        />
      )}
      {overlay?.kind === "details" && detailsSession && detailsOutcome && (
        <>
          <SessionDetailsSheet
            key={detailsSession.id}
            session={detailsSession}
            outcome={detailsOutcome}
            bankrollName={multiple ? scoped.bankrollNames.get(detailsSession.bankrollId) : undefined}
            onEdit={() => openEdit(detailsSession.id)}
            onDelete={() => setOverlay({ kind: "details", sessionId: detailsSession.id, layer: "delete" })}
            onShare={() => setOverlay({ kind: "details", sessionId: detailsSession.id, layer: "share" })}
            onClose={closeOverlay}
          />
          {overlay.layer === "share" && (
            <ShareSheet session={detailsSession} outcome={detailsOutcome} bankrollName={multiple ? scoped.bankrollNames.get(detailsSession.bankrollId) : undefined}
              onClose={() => setOverlay((current) => current?.kind === "details" ? { kind: "details", sessionId: current.sessionId } : current)} />
          )}
          <ConfirmSheet
            open={overlay.layer === "delete"}
            title="Delete this session?"
            confirmLabel="Delete session"
            onClose={() => setOverlay((current) => current?.kind === "details" && current.layer === "delete" ? { kind: "details", sessionId: current.sessionId } : current)}
            onConfirm={() => deleteSession(detailsSession)}
          >
            This permanently deletes the session from {longDate(detailsSession.date)}{detailsSession.location?.trim() ? ` at ${detailsSession.location.trim()}` : ""}{user ? ", on every device signed in to your account" : ""}.
          </ConfirmSheet>
        </>
      )}
      {overlay?.kind === "cash" && (
        <CashMovementSheet bankrolls={data.bankrolls} bankrollId={overlay.bankrollId} balances={scoped.balances} note={overlay.note} onSaved={onCashSaved} onClose={closeOverlay} registerGuard={registerGuard} />
      )}
      {overlay?.kind === "bankrolls" && (
        <BankrollsSheet
          bankrolls={data.bankrolls}
          sessions={data.sessions}
          transactions={data.transactions}
          balances={scoped.balances}
          selected={bankrollId}
          onSelect={(id) => changeFilters({ ...effective, bankroll: id })}
          onCreated={(created) => setFilters((current) => ({ ...current, bankroll: created.id }))}
          onDeleted={(id) => setFilters((current) => current.bankroll === id ? { ...current, bankroll: "all" } : current)}
          onClose={closeOverlay}
        />
      )}
      {overlay?.kind === "venue" && (
        <VenueSheet base={rememberedGame(scoped.scopedSessions).game} presets={data.presets} registerGuard={registerGuard} onClose={closeOverlay}
          onSaved={(preset) => { closeOverlay(); setFocusRequest({ row: ["data-venue-row", preset.id], fallback: "#journal-panel" }); }} />
      )}
      <ConfirmSheet
        open={overlay?.kind === "deleteCash"}
        title={overlay?.kind === "deleteCash" ? `Delete this ${overlay.transaction.type}?` : ""}
        confirmLabel="Delete"
        onClose={() => setOverlay((current) => current?.kind === "deleteCash" ? null : current)}
        onConfirm={() => overlay?.kind === "deleteCash" && deleteCash(overlay.transaction)}
      >
        {overlay?.kind === "deleteCash" ? `This permanently deletes the ${cashLabel(overlay.transaction)}. The bankroll changes by the same amount.` : null}
      </ConfirmSheet>
      <ConfirmSheet
        open={overlay?.kind === "deleteVenue"}
        title="Delete this saved venue?"
        confirmLabel="Delete"
        onClose={() => setOverlay((current) => current?.kind === "deleteVenue" ? null : current)}
        onConfirm={() => overlay?.kind === "deleteVenue" && deleteVenue(overlay.preset)}
      >
        {overlay?.kind === "deleteVenue" ? `“${overlay.preset.name}” will no longer be offered here or in the Calculator. Past sessions don't change.` : null}
      </ConfirmSheet>
    </>
  );
}
