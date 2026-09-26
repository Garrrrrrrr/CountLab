"use client";

import { count, money, riskLabel } from "@/lib/blackjack/labFormat";
import { NumberField } from "@/components/ui";
import { LabSelect, StepCard } from "./parts";
import type { Lab } from "./useLab";

/** The choices of acceptable risk, with a word on what each means. */
export const TARGET_RISKS = [
  { value: 0.01, label: "1% (very cautious)" },
  { value: 0.025, label: "2.5%" },
  { value: 0.05, label: "5% (common choice)" },
  { value: 0.1, label: "10%" },
  { value: 0.135, label: "13.5% (full Kelly)" },
  { value: 0.25, label: "25% (aggressive)" },
] as const;

/** Step 2: the money in play and the risk the player accepts with it. */
export function BankrollCard({ lab }: { lab: Lab }) {
  const { config, edit } = lab;
  const units = config.baseBet > 0 ? count(config.bankroll / config.baseBet) : "—";
  return (
    <StepCard id="bankroll" step={2} title="Bankroll" summary={`${money(config.bankroll)} · ${money(config.baseBet)} unit · ${riskLabel(config.targetRisk)} target risk`}>
      <div className="lab-fields lab-fields-3">
        <NumberField label="Available bankroll" value={config.bankroll} min={1} prefix="$" analyticsField="available_bankroll" help="Money set aside only for blackjack." onValueChange={(bankroll) => edit({ bankroll })} />
        <NumberField label="Betting unit" value={config.baseBet} min={1} step={1} inputStep="any" prefix="$" analyticsField="unit_amount" help={`Your 1-unit bet, usually the table minimum. Your bankroll is ${units} units.`} onValueChange={(baseBet) => edit({ baseBet })} />
        <LabSelect
          label="Target risk of ruin"
          helpLabel="risk of ruin"
          help="The chance of losing this whole bankroll that you're willing to accept. It sets “Bankroll needed” and the largest unit the Results suggest."
          analyticsField="target_risk_of_ruin"
          value={config.targetRisk}
          onChange={(value) => edit({ targetRisk: Number(value) })}
        >
          {!TARGET_RISKS.some((option) => option.value === config.targetRisk) && <option value={config.targetRisk}>{riskLabel(config.targetRisk)}</option>}
          {TARGET_RISKS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </LabSelect>
      </div>
    </StepCard>
  );
}
