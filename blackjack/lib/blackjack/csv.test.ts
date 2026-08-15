import { describe, expect, it } from "vitest";
import { toCsv, parseCsv } from "./csv";

describe("csv", () => {
  it("round-trips plain values", () => {
    const rows = [{ a: 1, b: "hello", c: true }, { a: 2, b: "world", c: false }];
    const csv = toCsv(rows, ["a", "b", "c"]);
    expect(parseCsv(csv)).toEqual([
      { a: "1", b: "hello", c: "true" },
      { a: "2", b: "world", c: "false" },
    ]);
  });

  it("quotes and round-trips values containing commas, quotes, and newlines", () => {
    const rows = [{ note: 'has, a comma', quote: 'has "quotes"', multiline: "line1\nline2" }];
    const csv = toCsv(rows, ["note", "quote", "multiline"]);
    expect(parseCsv(csv)).toEqual([{ note: "has, a comma", quote: 'has "quotes"', multiline: "line1\nline2" }]);
  });

  it("treats missing columns as empty strings", () => {
    const csv = toCsv([{ a: 1 }], ["a", "b"]);
    expect(parseCsv(csv)).toEqual([{ a: "1", b: "" }]);
  });

  it("returns an empty array for header-only or empty input", () => {
    expect(parseCsv("a,b")).toEqual([]);
    expect(parseCsv("")).toEqual([]);
  });
});
