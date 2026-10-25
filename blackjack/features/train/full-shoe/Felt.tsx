"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Expand } from "lucide-react";
import { PlayingCard, TrayPhoto } from "@/components/blackjack";
import { Sheet, cx } from "@/components/ui";
import { chipColorClasses, chipLabel } from "@/lib/blackjack/chips";
import { calculateHandValue } from "@/lib/blackjack/hand";
import type { TrayPhoto as TrayPhotoData } from "@/lib/blackjack/deckPhotos";
import type { Card } from "@/lib/blackjack/types";
import { CARD_REVEAL, FELT_CARD_WIDTH, pickCardSizes, type FeltCardSize } from "@/lib/full-shoe/layout";
import { handTotalLabel, type Round, type SeatHand, type Settlement } from "@/lib/full-shoe/round";
import { SEATS, type FullShoeGame } from "@/lib/full-shoe/session";
import { money, typing } from "./format";

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

/**
 * A hand as dealt: overlapped, each card dropping in with its place in the
 * deal order. Cards only ever get appended, so the animation plays once per
 * card; the hole card remounts when it is turned, which flips it in.
 */
export function HandCards({ cards, size, faceDownIndex, delays, animate, label, className }: {
  cards: Card[]; size: FeltCardSize; faceDownIndex?: number; delays?: (number | undefined)[]; animate: boolean; label: string; className?: string;
}) {
  const width = FELT_CARD_WIDTH[size];
  return (
    <div role="group" aria-label={label} className={cx("flex", className)}>
      {cards.map((card, index) => {
        const down = index === faceDownIndex;
        return (
          <PlayingCard
            key={`${index}-${down ? "down" : "up"}`}
            card={card}
            faceDown={down}
            style={{ "--card-w": `${width}px`, marginLeft: index ? -width * (1 - CARD_REVEAL) : undefined } as CSSProperties}
            animate={animate}
            delay={animate ? delays?.[index] ?? 0 : 0}
          />
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chips                                                               */
/* ------------------------------------------------------------------ */

export function ChipFace({ value, className }: { value: number; className?: string }) {
  return (
    <span aria-hidden className={cx("grid shrink-0 place-items-center rounded-full border-[3px] border-dashed font-black shadow-[0_4px_10px_-2px_rgb(0_0_0/0.5)]", chipColorClasses(value), className)}>
      {chipLabel(value)}
    </span>
  );
}

/** The chip a bet of this size would sit under: the biggest denomination it contains. */
const topChip = (amount: number) => [1000, 500, 100, 25, 5, 1, 0.5].find((chip) => amount >= chip) ?? 0.5;

/* ------------------------------------------------------------------ */
/* The discard tray                                                    */
/* ------------------------------------------------------------------ */

/**
 * The tray before its first photo (under a quarter deck), saying what it
 * holds: TrayPhoto's own placeholder reads "still empty" even after rounds.
 * Count checks accept reading it as a full shoe.
 */
export function EmptyTray({ cards, width, long = false, className }: { cards: number; width?: number; long?: boolean; className?: string }) {
  const text = cards ? (long ? "Under a quarter deck in the tray: the shoe is still about full." : "Under ¼ deck") : long ? "The tray is empty: the shoe is full." : "Empty";
  return (
    <div role="img" aria-label={`Discard tray: ${cards ? "under a quarter deck" : "empty"}`} style={width ? { width, height: Math.round((width * 848) / 629) } : { aspectRatio: "629 / 848" }}
      className={cx("grid shrink-0 place-items-center rounded-2xl border border-line bg-[linear-gradient(180deg,#2a2f37,#1a1d23)] text-center font-medium leading-tight text-white/70", long ? "p-4 text-sm" : "p-1.5 text-[0.625rem]", className)}>
      {text}
    </div>
  );
}

/** The real tray photo for the cards discarded so far. Tap for a big view: estimating decks left from it is the skill. */
export function TrayButton({ photo, cards, width, label = "Discard tray", hotkey = false }: { photo: TrayPhotoData | undefined; cards: number; width: number; label?: string; hotkey?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!hotkey) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event)) return;
      if (event.key.toLowerCase() === "t") { event.preventDefault(); setOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkey]);
  return (
    <>
      {/* The whole photo is the tap target; the button sits over it so the figure stays valid HTML. */}
      <div className="group relative shrink-0" style={{ width }} data-testid={photo ? "full-shoe-discard-photo" : "full-shoe-empty-tray"}>
        {photo ? <TrayPhoto photo={photo} width={width} zoomable={false} priority label={label} /> : <EmptyTray cards={cards} width={width} />}
        {photo && <span aria-hidden className="pointer-events-none absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-md bg-black/50 text-white group-hover:bg-black/70"><Expand size={13} /></span>}
        <button type="button" onClick={() => setOpen(true)} aria-label={`${label}: enlarge the photo`} className="absolute inset-0 rounded-2xl outline-offset-2" />
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Discard tray" description="Every card played so far. Decks left in the shoe = shoe size − decks in the tray.">
        {photo ? <TrayPhoto photo={photo} zoomable={false} className="mx-auto max-w-sm" priority label={label} /> : <EmptyTray cards={cards} long className="mx-auto max-w-[14rem]" />}
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Seats                                                               */
/* ------------------------------------------------------------------ */

const OUTCOME_TONE: Record<string, string> = { Win: "text-pos", Blackjack: "text-pos", Push: "text-ink-2", Loss: "text-neg", Bust: "text-neg", Surrender: "text-neg", "Dealer blackjack": "text-neg" };

function HandView({ hand, size, active, result, delays, animate, label }: {
  hand: SeatHand; size: FeltCardSize; active: boolean; result?: { net: number; outcome: string }; delays?: (number | undefined)[]; animate: boolean; label: string;
}) {
  const total = handTotalLabel(hand.cards, hand.status === "blackjack");
  return (
    <div data-testid="full-shoe-player-hand" data-active={active || undefined}
      className={cx("flex min-w-0 flex-col items-center rounded-2xl px-1.5 pb-1 pt-1.5 transition", active ? "bg-white/10 ring-2 ring-brand" : hand.status === "waiting" && "opacity-60")}>
      <HandCards cards={hand.cards} size={size} delays={delays} animate={animate} label={label} />
      <p className={cx("tnum mt-1 whitespace-nowrap font-semibold text-white/90", FELT_CARD_WIDTH[size] < 58 ? "text-[0.6875rem]" : "text-[0.75rem]")}>
        {money(hand.bet)}{hand.doubled ? " doubled" : ""} · {hand.status === "waiting" ? "next" : hand.status === "surrendered" ? "surrendered" : hand.status === "busted" ? `bust ${calculateHandValue(hand.cards)}` : total}
      </p>
      {result && (
        <span className={cx("tnum mt-0.5 whitespace-nowrap rounded-full bg-surface px-2 py-px text-[0.6875rem] font-bold shadow-1", OUTCOME_TONE[result.outcome])}>
          {/* Small cards get just the money, so a row of split hands keeps its width. */}
          {FELT_CARD_WIDTH[size] < 58 && result.net
            ? <><span className="sr-only">{result.outcome} </span>{money(result.net, { sign: true })}</>
            : <>{result.outcome}{result.net ? ` ${money(result.net, { sign: true })}` : ""}</>}
        </span>
      )}
    </div>
  );
}

function BetCircle({ seat, amount, selected, owner, players, rampHint, onSelect, disabled }: {
  seat: number; amount: number; selected: boolean; owner: number; players: number; rampHint?: { ok: boolean; text: string }; onSelect: () => void; disabled: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <button type="button" onClick={onSelect} disabled={disabled} aria-pressed={selected}
        aria-label={`Seat ${seat + 1}${players > 1 ? `, player ${owner + 1}` : ""}: ${amount ? money(amount) : "no bet"}${selected ? ", selected" : ""}`}
        className={cx(
          "relative grid aspect-square w-full max-w-[4.25rem] place-items-center rounded-full border-2 border-dashed transition",
          selected ? "border-brand bg-white/10 ring-2 ring-brand/60" : "border-white/30 hover:border-white/60",
        )}>
        {amount > 0 ? <ChipFace value={topChip(amount)} className="h-[70%] w-[70%] text-[0.625rem]" /> : <span className="text-[0.625rem] font-semibold uppercase tracking-wider text-white/45">Bet</span>}
      </button>
      <p className="tnum mt-1 h-4 whitespace-nowrap text-[0.6875rem] font-semibold text-white/85">{players > 1 ? `P${owner + 1}${amount > 0 ? ` · ${money(amount)}` : ""}` : amount > 0 ? money(amount) : ""}</p>
      <p className={cx("h-4 whitespace-nowrap text-[0.625rem] font-semibold", rampHint?.ok ? "text-white/80" : "text-brand")}>
        {rampHint?.text ?? ""}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The felt                                                            */
/* ------------------------------------------------------------------ */

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Deal-order delays for the opening four cards of every hand and the dealer. */
function dealDelays(round: Round, stagger: number) {
  const seats = round.hands.length;
  const player = (index: number) => [index * stagger, (seats + 1 + index) * stagger];
  const dealer = [seats * stagger, (2 * seats + 1) * stagger];
  return { player, dealer };
}

/** Height kept free between the dealer and the seats for the coach's note. */
export const NOTE_BAND = 76;

export function Felt({ game, dealing, stagger, animate, coached, note, onSeat, onClearTable, className }: {
  game: FullShoeGame; dealing: boolean; stagger: number; animate: boolean; coached: boolean;
  /** Coached only: the note shown in the band between the dealer and the seats. */
  note?: ReactNode;
  onSeat: (seat: number) => void; onClearTable: () => void; className?: string;
}) {
  const [ref, box] = useSize<HTMLDivElement>();
  const shown: { round: Round; settlement?: Settlement } | undefined = game.round ? { round: game.round } : game.lastResult;
  const round = shown?.round;
  const betting = game.phase === "betting" && !game.lastResult;
  const holeShown = Boolean(round && (round.holeRevealed || game.setup.holeCard === "shown"));
  const compact = box.height > 0 && box.height < 300;
  const trayWidth = box.width < 340 ? 52 : box.width < 520 ? 62 : 84;

  const seatGroups = round ? groupBySeat(round.hands) : [];
  const layout = pickCardSizes({
    width: Math.max(0, box.width - 16),
    height: Math.max(0, box.height - (coached ? NOTE_BAND : compact ? 0 : 28)),
    dealerCards: round?.dealer.length ?? 2,
    seats: betting ? [[2]] : seatGroups.map((group) => group.hands.map((hand) => hand.cards.length)),
    reserve: trayWidth + 10,
    max: box.width >= 600 ? "2xl" : "xl",
  });
  const delays = round && dealing ? dealDelays(round, stagger) : undefined;
  const results = new Map(shown?.settlement?.hands.map((result) => [result.id, result]));
  const settlement = shown?.settlement;
  const dealerTotal = round ? (holeShown ? handTotalLabel(round.dealer, true) : handTotalLabel(round.dealer.slice(0, 1))) : "";
  const multiSeat = seatGroups.length > 1 || game.setup.players > 1;
  const rampBet = coached && betting ? game.rampBet : undefined;
  const rules = game.table.rules;

  return (
    <div ref={ref} className={cx("relative min-h-0 overflow-hidden rounded-[1.75rem] bg-felt shadow-[inset_0_0_80px_rgb(0_0_0/0.35)] ring-1 ring-black/10", className)}>
      <div aria-hidden className="pointer-events-none absolute inset-2 rounded-[1.4rem] border border-white/10" />
      {/* The discard tray sits in the corner, as on a real table. */}
      <div className="absolute left-2.5 top-2.5 z-10">
        <TrayButton photo={game.trayPhoto} cards={game.discarded} width={trayWidth} hotkey />
      </div>
      <div className="relative flex h-full flex-col items-center px-2 pb-2 pt-2.5">
        {/* Dealer */}
        <div className="flex flex-col items-center">
          <p className="h-4 text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-white/60">
            Dealer{round && <span className="tnum normal-case tracking-normal text-white/85"> · {settlement?.dealerBust ? `bust ${settlement.dealerTotal}` : dealerTotal}</span>}
          </p>
          <div className="mt-1.5 flex justify-center" style={{ minHeight: FELT_CARD_WIDTH[layout.dealer] * 1.4 }}>
            {round && (
              <HandCards cards={round.dealer} size={layout.dealer} faceDownIndex={holeShown ? undefined : 1} delays={delays?.dealer} animate={animate}
                label={`Dealer's cards${holeShown ? "" : ", one face down"}`} />
            )}
          </div>
        </div>

        {/* The band between dealer and seats: the coach's note, the table print, or a way to sweep the last round. */}
        <div className="flex w-full flex-1 flex-col items-center justify-center py-1 text-center" style={{ minHeight: coached ? NOTE_BAND : 8 }}>
          {note ?? (game.phase === "betting" && game.lastResult ? (
            <button type="button" onClick={onClearTable} className="h-11 rounded-full bg-black/25 px-4 text-sm font-semibold text-white/85 hover:bg-black/40">Clear the table</button>
          ) : game.watchedRound || (betting && game.watching) ? (
            <p className="rounded-full bg-black/25 px-3 py-1 text-xs font-semibold text-white/85">You are watching: count every card</p>
          ) : !compact || coached ? (
            <div aria-hidden className="select-none">
              <p className="text-[0.75rem] font-bold uppercase tracking-[0.22em] text-brand/70">Blackjack pays {game.setup.blackjackPayout === 1.5 ? "3 to 2" : "6 to 5"}</p>
              <p className="mt-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-white/40">Dealer {rules.hitSoft17 ? "hits" : "stands on"} soft 17<span className="hidden xs:inline"> · Insurance pays 2 to 1</span></p>
              {!compact && <p className="tnum mt-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-white/30">Table limits {money(game.tableMin)} to {money(game.tableMax)}</p>}
            </div>
          ) : null)}
        </div>

        {/* Seats */}
        {betting ? (
          <div className="flex w-full max-w-md items-start justify-center gap-1.5 px-1 pb-1">
            {Array.from({ length: SEATS }, (_, seat) => {
              const amount = game.bets[seat];
              const hint = rampBet !== undefined && amount > 0 ? (Math.abs(amount - rampBet) < 0.005 ? { ok: true, text: "On the ramp" } : { ok: false, text: `Ramp ${money(rampBet)}` }) : undefined;
              return <BetCircle key={seat} seat={seat} amount={amount} selected={game.selectedSeat === seat} owner={game.owners[seat]} players={game.setup.players} rampHint={hint} disabled={game.watching} onSelect={() => onSeat(seat)} />;
            })}
          </div>
        ) : (
          <SeatsRail activeId={game.activeHand?.id}>
            {seatGroups.map((group, seatIndex) => (
              <div key={group.seat} data-table-spot={group.seat} className="flex shrink-0 flex-col items-center">
                {multiSeat && <p className="mb-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-white/55">{game.setup.players > 1 && group.owner >= 0 ? `P${group.owner + 1} · ` : ""}Seat {group.seat + 1}</p>}
                <div data-testid="full-shoe-spot-hands" className="flex items-end gap-2">
                  {group.hands.map((hand) => {
                    const index = round!.hands.indexOf(hand);
                    const opening = !hand.fromSplit && delays ? delays.player(seatIndex) : undefined;
                    return (
                      <HandView key={hand.id} hand={hand} size={layout.player} active={game.phase === "playing" && round!.active === index}
                        result={results.get(hand.id)} delays={opening} animate={animate}
                        label={`${multiSeat ? `Seat ${hand.seat + 1}, ` : ""}${group.hands.length > 1 ? `hand ${group.hands.indexOf(hand) + 1}, ` : ""}${handTotalLabel(hand.cards, true)}`} />
                    );
                  })}
                </div>
              </div>
            ))}
          </SeatsRail>
        )}
      </div>
    </div>
  );
}

function groupBySeat(hands: SeatHand[]) {
  const groups: { seat: number; owner: number; hands: SeatHand[] }[] = [];
  for (const hand of hands) {
    const last = groups[groups.length - 1];
    if (last && last.seat === hand.seat) last.hands.push(hand);
    else groups.push({ seat: hand.seat, owner: hand.owner, hands: [hand] });
  }
  return groups;
}

/**
 * The row of seats. Centred when it fits; when it cannot, it scrolls sideways
 * from its left edge (a centred row that overflows would cut off its first
 * hand) and keeps the active hand in view.
 */
function SeatsRail({ activeId, children }: { activeId?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rail = ref.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth) return;
    const active = rail.querySelector<HTMLElement>("[data-active]");
    if (active) active.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    else rail.scrollTo({ left: (rail.scrollWidth - rail.clientWidth) / 2, behavior: "smooth" });
  }, [activeId]);
  return (
    <div ref={ref} data-testid="full-shoe-seats-rail" className="scrollbar-none w-full overflow-x-auto pb-1 pt-1">
      <div className="mx-auto flex w-max items-end gap-4 px-1">{children}</div>
    </div>
  );
}
