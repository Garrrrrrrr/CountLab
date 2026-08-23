import { describe, expect, it, vi } from "vitest";
import { settleWithTimeout } from "./settleWithTimeout";

describe("settleWithTimeout", () => {
  it("passes through a timely value", async () => {
    await expect(settleWithTimeout(Promise.resolve("ok"), 1000, "fallback")).resolves.toBe("ok");
  });
  it("returns the fallback on rejection", async () => {
    await expect(settleWithTimeout(Promise.reject(new Error("offline")), 1000, "fallback")).resolves.toBe("fallback");
  });
  it("returns the fallback for a hung promise", async () => {
    vi.useFakeTimers();
    try {
      const pending = settleWithTimeout(new Promise<string>(() => {}), 5000, "fallback");
      await vi.advanceTimersByTimeAsync(5000);
      await expect(pending).resolves.toBe("fallback");
    } finally { vi.useRealTimers(); }
  });
  it("keeps a value received before the deadline", async () => {
    vi.useFakeTimers();
    try {
      const guarded = settleWithTimeout(new Promise<string>((resolve) => setTimeout(() => resolve("ok"), 1000)), 5000, "fallback");
      await vi.advanceTimersByTimeAsync(1000);
      await expect(guarded).resolves.toBe("ok");
    } finally { vi.useRealTimers(); }
  });
});
