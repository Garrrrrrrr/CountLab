/**
 * CountLab's audited coefficients (see coefficients.ts) are simulated for exactly one ruleset
 * (H17, DAS, RSA, LS, American peek, 3:2), varying only by deck count and penetration. These
 * deltas are well-established literature estimates of each rule's edge impact relative to that
 * baseline, used to approximate other rule combinations without re-simulating them. They are
 * flat, count-independent shifts -- a standard simplification for this kind of quick estimate.
 */
export const RULE_DELTAS = {
  dealerStandsSoft17: 0.0022,
  noDoubleAfterSplit: -0.0014,
  noResplitAces: -0.0003,
  noLateSurrender: -0.0007,
  europeanNoHoleCard: -0.0011,
  blackjackPays6to5: -0.0139,
} as const;

export const DEVIATION_SKILL = {
  beginner: 0.7,
  intermediate: 0.82,
  pro: 0.92,
  perfect: 1,
} as const;

export interface RuleAdjustmentFlags {
  dealerStandsSoft17?: boolean;
  noDoubleAfterSplit?: boolean;
  noResplitAces?: boolean;
  noLateSurrender?: boolean;
  europeanNoHoleCard?: boolean;
  blackjackPays6to5?: boolean;
}

export function sumRuleAdjustment(flags: RuleAdjustmentFlags): number {
  let total = 0;
  if (flags.dealerStandsSoft17) total += RULE_DELTAS.dealerStandsSoft17;
  if (flags.noDoubleAfterSplit) total += RULE_DELTAS.noDoubleAfterSplit;
  if (flags.noResplitAces) total += RULE_DELTAS.noResplitAces;
  if (flags.noLateSurrender) total += RULE_DELTAS.noLateSurrender;
  if (flags.europeanNoHoleCard) total += RULE_DELTAS.europeanNoHoleCard;
  if (flags.blackjackPays6to5) total += RULE_DELTAS.blackjackPays6to5;
  return total;
}

export const isEstimated = (flags: RuleAdjustmentFlags, deviationSkill: number): boolean =>
  Object.values(flags).some(Boolean) || deviationSkill < 1;
