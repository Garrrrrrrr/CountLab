"use client";
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useFormAnalytics } from "@/lib/analytics/react";
import type { CvcxTemplate } from "@/lib/blackjack/cvcxLibrary";
import { journalLibrary, type Bankroll, type JournalSession } from "@/lib/blackjack/journal";
import { classifySessionAssessment, theoreticalSessionOutcome } from "@/lib/blackjack/journalAnalysis";
import {
  AMOUNT_FORMAT_ERROR, applyVenue, casinoNames, gameFields, gameForCasino, gameFromSession, nextEntryDraft, SESSION_ERRORS, sameGame, sessionPayload, signedResult, usesVenue, validateSessionDraft,
  type GameDraft, type GameSource, type SessionDraft, type SessionField,
} from "@/lib/blackjack/journalForm";
import { longDate, shortDate, signedMoney } from "@/lib/blackjack/journalFormat";
import type { SimulationTemplate } from "@/lib/blackjack/simulationLibrary";
import type { VenuePreset } from "@/lib/blackjack/venuePresets";
import { Button, Callout, GhostButton, HelpTip, NumberField, SegmentedControl, Select, Sheet, toast } from "../ui";
import { AmountField } from "./AmountField";
import { DiscardBar, useDiscardGuard } from "./DiscardBar";
import { GameEditor, ScenarioLinks } from "./GameEditor";
import { FieldError, VerdictBadge } from "./parts";

const RANGE_HELP = "95% of sessions like this land in this range. It's a range of outcomes for one session, not a confidence interval for your average.";
const same = (a: SessionDraft, b: SessionDraft) => JSON.stringify(a) === JSON.stringify(b);

export type SavedSession = { record: JournalSession; draft: SessionDraft; another: boolean };

/**
 * Logging or editing one session. The common case is date, hours and what was
 * won or lost; the game comes preloaded and sits behind "Change game". The
 * result is a Won/Lost choice plus an amount, so an iPhone keypad without a
 * minus key can still record a loss and a blank never saves as $0.
 */
