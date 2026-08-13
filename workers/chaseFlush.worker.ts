/// <reference lib="webworker" />
import { Decision, InfoState, solve } from "@/lib/chaseFlush/engine";

type Request = {
  id: number;
  informed: InfoState;
  normal: InfoState;
  samples: number;
  sixCardPayout: number;
};

const sameState = (a: InfoState, b: InfoState) =>
  a.dealerVisible === b.dealerVisible &&
  a.player.join(",") === b.player.join(",") &&
  a.board.join(",") === b.board.join(",");
const cache = new Map<string, Decision>();
const cachedSolve = (state:InfoState,samples:number,seedOffset:number,sixCardPayout:number) => {
  const key=`${state.player.join(",")}|${state.board.join(",")}|${state.dealerVisible??"none"}|${samples}|${seedOffset}|${sixCardPayout}`;
  const found=cache.get(key);if(found)return found;
  const decision=solve(state,samples,seedOffset,sixCardPayout);cache.set(key,decision);return decision;
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
    const informedFirst = cachedSolve(informed, samples, 0, sixCardPayout);
    // An uninformed exact opening has 18+ billion terminals.  Do not delay an
    // already exact exposed recommendation by several minutes merely to show
    // the optional comparison; the desktop CLI can enumerate that separately.
    const omitNormal = informedFirst.exact && informed.board.length === 0 && informed.dealerVisible !== undefined;
    const normalFirst = omitNormal ? undefined : sameState(informed, normal) ? informedFirst : cachedSolve(normal, samples, 0, sixCardPayout);
    if (!normalFirst) {
      self.postMessage({id,informed:informedFirst,stability:0,stableAction:true});
      return;
    }
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
    const informedSecond = informedFirst.exact ? informedFirst : cachedSolve(informed, samples, 7919, sixCardPayout);
    const normalSecond = normalFirst.exact ? normalFirst : cachedSolve(normal, samples, 7919, sixCardPayout);
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
