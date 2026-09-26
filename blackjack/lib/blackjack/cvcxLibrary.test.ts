import { afterEach, describe, expect, it, vi } from "vitest";
import { RAMPS } from "./advantage";
import { cvcxLibrary, templateHandSchedule, type CvcxTemplateConfig } from "./cvcxLibrary";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const config = (overrides: Partial<CvcxTemplateConfig> = {}): CvcxTemplateConfig => ({
  decks: 6, dealt: 4.5, bankroll: 25000, handsPerHour: 100, hours: 100, targetRisk: 0.05, maxSpread: 12, wongInAt: null,
  rampName: "1-12", ramp: RAMPS["1-12"], chipIncrement: 0.5, baseBet: 15,
  dealerHitsSoft17: true, doubleAfterSplit: true, resplitAces: true, lateSurrender: true, europeanNoHoleCard: false, blackjackPayout: 1.5,
  ...overrides,
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("cvcxLibrary.updateTemplate", () => {
  it("replaces one scenario in place of its id, keeping its creation date, and moves it to the front", () => {
    const store = new MemoryStorage();
    const first = cvcxLibrary.saveTemplate(config(), "First", store, new Date("2026-01-01T00:00:00Z"));
    const second = cvcxLibrary.saveTemplate(config({ bankroll: 5000 }), "Second", store, new Date("2026-01-02T00:00:00Z"));
    expect(cvcxLibrary.templates(store).map((item) => item.id)).toEqual([second.id, first.id]);

    const updated = cvcxLibrary.updateTemplate(first.id, config({ bankroll: 12345 }), "First, bigger", store);
    expect(updated).toMatchObject({ id: first.id, name: "First, bigger", createdAt: first.createdAt });
    const templates = cvcxLibrary.templates(store);
    expect(templates.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(templates[0].config.bankroll).toBe(12345);
    expect(JSON.parse(store.getItem("countlab:cvcx-templates:v1")!)).toMatchObject({ version: 1, items: [{ id: first.id }, { id: second.id }] });
  });

  it("keeps the name when none is given", () => {
    const store = new MemoryStorage();
    const saved = cvcxLibrary.saveTemplate(config(), "Keep me", store);
    expect(cvcxLibrary.updateTemplate(saved.id, config({ baseBet: 25 }), "  ", store)?.name).toBe("Keep me");
  });

  it("changes nothing for an unknown id", () => {
    const store = new MemoryStorage();
    cvcxLibrary.saveTemplate(config(), "Only", store);
    const before = store.getItem("countlab:cvcx-templates:v1");
    expect(cvcxLibrary.updateTemplate("missing", config({ bankroll: 1 }), "X", store)).toBeUndefined();
    expect(store.getItem("countlab:cvcx-templates:v1")).toBe(before);
  });

  it("announces the change like every other library write", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    const store = new MemoryStorage();
    const saved = cvcxLibrary.saveTemplate(config(), "Watched", store);
    dispatchEvent.mockClear();
    cvcxLibrary.updateTemplate(saved.id, config({ hours: 4 }), undefined, store);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect((dispatchEvent.mock.calls[0][0] as Event).type).toBe(cvcxLibrary.event);
  });
});

describe("cvcxLibrary.saveTemplate", () => {
  it("keeps the newest twenty scenarios", () => {
    const store = new MemoryStorage();
    const saved = Array.from({ length: 21 }, (_, index) => cvcxLibrary.saveTemplate(config(), `Scenario ${index + 1}`, store));
    const templates = cvcxLibrary.templates(store);
    expect(templates).toHaveLength(20);
    expect(templates[0].id).toBe(saved[20].id);
    expect(templates.some((item) => item.id === saved[0].id)).toBe(false);
  });
});

describe("templateHandSchedule", () => {
  it("prefers the saved per-count schedule", () => {
    const hands = Array.from({ length: 17 }, (_, index) => ({ trueCount: index - 8, hands: index > 12 ? 2 : 1 }));
    expect(templateHandSchedule(config({ hands }))).toBe(hands);
  });

  it("migrates saves from before the per-count schedule", () => {
    const schedule = templateHandSchedule(config({ playerHands: 1, extraHandsAt: 3, highCountHands: 2 }));
    expect(schedule).toHaveLength(17);
    expect(schedule.filter((point) => point.hands === 2).map((point) => point.trueCount)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(templateHandSchedule(config()).every((point) => point.hands === 1)).toBe(true);
  });
});