export function LogSessionSheet({ mode, sessionId, initial, sessions, bankrolls, presets, scenarios, setups, scenarioLoaded, onSaved, onClose, registerGuard }: {
  mode: "new" | "edit";
  sessionId?: string;
  initial: SessionDraft;
  sessions: JournalSession[];
  bankrolls: Bankroll[];
  presets: VenuePreset[];
  scenarios: CvcxTemplate[];
  setups: SimulationTemplate[];
  /** Set when this form was opened by a `?scenario=` link from another tool. */
  scenarioLoaded?: { id: string; name: string };
  onSaved: (saved: SavedSession) => void;
  onClose: () => void;
  /** Lets the page ask before closing on browser Back; returns false while there are unsaved changes. */
  registerGuard: (guard: (() => boolean) | null) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [snapshot, setSnapshot] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const [amountLeft, setAmountLeft] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const hoursWrap = useRef<HTMLDivElement>(null);
  // Guards against a double tap on Save writing the same session twice.
  const lastSave = useRef(0);
  const formId = useId();
  const dateId = useId();
  const dateErrorId = useId();
  const amountErrorId = useId();
  const casinoListId = useId();
  const sessionForm = useFormAnalytics("journal_session");
  const { discarding, requestClose, keepEditing, onSheetClose, actionsRef } = useDiscardGuard({ dirty: !same(draft, snapshot), onClose, registerGuard });
  // Edits start on the date; a new entry starts on the hours, the first thing that changes after a session.
  const initialFocus = useMemo(() => ({ get current() { return mode === "edit" ? dateInput.current : hoursWrap.current?.querySelector("input") ?? null; } }), [mode]);

  const update = (patch: Partial<SessionDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const setGame = (game: GameDraft, source: GameSource) => setDraft((current) => ({ ...current, game, source }));
  const errors = validateSessionDraft(draft);
  const shown = (field: SessionField) => errors.includes(field) && (field === "date" || attempted);
  // A typo is flagged as soon as the field is left; a blank only once saving is tried.
  const amountTypo = draft.amount === "invalid";
  const amountError = amountTypo ? (attempted || amountLeft ? AMOUNT_FORMAT_ERROR : null) : shown("amount") ? SESSION_ERRORS.amount : null;

  const outcome = useMemo(() => theoreticalSessionOutcome({ ...gameFields(draft.game), hours: draft.hours }), [draft.game, draft.hours]);
  const low = outcome.tripEv - 1.96 * outcome.standardDeviation;
  const high = outcome.tripEv + 1.96 * outcome.standardDeviation;
  const amount = typeof draft.amount === "number" ? draft.amount : null;
  const entered = amount !== null && (amount === 0 || draft.direction !== null);
  const result = signedResult(draft.direction, amount ?? 0);
  const verdict = classifySessionAssessment(outcome.standardDeviation > 0 ? (result - outcome.tripEv) / outcome.standardDeviation : null);
  const others = useMemo(() => sessions.filter((session) => session.id !== sessionId), [sessions, sessionId]);
  const casinos = useMemo(() => casinoNames(others, presets), [others, presets]);
  const casinoGame = gameForCasino(draft.location, others, presets);
  const suggestion = casinoGame?.kind === "venue"
    ? usesVenue(draft.game, casinoGame.preset) ? null : { label: `Use your saved game for ${casinoGame.preset.name}`, apply: () => setGame(applyVenue(draft.game, casinoGame.preset), { kind: "venue", name: casinoGame.preset.name }) }
    : casinoGame?.kind === "session"
      ? sameGame(draft.game, gameFromSession(casinoGame.session)) ? null : { label: `Use the game from your last ${casinoGame.session.location?.trim()} session (${shortDate(casinoGame.session.date)})`, apply: () => setGame(gameFromSession(casinoGame.session), { kind: "casino", date: casinoGame.session.date, location: casinoGame.session.location?.trim() ?? "" }) }
      : null;

  const focusField = (field: SessionField) => {
    if (field === "date") dateInput.current?.focus();
    else form.current?.querySelector<HTMLInputElement>(`[data-field="${field}"] input`)?.focus();
  };

  const save = (another: boolean) => {
    if (Date.now() - lastSave.current < 800) return;
    sessionForm.submitted();
    setAttempted(true);
    if (errors.length) {
      sessionForm.validationFailed(errors[0] === "date" ? "date" : "result", errors[0] === "date" ? "invalid_date" : errors[0] === "amount" && amountTypo ? "not_a_number" : "missing");
      focusField(errors[0]);
      return;
    }
    lastSave.current = Date.now();
    const payload = sessionPayload(draft);
    const record = mode === "edit" && sessionId ? journalLibrary.updateSession(sessionId, payload) : journalLibrary.addSession(payload);
    if (!record) {
      // Deleted on another device or tab while this form was open.
      sessionForm.failed("not_found");
      toast({ message: "This session no longer exists, so the changes weren't saved.", tone: "bad" });
      onClose();
      return;
    }
    sessionForm.succeeded();
    onSaved({ record, draft, another });
    if (another) {
      const next = nextEntryDraft(draft);
      setDraft(next);
      setSnapshot(next);
      setAttempted(false);
      dateInput.current?.focus();
    }
  };

  // Enter saves from the session's own fields. In the venue name and the
  // per-count bets it only commits that field: it must never log a session.
  const guardEnter = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Enter" && (event.target as HTMLElement).closest("[data-enter-local]")) event.preventDefault();
  };

  const summary: ReactNode = (
    <div className="min-w-0 text-sm leading-6">
      <p className="text-[var(--ink-muted)]">
        Expected <b className="font-data text-[var(--ink)]">{signedMoney(outcome.tripEv)}</b> · 95% modeled outcome range <span className="whitespace-nowrap font-data text-[var(--ink)]">{signedMoney(low)} to {signedMoney(high)}</span>
        <HelpTip label="the 95% modeled outcome range" className="ml-1">{RANGE_HELP}</HelpTip>
      </p>
      {entered && <p className="flex flex-wrap items-center gap-x-2 text-[var(--ink-muted)]">Your <b className="font-data text-[var(--ink)]">{signedMoney(result)}</b>: <VerdictBadge assessment={verdict} size="sm" /></p>}
    </div>
  );

  const footer = discarding ? (
    <DiscardBar
      message={mode === "edit" ? "Discard your changes?" : "Discard this session?"}
      onKeep={keepEditing}
      onDiscard={() => { setDraft(snapshot); onClose(); }}
    />
  ) : (
    <div className="grid gap-3">
      <div className="hidden sm:block">{summary}</div>
      <div ref={actionsRef} className="flex flex-wrap justify-end gap-2">
        <GhostButton type="button" className="flex-1 sm:flex-none" onClick={requestClose}>Cancel</GhostButton>
        {mode === "new" && <GhostButton type="button" className="hidden sm:inline-flex" onClick={() => save(true)}>Save and log another</GhostButton>}
        <Button type="submit" form={formId} enterAction={false} className="flex-[2] whitespace-nowrap sm:flex-none">
          <i className="fa-solid fa-check mr-2 text-xs" aria-hidden="true" />{mode === "edit" ? "Save changes" : "Save session"}
        </Button>
      </div>
    </div>
  );

  return (
    <Sheet
      open
      title={mode === "edit" ? "Edit session" : "Log session"}
      onClose={onSheetClose}
      initialFocusRef={initialFocus}
      footer={footer}
    >
      <form
        id={formId}
        ref={form}
        noValidate
        onSubmit={(event) => { event.preventDefault(); save(false); }}
        onChange={() => sessionForm.start("inputs")}
        onKeyDown={guardEnter}
        className="grid gap-5"
      >
        {mode === "edit" && <Callout tone="info">Editing the session from {longDate(snapshot.date)}.</Callout>}
        {scenarioLoaded && (
          <Callout tone="info" title={`Loaded “${scenarioLoaded.name}” from the Lab`}>
            Check the date, hours and result, then save.
            <div className="mt-1 text-sm"><ScenarioLinks id={scenarioLoaded.id} /></div>
          </Callout>
        )}

        <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0">
          <legend className="sr-only">Session</legend>
          <div className="grid gap-4 min-[420px]:grid-cols-2">
            <div className="grid min-w-0 content-start gap-2">
              <label htmlFor={dateId} className="text-[.8rem] font-medium text-[var(--ink-muted)]">Date</label>
              <input
                id={dateId}
                ref={dateInput}
                type="date"
                required
                data-analytics-field="date"
                aria-invalid={shown("date")}
                aria-describedby={shown("date") ? dateErrorId : undefined}
                value={draft.date}
                onChange={(event) => update({ date: event.target.value })}
                className="field min-h-11 w-full min-w-0 rounded-lg px-3 text-[.9rem] text-[var(--ink)] outline-none aria-[invalid=true]:!border-[var(--negative)]"
              />
              {shown("date") && <FieldError id={dateErrorId}>{SESSION_ERRORS.date}</FieldError>}
            </div>
            <div ref={hoursWrap}>
              <NumberField label="Hours played" suffix="h" min={0.1} step={0.5} inputStep="any" analyticsField="hours_played" value={draft.hours} onValueChange={(hours) => update({ hours })} />
            </div>
          </div>
          <div className={`grid gap-4 ${bankrolls.length > 1 ? "min-[420px]:grid-cols-2" : ""}`}>
            <div className="grid min-w-0 content-start gap-2">
              <label className="grid min-w-0 gap-2 text-[.8rem] font-medium text-[var(--ink-muted)]">
                Casino name (optional)
                <input
                  list={casinoListId}
                  data-analytics-field="casino_name_optional"
                  autoComplete="off"
                  value={draft.location}
                  placeholder="e.g. Bellagio"
                  onChange={(event) => update({ location: event.target.value })}
                  className="field min-h-11 w-full min-w-0 rounded-lg px-3 text-[.9rem] text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)]"
                />
              </label>
              <datalist id={casinoListId}>{casinos.map((name) => <option key={name} value={name} />)}</datalist>
            </div>
            {bankrolls.length > 1 && (
              <Select label="Bankroll" data-analytics-field="bankroll_this_session_belongs_to" value={draft.bankrollId} onChange={(event) => update({ bankrollId: event.target.value })}>
                {bankrolls.map((bankroll) => <option key={bankroll.id} value={bankroll.id}>{bankroll.name}</option>)}
              </Select>
            )}
          </div>
          {suggestion && (
            <div>
              <GhostButton type="button" size="compact" onClick={suggestion.apply}><i className="fa-solid fa-wand-magic-sparkles mr-2 text-xs" aria-hidden="true" />{suggestion.label}</GhostButton>
            </div>
          )}
        </fieldset>

        <fieldset className="m-0 grid min-w-0 gap-3 rounded-2xl border border-[var(--rule)] p-3.5">
          <legend className="px-1 text-sm font-semibold text-[var(--ink)]">Table result</legend>
          <div className="grid grid-cols-1 items-end gap-3 min-[400px]:grid-cols-[auto_minmax(0,1fr)]">
            <div data-field="direction">
              <SegmentedControl<"won" | "lost">
                label="Won or lost"
                hideLabel
                analyticsField="result_direction"
                value={draft.direction}
                onChange={(direction) => update({ direction })}
                options={[{ value: "won", label: "Won", icon: "fa-arrow-trend-up" }, { value: "lost", label: "Lost", icon: "fa-arrow-trend-down" }]}
              />
            </div>
            <div data-field="amount">
              <AmountField
                label="Amount won or lost"
                analyticsField="actual_net_result"
                invalid={amountError !== null}
                describedBy={amountError ? amountErrorId : undefined}
                value={draft.amount}
                onBlur={() => setAmountLeft(true)}
                onValueChange={(next) => {
                  setAmountLeft(false);
                  // A typed minus sign means a loss: keep the size, choose Lost.
                  if (typeof next === "number" && next < 0) update({ amount: -next, direction: "lost" });
                  else update({ amount: next });
                }}
              />
            </div>
          </div>
          {amountError && <FieldError id={amountErrorId}>{amountError}</FieldError>}
          {shown("direction") && <FieldError>{SESSION_ERRORS.direction}</FieldError>}
          <p className="text-xs leading-5 text-[var(--ink-muted)]">What you left with minus what you bought in. Enter 0 if you broke even.</p>
          <div className="border-t border-[var(--rule)] pt-3 sm:hidden">{summary}</div>
        </fieldset>

        <div className="grid gap-4 min-[420px]:grid-cols-2">
          <NumberField
            label="Expenses (comps, travel)"
            prefix="$"
            min={0}
            inputStep="any"
            analyticsField="expenses_comps_travel"
            value={draft.expenses}
            onValueChange={(expenses) => update({ expenses })}
            help="Tracked separately. Doesn't change your bankroll or the EV comparison."
          />
        </div>
        <label className="grid min-w-0 gap-2 text-[.8rem] font-medium text-[var(--ink-muted)]">
          Notes (optional)
          <textarea
            rows={3}
            data-analytics-field="notes_optional"
            value={draft.notes}
            onChange={(event) => update({ notes: event.target.value })}
            onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); form.current?.requestSubmit(); } }}
            className="field min-w-0 rounded-lg px-3 py-2.5 text-[.9rem] text-[var(--ink)] outline-none"
          />
        </label>

        <GameEditor
          game={draft.game}
          source={draft.source}
          onGame={setGame}
          location={draft.location}
          onLocation={(location) => update({ location })}
          hours={draft.hours}
          presets={presets}
          scenarios={scenarios}
          setups={setups}
          defaultOpen={sessions.length === 0}
        />
        {mode === "new" && <GhostButton type="button" className="w-full sm:hidden" onClick={() => save(true)}>Save and log another</GhostButton>}
      </form>
    </Sheet>
  );
}
