"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, SegmentedControl } from "@/components/ui";
import type { SegmentOption } from "@/components/ui";
import { deckChoice, decksForChoice, rulesSummary } from "@/lib/blackjack/referenceChartModel";
import type { ChartView, DeckChoice } from "@/lib/blackjack/referenceChartModel";
import type { StrategyChartRules } from "@/lib/blackjack/strategyChart";
import type { SurrenderRule } from "@/lib/statistics/storage";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { useHydrated } from "@/lib/useMediaQuery";
import { ChartToolbar, JumpRail } from "./ChartToolbar";
import { SavedRuleNote } from "./SavedRuleNote";

/** On phones the label sits left of its options; from tablets up it sits above them, so every rule fits one row. */
const RULE_LAYOUT = "grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 md:grid-cols-1 md:justify-items-start md:gap-y-1";

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
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];
const SURRENDER_OPTIONS: ReadonlyArray<SegmentOption<SurrenderRule>> = [
  { value: "none", label: "None", ariaLabel: "No surrender" },
  { value: "late", label: "Late", ariaLabel: "Late surrender (LS)" },
  { value: "early", label: "Early vs 10", ariaLabel: "Early surrender vs 10 (ES10)" },
];
const DOUBLE_OPTIONS: ReadonlyArray<SegmentOption<StrategyChartRules["doubleRule"]>> = [
  { value: "any", label: "Any two cards" },
  { value: "9-11", label: "Hard 9–11" },
  { value: "10-11", label: "Hard 10–11" },
];
const HOLE_CARD_OPTIONS: ReadonlyArray<SegmentOption<"peek" | "enhc">> = [
  { value: "peek", label: "Dealer peeks (US)" },
  { value: "enhc", label: "No hole card (ENHC)", ariaLabel: "No hole card, European (ENHC)" },
];

const enable = <T extends string>(options: ReadonlyArray<SegmentOption<T>>, disabled: boolean) =>
  options.map((option) => ({ ...option, disabled: disabled || option.disabled }));

function CountBadge({ count, label }: { count: number; label: string }) {
  if (!count) return null;
  return <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--ink)] px-1 text-[.68rem] font-bold text-[var(--paper)]"><span aria-hidden="true">{count}</span><span className="sr-only">{label}</span></span>;
}

/**
 * The table rules, always in view beside the chart they change. On phones
 * they fold into a "Table rules" button at the start of a rail of section
 * links, and open in place under it.
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
  const [panelOpen, setPanelOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const rulesButton = useRef<HTMLButtonElement>(null);
  const locked = !hydrated;

  const openPanel = (open: boolean) => {
    setPanelOpen(open);
    onPanelChange?.(open);
  };
  const closePanel = () => {
    openPanel(false);
    rulesButton.current?.focus();
  };
  useEffect(() => {
    if (!panelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPanelOpen(false);
      onPanelChange?.(false);
      rulesButton.current?.focus();
    };
    addEventListener("keydown", onKeyDown);
    return () => removeEventListener("keydown", onKeyDown);
  }, [panelOpen, onPanelChange]);

  const summary = rulesSummary(rules, "short");
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
        className="md:hidden"
        items={sections}
        leading={(
          <button
            ref={rulesButton}
            type="button"
            disabled={locked}
            aria-expanded={panelOpen}
            aria-controls="reference-rules"
            onClick={() => openPanel(!panelOpen)}
            className="pressable inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-[var(--ink)] bg-[var(--ink)] px-3 font-data text-xs font-semibold text-[var(--paper)] disabled:opacity-60"
          >
            <i className="fa-solid fa-sliders" aria-hidden="true" />
            <span><span className="sr-only">Table rules: </span>{summary}</span>
            {hydrated && <CountBadge count={differences} label={` (${differences} changed from your saved rules)`} />}
            <i className={`fa-solid fa-chevron-down text-[.6rem] transition-transform ${panelOpen ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
        )}
      />
      <div
        id="reference-rules"
        className={`${panelOpen ? "flex" : "hidden"} max-h-[60dvh] flex-col gap-2.5 overflow-y-auto overscroll-contain pb-2 pt-2.5 md:flex md:max-h-none md:flex-row md:flex-wrap md:items-end md:gap-x-4 md:gap-y-2 md:overflow-visible md:p-0`}
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
        <div className="md:flex md:items-end md:gap-2 md:self-stretch xl:border-l xl:border-[var(--rule)] xl:pl-4">
          <SegmentedControl
            label="Surrender"
            size="compact"
            className={RULE_LAYOUT}
            value={rules.surrender}
            onChange={onSurrender}
            options={enable(SURRENDER_OPTIONS, locked || loading)}
            help="Surrender gives up half your bet instead of playing the hand. Late (LS): offered after the dealer checks for blackjack. Early vs 10 (ES10): offered before that check when the dealer shows a 10, and late against an ace. Saved to your table rules, so the drills use it too."
          />
          <SavedRuleNote savedAt={savedAt} signedIn={Boolean(user)} />
        </div>
        <button
          type="button"
          disabled={locked}
          aria-expanded={moreOpen}
          aria-controls="reference-more-rules"
          onClick={() => setMoreOpen((open) => !open)}
          className="pressable inline-flex min-h-11 items-center gap-2 self-start rounded-lg px-2 text-sm font-semibold text-[var(--ink)] hover:bg-overlay/[.06] disabled:opacity-40 md:min-h-9 md:self-auto [@media(pointer:coarse)]:min-h-11"
        >
          More rules
          {hydrated && <CountBadge count={moreRulesChanged} label=" changed" />}
          <i className={`fa-solid fa-chevron-down text-[.6rem] text-[var(--ink-muted)] transition-transform ${moreOpen ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        {hydrated && differences > 0 && (
          <Button variant="quiet" size="compact" enterAction={false} onClick={onReset} className="inline-flex items-center gap-2 self-start md:ml-auto md:self-auto [@media(pointer:coarse)]:min-h-11">
            <i className="fa-solid fa-rotate-left text-xs" aria-hidden="true" />
            {hasSavedRules ? "Reset to my rules" : "Reset to defaults"}
          </Button>
        )}
        <div id="reference-more-rules" className={`${moreOpen ? "flex" : "hidden"} flex-col gap-2.5 border-t border-[var(--rule)] pt-2.5 md:basis-full md:flex-row md:flex-wrap md:items-end md:gap-x-4 md:gap-y-2 md:pt-2`}>
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
          <Link href="/settings" onClick={() => { if (!user) continueAsGuest(); }} className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--accent)] underline-offset-2 hover:underline md:ml-auto md:min-h-9">
            Edit saved table rules in Settings
          </Link>
        </div>
        <div className="flex justify-end md:hidden">
          <Button size="compact" enterAction={false} onClick={closePanel} className="[@media(pointer:coarse)]:min-h-11">Done</Button>
        </div>
      </div>
    </ChartToolbar>
  );
}
