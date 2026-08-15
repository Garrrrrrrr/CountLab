import { describe, expect, it } from "vitest";
import { DEFAULT_ADVANTAGE_RULES, RAMPS } from "./advantage";
import { venuePresetLibrary } from "./venuePresets";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe("venuePresetLibrary", () => {
  it("saves, lists, and deletes a venue preset", () => {
    const store = new MemoryStorage();
    const saved = venuePresetLibrary.savePreset("Downtown casino", DEFAULT_ADVANTAGE_RULES, RAMPS["1-8"], store);
    expect(venuePresetLibrary.presets(store)).toHaveLength(1);
    expect(saved.name).toBe("Downtown casino");
    expect(saved.ramp).toEqual(RAMPS["1-8"]);
    venuePresetLibrary.deletePreset(saved.id, store);
    expect(venuePresetLibrary.presets(store)).toEqual([]);
  });

  it("ignores malformed storage payloads", () => {
    const store = new MemoryStorage();
    store.setItem("countlab:venue-presets:v1", JSON.stringify({ version: 1, items: [{ id: "broken" }] }));
    expect(venuePresetLibrary.presets(store)).toEqual([]);
  });
});
