export const RANKS = "23456789TJQKA";
export const SUITS = "cdhs";
export type InfoState = { player: number[]; board: number[]; dealerVisible?: number };
export type ActionStatistics = {ev:number;standardError:number;ci95:[number,number];ci99:[number,number];ci999:[number,number];ci9999:[number,number];samples:number;evaluations?:number;runtimeSeconds:number;samplesPerSecond:number};
export type Decision = { action: string; evs: Record<string, number>; difference: number; exact: boolean; method?:"EXACT"|"MONTE_CARLO"; resolved?:boolean; statistics?:Record<string,ActionStatistics>; differenceStatistics?:ActionStatistics };
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

function popcount(value:number):number{let count=0;while(value){value&=value-1;count++;}return count;}
const CARD_SUIT=Uint8Array.from({length:52},(_,card)=>Math.floor(card/13));
const CARD_BIT=Uint16Array.from({length:52},(_,card)=>1<<(card%13));
const MASK_SCORE=Uint32Array.from({length:8192},(_,mask)=>(popcount(mask)<<13)|mask);
const packedScore=(m0:number,m1:number,m2:number,m3:number):number=>Math.max(MASK_SCORE[m0],MASK_SCORE[m1],MASK_SCORE[m2],MASK_SCORE[m3]);
function packedScore7(c0:number,c1:number,c2:number,c3:number,c4:number,c5:number,c6:number):number{
  let m0=0,m1=0,m2=0,m3=0;
  for(const card of [c0,c1,c2,c3,c4,c5,c6]){
    const bit=CARD_BIT[card];
    switch(CARD_SUIT[card]){case 0:m0|=bit;break;case 1:m1|=bit;break;case 2:m2|=bit;break;default:m3|=bit;}
  }
  return packedScore(m0,m1,m2,m3);
}
function fastProfit(playerScore:number,dealerScore:number,wager:number,sixCardPayout:number):number{
  if(playerScore===dealerScore)return 0;
  const dealerLength=dealerScore>>>13,dealerMask=dealerScore&8191,qualifies=dealerLength>3||(dealerLength===3&&dealerMask>=(1<<7));
  if(playerScore<dealerScore)return-(qualifies?1:0)-wager-1;
  const length=playerScore>>>13,xtra=length===4?1:length===5?5:length===6?sixCardPayout:length===7?250:0;
  return(qualifies?1:0)+wager+xtra;
}
function exactStats(ev:number,samples:number,runtimeSeconds:number,evaluations=samples):ActionStatistics{return{ev,standardError:0,ci95:[ev,ev],ci99:[ev,ev],ci999:[ev,ev],ci9999:[ev,ev],samples,evaluations,runtimeSeconds,samplesPerSecond:evaluations/runtimeSeconds};}

export type ExactOpeningChunk = {
  bet3Sum:number;
  bet2ByFirst:Float64Array;
  riverByFirst:Float64Array;
  boardsByFirst:Uint32Array;
  completedBoards:number;
};

const choose2=(value:number)=>value*(value-1)/2;
const choose3=(value:number)=>value*(value-1)*(value-2)/6;
const choose4=(value:number)=>value*(value-1)*(value-2)*(value-3)/24;
function setCardMask(card:number,masks:number[]):void{masks[CARD_SUIT[card]]|=CARD_BIT[card];}
function openingPairMap(size:number):Int16Array{
  const map=new Int16Array(size*size);map.fill(-1);let index=0;
  for(let first=0;first<size-1;first++)for(let second=first+1;second<size;second++)map[first*size+second]=index++;
  return map;
}

/**
 * Exact opening contribution for a contiguous range of completed four-card
 * boards. A completed board is scored once and attributed to each of its six
 * possible first-board pairs, avoiding six identical dealer enumerations.
 */
