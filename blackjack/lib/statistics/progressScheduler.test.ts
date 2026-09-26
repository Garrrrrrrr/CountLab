import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProgressScheduler } from "./progressScheduler";

describe("drill progress scheduler", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("debounce saves once, 400 ms after the last change", () => {
    const save = vi.fn();
    const scheduler = createProgressScheduler({ mode: "debounce", ms: 400, save });
    scheduler.push(1);
    vi.advanceTimersByTime(300);
    scheduler.push(2);
    vi.advanceTimersByTime(300);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith(2);
  });

  it("a debounce never saves under constant change, which is why a ticking drill throttles", () => {
    const save = vi.fn();
    const scheduler = createProgressScheduler({ mode: "debounce", ms: 400, save });
    for (let tick = 0; tick < 100; tick++) { scheduler.push(tick); vi.advanceTimersByTime(100); }
    expect(save).not.toHaveBeenCalled();
  });

  it("throttle saves the latest state at most once per interval while it keeps changing", () => {
    const save = vi.fn();
    const scheduler = createProgressScheduler({ mode: "throttle", ms: 3000, save });
    for (let tick = 1; tick <= 100; tick++) { scheduler.push(tick); vi.advanceTimersByTime(100); }
    // 10 s of pushes every 100 ms: saves at 3 s, 6 s and 9 s.
    expect(save).toHaveBeenCalledTimes(3);
    expect(save.mock.calls.map(([state]) => state)).toEqual([30, 60, 90]);
    vi.advanceTimersByTime(3000);
    expect(save).toHaveBeenLastCalledWith(100);
  });

  it("flush saves pending state immediately and only once", () => {
    const save = vi.fn();
    const scheduler = createProgressScheduler({ mode: "throttle", ms: 3000, save });
    scheduler.push("state");
    expect(scheduler.pending).toBe(true);
    scheduler.flush();
    expect(save).toHaveBeenCalledWith("state");
    vi.advanceTimersByTime(5000);
    scheduler.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("cancel drops pending state, so a later flush cannot revive a finished session", () => {
    const save = vi.fn();
    const scheduler = createProgressScheduler({ mode: "throttle", ms: 3000, save });
    scheduler.push("mid-session");
    scheduler.cancel();
    scheduler.flush();
    vi.advanceTimersByTime(5000);
    expect(save).not.toHaveBeenCalled();
    expect(scheduler.pending).toBe(false);
  });
});
