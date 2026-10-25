import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGELOG, entryDate } from "./changelog";

describe("changelog", () => {
  it("lists releases newest first with unique ids and screenshots that exist", () => {
    expect(new Set(CHANGELOG.map((entry) => entry.id)).size).toBe(CHANGELOG.length);
    for (const [index, entry] of CHANGELOG.entries()) {
      if (index > 0) expect(entry.date <= CHANGELOG[index - 1].date, entry.id).toBe(true);
      if (entry.from) expect(entry.from < entry.date, entry.id).toBe(true);
      for (const shot of entry.shots ?? []) expect(existsSync(join(__dirname, "..", "public", shot.src)), shot.src).toBe(true);
    }
  });

  it("writes single days and ranges", () => {
    expect(entryDate({ date: "2026-10-24" })).toBe("October 24, 2026");
    expect(entryDate({ date: "2026-09-23", from: "2026-09-22" })).toBe("September 22–23, 2026");
    expect(entryDate({ date: "2026-09-02", from: "2026-08-31" })).toBe("August 31–September 2, 2026");
  });
});
