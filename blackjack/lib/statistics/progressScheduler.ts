/**
 * When to write a drill's in-progress state, separated from React so it can
 * be tested with fake timers.
 *
 * - "debounce" saves once the state has been still for `ms` (the default for
 *   drills whose state only changes when an answer is given).
 * - "throttle" saves the latest state at most once every `ms`, so a state that
 *   changes continuously (a card clock ticking every 100 ms) still gets saved;
 *   a debounce would be reset forever and never write.
 *
 * `flush()` writes any pending state now (tab hidden, page closing) and
 * `cancel()` drops it (session finished or discarded), so a late write can
 * never revive a finished session.
 */
export type ProgressScheduler<T> = {
  push(state: T): void;
  flush(): void;
  cancel(): void;
  readonly pending: boolean;
};

export function createProgressScheduler<T>({ mode, ms, save }: { mode: "debounce" | "throttle"; ms: number; save: (state: T) => void }): ProgressScheduler<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latest: { state: T } | undefined;
  const stop = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const write = () => {
    stop();
    if (!latest) return;
    const { state } = latest;
    latest = undefined;
    save(state);
  };
  return {
    push(state) {
      latest = { state };
      if (mode === "debounce") stop();
      if (timer === undefined) timer = setTimeout(write, ms);
    },
    flush: write,
    cancel() {
      stop();
      latest = undefined;
    },
    get pending() {
      return latest !== undefined;
    },
  };
}
