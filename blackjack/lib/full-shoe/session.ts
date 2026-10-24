/**
 * A whole shoe at the full-shoe table: money, the count, grading and history.
 *
 * The React screen keeps one of these in a ref, calls a method for every tap,
 * and re-renders from its fields; the pauses between dealer steps are the
 * screen's business. Everything that decides a result lives here or in
 * round.ts / grading.ts, so a complete shoe can be played in a unit test.
 */
import { classifyCountError, classifyTrueCountError, type DeckResolution } from "@/lib/blackjack/countingTraining";
import { trayPhotoFor } from "@/lib/blackjack/deckPhotos";
import {
  emptyFullShoeScore,
  gradeFullShoeDecision,
  summarizeFullShoeSession,
  type BetRamp,
  type BetSpreadPreset,
  type FullShoeDecision,
  type FullShoeGradingCategory,
  type FullShoeLiveRound,
  type FullShoeMode,
  type FullShoeReport,
  type FullShoeScore,
} from "@/lib/blackjack/fullShoeSession";
import { runningCount, type TrueCountRounding } from "@/lib/blackjack/hiLo";
import type { LiveEvResult } from "@/lib/blackjack/liveEv";
import type { Action, Card, Rank } from "@/lib/blackjack/types";
import type { CountingErrorCategory, Mistake } from "@/lib/statistics/storage";
import { ACTION_NAMES, signedCount, type TableRules } from "@/lib/strategy";
import {
  carriedTrueCount,
  countCheckDue,
  divisorFor,
  gradeBet,
  gradeCountCheck,
  gradeInsurance,
  gradePlay,
  liveTrueCount,
  type CountCheckDepth,
  type CountCheckFrequency,
  type CountCheckGrade,
} from "./grading";
import {
  applyAction,
  cardsUsed,
  dealerDraw,
  dealerNeedsCard,
  dealRound,
  dealSplitCard,
  extraStake,
  insuranceOffer,
  legalActions,
  MAX_HANDS_PER_SEAT,
  needsSplitCard,
  permissionsFor,
  resolveInsurance,
  revealHole,
  settleRound,
  stakeOnTable,
  visibleCards,
  type Round,
  type Settlement,
  type TableConfig,
} from "./round";

export const SEATS = 5;
export const CENTER_SEAT = 2;
/** The smallest chip. Below this the bankroll cannot make a bet. */
export const MIN_CHIP = 0.5;

export type Speed = "relaxed" | "casino" | "fast";

export interface FullShoeSetup {
  mode: FullShoeMode;
  rules: TableRules;
  resplitAces: boolean;
  blackjackPayout: 1.5 | 1.2;
  penetration: number;
  resolution: DeckResolution;
  rounding: TrueCountRounding;
  bankroll: number;
  unit: number;
  spread: BetSpreadPreset;
  ramp: BetRamp;
  players: number;
  countChecks: CountCheckFrequency;
  countDepth: CountCheckDepth;
  /** Coached only: show the hole card, and grade plays by the exact EV for it. */
  holeCard: "hidden" | "shown";
  stacked: boolean;
  speed: Speed;
  animations: boolean;
  sound: boolean;
}

export interface ShoeLike {
  deal(): Card | undefined;
  cardsRemaining(): number;
  remainingComposition(): Record<Rank, number>;
}

export type GamePhase = "betting" | "count-check" | "dealing" | "insurance" | "playing" | "dealer" | "over";
export type CompletionReason = "shoe-complete" | "ended";

export interface CoachNote {
  id: number;
  ok: boolean;
  title: string;
  detail: string;
  category: FullShoeGradingCategory;
  tc: number;
  credited: boolean;
}

export interface CountCheckState {
  step: "rc" | "decks" | "tc" | "result";
  afterRound: number;
  rc?: number;
  decks?: number;
  result?: CountCheckGrade & { answer: { rc: number; decks?: number; tc?: number } };
}

export type InsuranceChoice = "decline" | "insure" | "even-money";

type Emit = (event: string, properties: Record<string, string | number | boolean>) => void;

