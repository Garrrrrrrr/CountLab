import { beforeEach, describe, expect, it, vi } from "vitest";

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("./client", () => ({ analytics: { track } }));

import { STORAGE_KEYS } from "./config";
import { experimentVariant, exposeFeatureFlag } from "./experiments";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe("analytics experiment assignment", () => {
  beforeEach(() => {
    track.mockClear();
    vi.stubGlobal("localStorage", new MemoryStorage());
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
  });

  it("persists a stable variant and emits each exposure once", () => {
    const first = experimentVariant("trainer_prompt", ["control", "short"] as const);
    const second = experimentVariant("trainer_prompt", ["control", "short"] as const);
    exposeFeatureFlag("new_results", "enabled");
    exposeFeatureFlag("new_results", "enabled");

    expect(second).toBe(first);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.experiments) || "{}").trainer_prompt).toBe(first);
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenCalledWith("experiment_exposure", { experiment: "trainer_prompt", variant: first });
    expect(track).toHaveBeenCalledWith("feature_flag_exposure", { flag: "new_results", variation: "enabled" });
  });
});
