import { ReactNode } from "react";
import { PlayingCard } from "@/components/PlayingCard";
import { Card, Rank, Suit } from "@/lib/blackjack/types";
import { chipColorClasses, chipLabel, chipOptions } from "@/lib/blackjack/chips";
import { Metric, Panel } from "@/components/ui";

const suits: Record<string, Suit> = {
  c: "clubs",
  d: "diamonds",
  h: "hearts",
  s: "spades",
};
const ranks: Record<string, Rank> = { T: "10" } as Record<string, Rank>;

export function gameCard(card: number, name: (card: number) => string): Card {
  const text = name(card);
  return {
    rank: ranks[text[0]] ?? (text[0] as Rank),
    suit: suits[text[1]],
  };
}

export function CasinoChip({
  value,
  selected = false,
  onClick,
}: {
  value: number;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Select ${chipLabel(value)} chip`}
      aria-pressed={selected}
      onClick={onClick}
      className={`pressable grid h-14 w-14 shrink-0 place-items-center rounded-full border-[5px] border-dashed text-xs font-black shadow-[0_7px_16px_#0008] ring-2 ring-black/30 ${chipColorClasses(value)} ${selected ? "-translate-y-1 ring-4 ring-[#a8ee72]" : ""}`}
    >
      {chipLabel(value)}
    </button>
  );
}

export function ChipRack({
  selected,
  onSelect,
  disabled = false,
}: {
  selected: number;
  onSelect: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex flex-wrap justify-center gap-3 ${disabled ? "pointer-events-none opacity-40" : ""}`} aria-label="Chip rack">
      {chipOptions.map((value) => (
        <CasinoChip key={value} value={value} selected={selected === value} onClick={() => onSelect(value)} />
      ))}
    </div>
  );
}

export function BetSpot({
  label,
  amount,
  onAdd,
  onClear,
  locked = false,
  detail,
}: {
  label: string;
  amount: number;
  onAdd?: () => void;
  onClear?: () => void;
  locked?: boolean;
  detail?: string;
}) {
  return (
    <div className="text-center">
      <button
        type="button"
        disabled={locked || !onAdd}
        onClick={onAdd}
        className={`pressable mx-auto grid h-24 w-24 place-items-center rounded-full border-2 text-center ${amount ? "border-amber-300/70 bg-amber-300/10" : "border-dashed border-white/20 bg-black/10"}`}
      >
        <span><small className="block text-[.62rem] font-bold uppercase tracking-[.14em] text-zinc-500">{label}</small><b className="mt-1 block text-lg">${amount % 1 === 0 ? amount : amount.toFixed(2)}</b></span>
      </button>
      {detail && <p className="mt-1 text-[.65rem] text-zinc-500">{detail}</p>}
      {!locked && amount > 0 && onClear && <button type="button" onClick={onClear} className="mt-1 min-h-8 px-2 text-xs text-zinc-500 hover:text-white">Clear</button>}
    </div>
  );
}

export function CardRow({
  cards,
  hidden = 0,
  label,
  empty = 0,
}: {
  cards: Card[];
  hidden?: number;
  label: string;
  empty?: number;
}) {
  return (
    <div className="text-center">
      <p className="mb-2 text-[.65rem] font-bold uppercase tracking-[.18em] text-emerald-100/55">{label}</p>
      <div className="flex min-h-20 justify-start gap-1.5 overflow-x-auto pb-2 sm:justify-center sm:gap-2">
        {cards.map((card, index) => <PlayingCard key={`${card.rank}-${card.suit}-${index}`} card={card} size="table" animated dealIndex={index} fast />)}
        {Array.from({ length: hidden }, (_, index) => <PlayingCard key={`hidden-${index}`} hidden size="table" animated dealIndex={cards.length + index} fast />)}
        {Array.from({ length: empty }, (_, index) => <div key={`empty-${index}`} className="h-20 w-14 rounded-xl border border-dashed border-white/10 lg:h-28 lg:w-20 2xl:h-32 2xl:w-24" />)}
      </div>
    </div>
  );
}

export function CasinoTable({ children }: { children: ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-emerald-200/15 bg-[radial-gradient(circle_at_50%_20%,#176144_0%,#0d3b2b_48%,#08271e_100%)] p-4 shadow-[inset_0_0_90px_#0007,0_24px_70px_#0006] sm:p-6 lg:p-8">
      <div className="pointer-events-none absolute inset-3 rounded-[1.5rem] border border-amber-100/10" />
      <div className="relative">{children}</div>
    </section>
  );
}

export type GameHistoryRow = {
  id: number;
  result: string;
  net: number;
  bankroll: number;
  detail: string;
};

export type CoachNote = { ok: boolean; title: string; detail: string };

export function CoachPanel({
  note,
  pending,
  accuracyLabel,
  emptyHint,
  children,
}: {
  note?: CoachNote;
  pending?: boolean;
  accuracyLabel?: string;
  emptyHint: string;
  children?: ReactNode;
}) {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Live coach</p>
        {accuracyLabel && <span className="text-xs text-zinc-500">{accuracyLabel}</span>}
      </div>
      {note ? (
        <div aria-live="polite" className={`mt-3 rounded-xl border p-4 ${note.ok ? "border-emerald-400/30 bg-emerald-400/[.07]" : "border-red-400/30 bg-red-400/[.07]"}`}>
          <p className={`font-semibold ${note.ok ? "text-emerald-300" : "text-red-300"}`}>{note.ok ? "✓" : "!"} {note.title}</p>
          <p className="mt-2 text-xs leading-5 text-zinc-300">{note.detail}</p>
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-zinc-400">{emptyHint}</p>
      )}
      {pending && <p className="mt-2 text-xs text-amber-300">Coach is still calculating this decision…</p>}
      {children}
    </Panel>
  );
}

export function EvMetrics({
  evs,
  loading,
  note,
}: {
  evs?: Partial<Record<string, number>>;
  loading?: boolean;
  note?: string;
}) {
  const entries = evs ? (Object.entries(evs) as Array<[string, number | undefined]>).filter((entry): entry is [string, number] => entry[1] !== undefined) : [];
  if (!loading && !entries.length) return null;
  return (
    <div className="mt-4">
      {loading && !entries.length && <p className="text-sm text-zinc-400"><i className="fa-solid fa-circle-notch animate-spin" aria-hidden="true" /> Calculating EV…</p>}
      {entries.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {entries.map(([action, ev]) => (
            <Metric key={action} label={`${action} EV`} value={`${ev >= 0 ? "+" : ""}${ev.toFixed(3)}`} />
          ))}
        </div>
      )}
      {note && entries.length > 0 && <p className="mt-3 text-xs leading-5 text-zinc-500">{note}</p>}
    </div>
  );
}

export function GameHistory({ rows }: { rows: GameHistoryRow[] }) {
  return (
    <div className="space-y-2">
      {rows.length ? rows.slice(0, 8).map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl bg-black/20 p-3 text-sm">
          <div><b>{row.result}</b><p className="mt-0.5 text-xs text-zinc-500">{row.detail}</p></div>
          <div className="text-right"><b className={row.net >= 0 ? "text-emerald-300" : "text-red-300"}>{row.net >= 0 ? "+" : ""}${row.net.toFixed(2)}</b><p className="text-xs text-zinc-600">${row.bankroll.toFixed(2)}</p></div>
        </div>
      )) : <p className="py-8 text-center text-sm text-zinc-600">Completed rounds will appear here.</p>}
    </div>
  );
}
