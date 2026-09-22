import type { DirectoryGame } from "./types";

export const label = (value: string | null | undefined) => value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unknown";

export function monthLabel(value: string | null | undefined): string {
  if (!value) return "Report date unknown";
  const date = new Date(`${value.slice(0, 7)}-01T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "Report date unknown" : `Reported ${date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}`;
}

export function isStale(game: DirectoryGame, months = 6): boolean {
  const date = game.verified_at ?? game.reported_month;
  if (!date) return false;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return new Date(date) < cutoff;
}

export function penetration(game: DirectoryGame): number | null {
  if (game.decks == null || game.decks_cut == null || game.decks <= 0) return null;
  return Math.max(0, Math.min(1, (game.decks - game.decks_cut) / game.decks));
}

export function money(amount: number | null, currency: string | null): string {
  if (amount == null) return "Unknown";
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency ?? "USD", maximumFractionDigits: 0 }).format(amount); }
  catch { return `${amount} ${currency ?? ""}`.trim(); }
}
