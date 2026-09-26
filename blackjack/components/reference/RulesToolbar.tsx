"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, HelpTip, SegmentedControl } from "@/components/ui";
import type { SegmentOption } from "@/components/ui";
import { deckChoice, decksForChoice, rulesSummary } from "@/lib/blackjack/referenceChartModel";
import type { ChartView, DeckChoice } from "@/lib/blackjack/referenceChartModel";
import type { StrategyChartRules } from "@/lib/blackjack/strategyChart";
import type { SurrenderRule } from "@/lib/statistics/storage";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { useHydrated } from "@/lib/useMediaQuery";
import { ChartToolbar, JumpRail, RulesPanelButton, useRulesPanel } from "./ChartToolbar";
import { SavedRuleNote } from "./SavedRuleNote";

/** Every label sits above its options, so two rules share a row on phones and all of them share one on wide screens. */
const RULE_LAYOUT = "justify-items-start gap-y-1";

const SURRENDER_HELP = "Surrender gives up half your bet instead of playing the hand. Late (LS): offered after the dealer checks for blackjack. Early vs 10 (ES10): offered before that check when the dealer shows a 10, and late against an ace. Saved to your table rules, so the drills use it too.";

// Each option's accessible name carries its unit ("1 deck", not "1") and
// contains the visible label, so voice control can say what it sees.
const DECK_OPTIONS: ReadonlyArray<SegmentOption<DeckChoice>> = [
  { value: "1", label: "1", ariaLabel: "1 deck" },
  { value: "2", label: "2", ariaLabel: "2 decks" },
  { value: "4-8", label: "4–8", ariaLabel: "4–8 decks" },
];
const SOFT17_OPTIONS: ReadonlyArray<SegmentOption<"s17" | "h17">> = [
  { value: "s17", label: "S17", ariaLabel: "Dealer stands on soft 17 (S17)" },
  { value: "h17", label: "H17", ariaLabel: "Dealer hits soft 17 (H17)" },
];
const DAS_OPTIONS: ReadonlyArray<SegmentOption<"yes" | "no">> = [
  { value: "yes", label: "Yes", ariaLabel: "Double after split: yes" },
  { value: "no", label: "No", ariaLabel: "Double after split: no" },
];
const SURRENDER_OPTIONS: ReadonlyArray<SegmentOption<SurrenderRule>> = [
  { value: "none", label: "None", ariaLabel: "None (no surrender)" },
  { value: "late", label: "Late", ariaLabel: "Late surrender (LS)" },
  { value: "early", label: "Early vs 10", ariaLabel: "Early vs 10 (early surrender, ES10)" },
];
/** Below 360px the totals drop "Hard" so the three options fit the panel. */
const narrowHard = (total: string) => <><span className="max-[359px]:hidden">Hard </span>{total}</>;
const DOUBLE_OPTIONS: ReadonlyArray<SegmentOption<StrategyChartRules["doubleRule"]>> = [
  { value: "any", label: "Any two cards", ariaLabel: "Double on any two cards" },
  { value: "9-11", label: narrowHard("9–11"), ariaLabel: "Double on hard 9–11 only" },
  { value: "10-11", label: narrowHard("10–11"), ariaLabel: "Double on hard 10–11 only" },
];
const HOLE_CARD_OPTIONS: ReadonlyArray<SegmentOption<"peek" | "enhc">> = [
  { value: "peek", label: <><span className="max-[359px]:hidden">Dealer peeks</span><span className="min-[360px]:hidden">Peeks</span> (US)</>, ariaLabel: "Dealer peeks (US) for blackjack" },
  { value: "enhc", label: <>No hole card<span className="max-[359px]:hidden"> (ENHC)</span></>, ariaLabel: "No hole card (ENHC), European" },
];

const enable = <T extends string>(options: ReadonlyArray<SegmentOption<T>>, disabled: boolean) =>
  options.map((option) => ({ ...option, disabled: disabled || option.disabled }));

