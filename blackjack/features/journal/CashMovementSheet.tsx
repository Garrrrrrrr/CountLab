"use client";
import { useId, useState } from "react";
import { Button, Segmented, SelectField, TextField, cx } from "@/components/ui";
import { useFormAnalytics } from "@/lib/analytics";
import { isJournalDate, journalLibrary, type Bankroll, type BankrollTransaction } from "@/lib/blackjack/journal";
import { AMOUNT_FORMAT_ERROR, localDateString, type AmountEntry } from "@/lib/blackjack/journalForm";
import { money } from "@/lib/blackjack/journalFormat";
import { AmountField, DiscardBar, InputField, JournalSheet, useDiscardGuard } from "./parts";

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
  const [initial] = useState<CashDraft>(() => ({ type: "deposit", amount: null, date: localDateString(), bankrollId, note }));
  const [draft, setDraft] = useState(initial);
  const [snapshot, setSnapshot] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const [amountLeft, setAmountLeft] = useState(false);
  const formId = useId();
  const dateId = useId();
  const amountId = useId();
  const cashForm = useFormAnalytics("journal_transaction");
  const { discarding, requestClose, keepEditing, onSheetClose, actionsRef } = useDiscardGuard({ dirty: !same(draft, snapshot), onClose, registerGuard });

  const update = (patch: Partial<CashDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const dateValid = isJournalDate(draft.date);
  const amount = typeof draft.amount === "number" ? draft.amount : 0;
  const amountValid = amount > 0;
  // A typo is flagged as soon as the field is left; a blank only once recording is tried.
  const amountError = draft.amount === "invalid" ? (attempted || amountLeft ? AMOUNT_FORMAT_ERROR : undefined) : attempted && !amountValid ? "Enter an amount greater than $0." : undefined;
  const after = (balances.get(draft.bankrollId) ?? 0) + (draft.type === "deposit" ? amount : -amount);

  const record = (another: boolean) => {
    cashForm.submitted();
    setAttempted(true);
    if (!dateValid) { cashForm.validationFailed("date", "invalid_date"); document.getElementById(dateId)?.focus(); return; }
    if (!amountValid) { cashForm.validationFailed("amount", draft.amount === "invalid" ? "not_a_number" : "missing"); document.getElementById(amountId)?.focus(); return; }
    const saved = journalLibrary.addTransaction({ date: draft.date, type: draft.type, amount: Math.abs(amount), note: draft.note.trim() || undefined, bankrollId: draft.bankrollId });
    cashForm.succeeded();
    onSaved(saved, another);
    if (another) {
      const next = { ...draft, amount: null, note: "" };
      setDraft(next);
      setSnapshot(next);
      setAttempted(false);
      document.getElementById(amountId)?.focus();
    }
  };

  const footer = discarding ? (
    <DiscardBar message="Discard this deposit or withdrawal?" onKeep={keepEditing} onDiscard={onClose} />
  ) : (
    <div className="grid grid-cols-1 gap-3">
      <p className="text-sm text-ink-2">Bankroll after: <b className={cx("tnum font-semibold", after < 0 ? "text-neg" : "text-ink")}>{money(after)}</b></p>
      <div ref={actionsRef} className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" className="flex-1 sm:flex-none" onClick={requestClose}>Cancel</Button>
        <Button variant="secondary" className="hidden sm:inline-flex" onClick={() => record(true)}>Record and add another</Button>
        <Button type="submit" form={formId} className="flex-[2] sm:flex-none">{draft.type === "deposit" ? "Record deposit" : "Record withdrawal"}</Button>
      </div>
    </div>
  );

  return (
    <JournalSheet open title="Deposit or withdrawal" description="Money you add to or take from a bankroll, kept apart from table results." onClose={onSheetClose} initialFocus="[data-autofocus-wrap] input" footer={footer}>
      <form id={formId} noValidate onSubmit={(event) => { event.preventDefault(); record(false); }} onChange={() => cashForm.start("inputs")} className="grid grid-cols-1 gap-4">
        <Segmented<"deposit" | "withdrawal"> label="Type" value={draft.type} onChange={(type) => update({ type })}
          options={[{ value: "deposit", label: "Deposit" }, { value: "withdrawal", label: "Withdrawal" }]} />
        <div data-autofocus-wrap="">
          <AmountField
            id={amountId}
            label="Amount"
            value={draft.amount}
            error={amountError}
            onBlur={() => setAmountLeft(true)}
            onValueChange={(next) => {
              setAmountLeft(false);
              // A typed minus sign reads as money going out.
              if (typeof next === "number" && next < 0) update({ amount: -next, type: "withdrawal" });
              else update({ amount: next });
            }}
          />
        </div>
        <div className={cx("grid grid-cols-1 gap-4", bankrolls.length > 1 && "xs:grid-cols-2")}>
          <InputField id={dateId} label="Date" type="date" required value={draft.date} error={dateValid ? undefined : "Enter a complete, valid date."} onChange={(event) => update({ date: event.target.value })} />
          {bankrolls.length > 1 && (
            <SelectField label="Bankroll" value={draft.bankrollId} onChange={(event) => update({ bankrollId: event.target.value })}>
              {bankrolls.map((bankroll) => <option key={bankroll.id} value={bankroll.id}>{bankroll.name}</option>)}
            </SelectField>
          )}
        </div>
        <TextField label="Note (optional)" value={draft.note} placeholder="e.g. Reload from savings" onChange={(event) => update({ note: event.target.value })} />
        <p className="text-xs leading-5 text-ink-3">Session expenses are reported separately and never deducted from the bankroll.</p>
        <Button variant="secondary" block className="sm:hidden" onClick={() => record(true)}>Record and add another</Button>
      </form>
    </JournalSheet>
  );
}
