import { DEFAULT_ADVANTAGE_RULES } from "./advantage";
import { templateHandSchedule, type CvcxTemplateConfig } from "./cvcxLibrary";

/** The rules a saved Calculator scenario describes, on the analysis engine's defaults. */
export function scenarioRules(config: CvcxTemplateConfig) {
  return { ...DEFAULT_ADVANTAGE_RULES, decks: config.decks, penetration: config.dealt / config.decks, dealerHitsSoft17: config.dealerHitsSoft17, doubleAfterSplit: config.doubleAfterSplit, resplitAces: config.resplitAces, lateSurrender: config.lateSurrender || config.earlySurrender === true, earlySurrender: config.earlySurrender === true, blackjackPayout: config.blackjackPayout, useIndices: config.useIndices !== false };
}

/** A scenario's ramp with every count below its wong-in point sat out, and no bet above its table maximum. */
export const scenarioRamp = (config: CvcxTemplateConfig) => {
  const cap = config.tableMax != null && config.baseBet > 0 ? config.tableMax / config.baseBet : Infinity;
  return config.ramp.map((point) => ({ ...point, units: config.wongInAt !== null && point.trueCount < config.wongInAt ? 0 : Math.min(point.units, cap) }));
};

/** Why a saved scenario cannot be loaded into a tool with fewer supported rules, or undefined when it can. */
export function unsupportedScenario(config: CvcxTemplateConfig, simulation = false) {
  if (config.europeanNoHoleCard || (config.doubleRule && config.doubleRule !== "any2")) return "This tool does not support that hole-card or doubling rule. Keep this scenario in the Calculator.";
  if (config.wongOutAt != null) return "This tool does not model leaving the table at a count. Keep this scenario in the Calculator.";
  if (new Set(templateHandSchedule(config).map((point) => point.hands)).size > 1 && simulation) return "The simulator requires the same number of simultaneous hands at every count. Save a separate scenario with a constant hand count.";
  if (simulation && config.earlySurrender) return "The simulator models late surrender only, not early surrender against a ten. This scenario's rules were not loaded.";
  if (simulation && (!config.dealerHitsSoft17 || !config.doubleAfterSplit || !config.resplitAces || !config.lateSurrender || config.blackjackPayout !== 1.5)) return "The simulator supports the audited H17 / DAS / RSA / late surrender / 3:2 game. This scenario's rules were not loaded.";
  return undefined;
}
