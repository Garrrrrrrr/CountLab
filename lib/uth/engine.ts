export const RANKS = "23456789TJQKA";
export const SUITS = "cdhs";

export type UTHState = { player: number[]; board: number[]; dealerVisible?: number };
export type UTHDecision = {
  action: string;
  evs: Record<string, number>;
  difference: number;
  exact: boolean;
  method: "EXACT" | "PUBLISHED_OPTIMAL_STRATEGY" | "PAIRED_STRATIFIED_MONTE_CARLO+EXACT_CHILDREN";
  outcomes: number;
  standardError: number;
  confidenceInterval: [number, number];
  status: "CONFIRMED" | "INCONCLUSIVE — MORE COMPUTATION REQUIRED";
  sampledStates?: number;
  populationStates?: number;
  decisionMarginAvailable?: boolean;
  precisionTargetMet?: boolean;
};

export const parseCard = (text: string) => {
  const r = RANKS.indexOf(text[0]?.toUpperCase());
  const s = SUITS.indexOf(text[1]?.toLowerCase());
  if (text.length !== 2 || r < 0 || s < 0) throw new Error(`Invalid card ${text}`);
  return s * 13 + r;
};
export const cardName = (card: number) => RANKS[card % 13] + SUITS[Math.floor(card / 13)];
const rank = (card: number) => card % 13 + 2;
const suit = (card: number) => Math.floor(card / 13);
const compare = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference) return difference;
  }
  return 0;
};
const straightHigh = (values: Set<number>) => {
  const sorted = [...values, ...(values.has(14) ? [1] : [])].sort((a, b) => a - b);
  let run = 0;
  let previous = -2;
  let high = 0;
  for (const value of sorted) {
    run = value === previous + 1 ? run + 1 : 1;
    if (run >= 5) high = value;
    previous = value;
  }
  return high;
};

/** Category followed by every comparison kicker, highest tuple wins. */
export function evaluate(cards: number[]): number[] {
  if (cards.length < 5 || cards.length > 7 || new Set(cards).size !== cards.length) {
    throw new Error("Evaluator needs 5-7 distinct cards");
  }
  const counts = Array(15).fill(0) as number[];
  const suited = [[], [], [], []] as number[][];
  for (const card of cards) {
    counts[rank(card)]++;
    suited[suit(card)].push(rank(card));
  }
  for (const values of suited) {
    if (values.length >= 5) {
      const high = straightHigh(new Set(values));
      if (high) return [8, high];
    }
  }
  const values = (count: number) => Array.from({ length: 13 }, (_, i) => 14 - i).filter(value => counts[value] >= count);
  const quads = values(4);
  if (quads.length) return [7, quads[0], ...values(1).filter(value => value !== quads[0]).slice(0, 1)];
  const trips = values(3);
  if (trips.length) {
    const pairs = values(2).filter(value => value !== trips[0]);
    if (pairs.length) return [6, trips[0], pairs[0]];
  }
  const flushes = suited.filter(value => value.length >= 5).map(value => value.sort((a, b) => b - a).slice(0, 5));
  if (flushes.length) return [5, ...flushes.sort(compare).at(-1)!];
  const high = straightHigh(new Set(values(1)));
  if (high) return [4, high];
  if (trips.length) return [3, trips[0], ...values(1).filter(value => value !== trips[0]).slice(0, 2)];
  const pairs = values(2);
  if (pairs.length >= 2) return [2, pairs[0], pairs[1], ...values(1).filter(value => !pairs.slice(0, 2).includes(value)).slice(0, 1)];
  if (pairs.length) return [1, pairs[0], ...values(1).filter(value => value !== pairs[0]).slice(0, 3)];
  return [0, ...values(1).slice(0, 5)];
}

export const STANDARD_BLIND_PAYTABLE = { royalFlush: 500, straightFlush: 50, quads: 10, fullHouse: 3, flush: 1.5, straight: 1, other: 0 } as const;
export function settle(player: number[], dealer: number[], play: number, paytable: typeof STANDARD_BLIND_PAYTABLE = STANDARD_BLIND_PAYTABLE) {
  const comparison = compare(player, dealer);
  if (!comparison) return 0;
  const qualifies = dealer[0] >= 1;
  if (comparison < 0) return -(qualifies ? 1 : 0) - 1 - play;
  const blind = player[0] === 8 && player[1] === 14 ? paytable.royalFlush
    : player[0] === 8 ? paytable.straightFlush
      : player[0] === 7 ? paytable.quads
        : player[0] === 6 ? paytable.fullHouse
          : player[0] === 5 ? paytable.flush
            : player[0] === 4 ? paytable.straight
              : paytable.other;
  return (qualifies ? 1 : 0) + blind + play;
}

