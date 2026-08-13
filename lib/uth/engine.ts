export const RANKS = "23456789TJQKA";
export const SUITS = "cdhs";
export type UTHState = { player: number[]; board: number[]; dealerVisible?: number };
export type UTHDecision = {
  action: string; evs: Record<string, number>; difference: number; exact: boolean;
  method: "EXACT" | "PAIRED_MONTE_CARLO"; outcomes: number; standardError: number;
  confidenceInterval: [number, number]; status: "CONFIRMED" | "INCONCLUSIVE — MORE COMPUTATION REQUIRED";
};

export const parseCard = (text:string) => {
  const r=RANKS.indexOf(text[0]?.toUpperCase()),s=SUITS.indexOf(text[1]?.toLowerCase());
  if(text.length!==2||r<0||s<0)throw new Error(`Invalid card ${text}`);return s*13+r;
};
export const cardName=(card:number)=>RANKS[card%13]+SUITS[Math.floor(card/13)];
const rank=(card:number)=>card%13+2,suit=(card:number)=>Math.floor(card/13);
const compare=(a:number[],b:number[])=>{for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]??0)-(b[i]??0);if(d)return d;}return 0;};
const straightHigh=(values:Set<number>)=>{const sorted=[...values,...(values.has(14)?[1]:[])].sort((a,b)=>a-b);let run=0,previous=-2,high=0;for(const value of sorted){run=value===previous+1?run+1:1;if(run>=5)high=value;previous=value;}return high;};

/** Category followed by every comparison kicker, highest tuple wins. */
export function evaluate(cards:number[]):number[]{
  if(cards.length<5||cards.length>7||new Set(cards).size!==cards.length)throw new Error("Evaluator needs 5-7 distinct cards");
  const counts=Array(15).fill(0) as number[],suited=[[],[],[],[]] as number[][];
  for(const card of cards){counts[rank(card)]++;suited[suit(card)].push(rank(card));}
  for(const values of suited)if(values.length>=5){const high=straightHigh(new Set(values));if(high)return[8,high];}
  const values=(n:number)=>Array.from({length:13},(_,i)=>14-i).filter(v=>counts[v]>=n);
  const quads=values(4);if(quads.length)return[7,quads[0],...values(1).filter(v=>v!==quads[0]).slice(0,1)];
  const trips=values(3);if(trips.length){const pairs=values(2).filter(v=>v!==trips[0]);if(pairs.length)return[6,trips[0],pairs[0]];}
  const flushes=suited.filter(v=>v.length>=5).map(v=>v.sort((a,b)=>b-a).slice(0,5));if(flushes.length)return[5,...flushes.sort(compare).at(-1)!];
  const high=straightHigh(new Set(values(1)));if(high)return[4,high];
  if(trips.length)return[3,trips[0],...values(1).filter(v=>v!==trips[0]).slice(0,2)];
  const pairs=values(2);if(pairs.length>=2)return[2,pairs[0],pairs[1],...values(1).filter(v=>!pairs.slice(0,2).includes(v)).slice(0,1)];
  if(pairs.length)return[1,pairs[0],...values(1).filter(v=>v!==pairs[0]).slice(0,3)];
  return[0,...values(1).slice(0,5)];
}

export const STANDARD_BLIND_PAYTABLE={royalFlush:500,straightFlush:50,quads:10,fullHouse:3,flush:1.5,straight:1,other:0} as const;
export function settle(player:number[],dealer:number[],play:number,paytable:typeof STANDARD_BLIND_PAYTABLE=STANDARD_BLIND_PAYTABLE){
  const cmp=compare(player,dealer);if(!cmp)return 0;const qualifies=dealer[0]>=1;
  if(cmp<0)return-(qualifies?1:0)-1-play;
  const blind=player[0]===8&&player[1]===14?paytable.royalFlush:player[0]===8?paytable.straightFlush:player[0]===7?paytable.quads:player[0]===6?paytable.fullHouse:player[0]===5?paytable.flush:player[0]===4?paytable.straight:paytable.other;
  return(qualifies?1:0)+blind+play;
}
const validate=(state:UTHState)=>{if(state.player.length!==2||![0,3,5].includes(state.board.length))throw new Error("Select 2 player cards and 0, 3, or 5 board cards");const all=[...state.player,...state.board,...(state.dealerVisible===undefined?[]:[state.dealerVisible])];if(new Set(all).size!==all.length)throw new Error("A card is selected twice");};
const remaining=(state:UTHState)=>{const used=new Set([...state.player,...state.board,...(state.dealerVisible===undefined?[]:[state.dealerVisible])]);return Array.from({length:52},(_,i)=>i).filter(c=>!used.has(c));};
const exactDecision=(action:string,evs:Record<string,number>,difference:number,outcomes:number):UTHDecision=>({action,evs,difference:Math.abs(difference),exact:true,method:"EXACT",outcomes,standardError:0,confidenceInterval:[difference,difference],status:"CONFIRMED"});

export function solveRiver(state:UTHState):UTHDecision{
  validate(state);if(state.board.length!==5)throw new Error("River needs five board cards");const rem=remaining(state),p=evaluate([...state.player,...state.board]);let total=0,count=0;
  if(state.dealerVisible!==undefined){for(const hidden of rem){total+=settle(p,evaluate([state.dealerVisible,hidden,...state.board]),1);count++;}}
  else for(let i=0;i<rem.length-1;i++)for(let j=i+1;j<rem.length;j++){total+=settle(p,evaluate([rem[i],rem[j],...state.board]),1);count++;}
  const call=total/count,fold=-2;return exactDecision(call>=fold?"1X":"FOLD",{"1X":call,FOLD:fold},call-fold,count);
}

