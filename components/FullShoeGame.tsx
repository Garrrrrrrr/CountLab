"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getBasicStrategyDecision } from "@/lib/blackjack/basicStrategy";
import { DEVIATIONS, DEVIATION_ACTION_NAMES, deviationDecision } from "@/lib/blackjack/deviations";
import { calculateHandValue, isBlackjack, isPair, isSoft } from "@/lib/blackjack/hand";
import { signed, trueCount } from "@/lib/blackjack/hiLo";
import { BlackjackShoe } from "@/lib/blackjack/shoe";
import { Action, BlackjackRules, Card } from "@/lib/blackjack/types";
import { PlayingCard } from "./PlayingCard";
import { Button, GhostButton, NumberField, Panel, Select } from "./ui";

type Phase = "setup" | "bet" | "dealing" | "insurance" | "play" | "dealer" | "shoe-end";
type HandStatus = "playing" | "stood" | "busted" | "surrendered";
type Spread = "flat" | "1-8" | "1-12";

interface PlayerHand {
  cards: Card[];
  bet: number;
  spot: number;
  player: number;
  status: HandStatus;
  fromSplit?: boolean;
  splitAces?: boolean;
  awaitingSplitCard?: boolean;
}

interface CoachNote {
  ok: boolean;
  title: string;
  detail: string;
}

const ACTION_NAMES: Record<Action, string> = {
  H: "Hit",
  S: "Stand",
  D: "Double",
  P: "Split",
  R: "Surrender",
};

const spreadUnits = (spread: Spread, tc: number) => {
  if (spread === "flat") return 1;
  if (spread === "1-8") return tc <= 0 ? 1 : [2, 4, 6, 8][Math.min(tc, 4) - 1];
  return tc <= 0 ? 1 : [2, 4, 8, 12][Math.min(tc, 4) - 1];
};

const rankForIndex = (card: Card) => (["J", "Q", "K"].includes(card.rank) ? "10" : card.rank);
const pause = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function sound(kind: "deal" | "chip" | "good" | "bad" | "win", enabled: boolean) {
  if (!enabled) return;
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const frequencies = { deal: 330, chip: 440, good: 660, bad: 180, win: 880 };
    oscillator.type = kind === "bad" ? "sawtooth" : "sine";
    oscillator.frequency.setValueAtTime(frequencies[kind], context.currentTime);
    gain.gain.setValueAtTime(0.055, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.1);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.1);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Audio is enhancement-only.
  }
}

function handLabel(cards: Card[]) {
  const total = calculateHandValue(cards);
  return `${isSoft(cards) ? "Soft " : ""}${total}`;
}

