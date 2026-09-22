import { describe, expect, it } from "vitest";
import { directoryGameToLab } from "./labCompatibility";
import type { DirectoryGame } from "./types";

const reportedGame = (overrides: Partial<DirectoryGame> = {}): DirectoryGame => ({
  id: "game", location_id: "location", game_type: "blackjack", availability: "reported",
  decks: 6, decks_cut: 1.5, min_bet: 25, max_bet: 500, currency: "USD",
  payout: "3:2", soft_17: "H17", double_rules: "any_two",
  double_after_split: true, resplit_aces: false, surrender: "late",
  dealer_procedure: "hole_card_peek", dealer_blackjack_wager_treatment: "original_bets_only",
  max_split_hands: null, mid_shoe_entry: "allowed", dealing_method: "shoe",
  shuffle_method: null, extra_rules: { source_codes: ["h17", "ls", "ds", "shoe"], unknown_codes: [] },
  ...overrides,
} as DirectoryGame);

describe("directory to lab compatibility", () => {
  it("transfers a fully modeled game without rounding its cut or minimum", () => {
    const result = directoryGameToLab(reportedGame());
    expect(result.reasons).toEqual([]);
    expect(result.config).toMatchObject({ decks: 6, dealt: 4.5, baseBet: 25, dealerHitsSoft17: true, lateSurrender: true, europeanNoHoleCard: false });
  });

  it("blocks an Alberta original-bets-only no-hole-card game", () => {
    const result = directoryGameToLab(reportedGame({ dealer_procedure: "no_hole_card", dealer_blackjack_wager_treatment: "original_bets_only" }));
    expect(result.config).toBeNull();
    expect(result.reasons.join(" ")).toContain("no-hole-card");
  });

  it("does not replace unsupported rules with nearby audited options", () => {
    const result = directoryGameToLab(reportedGame({ decks_cut: 1.3, currency: "CAD", extra_rules: { source_codes: ["pv"], unknown_codes: [] } }));
    expect(result.config).toBeNull();
    expect(result.reasons.join(" ")).toContain("penetration");
    expect(result.reasons.join(" ")).toContain("USD");
    expect(result.reasons.join(" ")).toContain("pv");
  });

  it("ignores importer provenance defaults when evaluating modeled rules", () => {
    const result = directoryGameToLab(reportedGame({
      extra_rules: {
        source_codes: ["h17", "ls", "ds", "shoe"],
        unknown_codes: [],
        inferred_defaults: { dealer_procedure: "hole_card_peek", dealer_blackjack_wager_treatment: "original_bets_only" },
      },
    }));
    expect(result.reasons).toEqual([]);
  });
});
