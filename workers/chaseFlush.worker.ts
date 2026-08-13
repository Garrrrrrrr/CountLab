/// <reference lib="webworker" />
import { Decision, InfoState, solve } from "@/lib/chaseFlush/engine";

type Request = {
  id: number;
  informed: InfoState;
  normal: InfoState;
  samples: number;
  sixCardPayout: number;
};

const spread = (first: Decision, second: Decision) => {
  const actions = new Set([...Object.keys(first.evs), ...Object.keys(second.evs)]);
  return Math.max(
    0,
    ...Array.from(actions).map((action) =>
      Math.abs((first.evs[action] ?? 0) - (second.evs[action] ?? 0)),
    ),
  );
};

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, informed, normal, samples, sixCardPayout } = event.data;
  try {
    const informedFirst = solve(informed, samples, 0, sixCardPayout);
    const normalFirst = solve(normal, samples, 0, sixCardPayout);
    if (informedFirst.exact && normalFirst.exact) {
      self.postMessage({
        id,
        informed: informedFirst,
        normal: normalFirst,
        stability: 0,
        stableAction: true,
      });
      return;
    }
    const informedSecond = solve(informed, samples, 7919, sixCardPayout);
    const normalSecond = solve(normal, samples, 7919, sixCardPayout);
    self.postMessage({
      id,
      informed: informedFirst,
      normal: normalFirst,
      stability: Math.max(
        spread(informedFirst, informedSecond),
        spread(normalFirst, normalSecond),
      ),
      stableAction:
        informedFirst.action === informedSecond.action &&
        normalFirst.action === normalSecond.action,
    });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export {};
