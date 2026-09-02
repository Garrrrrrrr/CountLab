import { describe, expect, it } from "vitest";
import { CHART_CODES, resolveCode } from "./strategyChart";

const all = { canDouble: true, canSplit: true, doubleAfterSplit: true, canSurrender: true };

describe("resolveCode", () => {
  it("passes unconditional codes straight through", () => {
    expect(resolveCode("H", all)).toEqual({ action: "H" });
    expect(resolveCode("S", all)).toEqual({ action: "S" });
    expect(resolveCode("P", all)).toEqual({ action: "P" });
  });

  it("doubles when allowed and records the fallback", () => {
    expect(resolveCode("D", all)).toEqual({ action: "D", fallback: "H" });
    expect(resolveCode("Ds", all)).toEqual({ action: "D", fallback: "S" });
  });

  it("demotes doubles to their own fallback", () => {
    expect(resolveCode("D", { ...all, canDouble: false })).toEqual({ action: "H" });
    expect(resolveCode("Ds", { ...all, canDouble: false })).toEqual({ action: "S" });
  });

  it("demotes DAS-conditional splits to their own fallback", () => {
    expect(resolveCode("Ph", { ...all, doubleAfterSplit: false })).toEqual({ action: "H" });
    expect(resolveCode("Ps", { ...all, doubleAfterSplit: false })).toEqual({ action: "S" });
    expect(resolveCode("Pd", { ...all, doubleAfterSplit: false })).toEqual({ action: "D", fallback: "H" });
  });

  it("splits DAS-conditional cells when DAS is on", () => {
    for (const code of ["Ph", "Pd", "Ps"] as const) {
      expect(resolveCode(code, all)).toEqual({ action: "P" });
    }
  });

  it("demotes a Pd to a hit when doubling is also unavailable", () => {
    expect(resolveCode("Pd", { ...all, doubleAfterSplit: false, canDouble: false })).toEqual({ action: "H" });
  });

  it("surrenders when offered and falls back otherwise", () => {
    expect(resolveCode("Rh", all)).toEqual({ action: "R", fallback: "H" });
    expect(resolveCode("Rh", { ...all, canSurrender: false })).toEqual({ action: "H" });
    expect(resolveCode("Rs", { ...all, canSurrender: false })).toEqual({ action: "S" });
    expect(resolveCode("Rp", { ...all, canSurrender: false })).toEqual({ action: "P" });
  });

  it("demotes an Rp to the pair's own fallback when splitting is unavailable", () => {
    expect(resolveCode("Rp", { ...all, canSurrender: false, canSplit: false })).toEqual({ action: "H" });
  });

  it("names a legal fallback for Rp when surrender is offered but splitting is not", () => {
    expect(resolveCode("Rp", { ...all, canSplit: false })).toEqual({ action: "R", fallback: "H" });
  });

  it("never splits when splitting is unavailable", () => {
    for (const code of ["P", "Ph", "Pd", "Ps"] as const) {
      expect(resolveCode(code, { ...all, canSplit: false }).action).not.toBe("P");
    }
  });

  it("lists exactly the eleven supported codes", () => {
    expect([...CHART_CODES].sort()).toEqual(["D", "Ds", "H", "P", "Pd", "Ph", "Ps", "Rh", "Rp", "Rs", "S"]);
  });
});
