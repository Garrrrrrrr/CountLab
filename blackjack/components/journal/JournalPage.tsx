"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { analytics } from "@/lib/analytics";
import { journalLibrary, sessionsInRange, type BankrollTransaction, type JournalSession } from "@/lib/blackjack/journal";
import { theoreticalSessionOutcome } from "@/lib/blackjack/journalAnalysis";
import { applyVenue, draftFromSession, gameFromScenario, newSessionDraft, rememberedGame, type GameDraft, type GameSource, type SessionDraft } from "@/lib/blackjack/journalForm";
import { longDate, money } from "@/lib/blackjack/journalFormat";
import { neighbourId, periodPhrase, targetBankrollId, type Period } from "@/lib/blackjack/journalView";
import { venuePresetLibrary, type VenuePreset } from "@/lib/blackjack/venuePresets";
import { storage } from "@/lib/statistics/storage";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { useHydrated, useMediaQuery } from "@/lib/useMediaQuery";
import { ConfirmModal } from "../ConfirmModal";
import { scenarioHref, scenarioRamp, unsupportedScenario, useScenarioFromUrl } from "../ScenarioPicker";
import { ShareCard } from "../ShareCard";
import { Button, Callout, GhostButton, KeyHint, MobileActionDock, PageHeader, Select, Tabs, toast } from "../ui";
import { BankrollHealthCard } from "./BankrollHealthCard";
import { BankrollsSheet } from "./BankrollsSheet";
import { CASH_RECORD_ID, CashTab, cashLabel } from "./CashTab";
import { CashMovementSheet } from "./CashMovementSheet";
import { DataTab } from "./DataTab";
import { LogSessionSheet, type SavedSession } from "./LogSessionSheet";
import { GetStarted, OverviewSkeleton } from "./Overview";
import { ResultsCard } from "./ResultsCard";
import { SessionDetailsSheet } from "./SessionDetailsSheet";
import { SESSION_SEARCH_ID, SessionsTab } from "./SessionsTab";
import { SyncBadge } from "./SyncBadge";
import { useJournalData } from "./useJournalData";
import { useJournalScope } from "./useJournalScope";
import { addressWith, useSheetHistory } from "./useSheetHistory";
import { VenuesTab } from "./VenuesTab";

type Tab = "sessions" | "venues" | "cash" | "data";
const TAB_HASHES: Record<string, Tab> = { "": "sessions", sessions: "sessions", venues: "venues", cash: "cash", data: "data" };

type Overlay =
  | { kind: "log"; mode: "new"; draft: SessionDraft; scenario?: { id: string; name: string } }
  | { kind: "log"; mode: "edit"; sessionId: string; draft: SessionDraft }
  | { kind: "details"; sessionId: string; confirm?: "share" | "delete" }
  | { kind: "cash"; bankrollId: string; note?: string }
  | { kind: "bankrolls" }
  | { kind: "deleteCash"; transaction: BankrollTransaction }
  | { kind: "deleteVenue"; preset: VenuePreset };
const SHEETS = new Set<Overlay["kind"]>(["log", "details", "cash", "bankrolls"]);

type RowAttribute = "data-session-row" | "data-cash-row" | "data-venue-row";
const shownRows = (attribute: RowAttribute) => Array.from(document.querySelectorAll<HTMLElement>(`[${attribute}]`)).filter((element) => element.getClientRects().length > 0);
/** The row on screen after (or else before) the one being removed, for focus to land on. */
const neighbourOf = (attribute: RowAttribute, id: string) => neighbourId(shownRows(attribute).map((element) => element.getAttribute(attribute) ?? ""), id);
type FocusRequest = { row?: [RowAttribute, string]; fallback: string };

/**
 * The Session Journal: bankroll health and results against expectation up
 * front, records in tabs, and every form in its own sheet.
 */