export function solveFlop(state:UTHState):UTHDecision{
  validate(state);if(state.board.length!==3)throw new Error("Flop needs three board cards");const rem=remaining(state);let bet=0,check=0,boards=0,outcomes=0;
  for(let i=0;i<rem.length-1;i++)for(let j=i+1;j<rem.length;j++){
    const board=[...state.board,rem[i],rem[j]],pool=rem.filter((_,k)=>k!==i&&k!==j),p=evaluate([...state.player,...board]);let one=0,two=0,n=0;
    if(state.dealerVisible!==undefined){for(const hidden of pool){const d=evaluate([state.dealerVisible,hidden,...board]);one+=settle(p,d,1);two+=settle(p,d,2);n++;}}
    else for(let a=0;a<pool.length-1;a++)for(let b=a+1;b<pool.length;b++){const d=evaluate([pool[a],pool[b],...board]);one+=settle(p,d,1);two+=settle(p,d,2);n++;}
    bet+=two/n;check+=Math.max(one/n,-2);boards++;outcomes+=n;
  }
  const betEv=bet/boards,checkEv=check/boards;return exactDecision(betEv>=checkEv?"2X":"CHECK",{"2X":betEv,CHECK:checkEv},betEv-checkEv,outcomes);
}

const openingBasic=(cards:number[])=>{const [a,b]=cards.slice().sort((x,y)=>rank(y)-rank(x)),hi=rank(a),lo=rank(b),suited=suit(a)===suit(b);if(hi===lo)return hi===2?"CHECK":"4X";if(suited)return hi>=13||(hi===12&&lo>=6)||(hi===11&&lo>=8)?"4X":"CHECK";return hi===14||(hi===13&&lo>=5)||(hi===12&&lo>=8)||(hi===11&&lo===10)?"4X":"CHECK";};
const flopBasic=(player:number[],board:number[])=>{const score=evaluate([...player,...board]);if(score[0]>=2)return"2X";const counts=new Map<number,number>();for(const c of [...player,...board])counts.set(rank(c),(counts.get(rank(c))??0)+1);if(player.some(c=>(counts.get(rank(c))??0)>=2)&&!(rank(player[0])===2&&rank(player[1])===2))return"2X";for(let s=0;s<4;s++){const suited=[...player,...board].filter(c=>suit(c)===s);if(suited.length===4&&player.some(c=>suit(c)===s&&rank(c)>=10))return"2X";}return"CHECK";};
const riverBasic=(player:number[],board:number[],visible?:number)=>{const score=evaluate([...player,...board]),counts=new Map<number,number>();for(const c of [...player,...board])counts.set(rank(c),(counts.get(rank(c))??0)+1);if(score[0]>=2||player.some(c=>(counts.get(rank(c))??0)>=2))return"1X";const known=new Set([...player,...board,...(visible===undefined?[]:[visible])]);let outs=0;for(let c=0;c<52;c++)if(!known.has(c)&&compare(evaluate([...board,c]),score)>0)outs++;return outs<21?"1X":"FOLD";};
function mulberry(seed:number){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
export function solveOpening(state:UTHState,samples=50000):UTHDecision{
  validate(state);if(state.board.length)throw new Error("Opening needs no board");const rem=remaining(state),random=mulberry([...state.player,state.dealerVisible??99].reduce((h,c)=>Math.imul(h^c,16777619),2166136261));let four=0,wait=0,mean=0,m2=0;
  for(let n=1;n<=samples;n++){const deck=rem.slice();for(let k=0;k<7;k++){const x=k+Math.floor(random()*(deck.length-k));[deck[k],deck[x]]=[deck[x],deck[k]];}const hiddenN=state.dealerVisible===undefined?2:1,dealer=state.dealerVisible===undefined?deck.slice(0,2):[state.dealerVisible,deck[0]],board=deck.slice(hiddenN,hiddenN+5),p=evaluate([...state.player,...board]),d=evaluate([...dealer,...board]);const a=settle(p,d,4);let b:number;if(flopBasic(state.player,board.slice(0,3))==="2X")b=settle(p,d,2);else if(riverBasic(state.player,board,state.dealerVisible)==="1X")b=settle(p,d,1);else b=-2;four+=a;wait+=b;const value=a-b,delta=value-mean;mean+=delta/n;m2+=delta*(value-mean);}
  const ev4=four/samples,check=wait/samples,variance=m2/(samples-1),se=Math.sqrt(variance/samples),half=3.290526731*se,confirmed=half<=.001&&(mean-half>0||mean+half<0),status=confirmed?"CONFIRMED":"INCONCLUSIVE — MORE COMPUTATION REQUIRED";
  return{action:confirmed?(mean>=0?"4X":"CHECK"):status,evs:{"4X":ev4,CHECK:check},difference:Math.abs(mean),exact:false,method:"PAIRED_MONTE_CARLO",outcomes:samples,standardError:se,confidenceInterval:[mean-half,mean+half],status};
}
export function solve(state:UTHState,samples=50000){return state.board.length===5?solveRiver(state):state.board.length===3?solveFlop(state):solveOpening(state,samples);}
export {openingBasic};