const MISTAKE_CAP = 80;
const round2 = (value: number) => Math.round(value * 100) / 100;

const MISTAKE_CATEGORY: Partial<Record<FullShoeGradingCategory, CountingErrorCategory>> = {
  Betting: "bet sizing",
  "Basic Strategy": "playing decision",
  Deviations: "playing decision",
};

export class FullShoeGame {
  readonly table: TableConfig;
  readonly totalCards: number;
  readonly startedAt: number;

  cash: number;
  /** The round being played, or the next one to deal. 1-based. */
  roundNumber = 1;
  /** Running count of every card already in the discard tray. */
  rcBefore = 0;
  /** Cards in the discard tray. */
  discarded = 0;
  phase: GamePhase = "betting";
  round?: Round;
  /** The finished round, left on the felt until the next chip goes down. */
  lastResult?: { round: Round; settlement: Settlement };

  bets: number[] = Array(SEATS).fill(0);
  owners: number[] = Array(SEATS).fill(0);
  selectedSeat = CENTER_SEAT;
  chipHistory: Array<{ seat: number; value: number }> = [];
  lastBets: number[] = Array(SEATS).fill(0);

  score: FullShoeScore = emptyFullShoeScore();
  history: FullShoeLiveRound[] = [];
  mistakes: Mistake[] = [];
  note?: CoachNote;
  countCheck?: CountCheckState;
  /** Checkout only: how far the player's last reported running count was from the real one. */
  carriedOffset?: number;
  endedAt?: number;
  completionReason?: CompletionReason;
  endMessage?: string;
  countChecksAsked = 0;
  deckErrors: number[] = [];

  private record?: FullShoeLiveRound;
  private noteId = 0;
  private emergency?: ShoeLike;

  constructor(
    readonly setup: FullShoeSetup,
    private readonly shoe: ShoeLike,
    private readonly options: { rng?: () => number; now?: () => number; emit?: Emit; makeEmergencyShoe?: () => ShoeLike } = {},
  ) {
    this.table = { rules: { ...setup.rules, noHoleCard: false }, resplitAces: setup.resplitAces, blackjackPayout: setup.blackjackPayout, maxHandsPerSeat: MAX_HANDS_PER_SEAT };
    this.totalCards = setup.rules.decks * 52;
    this.cash = setup.bankroll;
    this.startedAt = this.now();
    this.owners = this.owners.map((_, seat) => seat % Math.max(1, setup.players));
    this.owners[CENTER_SEAT] = 0;
  }

  private now() { return this.options.now?.() ?? Date.now(); }
  private emit(event: string, properties: Record<string, string | number | boolean>) { this.options.emit?.(event, properties); }

  /** A card from the shoe. A shoe that runs dry mid-round borrows from a spare deck rather than stopping the table. */
  private draw = (): Card => {
    const card = this.shoe.deal();
    if (card) return card;
    this.emergency ??= this.options.makeEmergencyShoe?.();
    const spare = this.emergency?.deal();
    if (!spare) throw new Error("The shoe is empty");
    return spare;
  };

  /* ---------------------------------------------------------------- */
  /* The count                                                         */
  /* ---------------------------------------------------------------- */

  get count() { return { resolution: this.setup.resolution, rounding: this.setup.rounding }; }
  get cardsRemaining() { return this.shoe.cardsRemaining(); }
  get rc() { return this.rcBefore + (this.round ? runningCount(visibleCards(this.round)) : 0); }
  get divisor() { return divisorFor(this.cardsRemaining, this.setup.resolution); }
  get tc() { return liveTrueCount(this.rc, this.cardsRemaining, this.count); }
  /** The true count the player is believed to hold, when a checkout count check showed theirs was off. */
  get playerTc() { return this.setup.mode === "checkout" ? carriedTrueCount(this.carriedOffset, this.rc, this.cardsRemaining, this.count) : undefined; }
  get composition() { return this.shoe.remainingComposition(); }
  get cutCard() { return this.totalCards * (1 - this.setup.penetration); }
  get cutReached() { return this.cardsRemaining <= this.cutCard || this.cardsRemaining < 12; }
  get trayPhoto() { return trayPhotoFor(this.discarded / 52); }

