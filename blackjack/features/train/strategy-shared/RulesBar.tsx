"use client";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button, Segmented, Sheet, Toggle } from "@/components/ui";
import type { Settings, SurrenderRule } from "@/lib/statistics/storage";
import { DECK_OPTIONS, rulesFromSettings, rulesSummary, SURRENDER_LABEL, type TableRules } from "@/lib/strategy";

const SURRENDER_HELP: Record<SurrenderRule, string> = {
  none: "The table never lets you give up half your bet.",
  late: "Give up half your bet on your first two cards, after the dealer checks for blackjack.",
  early: "Against a 10 you may give up before the dealer checks for blackjack; against an ace it is late surrender.",
};

/** "6 decks, dealer hits soft 17, double after split, late surrender": the summary read aloud. */
export function rulesInWords(rules: TableRules): string {
  return [
    `${rules.decks} deck${rules.decks === 1 ? "" : "s"}`,
    rules.hitSoft17 ? "dealer hits soft 17" : "dealer stands on soft 17",
    rules.das ? "double after split" : "no double after split",
    SURRENDER_LABEL[rules.surrender].toLowerCase(),
  ].join(", ");
}

/**
 * The table rules a drill grades against, as one line with Change. The sheet
 * writes straight to the saved settings, so the charts, the other drills and
 * Settings all move with it.
 */
export function RulesBar({ settings, update, note }: { settings: Settings; update: (patch: Partial<Settings>) => void; note?: string }) {
  const [open, setOpen] = useState(false);
  const rules = rulesFromSettings(settings);
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-1">
      <div className="flex items-center gap-3">
        <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2 min-[360px]:grid"><SlidersHorizontal size={18} aria-hidden /></span>
        {/* Zero width, then grow: the summary never sets a minimum width, so the bar fits a 320px phone. */}
        <div className="w-0 min-w-0 flex-1">
          <p className="text-xs font-medium text-ink-3">Table rules</p>
          <p className="tnum truncate font-semibold"><span aria-hidden>{rulesSummary(rules)}</span><span className="sr-only">{rulesInWords(rules)}</span></p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)} aria-label="Change table rules">Change</Button>
      </div>
      {note && <p className="mt-2.5 border-t border-line pt-2.5 text-sm leading-5 text-ink-2">{note}</p>}
      <Sheet open={open} onClose={() => setOpen(false)} title="Table rules" description="Saved to your settings. Every chart and drill uses them."
        footer={<Button block onClick={() => setOpen(false)}>Done</Button>}>
        <div className="space-y-5">
          <Segmented label="Decks" value={rules.decks} onChange={(decks) => update({ decks })}
            options={DECK_OPTIONS.map((decks) => ({ value: decks, label: String(decks) }))} />
          <Segmented label="Dealer on soft 17" value={settings.dealerHitsSoft17 ? "h17" : "s17"} onChange={(value) => update({ dealerHitsSoft17: value === "h17" })}
            options={[{ value: "h17", label: "Hits (H17)" }, { value: "s17", label: "Stands (S17)" }]} />
          <Toggle label="Double after split" description="You may double a hand made by splitting a pair." checked={settings.doubleAfterSplit} onChange={(doubleAfterSplit) => update({ doubleAfterSplit })} />
          <div>
            <Segmented label="Surrender" value={settings.surrender} onChange={(surrender) => update({ surrender })}
              options={[{ value: "none", label: "None" }, { value: "late", label: "Late" }, { value: "early", label: "Early vs 10" }]} />
            <p className="mt-1.5 text-sm leading-5 text-ink-3">{SURRENDER_HELP[settings.surrender]}</p>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
