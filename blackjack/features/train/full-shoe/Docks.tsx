"use client";
import { useEffect, useState } from "react";
import { Calculator, Check, LoaderCircle, RotateCcw, Undo2, X } from "lucide-react";
import { ActionPad, NumberPad, TrayPhoto } from "@/components/blackjack";
import { Button, Kbd, cx } from "@/components/ui";
import { Feedback } from "@/components/drill/DrillKit";
import { chipLabel } from "@/lib/blackjack/chips";
import type { Action } from "@/lib/blackjack/types";
import type { InsuranceOffer } from "@/lib/full-shoe/round";
import { handTotalLabel } from "@/lib/full-shoe/round";
import { RESOLUTION_PHRASE, ROUNDING_PHRASE } from "@/lib/full-shoe/grading";
import type { CoachNote, FullShoeGame, InsuranceChoice } from "@/lib/full-shoe/session";
import { ChipFace, EmptyTray } from "./Felt";
import { decksLabel, money, signed } from "./format";

const hoverOnly = "hidden [@media(hover:hover)]:inline-flex";

/* ------------------------------------------------------------------ */
/* Betting                                                             */
/* ------------------------------------------------------------------ */

const dockButton = "h-11 shrink-0 rounded-lg border border-line bg-surface-2 px-2.5 text-xs font-semibold text-ink hover:bg-surface-3 sm:h-9";