  /* ---------------------------------------------------------------- */
  /* Money                                                             */
  /* ---------------------------------------------------------------- */

  get totalBet() { return this.bets.reduce((sum, bet) => sum + bet, 0); }
  get staked() { return this.round ? stakeOnTable(this.round) : 0; }
  /** Bankroll including money on the table. */
  get bankroll() { return this.cash + this.staked; }
  get net() { return round2(this.bankroll - this.setup.bankroll); }
  get rampBet() { return gradeBet({ bets: [0], unit: this.setup.unit, ramp: this.setup.ramp, tc: this.tc, bankroll: this.cash }).expected; }

  /* ---------------------------------------------------------------- */
  /* Betting                                                           */
  /* ---------------------------------------------------------------- */

  private startBetting() {
    if (this.lastResult) this.lastResult = undefined;
  }

  selectSeat(seat: number) {
    if (this.phase !== "betting" || seat < 0 || seat >= SEATS) return;
    this.selectedSeat = seat;
  }

  setOwner(seat: number, owner: number) {
    if (this.phase !== "betting") return;
    this.owners[seat] = Math.max(0, Math.min(this.setup.players - 1, owner));
  }

  canAdd(value: number) { return this.phase === "betting" && round2(this.totalBet + value) <= this.cash + 1e-9; }

  placeChip(value: number) {
    if (!this.canAdd(value)) return false;
    this.startBetting();
    this.bets[this.selectedSeat] = round2(this.bets[this.selectedSeat] + value);
    this.chipHistory.push({ seat: this.selectedSeat, value });
    return true;
  }

  undoChip() {
    const last = this.chipHistory.pop();
    if (!last || this.phase !== "betting") return;
    this.bets[last.seat] = Math.max(0, round2(this.bets[last.seat] - last.value));
  }

  clearBets() {
    if (this.phase !== "betting") return;
    this.bets = Array(SEATS).fill(0);
    this.chipHistory = [];
  }

  get canRepeat() {
    const total = this.lastBets.reduce((sum, bet) => sum + bet, 0);
    return this.phase === "betting" && total > 0 && total <= this.cash;
  }

  repeatBets() {
    if (!this.canRepeat) return;
    this.startBetting();
    this.bets = [...this.lastBets];
    this.chipHistory = [];
  }

  get canDeal() { return this.phase === "betting" && this.totalBet > 0 && this.totalBet <= this.cash + 1e-9; }

  /** Grades the bet, takes it, and deals. The phase is "dealing" until `dealt()`. */
  deal() {
    if (!this.canDeal) return;
    const active = this.bets.map((amount, seat) => ({ seat, owner: this.owners[seat], amount })).filter((bet) => bet.amount > 0);
    const tc = this.tc;
    const rc = this.rc;
    const grade = gradeBet({ bets: active.map((bet) => bet.amount), unit: this.setup.unit, ramp: this.setup.ramp, tc, bankroll: this.cash, playerTc: this.playerTc });
    this.record = {
      round: this.roundNumber,
      dealerCards: [],
      playerHands: [],
      bet: this.totalBet,
      runningCountBefore: rc,
      trueCountBefore: tc,
      netResult: 0,
      decisions: [],
      decksBefore: this.divisor,
    };
    this.grade("Betting", grade.ok, {
      title: grade.ok ? (grade.credited ? "Bet matches your count" : "Bet on the ramp") : "Bet off the ramp",
      question: `Bet before round ${this.roundNumber}`,
      chosen: grade.chosen,
      correct: grade.correct,
      explanation: grade.explanation,
      tc,
      credited: grade.credited,
    });
    this.emit("full_shoe_hand_dealt", { round: this.roundNumber, totalWager: this.totalBet, spots: active.length, spread: this.setup.spread, expectedWager: grade.expected, betOk: grade.ok, tc });
    this.lastBets = [...this.bets];
    this.cash = round2(this.cash - this.totalBet);
    this.bets = Array(SEATS).fill(0);
    this.chipHistory = [];
    this.lastResult = undefined;
    this.round = dealRound(this.table, active, this.draw);
    this.phase = "dealing";
  }

