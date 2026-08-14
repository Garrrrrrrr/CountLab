import { describe, expect, it } from "vitest";
import { AUTH_CONFIG } from "./authConfig.generated";
import { clearSession, hasValidSession, startSession, verifyPassword } from "./passwordGate";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe("verifyPassword", () => {
  it("rejects an empty candidate without touching the KDF", async () => {
    expect(await verifyPassword("")).toBe(false);
  });

  it("rejects a password that does not match the current build's hash", async () => {
    // authConfig.generated.ts is produced from COUNTLAB_PASSWORD by scripts/generate-auth.mjs;
    // this suite only asserts structural behavior, never a real password.
    expect(await verifyPassword("definitely-not-the-password")).toBe(false);
  });

  it("produces a salt and hash of the expected length for the configured iteration count", () => {
    expect(AUTH_CONFIG.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(AUTH_CONFIG.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(AUTH_CONFIG.iterations).toBeGreaterThanOrEqual(100_000);
  });
});

describe("session persistence", () => {
  it("has no valid session until one is started", () => {
    const store = new MemoryStorage();
    expect(hasValidSession(store)).toBe(false);
  });

  it("recognizes a session started with the current build's hash", () => {
    const store = new MemoryStorage();
    startSession(store);
    expect(hasValidSession(store)).toBe(true);
  });

  it("clears a session so it is no longer valid", () => {
    const store = new MemoryStorage();
    startSession(store);
    clearSession(store);
    expect(hasValidSession(store)).toBe(false);
  });

  it("rejects a session tagged with a different hash, e.g. from a previous password rotation", () => {
    const store = new MemoryStorage();
    store.setItem("countlab:auth-session", JSON.stringify({ hash: "stale-hash", expiresAt: Date.now() + 1_000_000 }));
    expect(hasValidSession(store)).toBe(false);
  });

  it("rejects an expired session", () => {
    const store = new MemoryStorage();
    store.setItem("countlab:auth-session", JSON.stringify({ hash: AUTH_CONFIG.hash, expiresAt: Date.now() - 1 }));
    expect(hasValidSession(store)).toBe(false);
  });

  it("ignores malformed storage payloads", () => {
    const store = new MemoryStorage();
    store.setItem("countlab:auth-session", "not json");
    expect(hasValidSession(store)).toBe(false);
  });
});
