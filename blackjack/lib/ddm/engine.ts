export type DDMRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type DDMSuit = "c" | "d" | "h" | "s";
export type DDMAction = "H" | "S" | "D";
export type StrategyPlane = "first" | "hard" | "soft" | "ace";

export interface DDMCard {
  id: number;
  rank: DDMRank;
  suit: DDMSuit;
  /** 1 through 13, so a table can show J/Q/K instead of four identical tens. */
  pip?: number;
}

export interface HandValue {
  total: number;
  hardTotal: number;
  soft: boolean;
  bust: boolean;
}

export interface Deviation {
  plane: Exclude<StrategyPlane, "soft" | "ace">;
  row: number;
  upcard: DDMRank;
  threshold: number;
  direction: 1 | -1;
  action: DDMAction;
  baseAction: DDMAction;
}

export interface Recommendation {
  action: DDMAction;
  baseAction: DDMAction;
  plane: StrategyPlane;
  row: number;
  deviation?: Deviation;
}

export const ACTION_NAMES: Record<DDMAction, string> = {
  H: "Hit",
  S: "Stand",
  D: "Double",
};

export const UPCARDS: DDMRank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const FIRST_ROWS: Record<number, string> = {
  2: "HHHHHDDHHH",
  3: "HHHHHDHHHH",
  4: "HHHHHDHHHH",
  5: "HHHHHHHHHH",
  6: "HHHHHHHHHH",
  7: "HHHHHHHHHH",
  8: "HHHHDDDHHH",
  9: "HHDDDDDDHH",
  10: "DDDDDDDDDD",
};

const HARD_ROWS: Record<number, string> = {
  4: "HHHHHDHHHH",
  5: "HHHHHHHHHH",
  6: "HHHHHHHHHH",
  7: "HHHHHHHHHH",
  8: "HHHHDDDHHH",
  9: "HHDDDDDDHH",
  10: "HDDDDDDDDH",
  11: "DDDDDDDDDD",
  12: "HHHHSSHHHH",
  13: "HHSSSSHHHH",
  14: "HSSSSSHHHH",
  15: "HSSSSSHHHH",
  16: "HSSSSSHHHH",
  17: "SSSSSSSSSS",
};

const SOFT_ROWS: Record<number, string> = {
  13: "HHHDDDDDHH",
  14: "HHHHDDDHHH",
  15: "HHHHDDHHHH",
  16: "HHHHHDHHHH",
  17: "HHHHDDDHHH",
  18: "HSSSDDSSHH",
  19: "SSSSSSSSSS",
};

export const STRATEGY_TABLES = {
  first: FIRST_ROWS,
  hard: HARD_ROWS,
  soft: SOFT_ROWS,
} as const;

export const TOP_DEVIATIONS: Deviation[] = [
  { plane: "hard", row: 14, upcard: 3, threshold: -5, direction: -1, action: "H", baseAction: "S" },
  { plane: "hard", row: 12, upcard: 6, threshold: -3, direction: -1, action: "H", baseAction: "S" },
  { plane: "hard", row: 15, upcard: 4, threshold: -8, direction: -1, action: "H", baseAction: "S" },
  { plane: "hard", row: 14, upcard: 4, threshold: -6, direction: -1, action: "H", baseAction: "S" },
  { plane: "hard", row: 12, upcard: 5, threshold: -1, direction: -1, action: "H", baseAction: "S" },
  { plane: "hard", row: 16, upcard: 10, threshold: 7, direction: 1, action: "S", baseAction: "H" },
  { plane: "hard", row: 14, upcard: 5, threshold: -7, direction: -1, action: "H", baseAction: "S" },
  { plane: "first", row: 9, upcard: 4, threshold: -5, direction: -1, action: "H", baseAction: "D" },
  { plane: "first", row: 9, upcard: 6, threshold: -8, direction: -1, action: "H", baseAction: "D" },
  { plane: "first", row: 2, upcard: 6, threshold: -3, direction: -1, action: "H", baseAction: "D" },
  { plane: "hard", row: 13, upcard: 4, threshold: -3, direction: -1, action: "H", baseAction: "S" },
  { plane: "hard", row: 13, upcard: 6, threshold: -6, direction: -1, action: "H", baseAction: "S" },
  { plane: "hard", row: 16, upcard: 2, threshold: -7, direction: -1, action: "H", baseAction: "S" },
  { plane: "first", row: 9, upcard: 5, threshold: -6, direction: -1, action: "H", baseAction: "D" },
  { plane: "first", row: 8, upcard: 5, threshold: -2, direction: -1, action: "H", baseAction: "D" },
  { plane: "hard", row: 15, upcard: 3, threshold: -6, direction: -1, action: "H", baseAction: "S" },
  { plane: "hard", row: 9, upcard: 5, threshold: -7, direction: -1, action: "H", baseAction: "D" },
  { plane: "first", row: 6, upcard: 5, threshold: 5, direction: 1, action: "D", baseAction: "H" },
];

export const BETTING_RAMP = [
  { label: "TC ≤ 0", min: -Infinity, units: 1 },
  { label: "TC +1", min: 1, units: 3 },
  { label: "TC +2", min: 2, units: 7 },
  { label: "TC +3", min: 3, units: 11 },
  { label: "TC +4", min: 4, units: 15 },
  { label: "TC +5 or higher", min: 5, units: 16 },
] as const;