  /** The deal animation is over: hand the table to the players (or straight to the dealer). */
  dealt() {
    if (this.phase !== "dealing" || !this.round) return;
    this.phase = this.round.phase;
  }

  /* ---------------------------------------------------------------- */
  /* Insurance                                                         */
  /* ---------------------------------------------------------------- */

  get insurance() { return this.round && this.phase === "insurance" ? insuranceOffer(this.round) : undefined; }

  chooseInsurance(choice: InsuranceChoice) {
    const offer = this.insurance;
    if (!offer || !this.round) return;
    const stake = choice === "insure" ? offer.full : choice === "even-money" ? offer.evenMoney : 0;
    if (stake > this.cash + 1e-9) return;
    const tc = this.tc;
    const evenMoney = offer.blackjacks > 0 && (choice === "even-money" || offer.others === 0);
    const grade = gradeInsurance({ took: stake > 0, tc, playerTc: this.playerTc, evenMoney });
    this.grade("Deviations", grade.ok, {
      title: grade.ok ? (grade.take ? `${evenMoney ? "Even money" : "Insurance"} is right here` : `No ${evenMoney ? "even money" : "insurance"} is right`) : grade.take ? `${evenMoney ? "Even money" : "Insurance"} was right` : `Skip ${evenMoney ? "even money" : "insurance"} here`,
      question: `${evenMoney ? "Even money" : "Insurance"} against an ace, round ${this.roundNumber}`,
      chosen: grade.chosen,
      correct: grade.correct,
      explanation: grade.explanation,
      tc,
      credited: grade.credited,
      upcard: this.round.dealer[0],
    });
    this.emit(choice === "even-money" ? "full_shoe_even_money_decision" : "full_shoe_insurance_decision", { take: stake > 0, correct: grade.take, ok: grade.ok, tc, stake });
    this.cash = round2(this.cash - stake);
    if (this.record) this.record.insurance = stake;
    this.round = resolveInsurance(this.round, stake);
    this.phase = this.round.phase;
  }

  /* ---------------------------------------------------------------- */
  /* Playing                                                           */
  /* ---------------------------------------------------------------- */

  get activeHand() { return this.round && this.phase === "playing" ? this.round.hands[this.round.active] : undefined; }
  get legal(): Action[] { return this.round && this.phase === "playing" ? legalActions(this.table, this.round, this.cash) : []; }
  get waitingForSplitCard() { return Boolean(this.round && needsSplitCard(this.round)); }

  /**
   * Plays an action on the active hand. `ev` is the composition EV for this
   * exact decision, passed only when the hole card is shown in coached mode:
   * then the best EV play is the answer, and any play within the Monte Carlo
   * margin of it counts as right.
   */
  act(action: Action, ev?: LiveEvResult) {
    const round = this.round;
    const hand = this.activeHand;
    if (!round || !hand || !this.legal.includes(action)) return false;
    const tc = this.tc;
    const permissions = permissionsFor(this.table, round, this.cash);
    const upcard = round.dealer[0];
    const grade = gradePlay({ cards: hand.cards, upcard, rules: this.table.rules, permissions, chosen: action, tc, playerTc: this.playerTc });
    let ok = grade.ok, correct = grade.correct, explanation = grade.explanation, credited = grade.credited;
    if (ev && ev.evs[action] !== undefined) {
      const best = ev.bestAction;
      const margin = 1.96 * Math.hypot(ev.standardErrors[best] ?? 0, ev.standardErrors[action] ?? 0);
      ok = action === best || (ev.evs[action]! >= (ev.evs[best] ?? 0) - margin);
      correct = ok ? action : best;
      credited = false;
      const parts = this.legal.map((option) => `${ACTION_NAMES[option]} ${ev.evs[option] !== undefined ? `${ev.evs[option]! >= 0 ? "+" : "−"}${Math.abs(ev.evs[option]!).toFixed(3)}` : "—"}`).join(" · ");
      explanation = `With the hole card showing, the EV of each play from the cards left: ${parts}. Best: ${ACTION_NAMES[best].toLowerCase()}.`;
    }
    const name = ACTION_NAMES[action];
    this.grade(grade.category, ok, {
      title: ok ? (credited ? `${name} matches your count` : `${name} is right`) : `${ACTION_NAMES[correct]} was right`,
      question: `${grade.question}, round ${this.roundNumber}`,
      chosen: name,
      correct: ACTION_NAMES[correct],
      explanation,
      tc,
      credited,
      cards: [...hand.cards],
      upcard,
      seat: hand.seat,
    });
    this.emit("full_shoe_playing_decision", { action, expected: correct, ok, evAssisted: Boolean(ev), total: hand.cards.length, tc });
    this.cash = round2(this.cash - extraStake(round, action));
    this.round = applyAction(this.table, round, action, this.draw);
    this.phase = this.round.phase;
    return true;
  }

