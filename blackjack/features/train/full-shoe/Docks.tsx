"use client";
import { useState } from "react";
import { Calculator, Check, LoaderCircle, RotateCcw, Undo2, X } from "lucide-react";
import { ActionPad, NumberPad, TrayPhoto } from "@/components/blackjack";
import { Button, Kbd, cx } from "@/components/ui";
import { Feedback } from "@/components/drill/DrillKit";
import { chipOptions, chipLabel } from "@/lib/blackjack/chips";
import type { Action } from "@/lib/blackjack/types";
import type { InsuranceOffer } from "@/lib/full-shoe/round";
import { handTotalLabel } from "@/lib/full-shoe/round";
import { RESOLUTION_PHRASE, ROUNDING_PHRASE } from "@/lib/full-shoe/grading";
import type { CoachNote, FullShoeGame, InsuranceChoice } from "@/lib/full-shoe/session";
import { ChipFace } from "./Felt";
import { decksLabel, money, signed } from "./format";

const hoverOnly = "hidden [@media(hover:hover)]:inline-flex";

/* ------------------------------------------------------------------ */
/* Betting                                                             */
/* ------------------------------------------------------------------ */

export function BetDock({ game, busy, onChip, onUndo, onClear, onRepeat, onDeal, onOwner }: {
  game: FullShoeGame; busy: boolean; onChip: (value: number) => void; onUndo: () => void; onClear: () => void; onRepeat: () => void; onDeal: () => void; onOwner: () => void;
}) {
  const seat = game.selectedSeat;
  const players = game.setup.players;
  const seatsWithBets = game.bets.filter(Boolean).length;
  return (
    <div className="space-y-2">
      <div className="flex min-h-9 items-center justify-between gap-2 px-0.5 text-sm">
        <span className="flex min-w-0 items-center gap-1.5 text-ink-2">
          <span className="truncate">Seat {seat + 1}</span>
          {players > 1 && (
            <button type="button" onClick={onOwner} className="h-9 rounded-lg border border-line bg-surface-2 px-2.5 text-xs font-semibold text-ink hover:bg-surface-3" aria-label={`Seat ${seat + 1} belongs to player ${game.owners[seat] + 1}. Change player`}>
              Player {game.owners[seat] + 1}
            </button>
          )}
        </span>
        <span className="tnum whitespace-nowrap font-semibold">{money(game.totalBet)} <span className="font-normal text-ink-3">bet{seatsWithBets > 1 ? ` on ${seatsWithBets} seats` : ""}</span></span>
      </div>
      {/* Seven equal columns: every chip stays in view, up to 44px each, on the narrowest dock. */}
      <div role="group" aria-label="Chips" className="grid grid-cols-7 justify-items-center gap-1 py-0.5">
        {chipOptions.map((value, index) => (
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
      <div className="flex min-h-9 items-center justify-between gap-2 px-0.5 text-sm" aria-live="polite">
        {playing && hand ? (
          <span className="min-w-0 truncate">
            <span className="text-ink-2">{game.setup.players > 1 ? `P${hand.owner + 1} · ` : ""}{round!.hands.length > 1 || game.setup.players > 1 ? `Seat ${hand.seat + 1}` : "Your hand"}{seatHands.length > 1 ? ` · hand ${seatHands.indexOf(hand) + 1} of ${seatHands.length}` : ""} · </span>
            <span className="tnum font-semibold">{handTotalLabel(hand.cards)} · {money(hand.bet)}</span>
          </span>
        ) : (
          <span className="flex items-center gap-2 text-ink-2">{busy && <LoaderCircle size={15} className="animate-spin" aria-hidden />}{status}</span>
        )}
        {onEv && playing && (
          <Button variant="ghost" size="sm" className="-mr-1 h-9 shrink-0" disabled={busy || ev?.loading} onClick={onEv} icon={ev?.loading ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <Calculator size={15} aria-hidden />}>
            {ev?.loading ? "EV…" : "EV"}
          </Button>
        )}
      </div>
      {/* Five buttons share 288px on a 320px phone: smaller labels keep "Surrender" inside its button. */}
      <ActionPad onAnswer={onAct} available={legal} disabled={busy || !playing || waitForEv}
        className="!gap-1 [&_button>span:first-child]:text-[0.6875rem] min-[360px]:[&_button>span:first-child]:text-[0.8125rem] sm:[&_button>span:first-child]:text-[0.9375rem] [@media(orientation:landscape)_and_(max-height:520px)]:[&_button>span:first-child]:!text-[0.75rem]" />
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
        <TrayPhoto photo={game.trayPhoto} className="h-full max-h-[22rem] [&>div]:h-full [&>div]:w-auto" zoomable priority label="Discard tray" />
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
