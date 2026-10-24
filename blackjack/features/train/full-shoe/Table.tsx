"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { GraduationCap, Settings2 } from "lucide-react";
import { Card, ConfirmSheet, IconButton, Sheet, announce, cx } from "@/components/ui";
import { PlayFrame } from "@/components/drill/DrillKit";
import { chipOptions } from "@/lib/blackjack/chips";
import { trayPhotoFor, trayPhotoSrc } from "@/lib/blackjack/deckPhotos";
import type { LiveEvResult } from "@/lib/blackjack/liveEv";
import type { Action } from "@/lib/blackjack/types";
import type { FullShoeGame, InsuranceChoice, Speed } from "@/lib/full-shoe/session";
import { useWakeLock } from "@/lib/pwa/useWakeLock";
import { ACTION_NAMES, toBlackjackRules } from "@/lib/strategy";
import { track } from "@/lib/analytics/track";
import { useCalculationWorker } from "@/lib/useCalculationWorker";
import { CheckoutPanel, CoachPanel, TableOptions } from "./Coach";
import { BetDock, CountCheckDock, CountResult, CountTray, InsuranceDock, NoteBand, PlayActions } from "./Docks";
import { Felt } from "./Felt";
import { money, typing } from "./format";
import { SPEED_MS } from "./tableSetup";
import { blip, type Blip } from "./sound";

class Cancelled extends Error {}

/**
 * Landscape phones (844×390) get the felt on the left and the controls on the
 * right; Tailwind only sees whole class names, so they are spelled out here.
 */
const LANDSCAPE = {
  column: "[@media(orientation:landscape)_and_(max-height:520px)]:grid [@media(orientation:landscape)_and_(max-height:520px)]:grid-cols-[minmax(0,1fr)_20rem] [@media(orientation:landscape)_and_(max-height:520px)]:grid-rows-[auto_minmax(0,1fr)] [@media(orientation:landscape)_and_(max-height:520px)]:gap-x-3",
  hud: "[@media(orientation:landscape)_and_(max-height:520px)]:col-start-2 [@media(orientation:landscape)_and_(max-height:520px)]:row-start-1",
  felt: "[@media(orientation:landscape)_and_(max-height:520px)]:col-start-1 [@media(orientation:landscape)_and_(max-height:520px)]:row-span-2 [@media(orientation:landscape)_and_(max-height:520px)]:row-start-1",
  dock: "[@media(orientation:landscape)_and_(max-height:520px)]:col-start-2 [@media(orientation:landscape)_and_(max-height:520px)]:row-start-2 [@media(orientation:landscape)_and_(max-height:520px)]:self-end",
};

type EvState = { key: string; loading: boolean; result?: LiveEvResult; error?: string };

function HudStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.6875rem] font-medium leading-4 text-ink-3">{label}</p>
      <p className="tnum truncate text-[0.9375rem] font-semibold leading-5">{value}</p>
    </div>
  );
}

