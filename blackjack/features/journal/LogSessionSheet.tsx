"use client";
import Link from "next/link";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, Plus, WandSparkles } from "lucide-react";
import { Button, Callout, SelectField, TextArea, cx, toast } from "@/components/ui";
import { useFormAnalytics } from "@/lib/analytics";
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
import { GameEditor } from "./GameEditor";
import { AmountField, DirectionToggle, DiscardBar, InputField, JournalSheet, NumberField, useDiscardGuard, Verdict } from "./parts";
import { calculatorHref } from "./useScenarioArrival";

const same = (a: SessionDraft, b: SessionDraft) => JSON.stringify(a) === JSON.stringify(b);

export type SavedSession = { record: JournalSession; another: boolean };

/**
 * Logging or editing one session. The common case is date, hours and what was
 * won or lost; the game comes preloaded behind "Change game". The result is a
 * Won/Lost choice plus a positive amount, so a phone keypad without a minus
 * key can still record a loss, and a blank never saves as $0.
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
  /** Set when the form was opened by a `?scenario=` link from the Calculator. */
  scenarioLoaded?: { id: string; name: string };
  onSaved: (saved: SavedSession) => void;
  onClose: () => void;
  registerGuard: (guard: (() => boolean) | null) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [snapshot, setSnapshot] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const [amountLeft, setAmountLeft] = useState(false);
  const [showExpenses, setShowExpenses] = useState(initial.expenses > 0);
  const form = useRef<HTMLFormElement>(null);
  // Guards against a double tap on Save writing the same session twice.
  const lastSave = useRef(0);
  const formId = useId();
  const dateId = useId();
  const amountId = useId();
  const casinoListId = useId();
  const sessionForm = useFormAnalytics("journal_session");
  const { discarding, requestClose, keepEditing, onSheetClose, actionsRef } = useDiscardGuard({ dirty: !same(draft, snapshot), onClose, registerGuard });

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
    if (field === "date") document.getElementById(dateId)?.focus();
    else if (field === "amount") document.getElementById(amountId)?.focus();
    else form.current?.querySelector<HTMLInputElement>("[data-field=direction] input")?.focus();
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
      toast("This session no longer exists, so the changes weren't saved.", "neg");
      onClose();
      return;
    }
    sessionForm.succeeded();
    onSaved({ record, another });
    if (another) {
      const next = nextEntryDraft(draft);
      setDraft(next);
      setSnapshot(next);
      setAttempted(false);
      setShowExpenses(false);
      document.getElementById(dateId)?.focus();
    }
  };

  // Enter saves from the session's own fields. In the venue name and the
  // per-count bets it only commits that field: it must never log a session.
  const guardEnter = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Enter" && (event.target as HTMLElement).closest("[data-enter-local]")) event.preventDefault();
  };

  const expected = (
    <div className="min-w-0 text-sm leading-6" aria-live="polite">
      <p className="text-ink-2">
        Expected <b className="tnum font-semibold text-ink">{signedMoney(outcome.tripEv)}</b>
        <span className="text-ink-3"> · 95% of sessions like this land between </span>
        <span className="tnum whitespace-nowrap text-ink">{signedMoney(low)}</span><span className="text-ink-3"> and </span><span className="tnum whitespace-nowrap text-ink">{signedMoney(high)}</span>
      </p>
      {entered && <p className="flex flex-wrap items-center gap-x-2 text-ink-2">Your <b className={cx("tnum font-semibold", result > 0 ? "text-pos" : result < 0 ? "text-neg" : "text-ink")}>{signedMoney(result)}</b> <Verdict assessment={verdict} size="sm" /></p>}
    </div>
  );

  const footer = discarding ? (
    <DiscardBar message={mode === "edit" ? "Discard your changes?" : "Discard this session?"} onKeep={keepEditing} onDiscard={() => { setDraft(snapshot); onClose(); }} />
  ) : (
    <div ref={actionsRef} className="flex flex-wrap justify-end gap-2">
      <Button variant="secondary" className="flex-1 sm:flex-none" onClick={requestClose}>Cancel</Button>
      {mode === "new" && <Button variant="secondary" className="hidden sm:inline-flex" onClick={() => save(true)}>Save and log another</Button>}
      <Button type="submit" form={formId} className="flex-[2] sm:flex-none" icon={<Check size={18} aria-hidden />}>{mode === "edit" ? "Save changes" : "Save session"}</Button>
    </div>
  );

  return (
    <JournalSheet
      open
      size="lg"
      title={mode === "edit" ? "Edit session" : "Log session"}
      onClose={onSheetClose}
      initialFocus={mode === "edit" ? "[data-focus-edit]" : "[data-autofocus]"}
      footer={footer}
    >
      <form id={formId} ref={form} noValidate onSubmit={(event) => { event.preventDefault(); save(false); }} onChange={() => sessionForm.start("inputs")} onKeyDown={guardEnter} className="grid grid-cols-1 gap-5">
        {mode === "edit" && <Callout tone="info">Editing the session from {longDate(snapshot.date)}.</Callout>}
        {scenarioLoaded && (
          <Callout tone="info" title={`Loaded “${scenarioLoaded.name}” from the Calculator`} action={<Link href={calculatorHref(scenarioLoaded.id)} className="inline-flex min-h-11 items-center font-semibold text-brand-text underline underline-offset-4">Open in Calculator</Link>}>
            Check the date, hours and result, then save.
          </Callout>
        )}

        <div className="grid grid-cols-1 gap-4 xs:grid-cols-2">
          <InputField id={dateId} label="Date" type="date" required data-focus-edit="" value={draft.date} error={shown("date") ? SESSION_ERRORS.date : undefined} onChange={(event) => update({ date: event.target.value })} />
          <NumberField label="Hours played" suffix="h" min={0.1} max={48} value={draft.hours} data-autofocus="" onValueChange={(hours) => update({ hours })} />
        </div>

        <fieldset className="m-0 grid grid-cols-1 min-w-0 gap-3 rounded-2xl border border-line p-3.5">
          <legend className="px-1 text-sm font-semibold text-ink">Table result</legend>
          <div className="grid grid-cols-1 items-start gap-3 xs:grid-cols-2">
            <div data-field="direction">
              <DirectionToggle value={draft.direction} error={shown("direction")} onChange={(direction) => update({ direction })} />
            </div>
            <AmountField
              id={amountId}
              label="Amount won or lost"
              value={draft.amount}
              error={amountError ?? (shown("direction") ? SESSION_ERRORS.direction : undefined)}
              onBlur={() => setAmountLeft(true)}
              onValueChange={(next) => {
                setAmountLeft(false);
                // A typed minus sign means a loss: keep the size, choose Lost.
                if (typeof next === "number" && next < 0) update({ amount: -next, direction: "lost" });
                else update({ amount: next });
              }}
            />
          </div>
          <p className="text-xs leading-5 text-ink-3">What you left with minus what you bought in for. Enter 0 if you broke even.</p>
          <div className="border-t border-line pt-3">{expected}</div>
        </fieldset>

        <div className={cx("grid grid-cols-1 gap-4", bankrolls.length > 1 && "xs:grid-cols-2")}>
          <div className="min-w-0">
            <InputField label="Casino (optional)" list={casinoListId} autoComplete="off" value={draft.location} placeholder="e.g. Bellagio" onChange={(event) => update({ location: event.target.value })} />
            <datalist id={casinoListId}>{casinos.map((name) => <option key={name} value={name} />)}</datalist>
          </div>
          {bankrolls.length > 1 && (
            <SelectField label="Bankroll" value={draft.bankrollId} onChange={(event) => update({ bankrollId: event.target.value })}>
              {bankrolls.map((bankroll) => <option key={bankroll.id} value={bankroll.id}>{bankroll.name}</option>)}
            </SelectField>
          )}
        </div>
        {suggestion && (
          <div className="-mt-2">
            <Button variant="ghost" size="sm" className="h-auto min-h-11 whitespace-normal text-left text-brand-text" icon={<WandSparkles size={16} aria-hidden className="shrink-0" />} onClick={suggestion.apply}>{suggestion.label}</Button>
          </div>
        )}

        <TextArea label="Notes (optional)" rows={3} value={draft.notes} placeholder="Table conditions, heat, what to try next time"
          onChange={(event) => update({ notes: event.target.value })}
          onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); form.current?.requestSubmit(); } }} />

        {showExpenses ? (
          <NumberField label="Expenses (comps, travel)" prefix="$" min={0} value={draft.expenses} hint="Tracked separately. It doesn't change your bankroll or the EV comparison." onValueChange={(expenses) => update({ expenses })} />
        ) : (
          <div className="-mt-2">
            <Button variant="ghost" size="sm" className="h-11" icon={<Plus size={16} aria-hidden />} onClick={() => setShowExpenses(true)}>Add expenses</Button>
          </div>
        )}

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
          defaultOpen={sessions.length === 0 && !scenarioLoaded}
          linkedScenarioId={scenarioLoaded?.id}
        />
        {mode === "new" && <Button variant="secondary" block className="sm:hidden" onClick={() => save(true)}>Save and log another</Button>}
      </form>
    </JournalSheet>
  );
}
