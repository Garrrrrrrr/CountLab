import { Card } from "@/lib/blackjack/types";
const glyph={spades:"♠",hearts:"♥",diamonds:"♦",clubs:"♣"};
export function PlayingCard({card,hidden=false,size="md",animated=false}:{card?:Card;hidden?:boolean;size?:"sm"|"md"|"lg";animated?:boolean}){
 const scale=size==="sm"?"h-20 w-14 text-lg":size==="lg"?"h-44 w-32 text-4xl":"h-32 w-24 text-2xl";
 if(hidden||!card)return <div aria-label="Hidden card" className={`${scale} rounded-xl border border-emerald-500/40 bg-[repeating-linear-gradient(45deg,#163d31,#163d31_5px,#0e2c24_5px,#0e2c24_10px)] shadow-xl ring-4 ring-white`} />;
 const red=card.suit==="hearts"||card.suit==="diamonds";
 return <div aria-label={`${card.rank} of ${card.suit}`} className={`${scale} ${animated?"animate-[deal_.25s_ease-out]":""} relative flex select-none flex-col justify-between rounded-xl bg-[#f7f3e9] p-2 font-semibold ${red?"text-red-600":"text-zinc-950"} shadow-[0_12px_30px_#0008] ring-1 ring-black/20`}><span className="leading-none">{card.rank}<small className="block">{glyph[card.suit]}</small></span><span className="self-center text-[1.6em]">{glyph[card.suit]}</span><span className="rotate-180 self-end leading-none">{card.rank}<small className="block">{glyph[card.suit]}</small></span></div>
}