export function Table({ game, onFinish }: { game: FullShoeGame; onFinish: () => void }) {
  const coached = game.setup.mode === "coached";
  const [, setVersion] = useState(0);
  const commit = useCallback(() => setVersion((value) => value + 1), []);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const [speed, setSpeed] = useState<Speed>(game.setup.speed);
  const [sound, setSound] = useState(game.setup.sound);
  const [animations, setAnimations] = useState(game.setup.animations);
  const prefs = useRef({ speed, sound, animations });
  useEffect(() => { prefs.current = { speed, sound, animations }; }, [speed, sound, animations]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [dismissed, setDismissed] = useState(0);
  const [holding, setHolding] = useState(false);
  const [ev, setEv] = useState<EvState>();
  const evId = useRef(0);
  const finished = useRef(false);
  const sheetOpen = menuOpen || coachOpen || confirmEnd;
  useWakeLock(true);

  useEffect(() => () => { generation.current += 1; }, []);

  // A shoe lives only in memory: ask before a reload or a closed tab throws it away.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (finished.current || (!game.history.length && !game.round)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [game]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onFinish();
  }, [onFinish]);

  const timing = () => {
    const base = SPEED_MS[prefs.current.speed];
    return prefs.current.animations ? base : { stagger: 0, step: Math.max(90, base.step * 0.45) };
  };
  const pause = (ms: number) => new Promise<void>((resolve, reject) => {
    const started = generation.current;
    window.setTimeout(() => (started === generation.current ? resolve() : reject(new Cancelled())), ms);
  });
  const sfx = (kind: Blip) => blip(kind, prefs.current.sound);
  const tone = () => { if (coached && game.note) sfx(game.note.ok ? "good" : "bad"); };

  const run = async (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await task();
    } catch (error) {
      if (!(error instanceof Cancelled)) throw error;
      return;
    } finally {
      busyRef.current = false;
      setBusy(false);
      commit();
    }
    if (game.phase === "over") finish();
  };

  const playDealer = async () => {
    const step = timing().step;
    await pause(step * 0.8);
    game.revealHole(); commit(); sfx("deal");
    while (game.dealerNeedsCard) { await pause(step); game.dealerDraw(); commit(); sfx("deal"); }
    await pause(step * 0.9);
    const settled = game.settle();
    if (settled) {
      if (settled.net > 0) sfx("win");
      announce(`Dealer ${settled.dealerBlackjack ? "has blackjack" : settled.dealerBust ? `busts with ${settled.dealerTotal}` : `has ${settled.dealerTotal}`}. ${settled.hands.map((hand) => hand.outcome).join(", ")}. ${settled.net >= 0 ? "Won" : "Lost"} ${money(Math.abs(settled.net))}.`);
    }
    // Leave the paid round on the felt for a beat before a count check sweeps it, or the report takes over.
    if (game.phase === "count-check" || game.phase === "over") {
      setHolding(true);
      commit();
      try { await pause(Math.max(900, step * 2.4)); } finally { setHolding(false); }
    } else commit();
  };
  const continueRound = async () => {
    while (game.phase === "playing" && game.waitingForSplitCard) { await pause(timing().step * 0.7); game.dealSplitCard(); commit(); sfx("deal"); }
    if (game.phase === "dealer") await playDealer();
  };

  /* ---------------- EV ---------------- */
  const hand = game.activeHand;
  const decisionKey = hand && game.phase === "playing" && !game.waitingForSplitCard ? `${game.roundNumber}:${hand.id}:${hand.cards.length}` : "";
  const holeShown = coached && game.setup.holeCard === "shown";
  const worker = useCalculationWorker(
    () => new Worker(new URL("../../../workers/blackjackEv.worker.ts", import.meta.url)),
    (event: MessageEvent<{ id: number; result?: LiveEvResult; error?: string }>) => {
      if (event.data.id !== evId.current) return;
      setEv((current) => (current ? { ...current, loading: false, result: event.data.result, error: event.data.error } : current));
    },
    (message) => setEv((current) => (current ? { ...current, loading: false, error: message } : current)),
  );
  const requestEv = useCallback(() => {
    const active = game.activeHand;
    const round = game.round;
    if (!active || !round || !decisionKey) return;
    const composition = { ...game.composition };
    // A hidden hole card is still unknown to the player, so it belongs in the pool of unseen cards.
    if (!holeShown) composition[round.dealer[1].rank] += 1;
    const id = ++evId.current;
    setEv({ key: decisionKey, loading: true });
    worker.postMessage({
      id,
      request: {
        playerCards: active.cards,
        dealerUpcard: round.dealer[0],
        dealerHoleCard: holeShown ? round.dealer[1] : undefined,
        composition,
        rules: toBlackjackRules(game.table.rules, game.setup.resplitAces),
        legalActions: game.legal,
      },
    });
    track("full_shoe_ev_requested", { total: active.cards.length, tc: game.tc });
  }, [decisionKey, game, holeShown, worker]);
  useEffect(() => {
    if (holeShown && decisionKey && ev?.key !== decisionKey) requestEv();
  }, [holeShown, decisionKey, ev?.key, requestEv]);
  const currentEv = ev && ev.key === decisionKey ? ev : undefined;

  /* ---------------- Actions ---------------- */
  const deal = () => run(async () => {
    if (!game.canDeal) return;
    game.deal(); commit(); tone(); sfx("deal");
    const { stagger, step } = timing();
    const cards = game.round ? game.round.hands.length * 2 + 2 : 0;
    await pause(stagger ? cards * stagger + 300 : step);
    game.dealt(); commit();
    await continueRound();
  });
  const act = (action: Action) => run(async () => {
    const evResult = holeShown && currentEv?.result ? currentEv.result : undefined;
    if (!game.act(action, evResult)) return;
    commit(); tone(); sfx("deal");
    await continueRound();
  });
  const insure = (choice: InsuranceChoice) => run(async () => {
    game.chooseInsurance(choice); commit(); tone();
    await pause(timing().step * 0.7);
    await continueRound();
  });
  const chip = (value: number) => { if (game.placeChip(value)) sfx("chip"); commit(); };
  const submitCount = (value: number) => {
    game.submitCount(value);
    if (game.countCheck?.step === "result") sfx(game.countCheck.result?.rcOk && game.countCheck.result.tcOk !== false ? "good" : "bad");
    commit();
  };
  const endNow = () => {
    generation.current += 1;
    busyRef.current = false;
    game.end();
    finish();
  };

  /* ---------------- Keyboard ---------------- */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (sheetOpen || event.metaKey || event.ctrlKey || event.altKey || typing(event)) return;
      const key = event.key.toLowerCase();
      const onButton = (event.target as HTMLElement | null)?.tagName === "BUTTON";
      if (coached && key === "c") { event.preventDefault(); setCoachOpen(true); return; }
      if (game.phase === "betting" && !busyRef.current) {
        const index = Number(key) - 1;
        if (index >= 0 && index < chipOptions.length) { event.preventDefault(); chip(chipOptions[index]); return; }
        if ((key === "enter" || key === " ") && !onButton) { event.preventDefault(); void deal(); return; }
        if (key === "u" || key === "backspace") { event.preventDefault(); game.undoChip(); commit(); return; }
        if (key === "b") { event.preventDefault(); game.repeatBets(); commit(); return; }
        if (key === "arrowleft" || key === "arrowright") { event.preventDefault(); game.selectSeat(game.selectedSeat + (key === "arrowleft" ? -1 : 1)); commit(); return; }
      }
      if (game.phase === "insurance" && !busyRef.current) {
        const offer = game.insurance!;
        if (key === "n") { event.preventDefault(); void insure("decline"); }
        if (key === "i" && !(offer.blackjacks > 0 && offer.others === 0)) { event.preventDefault(); void insure("insure"); }
        if (key === "e" && offer.blackjacks > 0) { event.preventDefault(); void insure("even-money"); }
      }
      if (coached && key === "v" && game.phase === "playing") { event.preventDefault(); requestEv(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------------- Effects ---------------- */
  // Load the next few tray photos before they are needed.
  useEffect(() => {
    for (const ahead of [0.15, 0.3, 0.5]) {
      const photo = trayPhotoFor(game.discarded / 52 + ahead);
      if (photo) new window.Image().src = trayPhotoSrc(photo);
    }
  }, [game.discarded]);

  const note = coached && game.note && game.note.id > dismissed && game.note.category !== "Running count" && game.note.category !== "True count" && game.phase !== "count-check" ? game.note : undefined;
  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setDismissed(note.id), note.ok ? 2600 : 7000);
    return () => window.clearTimeout(timer);
  }, [note]);

  const counting = game.phase === "count-check" && !holding;
  const status = holding ? (game.phase === "over" ? "That was the last round." : "Count check next…")
    : game.phase === "dealing" ? "Dealing…" : game.phase === "dealer" ? "Dealer's turn…" : game.phase === "playing" && game.waitingForSplitCard ? "Dealing to the split hand…" : "";
  const evLine = currentEv?.result && game.phase === "playing"
    ? game.legal.map((action) => `${ACTION_NAMES[action]} ${(currentEv.result!.evs[action] ?? 0) >= 0 ? "+" : "−"}${Math.abs(currentEv.result!.evs[action] ?? 0).toFixed(2)}`).join(" · ")
    : undefined;

  let dock: React.ReactNode;
  if (counting && game.countCheck) dock = game.countCheck.step === "result" ? <CountResult game={game} onContinue={() => { game.closeCountCheck(); commit(); }} /> : <CountCheckDock game={game} onSubmit={submitCount} />;
  else if (game.phase === "betting" && !holding) dock = (
    <BetDock game={game} busy={busy} onChip={chip} onDeal={() => void deal()}
      onUndo={() => { game.undoChip(); commit(); }} onClear={() => { game.clearBets(); commit(); }}
      onRepeat={() => { game.repeatBets(); sfx("chip"); commit(); }}
      onOwner={() => { game.setOwner(game.selectedSeat, (game.owners[game.selectedSeat] + 1) % game.setup.players); commit(); }} />
  );
  else if (game.phase === "insurance" && game.insurance) dock = <InsuranceDock offer={game.insurance} cash={game.cash} busy={busy} onChoose={(choice) => void insure(choice)} />;
  else dock = (
    <>
      {evLine && <p className="tnum mb-1 truncate px-0.5 text-center text-xs font-medium text-ink-2" aria-live="polite">EV {evLine}</p>}
      <PlayActions game={game} busy={busy || sheetOpen} status={status} onAct={(action) => void act(action)} onEv={coached ? requestEv : undefined}
        ev={coached ? { loading: Boolean(currentEv?.loading), ready: Boolean(currentEv?.result), error: currentEv?.error, required: holeShown } : undefined} />
    </>
  );

  return (
    <PlayFrame title={coached ? "Coached shoe" : "Checkout"} onExit={() => setConfirmEnd(true)} className="lg:max-w-6xl">
      <div className="grid min-h-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]" style={{ height: "calc(100dvh - 3.5rem - var(--safe-t) - 2rem)" }}>
        <div className={cx("flex min-h-0 flex-col gap-2", LANDSCAPE.column)}>
          {!counting && (
            <div className={cx("flex h-11 shrink-0 items-center gap-4 px-1", LANDSCAPE.hud)}>
              <HudStat label="Bankroll" value={money(game.cash)} />
              <HudStat label="Round" value={String(game.roundNumber)} />
              <HudStat label={game.phase === "betting" ? "Bet" : "On table"} value={money(game.phase === "betting" ? game.totalBet : game.staked)} />
              <div className="-mr-2 ml-auto flex items-center">
                {coached && <IconButton label="Coach" onClick={() => setCoachOpen(true)} className="lg:hidden"><GraduationCap size={20} aria-hidden /></IconButton>}
                <IconButton label="Table options" onClick={() => setMenuOpen(true)}><Settings2 size={20} aria-hidden /></IconButton>
              </div>
            </div>
          )}
          <div className={cx("relative flex min-h-0 flex-1 flex-col", LANDSCAPE.felt)}>
            {counting ? (
              <div className="min-h-0 flex-1 overflow-hidden rounded-[1.75rem] bg-felt"><CountTray game={game} /></div>
            ) : (
              <Felt className="flex-1" game={game} dealing={game.phase === "dealing"} stagger={timing().stagger} animate={animations} coached={coached}
                note={note ? <NoteBand note={note} onOpen={() => { setDismissed(note.id); setCoachOpen(true); }} /> : undefined}
                onSeat={(seat) => { game.selectSeat(seat); commit(); }} onClearTable={() => { game.clearResult(); commit(); }} />
            )}
          </div>
          <div className={cx("shrink-0", LANDSCAPE.dock)} style={{ paddingBottom: "var(--safe-b)" }}>{dock}</div>
        </div>
        <aside className="hidden min-h-0 overflow-y-auto pb-2 lg:block" aria-label={coached ? "Coach" : "Checkout"}>
          <Card>{coached ? <CoachPanel game={game} ev={currentEv?.result} /> : <CheckoutPanel game={game} />}</Card>
        </aside>
      </div>

      <Sheet open={coachOpen} onClose={() => setCoachOpen(false)} title="Coach">
        <CoachPanel game={game} ev={currentEv?.result} />
      </Sheet>
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Table options">
        <TableOptions speed={speed} sound={sound} animations={animations} coached={coached}
          onSpeed={setSpeed} onSound={setSound} onAnimations={setAnimations}
          onEnd={() => { setMenuOpen(false); setConfirmEnd(true); }} />
      </Sheet>
      <ConfirmSheet open={confirmEnd} onClose={() => setConfirmEnd(false)} onConfirm={endNow} title="End this shoe?" confirmLabel="End and see the report">
        You get the report for the {game.history.length} {game.history.length === 1 ? "round" : "rounds"} played so far. Money on the table goes back to your bankroll.
      </ConfirmSheet>
    </PlayFrame>
  );
}
