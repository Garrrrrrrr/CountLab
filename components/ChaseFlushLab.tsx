"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, GhostButton, Metric, Panel, Select } from "@/components/ui";
import {
  cardName,
  Decision,
  parseCard,
  RANKS,
  SUITS,
} from "@/lib/chaseFlush/engine";
import { makeSession, storage } from "@/lib/statistics/storage";

type Stage = 0 | 2 | 4;
type Target = "player" | "dealer" | "board";
type Policy = "none" | "final" | "from2" | "all";
type Result = {
  informed: Decision;
  normal: Decision;
  stability: number;
  stableAction: boolean;
};

const suitGlyph: Record<string, string> = { c: "♣", d: "♦", h: "♥", s: "♠" };
const rankLabel = (rank: string) => rank === "T" ? "10" : rank;
const fmt = (value: number, exact: boolean) => `${value >= 0 ? "+" : ""}${value.toFixed(exact ? 4 : 3)}`;
const policyAllowsCard = (policy: Policy, stage: Stage) =>
  policy === "all" || (policy === "from2" && stage >= 2) || (policy === "final" && stage === 4);
const availableActions = (stage: Stage) => stage === 0 ? ["3x", "check"] : stage === 2 ? ["2x", "check"] : ["1x", "fold"];
const rankResearch = [
  ["2", 0.305566, 0.044832], ["3", 0.288420, 0.047590], ["4", 0.274199, 0.051308],
  ["5", 0.238475, 0.053274], ["6", 0.225411, 0.059313], ["7", 0.212663, 0.067086],
  ["8", 0.189372, 0.072637], ["9", 0.171721, 0.081884], ["10", 0.131461, 0.091425],
  ["J", 0.065406, 0.101656], ["Q", -0.030216, 0.117428], ["K", -0.155558, 0.138938],
  ["A", -0.337492, 0.194436],
] as const;

