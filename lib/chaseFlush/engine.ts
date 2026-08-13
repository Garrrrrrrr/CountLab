export const RANKS = "23456789TJQKA";
export const SUITS = "cdhs";
export type InfoState = { player: number[]; board: number[]; dealerVisible?: number };
export type Decision = { action: string; evs: Record<string, number>; difference: number; exact: boolean };
export type PayoffBreakdown = { ante: number; xtra: number; allIn: number; total: number };

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
export function settleBreakdown(player: number[], dealer: number[], wager: number, sixCardPayout=50):PayoffBreakdown {
  const p=flushRank(player), d=flushRank(dealer), cmp=compareRank(p,d);
  if (!cmp) return {ante:0,xtra:0,allIn:0,total:0};
  if (cmp<0) {
    const ante=dealerQualifies(dealer)?-1:0,xtra=-1,allIn=-wager;
    return {ante,xtra,allIn,total:ante+xtra+allIn};
  }
  const xtra: Record<number,number> = {4:1,5:5,6:sixCardPayout,7:250};
  const ante=dealerQualifies(dealer)?1:0,bonus=xtra[p[0]]??0,allIn=wager;
  return {ante,xtra:bonus,allIn,total:ante+bonus+allIn};
}
/** Folding loses the two mandatory one-unit bets and places no All-In. */
export function foldBreakdown():PayoffBreakdown{return{ante:-1,xtra:-1,allIn:0,total:-2};}
export function settle(player:number[],dealer:number[],wager:number,sixCardPayout=50):number{return settleBreakdown(player,dealer,wager,sixCardPayout).total;}
function combinations(values:number[], n:number):number[][] {
  const out:number[][]=[];
  const walk=(start:number,pick:number,acc:number[])=>{ if(!pick){out.push(acc.slice());return;} for(let i=start;i<=values.length-pick;i++){acc.push(values[i]);walk(i+1,pick-1,acc);acc.pop();}};
  walk(0,n,[]); return out;
}
function hashState(s:InfoState, salt:number) { let h=2166136261^salt; for(const x of [...s.player,...s.board,s.dealerVisible??99]) {h=Math.imul(h^x,16777619);} return h>>>0; }
function rng(seed:number){ return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function sample(values:number[], n:number, random:()=>number){const a=values.slice();for(let i=0;i<n;i++){const j=i+Math.floor(random()*(a.length-i));[a[i],a[j]]=[a[j],a[i]];}return a.slice(0,n);}
const remaining=(s:InfoState)=>Array.from({length:52},(_,i)=>i).filter(c=>![...s.player,...s.board,...(s.dealerVisible===undefined?[]:[s.dealerVisible])].includes(c));

/** Exact second-decision value, grouped by future board before choosing 1x/fold. */
export function exactSecondDecision(state:InfoState,sixCardPayout=50):Decision{
  if(state.board.length!==2||state.dealerVisible===undefined)throw new Error("Exact second-decision mode requires two board cards and one exposed dealer card");
  const rem=remaining(state),visible=state.dealerVisible;
  let betTotal=0,checkTotal=0,boardCount=0;
  for(let bi=0;bi<rem.length-1;bi++)for(let bj=bi+1;bj<rem.length;bj++){
    const future=[rem[bi],rem[bj]],board=[...state.board,...future];
    let betBoard=0,callBoard=0,dealerCount=0;
    for(let di=0;di<rem.length-1;di++){
      if(di===bi||di===bj)continue;
      for(let dj=di+1;dj<rem.length;dj++){
        if(dj===bi||dj===bj)continue;
        const dealer=[visible,rem[di],rem[dj]],player=[...state.player,...board];
        betBoard+=settle(player,[...dealer,...board],2,sixCardPayout);
        callBoard+=settle(player,[...dealer,...board],1,sixCardPayout);
        dealerCount++;
      }
    }
    betTotal+=betBoard/dealerCount;
    checkTotal+=Math.max(callBoard/dealerCount,foldBreakdown().total);
    boardCount++;
  }
  const bet=betTotal/boardCount,check=checkTotal/boardCount,evs={"2x":bet,check},action=bet>=check?"2x":"check";
  return{action,evs,difference:Math.abs(bet-check),exact:true};
}

function wagerEV(state:InfoState,wager:number,samples:number,forceExact=false,seedOffset=0,sixCardPayout=50):[number,boolean]{
  const rem=remaining(state), dealerN=state.dealerVisible===undefined?3:2, futureN=4-state.board.length;
  const exact=forceExact && futureN===0;
  let total=0,count=0;
  if(exact){ for(const hidden of combinations(rem,dealerN)){const dealer=state.dealerVisible===undefined?hidden:[state.dealerVisible,...hidden];total+=settle([...state.player,...state.board],[...dealer,...state.board],wager,sixCardPayout);count++;} }
  else {const random=rng(hashState(state,wager+seedOffset));for(let i=0;i<samples;i++){const draw=sample(rem,dealerN+futureN,random),dealer=state.dealerVisible===undefined?draw.slice(0,dealerN):[state.dealerVisible,...draw.slice(0,dealerN)],board=[...state.board,...draw.slice(dealerN)];total+=settle([...state.player,...board],[...dealer,...board],wager,sixCardPayout);count++;}}
  return [total/count,exact];
}
function solveInternal(state:InfoState,samples:number,direct:boolean,seedOffset:number,sixCardPayout:number):Decision{
  const stage=state.board.length===0?1:state.board.length===2?2:3;
  if(stage===2&&direct&&state.dealerVisible!==undefined)return exactSecondDecision(state,sixCardPayout);
  if(stage===3){const fold=foldBreakdown().total,[bet,exact]=wagerEV(state,1,samples,direct,seedOffset,sixCardPayout),evs={"1x":bet,fold},action=bet>=fold?"1x":"fold";return{action,evs,difference:Math.abs(bet-fold),exact};}
  const wager=stage===1?3:2,[bet]=wagerEV(state,wager,samples,false,seedOffset,sixCardPayout),random=rng(hashState(state,77+seedOffset)),rem=remaining(state);let check=0;
  for(let i=0;i<samples;i++){const board=[...state.board,...sample(rem,2,random)];check+=Math.max(...Object.values(solveInternal({...state,board},samples,false,seedOffset,sixCardPayout).evs));}
  check/=samples;const evs={[`${wager}x`]:bet,check},action=bet>=check?`${wager}x`:"check";
  return{action,evs,difference:Math.abs(bet-check),exact:false};
}
export function solve(state:InfoState,samples=24,seedOffset=0,sixCardPayout=50):Decision{
  if(state.player.length!==3||![0,2,4].includes(state.board.length)) throw new Error("Use 3 player cards and 0, 2, or 4 board cards");
  const all=[...state.player,...state.board,...(state.dealerVisible===undefined?[]:[state.dealerVisible])];if(new Set(all).size!==all.length)throw new Error("Cards cannot be duplicated");
  return solveInternal(state,samples,true,seedOffset,sixCardPayout);
}
