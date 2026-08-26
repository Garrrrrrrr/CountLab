"use client";

import { useMemo, useRef, useState } from "react";
import { Button, GhostButton, MobileActionDock, NumberField, Panel, Switch } from "@/components/ui";
import {
  BetSpot,
  CardRow,
  CasinoTable,
  ChipRack,
  CoachPanel,
  GameHistory,
  type CoachNote,
  type GameHistoryRow,
} from "@/components/CasinoGameUI";
import type { Card, Rank, Suit } from "@/lib/blackjack/types";
import {
  ACTION_NAMES,
  createShoe,
  dealerShouldHit,
  formatUpcard,
  handValue,
  hiLoTag,
  insuranceRecommended,
  isBlackjack,
  rampUnits,
  recommendAction,
  settleRound,
  shuffled,
  trueCount,
  type DDMAction,
  type DDMCard,
} from "@/lib/ddm/engine";

type Phase = "betting" | "insurance" | "playing" | "result";
type CoachCategory = "bet" | "insurance" | "strategy" | "deviation";

interface RoundState {
  baseBet: number;
  wager: number;
  player: DDMCard[];
  dealerUp: DDMCard;
  dealerHole: DDMCard;
  dealer: DDMCard[];
  holeRevealed: boolean;
  insuranceTaken: boolean;
}

interface ShoeState {
  cards: DDMCard[];
  position: number;
  runningCount: number;
  number: number;
}

type CategoryStats = Record<CoachCategory, { correct: number; total: number }>;

const CUT_CARD = 260;
const INITIAL_STATS: CategoryStats = {
  bet: { correct: 0, total: 0 },
  insurance: { correct: 0, total: 0 },
  strategy: { correct: 0, total: 0 },
  deviation: { correct: 0, total: 0 },
};
const suitMap: Record<DDMCard["suit"], Suit> = { c: "clubs", d: "diamonds", h: "hearts", s: "spades" };

