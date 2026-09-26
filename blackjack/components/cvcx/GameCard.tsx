"use client";

import { track } from "@/lib/analytics/track";
import { GAME_OPTIONS } from "@/lib/blackjack/coefficients";
import { hasAuditedRules, ruleStates, type DoubleRule } from "@/lib/blackjack/labConfig";
import { dealtPercent, percent } from "@/lib/blackjack/labFormat";
import { Callout, GhostButton, HelpTip, NumberField, Switch } from "@/components/ui";
import { LabSegmented, StepCard } from "./parts";
import type { Lab } from "./useLab";

/**
 * Step 1: the table. Shoe, penetration, pace and play mode stay in view; the
 * seven table rules are summarized in one line and edited behind "Change
 * rules", because most players leave them at the audited game.
 */
export function GameCard({ lab, rulesOpen, onRulesOpenChange }: { lab: Lab; rulesOpen: boolean; onRulesOpenChange: (open: boolean) => void }) {
  const { config, edit, model } = lab;
  const rules = ruleStates(config);
  const audited = hasAuditedRules(config);
  const setSwitch = (field: "doubleAfterSplit" | "resplitAces" | "lateSurrender", input: string) => (checked: boolean) => {
    edit({ [field]: checked });
    // Switches are buttons, so autocapture never sees them change.
    track("cvcx_input_changed", { input });
  };
  return (
    <StepCard id="game" step={1} title="Game" summary={`${config.decks} decks · ${config.dealt} dealt (${dealtPercent(config.decks, config.dealt)}%) · Hi-Lo`}>
      <div className="lab-fields">
        <LabSegmented
          label="Decks"
          name="decks"
          analyticsField="number_of_decks"
          fullWidth
          className="lab-seg"
          value={String(config.decks)}
          onChange={(value) => { const decks = Number(value) as 6 | 8; edit({ decks, dealt: decks === 6 ? 4.5 : 6 }); }}
          options={[{ value: "6", label: "6 decks" }, { value: "8", label: "8 decks" }]}
        />
        <LabSegmented
          label="Penetration"
          name="penetration"
          analyticsField="penetration"
          fullWidth
          className="lab-seg"
          help="How many decks are dealt before the shuffle, and that share of the shoe. Deeper is better for counters."
          value={String(config.dealt)}
          onChange={(value) => edit({ dealt: Number(value) })}
          options={GAME_OPTIONS[config.decks].map((option) => ({
            value: String(option.dealt),
            ariaLabel: `${option.dealt} of ${config.decks} decks dealt, ${dealtPercent(config.decks, option.dealt)}%`,
            label: <span className="flex flex-col items-center leading-tight"><span>{option.dealt}</span><span className="text-[.68rem] font-medium opacity-80">{dealtPercent(config.decks, option.dealt)}%</span></span>,
          }))}
        />
        <NumberField label="Rounds per hour" value={config.handsPerHour} min={1} suffix="rounds/hr" analyticsField="rounds_per_hour" help="About 100 at a typical table; fewer when it's full." onValueChange={(handsPerHour) => edit({ handsPerHour })} />
        <LabSegmented
          label="How you play hands"
          name="play-variation"
          analyticsField="play_variation"
          fullWidth
          className="lab-seg"
          help="Indices are the count-based changes to basic strategy from the H17 Pro chart. Basic strategy ignores the count when playing each hand. Both are separately audited."
          value={config.useIndices ? "indices" : "basic"}
          onChange={(value) => edit({ useIndices: value === "indices" })}
          options={[{ value: "indices", label: "Hi-Lo with indices" }, { value: "basic", label: "Basic strategy only" }]}
        />
      </div>

      <div className="mt-5 border-t border-[var(--rule)] pt-4">
        <p className="text-[.8rem] font-medium tracking-[.01em] text-[var(--ink-muted)]">Table rules</p>
        {audited ? (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm">
            <span className="font-semibold">Standard rules</span>
            <span className="font-data text-[var(--ink-muted)]">{rules.filter((rule) => rule.key !== "double").map((rule) => rule.short).join(" · ")}</span>
            <span className="inline-flex items-center text-[var(--accent)]">(audited)<HelpTip label="the standard rules">H17: the dealer hits soft 17. 3:2: blackjack pays 3 to 2. DAS: double after splitting. RSA: resplit aces. LS: late surrender. Peek: the dealer checks for blackjack first. Doubling is allowed on any two cards. These are the rules the results were simulated with.</HelpTip></span>
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Rules that differ from the audited game">
            {rules.filter((rule) => rule.differs).map((rule) => (
              <li key={rule.key} className="inline-flex min-h-8 items-center rounded-full border border-[var(--warning)] px-3 text-xs font-semibold text-[var(--warning)]">
                {rule.label}<span className="sr-only">, differs from the audited game</span>
              </li>
            ))}
            <li className="inline-flex min-h-8 items-center text-xs text-[var(--ink-muted)]">Other rules standard</li>
          </ul>
        )}

        <details open={rulesOpen} onToggle={(event) => onRulesOpenChange(event.currentTarget.open)} data-analytics-section="table_rules" className="group mt-2 min-w-0">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg text-sm font-semibold text-[var(--ink)] outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-[var(--focus)] [&::-webkit-details-marker]:hidden">
            <i className="fa-solid fa-chevron-right text-[.65rem] text-[var(--ink-muted)] transition-transform group-open:rotate-90" aria-hidden="true" />
            Change rules
          </summary>
          <div className="lab-fields mt-2">
            <LabSegmented label="Dealer on soft 17" name="soft-17" analyticsField="dealer_hits_soft_17" fullWidth className="lab-seg" value={config.dealerHitsSoft17 ? "h17" : "s17"} onChange={(value) => edit({ dealerHitsSoft17: value === "h17" })} options={[{ value: "h17", label: "Hits (H17)" }, { value: "s17", label: "Stands (S17)" }]} />
            <LabSegmented label="Blackjack pays" name="payout" analyticsField="blackjack_payout" fullWidth className="lab-seg" value={String(config.blackjackPayout)} onChange={(value) => edit({ blackjackPayout: Number(value) as 1.5 | 1.2 })} options={[{ value: "1.5", label: "3:2" }, { value: "1.2", label: "6:5" }]} />
            <LabSegmented<DoubleRule> label="Doubling allowed on" name="double-rule" analyticsField="double_rule" fullWidth className="lab-seg" value={config.doubleRule} onChange={(doubleRule) => edit({ doubleRule })} options={[{ value: "any2", label: "Any two cards" }, { value: "9to11", label: "9–11 only" }, { value: "10to11", label: "10–11 only" }]} />
            <LabSegmented label="Dealer hole card" name="hole-card" analyticsField="strategy" fullWidth className="lab-seg" help="With a hole card the dealer peeks for blackjack before you act. With no hole card (European), doubles and splits are lost to a dealer blackjack." value={config.europeanNoHoleCard ? "enhc" : "peek"} onChange={(value) => edit({ europeanNoHoleCard: value === "enhc" })} options={[{ value: "peek", label: "Peeks (American)" }, { value: "enhc", label: "No hole card (European)" }]} />
            <Switch label="Double after split" checked={config.doubleAfterSplit} onChange={setSwitch("doubleAfterSplit", "double_after_splitting")} />
            <Switch label="Resplit aces" checked={config.resplitAces} onChange={setSwitch("resplitAces", "resplitting_aces")} />
            <Switch label="Late surrender" checked={config.lateSurrender} onChange={setSwitch("lateSurrender", "late_surrender")} />
          </div>
          <GhostButton size="compact" disabled={audited} onClick={lab.resetRules} className="mt-4">
            <i className="fa-solid fa-rotate-left mr-2" aria-hidden="true" />Reset to audited rules
          </GhostButton>
        </details>

        {model.estimated && (
          <Callout tone="warn" title="Estimated results" className="mt-3">
            Some rules differ from the audited game, so the edge is adjusted by {percent(model.ruleAdjustment, 2, true).replace("%", "")} percentage points using published estimates. Treat these results as directional.
          </Callout>
        )}
      </div>
    </StepCard>
  );
}