function CardChip({ card, onRemove }: { card: number; onRemove: () => void }) {
  const name = cardName(card);
  const red = name[1] === "d" || name[1] === "h";
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove ${rankLabel(name[0])} of ${name[1]}`}
      className={`rounded-lg border border-white/10 bg-white px-3 py-2 font-semibold ${red ? "text-red-600" : "text-zinc-950"}`}
    >
      {rankLabel(name[0])}{suitGlyph[name[1]]} <span aria-hidden="true">×</span>
    </button>
  );
}

export function ChaseFlushLab() {
  const [mode, setMode] = useState<"analyze" | "practice" | "strategy" | "research">("analyze"),
    [stage, setStage] = useState<Stage>(2),
    [target, setTarget] = useState<Target>("player"),
    [player, setPlayer] = useState(() => [parseCard("Ah"), parseCard("8h"), parseCard("4c")]),
    [dealer, setDealer] = useState<number[]>(() => [parseCard("Kh")]),
    [board, setBoard] = useState(() => [parseCard("2h"), parseCard("7s")]),
    [policy, setPolicy] = useState<Policy>("all"),
    [quality, setQuality] = useState<"fast" | "balanced" | "accurate">("balanced"),
    [sixCardPayout, setSixCardPayout] = useState(50),
    [result, setResult] = useState<Result>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [practiceChoice, setPracticeChoice] = useState<string>(),
    [started, setStarted] = useState(Date.now());
  const worker = useRef<Worker | null>(null), requestId = useRef(0), recorded = useRef("");
  const selected = useMemo(() => new Set([...player, ...dealer, ...board]), [player, dealer, board]);
  const informationActive = policyAllowsCard(policy, stage);

  useEffect(() => {
    const instance = new Worker(new URL("../workers/chaseFlush.worker.ts", import.meta.url));
    worker.current = instance;
    instance.onmessage = (event: MessageEvent<Result & { id: number; error?: string }>) => {
      if (event.data.id !== requestId.current) return;
      setLoading(false);
      if (event.data.error) {
        setError(event.data.error);
        return;
      }
      setResult(event.data);
    };
    return () => instance.terminate();
  }, []);

  useEffect(() => {
    if (!result || !practiceChoice) return;
    const key = `${stage}:${player.join(",")}:${dealer.join(",")}:${board.join(",")}:${practiceChoice}`;
    if (recorded.current === key) return;
    recorded.current = key;
    const ok = practiceChoice === result.informed.action;
    const question = `${stage === 0 ? "Opening" : stage === 2 ? "2x stage" : "River"}: ${player.map(cardName).join(" ")} / ${board.map(cardName).join(" ")}`;
    storage.addSession(makeSession(
      "Chase the Flush",
      1,
      ok ? 1 : 0,
      Date.now() - started,
      ok ? 1 : 0,
      ok ? [] : [{ question, userAnswer: practiceChoice, correctAnswer: result.informed.action, explanation: `The recommended action leads by ${result.informed.difference.toFixed(3)} Ante units in this model.` }],
      { [stage === 0 ? "Opening" : stage === 2 ? "2x decision" : "River"]: { correct: ok ? 1 : 0, total: 1 } },
    ));
  }, [board, dealer, player, practiceChoice, result, stage, started]);

  const clearResult = () => {
    setResult(undefined);
    setError("");
    setPracticeChoice(undefined);
    setStarted(Date.now());
  };
  const changeStage = (next: Stage) => {
    setStage(next);
    setBoard((cards) => cards.slice(0, next));
    setTarget("board");
    clearResult();
  };
  const addCard = (card: number) => {
    if (selected.has(card)) return;
    if (target === "player") {
      if (player.length >= 3) return;
      setPlayer((cards) => [...cards, card]);
    } else if (target === "dealer") {
      setDealer([card]);
    } else {
      if (board.length >= stage) return;
      setBoard((cards) => [...cards, card]);
    }
    clearResult();
  };
  const randomize = () => {
    const cards = Array.from({ length: 52 }, (_, index) => index);
    for (let index = cards.length - 1; index > 0; index--) {
      const swap = Math.floor(Math.random() * (index + 1));
      [cards[index], cards[swap]] = [cards[swap], cards[index]];
    }
    setPlayer(cards.slice(0, 3));
    setDealer(cards.slice(3, 4));
    setBoard(cards.slice(4, 4 + stage));
    clearResult();
  };
  const calculate = useCallback(() => {
    setError("");
    if (player.length !== 3) return setError("Select exactly three player cards.");
    if (board.length !== stage) return setError(`Select exactly ${stage} community cards for this stage.`);
    if (informationActive && dealer.length !== 1) return setError("Select the exposed dealer card for this information policy.");
    if (!worker.current) return setError("The calculation worker is not ready yet.");
    const id = ++requestId.current;
    const samples = quality === "fast" ? 16 : quality === "balanced" ? 32 : 64;
    const base = { player, board };
    setLoading(true);
    setResult(undefined);
    worker.current.postMessage({
      id,
      informed: informationActive ? { ...base, dealerVisible: dealer[0] } : base,
      normal: base,
      samples,
      sixCardPayout,
    });
  }, [board, dealer, informationActive, player, quality, sixCardPayout, stage]);

  const choosePractice = (action: string) => {
    if (loading || practiceChoice) return;
    setPracticeChoice(action);
    calculate();
  };
  const closeDecision = result && !result.informed.exact && (!result.stableAction || result.stability >= result.informed.difference);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">Conditional EV training and research</p>
          <h1 className="mt-2 text-3xl font-semibold">Chase the Flush Lab</h1>
          <p className="mt-2 max-w-3xl text-zinc-400">Practice or analyze decisions with one exposed dealer card. Hidden dealer cards are never entered or passed to the solver.</p>
        </div>
        <a className="text-sm text-emerald-400 hover:underline" href="https://wizardofodds.com/games/chase-the-flush/" target="_blank" rel="noreferrer">Rules source ↗</a>
      </div>

      <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Chase the Flush mode">
        {(["analyze", "practice", "strategy", "research"] as const).map((item) => (
          <GhostButton key={item} role="tab" aria-selected={mode === item} onClick={() => { setMode(item); clearResult(); }} className={mode === item ? "border-emerald-400/60 bg-emerald-500/15" : ""}>
            {item[0].toUpperCase() + item.slice(1)}
          </GhostButton>
        ))}
      </div>

      {mode === "research" ? (
        <ResearchPanel sixCardPayout={sixCardPayout} setSixCardPayout={(value) => { setSixCardPayout(value); clearResult(); }} />
      ) : mode === "strategy" ? (
        <PracticalStrategy />
      ) : (
        <>
          <Panel className="mt-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Select label="Six-card X-Tra payout" value={sixCardPayout} onChange={(event) => { setSixCardPayout(Number(event.target.value)); clearResult(); }}>
                <option value={50}>50:1 displayed current table</option>
                <option value={20}>20:1 legacy analysis table</option>
              </Select>
              <Select label="Dealer information schedule" value={policy} onChange={(event) => { setPolicy(event.target.value as Policy); clearResult(); }}>
                <option value="all">Visible at all decisions</option>
                <option value="from2">Visible from 2x stage</option>
                <option value="final">Visible at final decision</option>
                <option value="none">No dealer information</option>
              </Select>
              <Select label="Estimate quality" value={quality} onChange={(event) => { setQuality(event.target.value as typeof quality); clearResult(); }}>
                <option value="fast">Fast</option>
                <option value="balanced">Balanced</option>
                <option value="accurate">Accurate</option>
              </Select>
              <div className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-200">
                EVs use Ante units. Multiply by your Ante to estimate currency value.
              </div>
            </div>
          </Panel>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.08fr_.92fr]">
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Build the information state</h2>
                  <p className="mt-1 text-sm text-zinc-500">Choose the decision stage, then select cards visually.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <GhostButton onClick={randomize}>Random valid hand</GhostButton>
                  <GhostButton onClick={() => { setStage(2); setPlayer([parseCard("Ah"), parseCard("8h"), parseCard("4c")]); setDealer([parseCard("Kh")]); setBoard([parseCard("2h"), parseCard("7s")]); clearResult(); }}>Load example</GhostButton>
                  <GhostButton onClick={() => { setPlayer([]); setDealer([]); setBoard([]); clearResult(); }}>Reset</GhostButton>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2" role="tablist" aria-label="Decision stage">
                {([[0, "Opening 3x"], [2, "After first board"], [4, "River 1x"]] as const).map(([value, label]) => (
                  <button key={value} type="button" role="tab" aria-selected={stage === value} onClick={() => changeStage(value)} className={`rounded-xl border p-3 text-sm ${stage === value ? "border-emerald-400 bg-emerald-500/15 text-emerald-200" : "border-white/10 bg-black/20 text-zinc-400"}`}>{label}</button>
                ))}
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <CardGroup label="Player cards" active={target === "player"} onActivate={() => setTarget("player")} cards={player} onRemove={(card) => { setPlayer((items) => items.filter((item) => item !== card)); clearResult(); }} />
                <CardGroup label={informationActive ? "Exposed dealer card" : "Dealer card ignored"} active={target === "dealer"} onActivate={() => setTarget("dealer")} cards={dealer} onRemove={() => { setDealer([]); clearResult(); }} />
                <CardGroup label={`Community cards (${board.length}/${stage})`} active={target === "board"} onActivate={() => setTarget("board")} cards={board} onRemove={(card) => { setBoard((items) => items.filter((item) => item !== card)); clearResult(); }} />
              </div>
              <div className="mt-5 grid grid-cols-7 gap-1 sm:[grid-template-columns:repeat(13,minmax(0,1fr))]" aria-label={`Card picker for ${target}`}>
                {SUITS.split("").flatMap((suit, suitIndex) => RANKS.split("").map((rank, rankIndex) => {
                  const card = suitIndex * 13 + rankIndex;
                  const red = suit === "d" || suit === "h";
                  return <button key={card} type="button" disabled={selected.has(card)} onClick={() => addCard(card)} aria-label={`${rankLabel(rank)} of ${suit}`} className={`min-h-10 rounded border border-white/10 bg-white text-xs font-bold disabled:cursor-not-allowed disabled:opacity-20 ${red ? "text-red-600" : "text-zinc-950"}`}>{rankLabel(rank)}<span className="block">{suitGlyph[suit]}</span></button>;
                }))}
              </div>
              {mode === "analyze" ? (
                <Button className="mt-5" disabled={loading} onClick={calculate}>{loading ? "Calculating in background..." : "Calculate optimal action"}</Button>
              ) : (
                <div className="mt-5">
                  <p className="mb-3 text-sm text-zinc-400">Choose before revealing the model:</p>
                  <div className="flex gap-2">{availableActions(stage).map((action) => <GhostButton key={action} disabled={loading || Boolean(practiceChoice)} onClick={() => choosePractice(action)}>{action.toUpperCase()}</GhostButton>)}</div>
                </div>
              )}
              {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">{error}</p>}
            </Panel>

            <Panel>
              {!result && !loading && <div className="grid min-h-80 place-items-center text-center text-zinc-500">Complete the cards and request a calculation.</div>}
              {loading && <div className="grid min-h-80 place-items-center text-center"><div><i className="fa-solid fa-spinner fa-spin text-2xl text-emerald-300" /><p className="mt-3 text-zinc-400">Sampling legal future deals off the main thread.</p></div></div>}
              {result && <DecisionPanel result={result} closeDecision={Boolean(closeDecision)} practiceChoice={practiceChoice} informationActive={informationActive} />}
            </Panel>
          </div>
        </>
      )}
      <p className="mt-6 text-xs leading-5 text-zinc-500">Educational probability model only. Casino rules, procedures, and outcomes vary; a modeled edge does not guarantee profit and gambling can result in financial loss.</p>
    </>
  );
}

function PracticalStrategy() {
  const stages = [
    {
      step: "1",
      wager: "Opening · 3x or check",
      accent: "text-emerald-300",
      rules: [
        "Start by identifying the player's longest suited group; pairs and straights have no value.",
        "As a practical baseline, make 3x with a three-card flush.",
        "With only two suited cards, 3x the strongest starts around Q-9 or better; check marginal and disconnected starts.",
        "Downgrade when the exposed dealer card is in that suit and outranks your key card, especially an exposed Ace or King.",
      ],
    },
    {
      step: "2",
      wager: "Two board cards · 2x or check",
      accent: "text-sky-300",
      rules: [
        "Count player cards plus the two community cards in each suit.",
        "Use a made three-card-or-longer flush as the practical 2x starting point.",
        "Prefer 2x when your flush contains high private cards; shared board cards also strengthen the dealer.",
        "Check close hands when the exposed card matches your best suit and is higher than your comparable ranks.",
      ],
    },
    {
      step: "3",
      wager: "Four board cards · 1x or fold",
      accent: "text-amber-300",
      rules: [
        "Compare flush length first, then ranks from highest to lowest. Ignore all ordinary poker-hand categories.",
        "Four-card and longer player flushes are strong calls, but the exposed card can reveal that a board-heavy flush is dominated.",
        "Fold weak two-card flushes and dominated shared-board patterns; three-card decisions are often close.",
        "Use Analyze for the final decision: it exactly enumerates every legal pair of hidden dealer cards.",
      ],
    },
  ];
  return (
    <div className="mt-5 space-y-5">
      <Panel>
        <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-400">
          Practical strategy · one dealer card exposed
        </p>
        <h2 className="mt-2 text-2xl font-semibold">Build the flush, then price the threat</h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-zinc-400">
          This is a learnable starting strategy for the displayed 50:1 six-card paytable. It compresses a conditional-EV policy into memorable rules, so it will not resolve every borderline combination. Use the analyzer whenever the exposed card attacks your best suit or two actions are close.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ["1", "Flush length", "More suited cards always beat fewer."],
            ["2", "Flush ranks", "Compare the suited ranks high to low."],
            ["3", "Exposed threat", "Same-suit high cards are the largest warning."],
          ].map(([number, title, copy]) => (
            <div key={number} className="rounded-xl bg-black/20 p-4">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-300">{number}</span>
              <b className="mt-3 block">{title}</b>
              <p className="mt-1 text-xs leading-5 text-zinc-500">{copy}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-3">
        {stages.map((stage) => (
          <Panel key={stage.step}>
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white/[.06] text-sm font-bold">{stage.step}</span>
              <h3 className={`font-semibold ${stage.accent}`}>{stage.wager}</h3>
            </div>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-zinc-400">
              {stage.rules.map((rule) => (
                <li key={rule} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <h3 className="font-semibold">Dealer-card adjustments</h3>
          <div className="mt-4 space-y-3 text-sm">
            {[
              ["Exposed A–Q", "Be more selective. High exposed cards produced the largest strategy value and frequently turn marginal bets into checks or folds."],
              ["Matches your best suit", "Treat it as both a removed out and a direct dealer threat. Compare its rank with your private suited cards."],
              ["Different suit", "Your primary flush is less directly threatened, so stay closer to the baseline aggression rules."],
              ["Low exposed card", "Usually less dangerous, but it can still help the dealer reach qualification or length through the board."],
            ].map(([label, copy]) => (
              <div key={label} className="rounded-xl bg-black/20 p-3">
                <b className="text-zinc-200">{label}</b>
                <p className="mt-1 leading-5 text-zinc-500">{copy}</p>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <h3 className="font-semibold">Fast memory aid</h3>
          <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/[.07] p-4 text-sm leading-7 text-zinc-300">
            <p><b className="text-emerald-300">3x:</b> made three-card flush or premium two-card suited start.</p>
            <p><b className="text-sky-300">2x:</b> three-plus suited after the first board, unless the exposed card strongly dominates.</p>
            <p><b className="text-amber-300">1x:</b> call strong completed flushes; calculate marginal three-card and board-heavy hands.</p>
          </div>
          <p className="mt-4 text-xs leading-5 text-zinc-500">
            This guide is intentionally conservative around close states. The optimal policy includes the option value of waiting and cannot be represented perfectly by a short chart.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function CardGroup({ label, active, onActivate, cards, onRemove }: { label: string; active: boolean; onActivate: () => void; cards: number[]; onRemove: (card: number) => void }) {
  return (
    <section className={`rounded-xl border p-3 ${active ? "border-emerald-400/60 bg-emerald-500/10" : "border-white/10 bg-black/20"}`}>
      <button type="button" onClick={onActivate} className="w-full text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</button>
      <div className="mt-3 flex min-h-11 flex-wrap gap-2">{cards.map((card) => <CardChip key={card} card={card} onRemove={() => onRemove(card)} />)}</div>
    </section>
  );
}

function DecisionPanel({ result, closeDecision, practiceChoice, informationActive }: { result: Result; closeDecision: boolean; practiceChoice?: string; informationActive: boolean }) {
  const exact = result.informed.exact;
  const best = Math.max(...Object.values(result.informed.evs));
  const normalBest = Math.max(...Object.values(result.normal.evs));
  return (
    <div aria-live="polite">
      {practiceChoice && <div className={`mb-4 rounded-xl p-4 ${practiceChoice === result.informed.action ? "bg-emerald-500/10 text-emerald-200" : "bg-red-500/10 text-red-200"}`}><b>{practiceChoice === result.informed.action ? "Correct" : `Recommended: ${result.informed.action.toUpperCase()}`}</b></div>}
      <p className="text-xs font-bold uppercase tracking-[.18em] text-zinc-500">Recommended decision</p>
      <div className="mt-3 text-4xl font-semibold text-emerald-300">{result.informed.action.toUpperCase()}</div>
      <div className="mt-5 space-y-3">{Object.entries(result.informed.evs).map(([action, value]) => <div key={action} className="flex justify-between rounded-xl bg-black/20 p-3"><span>{action.toUpperCase()}</span><b className={value >= 0 ? "text-emerald-300" : "text-red-300"}>{fmt(value, exact)}</b></div>)}</div>
      <div className="mt-5 border-t border-white/[.07] pt-4 text-sm text-zinc-400">
        <p>Best action EV: <b className="text-white">{fmt(best, exact)} Ante units</b></p>
        <p className="mt-2">Decision margin: <b className="text-white">{result.informed.difference.toFixed(exact ? 4 : 3)} Ante units</b></p>
        {informationActive && <p className="mt-2">Without dealer information: <b className="text-white">{result.normal.action.toUpperCase()}</b> ({fmt(normalBest, result.normal.exact)})</p>}
        {informationActive && <p className="mt-2 text-emerald-200">The exposed card {result.normal.action === result.informed.action ? "keeps the same action" : `changes the action from ${result.normal.action.toUpperCase()} to ${result.informed.action.toUpperCase()}`} and changes modeled value by {fmt(best - normalBest, exact)} Ante units.</p>}
        {exact ? <p className="mt-3 text-xs text-emerald-300">Exact enumeration of every legal hidden dealer hand and required future board.</p> : <p className="mt-3 text-xs">Sampled backward induction. Independent runs differed by up to {result.stability.toFixed(3)} units.</p>}
        {closeDecision && <p className="mt-3 rounded-lg bg-amber-400/10 p-3 text-amber-200">Close or unstable estimate. Increase estimate quality before relying on the recommended action.</p>}
      </div>
    </div>
  );
}

function ResearchPanel({ sixCardPayout, setSixCardPayout }: { sixCardPayout: number; setSixCardPayout: (value: number) => void }) {
  return (
    <div className="mt-5 space-y-5">
      <Panel>
        <div className="max-w-sm"><Select label="Research paytable" value={sixCardPayout} onChange={(event) => setSixCardPayout(Number(event.target.value))}><option value={50}>Current displayed 50:1</option><option value={20}>Legacy analysis 20:1</option></Select></div>
        {sixCardPayout === 50 ? <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Exposed EV / Ante" value="+12.2279%" sub="95% CI +12.0291% to +12.4266%" /><Metric label="Information value" value="+8.6442%" sub="paired CI +8.6080% to +8.6804%" /><Metric label="Edge / initial 2 units" value="+6.1140%" sub="full exposed strategy" /><Metric label="Edge / total action" value="+3.4665%" sub="average wager 3.527184" /></div> : <div className="mt-5 rounded-xl bg-amber-400/10 p-4 text-amber-200">The validated legacy 20:1 baseline is -2.3907% per Ante. The exposed-policy headline metrics above were trained for the displayed 50:1 table and are intentionally not reused here.</div>}
      </Panel>
      <Panel>
        <h2 className="font-semibold">Exposed-card rank heatmap</h2>
        <p className="mt-1 text-sm text-zinc-500">Five-million-hand conditional holdout. EV and information value are descriptive, not additive.</p>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-13">{rankResearch.map(([rank, ev, delta]) => <div key={rank} className={`rounded-xl p-3 text-center ${ev >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"}`}><b>{rank}</b><p className={`mt-2 text-xs ${ev >= 0 ? "text-emerald-300" : "text-red-300"}`}>EV {(ev * 100).toFixed(1)}%</p><p className="mt-1 text-[.65rem] text-zinc-500">Info +{(delta * 100).toFixed(1)}%</p></div>)}</div>
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2"><Panel><h2 className="font-semibold">Rules modeled</h2><ul className="mt-4 space-y-2 text-sm leading-6 text-zinc-400"><li>Ante and X-Tra are one unit each.</li><li>Check or 3x, check or 2x, then 1x or fold.</li><li>Dealer qualifies with at least a 9-high three-card flush.</li><li>Non-qualifying dealer pushes Ante before comparison.</li><li>X-Tra pays 1 / 5 / {sixCardPayout} / 250 for 4 / 5 / 6 / 7 cards.</li></ul></Panel><Panel><h2 className="font-semibold">Information schedule</h2><div className="mt-4 grid gap-3 text-sm">{[["Baseline","+0.035836"],["Final-card access","+0.053926"],["Added at 2x stage","+0.020048"],["Added at 3x stage","+0.012469"]].map(([label, value]) => <div className="flex justify-between rounded-xl bg-black/20 p-3" key={label}><span className="text-zinc-400">{label}</span><b className="text-emerald-300">{value}</b></div>)}</div></Panel></div>
      <details className="surface rounded-[1.35rem] p-5 md:p-6"><summary className="cursor-pointer font-semibold">Research method and validation</summary><div className="mt-4 space-y-3 text-sm leading-6 text-zinc-400"><p>Policies were trained backward on two million independent legal deals per information schedule, then evaluated on 20 million new paired deals.</p><p>A separate legacy-paytable run reproduced the published -2.3907% result within 0.0524 percentage points. The displayed table says 50:1 for six cards while its analysis rows behave as 20:1, so results are kept separate by paytable.</p><p>River decisions enumerate every legal hidden dealer hand. Exposed-card 2x decisions also enumerate every future board and hidden dealer pair exactly. Opening decisions and uninformed earlier decisions use reproducible conditional Monte Carlo and retain policy-approximation uncertainty.</p></div></details>
    </div>
  );
}