export function exactOpeningChunk(state:InfoState,startBoard=0,endBoard=Infinity,sixCardPayout=50):ExactOpeningChunk{
  if(state.board.length!==0)throw new Error("Exact opening mode requires no board cards");
  const rem=remaining(state),size=rem.length,pairMap=openingPairMap(size),pairCount=choose2(size);
  const bet2ByFirst=new Float64Array(pairCount),riverByFirst=new Float64Array(pairCount),boardsByFirst=new Uint32Array(pairCount);
  const playerMasks=[0,0,0,0];for(const card of state.player)setCardMask(card,playerMasks);
  const visible=state.dealerVisible,visibleSuit=visible===undefined?-1:CARD_SUIT[visible],visibleBit=visible===undefined?0:CARD_BIT[visible];
  let ordinal=0,completedBoards=0,bet3Sum=0;
  outer: for(let ai=0;ai<size-3;ai++)for(let bi=ai+1;bi<size-2;bi++)for(let ci=bi+1;ci<size-1;ci++)for(let di=ci+1;di<size;di++){
    if(ordinal<startBoard){ordinal++;continue;}
    if(ordinal>=endBoard)break outer;
    ordinal++;completedBoards++;
    const a=rem[ai],b=rem[bi],c=rem[ci],d=rem[di];
    const bm0=(CARD_SUIT[a]===0?CARD_BIT[a]:0)|(CARD_SUIT[b]===0?CARD_BIT[b]:0)|(CARD_SUIT[c]===0?CARD_BIT[c]:0)|(CARD_SUIT[d]===0?CARD_BIT[d]:0);
    const bm1=(CARD_SUIT[a]===1?CARD_BIT[a]:0)|(CARD_SUIT[b]===1?CARD_BIT[b]:0)|(CARD_SUIT[c]===1?CARD_BIT[c]:0)|(CARD_SUIT[d]===1?CARD_BIT[d]:0);
    const bm2=(CARD_SUIT[a]===2?CARD_BIT[a]:0)|(CARD_SUIT[b]===2?CARD_BIT[b]:0)|(CARD_SUIT[c]===2?CARD_BIT[c]:0)|(CARD_SUIT[d]===2?CARD_BIT[d]:0);
    const bm3=(CARD_SUIT[a]===3?CARD_BIT[a]:0)|(CARD_SUIT[b]===3?CARD_BIT[b]:0)|(CARD_SUIT[c]===3?CARD_BIT[c]:0)|(CARD_SUIT[d]===3?CARD_BIT[d]:0);
    const playerScore=packedScore(playerMasks[0]|bm0,playerMasks[1]|bm1,playerMasks[2]|bm2,playerMasks[3]|bm3);
    let dm0=bm0,dm1=bm1,dm2=bm2,dm3=bm3;
    if(visibleSuit===0)dm0|=visibleBit;else if(visibleSuit===1)dm1|=visibleBit;else if(visibleSuit===2)dm2|=visibleBit;else if(visibleSuit===3)dm3|=visibleBit;
    let callSum=0,winLossMargin=0,hidden=0;
    if(visible!==undefined){
      for(let hi=0;hi<size-1;hi++){
        if(hi===ai||hi===bi||hi===ci||hi===di)continue;
        const first=rem[hi],firstSuit=CARD_SUIT[first],firstBit=CARD_BIT[first];
        const h0=firstSuit===0?dm0|firstBit:dm0,h1=firstSuit===1?dm1|firstBit:dm1,h2=firstSuit===2?dm2|firstBit:dm2,h3=firstSuit===3?dm3|firstBit:dm3;
        for(let hj=hi+1;hj<size;hj++){
          if(hj===ai||hj===bi||hj===ci||hj===di)continue;
          const second=rem[hj],secondSuit=CARD_SUIT[second],secondBit=CARD_BIT[second];
          const dealerScore=packedScore(secondSuit===0?h0|secondBit:h0,secondSuit===1?h1|secondBit:h1,secondSuit===2?h2|secondBit:h2,secondSuit===3?h3|secondBit:h3);
          if(playerScore!==dealerScore){
            const dealerLength=dealerScore>>>13,dealerMask=dealerScore&8191,qualifies=dealerLength>3||(dealerLength===3&&dealerMask>=(1<<7));
            if(playerScore>dealerScore){const length=playerScore>>>13,bonus=length===4?1:length===5?5:length===6?sixCardPayout:length===7?250:0;callSum+=(qualifies?1:0)+bonus+1;winLossMargin++;}
            else{callSum-=(qualifies?1:0)+2;winLossMargin--;}
          }
          hidden++;
        }
      }
    }else{
      for(let hi=0;hi<size-2;hi++){
        if(hi===ai||hi===bi||hi===ci||hi===di)continue;
        const first=rem[hi],firstSuit=CARD_SUIT[first],firstBit=CARD_BIT[first];
        const h0=firstSuit===0?dm0|firstBit:dm0,h1=firstSuit===1?dm1|firstBit:dm1,h2=firstSuit===2?dm2|firstBit:dm2,h3=firstSuit===3?dm3|firstBit:dm3;
        for(let hj=hi+1;hj<size-1;hj++){
          if(hj===ai||hj===bi||hj===ci||hj===di)continue;
          const second=rem[hj],secondSuit=CARD_SUIT[second],secondBit=CARD_BIT[second];
          const j0=secondSuit===0?h0|secondBit:h0,j1=secondSuit===1?h1|secondBit:h1,j2=secondSuit===2?h2|secondBit:h2,j3=secondSuit===3?h3|secondBit:h3;
          for(let hk=hj+1;hk<size;hk++){
            if(hk===ai||hk===bi||hk===ci||hk===di)continue;
            const third=rem[hk],thirdSuit=CARD_SUIT[third],thirdBit=CARD_BIT[third];
            const dealerScore=packedScore(thirdSuit===0?j0|thirdBit:j0,thirdSuit===1?j1|thirdBit:j1,thirdSuit===2?j2|thirdBit:j2,thirdSuit===3?j3|thirdBit:j3);
            if(playerScore!==dealerScore){
              const dealerLength=dealerScore>>>13,dealerMask=dealerScore&8191,qualifies=dealerLength>3||(dealerLength===3&&dealerMask>=(1<<7));
              if(playerScore>dealerScore){const length=playerScore>>>13,bonus=length===4?1:length===5?5:length===6?sixCardPayout:length===7?250:0;callSum+=(qualifies?1:0)+bonus+1;winLossMargin++;}
              else{callSum-=(qualifies?1:0)+2;winLossMargin--;}
            }
            hidden++;
          }
        }
      }
    }
    const bet2=callSum+winLossMargin,bet3=callSum+2*winLossMargin,river=Math.max(callSum/hidden,-2);
    bet3Sum+=bet3;
    for(const pair of [pairMap[ai*size+bi],pairMap[ai*size+ci],pairMap[ai*size+di],pairMap[bi*size+ci],pairMap[bi*size+di],pairMap[ci*size+di]]){
      bet2ByFirst[pair]+=bet2;riverByFirst[pair]+=river;boardsByFirst[pair]++;
    }
  }
  return{bet3Sum,bet2ByFirst,riverByFirst,boardsByFirst,completedBoards};
}

