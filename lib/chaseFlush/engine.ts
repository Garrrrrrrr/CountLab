export const RANKS = "23456789TJQKA";
export const SUITS = "cdhs";
export type InfoState = { player: number[]; board: number[]; dealerVisible?: number };
export type Decision = { action: string; evs: Record<string, number>; difference: number; exact: boolean };

export function parseCard(raw: string): number {
  const value = raw.trim();
  if (value.length !== 2) throw new Error(`Invalid card “${raw}”`);
  const r = RANKS.indexOf(value[0].toUpperCase()), s = SUITS.indexOf(value[1].toLowerCase());
  if (r < 0 || s < 0) throw new Error(`Invalid card “${raw}”`);
  return s * 13 + r;
}
export function parseCards(raw: string): number[] {
  const cards = raw.trim() ? raw.trim().split(/\s+/).map(parseCard) : [];
  if (new Set(cards).size !== cards.length) throw new Error("A card was entered twice");
  return cards;
}
export const cardName = (card: number) => RANKS[card % 13] + SUITS[Math.floor(card / 13)];
const rank = (card: number) => card % 13 + 2;
const suit = (card: number) => Math.floor(card / 13);

export function flushRank(cards: number[]): number[] {
  const groups = [[], [], [], []] as number[][];
  for (const c of cards) groups[suit(c)].push(rank(c));
  return groups.map(g => [g.length, ...g.sort((a,b) => b-a)]).sort(compareRank).at(-1)!;
}
function compareRank(a: number[], b: number[]): number {
  for (let i=0; i<Math.max(a.length,b.length); i++) { const d=(a[i]??0)-(b[i]??0); if(d) return d; }
  return 0;
}
export const dealerQualifies = (cards: number[]) => { const r=flushRank(cards); return r[0]>3 || (r[0]===3 && r[1]>=9); };
const xtra: Record<number,number> = {4:1,5:5,6:50,7:250};
export function settle(player: number[], dealer: number[], wager: number): number {
  const p=flushRank(player), d=flushRank(dealer), cmp=compareRank(p,d);
  if (!cmp) return 0;
  if (cmp<0) return (dealerQualifies(dealer) ? -1 : 0) - wager - 1;
  return (dealerQualifies(dealer) ? 1 : 0) + wager + (xtra[p[0]]??0);
}
function combinations(values:number[], n:number):number[][] {
  const out:number[][]=[];
  const walk=(start:number,pick:number,acc:number[])=>{ if(!pick){out.push(acc.slice());return;} for(let i=start;i<=values.length-pick;i++){acc.push(values[i]);walk(i+1,pick-1,acc);acc.pop();}};
  walk(0,n,[]); return out;
}
function hashState(s:InfoState, salt:number) { let h=2166136261^salt; for(const x of [...s.player,...s.board,s.dealerVisible??99]) {h=Math.imul(h^x,16777619);} return h>>>0; }
function rng(seed:number){ return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function sample(values:number[], n:number, random:()=>number){const a=values.slice();for(let i=0;i<n;i++){const j=i+Math.floor(random()*(a.length-i));[a[i],a[j]]=[a[j],a[i]];}return a.slice(0,n);}
const remaining=(s:InfoState)=>Array.from({length:52},(_,i)=>i).filter(c=>![...s.player,...s.board,...(s.dealerVisible===undefined?[]:[s.dealerVisible])].includes(c));

function wagerEV(state:InfoState,wager:number,samples:number,forceExact=false):[number,boolean]{
  const rem=remaining(state), dealerN=state.dealerVisible===undefined?3:2, futureN=4-state.board.length;
  const exact=forceExact && futureN===0;
  let total=0,count=0;
  if(exact){ for(const hidden of combinations(rem,dealerN)){const dealer=state.dealerVisible===undefined?hidden:[state.dealerVisible,...hidden];total+=settle([...state.player,...state.board],[...dealer,...state.board],wager);count++;} }
  else {const random=rng(hashState(state,wager));for(let i=0;i<samples;i++){const draw=sample(rem,dealerN+futureN,random),dealer=state.dealerVisible===undefined?draw.slice(0,dealerN):[state.dealerVisible,...draw.slice(0,dealerN)],board=[...state.board,...draw.slice(dealerN)];total+=settle([...state.player,...board],[...dealer,...board],wager);count++;}}
  return [total/count,exact];
}
function solveInternal(state:InfoState,samples:number,direct:boolean):Decision{
  const stage=state.board.length===0?1:state.board.length===2?2:3;
  if(stage===3){const [bet,exact]=wagerEV(state,1,samples,direct),evs={"1x":bet,fold:-2},action=bet>=-2?"1x":"fold";return{action,evs,difference:Math.abs(bet+2),exact};}
  const wager=stage===1?3:2,[bet]=wagerEV(state,wager,samples),random=rng(hashState(state,77)),rem=remaining(state);let check=0;
  for(let i=0;i<samples;i++){const board=[...state.board,...sample(rem,2,random)];check+=Math.max(...Object.values(solveInternal({...state,board},samples,false).evs));}
  check/=samples;const evs={[`${wager}x`]:bet,check},action=bet>=check?`${wager}x`:"check";
  return{action,evs,difference:Math.abs(bet-check),exact:false};
}
export function solve(state:InfoState,samples=24):Decision{
  if(state.player.length!==3||![0,2,4].includes(state.board.length)) throw new Error("Use 3 player cards and 0, 2, or 4 board cards");
  const all=[...state.player,...state.board,...(state.dealerVisible===undefined?[]:[state.dealerVisible])];if(new Set(all).size!==all.length)throw new Error("Cards cannot be duplicated");
  return solveInternal(state,samples,true);
}
