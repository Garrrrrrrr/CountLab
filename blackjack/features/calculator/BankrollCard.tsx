"use client";
import { useState } from "react";
import { BookOpen } from "lucide-react";
import { track } from "@/lib/analytics/track";
import { journalLibrary } from "@/lib/blackjack/journal";
import { currentBankroll } from "@/lib/blackjack/journalAnalysis";
import { count, money, riskLabel } from "@/lib/blackjack/labFormat";
import { Button, EmptyState, SelectField, Sheet, toast } from "@/components/ui";
import { Note, NumberField, Panel } from "./parts";
import type { Calc } from "./useCalculator";

/** The choices of acceptable risk, with a word on what each means. */
export const TARGET_RISKS = [
  { value: 0.01, label: "1% (very cautious)" },
  { value: 0.025, label: "2.5%" },
  { value: 0.05, label: "5% (a common choice)" },
  { value: 0.1, label: "10%" },
  { value: 0.135, label: "13.5% (full Kelly)" },
  { value: 0.25, label: "25% (aggressive)" },
] as const;

/** The target-risk select, shared by the bankroll card and the ramp suggestions. */
export function TargetRiskField({ calc, hint }: { calc: Calc; hint?: string }) {
  const { config, edit } = calc;
  return (
    <SelectField label="Target risk of ruin" hint={hint} data-analytics-field="target_risk_of_ruin" value={config.targetRisk} onChange={(event) => edit({ targetRisk: Number(event.target.value) })}>
      {!TARGET_RISKS.some((option) => option.value === config.targetRisk) && <option value={config.targetRisk}>{riskLabel(config.targetRisk)}</option>}
      {TARGET_RISKS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </SelectField>
  );
}

type JournalRoll = { id: string; name: string; balance: number };

/**
 * Reads the Journal's bankrolls only when asked. Reading them seeds a default
 * bankroll in an empty journal, so a journal with nothing logged is left alone.
 */
function readJournalBankrolls(): JournalRoll[] {
  const sessions = journalLibrary.sessions();
  const transactions = journalLibrary.transactions();
  if (!sessions.length && !transactions.length) return [];
  return journalLibrary.bankrolls().filter((roll) => !roll.archived).map((roll) => ({
    id: roll.id,
    name: roll.name,
    balance: Math.max(0, Math.round(currentBankroll(sessions.filter((session) => session.bankrollId === roll.id), transactions.filter((entry) => entry.bankrollId === roll.id)))),
  }));
}

/** Step 2: the money in play and the risk the player accepts with it. */
export function BankrollCard({ calc, className }: { calc: Calc; className?: string }) {
  const { config, edit } = calc;
  const [rolls, setRolls] = useState<JournalRoll[] | null>(null);
  const units = config.baseBet > 0 ? count(config.bankroll / config.baseBet) : "—";
  return (
    <Panel id="bankroll" eyebrow="Step 2" title="Bankroll and unit" sub="The money set aside only for blackjack, your betting unit, and how much risk of losing it all you accept." className={className}>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label="Bankroll" value={config.bankroll} min={1} prefix="$" field="available_bankroll" hint={`That is ${units} betting units.`} onChange={(bankroll) => edit({ bankroll })} />
        <NumberField label="Betting unit" value={config.baseBet} min={1} prefix="$" field="unit_amount" hint="Your 1-unit bet, usually the table minimum." onChange={(baseBet) => edit({ baseBet })} />
        <div className="sm:col-span-2">
          <TargetRiskField calc={calc} hint="The chance of losing the whole bankroll you are willing to accept. It sets the bankroll needed and the largest unit suggested." />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button variant="ghost" size="sm" className="-ml-2 min-h-11" icon={<BookOpen size={16} aria-hidden />}
          onClick={() => {
            const found = readJournalBankrolls();
            if (!found.length) { toast("Your journal has no sessions or deposits yet."); return; }
            setRolls(found);
          }}>
          Use a bankroll from my journal
        </Button>
      </div>
      <Sheet open={rolls !== null} onClose={() => setRolls(null)} title="Use a journal bankroll" description="Its current balance: deposits and withdrawals plus every logged session result." size="sm">
        {rolls && rolls.length > 0 ? (
          <ul className="grid gap-2">
            {rolls.map((roll) => (
              <li key={roll.id}>
                <button type="button"
                  onClick={() => { edit({ bankroll: Math.max(1, roll.balance) }); track("cvcx_input_changed", { input: "bankroll_from_journal" }); toast(`Bankroll set to ${money(Math.max(1, roll.balance))} from “${roll.name}”.`, "pos"); setRolls(null); }}
                  className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 text-left hover:border-line-strong">
                  <span className="min-w-0 truncate font-semibold">{roll.name}</span>
                  <span className="tnum shrink-0 text-ink-2">{money(roll.balance)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No open bankrolls">Archived bankrolls are not listed.</EmptyState>
        )}
        <Note className="mt-3">This copies the balance once; later sessions do not change it here.</Note>
      </Sheet>
    </Panel>
  );
}