function displayCard(card: DDMCard): Card {
  return { rank: (card.rank === 1 ? "A" : String(card.rank)) as Rank, suit: suitMap[card.suit] };
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value}`;
}

function money(value: number): string {
  return value.toFixed(value % 1 === 0 ? 0 : 2);
}

function handLabel(cards: readonly DDMCard[]): string {
  if (!cards.length) return "—";
  if (isBlackjack(cards)) return "Blackjack";
  const value = handValue(cards);
  return value.bust ? `${value.hardTotal} bust` : `${value.soft ? "Soft " : ""}${value.total}`;
}

export function DDMTableGame() {
  const shoe = useRef<ShoeState>({ cards: [], position: 0, runningCount: 0, number: 0 });
  const [shoeView, setShoeView] = useState({ remaining: 312, runningCount: 0, number: 0, hiddenHole: false });
  const [phase, setPhase] = useState<Phase>("betting");
  const [round, setRound] = useState<RoundState>();
  const [bankroll, setBankroll] = useState(1000);
  const [unit, setUnit] = useState(5);
  const [bet, setBet] = useState(5);
  const [selectedChip, setSelectedChip] = useState(5);
  const [message, setMessage] = useState("Set your bet from the Hi-Lo ramp, then deal one card.");
  const [coachHints, setCoachHints] = useState(true);
  const [note, setNote] = useState<CoachNote>();
  const [coachStats, setCoachStats] = useState<CategoryStats>(INITIAL_STATS);
  const [history, setHistory] = useState<GameHistoryRow[]>([]);
  const [stats, setStats] = useState({ rounds: 0, wins: 0, net: 0 });

  const unseenCards = Math.max(1, shoeView.remaining + (shoeView.hiddenHole ? 1 : 0));
  const visibleTrueCount = trueCount(shoeView.runningCount, unseenCards);
  const suggestedBet = unit * rampUnits(visibleTrueCount);
  const locked = phase !== "betting";
  const totalCoach = Object.values(coachStats).reduce((sum, item) => sum + item.total, 0);
  const correctCoach = Object.values(coachStats).reduce((sum, item) => sum + item.correct, 0);

  const currentRecommendation = useMemo(() => {
    if (phase !== "playing" || !round) return undefined;
    return recommendAction(round.player, round.dealerUp.rank, visibleTrueCount);
  }, [phase, round, visibleTrueCount]);

  const syncShoe = (hiddenHole: boolean) => {
    setShoeView({
      remaining: Math.max(0, shoe.current.cards.length - shoe.current.position),
      runningCount: shoe.current.runningCount,
      number: shoe.current.number,
      hiddenHole,
    });
  };

  const draw = (exposed: boolean): DDMCard => {
    const card = shoe.current.cards[shoe.current.position];
    if (!card) throw new Error("The shoe ran out before the round completed.");
    shoe.current.position += 1;
    if (exposed) shoe.current.runningCount += hiLoTag(card);
    return card;
  };

  const grade = (category: CoachCategory, ok: boolean, title: string, detail: string) => {
    setNote({ ok, title, detail });
    setCoachStats((value) => ({
      ...value,
      [category]: {
        correct: value[category].correct + Number(ok),
        total: value[category].total + 1,
      },
    }));
  };

  const finishRound = (active: RoundState) => {
    const dealer = active.holeRevealed ? [...active.dealer] : [active.dealerUp, active.dealerHole];
    if (!active.holeRevealed) shoe.current.runningCount += hiLoTag(active.dealerHole);
    while (dealerShouldHit(dealer)) {
      dealer.push(draw(true));
    }
    const completed = { ...active, dealer, holeRevealed: true };
    const settlement = settleRound({
      player: completed.player,
      dealer,
      wager: completed.wager,
      baseBet: completed.baseBet,
      insuranceTaken: completed.insuranceTaken,
    });
    const nextBankroll = bankroll + settlement.net;
    setBankroll(nextBankroll);
    setRound(completed);
    setPhase("result");
    setStats((value) => ({ rounds: value.rounds + 1, wins: value.wins + Number(settlement.net > 0), net: value.net + settlement.net }));
    setHistory((rows) => [{
      id: Date.now(),
      result: settlement.result,
      net: settlement.net,
      bankroll: nextBankroll,
      detail: `${handLabel(completed.player)} vs ${handLabel(dealer)} · ${settlement.detail}${completed.insuranceTaken ? ` · insurance ${settlement.insurance >= 0 ? "+" : ""}$${money(settlement.insurance)}` : ""}`,
    }, ...rows]);
    setMessage(`${settlement.result}: ${settlement.net >= 0 ? "+" : ""}$${money(settlement.net)} · ${settlement.detail}.`);
    syncShoe(false);
  };

  const startShoeIfNeeded = () => {
    let shuffledNow = false;
    if (!shoe.current.cards.length || shoe.current.position >= CUT_CARD) {
      shoe.current = {
        cards: shuffled(createShoe()),
        position: 0,
        runningCount: 0,
        number: shoe.current.number + 1,
      };
      shuffledNow = true;
    }
    return shuffledNow;
  };

  const deal = () => {
    if (bet <= 0) return setMessage("Place a main bet first.");
    if (bet > bankroll) return setMessage("The bet cannot exceed your bankroll.");
    const shuffledNow = startShoeIfNeeded();
    const predealTc = trueCount(shoe.current.runningCount, shoe.current.cards.length - shoe.current.position);
    const expected = unit * rampUnits(predealTc);
    grade(
      "bet",
      bet === expected,
      bet === expected ? "Correct ramp bet" : `Ramp calls for $${money(expected)}`,
      `Pre-deal TC ${signed(predealTc)} calls for ${rampUnits(predealTc)} unit${rampUnits(predealTc) === 1 ? "" : "s"} at $${money(unit)} per unit.`,
    );
    const player = draw(true);
    const dealerUp = draw(true);
    const dealerHole = draw(false);
    const active: RoundState = {
      baseBet: bet,
      wager: bet,
      player: [player],
      dealerUp,
      dealerHole,
      dealer: [dealerUp],
      holeRevealed: false,
      insuranceTaken: false,
    };
    setRound(active);
    syncShoe(true);

    if (dealerUp.rank === 1) {
      setPhase("insurance");
      setMessage(`${shuffledNow ? `Shoe ${shoe.current.number} shuffled. ` : ""}Dealer shows an ace. Take or decline insurance.`);
      return;
    }
    if (dealerUp.rank === 10 && dealerHole.rank === 1) {
      shoe.current.runningCount += hiLoTag(dealerHole);
      active.holeRevealed = true;
      active.dealer = [dealerUp, dealerHole];
      finishRound(active);
      return;
    }
    setPhase("playing");
    setMessage(`${shuffledNow ? `Shoe ${shoe.current.number} shuffled. ` : ""}Choose Hit, Stand, or Double. You may double repeatedly.`);
  };

  const chooseInsurance = (take: boolean) => {
    if (!round) return;
    const tc = trueCount(shoe.current.runningCount, shoe.current.cards.length - shoe.current.position + 1);
    const expected = insuranceRecommended(tc);
    grade(
      "insurance",
      take === expected,
      take === expected ? "Correct insurance decision" : expected ? "Take insurance" : "Decline insurance",
      `The solved Hi-Lo insurance index is TC +4. The decision count is ${signed(tc)}.`,
    );
    const active = { ...round, insuranceTaken: take };
    setRound(active);
    if (round.dealerHole.rank === 10) {
      shoe.current.runningCount += hiLoTag(round.dealerHole);
      active.holeRevealed = true;
      active.dealer = [round.dealerUp, round.dealerHole];
      finishRound(active);
    } else {
      setPhase("playing");
      setMessage(take ? "No dealer blackjack. Insurance loses; play your hand." : "No dealer blackjack. Play your hand.");
    }
  };

  const act = (choice: DDMAction) => {
    if (!round) return;
    if (choice === "S" && round.player.length === 1 && round.player[0].rank === 1) return;
    const tc = trueCount(shoe.current.runningCount, shoe.current.cards.length - shoe.current.position + 1);
    const recommendation = recommendAction(round.player, round.dealerUp.rank, tc);
    const ok = choice === recommendation.action;
    const category: CoachCategory = recommendation.deviation ? "deviation" : "strategy";
    const threshold = recommendation.deviation
      ? ` This is a ${recommendation.deviation.direction === 1 ? `${signed(recommendation.deviation.threshold)} or higher` : `${signed(recommendation.deviation.threshold)} or lower`} departure from ${ACTION_NAMES[recommendation.baseAction]}.`
      : " This is the off-the-top strategy play.";
    grade(
      category,
      ok,
      ok ? `Correct ${recommendation.deviation ? "deviation" : "play"}` : `${ACTION_NAMES[recommendation.action]} is recommended`,
      `${recommendation.plane === "first" ? "First-card" : recommendation.plane === "ace" ? "First ace" : recommendation.plane === "soft" ? "Soft" : "Hard"} ${recommendation.row} vs ${formatUpcard(round.dealerUp.rank)} at TC ${signed(tc)}.${threshold}`,
    );

    let active: RoundState = { ...round, player: [...round.player] };
    if (choice === "S") return finishRound(active);
    if (choice === "D") active = { ...active, wager: active.wager * 2 };
    const startedWithAce = active.player.length === 1 && active.player[0].rank === 1;
    active.player.push(draw(true));
    setRound(active);
    syncShoe(true);
    if (startedWithAce || handValue(active.player).bust || isBlackjack(active.player)) return finishRound(active);
    setMessage(choice === "D" ? `Wager doubled to $${money(active.wager)}. Play continues.` : "Card drawn. Choose again.");
  };

  const nextRound = () => {
    setRound(undefined);
    setPhase("betting");
    setMessage(shoe.current.position >= CUT_CARD ? "Cut card reached. The next deal will begin a fresh shoe." : "Set the next bet from the current true count.");
    syncShoe(false);
  };

  const actionButtons = (
    <>
      {phase === "betting" && <Button onClick={deal}>Deal one card</Button>}
      {phase === "insurance" && <><Button onClick={() => chooseInsurance(true)}>Take insurance · ${money((round?.baseBet ?? 0) / 2)}</Button><GhostButton onClick={() => chooseInsurance(false)}>Decline</GhostButton></>}
      {phase === "playing" && <><Button onClick={() => act("H")}>Hit</Button>{!(round?.player.length === 1 && round.player[0].rank === 1) && <GhostButton onClick={() => act("S")}>Stand</GhostButton>}<GhostButton onClick={() => act("D")}>Double · ${money((round?.wager ?? 0) * 2)} total</GhostButton></>}
      {phase === "result" && <Button onClick={nextRound}>Next round</Button>}
    </>
  );

  const dealerCards = round ? (round.holeRevealed ? round.dealer.map(displayCard) : [displayCard(round.dealerUp)]) : [];
  return (
    <div className="mt-5 grid gap-5 pb-24 lg:pb-0 xl:grid-cols-[1fr_330px]">
      <div className="space-y-5">
        <CasinoTable>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-100/55">Double Down Madness</p><p className="mt-1 text-sm text-emerald-50/80">Bankroll <b className="text-white">${bankroll.toFixed(2)}</b></p></div>
            <span className="rounded-full bg-black/20 px-3 py-1 text-xs text-emerald-100/70">Shoe {shoeView.number || "ready"} · {shoeView.remaining} cards</span>
          </div>
          <div className="mt-5"><CardRow label={`Dealer${round?.holeRevealed ? ` · ${handLabel(round.dealer)}` : ""}`} cards={dealerCards} hidden={round && !round.holeRevealed ? 1 : 0} empty={!round ? 2 : 0} /></div>
          <div className="my-6"><CardRow label={`Your hand${round ? ` · ${handLabel(round.player)}` : ""}`} cards={(round?.player ?? []).map(displayCard)} empty={!round ? 1 : 0} /></div>
          <div className="flex flex-wrap justify-center gap-4 sm:gap-8">
            <BetSpot label="Main bet" amount={round?.baseBet ?? bet} locked={locked} onAdd={() => bet + selectedChip <= bankroll && setBet((value) => value + selectedChip)} onClear={() => setBet(0)} detail={round && round.wager !== round.baseBet ? `$${money(round.wager)} total after doubles` : `${rampUnits(visibleTrueCount)}-unit ramp target`} />
            <BetSpot label="Insurance" amount={round?.insuranceTaken ? round.baseBet / 2 : 0} locked detail="Offered vs ace" />
          </div>
          <div aria-live="polite" className="mx-auto mt-5 max-w-2xl rounded-xl bg-black/25 p-3 text-center text-sm text-emerald-50/80">{message}</div>
          {coachHints && currentRecommendation && <p className="mt-3 text-center text-xs text-amber-200">Coach hint: {ACTION_NAMES[currentRecommendation.action]}{currentRecommendation.deviation ? ` · deviation at TC ${signed(currentRecommendation.deviation.threshold)}` : " · base strategy"}</p>}
          <div className="mt-5 hidden flex-wrap justify-center gap-2 lg:flex">{actionButtons}</div>
        </CasinoTable>

        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Chip rack</h2>{phase === "betting" && <GhostButton onClick={() => setBet(suggestedBet)}>Use ${rampUnits(visibleTrueCount)}-unit bet · ${money(suggestedBet)}</GhostButton>}</div>
          <div className="mt-4"><ChipRack selected={selectedChip} onSelect={setSelectedChip} disabled={locked} /></div>
          <p className="mt-4 text-center text-xs text-zinc-500">Select a chip, then tap the Main bet circle. Betting is graded from the pre-deal running count.</p>
        </Panel>
      </div>

      <div className="space-y-5">
        <CoachPanel note={note} accuracyLabel={totalCoach ? `${Math.round(correctCoach / totalCoach * 100)}% · ${correctCoach}/${totalCoach}` : undefined} emptyHint="The coach grades the pre-deal spread, insurance at +4, basic strategy, and all 18 selected deviations.">
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            {(Object.entries(coachStats) as Array<[CoachCategory, { correct: number; total: number }]>).map(([category, value]) => <div key={category} className="rounded-lg bg-black/20 p-2"><span className="capitalize text-zinc-500">{category}</span><b className="float-right">{value.correct}/{value.total}</b></div>)}
          </div>
        </CoachPanel>
        <Panel>
          <h2 className="font-semibold">Count and spread</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-black/20 p-3"><span className="text-xs text-zinc-500">Running count</span><b className="mt-1 block text-xl">{signed(shoeView.runningCount)}</b></div>
            <div className="rounded-xl bg-black/20 p-3"><span className="text-xs text-zinc-500">True count</span><b className="mt-1 block text-xl">{signed(visibleTrueCount)}</b></div>
            <div className="rounded-xl bg-black/20 p-3"><span className="text-xs text-zinc-500">Decks unseen</span><b className="mt-1 block text-xl">{(unseenCards / 52).toFixed(1)}</b></div>
            <div className="rounded-xl bg-black/20 p-3"><span className="text-xs text-zinc-500">Ramp target</span><b className="mt-1 block text-xl">{rampUnits(visibleTrueCount)} units</b></div>
          </div>
          <div className="mt-4 grid gap-4"><NumberField label="Unit size" prefix="$" min={1} max={1000} value={unit} disabled={locked} onValueChange={(value) => setUnit(Math.max(1, value))} /><Switch label="Show strategy hint" checked={coachHints} onChange={setCoachHints} /></div>
          <p className="mt-3 text-xs leading-5 text-zinc-500">Hi-Lo TC is floored, including negative counts. The hidden hole card remains in the unseen-card denominator until it is revealed.</p>
        </Panel>
        <Panel>
          <div className="flex items-center justify-between"><h2 className="font-semibold">Session</h2><span className={stats.net >= 0 ? "text-emerald-300" : "text-red-300"}>{stats.net >= 0 ? "+" : ""}${stats.net.toFixed(2)}</span></div>
          <p className="mt-2 text-xs text-zinc-500">{stats.rounds} rounds · {stats.wins} profitable</p>
          <div className="mt-4"><GameHistory rows={history} /></div>
        </Panel>
      </div>
      <MobileActionDock>{actionButtons}</MobileActionDock>
    </div>
  );
}
