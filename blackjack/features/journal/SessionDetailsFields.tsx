"use client";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { HEAT_KINDS, HEAT_LABEL, type HeatKind, type SessionDetails } from "@/lib/blackjack/journal";
import { AMOUNT_FORMAT_ERROR, cashResult, type AmountEntry } from "@/lib/blackjack/journalForm";
import { money, signedMoney } from "@/lib/blackjack/journalFormat";
import { AmountField, InputField } from "./parts";

type MoneyField = "buyIn" | "cashOut" | "topBet";

/**
 * The optional extras a counter records at the table: buy-in and cash-out (which can fill in the
 * result), rounds played (which prices the session instead of hours × pace), the top bet against
 * the plan, and any heat. Folded away until opened, and open when the session already has some.
 */
export function SessionDetailsFields({ details, onChange, planTopBet, onUseResult }: {
  details: SessionDetails;
  onChange: (details: SessionDetails) => void;
  /** The ramp's largest bet at this unit, to compare the top bet with. */
  planTopBet: number;
  /** Fills the table result from buy-in and cash-out. */
  onUseResult: (result: number) => void;
}) {
  const [open, setOpen] = useState(() => Object.keys(details).length > 0);
  // Typed text that isn't a number stays on screen to be fixed rather than vanishing.
  const [typos, setTypos] = useState<Partial<Record<MoneyField, true>>>({});
  const [roundsText, setRoundsText] = useState(details.roundsPlayed === undefined ? "" : String(details.roundsPlayed));
  const set = (patch: Partial<SessionDetails>) => onChange({ ...details, ...patch });
  const moneyEntry = (field: MoneyField): AmountEntry => (typos[field] ? "invalid" : details[field] ?? null);
  const setMoney = (field: MoneyField) => (entry: AmountEntry) => {
    setTypos((current) => ({ ...current, [field]: entry === "invalid" ? true : undefined }));
    set({ [field]: typeof entry === "number" ? Math.abs(entry) : undefined });
  };
  const rounds = Number(roundsText.replace(/,/g, "").trim());
  const roundsInvalid = roundsText.trim() !== "" && (!Number.isInteger(rounds) || rounds < 0);
  const implied = cashResult(details);
  const heat = new Set(details.heat ?? []);
  const toggleHeat = (kind: HeatKind) => {
    const next = new Set(heat);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    set({ heat: HEAT_KINDS.filter((item) => next.has(item)) });
  };

  return (
    <div className="rounded-2xl border border-line">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-12 w-full items-center gap-2 px-3.5 text-left text-sm font-semibold">
        <ChevronRight size={16} aria-hidden className={cx("shrink-0 text-ink-3 transition-transform", open && "rotate-90")} />
        <span className="min-w-0 flex-1">More details <span className="font-normal text-ink-3">· buy-in, rounds, top bet, heat (optional)</span></span>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-4 border-t border-line p-3.5">
          <div className="grid grid-cols-1 gap-3 xs:grid-cols-2">
            <AmountField label="Bought in for" value={moneyEntry("buyIn")} error={typos.buyIn ? AMOUNT_FORMAT_ERROR : undefined} onValueChange={setMoney("buyIn")} />
            <AmountField label="Cashed out" value={moneyEntry("cashOut")} error={typos.cashOut ? AMOUNT_FORMAT_ERROR : undefined} onValueChange={setMoney("cashOut")} />
          </div>
          {implied !== null && (
            <div className="-mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-2">
              <span>That is <b className="tnum text-ink">{signedMoney(implied)}</b>.</span>
              <Button variant="secondary" size="sm" onClick={() => onUseResult(implied)}>Use as the result</Button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 xs:grid-cols-2">
            <InputField
              label="Rounds played"
              inputMode="numeric"
              autoComplete="off"
              value={roundsText}
              error={roundsInvalid ? "Enter a whole number of rounds." : undefined}
              hint="When given, expected results use it instead of hours × pace."
              onChange={(event) => {
                setRoundsText(event.target.value);
                const next = Number(event.target.value.replace(/,/g, "").trim());
                set({ roundsPlayed: event.target.value.trim() !== "" && Number.isInteger(next) && next >= 0 ? next : undefined });
              }}
            />
            <AmountField
              label="Top bet"
              value={moneyEntry("topBet")}
              error={typos.topBet ? AMOUNT_FORMAT_ERROR : undefined}
              hint={details.topBet !== undefined && planTopBet > 0
                ? details.topBet > planTopBet ? `Over your plan's ${money(planTopBet)} top bet.` : `Within your plan's ${money(planTopBet)} top bet.`
                : planTopBet > 0 ? `Your plan's top bet is ${money(planTopBet)}.` : undefined}
              onValueChange={setMoney("topBet")}
            />
          </div>
          <fieldset className="m-0 min-w-0 p-0">
            <legend className="mb-1.5 text-sm font-medium text-ink-2">Heat</legend>
            <div className="flex flex-wrap gap-1.5">
              {HEAT_KINDS.map((kind) => (
                <button key={kind} type="button" aria-pressed={heat.has(kind)} onClick={() => toggleHeat(kind)}
                  className={cx("min-h-11 rounded-full border px-3.5 text-sm font-semibold", heat.has(kind) ? "border-warn bg-warn/15 text-ink" : "border-line bg-surface-2 text-ink-2 hover:text-ink")}>
                  {HEAT_LABEL[kind]}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs leading-5 text-ink-3">Builds each casino&apos;s heat history in the Venues tab.</p>
          </fieldset>
        </div>
      )}
    </div>
  );
}