function CountBadge({ count, label }: { count: number; label: string }) {
  if (!count) return null;
  return <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--ink)] px-1 text-[.68rem] font-bold text-[var(--paper)]"><span aria-hidden="true">{count}</span><span className="sr-only">{label}</span></span>;
}

/**
 * The table rules, always in view beside the chart they change. Wide screens
 * show them all in one pinned row. Below that they fold into a "Table rules"
 * button at the start of a rail of section links, so the pinned bar stays one
 * line tall, and open in place under it with Done beside the button.
 */
export function RulesToolbar({ view, rules, savedDecks, hasSavedRules, differences, moreRulesChanged, savedAt, onRule, onSurrender, onReset, onPanelChange }: {
  view: ChartView;
  rules: StrategyChartRules;
  savedDecks: number;
  hasSavedRules: boolean;
  differences: number;
  moreRulesChanged: number;
  savedAt: number;
  onRule: <K extends "decks" | "dealerHitsSoft17" | "doubleAfterSplit" | "doubleRule" | "europeanNoHoleCard">(key: K, value: StrategyChartRules[K]) => void;
  onSurrender: (value: SurrenderRule) => void;
  onReset: () => void;
  onPanelChange?: (open: boolean) => void;
}) {
  const hydrated = useHydrated();
  const { user, loading, continueAsGuest } = useAuth();
  const panel = useRulesPanel(onPanelChange);
  const [moreOpen, setMoreOpen] = useState(false);
  const locked = !hydrated;

  const summary = rulesSummary(rules, "short");
  const resetLabel = hasSavedRules ? "Reset to my rules" : "Reset to defaults";
  const sections: ReadonlyArray<{ href: `#${string}` | `/${string}`; label: string }> = [
    { href: "#hard", label: "Hard" },
    { href: "#soft", label: "Soft" },
    { href: "#pairs", label: "Pairs" },
    { href: "#surrender", label: "Surrender" },
    ...(view === "index" ? [{ href: "#index-plays-ranked", label: "Top plays" } as const] : []),
    { href: "/reference/h17-chart", label: "H17 chart" },
  ];

  return (
    <ChartToolbar label="Table rules">
      <JumpRail
        label="Chart sections"
        className="xl:hidden"
        items={panel.open ? [] : sections}
        leading={(
          <RulesPanelButton
            panelId="reference-rules"
            summary={summary}
            open={panel.open}
            onToggle={panel.toggle}
            onDone={panel.close}
            button={panel.button}
            disabled={locked}
            badge={hydrated && <CountBadge count={differences} label={` (${differences} changed from your saved rules)`} />}
          />
        )}
      />
      <div
        id="reference-rules"
        className={`${panel.open ? "flex" : "hidden"} max-h-[60dvh] flex-wrap items-end gap-x-4 gap-y-2.5 overflow-y-auto overscroll-contain pb-2 pt-2.5 xl:flex xl:max-h-none xl:gap-y-2 xl:overflow-visible xl:p-0`}
      >
        <SegmentedControl
          label="Decks"
          size="compact"
          className={RULE_LAYOUT}
          value={deckChoice(rules.decks)}
          onChange={(choice) => onRule("decks", decksForChoice(choice, savedDecks))}
          options={enable(DECK_OPTIONS, locked)}
          help="How many decks are shuffled together. 4, 6 and 8 decks share one chart; 1- and 2-deck games differ on a few hands."
        />
        <SegmentedControl
          label="Soft 17"
          size="compact"
          className={RULE_LAYOUT}
          value={rules.dealerHitsSoft17 ? "h17" : "s17"}
          onChange={(value) => onRule("dealerHitsSoft17", value === "h17")}
          options={enable(SOFT17_OPTIONS, locked)}
          help="A soft 17 counts an ace as 11, like A-6. At H17 tables the dealer must hit it; at S17 tables the dealer stands. H17 is slightly worse for you and changes a few plays."
        />
        <SegmentedControl
          label="Double after split"
          size="compact"
          className={RULE_LAYOUT}
          value={rules.doubleAfterSplit ? "yes" : "no"}
          onChange={(value) => onRule("doubleAfterSplit", value === "yes")}
          options={enable(DAS_OPTIONS, locked)}
          help="Whether you may double down on a hand after splitting a pair (DAS). When you can, more pairs are worth splitting."
        />
        {/* The one saved rule: its label row carries the saved marker, so it costs no extra row. */}
        <div className="grid justify-items-start gap-1 xl:self-stretch xl:border-l xl:border-[var(--rule)] xl:pl-4">
          <div className="flex min-h-6 items-center gap-1">
            <span aria-hidden="true" className="text-[.8rem] font-medium tracking-[.01em] text-[var(--ink-muted)]">Surrender</span>
            <HelpTip label="Surrender">{SURRENDER_HELP}</HelpTip>
            <SavedRuleNote savedAt={savedAt} signedIn={Boolean(user)} className="ml-1.5" />
          </div>
          <SegmentedControl
            label="Surrender"
            hideLabel
            size="compact"
            value={rules.surrender}
            onChange={onSurrender}
            options={enable(SURRENDER_OPTIONS, locked || loading)}
          />
        </div>
        <button
          type="button"
          disabled={locked}
          aria-expanded={moreOpen}
          aria-controls="reference-more-rules"
          onClick={() => setMoreOpen((open) => !open)}
          className="pressable inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[var(--ink)] hover:bg-overlay/[.06] disabled:opacity-40 xl:min-h-9 [@media(pointer:coarse)]:min-h-11"
        >
          More rules
          {hydrated && <CountBadge count={moreRulesChanged} label=" changed" />}
          <i className={`fa-solid fa-chevron-down text-[.6rem] text-[var(--ink-muted)] transition-transform ${moreOpen ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        {hydrated && differences > 0 && (
          <Button variant="quiet" size="compact" enterAction={false} onClick={onReset} aria-label={resetLabel} title={resetLabel} className="inline-flex min-h-11 items-center gap-2 xl:ml-auto xl:min-h-9 [@media(pointer:coarse)]:min-h-11">
            <i className="fa-solid fa-rotate-left text-xs" aria-hidden="true" />
            <span className="xl:hidden">{resetLabel}</span>
            <span className="hidden xl:inline">Reset</span>
          </Button>
        )}
        <div id="reference-more-rules" className={`${moreOpen ? "flex" : "hidden"} basis-full flex-wrap items-end gap-x-4 gap-y-2.5 border-t border-[var(--rule)] pt-2.5 xl:gap-y-2 xl:pt-2`}>
          <SegmentedControl
            label="Double on"
            size="compact"
            className={RULE_LAYOUT}
            value={rules.doubleRule}
            onChange={(value) => onRule("doubleRule", value)}
            options={enable(DOUBLE_OPTIONS, locked)}
            help="Some tables only let you double on certain totals. Soft hands can't be doubled under either restriction, so those cells fall back to hit or stand."
          />
          <SegmentedControl
            label="Hole card"
            size="compact"
            className={RULE_LAYOUT}
            value={rules.europeanNoHoleCard ? "enhc" : "peek"}
            onChange={(value) => onRule("europeanNoHoleCard", value === "enhc")}
            options={enable(HOLE_CARD_OPTIONS, locked)}
            help="Without a hole card the dealer checks for blackjack only after you play, so a dealer blackjack also takes the extra money from a double or split. The chart stops doubling and splitting against a 10 or ace (except A,A vs 10)."
          />
          <Link href="/settings" onClick={() => { if (!user) continueAsGuest(); }} className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--accent)] underline-offset-2 hover:underline xl:ml-auto xl:min-h-9">
            Edit saved table rules in Settings
          </Link>
        </div>
      </div>
    </ChartToolbar>
  );
}