  dealSplitCard() {
    if (!this.round || !needsSplitCard(this.round)) return;
    this.round = dealSplitCard(this.table, this.round, this.draw);
    this.phase = this.round.phase;
  }

  /* ---------------------------------------------------------------- */
  /* Dealer                                                            */
  /* ---------------------------------------------------------------- */

  get holeRevealed() { return Boolean(this.round?.holeRevealed); }

  revealHole() {
    if (!this.round || this.phase !== "dealer") return;
    this.round = revealHole(this.round);
  }

  get dealerNeedsCard() { return Boolean(this.round && this.phase === "dealer" && dealerNeedsCard(this.table, this.round)); }

  dealerDraw() {
    if (!this.round || !this.dealerNeedsCard) return;
    this.round = dealerDraw(this.round, this.draw);
  }

  /** Pays the round, files it, and moves on to a count check, the next bet, or the end of the shoe. */
  settle(): Settlement | undefined {
    const round = this.round;
    if (!round || this.phase !== "dealer") return undefined;
    const settled = round.holeRevealed ? round : revealHole(round);
    const settlement = settleRound(this.table, settled);
    this.cash = round2(this.cash + settlement.returned);
    const results = new Map(settlement.hands.map((result) => [result.id, result]));
    const record: FullShoeLiveRound = {
      ...(this.record ?? { round: this.roundNumber, bet: 0, runningCountBefore: this.rcBefore, trueCountBefore: 0, decisions: [] }),
      dealerCards: [...settled.dealer],
      playerHands: settled.hands.map((hand) => ({
        cards: [...hand.cards], bet: hand.bet, net: results.get(hand.id)?.net ?? 0, surrendered: hand.status === "surrendered",
        seat: hand.seat, owner: hand.owner, doubled: hand.doubled, fromSplit: hand.fromSplit, outcome: results.get(hand.id)?.outcome,
      })),
      netResult: settlement.net,
      bankrollAfter: this.cash,
    } as FullShoeLiveRound;
    this.history.push(record);
    this.record = undefined;
    this.discarded += cardsUsed(settled);
    this.rcBefore += runningCount([...settled.hands.flatMap((hand) => hand.cards), ...settled.dealer]);
    this.round = undefined;
    this.lastResult = { round: settled, settlement };
    this.emit("full_shoe_hand_settled", { round: this.roundNumber, net: settlement.net, finalBankroll: this.cash, reachedCut: this.cutReached, dealerTotal: settlement.dealerTotal, dealerBust: settlement.dealerBust, dealerNatural: settlement.dealerBlackjack });
    const finished = this.roundNumber;
    this.roundNumber += 1;
    if (this.cash < MIN_CHIP) this.finish("shoe-complete", "The bankroll is gone.");
    else if (this.cutReached) this.finish("shoe-complete", "The cut card came out.");
    else if (countCheckDue(this.setup.countChecks, finished, this.options.rng)) {
      this.countCheck = { step: "rc", afterRound: finished };
      this.phase = "count-check";
    } else this.phase = "betting";
    return settlement;
  }

