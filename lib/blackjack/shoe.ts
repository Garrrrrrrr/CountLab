import { Card, RANKS, SUITS } from "./types";
import { runningCount } from "./hiLo";
export class BlackjackShoe {
  private cards: Card[] = [];
  private dealt: Card[] = [];
  constructor(public readonly numberOfDecks = 6) { this.reset(); }
  shuffle() { for (let i=this.cards.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [this.cards[i],this.cards[j]]=[this.cards[j],this.cards[i]]; } }
  deal() { const card=this.cards.pop(); if (card) this.dealt.push(card); return card; }
  cardsRemaining() { return this.cards.length; }
  decksRemaining() { return this.cards.length/52; }
  runningCount() { return runningCount(this.dealt); }
  dealtCards() { return [...this.dealt]; }
  reset() { this.cards=[]; this.dealt=[]; for(let d=0;d<this.numberOfDecks;d++) for(const suit of SUITS) for(const rank of RANKS) this.cards.push({rank,suit}); this.shuffle(); }
}