const validate = (state: UTHState) => {
  if (state.player.length !== 2 || ![0, 3, 5].includes(state.board.length)) throw new Error("Select 2 player cards and 0, 3, or 5 board cards");
  const all = [...state.player, ...state.board, ...(state.dealerVisible === undefined ? [] : [state.dealerVisible])];
  if (new Set(all).size !== all.length) throw new Error("A card is selected twice");
};
const remaining = (state: UTHState) => {
  const used = new Set([...state.player, ...state.board, ...(state.dealerVisible === undefined ? [] : [state.dealerVisible])]);
  return Array.from({ length: 52 }, (_, index) => index).filter(card => !used.has(card));
};
const exactDecision = (action: string, evs: Record<string, number>, difference: number, outcomes: number): UTHDecision => ({
  action,
  evs,
  difference: Math.abs(difference),
  exact: true,
  method: "EXACT",
  outcomes,
  standardError: 0,
  confidenceInterval: [difference, difference],
  status: "CONFIRMED",
  precisionTargetMet: true,
});

export function solveRiver(state: UTHState): UTHDecision {
  validate(state);
  if (state.board.length !== 5) throw new Error("River needs five board cards");
  const rem = remaining(state);
  const player = evaluate([...state.player, ...state.board]);
  let total = 0;
  let count = 0;
  if (state.dealerVisible !== undefined) {
    for (const hidden of rem) {
      total += settle(player, evaluate([state.dealerVisible, hidden, ...state.board]), 1);
      count++;
    }
  } else {
    for (let i = 0; i < rem.length - 1; i++) for (let j = i + 1; j < rem.length; j++) {
      total += settle(player, evaluate([rem[i], rem[j], ...state.board]), 1);
      count++;
    }
  }
  const call = total / count;
  const fold = -2;
  return exactDecision(call >= fold ? "1X" : "FOLD", { "1X": call, FOLD: fold }, call - fold, count);
}

type FlopValues = { bet2: number; check: number; bet4?: number; outcomes: number };
const flopCache = new Map<string, FlopValues>();
const suitPermutations: number[][] = [];
for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (b !== a) {
  for (let c = 0; c < 4; c++) if (c !== a && c !== b) {
    for (let d = 0; d < 4; d++) if (d !== a && d !== b && d !== c) suitPermutations.push([a, b, c, d]);
  }
}

function canonicalKey(state: UTHState, includeOpening: boolean) {
  let best = "";
  for (const permutation of suitPermutations) {
    const map = (card: number) => permutation[suit(card)] * 13 + card % 13;
    const player = state.player.map(map).sort((a, b) => a - b);
    const board = state.board.map(map).sort((a, b) => a - b);
    const visible = state.dealerVisible === undefined ? "-" : String(map(state.dealerVisible));
    const key = `${includeOpening ? 1 : 0}|${player.join(",")}|${board.join(",")}|${visible}`;
    if (!best || key < best) best = key;
  }
  return best;
}

function flopValues(state: UTHState, includeOpening: boolean): FlopValues {
  const key = canonicalKey(state, includeOpening);
  const cached = flopCache.get(key);
  if (cached) return cached;
  const rem = remaining(state);
  let bet = 0;
  let check = 0;
  let bet4 = 0;
  let boards = 0;
  let outcomes = 0;
  for (let i = 0; i < rem.length - 1; i++) for (let j = i + 1; j < rem.length; j++) {
    const board = [...state.board, rem[i], rem[j]];
    const pool = rem.filter((_, index) => index !== i && index !== j);
    const player = evaluate([...state.player, ...board]);
    let one = 0;
    let two = 0;
    let four = 0;
    let count = 0;
    if (state.dealerVisible !== undefined) {
      for (const hidden of pool) {
        const dealer = evaluate([state.dealerVisible, hidden, ...board]);
        one += settle(player, dealer, 1);
        two += settle(player, dealer, 2);
        if (includeOpening) four += settle(player, dealer, 4);
        count++;
      }
    } else {
      for (let a = 0; a < pool.length - 1; a++) for (let b = a + 1; b < pool.length; b++) {
        const dealer = evaluate([pool[a], pool[b], ...board]);
        one += settle(player, dealer, 1);
        two += settle(player, dealer, 2);
        if (includeOpening) four += settle(player, dealer, 4);
        count++;
      }
    }
    bet += two / count;
    check += Math.max(one / count, -2);
    if (includeOpening) bet4 += four / count;
    boards++;
    outcomes += count;
  }
  const result = { bet2: bet / boards, check: check / boards, ...(includeOpening ? { bet4: bet4 / boards } : {}), outcomes };
  flopCache.set(key, result);
  return result;
}