  /* ---------------------------------------------------------------- */
  /* Count checks                                                      */
  /* ---------------------------------------------------------------- */

  /** One answer at the current step: running count, then (for a true-count check) decks left, then true count. */
  submitCount(value: number) {
    const check = this.countCheck;
    if (this.phase !== "count-check" || !check || !Number.isFinite(value)) return;
    if (check.step === "rc") {
      check.rc = Math.trunc(value);
      if (this.setup.countDepth === "true") { check.step = "decks"; return; }
      return this.gradeCount();
    }
    if (check.step === "decks") {
      if (value <= 0) return;
      check.decks = value;
      check.step = "tc";
      return;
    }
    if (check.step === "tc") return this.gradeCount(Math.trunc(value));
  }

  private gradeCount(tc?: number) {
    const check = this.countCheck!;
    const answer = { rc: check.rc!, decks: check.decks, tc };
    const result = gradeCountCheck({ rc: this.rc, cardsRemaining: this.cardsRemaining, totalDecks: this.setup.rules.decks, photoDiscarded: this.trayPhoto?.discarded, count: this.count, answer });
    this.countChecksAsked += 1;
    const after = check.afterRound;
    this.grade("Running count", result.rcOk, {
      title: result.rcOk ? "Running count right" : "Running count off",
      question: `Running count after round ${after}`,
      chosen: signedCount(answer.rc),
      correct: signedCount(result.expected.rc),
      explanation: result.rcExplanation,
      tc: result.expected.tc,
      runningCount: result.expected.rc,
      mistakeCategory: classifyCountError({ expected: result.expected.rc, actual: answer.rc }),
    }, after);
    if (tc !== undefined) {
      if (answer.decks !== undefined) this.deckErrors.push(Math.abs(answer.decks - this.cardsRemaining / 52));
      this.grade("True count", Boolean(result.tcOk), {
        title: result.tcOk ? "True count right" : "True count off",
        question: `True count after round ${after}`,
        chosen: `${signedCount(tc)}${answer.decks !== undefined ? ` (÷ ${answer.decks})` : ""}`,
        correct: `${signedCount(result.expected.tc)} (÷ ${result.expected.decks})`,
        explanation: result.tcExplanation ?? "",
        tc: result.expected.tc,
        runningCount: result.expected.rc,
        mistakeCategory: result.decksOk === false ? "deck estimate" : classifyTrueCountError(result.expected.rc, result.expected.decks, result.expected.tc, tc),
      }, after);
    }
    this.emit("full_shoe_drill_count_submitted", { ok: result.rcOk, actual: answer.rc, expected: result.expected.rc, round: after });
    // Checkout says nothing, so the player keeps the count they reported; coached feedback corrects it.
    this.carriedOffset = this.setup.mode === "checkout" ? answer.rc - result.expected.rc : undefined;
    check.result = { ...result, answer };
    if (this.setup.mode === "coached") check.step = "result";
    else this.closeCountCheck();
  }

  closeCountCheck() {
    if (this.phase !== "count-check") return;
    this.countCheck = undefined;
    this.phase = "betting";
  }

  /* ---------------------------------------------------------------- */
  /* Grading bookkeeping                                               */
  /* ---------------------------------------------------------------- */

