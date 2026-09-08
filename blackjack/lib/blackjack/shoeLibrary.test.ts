import { describe, expect, it } from "vitest";
import { MAX_BYTES, MAX_SHOES, shoeLibrary, type SavedShoeHeader, type SavedShoeInput } from "./shoeLibrary";
import type { FullShoeLiveRound, FullShoeReport } from "./fullShoeSession";

class MemoryStorage {
  private values = new Map<string, string>();
  /** Number of remaining setItem calls that should fail as a full disk would. */
  failWrites = 0;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failWrites > 0) {
      this.failWrites -= 1;
      const error = new Error("exceeded the quota");
      error.name = "QuotaExceededError";
      throw error;
    }
    this.values.set(key, value);
  }
  removeItem(key: string) { this.values.delete(key); }
}

const report: FullShoeReport = {
  accuracy: 92,
  decisions: 50,
  handsPlayed: 20,
  durationMs: 600_000,
  netResult: 140,
  categories: {
    Betting: { correct: 19, total: 20, accuracy: 95 },
    "Basic Strategy": { correct: 24, total: 26, accuracy: 92 },
    Deviations: { correct: 3, total: 4, accuracy: 75 },
  },
};

const round = (explanation = "Stand on hard 16 at TC +1."): FullShoeLiveRound => ({
  round: 1,
  dealerCards: [{ rank: "10", suit: "spades" }],
  playerHands: [{ cards: [{ rank: "9", suit: "clubs" }, { rank: "7", suit: "hearts" }], bet: 20, net: -20, surrendered: false }],
  bet: 20,
  runningCountBefore: 4,
  trueCountBefore: 1,
  netResult: -20,
  decisions: [{ category: "Deviations", chosen: "Hit", correct: "Stand", ok: false, explanation, trueCount: 1 }],
});

const shoe = (overrides: Partial<SavedShoeInput> = {}): SavedShoeInput => ({
  mode: "checkout",
  completionReason: "shoe-complete",
  table: { decks: 6, dealerHitsSoft17: true, surrenderRule: "late", stacked: true, penetration: 5 / 6 },
  report,
  rounds: [round()],
  ...overrides,
});

const at = (day: number) => new Date(Date.UTC(2026, 0, day));

describe("shoe library", () => {
  it("assigns an id and timestamp and returns saved shoes newest first", () => {
    const store = new MemoryStorage();
    shoeLibrary.save(shoe({ report: { ...report, accuracy: 70 } }), store, at(1));
    const newest = shoeLibrary.save(shoe({ report: { ...report, accuracy: 88 } }), store, at(3));

    const saved = shoeLibrary.shoes(store);
    expect(saved).toHaveLength(2);
    expect(saved[0].id).toBe(newest.id);
    expect(saved[0].savedAt).toBe(at(3).toISOString());
    expect(saved.map((entry) => entry.report.accuracy)).toEqual([88, 70]);
    expect(newest.id).toBeTruthy();
  });

  it("keeps only the newest MAX_SHOES when more are saved", () => {
    const store = new MemoryStorage();
    for (let day = 1; day <= MAX_SHOES + 4; day++) {
      shoeLibrary.save(shoe({ report: { ...report, handsPlayed: day } }), store, at(day));
    }

    const saved = shoeLibrary.shoes(store);
    expect(saved).toHaveLength(MAX_SHOES);
    expect(saved[0].report.handsPlayed).toBe(MAX_SHOES + 4);
    expect(saved.at(-1)!.report.handsPlayed).toBe(5);
  });

  it("evicts the oldest shoes once the stored payload passes the byte budget", () => {
    const store = new MemoryStorage();
    // Three of these exceed MAX_BYTES, so the third save must drop the first.
    const bulky = () => shoe({ rounds: [round("x".repeat(Math.floor(MAX_BYTES / 2.5)))] });
    shoeLibrary.save(bulky(), store, at(1));
    shoeLibrary.save(bulky(), store, at(2));
    shoeLibrary.save(bulky(), store, at(3));

    const saved = shoeLibrary.shoes(store);
    expect(saved).toHaveLength(2);
    expect(saved.map((entry) => entry.savedAt)).toEqual([at(3).toISOString(), at(2).toISOString()]);
  });

  it("recovers from a full disk by retaining fewer shoes instead of throwing", () => {
    const store = new MemoryStorage();
    for (let day = 1; day <= 4; day++) shoeLibrary.save(shoe(), store, at(day));

    store.failWrites = 1;
    expect(() => shoeLibrary.save(shoe(), store, at(5))).not.toThrow();

    const saved = shoeLibrary.shoes(store);
    expect(saved.length).toBeLessThan(5);
    expect(saved[0].savedAt).toBe(at(5).toISOString());
  });

  it("deletes only the requested shoe", () => {
    const store = new MemoryStorage();
    const first = shoeLibrary.save(shoe(), store, at(1));
    const second = shoeLibrary.save(shoe(), store, at(2));

    shoeLibrary.deleteShoe(first.id, store);

    expect(shoeLibrary.shoes(store).map((entry) => entry.id)).toEqual([second.id]);
  });

  it("drops malformed records instead of crashing", () => {
    const store = new MemoryStorage();
    const valid = shoeLibrary.save(shoe(), store, at(1));
    const stored = JSON.parse(store.getItem("countlab:full-shoe-reviews:v1")!) as { version: number; items: unknown[] };
    stored.items.push(null, { id: "no-report", savedAt: at(2).toISOString() }, { ...valid, report: "not a report" });
    store.setItem("countlab:full-shoe-reviews:v1", JSON.stringify(stored));

    expect(shoeLibrary.shoes(store).map((entry) => entry.id)).toEqual([valid.id]);
  });

  it("merges remote headers without discarding locally cached rounds", () => {
    const store = new MemoryStorage();
    const local = shoeLibrary.save(shoe(), store, at(2));
    const headers: SavedShoeHeader[] = [
      { id: local.id, savedAt: local.savedAt, mode: local.mode, completionReason: local.completionReason, table: local.table, report: local.report },
      { id: "remote-only", savedAt: at(4).toISOString(), mode: "coached", completionReason: "ended", table: local.table, report },
    ];

    shoeLibrary.mergeRemoteHeaders(headers, store);

    const saved = shoeLibrary.shoes(store);
    expect(saved.map((entry) => entry.id)).toEqual(["remote-only", local.id]);
    expect(saved[0].rounds).toBeUndefined();
    expect(saved[1].rounds).toEqual(local.rounds);
  });

  it("loads locally cached rounds without reaching for the network", async () => {
    const store = new MemoryStorage();
    const saved = shoeLibrary.save(shoe(), store, at(1));

    await expect(shoeLibrary.loadRounds(saved.id, store)).resolves.toEqual(saved.rounds);
  });

  it("reports no rounds for an unknown shoe when signed out", async () => {
    const store = new MemoryStorage();

    await expect(shoeLibrary.loadRounds("missing", store)).resolves.toBeUndefined();
  });

  it("forgets every saved shoe when cleared", () => {
    const store = new MemoryStorage();
    shoeLibrary.save(shoe(), store, at(1));

    shoeLibrary.clear(store);

    expect(shoeLibrary.shoes(store)).toEqual([]);
  });
});