export function solveFlop(state: UTHState): UTHDecision {
  validate(state);
  if (state.board.length !== 3) throw new Error("Flop needs three board cards");
  const values = flopValues(state, false);
  return exactDecision(values.bet2 >= values.check ? "2X" : "CHECK", { "2X": values.bet2, CHECK: values.check }, values.bet2 - values.check, values.outcomes);
}

const openingBasic = (cards: number[]) => {
  const [a, b] = cards.slice().sort((x, y) => rank(y) - rank(x));
  const high = rank(a);
  const low = rank(b);
  const suited = suit(a) === suit(b);
  if (high === low) return high === 2 ? "CHECK" : "4X";
  if (suited) return high >= 13 || (high === 12 && low >= 6) || (high === 11 && low >= 8) ? "4X" : "CHECK";
  return high === 14 || (high === 13 && low >= 5) || (high === 12 && low >= 8) || (high === 11 && low === 10) ? "4X" : "CHECK";
};
export function referenceOpening(state: UTHState): UTHDecision {
  validate(state);
  if (state.board.length) throw new Error("Opening reference needs no board");
  return { action: openingBasic(state.player), evs: {}, difference: 0, exact: false,
    method: "PUBLISHED_OPTIMAL_STRATEGY", outcomes: 0, standardError: 0,
    confidenceInterval: [0, 0], status: "CONFIRMED", decisionMarginAvailable: false, precisionTargetMet: true };
}
function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

type Stratum = {
  population: number;
  flops: Array<{cards:number[];proxy:number}>;
  proxyMean: number;
  sample: number;
  four: number;
  check: number;
  mean: number;
  m2: number;
};
/**
 * Cheap deterministic proxy used only as a control variate. Its mean is
 * evaluated over the complete flop population, so it cannot bias the sampled
 * exact result. Perfect-completion choices deliberately make it inexpensive
 * and highly correlated; they are never used as the actual playing policy.
 */
function openingDeltaProxy(state:UTHState,flop:number[],completions=16):number{
  const proxyState={player:state.player,board:flop,dealerVisible:state.dealerVisible},pool=remaining(proxyState);
  let hash=[...state.player,...flop,state.dealerVisible??99].reduce((value,card)=>Math.imul(value^card,16777619),2166136261)>>>0,total=0;
  for(let sampleIndex=0;sampleIndex<completions;sampleIndex++){
    const needed=state.dealerVisible===undefined?4:3,picked:number[]=[];
    while(picked.length<needed){hash=Math.imul(hash^hash>>>15,2246822519)>>>0;const index=hash%pool.length;if(!picked.includes(index))picked.push(index);}
    const board=[...flop,pool[picked[0]],pool[picked[1]]],dealer=state.dealerVisible===undefined?[pool[picked[2]],pool[picked[3]]]:[state.dealerVisible,pool[picked[2]]];
    const playerRank=evaluate([...state.player,...board]),dealerRank=evaluate([...dealer,...board]);
    const four=settle(playerRank,dealerRank,4),two=settle(playerRank,dealerRank,2),one=settle(playerRank,dealerRank,1);
    total+=four-Math.max(two,one,-2);
  }
  return total/completions;
}
function stratumKey(flop: number[]) {
  const ranks = new Map<number, number>();
  const suits = new Map<number, number>();
  for (const card of flop) {
    ranks.set(rank(card), (ranks.get(rank(card)) ?? 0) + 1);
    suits.set(suit(card), (suits.get(suit(card)) ?? 0) + 1);
  }
  return `${[...ranks.values()].sort((a, b) => b - a).join("")}|${[...suits.values()].sort((a, b) => b - a).join("")}`;
}
function allocate(strata: Stratum[], wanted: number) {
  const minimum = wanted >= strata.length * 2 ? 2 : wanted >= strata.length ? 1 : 0;
  for (const item of strata) item.sample = Math.min(minimum, item.population);
  let left = wanted - strata.reduce((sum, item) => sum + item.sample, 0);
  while (left > 0) {
    const candidates = strata.filter(item => item.sample < item.population);
    if (!candidates.length) break;
    const best = candidates.reduce((a, b) => (b.population - b.sample) / (b.sample + 1) > (a.population - a.sample) / (a.sample + 1) ? b : a);
    best.sample++;
    left--;
  }
}

export function classifyOpeningEstimate(mean:number,halfWidth:number,exact=false){
  const signConfirmed=Number.isFinite(halfWidth)&&(mean-halfWidth>0||mean+halfWidth<0);
  const precisionTargetMet=exact||(Number.isFinite(halfWidth)&&halfWidth<=0.001);
  return{confirmed:exact||signConfirmed,precisionTargetMet};
}

