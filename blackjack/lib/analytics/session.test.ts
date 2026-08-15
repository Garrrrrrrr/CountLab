import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_CONFIG, STORAGE_KEYS } from "./config";
import {
  endSession,
  clearSessionData,
  ensureSession,
  recordEvent,
  recordPageView,
  resetSessionStateForTests,
  snapshotSession,
  syncEngagement,
} from "./session";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

describe("analytics sessions", () => {
  const storage = new MemoryStorage();
  let visible = true;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T12:00:00Z"));
    storage.clear();
    visible = true;
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("document", {
      get visibilityState() { return visible ? "visible" : "hidden"; },
      hasFocus: () => visible,
    });
    resetSessionStateForTests();
  });

  afterEach(() => {
    resetSessionStateForTests();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("creates a persistent anonymous session and tracks counters", () => {
    const opened = ensureSession("/training/true-count/?unsafe=yes");
    expect(opened.started?.is_first_session).toBe(true);
    expect(opened.session.first_path).toBe("/training/true-count");
    recordPageView("/training/true-count");
    recordEvent();
    recordEvent(false);
    const resumed = ensureSession("/training/true-count");
    expect(resumed.started).toBeUndefined();
    expect(resumed.session.page_views).toBe(1);
    expect(resumed.session.events).toBe(2);
    expect(resumed.session.meaningful_events).toBe(1);
    expect(storage.getItem(STORAGE_KEYS.session)).not.toBeNull();
  });

  it("counts foreground engagement but not hidden time", () => {
    ensureSession("/");
    vi.advanceTimersByTime(4_000);
    visible = false;
    syncEngagement();
    vi.advanceTimersByTime(20_000);
    const ended = endSession("page_hide");
    expect(ended?.engaged_ms).toBe(4_000);
    expect(ended?.duration_ms).toBe(24_000);
  });

  it("rotates after inactivity and reports the prior session", () => {
    const first = ensureSession("/").session.id;
    recordPageView("/");
    vi.advanceTimersByTime(ANALYTICS_CONFIG.sessionTimeoutMs + 1);
    const rotated = ensureSession("/training/running-count");
    expect(rotated.session.id).not.toBe(first);
    expect(rotated.ended?.reason).toBe("timeout");
    expect(rotated.ended?.page_views).toBe(1);
    expect(rotated.session.is_first_session).toBe(false);
  });

  it("keeps the same session across a page-hide snapshot", () => {
    const first = ensureSession("/").session.id;
    vi.advanceTimersByTime(2_000);
    const snapshot = snapshotSession("page_hide");
    expect(snapshot?.id).toBe(first);
    resetSessionStateForTests(); // Simulate a fresh document after reload.
    vi.advanceTimersByTime(1_000);
    const resumed = ensureSession("/training/basic-strategy");
    expect(resumed.session.id).toBe(first);
    expect(resumed.started).toBeUndefined();
  });

  it("clears session identity and the returning-session counter for deletion", () => {
    ensureSession("/");
    clearSessionData();
    expect(storage.getItem(STORAGE_KEYS.session)).toBeNull();
    const reopened = ensureSession("/");
    expect(reopened.started?.is_first_session).toBe(true);
  });
});
