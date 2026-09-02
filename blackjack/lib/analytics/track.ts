/**
 * Compatibility adapter for product code that predates the typed analytics
 * contract. It translates legacy actions into the small canonical event set;
 * no legacy event name or raw financial value reaches storage. New code should
 * import `analytics` or the feature hooks from `@/lib/analytics` directly.
 */
import { analytics } from "./client";
import { bucketMoney, bucketRate, bucketTrueCount } from "./redact";
import type { DrillId } from "./types";

type LegacyProperties = Record<string, unknown>;
let activePractice: { drill: DrillId; startedAt: number; answered: number; target: number; rulesPreset?: string } | undefined;
const calculatorRuns = new Map<string, number>();

function recordCalculatorRun(calculator: "game_bankroll_lab" | "session_simulator"): number {
  const next = (calculatorRuns.get(calculator) ?? 0) + 1;
  calculatorRuns.set(calculator, next);
  if (next > 1) analytics.track("calculation_repeated", { calculator, run_number: next });
  return next;
}

const text = (p: LegacyProperties, key: string, fallback?: string): string =>
  typeof p[key] === "string" ? (p[key] as string) : (fallback ?? "unknown");
const number = (p: LegacyProperties, key: string, fallback = 0) =>
  typeof p[key] === "number" && Number.isFinite(p[key]) ? (p[key] as number) : fallback;
const truth = (p: LegacyProperties, key: string) => Boolean(p[key]);

const DRILLS: Record<string, DrillId> = {
  "Running Count": "running_count",
  "True Count": "true_count",
  "Deck Estimation": "deck_estimation",
  "Basic Strategy": "basic_strategy",
  Deviations: "deviations",
  "H17 Chart": "h17_chart",
  "Full Shoe": "full_shoe",
  "Test Out": "test_out",
};

const drill = (value: unknown, fallback: DrillId): DrillId =>
  typeof value === "string" ? (DRILLS[value] ?? fallback) : fallback;

const answer = (
  drillId: DrillId,
  p: LegacyProperties,
  defaults: { category?: string; scenario?: string; user?: unknown; correct?: unknown } = {},
) => {
  if (activePractice?.drill === drillId) activePractice.answered += 1;
  const response = number(p, "responseTimeMs", number(p, "response_time_ms", 0));
  analytics.track("question_answered", {
    drill: drillId,
    correct: "ok" in p ? truth(p, "ok") : truth(p, "correct"),
    category: text(p, "category", defaults.category),
    scenario: text(p, "scenario", defaults.scenario),
    user_answer: String(p.userAnswer ?? defaults.user ?? "").slice(0, 60) || undefined,
    correct_answer: String(p.correctAnswer ?? defaults.correct ?? "").slice(0, 60) || undefined,
    response_time_ms: Math.max(0, response),
    attempt: Math.max(1, number(p, "attempt", number(p, "round", 1))),
    streak: Math.max(0, number(p, "streak", 0)),
    true_count: "tc" in p ? bucketTrueCount(number(p, "tc")) : undefined,
    deviation_available: "isDeviation" in p ? truth(p, "isDeviation") : undefined,
    rules_preset: activePractice?.drill === drillId ? activePractice.rulesPreset : undefined,
  });
};