export function BetDock({ game, busy, onChip, onUndo, onClear, onRepeat, onDeal, onOwner, onSitOut }: {
  game: FullShoeGame; busy: boolean; onChip: (value: number) => void; onUndo: () => void; onClear: () => void; onRepeat: () => void; onDeal: () => void; onOwner: () => void; onSitOut: () => void;
}) {
  const seat = game.selectedSeat;
  const players = game.setup.players;
  const seatsWithBets = game.bets.filter(Boolean).length;
  const short = game.underMinimum;
  return (
    <div className="space-y-2">
      <div className="flex min-h-9 items-center justify-between gap-2 px-0.5 text-sm">
        <span className="flex min-w-0 items-center gap-1.5 text-ink-2">
          <span className="truncate">Seat {seat + 1}</span>
          {players > 1 && (
            <button type="button" onClick={onOwner} className={dockButton} aria-label={`Seat ${seat + 1} belongs to player ${game.owners[seat] + 1}. Change player`}>
              Player {game.owners[seat] + 1}
            </button>
          )}
          {game.setup.wong && <button type="button" onClick={onSitOut} disabled={busy} className={dockButton}>Sit out</button>}
        </span>
        {short !== undefined ? (
          <span role="status" className="whitespace-nowrap text-xs font-semibold text-warn">Seat {short + 1}: {money(game.tableMin)} minimum</span>
        ) : (
          <span className="tnum whitespace-nowrap font-semibold">{money(game.totalBet)} <span className="font-normal text-ink-3">bet{seatsWithBets > 1 ? ` on ${seatsWithBets} seats` : ""}</span></span>
        )}
      </div>
      {/* Equal columns: every chip stays in view, up to 44px each, on the narrowest dock. */}
      <div role="group" aria-label="Chips" className="grid justify-items-center gap-1 py-0.5" style={{ gridTemplateColumns: `repeat(${game.chips.length}, minmax(0, 1fr))` }}>
        {game.chips.map((value, index) => (
          <button key={value} type="button" disabled={busy || !game.canAdd(value)} onClick={() => onChip(value)} aria-label={`Add a ${chipLabel(value)} chip`} aria-keyshortcuts={String(index + 1)}
            className="relative grid aspect-square w-full max-w-11 place-items-center rounded-full transition active:scale-95 disabled:opacity-30">
            <ChipFace value={value} className="h-full w-full text-[0.625rem]" />
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)] gap-1.5">
        <Button variant="secondary" size="md" className="px-1 text-sm" disabled={busy || !game.chipHistory.length} onClick={onUndo} icon={<Undo2 size={16} aria-hidden />}>Undo</Button>
        <Button variant="secondary" size="md" className="px-1 text-sm" disabled={busy || !game.totalBet} onClick={onClear} icon={<X size={16} aria-hidden />}>Clear</Button>
        <Button variant="secondary" size="md" className="px-1 text-sm" disabled={busy || !game.canRepeat} onClick={onRepeat} icon={<RotateCcw size={16} aria-hidden />}>Repeat</Button>
        <Button size="md" disabled={busy || !game.canDeal} onClick={onDeal} trailing={<span className={hoverOnly}><Kbd>↵</Kbd></span>}>Deal</Button>
      </div>
    </div>
  );
}

/** Back-counting, between rounds while you watch: deal the others another round, or sit in. */
export function WatchDock({ game, busy, onWatch, onSitIn }: { game: FullShoeGame; busy: boolean; onWatch: () => void; onSitIn: () => void }) {
  return (
    <div className="space-y-2" data-testid="watch-dock">
      <p className="min-h-9 px-0.5 text-sm leading-5 text-ink-2">
        <span className="font-semibold text-ink">Watching.</span> Keep the count; sit in at a true count of {signed(game.setup.wong!.enter)} or higher.
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        <Button variant="secondary" size="lg" className="px-2 text-[0.9375rem]" disabled={busy} onClick={onWatch} trailing={<span className={hoverOnly}><Kbd>↵</Kbd></span>}>Watch a round</Button>
        <Button size="lg" className="px-2 text-[0.9375rem]" disabled={busy} onClick={onSitIn}>Sit in</Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Casino pace                                                         */
/* ------------------------------------------------------------------ */

/** The time left for the decision on screen. Kept in the layout between decisions (empty), so the felt never jumps. */
export function Countdown({ endsAt, seconds }: { endsAt?: number; seconds: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === undefined) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [endsAt]);
  const left = endsAt === undefined ? 0 : Math.min(seconds * 1000, Math.max(0, endsAt - now));
  const share = left / (seconds * 1000);
  return (
    <div className="mb-1.5 flex h-4 items-center gap-2 px-0.5" role="timer" aria-label="Time left for this decision">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
        <div className={cx("h-full rounded-full", share > 1 / 3 ? "bg-brand" : "bg-neg")} style={{ width: `${share * 100}%` }} />
      </div>
      <span className={cx("tnum w-9 text-right text-xs font-semibold", endsAt === undefined ? "text-ink-3" : share > 1 / 3 ? "text-ink" : "text-neg")}>{endsAt === undefined ? `${seconds} s` : `${Math.ceil(left / 1000)} s`}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Insurance                                                           */
/* ------------------------------------------------------------------ */

export function InsuranceDock({ offer, cash, busy, onChoose }: { offer: InsuranceOffer; cash: number; busy: boolean; onChoose: (choice: InsuranceChoice) => void }) {
  const onlyBlackjack = offer.blackjacks > 0 && offer.others === 0;
  return (
    <div className="space-y-2">
      <p className="px-0.5 text-sm font-medium">
        The dealer shows an ace. {onlyBlackjack ? "You have blackjack: take even money?" : offer.blackjacks ? "Insurance, or even money on your blackjack?" : "Insurance?"}
      </p>
      <div className={cx("grid gap-1.5", onlyBlackjack ? "grid-cols-2" : offer.blackjacks ? "grid-cols-3" : "grid-cols-2")}>
        <Button variant="outline" size="lg" className="px-2 text-[0.9375rem]" disabled={busy} onClick={() => onChoose("decline")} trailing={<span className={hoverOnly}><Kbd>N</Kbd></span>}>
          {onlyBlackjack ? "No, play it" : "No insurance"}
        </Button>
        {!onlyBlackjack && (
          <Button variant="outline" size="lg" className="px-2 text-[0.9375rem]" disabled={busy || offer.full > cash + 1e-9} onClick={() => onChoose("insure")} trailing={<span className={hoverOnly}><Kbd>I</Kbd></span>}>
            Insure {money(offer.full)}
          </Button>
        )}
        {offer.blackjacks > 0 && (
          <Button variant="outline" size="lg" className="px-2 text-[0.9375rem]" disabled={busy || offer.evenMoney > cash + 1e-9} onClick={() => onChoose("even-money")} trailing={<span className={hoverOnly}><Kbd>E</Kbd></span>}>
            Even money
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Playing                                                             */
/* ------------------------------------------------------------------ */

export function PlayActions({ game, busy, status, ev, onAct, onEv }: {
  game: FullShoeGame;
  busy: boolean;
  status: string;
  ev?: { loading: boolean; ready: boolean; error?: string; required: boolean };
  onAct: (action: Action) => void;
  onEv?: () => void;
}) {
  const hand = game.activeHand;
  const round = game.round;
  const playing = game.phase === "playing" && hand && !game.waitingForSplitCard;
  const seatHands = round && hand ? round.hands.filter((item) => item.seat === hand.seat) : [];
  const legal = playing ? game.legal : [];
  const waitForEv = Boolean(ev?.required && !ev.ready && !ev.error);
  return (
    <div className="space-y-2">
      <div className="flex min-h-11 items-center justify-between gap-2 px-0.5 text-sm sm:min-h-9" aria-live="polite">
        {playing && hand ? (
          <span className="min-w-0 truncate">
            <span className="text-ink-2">{game.setup.players > 1 ? `P${hand.owner + 1} · ` : ""}{round!.hands.length > 1 || game.setup.players > 1 ? `Seat ${hand.seat + 1}` : "Your hand"}{seatHands.length > 1 ? ` · hand ${seatHands.indexOf(hand) + 1} of ${seatHands.length}` : ""} · </span>
            <span className="tnum font-semibold">{handTotalLabel(hand.cards)} · {money(hand.bet)}</span>
          </span>
        ) : (
          <span className="flex items-center gap-2 text-ink-2">{busy && <LoaderCircle size={15} className="animate-spin" aria-hidden />}{status}</span>
        )}
        {onEv && playing && (
          <Button variant="ghost" size="sm" className="-mr-1 h-11 shrink-0 sm:h-9" disabled={busy || ev?.loading} onClick={onEv} icon={ev?.loading ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <Calculator size={15} aria-hidden />}>
            {ev?.loading ? "EV…" : "EV"}
          </Button>
        )}
      </div>
      {/* The pad scales its labels with the screen width; only a short landscape phone needs them smaller still. */}
      <ActionPad onAnswer={onAct} available={legal} disabled={busy || !playing || waitForEv}
        className="!gap-1 [@media(orientation:landscape)_and_(max-height:520px)]:[&_button>span:first-child]:!text-[0.75rem]" />
      {waitForEv && <p className="text-center text-xs text-ink-3">Working out the EV for this hole card…</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Count checks                                                        */
/* ------------------------------------------------------------------ */

export function CountCheckDock({ game, onSubmit }: { game: FullShoeGame; onSubmit: (value: number) => void }) {
  const check = game.countCheck!;
  const [value, setValue] = useState("");
  const step = check.step;
  const decks = game.setup.rules.decks;
  const prompt = step === "rc" ? "Running count?" : step === "decks" ? "Decks left in the shoe?" : "True count?";
  const hint = step === "rc"
    ? `Every card seen so far, through round ${check.afterRound}.`
    : step === "decks"
      ? `A ${decks}-deck shoe minus the decks in the tray, to ${RESOLUTION_PHRASE[game.setup.resolution]}.`
      : `${signed(check.rc ?? 0)} ÷ ${check.decks} decks, ${ROUNDING_PHRASE[game.setup.rounding]}.`;
  const submit = () => {
    if (value === "" || value === "-" || value === ".") return;
    // Decks left is always more than zero; keep the entry so it can be corrected.
    if (step === "decks" && !(Number(value) > 0)) return;
    onSubmit(Number(value));
    setValue("");
  };
  const shown = value === "" ? "?" : value.startsWith("-") ? `−${value.slice(1)}` : value;
  return (
    <div className="space-y-2" data-testid="count-check">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <p className="eyebrow">Count check{game.setup.countDepth === "true" ? ` · ${step === "rc" ? 1 : step === "decks" ? 2 : 3} of 3` : ""}</p>
          <h2 className="mt-0.5 text-base font-semibold">{prompt}</h2>
          <p className="line-clamp-2 text-xs leading-4 text-ink-3 [@media(orientation:landscape)_and_(max-height:520px)]:hidden">{hint}</p>
        </div>
        <output aria-label={prompt} className={cx("tnum grid h-12 min-w-[4.5rem] shrink-0 place-items-center rounded-xl border-2 border-line-strong bg-surface px-3 font-mono text-2xl font-semibold", value === "" ? "text-ink-3" : "text-ink")}>{shown}</output>
      </div>
      <NumberPad key={step} value={value} onChange={setValue} onSubmit={submit} allowNegative={step !== "decks"} allowDecimal={step === "decks"} maxLength={step === "decks" ? 4 : 3} submitLabel={step === "tc" || (step === "rc" && game.setup.countDepth === "running") ? "Check" : "Next"} />
    </div>
  );
}

/** Coached only: what the count check found, before the next bet. */
export function CountResult({ game, onContinue }: { game: FullShoeGame; onContinue: () => void }) {
  const result = game.countCheck!.result!;
  const ok = result.rcOk && result.tcOk !== false;
  const row = (label: string, good: boolean | undefined, yours: string, right: string) => (
    <li className="flex items-center gap-2">
      <span className={cx("grid h-4 w-4 shrink-0 place-items-center rounded-full text-white", good ? "bg-pos" : "bg-neg")}>{good ? <Check size={10} strokeWidth={3} aria-hidden /> : <X size={10} strokeWidth={3} aria-hidden />}</span>
      <span className="min-w-0 flex-1">{label}</span>
      <span className="tnum whitespace-nowrap">{good ? right : <><span className="text-neg line-through">{yours}</span> <span className="font-semibold text-ink">{right}</span></>}</span>
    </li>
  );
  return (
    <Feedback ok={ok} title={ok ? "Count on track" : "Count off"} onContinue={onContinue} continueLabel="Next bet">
      <ul className="mt-1 space-y-1">
        {row("Running count", result.rcOk, signed(result.answer.rc), signed(result.expected.rc))}
        {result.answer.decks !== undefined && row("Decks left", result.decksOk, String(result.answer.decks), result.acceptedDecks.join(" or "))}
        {result.answer.tc !== undefined && row("True count", result.tcOk, signed(result.answer.tc), signed(result.expected.tc))}
      </ul>
      <p className="mt-1.5 text-xs leading-5">{result.tcExplanation ?? result.rcExplanation}</p>
    </Feedback>
  );
}

/** The tray, big, for reading the decks left during a count check. */
export function CountTray({ game }: { game: FullShoeGame }) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 p-3">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {game.trayPhoto
          ? <TrayPhoto photo={game.trayPhoto} className="h-full max-h-[22rem] [&>div]:h-full [&>div]:w-auto" zoomable priority label="Discard tray" />
          : <EmptyTray cards={game.discarded} long className="h-full max-h-[22rem]" />}
      </div>
      <p className="text-center text-xs font-medium text-white/75">{decksLabel(game.setup.rules.decks)} in the shoe at the start · cut card at {Math.round(game.setup.penetration * 100)}%</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Coached feedback                                                    */
/* ------------------------------------------------------------------ */

/**
 * The coach's note after a decision, in the band between the dealer and the
 * seats so it never covers a card. It never blocks play: it fades on its own,
 * the next decision replaces it, and a tap opens the coach for the full story.
 */
export function NoteBand({ note, onOpen }: { note: CoachNote; onOpen: () => void }) {
  return (
    <div role="status" className="w-full max-w-sm px-1">
      <button type="button" onClick={onOpen} className={cx("animate-pop flex w-full items-start gap-2.5 rounded-2xl border bg-surface px-3 py-2 text-left shadow-2", note.ok ? "border-pos/40" : "border-neg/40")}>
        <span className={cx("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-white", note.ok ? "bg-pos" : "bg-neg")}>
          {note.ok ? <Check size={12} strokeWidth={3} aria-hidden /> : <X size={12} strokeWidth={3} aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold text-ink">{note.title}</span>
            <span className="tnum shrink-0 text-xs font-medium text-ink-3">TC {signed(note.tc)}</span>
          </span>
          <span className="line-clamp-2 text-xs leading-4 text-ink-2">{note.detail}</span>
        </span>
      </button>
    </div>
  );
}
