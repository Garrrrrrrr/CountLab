export const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const;
export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
export interface Card {
  rank: Rank;
  suit: Suit;
}
export type Action = "H" | "S" | "D" | "P" | "R";
export interface BlackjackRules {
  decks: number;
  dealerHitsSoft17: boolean;
  doubleAfterSplit: boolean;
  resplitAces: boolean;
  lateSurrender: boolean;
  doubleRule?: "any" | "9-11" | "10-11";
}
export const DEFAULT_RULES: BlackjackRules = {
  decks: 6,
  dealerHitsSoft17: true,
  doubleAfterSplit: true,
  resplitAces: true,
  lateSurrender: true,
  doubleRule: "any",
};
