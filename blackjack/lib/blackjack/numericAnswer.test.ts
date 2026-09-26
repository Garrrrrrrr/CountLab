import { describe, expect, it } from "vitest";
import { ANSWER_HINT, applyKey, normalizeAnswer, parseAnswer } from "./numericAnswer";

describe("numeric answers", () => {
  it("normalises typographic minus signs, decimal commas and spaces", () => {
    expect(normalizeAnswer(" −3 ")).toBe("-3");
    expect(normalizeAnswer("2,5")).toBe("2.5");
  });

  it("accepts signed whole numbers", () => {
    expect(parseAnswer("−3", "signed-int")).toEqual({ ok: true, value: -3, text: "-3" });
    expect(parseAnswer("+4", "signed-int")).toEqual({ ok: true, value: 4, text: "4" });
    expect(parseAnswer("-0", "signed-int")).toEqual({ ok: true, value: 0, text: "0" });
  });

  it("rejects blank or malformed counts instead of grading them as zero", () => {
    expect(parseAnswer("", "signed-int")).toEqual({ ok: false, error: ANSWER_HINT["signed-int"] });
    expect(parseAnswer("1.5", "signed-int")).toEqual({ ok: false, error: ANSWER_HINT["signed-int"] });
    expect(parseAnswer("--2", "signed-int").ok).toBe(false);
  });

  it("accepts decimal deck estimates, including a comma", () => {
    expect(parseAnswer("2,5", "decimal")).toEqual({ ok: true, value: 2.5, text: "2.5" });
    expect(parseAnswer(".75", "decimal")).toMatchObject({ ok: true, value: 0.75 });
    expect(parseAnswer("3.", "decimal")).toMatchObject({ ok: true, value: 3 });
    expect(parseAnswer("-1", "decimal").ok).toBe(false);
    expect(parseAnswer("", "decimal")).toEqual({ ok: false, error: ANSWER_HINT.decimal });
  });

  it("applies keypad keys", () => {
    expect(applyKey("3", "sign", "signed-int")).toBe("-3");
    expect(applyKey("-3", "sign", "signed-int")).toBe("3");
    expect(applyKey("", "sign", "signed-int")).toBe("-");
    expect(applyKey("2", ".", "decimal")).toBe("2.");
    expect(applyKey("2.5", ".", "decimal")).toBe("2.5");
    expect(applyKey("", ".", "decimal")).toBe("0.");
    expect(applyKey("2", ".", "signed-int")).toBe("2");
    expect(applyKey("2", "sign", "decimal")).toBe("2");
    expect(applyKey("12", "back", "signed-int")).toBe("1");
    expect(applyKey("1", "7", "signed-int")).toBe("17");
  });
});
