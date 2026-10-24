"use client";
import { useState } from "react";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Trash } from "lucide-react";
import { Button, EmptyState, cx } from "@/components/ui";
import type { BankrollTransaction } from "@/lib/blackjack/journal";
import { money, shortDate, signedMoney } from "@/lib/blackjack/journalFormat";
import { newestFirst } from "@/lib/blackjack/journalView";
import { cashLabel, exactMoney, signedCash, toneClass } from "./model";
import { Figure } from "./parts";

export const CASH_RECORD_ID = "journal-cash-record";
const RECENT = 12;

/** Deposits and withdrawals, newest first, with the latest dozen shown until asked for all. */
export function CashTab({ transactions, totals, bankrollNames, showBankroll, onRecord, onDelete }: {
  transactions: BankrollTransaction[];
  totals: { deposits: number; withdrawals: number; net: number };
  bankrollNames: Map<string, string>;
  showBankroll: boolean;
  onRecord: () => void;
  onDelete: (transaction: BankrollTransaction) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const ordered = newestFirst(transactions);
  const shown = showAll ? ordered : ordered.slice(0, RECENT);
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-3 gap-3 rounded-xl bg-surface-2 p-3">
        <Figure label="Deposits" value={money(totals.deposits)} />
        <Figure label="Withdrawals" value={money(totals.withdrawals)} />
        <Figure label="Net" value={signedMoney(totals.net)} tone={totals.net > 0 ? "pos" : totals.net < 0 ? "neg" : undefined} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xs leading-5 text-ink-3">Bankroll = session results + deposits − withdrawals. Session expenses are reported separately and never deducted. The date and venue filters don&apos;t apply here.</p>
        <Button id={CASH_RECORD_ID} variant="secondary" icon={<ArrowLeftRight size={16} aria-hidden />} onClick={onRecord}>Deposit or withdrawal</Button>
      </div>
      {ordered.length === 0 ? (
        <EmptyState title="No deposits or withdrawals yet">Record your starting bankroll so risk of ruin is priced on real money.</EmptyState>
      ) : (
        <>
          <ul aria-label="Cash movements" className="card divide-y divide-line overflow-hidden">
            {shown.map((transaction) => {
              const deposit = transaction.type === "deposit";
              const Icon = deposit ? ArrowDownLeft : ArrowUpRight;
              return (
                <li key={transaction.id} className="flex min-h-16 items-center gap-3 py-2 pl-4 pr-1.5">
                  <span aria-hidden className={cx("grid grid-cols-1 h-9 w-9 shrink-0 place-items-center rounded-full", deposit ? "bg-pos/10 text-pos" : "bg-neg/10 text-neg")}><Icon size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className={cx("tnum font-semibold", toneClass(signedCash(transaction)))}>{deposit ? "+" : "−"}{exactMoney(transaction.amount)}</span>
                      <span className="text-sm text-ink-2">{deposit ? "Deposit" : "Withdrawal"} · {shortDate(transaction.date)}</span>
                    </p>
                    {(transaction.note || showBankroll) && <p title={transaction.note} className="truncate text-xs text-ink-3">{[showBankroll ? bankrollNames.get(transaction.bankrollId) : null, transaction.note].filter(Boolean).join(" · ")}</p>}
                  </div>
                  <button type="button" data-cash-row={transaction.id} aria-label={`Delete ${cashLabel(transaction)}`} title="Delete" onClick={() => onDelete(transaction)}
                    className="grid grid-cols-1 h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-3 transition hover:bg-surface-2 hover:text-neg">
                    <Trash size={17} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
          {ordered.length > RECENT && (
            <div><Button variant="ghost" className="text-brand-text" onClick={() => setShowAll((current) => !current)}>{showAll ? "Show recent only" : `Show all ${ordered.length}`}</Button></div>
          )}
        </>
      )}
    </div>
  );
}
