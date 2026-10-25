"use client";
import { RotateCcw } from "lucide-react";
import { track } from "@/lib/analytics/track";
import { DECK_COUNTS, GAME_OPTIONS, type Decks } from "@/lib/blackjack/coefficients";
import { DEFAULT_DEALT, hasAuditedRules, ruleStates, type DoubleRule, type LabConfig } from "@/lib/blackjack/labConfig";
import { dealtPercent, deckLabel } from "@/lib/blackjack/labFormat";
import { RULE_DELTAS } from "@/lib/blackjack/ruleAdjustments";
import { Badge, Button, Callout, Segmented, Toggle } from "@/components/ui";
import { Disclosure, InlineUndo, Note, NumberField, Panel } from "./parts";
import type { Calc } from "./useCalculator";

/** Points of edge, signed, with a true minus: "+0.22", "−1.39". */
export const points = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value * 100).toFixed(2)}`;

/** The published estimate behind each rule that differs from the simulated game. */
function ruleDelta(config: LabConfig, key: string) {
  switch (key) {
    case "soft17": return RULE_DELTAS.dealerStandsSoft17;
    case "payout": return RULE_DELTAS.blackjackPays6to5;
    case "double": return config.doubleRule === "9to11" ? RULE_DELTAS.doubleOnly9to11 : RULE_DELTAS.doubleOnly10to11;
    case "das": return RULE_DELTAS.noDoubleAfterSplit;
    case "rsa": return RULE_DELTAS.noResplitAces;
    case "surrender": return RULE_DELTAS.noLateSurrender;
    case "holeCard": return RULE_DELTAS.europeanNoHoleCard;
    default: return 0;
  }
}

/**
 * The table: shoe, penetration, pace and how hands are played stay in view;
 * the seven table rules are summarized in one line and edited behind
 * "Change rules", because most games match the simulated ruleset.
 */
export function GameCard({ calc, rulesOpen, onRulesOpenChange, className }: { calc: Calc; rulesOpen: boolean; onRulesOpenChange: (open: boolean) => void; className?: string }) {
  const { config, edit, pricing } = calc;
  const rules = ruleStates(config);
  const audited = hasAuditedRules(config);
  const differing = rules.filter((rule) => rule.differs);
  const toggle = (field: "doubleAfterSplit" | "resplitAces", input: string) => (checked: boolean) => {
    edit({ [field]: checked });
    track("cvcx_input_changed", { input });
  };
  const options = GAME_OPTIONS[config.decks];
  return (
    <Panel id="game" eyebrow="Step 1" title="The game" sub="The shoe, how deep it is dealt, how fast the table plays and how you play your hands." className={className}>
      <div className="grid gap-5 sm:grid-cols-2">
        <Segmented<Decks>
          label="Decks"
          name="number_of_decks"
          value={config.decks}
          onChange={(decks) => edit({ decks, dealt: DEFAULT_DEALT[decks] })}
          options={DECK_COUNTS.map((decks) => ({ value: decks, label: String(decks), hint: deckLabel(decks) }))}
        />
        <div className="min-w-0">
          <Segmented
            label="Penetration"
            name="penetration"
            value={config.dealt}
            onChange={(dealt) => edit({ dealt })}
            options={options.map((option) => ({ value: option.dealt, label: `${dealtPercent(config.decks, option.dealt)}%`, hint: `${option.dealt} of ${deckLabel(config.decks)} dealt` }))}
          />
          <Note className="mt-1.5">
            <span className="tnum font-medium text-ink-2">{config.dealt} of {deckLabel(config.decks)}</span> dealt before the shuffle. Deeper is better for counters.
          </Note>
        </div>
        <NumberField
          label="Rounds per hour"
          value={config.handsPerHour}
          min={1}
          max={1000}
          suffix="rounds/hr"
          field="rounds_per_hour"
          hint="About 100 at a typical table; fewer when it is full."
          onChange={(handsPerHour) => edit({ handsPerHour })}
        />
        <div className="min-w-0">
          <Segmented
            label="How you play hands"
            name="play_variation"
            value={config.useIndices ? "indices" : "basic"}
            onChange={(value) => edit({ useIndices: value === "indices" })}
            options={[{ value: "indices", label: "Hi-Lo + indices" }, { value: "basic", label: "Basic strategy" }]}
          />
          <Note className="mt-1.5">Indices are Wong&apos;s count-based changes to basic strategy, the ones on the charts. Both ways are simulated separately.</Note>
        </div>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <p className="text-sm font-medium text-ink-2">Table rules</p>
          {audited ? (
            <Badge tone="pos">Simulated exactly</Badge>
          ) : (
            <Badge tone="warn">Estimated</Badge>
          )}
        </div>
        {audited ? (
          <p className="tnum mt-1.5 text-sm text-ink">{rules.map((rule) => rule.short).join(" · ")}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Rules that differ from the simulated game">
            {differing.map((rule) => (
              <li key={rule.key}><Badge tone="warn">{rule.label}<span className="sr-only">, differs from the simulated game</span></Badge></li>
            ))}
            <li className="inline-flex h-6 items-center text-xs text-ink-3">Other rules as simulated</li>
          </ul>
        )}

        <Disclosure summary="Change rules" section="table_rules" open={rulesOpen} onToggle={onRulesOpenChange} className="mt-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <Segmented label="Dealer on soft 17" name="dealer_hits_soft_17" value={config.dealerHitsSoft17 ? "h17" : "s17"} onChange={(value) => edit({ dealerHitsSoft17: value === "h17" })} options={[{ value: "h17", label: "Hits (H17)" }, { value: "s17", label: "Stands (S17)" }]} />
            <Segmented<1.5 | 1.2> label="Blackjack pays" name="blackjack_payout" value={config.blackjackPayout} onChange={(blackjackPayout) => edit({ blackjackPayout })} options={[{ value: 1.5, label: "3:2" }, { value: 1.2, label: "6:5" }]} />
            <Segmented<DoubleRule> label="Doubling allowed on" name="double_rule" value={config.doubleRule} onChange={(doubleRule) => edit({ doubleRule })} options={[{ value: "any2", label: "Any two" }, { value: "9to11", label: "9–11" }, { value: "10to11", label: "10–11" }]} />
            <Segmented label="Dealer hole card" name="strategy" value={config.europeanNoHoleCard ? "enhc" : "peek"} onChange={(value) => edit({ europeanNoHoleCard: value === "enhc" })} options={[{ value: "peek", label: "Peeks" }, { value: "enhc", label: "No hole card" }]} />
            <Segmented label="Surrender" name="surrender" value={config.earlySurrender ? "early" : config.lateSurrender ? "late" : "none"}
              onChange={(value) => { edit({ lateSurrender: value !== "none", earlySurrender: value === "early" }); track("cvcx_input_changed", { input: "surrender" }); }}
              options={[{ value: "none", label: "None" }, { value: "late", label: "Late" }, { value: "early", label: "Early vs 10" }]} />
          </div>
          <Note className="mt-1.5">With no hole card (European), doubles and splits are lost to a dealer blackjack. Early surrender vs 10 is decided before the dealer checks for blackjack; against an ace it is late.</Note>
          <div className="mt-3 divide-y divide-line rounded-xl border border-line px-3">
            <Toggle className="min-h-12 py-1" label="Double after split" checked={config.doubleAfterSplit} onChange={toggle("doubleAfterSplit", "double_after_splitting")} />
            <Toggle className="min-h-12 py-1" label="Resplit aces" checked={config.resplitAces} onChange={toggle("resplitAces", "resplitting_aces")} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" className="min-h-11 sm:min-h-9" disabled={audited} onClick={() => calc.resetRules("rules")} icon={<RotateCcw size={15} aria-hidden />}>
              Reset to simulated rules
            </Button>
            <InlineUndo calc={calc} source="rules" />
          </div>
        </Disclosure>

        {pricing.estimated && (
          <Callout tone="warn" title="Estimated results" className="mt-3">
            The simulations behind these numbers use H17 · 3:2 · DAS · RSA · late or early surrender · dealer peeks. For the rules that differ, a published estimate shifts the edge by the same amount at every count:
            <ul className="tnum mt-1.5 space-y-0.5">
              {differing.map((rule) => <li key={rule.key}>{rule.label}: {points(ruleDelta(config, rule.key))} points</li>)}
            </ul>
            <p className="mt-1.5">Total {points(pricing.ruleAdjustment)} points. Treat these results as directional.</p>
          </Callout>
        )}
      </div>
    </Panel>
  );
}
