import { calculateHandValue, isPair, isSoft } from "./hand";
import { Action, BlackjackRules, Card } from "./types";
export interface Decision { action: Action; explanation: string }
const upValue=(c:Card)=>c.rank==="A"?11:["K","Q","J"].includes(c.rank)?10:Number(c.rank);
export function getBasicStrategyDecision({playerCards,dealerUpcard,rules}:{playerCards:Card[];dealerUpcard:Card;rules:BlackjackRules}):Decision {
  const total=calculateHandValue(playerCards), up=upValue(dealerUpcard), soft=isSoft(playerCards), pair=isPair(playerCards), pairRank=pair?playerCards[0].rank:undefined;
  let action:Action="H";
  // Pair strategy takes precedence over hard-total surrender. Under the selected
  // H17 game, 8,8 surrenders only against an Ace and splits against 9 or 10.
  if(pairRank==="8") action=rules.lateSurrender&&rules.dealerHitsSoft17&&up===11?"R":"P";
  else if(rules.lateSurrender && !soft && playerCards.length===2 && ((total===16&&[9,10,11].includes(up))||(total===15&&(up===10||(rules.dealerHitsSoft17&&up===11))))) action="R";
  else if(pair) { const r=playerCards[0].rank; if(r==="A") action="P"; else if(["10","J","Q","K"].includes(r)) action="S"; else if(r==="9") action=[2,3,4,5,6,8,9].includes(up)?"P":"S"; else if(r==="7") action=up<=7?"P":"H"; else if(r==="6") action=up<=6?"P":"H"; else if(r==="4") action=rules.doubleAfterSplit&&[5,6].includes(up)?"P":"H"; else if(["2","3"].includes(r)) action=up<=7?"P":"H"; else if(r==="5") action=up<=9?"D":"H";
  } else if(soft) { if(total>=20) action="S"; else if(total===19) action=rules.dealerHitsSoft17&&up===6?"D":"S"; else if(total===18) action=up<=6&&up>=(rules.dealerHitsSoft17?2:3)?"D":up<=8?"S":"H"; else if(total===17) action=[3,4,5,6].includes(up)?"D":"H"; else if([15,16].includes(total)) action=[4,5,6].includes(up)?"D":"H"; else if([13,14].includes(total)) action=[5,6].includes(up)?"D":"H";
  } else { if(total>=17) action="S"; else if(total>=13) action=up<=6?"S":"H"; else if(total===12) action=[4,5,6].includes(up)?"S":"H"; else if(total===11) action=up===11&&!rules.dealerHitsSoft17?"H":"D"; else if(total===10) action=up<=9?"D":"H"; else if(total===9) action=up>=3&&up<=6?"D":"H"; }
  const names={H:"Hit",S:"Stand",D:"Double",P:"Split",R:"Surrender"};
  const kind=pair?"pair":soft?"soft hand":"hard hand";
  return {action,explanation:`${total} (${kind}) vs dealer ${dealerUpcard.rank} is ${names[action]} under ${rules.decks}-deck ${rules.dealerHitsSoft17?"H17":"S17"} basic strategy.`};
}
