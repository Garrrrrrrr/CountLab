"use client";
import { useState } from "react";
import type { BankrollTransaction } from "@/lib/blackjack/journal";
import { money, shortDate, signedMoney } from "@/lib/blackjack/journalFormat";
import { newestFirst } from "@/lib/blackjack/journalView";
import { EmptyState, GhostButton } from "../ui";

export const CASH_RECORD_ID = "journal-cash-record";
const RECENT = 12;

const kind = (transaction: BankrollTransaction) => transaction.type === "deposit" ? "deposit" : "withdrawal";
export const cashLabel = (transaction: BankrollTransaction) => `${kind(transaction)} of ${money(transaction.amount, transaction.amount % 1 ? 2 : 0)} from ${shortDate(transaction.date)}`;

function Amount({ transaction }: { transaction: BankrollTransaction }) {
  const deposit = transaction.type === "deposit";
  return <span className={`font-data font-semibold ${deposit ? "text-[var(--accent)]" : "text-[var(--warning)]"}`}>{deposit ? "+" : "−"}{money(transaction.amount, transaction.amount % 1 ? 2 : 0)}</span>;
}

/** Deposits and withdrawals, newest first, with the most recent dozen shown until asked for all. */
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
  const deleteButton = (transaction: BankrollTransaction, className = "") => (
    <button type="button" data-cash-row={transaction.id} aria-label={`Delete ${cashLabel(transaction)}`} title="Delete" onClick={() => onDelete(transaction)} className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--ink-muted)] hover:bg-overlay/[.06] hover:text-[var(--negative)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] md:h-9 md:w-9 ${className}`}>
      <i className="fa-solid fa-trash text-xs" aria-hidden="true" />
    </button>
  );

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--ink-muted)]">
          Deposits <b className="font-data text-[var(--ink)]">{money(totals.deposits)}</b> · Withdrawals <b className="font-data text-[var(--ink)]">{money(totals.withdrawals)}</b> · Net <b className="font-data text-[var(--ink)]">{signedMoney(totals.net)}</b>
        </p>
        <GhostButton id={CASH_RECORD_ID} onClick={onRecord}><i className="fa-solid fa-money-bill-transfer mr-2 text-xs" aria-hidden="true" />Deposit / withdrawal</GhostButton>
      </div>
      <p className="text-xs leading-5 text-[var(--ink-muted)]">Bankroll = session results + deposits − withdrawals. Session expenses are reported separately and never deducted. Cash movements are not affected by the period.</p>
      {ordered.length === 0 ? (
        <EmptyState icon="fa-piggy-bank" title="No deposits or withdrawals yet" description="Record your starting bankroll so risk of ruin is priced on real money." />
      ) : (
        <>
          <ul aria-label="Cash movements" className="grid grid-cols-1 gap-2 md:hidden">
            {shown.map((transaction) => (
              <li key={transaction.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--rule)] py-2 pl-3.5 pr-1.5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2"><Amount transaction={transaction} /><span className="text-sm">{shortDate(transaction.date)}</span><span className="text-xs capitalize text-[var(--ink-muted)]">{kind(transaction)}</span></p>
                  {(transaction.note || showBankroll) && <p title={transaction.note} className="truncate text-xs text-[var(--ink-muted)]">{[showBankroll ? bankrollNames.get(transaction.bankrollId) : null, transaction.note].filter(Boolean).join(" · ")}</p>}
                </div>
                {deleteButton(transaction)}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[34rem] text-left font-[family-name:var(--font-ui)] text-sm">
              <caption className="sr-only">Cash movements</caption>
              <thead className="text-xs text-[var(--ink-muted)]">
                <tr>
                  <th scope="col" className="px-2 pb-2 font-medium">Date</th>
                  <th scope="col" className="px-2 pb-2 font-medium">Type</th>
                  <th scope="col" className="px-2 pb-2 text-right font-medium">Amount</th>
                  <th scope="col" className="px-2 pb-2 font-medium">Note</th>
                  {showBankroll && <th scope="col" className="px-2 pb-2 font-medium">Bankroll</th>}
                  <th scope="col" className="px-2 pb-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((transaction) => (
                  <tr key={transaction.id} className="border-t border-[var(--rule)]">
                    <td className="whitespace-nowrap px-2 py-2">{shortDate(transaction.date)}</td>
                    <td className="px-2 py-2 capitalize">{kind(transaction)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right"><Amount transaction={transaction} /></td>
                    <td className="max-w-[18rem] px-2 py-2"><span title={transaction.note} className="block truncate text-[var(--ink-muted)]">{transaction.note ?? ""}</span></td>
                    {showBankroll && <td className="max-w-[10rem] truncate px-2 py-2 text-[var(--ink-muted)]">{bankrollNames.get(transaction.bankrollId)}</td>}
                    <td className="px-2 py-1 text-right">{deleteButton(transaction, "ml-auto")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ordered.length > RECENT && (
            <div>
              <button type="button" onClick={() => setShowAll((current) => !current)} className="min-h-11 text-sm font-semibold text-[var(--accent)] underline underline-offset-2 hover:no-underline">
                {showAll ? "Show recent only" : `Show all ${ordered.length}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