/** Sample flop information states, then solve every sampled continuation exactly. */
export function solveOpening(state: UTHState, samples = 64): UTHDecision {
  validate(state);
  if (state.board.length) throw new Error("Opening needs no board");
  const rem = remaining(state);
  const groups = new Map<string, Array<{cards:number[];proxy:number}>>();
  for (let i = 0; i < rem.length - 2; i++) for (let j = i + 1; j < rem.length - 1; j++) for (let k = j + 1; k < rem.length; k++) {
    const flop = [rem[i], rem[j], rem[k]];
    const key = stratumKey(flop);
    const group = groups.get(key);
    const entry={cards:flop,proxy:openingDeltaProxy(state,flop)};
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  const strata: Stratum[] = [...groups.values()].map(flops => ({ population: flops.length, flops, proxyMean:flops.reduce((sum,item)=>sum+item.proxy,0)/flops.length, sample: 0, four: 0, check: 0, mean: 0, m2: 0 }));
  const population = strata.reduce((sum, item) => sum + item.population, 0);
  // Every texture stratum must be represented or the weighted estimate is biased.
  const wanted = Math.max(strata.length, Math.min(Math.floor(samples), population));
  allocate(strata, wanted);
  const random = mulberry([...state.player, state.dealerVisible ?? 99].reduce((hash, card) => Math.imul(hash ^ card, 16777619), 2166136261));
  let outcomes = 0;
  for (const item of strata) {
    for (let i = 0; i < item.sample; i++) {
      const selected = i + Math.floor(random() * (item.flops.length - i));
      [item.flops[i], item.flops[selected]] = [item.flops[selected], item.flops[i]];
      const sampled=item.flops[i],child = flopValues({ player: state.player, board: sampled.cards, dealerVisible: state.dealerVisible }, true);
      const four = child.bet4!;
      const check = Math.max(child.bet2, child.check);
      const delta = four - check;
      const residual=delta-sampled.proxy;
      const count = i + 1;
      const difference = residual - item.mean;
      item.four += four;
      item.check += check;
      item.mean += difference / count;
      item.m2 += difference * (residual - item.mean);
      outcomes += child.outcomes;
    }
  }
  let ev4 = 0;
  let check = 0;
  let mean = 0;
  let varianceOfMean = 0;
  let estimable = true;
  for (const item of strata) {
    if (!item.sample) continue;
    const weight = item.population / population;
    ev4 += weight * item.four / item.sample;
    check += weight * item.check / item.sample;
    mean += weight * (item.proxyMean+item.mean);
    if (item.sample < item.population) {
      if (item.sample < 2) estimable = false;
      else {
        const sampleVariance = item.m2 / (item.sample - 1);
        const finitePopulationCorrection = (item.population - item.sample) / (item.population - 1);
        varianceOfMean += weight * weight * sampleVariance / item.sample * finitePopulationCorrection;
      }
    }
  }
  const exact = wanted === population;
  const standardError = exact ? 0 : estimable ? Math.sqrt(varianceOfMean) : Number.POSITIVE_INFINITY;
  const halfWidth = 3.290526731 * standardError;
  // Action certainty and numerical EV precision are distinct. A paired 99.9%
  // interval wholly on one side of zero is sufficient to identify the better
  // action. The stricter 0.001-unit target remains visible independently and
  // is still required before treating the displayed EV margin as high precision.
  const {confirmed,precisionTargetMet}=classifyOpeningEstimate(mean,halfWidth,exact);
  const status = confirmed ? "CONFIRMED" : "INCONCLUSIVE — MORE COMPUTATION REQUIRED";
  return {
    action: confirmed ? mean >= 0 ? "4X" : "CHECK" : status,
    evs: { "4X": ev4, CHECK: check },
    difference: Math.abs(mean),
    exact,
    method: exact ? "EXACT" : "PAIRED_STRATIFIED_MONTE_CARLO+EXACT_CHILDREN",
    outcomes,
    standardError,
    confidenceInterval: exact ? [mean, mean] : [mean - halfWidth, mean + halfWidth],
    status,
    sampledStates: wanted,
    populationStates: population,
    decisionMarginAvailable: true,
    precisionTargetMet,
  };
}

export function solve(state: UTHState, samples = 64) {
  return state.board.length === 5 ? solveRiver(state) : state.board.length === 3 ? solveFlop(state) : solveOpening(state, samples);
}
export function policyImprovement(exposed: UTHDecision, normal: UTHDecision) {
  if (exposed.status !== "CONFIRMED" || normal.status !== "CONFIRMED" || !(normal.action in exposed.evs)) return null;
  return Math.max(0, Math.max(...Object.values(exposed.evs)) - exposed.evs[normal.action]);
}
export { openingBasic };
