import { GAME_OPTIONS } from "@/lib/blackjack/coefficients";
import type { DirectoryGame } from "./types";

export interface DirectoryLabConfig {
  decks: 6 | 8;
  dealt: number;
  baseBet: number;
  dealerHitsSoft17: boolean;
  doubleAfterSplit: boolean;
  resplitAces: boolean;
  lateSurrender: boolean;
  europeanNoHoleCard: boolean;
  blackjackPayout: 1.5 | 1.2;
  doubleRule: "any2" | "9to11" | "10to11";
}

export interface DirectoryLabCompatibility {
  config: DirectoryLabConfig | null;
  reasons: string[];
  notes: string[];
}

const SAFE_SOURCE_CODES = new Set(["h17", "s17", "ds", "rsa", "ls", "enhc", "shoe"]);

/** Only exact, modeled values may enter the lab. No nearest-option rounding. */
export function directoryGameToLab(game: DirectoryGame): DirectoryLabCompatibility {
  const reasons: string[] = [];
  const notes = ["The lab calculates its own counting results. Source-reported house edge and table count are not imported."];

  if (game.game_type !== "blackjack") reasons.push("The lab models conventional blackjack only.");
  if (game.availability !== "reported") reasons.push("This game is not currently reported as available.");
  if (game.decks !== 6 && game.decks !== 8) reasons.push("The lab supports only six- or eight-deck games.");
  const decks = game.decks === 8 ? 8 : 6;
  const dealt = game.decks != null && game.decks_cut != null ? game.decks - game.decks_cut : null;
  if (dealt == null || !GAME_OPTIONS[decks].some((option) => Math.abs(option.dealt - dealt) < 0.000001)) {
    reasons.push("The reported cut does not match one of the lab's audited penetration choices.");
  }
  if (game.currency !== "USD") reasons.push("The lab currently displays and calculates wagers in USD only.");
  if (game.min_bet == null || game.min_bet <= 0) reasons.push("A positive table minimum is required for the lab's betting unit.");
  if (game.soft_17 !== "H17" && game.soft_17 !== "S17") reasons.push("The dealer's soft-17 rule is unknown.");
  if (game.payout !== "3:2" && game.payout !== "6:5") reasons.push("The blackjack payout is unknown or unsupported.");
  if (game.double_after_split == null) reasons.push("The double-after-split rule is unknown.");
  if (game.resplit_aces == null) reasons.push("The resplit-aces rule is unknown.");
  if (game.surrender !== "late" && game.surrender !== "none") reasons.push("The surrender rule is unknown or unsupported.");

  const doubleRule = game.double_rules === "any_two" || game.double_rules === "any2" ? "any2"
    : game.double_rules === "9to11" ? "9to11"
      : game.double_rules === "10to11" ? "10to11" : null;
  if (!doubleRule) reasons.push("The doubling rule is unknown or unsupported.");

  let europeanNoHoleCard = false;
  if (game.dealer_procedure === "no_hole_card") {
    if (game.dealer_blackjack_wager_treatment === "all_bets_lost") europeanNoHoleCard = true;
    else reasons.push("This no-hole-card game's dealer-blackjack wager treatment is unknown or differs from the lab's ENHC model.");
  } else if (game.dealer_procedure !== "hole_card_peek") {
    reasons.push("The dealer blackjack procedure is unknown or unsupported.");
  }

  if (game.max_split_hands != null) reasons.push("The lab cannot represent this game's stated split-hand limit.");
  if (game.mid_shoe_entry === "restricted" || game.mid_shoe_entry === "not_allowed") reasons.push("The lab cannot enforce this game's mid-shoe entry restriction.");
  if (game.dealing_method && game.dealing_method !== "shoe") reasons.push("The lab cannot model this dealing method.");
  if (game.shuffle_method) reasons.push("The lab cannot model this shuffle method.");

  const extra = game.extra_rules ?? {};
  for (const key of Object.keys(extra)) if (key !== "source_codes" && key !== "unknown_codes" && key !== "inferred_defaults") reasons.push(`The lab cannot model the extra rule “${key.replaceAll("_", " ")}.”`);
  const sourceCodes = Array.isArray(extra.source_codes) ? extra.source_codes : [];
  for (const code of sourceCodes) if (typeof code === "string" && !SAFE_SOURCE_CODES.has(code.toLowerCase())) reasons.push(`The lab cannot model source rule “${code}.”`);
  const unknownCodes = Array.isArray(extra.unknown_codes) ? extra.unknown_codes : [];
  if (unknownCodes.length) reasons.push("The source contains unresolved rule codes.");
  if (game.mid_shoe_entry == null || game.mid_shoe_entry === "unknown") notes.push("Mid-shoe entry is unverified. Check it before using an entry strategy in the lab.");
  if (game.max_split_hands == null) notes.push("The split-hand limit is unreported and the lab does not offer a split-limit control.");
  if (!game.dealing_method) notes.push("The dealing method is unverified; confirm it uses a countable shoe.");
  if (game.max_bet != null) notes.push("The lab's bet spread does not enforce this table's maximum bet.");

  if (reasons.length) return { config: null, reasons, notes };
  return {
    config: {
      decks,
      dealt: dealt!,
      baseBet: game.min_bet!,
      dealerHitsSoft17: game.soft_17 === "H17",
      doubleAfterSplit: game.double_after_split!,
      resplitAces: game.resplit_aces!,
      lateSurrender: game.surrender === "late",
      europeanNoHoleCard,
      blackjackPayout: game.payout === "6:5" ? 1.2 : 1.5,
      doubleRule: doubleRule!,
    },
    reasons,
    notes,
  };
}
