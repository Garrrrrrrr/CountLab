import {describe,expect,it} from "vitest";
import {dealerQualifies,flushRank,parseCard,parseCards,settle,solve} from "./engine";
describe("Chase the Flush engine",()=>{
  it("round trips cards",()=>expect(parseCard("Ah")).toBe(38));
  it("ranks by flush length then kickers",()=>{
    expect(flushRank(parseCards("Ah Kh 8h 4h 2c 3d 5s"))).toEqual([4,14,13,8,4]);
    expect(flushRank(parseCards("Ah Kh 8h 4h 2c 3d 5s"))).toEqual(flushRank(parseCards("As Ks 8s 4s 2c 3d 5h")));
  });
  it("uses the exact qualifier boundary",()=>{
    expect(dealerQualifies(parseCards("8h 7h 6h Ac Kd Qs 2c"))).toBe(false);
    expect(dealerQualifies(parseCards("9h 3h 2h Ac Kd Qs 4c"))).toBe(true);
  });
  it("settles nonqualification and losses",()=>{
    expect(settle(parseCards("Ah Kh Qh 2c 3d 4s 5c"),parseCards("8h 7h 6h Ac Kd Qs 9c"),3)).toBe(3);
    expect(settle(parseCards("7h 5h 4h 2c 3d 9s Tc"),parseCards("8h 7h 6h Ac Kd Qs Jc"),2)).toBe(-3);
  });
  it("solves a river without hidden-card input",()=>{
    const d=solve({player:parseCards("Ah 8h 4c"),dealerVisible:parseCard("Kh"),board:parseCards("2h 7s 3d 9c")},2);
    expect(Object.keys(d.evs)).toEqual(["1x","fold"]); expect(d.exact).toBe(true);
  });
});
