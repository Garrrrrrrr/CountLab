import { afterEach, describe, expect, it, vi } from "vitest";
import { isStale, penetration } from "./format";
import type { DirectoryGame } from "./types";

const game = (values: Partial<DirectoryGame>): DirectoryGame => ({ decks: null, decks_cut: null, reported_month: null, verified_at: null, ...values } as DirectoryGame);

afterEach(() => vi.useRealTimers());

describe("directory reporting", () => {
  it("turns decks left undealt into penetration", () => {
    expect(penetration(game({ decks: 6, decks_cut: 1.5 }))).toBe(0.75);
    expect(penetration(game({ decks: 6, decks_cut: null }))).toBeNull();
  });

  it("uses actual verification when deciding if an older report is stale", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T12:00:00Z"));
    expect(isStale(game({ reported_month: "2025-08-01", verified_at: "2026-08-15T12:00:00Z" }))).toBe(false);
    expect(isStale(game({ reported_month: "2025-08-01" }))).toBe(true);
  });
});