export function createShoe(decks = 6): DDMCard[] {
  const cards: DDMCard[] = [];
  let id = 0;
  for (let deck = 0; deck < decks; deck += 1) {
    for (const suit of ["c", "d", "h", "s"] as const) {
      for (let pip = 1; pip <= 13; pip += 1) {
        cards.push({ id: id++, rank: Math.min(pip, 10) as DDMRank, suit, pip });
      }
    }
  }
  return cards;
}

export function shuffled<T>(values: readonly T[], rng: () => number = Math.random): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function hiLoTag(card: DDMCard | DDMRank): number {
  const rank = typeof card === "number" ? card : card.rank;
  if (rank === 1 || rank === 10) return -1;
  if (rank >= 2 && rank <= 6) return 1;
  return 0;
}

export function trueCount(runningCount: number, cardsRemaining: number): number {
  if (cardsRemaining <= 0) return runningCount;
  return Math.floor(runningCount / (cardsRemaining / 52));
}

export function handValue(cards: readonly DDMCard[]): HandValue {
  const hardTotal = cards.reduce((sum, card) => sum + card.rank, 0);
  const soft = cards.some((card) => card.rank === 1) && hardTotal + 10 <= 21;
  const total = hardTotal + (soft ? 10 : 0);
  return { total, hardTotal, soft, bust: hardTotal > 21 };
}

export function isBlackjack(cards: readonly DDMCard[]): boolean {
  return cards.length === 2 && cards.some((card) => card.rank === 1) && cards.some((card) => card.rank === 10);
}

function chartAction(rows: Record<number, string>, row: number, upcard: DDMRank): DDMAction {
  return (rows[row]?.[upcard - 1] ?? "H") as DDMAction;
}

export function recommendAction(cards: readonly DDMCard[], dealerUp: DDMRank, tc: number): Recommendation {
  if (cards.length === 0) throw new Error("A player card is required for a strategy decision.");
  let plane: StrategyPlane;
  let row: number;
  let baseAction: DDMAction;

  if (cards.length === 1 && cards[0].rank === 1) {
    plane = "ace";
    row = 1;
    baseAction = "D";
  } else if (cards.length === 1) {
    plane = "first";
    row = cards[0].rank;
    baseAction = chartAction(FIRST_ROWS, row, dealerUp);
  } else {
    const value = handValue(cards);
    if (value.soft) {
      plane = "soft";
      row = Math.min(19, Math.max(13, value.total));
      baseAction = value.total >= 20 ? "S" : chartAction(SOFT_ROWS, row, dealerUp);
    } else {
      plane = "hard";
      row = Math.min(17, Math.max(4, value.total));
      baseAction = value.total >= 18 ? "S" : chartAction(HARD_ROWS, row, dealerUp);
    }
  }

  const deviation = TOP_DEVIATIONS.find((item) =>
    item.plane === plane &&
    item.row === row &&
    item.upcard === dealerUp &&
    (item.direction === 1 ? tc >= item.threshold : tc <= item.threshold),
  );
  return { action: deviation?.action ?? baseAction, baseAction, plane, row, deviation };
}

export function insuranceRecommended(tc: number): boolean {
  return tc >= 4;
}

export function rampUnits(tc: number): number {
  if (tc >= 5) return 16;
  if (tc >= 4) return 15;
  if (tc >= 3) return 11;
  if (tc >= 2) return 7;
  if (tc >= 1) return 3;
  return 1;
}

export function dealerShouldHit(cards: readonly DDMCard[]): boolean {
  const value = handValue(cards);
  return value.total < 17 || (value.total === 17 && value.soft);
}

export interface SettlementInput {
  player: readonly DDMCard[];
  dealer: readonly DDMCard[];
  wager: number;
  baseBet: number;
  insuranceTaken?: boolean;
}

export interface Settlement {
  main: number;
  insurance: number;
  net: number;
  result: "Win" | "Loss" | "Push";
  detail: string;
}

export function settleRound({ player, dealer, wager, baseBet, insuranceTaken = false }: SettlementInput): Settlement {
  const playerValue = handValue(player);
  const dealerValue = handValue(dealer);
  const playerBlackjack = isBlackjack(player);
  const dealerBlackjack = isBlackjack(dealer);
  const suitedBlackjack = playerBlackjack && player[0].suit === player[1].suit;
  let main: number;
  let detail: string;

  if (dealerBlackjack) {
    main = playerBlackjack ? 0 : -wager;
    detail = playerBlackjack ? "Blackjacks push" : "Dealer blackjack";
  } else if (playerValue.bust) {
    main = -wager;
    detail = "Player bust";
  } else if (playerBlackjack) {
    main = wager * (suitedBlackjack ? 2 : 1.5);
    detail = suitedBlackjack ? "Suited blackjack pays 2:1" : "Blackjack pays 3:2";
  } else if (dealerValue.hardTotal === 22) {
    main = 0;
    detail = "Dealer 22 pushes";
  } else if (dealerValue.bust || playerValue.total > dealerValue.total) {
    main = wager;
    detail = dealerValue.bust ? "Dealer bust" : "Player wins";
  } else if (playerValue.total < dealerValue.total) {
    main = -wager;
    detail = "Dealer wins";
  } else {
    main = 0;
    detail = "Push";
  }

  const insurance = insuranceTaken ? (dealerBlackjack ? baseBet : -baseBet / 2) : 0;
  const net = main + insurance;
  return { main, insurance, net, result: net > 0 ? "Win" : net < 0 ? "Loss" : "Push", detail };
}

export function formatUpcard(rank: DDMRank): string {
  return rank === 1 ? "A" : String(rank);
}
