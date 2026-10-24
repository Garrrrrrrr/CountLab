const MINUS = "−";

/** "$25", "$12.50", "−$40". */
export function money(value: number, { sign = false }: { sign?: boolean } = {}): string {
  const abs = Math.abs(value);
  const body = `$${Number.isInteger(abs) ? abs.toLocaleString("en-US") : abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (value < 0) return `${MINUS}${body}`;
  return sign && value > 0 ? `+${body}` : body;
}

/** +3, 0, −2 with a real minus sign. */
export const signed = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `${MINUS}${Math.abs(value)}` : "0");

export const decksLabel = (decks: number) => `${decks} ${decks === 1 ? "deck" : "decks"}`;

export const durationLabel = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} min ${String(seconds % 60).padStart(2, "0")} s` : `${seconds} s`;
};

/** Short card text for dense tables: "A♠ 10♥". */
const GLYPH: Record<string, string> = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };
export const cardsText = (cards: { rank: string; suit: string }[]) => cards.map((card) => `${card.rank}${GLYPH[card.suit] ?? ""}`).join(" ");

/** True when the event comes from a text field, where letter shortcuts must not fire. */
export function typing(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  return Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable));
}