export function finalizeExactOpening(state:InfoState,chunks:ExactOpeningChunk[],runtimeSeconds:number):Decision{
  if(!chunks.length||chunks.some((chunk)=>chunk===undefined))throw new Error("Opening solve is still waiting for worker chunks");
  const rem=remaining(state),pairCount=choose2(rem.length),hiddenPerBoard=state.dealerVisible===undefined?choose3(rem.length-4):choose2(rem.length-4);
  const bet2ByFirst=new Float64Array(pairCount),riverByFirst=new Float64Array(pairCount),boardsByFirst=new Uint32Array(pairCount);
  let bet3Sum=0,completedBoards=0;
  for(const chunk of chunks){
    bet3Sum+=chunk.bet3Sum;completedBoards+=chunk.completedBoards;
    for(let index=0;index<pairCount;index++){bet2ByFirst[index]+=chunk.bet2ByFirst[index];riverByFirst[index]+=chunk.riverByFirst[index];boardsByFirst[index]+=chunk.boardsByFirst[index];}
  }
  if(completedBoards!==choose4(rem.length))throw new Error(`Opening solve received ${completedBoards} of ${choose4(rem.length)} completed boards`);
  let openingCheckSum=0;
  for(let index=0;index<pairCount;index++){
    const boards=boardsByFirst[index];
    if(boards!==choose2(rem.length-2))throw new Error("Opening solve is missing a first-board continuation");
    openingCheckSum+=Math.max(bet2ByFirst[index]/(boards*hiddenPerBoard),riverByFirst[index]/boards);
  }
  const uniqueTerminals=completedBoards*hiddenPerBoard,totalTerminals=uniqueTerminals*6;
  const bet=bet3Sum/uniqueTerminals,check=openingCheckSum/pairCount,difference=bet-check,evs={"3x":bet,check},action=difference>=0?"3x":"check";
  return{action,evs,difference:Math.abs(difference),exact:true,method:"EXACT",resolved:true,statistics:{"3x":exactStats(bet,totalTerminals,runtimeSeconds,uniqueTerminals),check:exactStats(check,totalTerminals,runtimeSeconds,uniqueTerminals)},differenceStatistics:exactStats(difference,totalTerminals,runtimeSeconds,uniqueTerminals)};
}