export function SessionJournal() {
  const { user, syncStatus } = useAuth();
  const { data, dismiss } = useJournalData();
  const [selectedBankroll, setSelectedBankroll] = useState<string | "all">("all");
  const [period, setPeriod] = useState<Period>("all");
  const [tab, setTab] = useState<Tab>("sessions");
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [arrivalDismissed, setArrivalDismissed] = useState(false);
  const desktop = useMediaQuery("(min-width: 1024px)", false);
  const hydrated = useHydrated();
  const tabsRef = useRef<HTMLDivElement>(null);
  const guard = useRef<(() => boolean) | null>(null);
  const registerGuard = useCallback((next: (() => boolean) | null) => { guard.current = next; }, []);

  // A bankroll deleted elsewhere (another tab, a sync) falls back to All.
  const bankrollId = selectedBankroll !== "all" && !data.bankrolls.some((bankroll) => bankroll.id === selectedBankroll) ? "all" : selectedBankroll;
  const scope = useJournalScope(data, bankrollId, period);
  const multiple = data.bankrolls.length > 1;
  const scopeName = bankrollId === "all" ? (multiple ? "All bankrolls" : data.bankrolls[0]?.name ?? "Main") : scope.bankrollNames.get(bankrollId) ?? "Bankroll";
  const target = targetBankrollId(bankrollId, scope.defaultBankrollId);
  const hasAnyData = data.sessions.length > 0 || data.transactions.length > 0;

  /** Drops `?scenario=` once its form is saved or dismissed, so a reload doesn't open it again. */
  const stripScenario = () => {
    const params = new URLSearchParams(location.search);
    if (!params.has("scenario")) return;
    params.delete("scenario");
    const search = params.toString();
    window.history.replaceState(null, "", `${location.pathname}${search ? `?${search}` : ""}${location.hash}`);
  };
  const fromScenario = overlay?.kind === "log" && overlay.mode === "new" && Boolean(overlay.scenario);
  const sheetHistory = useSheetHistory(() => {
    if (guard.current && !guard.current()) return false;
    setOverlay(null);
    // Back has already returned to the link's own address.
    if (fromScenario) stripScenario();
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
    if (wasSheet) sheetHistory.leave(fromScenario ? stripScenario : undefined);
  };

  const openLog = (override?: { game: GameDraft; source: GameSource; location?: string; scenario?: { id: string; name: string } }) => {
    const remembered = rememberedGame(scope.scopedSessions);
    const draft = newSessionDraft({ game: override?.game ?? remembered.game, source: override?.source ?? remembered.source, hours: remembered.hours, bankrollId: target });
    openSheet({ kind: "log", mode: "new", draft: { ...draft, location: override?.location ?? "" }, scenario: override?.scenario }, "#log");
  };
  const openCash = (note?: string) => openSheet({ kind: "cash", bankrollId: target, note });
  const selectTab = (next: Tab, scroll = false) => {
    setTab(next);
    window.history.replaceState(null, "", addressWith(next === "sessions" ? "" : `#${next}`));
    if (scroll) requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  // ?scenario=<id> from the Lab, Simulator, Compare or Trip Planner: open the log form with that game.
  const arrival = useScenarioFromUrl(noop, unsupportedScenario);
  const openLogLatest = useRef(openLog);
  openLogLatest.current = openLog;
  const arrivalHandled = useRef(false);
  useEffect(() => {
    if (!data.ready || arrivalHandled.current || arrival.status !== "loaded") return;
    arrivalHandled.current = true;
    const { scenario } = arrival;
    openLogLatest.current({ game: gameFromScenario(scenario.config, scenarioRamp(scenario.config)), source: { kind: "scenario", name: scenario.name, id: scenario.id }, scenario: { id: scenario.id, name: scenario.name } });
  }, [data.ready, arrival]);

  // #venues, #cash and #data pick a records tab and #log opens the log form.
  // Anything else, such as the skip link's #main-content, is left alone.
  const readHash = useRef<(initial: boolean) => void>(() => undefined);
  readHash.current = (initial: boolean) => {
    const hash = location.hash.slice(1);
    if (hash === "log") {
      // A scenario link opens the form itself, with the scenario's game.
      if (overlay || new URLSearchParams(location.search).has("scenario")) return;
      window.history.replaceState(null, "", addressWith(""));
      openLog();
      return;
    }
    const next = TAB_HASHES[hash];
    if (!next) return;
    setTab(next);
    if (initial && hash) requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ block: "start" }));
  };
  useEffect(() => {
    if (!data.ready) return;
    // Read once the journal is loaded, so #log starts from the remembered game.
    readHash.current(true);
    const onHash = () => readHash.current(false);
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, [data.ready]);

  useEffect(() => {
    if (!focusRequest) return;
    const [attribute, id] = focusRequest.row ?? [];
    const row = attribute ? shownRows(attribute).find((element) => element.getAttribute(attribute) === id) : undefined;
    (row ?? document.querySelector<HTMLElement>(focusRequest.fallback) ?? document.getElementById("journal-records-panel"))?.focus();
    setFocusRequest(null);
  }, [focusRequest]);

  /** Confirms a save, and says so when the record lands outside what is on screen, with a way to show it. */
  const confirmSaved = (noun: string, record: { bankrollId: string; date: string }, show: () => void, inPeriod: boolean) => {
    if (bankrollId !== "all" && record.bankrollId !== bankrollId) {
      toast({ message: `${noun} in “${scope.bankrollNames.get(record.bankrollId) ?? "another bankroll"}”, which isn't the bankroll you're viewing.`, action: { label: "Show", onClick: () => { setSelectedBankroll(record.bankrollId); show(); } } });
    } else if (!inPeriod) {
      toast({ message: `${noun}. It's outside ${periodPhrase(period)}, so it isn't shown.`, action: { label: "Show all time", onClick: () => { setPeriod("all"); show(); } } });
    } else toast({ message: `${noun}.` });
  };
  const onSessionSaved = ({ record, another }: SavedSession) => {
    const edit = overlay?.kind === "log" && overlay.mode === "edit";
    const show = () => { selectTab("sessions"); setFocusRequest({ row: ["data-session-row", record.id], fallback: `#${SESSION_SEARCH_ID}` }); };
    confirmSaved(edit ? "Session updated" : "Session logged", record, show, sessionsInRange([record], period).length > 0);
    if (!another) closeOverlay();
  };
  const onCashSaved = (record: BankrollTransaction, another: boolean) => {
    const noun = record.type === "deposit" ? "Deposit recorded" : "Withdrawal recorded";
    confirmSaved(noun, record, () => { selectTab("cash"); setFocusRequest({ row: ["data-cash-row", record.id], fallback: `#${CASH_RECORD_ID}` }); }, true);
    if (!another) closeOverlay();
  };

  const deleteSession = (session: JournalSession) => {
    const neighbour = neighbourOf("data-session-row", session.id);
    journalLibrary.deleteSession(session.id);
    closeOverlay();
    toast({ message: "Session deleted." });
    setFocusRequest({ row: neighbour ? ["data-session-row", neighbour] : undefined, fallback: `#${SESSION_SEARCH_ID}` });
  };
  const deleteCash = (transaction: BankrollTransaction) => {
    const neighbour = neighbourOf("data-cash-row", transaction.id);
    journalLibrary.deleteTransaction(transaction.id);
    setOverlay(null);
    toast({ message: transaction.type === "deposit" ? "Deposit deleted." : "Withdrawal deleted." });
    setFocusRequest({ row: neighbour ? ["data-cash-row", neighbour] : undefined, fallback: `#${CASH_RECORD_ID}` });
  };
  const deleteVenue = (preset: VenuePreset) => {
    const neighbour = neighbourOf("data-venue-row", preset.id);
    venuePresetLibrary.deletePreset(preset.id);
    setOverlay(null);
    toast({ message: `Venue “${preset.name}” deleted.` });
    setFocusRequest({ row: neighbour ? ["data-venue-row", neighbour] : undefined, fallback: "#journal-records-panel" });
  };

  const detailsSession = overlay?.kind === "details" ? data.sessions.find((session) => session.id === overlay.sessionId) : undefined;
  const detailsOutcome = detailsSession && (scope.outcomes.get(detailsSession.id) ?? theoreticalSessionOutcome(detailsSession));
  // A session deleted by a sync or another tool while its details are open
  // leaves nothing to show; close properly, so the Back entry and the phone dock recover.
  const detailsGone = overlay?.kind === "details" && !detailsSession;
  const closeOverlayLatest = useRef(closeOverlay);
  closeOverlayLatest.current = closeOverlay;
  useEffect(() => {
    if (!detailsGone) return;
    closeOverlayLatest.current();
    toast({ message: "This session was deleted elsewhere, so its details closed." });
    setFocusRequest({ fallback: "#journal-records-panel" });
  }, [detailsGone]);
  const openDetails = (id: string) => {
    openSheet({ kind: "details", sessionId: id });
    // Session notes and actions used to expand in place; opening them is still a result being expanded.
    analytics.track("result_expanded", { feature: "session_journal", section: "session_details" });
  };
  const openEdit = (id: string) => {
    const session = data.sessions.find((item) => item.id === id);
    if (session) openSheet({ kind: "log", mode: "edit", sessionId: id, draft: draftFromSession(session) });
  };
  const shortcutsOn = hydrated && storage.settings().shortcuts;

  const actions = desktop ? (
    <>
      <GhostButton onClick={() => openCash()} disabled={!data.ready}><i className="fa-solid fa-money-bill-transfer mr-2 text-xs" aria-hidden="true" />Deposit / withdrawal</GhostButton>
      <Button onClick={() => openLog()} disabled={!data.ready} aria-keyshortcuts={shortcutsOn ? "Enter" : undefined}>
        <i className="fa-solid fa-plus mr-2 text-xs" aria-hidden="true" />Log session
        {shortcutsOn && <KeyHint className="!ml-2 border-current bg-transparent text-current opacity-70"><span aria-hidden="true">Enter</span></KeyHint>}
      </Button>
    </>
  ) : undefined;

  const notices = [
    data.pruned !== null && (
      <Callout key="pruned" tone="warn" title="Storage limit reached" onDismiss={() => dismiss("pruned")} action={<GhostButton size="compact" onClick={() => selectTab("data", true)}>Go to Import &amp; export</GhostButton>}>
        The {data.pruned} oldest record{data.pruned === 1 ? " was" : "s were"} removed to make room. Export a JSON backup to keep your full history.
      </Callout>
    ),
    data.merged > 0 && <Callout key="merged" tone="info" onDismiss={() => dismiss("merged")}>Merged {data.merged} duplicate bankroll{data.merged === 1 ? "" : "s"}.</Callout>,
    !arrivalDismissed && arrival.status === "missing" && (
      <Callout key="missing" tone="info" live onDismiss={() => { setArrivalDismissed(true); stripScenario(); }}>
        The linked scenario isn&apos;t saved on this account and device. Choose a saved game from Start from when you log a session.
      </Callout>
    ),
    !arrivalDismissed && arrival.status === "unsupported" && (
      <Callout
        key="unsupported"
        tone="warn"
        live
        title={`“${arrival.scenario.name}” can't be logged here`}
        onDismiss={() => { setArrivalDismissed(true); stripScenario(); }}
        action={<>
          <Link href={scenarioHref("/cvcx", arrival.scenario.id)} className="inline-flex min-h-11 items-center rounded-lg border border-[var(--rule)] bg-[var(--paper-raised)] px-3 text-sm font-medium [@media(pointer:fine)]:min-h-9">Open in Lab</Link>
          <GhostButton size="compact" onClick={() => { setArrivalDismissed(true); stripScenario(); openLog(); }}>Log a session anyway</GhostButton>
        </>}
      >
        {arrival.reason}
      </Callout>
    ),
  ].filter(Boolean);

  const syncingFirstPull = data.ready && user && syncStatus === "syncing" && !hasAnyData;
  const emptyScope = data.ready && scope.scopedSessions.length === 0 && scope.scopedTransactions.length === 0;

  let overview;
  if (!data.ready || syncingFirstPull) overview = <OverviewSkeleton message={syncingFirstPull ? "Loading your journal from your account…" : undefined} />;
  else if (emptyScope) overview = <GetStarted bankrollName={bankrollId !== "all" && hasAnyData ? scopeName : undefined} onCash={() => openCash("Starting bankroll")} onLog={() => openLog()} onImport={hasAnyData ? undefined : () => selectTab("data", true)} />;
  else overview = (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:items-start">
      <BankrollHealthCard
        scopeName={scopeName}
        bankroll={scope.bankroll}
        results={scope.bankroll - scope.cash.net}
        cash={scope.cash}
        sessionCount={scope.scopedSessions.length}
        health={scope.health}
        onCash={() => openCash()}
        onStartingBankroll={() => openCash("Starting bankroll")}
      />
      <ResultsCard
        period={period}
        onPeriod={(next) => { setPeriod(next); analytics.track("filter_applied", { surface: "session_journal", filter: "period", value: String(next) }); }}
        aggregate={scope.aggregate}
        lifetime={scope.lifetime}
        points={scope.cumulative}
        onLog={() => openLog()}
      />
    </div>
  );

  const namedVenues = scope.venues.filter((venue) => venue.location).length;
  const tabs: { value: Tab; label: string }[] = [
    { value: "sessions", label: `Sessions (${scope.inRange.length})` },
    { value: "venues", label: `Venues (${namedVenues})` },
    { value: "cash", label: `Cash movements (${scope.scopedTransactions.length})` },
    { value: "data", label: "Import & export" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Track results"
        title="Session Journal"
        description={<span className="block max-w-xl">Log real casino sessions, track your bankroll, and see whether your results are skill or normal swings.</span>}
        actions={actions}
      >
        <SyncBadge className="mt-3" />
      </PageHeader>

      {notices.length > 0 && <div className="mb-4 grid gap-3">{notices}</div>}

      {data.ready && (multiple || hasAnyData) && (
        <div className="mb-4 flex flex-wrap items-end gap-2">
          {multiple ? (
            <>
              <div className="min-w-0 flex-1 sm:w-80 sm:flex-none">
                <Select label="Bankroll" data-analytics-field="selected_bankroll" value={bankrollId} onChange={(event) => setSelectedBankroll(event.target.value)}>
                  <option value="all">All bankrolls — {money(data.bankrolls.reduce((sum, bankroll) => sum + (scope.balances.get(bankroll.id) ?? 0), 0))}</option>
                  {data.bankrolls.map((bankroll) => <option key={bankroll.id} value={bankroll.id}>{bankroll.name} — {money(scope.balances.get(bankroll.id) ?? 0)}</option>)}
                </Select>
              </div>
              <GhostButton aria-label="Manage bankrolls" className="px-3 sm:px-4" onClick={() => openSheet({ kind: "bankrolls" })}>
                <i className="fa-solid fa-wallet text-xs sm:mr-2" aria-hidden="true" /><span className="sr-only sm:not-sr-only">Manage</span>
              </GhostButton>
            </>
          ) : (
            <>
              <p className="flex min-h-11 items-center text-sm text-[var(--ink-muted)]">Bankroll: <b className="ml-1 font-semibold text-[var(--ink)]">{scopeName}</b></p>
              <GhostButton size="compact" onClick={() => openSheet({ kind: "bankrolls" })}><i className="fa-solid fa-wallet mr-2 text-xs" aria-hidden="true" />Manage bankrolls</GhostButton>
            </>
          )}
        </div>
      )}

      {overview}

      <section aria-labelledby="journal-records-title" className="mt-10">
        <h2 id="journal-records-title" className="sr-only">Journal records</h2>
        <div ref={tabsRef} className="scroll-mt-24">
          <Tabs<Tab> label="Journal records" panelId="journal-records-panel" value={tab} items={tabs} onChange={(next) => { selectTab(next); analytics.track("tab_changed", { surface: "session_journal", tab: next }); }} />
        </div>
        <div id="journal-records-panel" role="tabpanel" tabIndex={0} className="mt-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--paper)]">
          {!data.ready ? null : tab === "sessions" ? (
            <SessionsTab
              sessions={scope.inRange}
              lifetimeCount={scope.scopedSessions.length}
              outcomes={scope.outcomes}
              bankrollNames={scope.bankrollNames}
              showBankroll={bankrollId === "all" && multiple}
              period={period}
              onShowAllTime={() => setPeriod("all")}
              onOpen={openDetails}
              onEdit={openEdit}
            />
          ) : tab === "venues" ? (
            <VenuesTab
              venues={scope.venues}
              presets={data.presets}
              period={period}
              onShowAllTime={() => setPeriod("all")}
              onUse={(preset) => openLog({ game: applyVenue(rememberedGame(scope.scopedSessions).game, preset), source: { kind: "venue", name: preset.name }, location: preset.name })}
              onDelete={(preset) => setOverlay({ kind: "deleteVenue", preset })}
            />
          ) : tab === "cash" ? (
            <CashTab
              transactions={scope.scopedTransactions}
              totals={scope.cash}
              bankrollNames={scope.bankrollNames}
              showBankroll={bankrollId === "all" && multiple}
              onRecord={() => openCash()}
              onDelete={(transaction) => setOverlay({ kind: "deleteCash", transaction })}
            />
          ) : (
            <DataTab signedIn={Boolean(user)} sessions={data.sessions} transactions={data.transactions} />
          )}
        </div>
      </section>

      <p className="mt-10 max-w-3xl text-xs leading-5 text-[var(--ink-muted)]">Expected results and swings come from CountLab&apos;s audited true-count simulation for the rules, spread and play you entered — the same engine as the Game &amp; Bankroll Lab. They are never fitted to your results.</p>

      {/* Hidden rather than removed while a sheet is open, so closing the sheet returns focus to the button that opened it. */}
      <div hidden={overlay !== null}>
        <MobileActionDock label="Session journal actions">
          <div className="flex gap-2">
            <Button className="flex-1 whitespace-nowrap" disabled={!data.ready} onClick={() => openLog()}><i className="fa-solid fa-plus mr-2 text-xs" aria-hidden="true" />Log session</Button>
            <GhostButton aria-label="Deposit or withdrawal" title="Deposit or withdrawal" disabled={!data.ready} className="w-11 shrink-0 px-0" onClick={() => openCash()}><i className="fa-solid fa-money-bill-transfer" aria-hidden="true" /></GhostButton>
          </div>
        </MobileActionDock>
      </div>

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
      {overlay?.kind === "details" && detailsSession && (
        <SessionDetailsSheet
          key={detailsSession.id}
          session={detailsSession}
          outcome={detailsOutcome!}
          bankrollName={multiple ? scope.bankrollNames.get(detailsSession.bankrollId) : undefined}
          onEdit={() => openEdit(detailsSession.id)}
          onShare={() => { setOverlay({ ...overlay, confirm: "share" }); analytics.track("result_shared", { feature: "session_journal", method: "image" }); }}
          onDelete={() => setOverlay({ ...overlay, confirm: "delete" })}
          onClose={closeOverlay}
        >
          {overlay.confirm === "share" && <ShareCard session={detailsSession} outcome={detailsOutcome!} bankrollName={scope.bankrollNames.get(detailsSession.bankrollId)} onClose={() => setOverlay({ kind: "details", sessionId: detailsSession.id })} />}
          <ConfirmModal
            open={overlay.confirm === "delete"}
            title="Delete session?"
            description={`This permanently deletes the session logged on ${longDate(detailsSession.date)}.`}
            confirmLabel="Delete"
            tone="danger"
            onCancel={() => setOverlay({ kind: "details", sessionId: detailsSession.id })}
            onConfirm={() => deleteSession(detailsSession)}
          />
        </SessionDetailsSheet>
      )}
      {overlay?.kind === "cash" && (
        <CashMovementSheet bankrolls={data.bankrolls} bankrollId={overlay.bankrollId} balances={scope.balances} note={overlay.note} onSaved={onCashSaved} onClose={closeOverlay} registerGuard={registerGuard} />
      )}
      {overlay?.kind === "bankrolls" && (
        <BankrollsSheet
          bankrolls={data.bankrolls}
          sessions={data.sessions}
          transactions={data.transactions}
          balances={scope.balances}
          onCreated={(created) => setSelectedBankroll(created.id)}
          onDeleted={(id) => { if (selectedBankroll === id) setSelectedBankroll("all"); }}
          onClose={closeOverlay}
        />
      )}
      <ConfirmModal
        open={overlay?.kind === "deleteCash"}
        title={overlay?.kind === "deleteCash" ? `Delete ${overlay.transaction.type}?` : ""}
        description={overlay?.kind === "deleteCash" ? `This permanently deletes the ${cashLabel(overlay.transaction)}.` : undefined}
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setOverlay(null)}
        onConfirm={() => overlay?.kind === "deleteCash" && deleteCash(overlay.transaction)}
      />
      <ConfirmModal
        open={overlay?.kind === "deleteVenue"}
        title="Delete saved venue?"
        description={overlay?.kind === "deleteVenue" ? `“${overlay.preset.name}” will no longer be offered in the Journal, Lab, Simulator, Compare or Trip Planner. Past sessions don't change.` : undefined}
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setOverlay(null)}
        onConfirm={() => overlay?.kind === "deleteVenue" && deleteVenue(overlay.preset)}
      />
    </>
  );
}

const noop = () => undefined;
