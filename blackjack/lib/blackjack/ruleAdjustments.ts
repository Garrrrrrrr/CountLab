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
  doubleOnly9to11: -0.0009,
  doubleOnly10to11: -0.0018,
} as const;

export interface RuleAdjustmentFlags {
  dealerStandsSoft17?: boolean;
  noDoubleAfterSplit?: boolean;
  noResplitAces?: boolean;
  noLateSurrender?: boolean;
  europeanNoHoleCard?: boolean;
  blackjackPays6to5?: boolean;
  doubleOnly9to11?: boolean;
  doubleOnly10to11?: boolean;
}

/** Maps the rules stored on a session/scenario to the flags sumRuleAdjustment expects, so every consumer scores rule departures the same way. */
export function ruleAdjustmentFlagsFromRules(rules: {
  dealerHitsSoft17: boolean;
  doubleAfterSplit: boolean;
  resplitAces: boolean;
  lateSurrender: boolean;
  blackjackPayout: 1.5 | 1.2;
}): Pick<RuleAdjustmentFlags, "dealerStandsSoft17" | "noDoubleAfterSplit" | "noResplitAces" | "noLateSurrender" | "blackjackPays6to5"> {
  return {
    dealerStandsSoft17: !rules.dealerHitsSoft17,
    noDoubleAfterSplit: !rules.doubleAfterSplit,
    noResplitAces: !rules.resplitAces,
    noLateSurrender: !rules.lateSurrender,
    blackjackPays6to5: rules.blackjackPayout === 1.2,
  };
}

export function sumRuleAdjustment(flags: RuleAdjustmentFlags): number {
  let total = 0;
  if (flags.dealerStandsSoft17) total += RULE_DELTAS.dealerStandsSoft17;
  if (flags.noDoubleAfterSplit) total += RULE_DELTAS.noDoubleAfterSplit;
  if (flags.noResplitAces) total += RULE_DELTAS.noResplitAces;
  if (flags.noLateSurrender) total += RULE_DELTAS.noLateSurrender;
  if (flags.europeanNoHoleCard) total += RULE_DELTAS.europeanNoHoleCard;
  if (flags.blackjackPays6to5) total += RULE_DELTAS.blackjackPays6to5;
  if (flags.doubleOnly9to11) total += RULE_DELTAS.doubleOnly9to11;
  if (flags.doubleOnly10to11) total += RULE_DELTAS.doubleOnly10to11;
  return total;
}

export const isEstimated = (flags: RuleAdjustmentFlags): boolean =>
  Object.values(flags).some(Boolean);
