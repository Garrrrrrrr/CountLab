import { Card } from "./types";
export function calculateHandValue(cards: Card[]) { let total=cards.reduce((s,c)=>s+(c.rank==="A"?11:["K","Q","J"].includes(c.rank)?10:Number(c.rank)),0); let aces=cards.filter(c=>c.rank==="A").length; while(total>21&&aces-- >0) total-=10; return total; }
export function isSoft(cards: Card[]) { const raw=cards.reduce((s,c)=>s+(c.rank==="A"?11:["K","Q","J"].includes(c.rank)?10:Number(c.rank)),0); return cards.some(c=>c.rank==="A") && raw<=21; }
export const isBlackjack=(cards:Card[])=>cards.length===2&&calculateHandValue(cards)===21;
export const rankValue=(card:Card)=>card.rank==="A"?11:["K","Q","J"].includes(card.rank)?10:Number(card.rank);
/** Splitting goes by card *value*, so K,Q is a pair of tens just like 10,10. */
export const isPair=(cards:Card[])=>cards.length===2&&rankValue(cards[0])===rankValue(cards[1]);
export const canSplit=isPair;
export const canDouble=(cards:Card[])=>cards.length===2;
