/// <reference lib="webworker" />
import { Decision, exactOpeningChunk, InfoState, solve, solveApproximate } from "@/lib/chaseFlush/engine";

type Request = {
  id: number;
  kind?: "solve";
  informed: InfoState;
  normal: InfoState;
  samples: number;
  sixCardPayout: number;
} | {
  id:number;
  kind:"opening-chunk";
  state:InfoState;
  chunkIndex:number;
  startBoard:number;
  endBoard:number;
  sixCardPayout:number;
} | {
  id:number;
  kind:"provisional";
  state:InfoState;
  samples:number;
  sixCardPayout:number;
};

const sameState = (a: InfoState, b: InfoState) =>
  a.dealerVisible === b.dealerVisible &&
  a.player.join(",") === b.player.join(",") &&
  a.board.join(",") === b.board.join(",");
const cache = new Map<string, Decision>();
const canonicalCards=(cards:number[])=>[...cards].sort((a,b)=>a-b).join(",");
const cachedSolve = (state:InfoState,samples:number,seedOffset:number,sixCardPayout:number) => {
  const key=`${canonicalCards(state.player)}|${canonicalCards(state.board)}|${state.dealerVisible??"none"}|${samples}|${seedOffset}|${sixCardPayout}`;
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
  const request=event.data;
  const {id}=request;
  try {
    if(request.kind==="opening-chunk"){
      const chunk=exactOpeningChunk(request.state,request.startBoard,request.endBoard,request.sixCardPayout);
      self.postMessage({id,kind:"opening-chunk",chunkIndex:request.chunkIndex,chunk},[chunk.bet2ByFirst.buffer,chunk.riverByFirst.buffer,chunk.boardsByFirst.buffer]);
      return;
    }
    if(request.kind==="provisional"){
      self.postMessage({id,kind:"provisional",decision:solveApproximate(request.state,request.samples,104729,request.sixCardPayout)});
      return;
    }
    const {informed,normal,samples,sixCardPayout}=request;
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