export function FullShoeGame({ active = true }: { active?: boolean }) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [rules, setRules] = useState<BlackjackRules>({
    decks: 6,
    dealerHitsSoft17: true,
    doubleAfterSplit: true,
    resplitAces: true,
    lateSurrender: true,
    doubleRule: "any",
  });
  const [penetration, setPenetration] = useState(0.75);
  const [blackjackPayout, setBlackjackPayout] = useState<1.5 | 1.2>(1.5);
  const [spread, setSpread] = useState<Spread>("1-8");
  const [unit, setUnit] = useState(10);
  const [startingBankroll, setStartingBankroll] = useState(1000);
  const [players, setPlayers] = useState(1);
  const [bankroll, setBankroll] = useState(1000);
  const [wagers, setWagers] = useState<number[]>(() => Array(7).fill(0));
  const [lastWagers, setLastWagers] = useState<number[]>(() => Array(7).fill(0));
  const [selectedSpot, setSelectedSpot] = useState(3);
  const [spotOwners, setSpotOwners] = useState<number[]>(() => Array(7).fill(0));
  const [chipHistory, setChipHistory] = useState<Array<{ spot: number; value: number }>>([]);
  const [dealer, setDealer] = useState<Card[]>([]);
  const [hands, setHands] = useState<PlayerHand[]>([]);
  const [activeHand, setActiveHand] = useState(0);
  const [runningCount, setRunningCount] = useState(0);
  const [discarded, setDiscarded] = useState(0);
  const [round, setRound] = useState(1);
  const [insuranceBet, setInsuranceBet] = useState(0);
  const [note, setNote] = useState<CoachNote>();
  const [roundMessage, setRoundMessage] = useState("Choose your wager to deal the next round.");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [animations, setAnimations] = useState(true);
  const [fastMode, setFastMode] = useState(false);
  const [dealing, setDealing] = useState(false);
  const [stats, setStats] = useState({ correct: 0, total: 0, betErrors: 0, playErrors: 0 });
  const [visibleIntel, setVisibleIntel] = useState<Record<string, boolean>>({});
  const shoe = useRef<BlackjackShoe | undefined>(undefined);
  const bankrollRef = useRef(1000);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  const casinoPause = async (milliseconds: number) => {
    await pause(animations ? milliseconds * (fastMode ? 0.35 : 1) : 40);
    while (!activeRef.current) await pause(100);
  };

  const decksRemaining = shoe.current?.decksRemaining() ?? rules.decks;
  const tc = trueCount(runningCount, Math.max(0.25, decksRemaining), "floor");
  const expectedWager = unit * spreadUnits(spread, tc);
  const totalWager = wagers.reduce((sum, value) => sum + value, 0);
  const occupiedSpots = wagers.filter(Boolean).length;
  const cardsTotal = rules.decks * 52;
  const accuracy = stats.total ? Math.round((stats.correct / stats.total) * 100) : 100;
  const current = hands[activeHand];

  const addVisible = (cards: Card[]) => {
    const delta = cards.reduce((sum, card) => sum + (["2", "3", "4", "5", "6"].includes(card.rank) ? 1 : ["10", "J", "Q", "K", "A"].includes(card.rank) ? -1 : 0), 0);
    setRunningCount((value) => value + delta);
  };

  const changeBankroll = (delta: number) => {
    bankrollRef.current += delta;
    setBankroll(bankrollRef.current);
  };

  const coach = (ok: boolean, title: string, detail: string, category: "bet" | "play") => {
    setNote({ ok, title, detail });
    setStats((value) => ({
      ...value,
      total: value.total + 1,
      correct: value.correct + Number(ok),
      betErrors: value.betErrors + Number(!ok && category === "bet"),
      playErrors: value.playErrors + Number(!ok && category === "play"),
    }));
    sound(ok ? "good" : "bad", soundEnabled);
  };

  const startShoe = () => {
    shoe.current = new BlackjackShoe(rules.decks);
    bankrollRef.current = startingBankroll;
    setBankroll(startingBankroll);
    setRunningCount(0);
    setDiscarded(0);
    setRound(1);
    setHands([]);
    setDealer([]);
    setWagers(Array(7).fill(0));
    setLastWagers(Array(7).fill(0));
    setChipHistory([]);
    setInsuranceBet(0);
    setStats({ correct: 0, total: 0, betErrors: 0, playErrors: 0 });
    setDealing(false);
    setVisibleIntel({});
    setNote(undefined);
    setRoundMessage("Choose your wager. The coach expects the highlighted amount.");
    setPhase("bet");
  };

  const draw = () => shoe.current?.deal();

  const settleRound = (settledHands: PlayerHand[], dealerCards: Card[], insurance = insuranceBet) => {
    const dealerTotal = calculateHandValue(dealerCards);
    const dealerBust = dealerTotal > 21;
    const dealerNatural = isBlackjack(dealerCards);
    let returned = dealerNatural && insurance ? insurance * 3 : 0;
    const outcomes = settledHands.map((hand) => {
      const total = calculateHandValue(hand.cards);
      let label = "Loss";
      if (hand.status === "surrendered") {
        returned += hand.bet / 2;
        label = "Surrender";
      } else if (total > 21) label = "Bust";
      else if (isBlackjack(hand.cards) && !hand.fromSplit && !dealerNatural) {
        returned += hand.bet * (1 + blackjackPayout);
        label = "Blackjack";
      } else if (dealerNatural && isBlackjack(hand.cards) && !hand.fromSplit) {
        returned += hand.bet;
        label = "Push";
      } else if (dealerNatural) label = "Dealer blackjack";
      else if (dealerBust || total > dealerTotal) {
        returned += hand.bet * 2;
        label = "Win";
      } else if (total === dealerTotal) {
        returned += hand.bet;
        label = "Push";
      }
      return `Player ${hand.player + 1}, spot ${hand.spot + 1}${settledHands.filter((item) => item.spot === hand.spot).length > 1 ? ` hand ${settledHands.filter((item) => item.spot === hand.spot).indexOf(hand) + 1}` : ""}: ${label}`;
    });
    const finalBankroll = bankrollRef.current + returned;
    bankrollRef.current = finalBankroll;
    setBankroll(finalBankroll);
    setHands(settledHands);
    setDealer(dealerCards);
    setDiscarded((value) => value + settledHands.reduce((sum, hand) => sum + hand.cards.length, 0) + dealerCards.length);
    const resultMessage = `${outcomes.join(" · ")} · Dealer ${dealerBust ? "busts with " : "has "}${dealerTotal}.`;
    const reachedCut =
      (shoe.current?.cardsRemaining() ?? cardsTotal) <=
      cardsTotal * (1 - penetration);
    setWagers(Array(7).fill(0));
    setChipHistory([]);
    setInsuranceBet(0);
    setDealing(false);
    if (finalBankroll <= 0) {
      setRoundMessage(`${resultMessage} Bankroll exhausted.`);
      setPhase("shoe-end");
    } else if (reachedCut) {
      setRoundMessage(`${resultMessage} Cut card reached.`);
      setPhase("shoe-end");
    } else {
      setRound((value) => value + 1);
      setRoundMessage(`${resultMessage} Place the next wager when ready.`);
      setPhase("bet");
    }
    sound(returned > settledHands.reduce((sum, hand) => sum + hand.bet, 0) ? "win" : "deal", soundEnabled);
  };

  const playDealer = async (settledHands = hands, dealerCards = dealer, insurance = insuranceBet) => {
    setDealing(true);
    setRoundMessage("Dealer prepares to reveal…");
    await casinoPause(720);
    setPhase("dealer");
    setRoundMessage("Dealer reveals the hole card…");
    const nextDealer = [...dealerCards];
    setDealer([...nextDealer]);
    if (nextDealer[1]) {
      addVisible([nextDealer[1]]);
      sound("deal", soundEnabled);
    }
    await casinoPause(680);
    const allDead = settledHands.every((hand) => hand.status === "busted" || hand.status === "surrendered" || (isBlackjack(hand.cards) && !hand.fromSplit));
    while (!allDead) {
      const value = calculateHandValue(nextDealer);
      if (value > 17 || (value === 17 && !(rules.dealerHitsSoft17 && isSoft(nextDealer)))) break;
      setRoundMessage("Dealer draws…");
      await casinoPause(720);
      const card = draw();
      if (!card) break;
      nextDealer.push(card);
      setDealer([...nextDealer]);
      addVisible([card]);
      sound("deal", soundEnabled);
    }
    await casinoPause(520);
    settleRound(settledHands, nextDealer, insurance);
  };

  const beginRound = async () => {
    if (dealing || !shoe.current || totalWager <= 0 || totalWager > bankroll) return;
    const activeBets = wagers.map((bet, spot) => ({ bet, spot })).filter(({ bet }) => bet > 0);
    const betOk = activeBets.every(({ bet }) => bet === expectedWager);
    coach(
      betOk,
      betOk ? "Bet sizing on target" : "Bet spread mismatch",
      betOk
        ? `${spread} calls for ${spreadUnits(spread, tc)} unit${spreadUnits(spread, tc) === 1 ? "" : "s"} ($${expectedWager}) on each occupied spot at TC ${signed(tc)}.`
        : `At TC ${signed(tc)}, your ${spread} ramp calls for $${expectedWager} per occupied spot. Check the highlighted betting circles.`,
      "bet",
    );
    const firstCards = activeBets.map(() => draw());
    const d1 = draw();
    const secondCards = activeBets.map(() => draw());
    const d2 = draw();
    if (!d1 || !d2 || firstCards.some((card) => !card) || secondCards.some((card) => !card)) return;
    const nextHands: PlayerHand[] = activeBets.map(({ bet, spot }, index) => {
      const cards = [firstCards[index] as Card, secondCards[index] as Card];
      return { cards, bet, spot, player: spotOwners[spot], status: calculateHandValue(cards) === 21 ? "stood" : "playing" };
    });
    const nextDealer = [d1, d2];
    changeBankroll(-totalWager);
    setLastWagers([...wagers]);
    setHands(nextHands);
    setDealer(nextDealer);
    const firstPlaying = Math.max(0, nextHands.findIndex((hand) => hand.status === "playing"));
    setActiveHand(firstPlaying);
    setInsuranceBet(0);
    addVisible([...firstCards as Card[], d1, ...secondCards as Card[]]);
    sound("deal", soundEnabled);
    setDealing(true);
    setPhase("dealing");
    setRoundMessage("Dealing around the table…");
    await casinoPause(900 + (activeBets.length * 2 + 1) * 320);
    if (d1.rank === "A") {
      setDealing(false);
      setRoundMessage("Dealer shows an Ace. Make the insurance decision before play.");
      setPhase("insurance");
    } else if (["10", "J", "Q", "K"].includes(d1.rank) && isBlackjack(nextDealer)) {
      await playDealer(nextHands, nextDealer, 0);
    } else if (nextHands.every((hand) => hand.status !== "playing")) {
      await playDealer(nextHands, nextDealer, 0);
    } else {
      setDealing(false);
      setRoundMessage(`Player ${nextHands[firstPlaying].player + 1} · spot ${nextHands[firstPlaying].spot + 1}. The coach checks basic strategy and Hi-Lo index deviations.`);
      setPhase("play");
    }
  };

  const chooseInsurance = async (take: boolean) => {
    if (dealing) return;
    const correct = tc >= 3;
    coach(
      take === correct,
      take === correct ? "Insurance decision correct" : "Insurance deviation missed",
      `Hi-Lo insurance is taken at TC +3 or higher. Current TC is ${signed(tc)}.`,
      "play",
    );
    const maximumInsurance = hands.reduce((sum, hand) => sum + hand.bet / 2, 0);
    const stake = take ? Math.min(maximumInsurance, bankroll) : 0;
    if (stake) changeBankroll(-stake);
    setInsuranceBet(stake);
    setDealing(true);
    setPhase("dealing");
    setRoundMessage("Dealer checks the hole card…");
    await casinoPause(700);
    if (isBlackjack(dealer)) {
      await playDealer(hands, dealer, stake);
    } else if (hands.every((hand) => hand.status !== "playing")) {
      await playDealer(hands, dealer, stake);
    } else {
      setDealing(false);
      setActiveHand(Math.max(0, hands.findIndex((hand) => hand.status === "playing")));
      setRoundMessage(take ? `Insurance placed: $${stake}. Dealer does not have blackjack.` : "No dealer blackjack. Play your hand.");
      setPhase("play");
    }
  };

  const legalActions = (hand: PlayerHand) => {
    const total = calculateHandValue(hand.cards);
    if (total >= 21) return [];
    if (hand.splitAces) {
      return isPair(hand.cards) && hand.cards[0].rank === "A" && rules.resplitAces && bankroll >= hand.bet && hands.filter((item) => item.spot === hand.spot).length < 4 ? ["P" as Action] : [];
    }
    const actions: Action[] = ["H", "S"];
    const doubleAllowed = rules.doubleRule === "any" || (rules.doubleRule === "9-11" && total >= 9 && total <= 11) || (rules.doubleRule === "10-11" && total >= 10 && total <= 11);
    if (hand.cards.length === 2 && bankroll >= hand.bet && doubleAllowed && (!hand.fromSplit || rules.doubleAfterSplit)) actions.push("D");
    if (isPair(hand.cards) && bankroll >= hand.bet && hands.filter((item) => item.spot === hand.spot).length < 4 && (hand.cards[0].rank !== "A" || !hand.fromSplit || rules.resplitAces)) actions.push("P");
    if (rules.lateSurrender && hand.cards.length === 2 && !hand.fromSplit) actions.push("R");
    return actions;
  };

  const expectedAction = (hand: PlayerHand) => {
    const legal = legalActions(hand);
    const basic = getBasicStrategyDecision({ playerCards: hand.cards, dealerUpcard: dealer[0], rules });
    const hardTotal = String(calculateHandValue(hand.cards));
    const deviation = basic.action !== "R" && !isSoft(hand.cards) && !isPair(hand.cards)
      ? DEVIATIONS.find((item) => item.hand === hardTotal && item.dealer === rankForIndex(dealer[0]))
      : undefined;
    const indexed = deviation ? deviationDecision(deviation, tc) : basic.action;
    let action = indexed as Action;
    if (!legal.includes(action)) action = action === "D" ? basic.fallback ?? "H" : action === "R" ? "H" : basic.action;
    if (!legal.includes(action)) action = "H";
    const explanation = deviation
      ? `${deviation.hand} vs ${deviation.dealer} changes from ${DEVIATION_ACTION_NAMES[deviation.normalAction]} to ${DEVIATION_ACTION_NAMES[deviation.deviationAction]} ${deviation.direction === "atOrBelow" ? "at or below" : "at or above"} TC ${signed(deviation.index)}. Current TC: ${signed(tc)}.`
      : basic.explanation;
    return { action, explanation };
  };

  const advance = async (nextHands: PlayerHand[], from: number) => {
    const next = nextHands.findIndex((hand, index) => index > from && hand.status === "playing");
    setHands(nextHands);
    if (next >= 0) {
      await casinoPause(420);
      const nextHand = nextHands[next];
      if (nextHand.awaitingSplitCard) {
        setRoundMessage(`Dealing the second card to player ${nextHand.player + 1}, spot ${nextHand.spot + 1}…`);
        const card = draw();
        if (!card) {
          setDealing(false);
          return;
        }
        nextHand.cards.push(card);
        nextHand.awaitingSplitCard = false;
        addVisible([card]);
        sound("deal", soundEnabled);
        const canResplitAces =
          nextHand.splitAces &&
          card.rank === "A" &&
          rules.resplitAces &&
          nextHands.filter((item) => item.spot === nextHand.spot).length < 4;
        if (nextHand.splitAces && !canResplitAces) {
          nextHand.status = "stood";
          setHands([...nextHands]);
          setActiveHand(next);
          setRoundMessage(`${handLabel(nextHand.cards)} on split aces. Moving on…`);
          await casinoPause(420);
          await advance(nextHands, next);
          return;
        }
        if (calculateHandValue(nextHand.cards) === 21) {
          nextHand.status = "stood";
          setHands([...nextHands]);
          setActiveHand(next);
          setRoundMessage("21. Moving on…");
          await casinoPause(420);
          await advance(nextHands, next);
          return;
        }
      }
      setHands([...nextHands]);
      setDealing(false);
      setActiveHand(next);
      setRoundMessage(`Player ${nextHands[next].player + 1} · spot ${nextHands[next].spot + 1}. Play the next hand.`);
    } else await playDealer(nextHands, dealer);
  };

  const act = async (action: Action) => {
    const hand = hands[activeHand];
    if (dealing || !hand || phase !== "play" || !legalActions(hand).includes(action)) return;
    const expected = expectedAction(hand);
    const ok = action === expected.action;
    coach(
      ok,
      ok ? `${ACTION_NAMES[action]} is correct` : `Strategy error: ${ACTION_NAMES[expected.action]}`,
      ok ? expected.explanation : `You chose ${ACTION_NAMES[action]}. ${expected.explanation}`,
      "play",
    );
    setDealing(true);
    const nextHands = hands.map((item) => ({ ...item, cards: [...item.cards] }));
    const next = nextHands[activeHand];
    if (action === "H") {
      const card = draw();
      if (!card) { setDealing(false); return; }
      next.cards.push(card);
      addVisible([card]);
      sound("deal", soundEnabled);
      const total = calculateHandValue(next.cards);
      if (total > 21) {
        next.status = "busted";
        setRoundMessage("Bust. Moving on…");
        await advance(nextHands, activeHand);
      } else if (total === 21) {
        next.status = "stood";
        setRoundMessage("21. Moving on…");
        await advance(nextHands, activeHand);
      } else {
        setHands(nextHands);
        setDealing(false);
        setRoundMessage(`${handLabel(next.cards)}. Hit or stand?`);
      }
    } else if (action === "S") {
      next.status = "stood";
      setRoundMessage("Stand registered. Moving on…");
      await advance(nextHands, activeHand);
    } else if (action === "D") {
      const card = draw();
      if (!card) { setDealing(false); return; }
      changeBankroll(-next.bet);
      next.bet *= 2;
      next.cards.push(card);
      next.status = calculateHandValue(next.cards) > 21 ? "busted" : "stood";
      addVisible([card]);
      sound("deal", soundEnabled);
      setRoundMessage(`${handLabel(next.cards)} on the double. Moving on…`);
      await advance(nextHands, activeHand);
    } else if (action === "R") {
      next.status = "surrendered";
      setRoundMessage("Surrender registered. Moving on…");
      await advance(nextHands, activeHand);
    } else {
      const [first, second] = next.cards;
      const leftCard = draw();
      if (!leftCard) { setDealing(false); return; }
      changeBankroll(-next.bet);
      const splitAces = first.rank === "A";
      const firstSplitCards = [first, leftCard];
      const splitHands: PlayerHand[] = [
        { cards: firstSplitCards, bet: next.bet, spot: next.spot, player: next.player, status: calculateHandValue(firstSplitCards) === 21 || (splitAces && !(leftCard.rank === "A" && rules.resplitAces)) ? "stood" : "playing", fromSplit: true, splitAces },
        { cards: [second], bet: next.bet, spot: next.spot, player: next.player, status: "playing", fromSplit: true, splitAces, awaitingSplitCard: true },
      ];
      nextHands.splice(activeHand, 1, ...splitHands);
      addVisible([leftCard]);
      sound("chip", soundEnabled);
      setHands(nextHands);
      setRoundMessage("Split dealt. Finish the first hand before the second receives a card.");
      if (splitHands[0].status !== "playing")
        await advance(nextHands, activeHand - 1);
      else {
        setActiveHand(activeHand);
        setDealing(false);
        setRoundMessage(`Split complete. Play hand ${activeHand + 1}.`);
      }
    }
  };

  const chipValues = useMemo(() => Array.from(new Set([unit, unit * 2, unit * 5, unit * 10])).sort((a, b) => a - b), [unit]);
  const insuranceTotal = hands.reduce((sum, hand) => sum + hand.bet / 2, 0);

  const clearPreviousHandForBet = () => {
    if (phase !== "bet" || (!hands.length && !dealer.length)) return;
    setHands([]);
    setDealer([]);
    setRoundMessage("Build the next wager, then deal when ready.");
  };

  const placeChip = (value: number) => {
    if (totalWager + value > bankroll) return;
    clearPreviousHandForBet();
    setWagers((currentWagers) => currentWagers.map((bet, spot) => spot === selectedSpot ? bet + value : bet));
    setChipHistory((history) => [...history, { spot: selectedSpot, value }]);
    sound("chip", soundEnabled);
  };

  const undoChip = () => {
    const last = chipHistory.at(-1);
    if (!last) return;
    setWagers((currentWagers) => currentWagers.map((bet, spot) => spot === last.spot ? Math.max(0, bet - last.value) : bet));
    setChipHistory((history) => history.slice(0, -1));
  };

  const repeatLastBet = () => {
    const previousTotal = lastWagers.reduce((sum, bet) => sum + bet, 0);
    if (!previousTotal || previousTotal > bankroll) return;
    clearPreviousHandForBet();
    setWagers([...lastWagers]);
    setChipHistory([]);
  };

  if (phase === "setup") return (
    <>
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">Casino session setup</p>
        <h1 className="mt-2 text-3xl font-semibold">Full Shoe Blackjack</h1>
        <p className="mt-2 max-w-3xl text-zinc-400">Choose the table, shared bankroll, player count, and counting bet ramp. Each player can own multiple spots through the cut card.</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel>
          <h2 className="mb-5 text-lg font-semibold">Table rules</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Select label="Decks" value={rules.decks} onChange={(event) => setRules({ ...rules, decks: +event.target.value })}>
              {[1, 2, 4, 6, 8].map((value) => <option key={value}>{value}</option>)}
            </Select>
            <Select label="Dealer rule" value={rules.dealerHitsSoft17 ? "H17" : "S17"} onChange={(event) => setRules({ ...rules, dealerHitsSoft17: event.target.value === "H17" })}>
              <option value="H17">Hits soft 17</option><option value="S17">Stands soft 17</option>
            </Select>
            <Select label="Blackjack pays" value={blackjackPayout} onChange={(event) => setBlackjackPayout(+event.target.value as 1.5 | 1.2)}>
              <option value={1.5}>3 to 2</option><option value={1.2}>6 to 5</option>
            </Select>
            <Select label="Double rule" value={rules.doubleRule} onChange={(event) => setRules({ ...rules, doubleRule: event.target.value as BlackjackRules["doubleRule"] })}>
              <option value="any">Any first two</option><option value="9-11">9 through 11</option><option value="10-11">10 and 11</option>
            </Select>
            <Select label="Penetration" value={penetration} onChange={(event) => setPenetration(+event.target.value)}>
              <option value={0.65}>65%</option><option value={0.75}>75%</option><option value={0.8}>80%</option><option value={0.85}>85%</option>
            </Select>
          </div>
        </Panel>
        <Panel>
          <h2 className="mb-5 text-lg font-semibold">Player options</h2>
          <div className="space-y-3 text-sm">
            {[
              ["doubleAfterSplit", "Double after split"],
              ["resplitAces", "Resplit aces"],
              ["lateSurrender", "Late surrender"],
            ].map(([key, label]) => <label key={key} className="flex items-center justify-between rounded-xl bg-black/20 p-3"><span>{label}</span><input type="checkbox" checked={Boolean(rules[key as keyof BlackjackRules])} onChange={(event) => setRules({ ...rules, [key]: event.target.checked })} className="h-5 w-5 accent-emerald-400" /></label>)}
            <label className="flex items-center justify-between rounded-xl bg-black/20 p-3"><span>Card animations</span><input type="checkbox" checked={animations} onChange={(event) => setAnimations(event.target.checked)} className="h-5 w-5 accent-emerald-400" /></label>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-black/20 p-3"><span><b className="block font-medium">Fast mode</b><small className="text-zinc-500">Shorter casino pauses</small></span><button type="button" role="switch" aria-label="Fast dealing mode" aria-checked={fastMode} onClick={() => setFastMode((value) => !value)} className={`pressable flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors ${fastMode ? "justify-end bg-emerald-400" : "justify-start bg-zinc-700"}`}><span className="h-6 w-6 rounded-full bg-white shadow" /></button></div>
            <label className="flex items-center justify-between rounded-xl bg-black/20 p-3"><span>Sound effects</span><input type="checkbox" checked={soundEnabled} onChange={(event) => setSoundEnabled(event.target.checked)} className="h-5 w-5 accent-emerald-400" /></label>
          </div>
        </Panel>
        <Panel>
          <h2 className="mb-5 text-lg font-semibold">Bankroll & ramp</h2>
          <div className="space-y-4">
            <NumberField label="Shared starting bankroll" prefix="$" min={100} step={100} value={startingBankroll} onValueChange={setStartingBankroll} />
            <Select label="Players" value={players} onChange={(event) => { const count = +event.target.value; setPlayers(count); setSpotOwners((owners) => owners.map((owner, spot) => owner < count ? owner : spot % count)); }}>
              {[1, 2, 3, 4, 5, 6, 7].map((value) => <option key={value} value={value}>{value} player{value === 1 ? "" : "s"}</option>)}
            </Select>
            <NumberField label="One unit" prefix="$" min={1} step={5} value={unit} onValueChange={setUnit} />
            <Select label="Bet spread" value={spread} onChange={(event) => setSpread(event.target.value as Spread)}>
              <option value="flat">Flat bet · 1 unit</option><option value="1-8">1–8 · 1/2/4/6/8</option><option value="1-12">1–12 · 1/2/4/8/12</option>
            </Select>
            <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[.06] p-4 text-xs leading-5 text-emerald-100">Ramp levels apply at TC ≤0, +1, +2, +3, and +4 or higher. The coach flags missed increases and oversized bets.</div>
          </div>
        </Panel>
      </div>
      <Button className="mt-5 w-full sm:w-auto" onClick={startShoe}>Buy in and shuffle</Button>
    </>
  );

  const holeHidden = phase === "dealing" || phase === "insurance" || phase === "play";
  const metrics: Array<{ label: string; value: string | number; intel?: "rc" | "tc" | "decks" | "discard" }> = [
    { label: "Bankroll", value: `$${bankroll.toFixed(2)}` },
    { label: phase === "bet" ? "Available" : "In action", value: phase === "bet" ? `$${(bankroll - totalWager).toFixed(2)}` : `$${hands.reduce((sum, hand) => sum + hand.bet, 0).toFixed(2)}` },
    { label: "Running count", value: signed(runningCount), intel: "rc" },
    { label: "True count", value: signed(tc), intel: "tc" },
    { label: "Decks left", value: decksRemaining.toFixed(2), intel: "decks" },
    { label: "Coach accuracy", value: `${accuracy}%` },
    { label: "Cards discarded", value: discarded, intel: "discard" },
  ];
  return (
    <div className="xl:-mx-4 2xl:-mx-10">
      <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:mb-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">Round {round} · {rules.decks}D {rules.dealerHitsSoft17 ? "H17" : "S17"} · {spread}</p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Full Shoe Blackjack</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2"><button type="button" role="switch" aria-label="Fast dealing mode" aria-checked={fastMode} title="Toggle fast dealing" disabled={dealing} onClick={() => setFastMode((value) => !value)} className={`pressable flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold disabled:opacity-40 ${fastMode ? "border-amber-300/40 bg-amber-300/15 text-amber-200" : "border-white/10 bg-white/[.05] text-zinc-400"}`}><i className="fa-solid fa-bolt" aria-hidden="true" /><span className="hidden sm:inline">Fast</span><span className={`h-2 w-2 rounded-full ${fastMode ? "bg-amber-300" : "bg-zinc-600"}`} /></button><GhostButton disabled={dealing} className="px-3 text-sm sm:px-4" onClick={() => setPhase("setup")}>End</GhostButton></div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:mb-5 sm:grid-cols-4 sm:gap-3 xl:grid-cols-7">
        {metrics.map(({ label, value, intel }) => <div key={label} className="surface relative min-w-0 rounded-2xl p-3">
          <p className="pr-7 text-[.67rem] uppercase tracking-wider text-zinc-500">{label}</p>
          {intel && <button type="button" aria-label={`${visibleIntel[intel] ? "Hide" : "Reveal"} ${label.toLowerCase()}`} aria-pressed={Boolean(visibleIntel[intel])} onClick={() => setVisibleIntel((shown) => ({ ...shown, [intel]: !shown[intel] }))} className="pressable absolute right-2.5 top-2 grid h-7 w-7 place-items-center rounded-full text-xs text-zinc-500 hover:bg-white/10 hover:text-emerald-300">
            <i aria-hidden="true" className={`fas ${visibleIntel[intel] ? "fa-eye-slash" : "fa-eye"}`} />
          </button>}
          <p className={`mt-1 truncate text-lg font-semibold sm:text-xl ${intel && !visibleIntel[intel] ? "select-none tracking-[.18em] text-zinc-600" : ""}`}>{intel && !visibleIntel[intel] ? "•••" : value}</p>
        </div>)}
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel className="overflow-hidden bg-[radial-gradient(ellipse_at_center,#176448_0%,#103d30_48%,#0b241e_100%)] p-3 ring-1 ring-emerald-300/10 sm:p-5 md:p-6 2xl:p-8">
          <div className="relative min-h-[460px] sm:min-h-[600px] xl:min-h-[680px] 2xl:min-h-[740px]">
            <div className="pointer-events-none absolute inset-6 rounded-[50%] border border-emerald-200/15" />
            <div className="relative text-center">
              <p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-emerald-100/60">Dealer {dealer.length && !holeHidden ? `· ${calculateHandValue(dealer)}` : ""}</p>
              <div className="flex min-h-24 justify-center -space-x-5">
                {dealer.map((card, index) => <PlayingCard key={`${card.rank}-${card.suit}-${index}`} card={card} hidden={index === 1 && holeHidden} size="table" animated={animations} fast={fastMode} dealIndex={phase === "dealing" ? index === 0 ? occupiedSpots : index === 1 ? occupiedSpots * 2 + 1 : 0 : 0} flip={index === 1 && !holeHidden} />)}
              </div>
            </div>
            <div className="casino-spots relative -mx-3 mt-12 flex min-h-52 snap-x snap-mandatory items-start gap-3 overflow-x-auto px-3 pb-4 sm:mx-0 sm:mt-20 sm:grid sm:min-h-60 sm:grid-cols-4 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 xl:min-h-72 xl:grid-cols-7 2xl:mt-24">
              {Array.from({ length: 7 }, (_, spot) => {
                const spotHands = hands.filter((hand) => hand.spot === spot);
                const activeHere = phase === "play" && current?.spot === spot;
                const selected = phase === "bet" && selectedSpot === spot;
                const bet = wagers[spot];
                const spotOrder = wagers.slice(0, spot).filter(Boolean).length;
                return <button key={spot} type="button" disabled={phase !== "bet"} onClick={() => setSelectedSpot(spot)} className={`relative min-h-44 w-36 min-w-36 snap-center rounded-[2rem] px-1 py-3 text-center transition duration-200 disabled:cursor-default sm:min-h-52 sm:w-auto sm:min-w-0 xl:min-h-64 xl:px-2 xl:py-4 ${activeHere ? "bg-emerald-200/10 ring-2 ring-amber-300 shadow-[0_0_32px_#fbbf2440]" : selected ? "bg-white/[.06] ring-2 ring-emerald-300" : "ring-1 ring-white/10"}`}>
                  <p className="mb-2 text-[.62rem] font-bold uppercase tracking-wider text-emerald-100/60">P{spotOwners[spot] + 1} · Spot {spot + 1}</p>
                  {spotHands.length > 0 ? <div className="flex flex-wrap justify-center gap-1">{spotHands.map((hand) => {
                    const handIndex = hands.indexOf(hand);
                    return <div key={handIndex} className={phase === "play" && handIndex === activeHand ? "rounded-xl bg-amber-200/10 p-1" : "p-1"}>
                      <div className="flex justify-center -space-x-7 lg:-space-x-10 2xl:-space-x-12">{hand.cards.map((card, cardIndex) => <PlayingCard key={`${card.rank}-${card.suit}-${cardIndex}`} card={card} size="table" animated={animations} fast={fastMode} dealIndex={phase === "dealing" ? cardIndex === 0 ? spotOrder : cardIndex === 1 ? occupiedSpots + 1 + spotOrder : 0 : 0} />)}</div>
                      <p className="mt-1 text-[.62rem] font-semibold">${hand.bet} · {hand.awaitingSplitCard ? "Waiting" : handLabel(hand.cards)}</p>
                      {hand.awaitingSplitCard ? <span className="text-[.55rem] font-bold uppercase text-amber-200/70">Next to deal</span> : hand.status !== "playing" && <span className="text-[.55rem] font-bold uppercase text-emerald-100/55">{hand.status}</span>}
                    </div>;
                  })}</div> : <div className={`mx-auto grid h-20 w-20 place-items-center rounded-full border-2 border-dashed ${selected ? "border-emerald-200 bg-emerald-200/10" : "border-emerald-100/20 bg-black/10"}`}>
                    {bet > 0 ? <div key={`${spot}-${bet}`} className="casino-chip-drop grid h-14 w-14 place-items-center rounded-full border-4 border-dashed border-amber-100 bg-gradient-to-br from-amber-400 to-orange-600 text-xs font-black text-zinc-950 shadow-[0_8px_18px_#0008]">${bet}</div> : <span className="text-[.6rem] font-semibold uppercase text-emerald-100/35">Bet</span>}
                  </div>}
                  {phase === "bet" && bet > 0 && <p className={`mt-2 text-[.6rem] font-semibold ${bet === expectedWager ? "text-emerald-200" : "text-amber-200"}`}>${bet} · {bet === expectedWager ? "On ramp" : `Target $${expectedWager}`}</p>}
                </button>;
              })}
            </div>
          </div>
          <div className="relative rounded-2xl border border-white/10 bg-black/25 p-3 backdrop-blur sm:p-4">
            <p aria-live="polite" className="mb-4 text-center text-sm text-zinc-200">{roundMessage}</p>
            {phase === "bet" && <div>
              <div className="mb-4 flex flex-wrap items-center justify-center gap-3"><span className="text-sm text-zinc-400">Selected: spot {selectedSpot + 1}</span><strong className="text-3xl">${wagers[selectedSpot]}</strong><span className="rounded-full bg-emerald-300/15 px-3 py-1 text-xs text-emerald-200">{occupiedSpots} spot{occupiedSpots === 1 ? "" : "s"} · ${totalWager} total</span></div>
              {players > 1 && <div className="mb-4 flex flex-wrap items-center justify-center gap-2"><span className="mr-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Spot owner</span>{Array.from({ length: players }, (_, player) => <button key={player} type="button" aria-pressed={spotOwners[selectedSpot] === player} onClick={() => setSpotOwners((owners) => owners.map((owner, spot) => spot === selectedSpot ? player : owner))} className={`pressable min-h-10 rounded-full px-3 text-sm font-semibold ${spotOwners[selectedSpot] === player ? "bg-emerald-300 text-emerald-950" : "border border-white/10 bg-white/[.05] text-zinc-300"}`}>Player {player + 1}</button>)}</div>}
              <div className="casino-chip-rail mx-auto flex max-w-2xl flex-wrap items-end justify-center gap-2 rounded-[2rem] border border-white/10 bg-gradient-to-b from-zinc-800/95 to-zinc-950/95 p-3 shadow-[inset_0_2px_0_#ffffff12,0_14px_32px_#0008] sm:gap-3 sm:p-4">{chipValues.map((value, index) => <button key={value} type="button" disabled={totalWager + value > bankroll} onClick={() => placeChip(value)} className={`casino-chip grid h-14 w-14 place-items-center rounded-full border-4 border-dashed text-[.65rem] font-black shadow-xl disabled:opacity-30 sm:h-16 sm:w-16 sm:text-xs xl:h-20 xl:w-20 xl:text-sm ${["border-red-100 bg-gradient-to-br from-red-500 to-red-800", "border-blue-100 bg-gradient-to-br from-blue-500 to-blue-800", "border-emerald-100 bg-gradient-to-br from-emerald-500 to-emerald-800", "border-zinc-100 bg-gradient-to-br from-zinc-600 to-black"][index]}`}>${value}</button>)}</div>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-center"><GhostButton className="px-2 text-sm" disabled={dealing || !chipHistory.length} onClick={undoChip}>Undo</GhostButton><GhostButton className="px-2 text-sm" disabled={dealing} onClick={() => { setWagers(Array(7).fill(0)); setChipHistory([]); }}>Clear</GhostButton><GhostButton className="px-2 text-sm" disabled={dealing || !lastWagers.some(Boolean) || lastWagers.reduce((sum, bet) => sum + bet, 0) > bankroll} onClick={repeatLastBet}>Repeat</GhostButton><Button className="col-span-3 w-full sm:w-auto" disabled={dealing || !totalWager || totalWager > bankroll} onClick={beginRound}>Deal {occupiedSpots} spot{occupiedSpots === 1 ? "" : "s"}</Button></div>
            </div>}
            {phase === "insurance" && <div className="flex flex-wrap justify-center gap-3"><GhostButton disabled={dealing} onClick={() => chooseInsurance(false)}>Decline insurance</GhostButton><Button disabled={dealing || bankroll < insuranceTotal} onClick={() => chooseInsurance(true)}>Insure all spots for ${insuranceTotal}</Button></div>}
            {phase === "play" && current && <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-center">{legalActions(current).map((action) => <Button disabled={dealing} className="w-full sm:w-auto" key={action} onClick={() => act(action)}>{ACTION_NAMES[action]}</Button>)}</div>}
            {(phase === "dealing" || phase === "dealer") && <div className="flex min-h-12 items-center justify-center gap-3 text-sm font-medium text-emerald-100/70"><i className="fa-solid fa-circle-notch animate-spin" aria-hidden="true" />{phase === "dealer" ? "Dealer playing" : "Cards in motion"}</div>}
            {phase === "shoe-end" && <div className="text-center"><p className="mb-4 text-2xl font-semibold">Session result: {bankroll >= startingBankroll ? "+" : ""}${(bankroll - startingBankroll).toFixed(2)}</p><Button onClick={startShoe}>Shuffle another shoe</Button></div>}
          </div>
        </Panel>

        <div className="grid gap-5 md:grid-cols-2 2xl:block 2xl:space-y-5">
          <Panel>
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Discard tray</p><div className="mt-1 flex items-center gap-2 text-sm text-zinc-300"><span className={!visibleIntel.discard ? "select-none tracking-[.16em] text-zinc-600" : ""}>{visibleIntel.discard ? `${(discarded / 52).toFixed(2)} decks seen` : "•••"}</span><button type="button" aria-label={`${visibleIntel.discard ? "Hide" : "Reveal"} exact discard amount`} aria-pressed={Boolean(visibleIntel.discard)} onClick={() => setVisibleIntel((shown) => ({ ...shown, discard: !shown.discard }))} className="pressable grid h-7 w-7 place-items-center rounded-full text-xs text-zinc-500 hover:bg-white/10 hover:text-emerald-300"><i aria-hidden="true" className={`fas ${visibleIntel.discard ? "fa-eye-slash" : "fa-eye"}`} /></button></div></div><span className="text-xs text-zinc-500">Cut at {Math.round(penetration * 100)}%</span></div>
            <div className="mt-4 flex h-32 items-end rounded-b-2xl border-x-4 border-b-4 border-zinc-500/60 bg-black/25 p-2 sm:h-48">
              <div className="w-full rounded-sm bg-[repeating-linear-gradient(0deg,#f4f1e8,#f4f1e8_2px,#aaa_3px)] shadow-[0_0_25px_#0008] transition-[height] duration-500" style={{ height: `${Math.max(2, Math.min(100, (discarded / (cardsTotal * penetration)) * 100))}%` }} />
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full bg-emerald-400 transition-[width]" style={{ width: `${Math.min(100, (discarded / (cardsTotal * penetration)) * 100)}%` }} /></div>
          </Panel>
          <Panel>
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Live coach</p>
            {note ? <div aria-live="polite" className={`mt-3 rounded-xl border p-4 ${note.ok ? "border-emerald-400/30 bg-emerald-400/[.07]" : "border-red-400/30 bg-red-400/[.07]"}`}><p className={`font-semibold ${note.ok ? "text-emerald-300" : "text-red-300"}`}>{note.ok ? "✓" : "!"} {note.title}</p><p className="mt-2 text-xs leading-5 text-zinc-300">{note.detail}</p></div> : <p className="mt-3 text-sm leading-6 text-zinc-400">Your bet sizing, basic strategy, insurance, and index deviations are checked as you play.</p>}
            <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs"><div className="rounded-lg bg-black/20 p-2"><strong className="block text-lg text-red-300">{stats.betErrors}</strong>Bet errors</div><div className="rounded-lg bg-black/20 p-2"><strong className="block text-lg text-red-300">{stats.playErrors}</strong>Play errors</div></div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
