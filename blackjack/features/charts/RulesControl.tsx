"use client";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button, Callout, Segmented, Sheet, toast } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { DOUBLING_LABEL, SURRENDER_LABEL, effectiveSurrender, rulesSummary, type TableRules } from "@/lib/strategy";

const SURRENDER_HELP: Record<TableRules["surrender"], string> = {
  none: "The table never lets you give up half your bet.",
  late: "You may surrender after the dealer checks for blackjack.",
  early: "Early surrender against a 10 (before the dealer checks), late surrender against everything else.",
};

/**
 * The one-line rules summary every chart starts with, and the sheet that
 * changes it. Chart edits are local to the page until "Save as my rules".
 */
export function RulesControl({ rules, onChange, differsFromSaved, onSave, onReset, className }: {
  rules: TableRules;
  onChange: (rules: TableRules) => void;
  differsFromSaved: boolean;
  onSave: () => void;
  onReset: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const set = <K extends keyof TableRules>(key: K, value: TableRules[K]) => onChange({ ...rules, [key]: value });
  return (
    <div className={cx("flex flex-wrap items-center gap-2", className)}>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className="inline-flex h-11 min-w-0 items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 text-left shadow-1 transition hover:border-line-strong">
        <SlidersHorizontal size={17} className="shrink-0 text-ink-3" aria-hidden />
        <span className="min-w-0">
          <span className="sr-only">Table rules: </span>
          <span className="block truncate font-mono text-[0.8125rem] font-semibold tracking-tight">{rulesSummary(rules)}</span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-brand-text">Edit</span>
      </button>
      {differsFromSaved && (
        <span className="inline-flex items-center gap-1 text-sm text-ink-3">
          Not your saved rules ·
          <button type="button" className="h-9 rounded-lg px-1.5 font-semibold text-ink underline underline-offset-2" onClick={onReset}>Use mine</button>
        </span>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Table rules" description="The chart redraws as you change them."
        footer={
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button block onClick={() => setOpen(false)}>Done</Button>
            <Button block variant="secondary" disabled={!differsFromSaved} onClick={() => { onSave(); toast("Saved as your table rules", "pos"); }}>Save as my rules</Button>
          </div>
        }>
        <div className="space-y-5">
          <Segmented label="Decks" value={rules.decks <= 2 ? rules.decks : 6} onChange={(decks) => set("decks", decks)}
            options={[{ value: 1, label: "1" }, { value: 2, label: "2" }, { value: 6, label: "4–8" }]} />
          <Segmented label="Dealer on soft 17" value={rules.hitSoft17 ? "h17" : "s17"} onChange={(value) => set("hitSoft17", value === "h17")}
            options={[{ value: "h17", label: "Hits (H17)" }, { value: "s17", label: "Stands (S17)" }]} />
          <Segmented label="Double after split" value={rules.das ? "yes" : "no"} onChange={(value) => set("das", value === "yes")}
            options={[{ value: "yes", label: "Allowed" }, { value: "no", label: "Not allowed" }]} />
          <div>
            <Segmented label="Surrender" value={effectiveSurrender(rules)} onChange={(value) => set("surrender", value)}
              options={(["none", "late", "early"] as const).map((value) => ({ value, label: value === "none" ? "None" : value === "late" ? "Late" : "Early vs 10", disabled: rules.noHoleCard && value !== "none" }))} />
            <p className="mt-1.5 text-xs leading-5 text-ink-3">{SURRENDER_LABEL[effectiveSurrender(rules)]}: {SURRENDER_HELP[effectiveSurrender(rules)]}</p>
          </div>
          <Segmented label="Doubling" value={rules.doubling} onChange={(value) => set("doubling", value)}
            options={(["any", "9-11", "10-11"] as const).map((value) => ({ value, label: value === "any" ? "Any two" : value === "9-11" ? "9–11" : "10–11", hint: DOUBLING_LABEL[value] }))} />
          <div>
            <Segmented label="Dealer's hole card" value={rules.noHoleCard ? "enhc" : "peek"} onChange={(value) => set("noHoleCard", value === "enhc")}
              options={[{ value: "peek", label: "Peeks (US)" }, { value: "enhc", label: "No hole card" }]} />
            <p className="mt-1.5 text-xs leading-5 text-ink-3">No hole card (European): the dealer takes a second card after you play, and a dealer blackjack takes doubles and splits too. Surrender is not offered in this game here.</p>
          </div>
          {rules.decks <= 2 && (
            <Callout tone="info">Index numbers on this site come from shoe games (4–8 decks). In single and double deck, a few of them sit a count or so away; basic strategy is exact for every deck count.</Callout>
          )}
        </div>
      </Sheet>
    </div>
  );
}