  private grade(category: FullShoeGradingCategory, ok: boolean, detail: {
    title: string; question: string; chosen: string; correct: string; explanation: string; tc: number; credited?: boolean;
    cards?: Card[]; upcard?: Card; seat?: number; runningCount?: number; mistakeCategory?: CountingErrorCategory;
  }, attachToRound?: number) {
    this.score = gradeFullShoeDecision(this.score, category, ok);
    const decision: FullShoeDecision = {
      category, chosen: detail.chosen, correct: detail.correct, ok, explanation: detail.explanation, trueCount: detail.tc,
      question: detail.question, cards: detail.cards, upcard: detail.upcard, runningCount: detail.runningCount ?? this.rc,
      credited: detail.credited || undefined, seat: detail.seat,
    };
    const target = attachToRound !== undefined ? this.history.find((round) => round.round === attachToRound) : this.record;
    target?.decisions.push(decision);
    if (!ok && this.mistakes.length < MISTAKE_CAP) {
      this.mistakes.push({
        question: detail.question,
        userAnswer: detail.chosen,
        correctAnswer: detail.correct,
        explanation: detail.explanation,
        category: detail.mistakeCategory ?? MISTAKE_CATEGORY[category],
        context: { round: attachToRound ?? this.roundNumber, trueCount: detail.tc, mode: this.setup.mode, grade: category },
      });
    }
    this.note = { id: ++this.noteId, ok, title: detail.title, detail: detail.explanation, category, tc: detail.tc, credited: Boolean(detail.credited) };
  }

  /* ---------------------------------------------------------------- */
  /* The end                                                           */
  /* ---------------------------------------------------------------- */

  private finish(reason: CompletionReason, message: string) {
    if (this.phase === "over") return;
    this.completionReason = reason;
    this.endMessage = message;
    this.endedAt = this.now();
    this.phase = "over";
    this.countCheck = undefined;
  }

  /** The player stops early. Money still on the table goes back to the bankroll, as the old table did. */
  end() {
    if (this.phase === "over") return;
    const refund = this.staked;
    this.cash = round2(this.cash + refund);
    this.round = undefined;
    this.record = undefined;
    this.bets = Array(SEATS).fill(0);
    this.emit("full_shoe_ended", { round: this.roundNumber, decisions: this.score.total, handsPlayed: this.history.length, unresolvedStakeRefunded: refund, finalBankroll: this.cash, durationMs: Math.max(0, this.now() - this.startedAt) });
    this.finish("ended", "You ended the shoe.");
  }

  get durationMs() { return Math.max(0, (this.endedAt ?? this.now()) - this.startedAt); }

  report(): FullShoeReport {
    return summarizeFullShoeSession(this.score, this.history, this.durationMs, this.net);
  }

  /** The metrics the old table stored on its drill session, plus the count checks. */
  sessionMetrics(): Record<string, string | number | boolean> {
    const { rules, unit, ramp } = this.setup;
    const meanDeckError = this.deckErrors.length ? Number((this.deckErrors.reduce((sum, value) => sum + value, 0) / this.deckErrors.length).toFixed(3)) : undefined;
    return {
      rules: `${rules.decks}D ${rules.hitSoft17 ? "H17" : "S17"} ${rules.das ? "DAS" : "No DAS"} ${this.setup.resplitAces ? "RSA" : "No RSA"} ${rules.surrender}`,
      elapsedSeconds: Math.round(this.durationMs / 1000),
      handsPlayed: this.history.length,
      netResult: this.net,
      mode: this.setup.mode,
      stacked: this.setup.stacked,
      decks: rules.decks,
      penetration: this.setup.penetration,
      divisorResolution: this.setup.resolution,
      rounding: this.setup.rounding,
      completionReason: this.completionReason ?? "ended",
      blackjackPayout: this.setup.blackjackPayout,
      doubling: rules.doubling,
      players: this.setup.players,
      countChecks: this.countChecksAsked,
      countCheckFrequency: this.setup.countChecks,
      holeCard: this.setup.holeCard,
      rampTc1: round2(unit * ramp[1]),
      rampTc2: round2(unit * ramp[2]),
      rampTc3: round2(unit * ramp[3]),
      rampTc4: round2(unit * ramp[4]),
      rampTc5: round2(unit * ramp[5]),
      rampTc6Plus: round2(unit * ramp[6]),
      ...(meanDeckError !== undefined ? { meanAbsoluteDeckError: meanDeckError } : {}),
    };
  }

  sessionTags(): string[] {
    return [this.setup.mode, this.setup.stacked ? "stacked" : "random", this.setup.rules.surrender];
  }
}