export function track(event: string, properties: LegacyProperties = {}): void {
  switch (event) {
    case "page_view":
      return; // AnalyticsProvider owns SPA page views.
    case "drill_started": {
      const drillId = drill(properties.drill, "running_count");
      if (activePractice?.drill === drillId) analytics.track("practice_restarted", {
        drill: drillId,
        questions_answered: activePractice.answered,
        duration_ms: Date.now() - activePractice.startedAt,
      });
      analytics.track("practice_started", {
        drill: drillId,
        mode: text(properties, "mode", text(properties, "preset", undefined)),
        difficulty: text(properties, "focus", undefined),
        question_target: number(properties, "questionTarget", number(properties, "amount", 0)) || undefined,
        decks: number(properties, "decks", 0) || undefined,
        penetration: number(properties, "penetration", 0) || undefined,
        rules_preset: text(properties, "rulesPreset", undefined),
        dealer_rule: text(properties, "dealerRule", undefined) as "H17" | "S17" | undefined,
        das: "das" in properties ? truth(properties, "das") : undefined,
        rsa: "rsa" in properties ? truth(properties, "rsa") : undefined,
        surrender: text(properties, "surrender", undefined),
        counting_system: "Hi-Lo",
      });
      activePractice = {
        drill: drillId,
        startedAt: Date.now(),
        answered: 0,
        target: number(properties, "questionTarget", number(properties, "amount", 0)),
        rulesPreset: text(properties, "rulesPreset", undefined),
      };
      return;
    }
    case "running_count_answered":
      answer("running_count", properties, {
        scenario: `${text(properties, "group")}_card_${number(properties, "expected") < 0 ? "negative" : number(properties, "expected") > 0 ? "positive" : "zero"}`,
        user: properties.actual,
        correct: properties.expected,
      });
      return;
    case "question_presented":
      analytics.track("question_presented", {
        drill: drill(properties.drill, "running_count"),
        category: text(properties, "category", undefined),
        scenario: text(properties, "scenario", undefined),
        attempt: Math.max(1, number(properties, "attempt", 1)),
      });
      return;
    case "answer_skipped":
      analytics.track("answer_skipped", {
        drill: drill(properties.drill, "running_count"),
        category: text(properties, "category", undefined),
        scenario: text(properties, "scenario", undefined),
        attempt: Math.max(1, number(properties, "attempt", 1)),
        elapsed_ms: Math.max(0, number(properties, "elapsedMs")),
      });
      return;
    case "difficulty_changed":
      analytics.track("difficulty_changed", {
        drill: drill(properties.drill, "running_count"),
        from: text(properties, "from", undefined),
        to: text(properties, "to"),
      });
      return;
    case "practice_mode_changed":
      analytics.track("practice_mode_changed", {
        drill: drill(properties.drill, "running_count"),
        from: text(properties, "from", undefined),
        to: text(properties, "to"),
      });
      return;
    case "true_count_answered":
      answer("true_count", properties, { scenario: text(properties, "category", text(properties, "focus")) });
      return;
    case "deck_estimation_answered":
      answer("deck_estimation", properties, {
        scenario: `resolution_${text(properties, "resolution")}`,
        user: properties.actual,
        correct: properties.expected,
      });
      return;
    case "basic_strategy_answered":
      answer("basic_strategy", properties, { scenario: text(properties, "scenario"), user: properties.chosen, correct: properties.correct });
      return;
    case "deviation_answered":
      answer("deviations", properties, {
        scenario: `${text(properties, "hand")}_v_${text(properties, "dealer")}`,
        user: properties.chosen,
        correct: properties.correct,
      });
      return;
    case "full_shoe_drill_bet_submitted":
      answer("full_shoe", { ...properties, ok: truth(properties, "deckOk") }, { category: "deck_estimate", scenario: "pre_round_decks", user: properties.deckAnswer, correct: properties.expectedDecks });
      answer("full_shoe", { ...properties, ok: truth(properties, "tcOk") }, { category: "true_count", scenario: "pre_round_true_count", user: properties.tcAnswer, correct: properties.tc });
      answer("full_shoe", { ...properties, ok: truth(properties, "betOk") }, { category: "bet_sizing", scenario: "bet_ramp" });
      return;
    case "full_shoe_drill_insurance_decision":
      answer("full_shoe", properties, { category: "insurance", scenario: "insurance", user: properties.play });
      return;
    case "full_shoe_drill_playing_decision":
      answer("full_shoe", properties, { category: "playing_decision", scenario: text(properties, "scenario"), user: properties.play, correct: properties.correctPlay });
      return;
    case "full_shoe_drill_count_submitted":
      answer("full_shoe", properties, { category: "running_count", scenario: "round_end_count" });
      return;
    case "drill_session_completed": {
      const questions = number(properties, "questions");
      const accuracy = number(properties, "accuracy");
      analytics.track("practice_completed", {
        drill: drill(properties.drill, "running_count"),
        questions,
        correct: number(properties, "correct", Math.round((questions * accuracy) / 100)),
        accuracy,
        best_streak: number(properties, "bestStreak"),
        duration_ms: number(properties, "durationMs", number(properties, "averageResponseTime") * questions),
        rules_preset: activePractice?.rulesPreset,
      });
      const feature = drill(properties.drill, "running_count");
      analytics.track("feature_completed", { feature, category: "training", duration_ms: number(properties, "durationMs", number(properties, "averageResponseTime") * questions) });
      if (activePractice?.drill === feature) activePractice = undefined;
      return;
    }
    case "uth_hand_dealt":
      analytics.track("hand_started", { game: "ultimate_texas_holdem", wager_bucket: bucketMoney(number(properties, "ante") * 2 + number(properties, "trips")) });
      return;
    case "uth_decision":
      analytics.track("hand_decision", { game: "ultimate_texas_holdem", street: text(properties, "street"), action: text(properties, "choice"), recommended_action: text(properties, "expected"), correct: truth(properties, "ok"), solver_assisted: text(properties, "method") === "exact" });
      return;
    case "uth_hand_resolved":
      analytics.track("hand_completed", { game: "ultimate_texas_holdem", outcome: text(properties, "result"), net_bucket: bucketMoney(number(properties, "net")) });
      return;
    case "chase_flush_hand_dealt":
      analytics.track("hand_started", { game: "chase_the_flush", wager_bucket: bucketMoney(number(properties, "ante") * 2) });
      return;
    case "chase_flush_decision":
      analytics.track("hand_decision", { game: "chase_the_flush", street: text(properties, "street"), action: text(properties, "choice"), recommended_action: text(properties, "expected"), correct: truth(properties, "ok"), solver_assisted: text(properties, "method") === "exact" });
      return;
    case "chase_flush_hand_resolved":
      analytics.track("hand_completed", { game: "chase_the_flush", outcome: text(properties, "result"), net_bucket: bucketMoney(number(properties, "net")) });
      return;
    case "ddm_hand_dealt":
      analytics.track("hand_started", { game: "double_down_madness", wager_bucket: bucketMoney(number(properties, "totalWager")), spots: number(properties, "spots"), true_count: bucketTrueCount(number(properties, "tc")), bet_on_ramp: truth(properties, "betOk"), decks: number(properties, "decks") });
      return;
    case "ddm_hand_settled":
      analytics.track("hand_completed", { game: "double_down_madness", outcome: truth(properties, "reachedCut") ? "shoe_complete" : "settled", net_bucket: bucketMoney(number(properties, "net", 0)), ended_session: truth(properties, "reachedCut") });
      return;
    case "ddm_insurance_decision":
      analytics.track("hand_decision", { game: "double_down_madness", street: "insurance", action: truth(properties, "take") ? "take" : "decline", recommended_action: truth(properties, "correct") ? "take" : "decline", correct: truth(properties, "ok"), true_count: bucketTrueCount(number(properties, "tc")) });
      return;
    case "ddm_playing_decision":
      analytics.track("hand_decision", { game: "double_down_madness", street: "play", action: text(properties, "action"), recommended_action: text(properties, "expected"), correct: truth(properties, "ok"), true_count: bucketTrueCount(number(properties, "tc")), hand_total: number(properties, "total"), deviation_available: truth(properties, "deviation") });
      return;
    case "full_shoe_hand_dealt":
      analytics.track("hand_started", { game: "blackjack", wager_bucket: bucketMoney(number(properties, "totalWager")), spots: number(properties, "spots"), true_count: bucketTrueCount(number(properties, "tc")), bet_on_ramp: truth(properties, "betOk") });
      return;
    case "full_shoe_hand_settled":
      analytics.track("hand_completed", { game: "blackjack", outcome: truth(properties, "reachedCut") ? "shoe_complete" : "settled", net_bucket: bucketMoney(number(properties, "net", 0)), ended_session: truth(properties, "reachedCut") });
      return;
    case "full_shoe_insurance_decision":
      analytics.track("hand_decision", { game: "blackjack", street: "insurance", action: truth(properties, "take") ? "take" : "decline", recommended_action: truth(properties, "correct") ? "take" : "decline", correct: truth(properties, "ok"), true_count: bucketTrueCount(number(properties, "tc")) });
      return;
    case "full_shoe_even_money_decision":
      analytics.track("hand_decision", { game: "blackjack", street: "even_money", action: "take", recommended_action: truth(properties, "correct") ? "take" : "decline", correct: truth(properties, "correct"), true_count: bucketTrueCount(number(properties, "tc")) });
      return;
    case "full_shoe_playing_decision":
      analytics.track("hand_decision", { game: "blackjack", street: "play", action: text(properties, "action"), recommended_action: text(properties, "expected"), correct: truth(properties, "ok"), true_count: bucketTrueCount(number(properties, "tc")), hand_total: number(properties, "total"), solver_assisted: truth(properties, "evAssisted") });
      return;
    case "session_simulation_run":
      recordCalculatorRun("session_simulator");
      analytics.track("simulation_started", { mode: "session", rounds: number(properties, "rounds"), paths: number(properties, "paths") });
      return;
    case "shoe_simulation_run":
      recordCalculatorRun("session_simulator");
      analytics.track("simulation_started", { mode: "shoe", hands: number(properties, "handsToSimulate") });
      return;
    case "session_simulation_completed":
      analytics.track("simulation_completed", { mode: "session", duration_ms: number(properties, "durationMs"), hourly_ev_bucket: bucketRate(number(properties, "expectedHourlyEv", number(properties, "evPerHour"))), risk_of_ruin_bucket: text(properties, "riskOfRuinBucket", undefined) });
      analytics.track("feature_completed", { feature: "session_simulator", category: "analysis", duration_ms: number(properties, "durationMs") });
      return;
    case "shoe_simulation_completed":
      analytics.track("simulation_completed", { mode: "shoe", duration_ms: number(properties, "durationMs"), hourly_ev_bucket: bucketRate(number(properties, "avPerHour")), hands: number(properties, "totalHands") });
      analytics.track("feature_completed", { feature: "session_simulator", category: "analysis", duration_ms: number(properties, "durationMs") });
      return;
    case "simulation_cancelled":
      analytics.track("simulation_cancelled", { mode: text(properties, "mode"), duration_ms: number(properties, "durationMs") });
      return;
    case "simulation_worker_failed":
      analytics.track("api_request_failed", { service: "worker", operation: `${text(properties, "mode")}_simulation`, duration_ms: number(properties, "durationMs"), error_category: "other" });
      return;
    case "settings_saved":
      analytics.track("settings_changed", {
        changed_keys: Array.isArray(properties.changedKeys) ? properties.changedKeys.filter((key): key is string => typeof key === "string") : [],
        decks: number(properties, "decks", 0) || undefined,
      });
      return;
    case "data_exported":
      analytics.track("data_exported", { scope: text(properties, "scope"), records: number(properties, "records", 0) || undefined });
      return;
    case "data_imported":
      analytics.track("data_imported", { scope: text(properties, "scope", "training"), records: number(properties, "records", number(properties, "sessions") + number(properties, "runs")), ok: true });
      return;
    case "data_cleared":
      analytics.track("data_cleared", { scope: text(properties, "scope") });
      return;
    case "cvcx_tested_in_simulator":
      analytics.track("calculation_run", { calculator: "game_bankroll_lab", bankroll_bucket: bucketMoney(number(properties, "bankroll")), unit_bucket: bucketMoney(number(properties, "baseBet")), decks: number(properties, "decks") });
      return;
    case "cvcx_calculation_run":
      recordCalculatorRun("game_bankroll_lab");
      analytics.track("calculation_run", { calculator: "game_bankroll_lab", bankroll_bucket: bucketMoney(number(properties, "bankroll")), unit_bucket: bucketMoney(number(properties, "baseBet")), decks: number(properties, "decks"), penetration: number(properties, "penetration"), spread: text(properties, "spread"), hands_per_hour: number(properties, "handsPerHour") });
      analytics.track("feature_completed", { feature: "game_bankroll_lab", category: "analysis", duration_ms: 0 });
      return;
    case "cvcx_input_changed":
      analytics.track("calculation_input_changed", {
        calculator: "game_bankroll_lab",
        input: text(properties, "input"),
        value_bucket: text(properties, "valueBucket", undefined),
      });
      return;
    case "simulation_input_changed":
      analytics.track("calculation_input_changed", {
        calculator: "session_simulator",
        input: text(properties, "input"),
        value_bucket: text(properties, "valueBucket", undefined),
      });
      return;
    case "cvcx_reset":
      analytics.track("feature_reset", { feature: "game_bankroll_lab", category: "analysis", stage: text(properties, "stage", undefined) });
      return;
    case "cvcx_preset_selected":
      analytics.track("preset_selected", { calculator: "game_bankroll_lab", preset: text(properties, "preset") });
      return;
    case "cvcx_tab_changed":
      {
        const tab = text(properties, "tab");
        analytics.track("tab_changed", { surface: "game_bankroll_lab", tab });
        const subfeature = tab === "viewer" ? "advantage" : tab === "ramp" ? "bet_spread_optimizer" : tab === "risk" ? "bankroll_recommender" : undefined;
        if (subfeature) analytics.track("feature_opened", { feature: subfeature, category: "analysis" });
      }
      return;
    case "cvcx_template_saved":
    case "simulation_template_saved":
    case "journal_session_added":
    case "journal_session_updated":
    case "journal_transaction_added":
    case "journal_bankroll_added":
      analytics.track("result_saved", { feature: event.startsWith("cvcx") ? "game_bankroll_lab" : event.startsWith("journal") ? "session_journal" : "session_simulator", kind: event.replace(/_(saved|added|updated)$/, "") });
      return;
    case "cvcx_template_loaded":
    case "simulation_run_loaded":
    case "journal_prefilled_from_template":
    case "shoe_viewed":
      analytics.track("result_viewed", { feature: event === "shoe_viewed" ? "shoe_explorer" : event.startsWith("cvcx") ? "game_bankroll_lab" : event.startsWith("journal") ? "session_journal" : "session_simulator", kind: event });
      if (event === "cvcx_template_loaded" || event === "simulation_run_loaded") analytics.track("history_viewed", {
        feature: event === "cvcx_template_loaded" ? "game_bankroll_lab" : "session_simulator",
        kind: event,
      });
      return;
    case "cvcx_template_deleted":
    case "journal_session_deleted":
    case "journal_transaction_deleted":
    case "journal_bankroll_deleted":
      analytics.track("data_cleared", { scope: event.replace(/_deleted$/, "") });
      if (event.startsWith("journal")) analytics.track("history_deleted", { feature: "session_journal", kind: event });
      return;
    case "journal_history_viewed":
      analytics.track("history_viewed", { feature: "session_journal", kind: text(properties, "kind", "sessions") });
      return;
    case "result_expanded":
      analytics.track("result_expanded", { feature: text(properties, "feature") as "game_bankroll_lab", section: text(properties, "section") });
      return;
    case "result_copied":
      analytics.track("result_copied", { feature: text(properties, "feature") as "game_bankroll_lab", kind: text(properties, "kind") });
      return;
    case "simulation_comparison_toggled":
      analytics.track("tab_changed", { surface: "session_simulator", tab: "comparison" });
      return;
    case "uth_ev_requested":
      analytics.track("solution_viewed", { feature: "ultimate_texas_holdem", kind: "ev" });
      return;
    case "chase_flush_ev_requested":
      analytics.track("solution_viewed", { feature: "chase_the_flush", kind: "ev" });
      return;
    case "ddm_ev_requested":
      analytics.track("solution_viewed", { feature: "double_down_madness", kind: "ev" });
      return;
    case "ddm_started":
      analytics.track("feature_opened", { feature: "double_down_madness", category: "game" });
      return;
    case "full_shoe_ev_requested":
      analytics.track("solution_viewed", { feature: "blackjack", kind: "ev" });
      return;
    case "full_shoe_started":
      analytics.track("feature_opened", { feature: "blackjack", category: "game" });
      return;
    default:
      if (process.env.NODE_ENV !== "production") console.warn(`[analytics] unmapped legacy event: ${event}`);
  }
}

/** Called by the route provider so legacy drills report a real drop-off. */
export function abandonActivePractice(): void {
  if (!activePractice) return;
  const practice = activePractice;
  activePractice = undefined;
  analytics.track("practice_abandoned", {
    drill: practice.drill,
    questions_answered: practice.answered,
    progress_percent: practice.target ? Math.min(100, Math.round((practice.answered / practice.target) * 100)) : 0,
    duration_ms: Date.now() - practice.startedAt,
    rules_preset: practice.rulesPreset,
  });
}
