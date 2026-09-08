import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The suite runs on node, so the browser surfaces `storage` reads have to be
 * stood up before it is imported. Signed-out is the honest default here: the
 * migration under test happens on read, before any sync is involved.
 */
class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

vi.stubGlobal("window", {
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
  // Analytics config reads the hostname to pick an environment at import time.
  location: { hostname: "localhost", href: "http://localhost/", pathname: "/" },
});
vi.stubGlobal("localStorage", new MemoryStorage());
vi.stubGlobal("Event", class { constructor(public type: string) {} });
// `analytics/identity` imports the change subscription from this module too,
// so the stub has to keep it rather than replace the module wholesale.
vi.mock("../supabase/currentUser", () => ({
  getCurrentUser: () => null,
  onCurrentUserChange: () => () => {},
  setCurrentUser: () => {},
}));
vi.mock("../analytics/track", () => ({ track: () => {} }));

const { DEFAULT_SETTINGS, storage } = await import("./storage");

const write = (value: unknown) => localStorage.setItem("hilo:settings", JSON.stringify(value));

describe("the stored surrender rule", () => {
  beforeEach(() => localStorage.clear());

  it("reads back what was saved", () => {
    for (const surrender of ["none", "late", "early"] as const) {
      storage.saveSettings({ ...DEFAULT_SETTINGS, surrender });
      expect(storage.settings().surrender).toBe(surrender);
    }
  });

  /**
   * `surrender` replaced a `lateSurrender` boolean. Blobs written before that
   * exist both in localStorage and in the synced `settings.data` column, which
   * is stored opaquely and so was never migrated server-side — signing in on a
   * new device replays one of them through this same read.
   */
  it("migrates a settings blob written before the rule was a three-way choice", () => {
    write({ ...DEFAULT_SETTINGS, surrender: undefined, lateSurrender: true });
    expect(storage.settings().surrender).toBe("late");

    write({ ...DEFAULT_SETTINGS, surrender: undefined, lateSurrender: false });
    expect(storage.settings().surrender).toBe("none");
  });

  it("prefers the new key when a blob carries both", () => {
    // A device that has already saved once, syncing against an older remote row.
    write({ ...DEFAULT_SETTINGS, surrender: "early", lateSurrender: false });
    expect(storage.settings().surrender).toBe("early");
  });

  it("falls back to the default when neither key is present or the value is junk", () => {
    write({ decks: 8 });
    expect(storage.settings().surrender).toBe(DEFAULT_SETTINGS.surrender);
    expect(storage.settings().decks).toBe(8);

    write({ ...DEFAULT_SETTINGS, surrender: "sometimes" });
    expect(storage.settings().surrender).toBe(DEFAULT_SETTINGS.surrender);
  });

  it("survives a remote blob being applied verbatim on sign-in", () => {
    // `applyRemoteSettings` writes the row as-is, so the migration has to happen
    // on read or an account last saved by an older build comes back unset.
    storage.applyRemoteSettings({ ...DEFAULT_SETTINGS, surrender: undefined, lateSurrender: false } as never);
    expect(storage.settings().surrender).toBe("none");
  });

  it("drops the legacy key on the next save instead of carrying it forever", () => {
    write({ ...DEFAULT_SETTINGS, surrender: undefined, lateSurrender: true });
    storage.saveSettings(storage.settings());
    const written = JSON.parse(localStorage.getItem("hilo:settings")!);
    expect(written.surrender).toBe("late");
    expect("lateSurrender" in written).toBe(false);
  });

  it("keeps every other setting intact through a save", () => {
    storage.saveSettings({ ...DEFAULT_SETTINGS, surrender: "early", decks: 2, dealerHitsSoft17: false });
    const read = storage.settings();
    expect(read.surrender).toBe("early");
    expect(read.decks).toBe(2);
    expect(read.dealerHitsSoft17).toBe(false);
    expect(read.penetration).toBe(DEFAULT_SETTINGS.penetration);
  });
});