/** Exact second-decision value, grouped by future board before choosing 1x/fold. */
export function exactSecondDecision(state:InfoState,sixCardPayout=50):Decision{
  const started=performance.now();
  if(state.board.length!==2)throw new Error("Exact second-decision mode requires two board cards");
  const rem=remaining(state),visible=state.dealerVisible;
  let betTotal=0,checkTotal=0,boardCount=0,totalTerminals=0;
  for(let bi=0;bi<rem.length-1;bi++)for(let bj=bi+1;bj<rem.length;bj++){
    const future=[rem[bi],rem[bj]],board=[...state.board,...future];
    let betBoard=0,callBoard=0,dealerCount=0;
    const playerScore=packedScore7(state.player[0],state.player[1],state.player[2],board[0],board[1],board[2],board[3]);
    if(visible!==undefined){
      for(let di=0;di<rem.length-1;di++){
        if(di===bi||di===bj)continue;
        for(let dj=di+1;dj<rem.length;dj++){
          if(dj===bi||dj===bj)continue;
          const dealerScore=packedScore7(visible,rem[di],rem[dj],board[0],board[1],board[2],board[3]);
          betBoard+=fastProfit(playerScore,dealerScore,2,sixCardPayout);callBoard+=fastProfit(playerScore,dealerScore,1,sixCardPayout);dealerCount++;
        }
      }
    }else{
      for(let di=0;di<rem.length-2;di++){
        if(di===bi||di===bj)continue;
        for(let dj=di+1;dj<rem.length-1;dj++){
          if(dj===bi||dj===bj)continue;
          for(let dk=dj+1;dk<rem.length;dk++){
            if(dk===bi||dk===bj)continue;
            const dealerScore=packedScore7(rem[di],rem[dj],rem[dk],board[0],board[1],board[2],board[3]);
            betBoard+=fastProfit(playerScore,dealerScore,2,sixCardPayout);callBoard+=fastProfit(playerScore,dealerScore,1,sixCardPayout);dealerCount++;
          }
        }
      }
    }
    betTotal+=betBoard/dealerCount;
    checkTotal+=Math.max(callBoard/dealerCount,foldBreakdown().total);
    boardCount++;totalTerminals+=dealerCount;
  }
  const runtimeSeconds=(performance.now()-started)/1000,samples=totalTerminals;
  const bet=betTotal/boardCount,check=checkTotal/boardCount,difference=bet-check,evs={"2x":bet,check},action=difference>=0?"2x":"check";
  return{action,evs,difference:Math.abs(difference),exact:true,method:"EXACT",resolved:true,statistics:{"2x":exactStats(bet,samples,runtimeSeconds),check:exactStats(check,samples,runtimeSeconds)},differenceStatistics:exactStats(difference,samples,runtimeSeconds)};
}

/** Complete exposed-card opening backward induction (1,104,436,080 terminals). */
export function exactOpeningDecision(state:InfoState,sixCardPayout=50):Decision{
  const started=performance.now(),chunk=exactOpeningChunk(state,0,Infinity,sixCardPayout);
  return finalizeExactOpening(state,[chunk],(performance.now()-started)/1000);
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
  if(stage===1&&direct)return exactOpeningDecision(state,sixCardPayout);
  if(stage===2&&direct)return exactSecondDecision(state,sixCardPayout);
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
export function solveApproximate(state:InfoState,samples=24,seedOffset=0,sixCardPayout=50):Decision{
  if(state.player.length!==3||![0,2,4].includes(state.board.length))throw new Error("Use 3 player cards and 0, 2, or 4 board cards");
  return{...solveInternal(state,samples,false,seedOffset,sixCardPayout),method:"MONTE_CARLO",resolved:false};
}
