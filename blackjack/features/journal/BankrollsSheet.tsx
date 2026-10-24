"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Badge, Button, toast } from "@/components/ui";
import { journalLibrary, type Bankroll, type BankrollTransaction, type JournalSession } from "@/lib/blackjack/journal";
import { money, plural } from "@/lib/blackjack/journalFormat";
import { neighbourId } from "@/lib/blackjack/journalView";
import { InputField, JournalSheet } from "./parts";

const normalized = (name: string) => name.trim().toLocaleLowerCase();
const rowButton = (action: "rename" | "delete", id: string) => () => document.querySelector<HTMLElement>(`[data-bankroll-${action}="${CSS.escape(id)}"]`);
const DUPLICATE = "You already have a bankroll with that name.";

/**
 * Create, rename and delete bankrolls, and pick the one in view. Each change
 * is confirmed in place rather than in another dialog.
 */
export function BankrollsSheet({ bankrolls, sessions, transactions, balances, selected, onSelect, onCreated, onDeleted, onClose }: {
  bankrolls: Bankroll[];
  sessions: JournalSession[];
  transactions: BankrollTransaction[];
  balances: Map<string, number>;
  selected: string | "all";
  onSelect: (id: string | "all") => void;
  onCreated: (bankroll: Bankroll) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const newNameId = useId();
  // Each action removes or disables the control that had focus, so say where focus goes once the sheet re-renders.
  const focusNext = useRef<(() => HTMLElement | null) | null>(null);
  useEffect(() => {
    const next = focusNext.current;
    focusNext.current = null;
    next?.()?.focus();
  });
  const newNameInput = () => document.getElementById(newNameId);
  const ordered = [...bankrolls].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const defaultId = ordered[0]?.id;
  const taken = (name: string, except?: string) => bankrolls.some((bankroll) => bankroll.id !== except && normalized(bankroll.name) === normalized(name));
  const duplicate = newName.trim() !== "" && taken(newName);
  const renameDuplicate = renaming !== null && renaming.name.trim() !== "" && taken(renaming.name, renaming.id);
  const total = bankrolls.reduce((sum, bankroll) => sum + (balances.get(bankroll.id) ?? 0), 0);

  const create = () => {
    const name = newName.trim();
    if (!name || duplicate) return;
    const created = journalLibrary.addBankroll(name);
    setNewName("");
    focusNext.current = newNameInput;
    onCreated(created);
    toast(`Bankroll “${name}” created.`, "pos");
  };
  const rename = () => {
    if (!renaming) return;
    const name = renaming.name.trim();
    if (!name || renameDuplicate) return;
    journalLibrary.renameBankroll(renaming.id, name);
    focusNext.current = rowButton("rename", renaming.id);
    setRenaming(null);
    toast(`Bankroll renamed to “${name}”.`, "pos");
  };
  const remove = (bankroll: Bankroll) => {
    const fallback = ordered.find((item) => item.id !== bankroll.id);
    const neighbour = neighbourId(ordered.map((item) => item.id), bankroll.id);
    if (!journalLibrary.deleteBankroll(bankroll.id)) return;
    focusNext.current = neighbour ? rowButton("rename", neighbour) : newNameInput;
    setDeleting(null);
    onDeleted(bankroll.id);
    toast(`Bankroll “${bankroll.name}” deleted. Its records moved to “${fallback?.name ?? "your other bankroll"}”.`);
  };

  return (
    <JournalSheet open title="Bankrolls" description="Keep separate rolls, for example home play and a trip. Each is its session results plus deposits minus withdrawals." onClose={onClose}>
      <fieldset className="min-w-0">
        <legend className="eyebrow mb-2">Show in the journal</legend>
        <div className="grid grid-cols-1 gap-2">
          {bankrolls.length > 1 && (
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line px-3.5 has-[:checked]:border-brand has-[:checked]:bg-brand/10 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand">
              <input type="radio" name="journal-bankroll-view" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={selected === "all"} onChange={() => onSelect("all")} />
              <span className="flex-1 font-medium">All bankrolls</span>
              <span className="tnum text-sm font-semibold">{money(total)}</span>
            </label>
          )}
          {ordered.map((bankroll) => {
            const sessionCount = sessions.filter((session) => session.bankrollId === bankroll.id).length;
            const cashCount = transactions.filter((transaction) => transaction.bankrollId === bankroll.id).length;
            const fallback = ordered.find((item) => item.id !== bankroll.id);
            const last = bankrolls.length === 1;
            const checked = selected === bankroll.id || (bankrolls.length === 1);
            return (
              <div key={bankroll.id} className="rounded-xl border border-line p-3.5 has-[input:checked]:border-brand has-[input:checked]:bg-brand/5">
                {renaming?.id === bankroll.id ? (
                  <form className="grid grid-cols-1 gap-2" onSubmit={(event) => { event.preventDefault(); rename(); }}>
                    <InputField label="Bankroll name" autoFocus value={renaming.name} error={renameDuplicate ? DUPLICATE : undefined} onChange={(event) => setRenaming({ ...renaming, name: event.target.value })} />
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" size="sm" className="h-11" disabled={!renaming.name.trim() || renameDuplicate}>Save</Button>
                      <Button size="sm" variant="secondary" className="h-11" onClick={() => { focusNext.current = rowButton("rename", bankroll.id); setRenaming(null); }}>Cancel</Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <label className="flex cursor-pointer items-start gap-3">
                      <input type="radio" name="journal-bankroll-view" className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--brand))]" checked={checked} disabled={last} onChange={() => onSelect(bankroll.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <b title={bankroll.name} className="truncate font-semibold">{bankroll.name}</b>
                          {bankroll.id === defaultId && bankrolls.length > 1 && <Badge>Default</Badge>}
                        </span>
                        <span className="block text-xs text-ink-3">{plural(sessionCount, "session")} · {plural(cashCount, "cash movement")}</span>
                      </span>
                      <span className="tnum shrink-0 font-semibold">{money(balances.get(bankroll.id) ?? 0)}</span>
                    </label>
                    {deleting === bankroll.id ? (
                      <div role="alert" className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-neg/40 bg-neg/5 p-3 text-sm">
                        <p>Delete “{bankroll.name}”? Its {plural(sessionCount, "session")} and {plural(cashCount, "cash movement")} move to “{fallback?.name}”. Nothing is lost.</p>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" className="h-11" autoFocus onClick={() => { focusNext.current = rowButton("delete", bankroll.id); setDeleting(null); }}>Cancel</Button>
                          <Button size="sm" variant="danger" className="h-11" onClick={() => remove(bankroll)}>Delete</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
                        <Button size="sm" variant="ghost" className="h-11" data-bankroll-rename={bankroll.id} aria-label={`Rename ${bankroll.name}`} onClick={() => { setDeleting(null); setRenaming({ id: bankroll.id, name: bankroll.name }); }}>Rename</Button>
                        <Button size="sm" variant="ghost" className="h-11 text-neg hover:text-neg" data-bankroll-delete={bankroll.id} aria-label={`Delete ${bankroll.name}`} disabled={last} onClick={() => { setRenaming(null); setDeleting(bankroll.id); }}>Delete</Button>
                        {last && <span className="text-xs text-ink-3">You always need one bankroll.</span>}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>
      <form className="mt-6 grid grid-cols-1 gap-2 border-t border-line pt-5" onSubmit={(event) => { event.preventDefault(); create(); }}>
        <div className="flex flex-wrap items-start gap-2">
          <InputField id={newNameId} className="min-w-0 flex-1 basis-48" label="New bankroll name" placeholder="e.g. Vegas trip" value={newName} error={duplicate ? DUPLICATE : undefined} onChange={(event) => setNewName(event.target.value)} />
          <Button type="submit" variant="secondary" className="mt-7" disabled={!newName.trim() || duplicate} icon={<Plus size={16} aria-hidden />}>Create bankroll</Button>
        </div>
      </form>
    </JournalSheet>
  );
}
