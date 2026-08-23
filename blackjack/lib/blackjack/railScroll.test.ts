import { describe, expect, it } from "vitest";
import { railState } from "./railScroll";
const h17 = { scrollWidth: 552, clientWidth: 332, columnWidth: 44 };
describe("railState", () => {
  it("reports a fitting rail as complete", () => expect(railState({ scrollLeft: 0, scrollWidth: 300, clientWidth: 332, columnWidth: 44 })).toEqual({ scrollable: false, atStart: true, atEnd: true, hiddenRight: 0 }));
  it("counts hidden columns", () => expect(railState({ ...h17, scrollLeft: 0 })).toMatchObject({ scrollable: true, atStart: true, atEnd: false, hiddenRight: 5 }));
  it("recognizes the end", () => expect(railState({ ...h17, scrollLeft: 220 })).toMatchObject({ atStart: false, atEnd: true, hiddenRight: 0 }));
  it("tolerates sub-pixel offsets", () => { expect(railState({ ...h17, scrollLeft: 0.4 }).atStart).toBe(true); expect(railState({ ...h17, scrollLeft: 219.6 }).atEnd).toBe(true); });
  it("counts partial columns and clamps overscroll", () => { expect(railState({ ...h17, scrollLeft: 100 }).hiddenRight).toBe(3); expect(railState({ ...h17, scrollLeft: 400 }).hiddenRight).toBe(0); });
  it("does not divide by zero", () => expect(railState({ ...h17, scrollLeft: 0, columnWidth: 0 }).hiddenRight).toBe(0));
});
