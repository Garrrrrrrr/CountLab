import {describe,expect,it} from "vitest";
import {dealerQualifies,exactOpeningDecision,exactSecondDecision,flushRank,foldBreakdown,parseCard,parseCards,settle,settleBreakdown,solve} from "./engine";
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
  it("keeps current and legacy six-card paytables separate",()=>{
    const player=parseCards("Ah Kh Qh Jh 9h 8h 2c"),dealer=parseCards("7h 6h 5h Ac Kd Qs 3c");
    expect(settle(player,dealer,3,50)-settle(player,dealer,3,20)).toBe(30);
  });
  it("solves a river without hidden-card input",()=>{
    const d=solve({player:parseCards("Ah 8h 4c"),dealerVisible:parseCard("Kh"),board:parseCards("2h 7s 3d 9c")},2);
    expect(Object.keys(d.evs)).toEqual(["1x","fold"]); expect(d.exact).toBe(true);
  });
  it("exactly solves the five-spade second-decision regression",()=>{
    const d=exactSecondDecision({player:parseCards("As Ks Js"),dealerVisible:parseCard("Kh"),board:parseCards("Ts 9s")});
    expect(d.action).toBe("2x");
    expect(d.evs["2x"]).toBeCloseTo(27.644914258867747,10);
    expect(d.evs.check).toBeCloseTo(26.64547190816148,10);
  });
  it("exactly solves the exposed opening regression",()=>{
    const d=exactOpeningDecision({player:parseCards("Ks Js Ts"),dealerVisible:parseCard("9s"),board:[]});
    expect(d.action).toBe("3x");
    expect(d.evs["3x"]).toBeCloseTo(4.467089548541369,10);
    expect(d.evs.check).toBeCloseTo(3.773906393930919,10);
    expect(d.differenceStatistics?.standardError).toBe(0);
  },120_000);
  it("uses net profit and never scales X-Tra by All-In",()=>{
    const player=parseCards("As Ks Js Ts 9s 2c 3d"),dealer=parseCards("Qh Jh 8h 2d 3c 4d 5c");
    const one=settleBreakdown(player,dealer,1),three=settleBreakdown(player,dealer,3);
    expect(one.xtra).toBe(5);expect(three.xtra).toBe(5);
    expect(three.total-one.total).toBe(2);
  });
  it("settles a fold as the two mandatory net losses only",()=>{
    expect(foldBreakdown()).toEqual({ante:-1,xtra:-1,allIn:0,total:-2});
  });
});
