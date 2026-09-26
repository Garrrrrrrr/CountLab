"use client";
import { useId, useState } from "react";
import { journalLibrary, type Bankroll, type BankrollTransaction, type JournalSession } from "@/lib/blackjack/journal";
import { money, plural } from "@/lib/blackjack/journalFormat";
import { Button, GhostButton, Sheet, TextField, toast } from "../ui";
import { FieldError } from "./parts";

const normalized = (name: string) => name.trim().toLocaleLowerCase();

/** Create, rename and delete bankrolls, each change confirmed in place rather than in another dialog. */
export function BankrollsSheet({ bankrolls, sessions, transactions, balances, onCreated, onDeleted, onClose }: {
  bankrolls: Bankroll[];
  sessions: JournalSession[];
  transactions: BankrollTransaction[];
  balances: Map<string, number>;
  onCreated: (bankroll: Bankroll) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const newNameId = useId();
  const ordered = [...bankrolls].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const defaultId = ordered[0]?.id;
  const taken = (name: string, except?: string) => bankrolls.some((bankroll) => bankroll.id !== except && normalized(bankroll.name) === normalized(name));
  const duplicate = newName.trim() !== "" && taken(newName);
  const renameDuplicate = renaming !== null && renaming.name.trim() !== "" && taken(renaming.name, renaming.id);

  const create = () => {
    const name = newName.trim();
    if (!name || duplicate) return;
    const created = journalLibrary.addBankroll(name);
    setNewName("");
    onCreated(created);
    toast({ message: `Bankroll “${name}” created.` });
  };
  const rename = () => {
    if (!renaming) return;
    const name = renaming.name.trim();
    if (!name || renameDuplicate) return;
    journalLibrary.renameBankroll(renaming.id, name);
    setRenaming(null);
    toast({ message: `Bankroll renamed to “${name}”.` });
  };
  const remove = (bankroll: Bankroll) => {
    const fallback = ordered.find((item) => item.id !== bankroll.id);
    if (!journalLibrary.deleteBankroll(bankroll.id)) return;
    setDeleting(null);
    onDeleted(bankroll.id);
    toast({ message: `Bankroll “${bankroll.name}” deleted. Its records moved to “${fallback?.name ?? "your other bankroll"}”.` });
  };

  return (
    <Sheet open title="Bankrolls" description="Keep separate rolls, for example home play and a trip. Each bankroll is its session results plus deposits minus withdrawals." onClose={onClose}>
      <ul className="grid gap-3">
        {ordered.map((bankroll) => {
          const sessionCount = sessions.filter((session) => session.bankrollId === bankroll.id).length;
          const cashCount = transactions.filter((transaction) => transaction.bankrollId === bankroll.id).length;
          const fallback = ordered.find((item) => item.id !== bankroll.id);
          const last = bankrolls.length === 1;
          return (
            <li key={bankroll.id} className="rounded-2xl border border-[var(--rule)] p-3.5">
              {renaming?.id === bankroll.id ? (
                <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); rename(); }}>
                  <TextField label="Bankroll name" autoFocus value={renaming.name} onChange={(event) => setRenaming({ ...renaming, name: event.target.value })} aria-invalid={renameDuplicate || undefined} />
                  {renameDuplicate && <FieldError>You already have a bankroll with that name.</FieldError>}
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" size="compact" enterAction={false} disabled={!renaming.name.trim() || renameDuplicate}>Save</Button>
                    <GhostButton type="button" size="compact" onClick={() => setRenaming(null)}>Cancel</GhostButton>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <b title={bankroll.name} className="truncate font-semibold">{bankroll.name}</b>
                        {bankroll.id === defaultId && <span title="Used when All bankrolls is selected" className="rounded-full border border-[var(--rule)] px-2 py-0.5 text-[.7rem] font-semibold text-[var(--ink-muted)]">Default</span>}
                      </p>
                      <p className="text-xs text-[var(--ink-muted)]">{plural(sessionCount, "session")} · {plural(cashCount, "cash movement")}</p>
                    </div>
                    <p className="font-data text-base font-semibold">{money(balances.get(bankroll.id) ?? 0)}</p>
                  </div>
                  {deleting === bankroll.id ? (
                    <div role="alert" className="mt-3 grid gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--negative)_40%,transparent)] p-3 text-sm">
                      <p>Delete “{bankroll.name}”? Its {plural(sessionCount, "session")} and {plural(cashCount, "cash movement")} move to “{fallback?.name}”.</p>
                      <div className="flex flex-wrap gap-2">
                        <GhostButton type="button" size="compact" autoFocus onClick={() => setDeleting(null)}>Cancel</GhostButton>
                        <Button type="button" size="compact" variant="danger" enterAction={false} onClick={() => remove(bankroll)}>Delete</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <GhostButton type="button" size="compact" aria-label={`Rename ${bankroll.name}`} onClick={() => { setDeleting(null); setRenaming({ id: bankroll.id, name: bankroll.name }); }}>Rename</GhostButton>
                      <GhostButton type="button" size="compact" aria-label={`Delete ${bankroll.name}`} disabled={last} className="text-[var(--negative)]" onClick={() => { setRenaming(null); setDeleting(bankroll.id); }}>Delete</GhostButton>
                      {last && <span className="text-xs text-[var(--ink-muted)]">You always need at least one bankroll.</span>}
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      <form className="mt-6 grid gap-2 border-t border-[var(--rule)] pt-5" onSubmit={(event) => { event.preventDefault(); create(); }}>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-48">
            <TextField id={newNameId} label="New bankroll name" placeholder="e.g. Vegas trip" value={newName} onChange={(event) => setNewName(event.target.value)} aria-invalid={duplicate || undefined} />
          </div>
          <GhostButton type="submit" disabled={!newName.trim() || duplicate}><i className="fa-solid fa-plus mr-2 text-xs" aria-hidden="true" />Create bankroll</GhostButton>
        </div>
        {duplicate && <FieldError>You already have a bankroll with that name.</FieldError>}
      </form>
    </Sheet>
  );
}
