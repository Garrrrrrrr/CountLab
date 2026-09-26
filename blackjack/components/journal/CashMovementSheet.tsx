"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useFormAnalytics } from "@/lib/analytics/react";
import { isJournalDate, journalLibrary, type Bankroll, type BankrollTransaction } from "@/lib/blackjack/journal";
import { AMOUNT_FORMAT_ERROR, localDateString, type AmountEntry } from "@/lib/blackjack/journalForm";
import { money } from "@/lib/blackjack/journalFormat";
import { Button, GhostButton, SegmentedControl, Select, Sheet } from "../ui";
import { AmountField } from "./AmountField";
import { DiscardBar } from "./DiscardBar";
import { FieldError } from "./parts";

type CashDraft = { type: "deposit" | "withdrawal"; amount: AmountEntry; date: string; bankrollId: string; note: string };
const same = (a: CashDraft, b: CashDraft) => JSON.stringify(a) === JSON.stringify(b);

/** Money moving into or out of a bankroll, kept apart from table results. */
export function CashMovementSheet({ bankrolls, bankrollId, balances, note = "", onSaved, onClose, registerGuard }: {
  bankrolls: Bankroll[];
  bankrollId: string;
  balances: Map<string, number>;
  /** Prefills the note, e.g. "Starting bankroll". */
  note?: string;
  onSaved: (record: BankrollTransaction, another: boolean) => void;
  onClose: () => void;
  registerGuard: (guard: (() => boolean) | null) => void;
}) {
  const initial: CashDraft = { type: "deposit", amount: null, date: localDateString(), bankrollId, note };
  const [draft, setDraft] = useState(initial);
  const [snapshot, setSnapshot] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const [amountLeft, setAmountLeft] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const formId = useId();
  const dateId = useId();
  const dateErrorId = useId();
  const amountErrorId = useId();
  const form = useRef<HTMLFormElement>(null);
  const amountWrap = useRef<HTMLDivElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const transactionForm = useFormAnalytics("journal_transaction");
  const dirty = !same(draft, snapshot);
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => {
    registerGuard(() => { if (!dirtyRef.current) return true; setDiscarding(true); return false; });
    return () => registerGuard(null);
  }, [registerGuard]);
  const [initialFocus] = useState(() => ({ get current() { return amountWrap.current?.querySelector("input") ?? null; } }));

  const update = (patch: Partial<CashDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const dateValid = isJournalDate(draft.date);
  const amount = typeof draft.amount === "number" ? draft.amount : 0;
  const amountValid = amount > 0;
  // A typo is flagged as soon as the field is left; a blank only once recording is tried.
  const amountError = draft.amount === "invalid" ? (attempted || amountLeft ? AMOUNT_FORMAT_ERROR : null) : attempted && !amountValid ? "Enter an amount greater than $0." : null;
  const signed = draft.type === "deposit" ? amount : -amount;
  const after = (balances.get(draft.bankrollId) ?? 0) + signed;

  const record = (another: boolean) => {
    transactionForm.submitted();
    setAttempted(true);
    if (!dateValid) { transactionForm.validationFailed("date", "invalid_date"); dateInput.current?.focus(); return; }
    if (!amountValid) { transactionForm.validationFailed("amount", draft.amount === "invalid" ? "not_a_number" : "missing"); amountWrap.current?.querySelector("input")?.focus(); return; }
    const saved = journalLibrary.addTransaction({ date: draft.date, type: draft.type, amount: Math.abs(amount), note: draft.note.trim() || undefined, bankrollId: draft.bankrollId });
    transactionForm.succeeded();
    onSaved(saved, another);
    if (another) {
      const next = { ...draft, amount: null, note: "" };
      setDraft(next);
      setSnapshot(next);
      setAttempted(false);
      amountWrap.current?.querySelector("input")?.focus();
    }
  };
  const requestClose = () => dirty ? setDiscarding(true) : onClose();
  const verb = draft.type === "deposit" ? "Record deposit" : "Record withdrawal";

  const footer = discarding ? (
    <DiscardBar message="Discard this deposit or withdrawal?" onKeep={() => setDiscarding(false)} onDiscard={onClose} />
  ) : (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-[var(--ink-muted)]">Bankroll after: <b className="font-data text-[var(--ink)]">{money(after)}</b></p>
      <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
        <GhostButton type="button" className="flex-1 sm:flex-none" onClick={requestClose}>Cancel</GhostButton>
        <GhostButton type="button" className="hidden sm:inline-flex" onClick={() => record(true)}>Record and add another</GhostButton>
        <Button type="submit" form={formId} enterAction={false} className="flex-[2] whitespace-nowrap sm:flex-none">{verb}</Button>
      </div>
    </div>
  );

  return (
    <Sheet open title="Deposit or withdrawal" description="Bankroll = session results + deposits − withdrawals." onClose={() => discarding ? undefined : requestClose()} initialFocusRef={initialFocus} footer={footer}>
      <form id={formId} ref={form} noValidate onSubmit={(event) => { event.preventDefault(); record(false); }} onChange={() => transactionForm.start("inputs")} className="grid gap-4">
        <SegmentedControl<"deposit" | "withdrawal">
          label="Type"
          analyticsField="type"
          value={draft.type}
          onChange={(type) => update({ type })}
          options={[{ value: "deposit", label: "Deposit", icon: "fa-arrow-down" }, { value: "withdrawal", label: "Withdrawal", icon: "fa-arrow-up" }]}
        />
        <div ref={amountWrap}>
          <AmountField
            label="Amount"
            analyticsField="amount"
            invalid={amountError !== null}
            describedBy={amountError ? amountErrorId : undefined}
            value={draft.amount}
            onBlur={() => setAmountLeft(true)}
            onValueChange={(next) => {
              setAmountLeft(false);
              // A typed minus sign reads as money going out.
              if (typeof next === "number" && next < 0) update({ amount: -next, type: "withdrawal" });
              else update({ amount: next });
            }}
          />
          {amountError && <FieldError id={amountErrorId}>{amountError}</FieldError>}
        </div>
        <div className={`grid gap-4 ${bankrolls.length > 1 ? "min-[420px]:grid-cols-2" : ""}`}>
          <div className="grid min-w-0 content-start gap-2">
            <label htmlFor={dateId} className="text-[.8rem] font-medium text-[var(--ink-muted)]">Date</label>
            <input id={dateId} ref={dateInput} type="date" required data-analytics-field="date" aria-invalid={!dateValid} aria-describedby={dateValid ? undefined : dateErrorId} value={draft.date} onChange={(event) => update({ date: event.target.value })} className="field min-h-11 w-full min-w-0 rounded-lg px-3 text-[.9rem] text-[var(--ink)] outline-none aria-[invalid=true]:!border-[var(--negative)]" />
            {!dateValid && <FieldError id={dateErrorId}>Enter a complete, valid date.</FieldError>}
          </div>
          {bankrolls.length > 1 && (
            <Select label="Bankroll" data-analytics-field="bankroll" value={draft.bankrollId} onChange={(event) => update({ bankrollId: event.target.value })}>
              {bankrolls.map((bankroll) => <option key={bankroll.id} value={bankroll.id}>{bankroll.name}</option>)}
            </Select>
          )}
        </div>
        <label className="grid min-w-0 gap-2 text-[.8rem] font-medium text-[var(--ink-muted)]">
          Note (optional)
          <input data-analytics-field="note_optional" value={draft.note} placeholder="e.g. Reload from savings" onChange={(event) => update({ note: event.target.value })} className="field min-h-11 w-full min-w-0 rounded-lg px-3 text-[.9rem] text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)]" />
        </label>
        <p className="text-xs leading-5 text-[var(--ink-muted)]">Session expenses are reported separately and never deducted from the bankroll.</p>
        <GhostButton type="button" className="w-full sm:hidden" onClick={() => record(true)}>Record and add another</GhostButton>
      </form>
    </Sheet>
  );
}
