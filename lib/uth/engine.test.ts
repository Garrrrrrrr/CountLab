import {describe,expect,it} from "vitest";
import {evaluate,parseCard,settle,solveRiver} from "./engine";
const cards=(text:string)=>text.split(" ").map(parseCard);
describe("UTH engine",()=>{
  it("orders every Hold'em category and wheel correctly",()=>{const hands=["As Kd 9c 7h 5s 3d 2c","As Ad 9c 7h 5s 3d 2c","As Ad 9c 9h 5s 3d 2c","As Ad Ac 9h 5s 3d 2c","As 2d 3c 4h 5s 9d Tc","As Js 9s 5s 3s Kd 2c","As Ad Ac 9h 9s 3d 2c","As Ad Ac Ah 9s 3d 2c","9s Ts Js Qs Ks 3d 2c"].map(x=>evaluate(cards(x)));expect(hands.map(x=>x[0])).toEqual([0,1,2,3,4,5,6,7,8]);expect(evaluate(cards("As 2d 3c 4h 5s 9d Tc"))[1]).toBe(5);});
  it("settles nonqualification without cancelling Play or Blind",()=>{const p=evaluate(cards("Ts 6d 2c 3d 4h 8s 9c")),d=evaluate(cards("Js 7d 2c 3d 4h 8s 9c"));expect(settle(p,d,1)).toBe(-2);});
  it("does not accept a hidden dealer card and river is exact",()=>{const state={player:cards("As Qs"),dealerVisible:parseCard("Kh"),board:cards("Js 8s 3c 2d 7h")};const result=solveRiver(state);expect(result.exact).toBe(true);expect(result.outcomes).toBe(44);expect(result.action).toBe("1X");});
});
