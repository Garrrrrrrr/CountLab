import { describe, expect, it } from "vitest";
import { DEFAULT_TABLE_RULES } from "@/lib/strategy";
import { resolveBasic } from "./basic";
import { resolveIndex } from "./indexPlays";
import { basicReviewQuestions, chartReviewKey, chartReviewScope, indexReviewQuestions } from "./review";
import { seeded } from "./testRules";

describe("review rounds", () => {
  const rules = DEFAULT_TABLE_RULES;

  it("deals each due hand again, on the same chart cell", () => {
    const questions = basicReviewQuestions(["hard:16v10", "soft:A,7v3|drawn", "nonsense"], rules, seeded(3));
    expect(questions.map((question) => resolveBasic(question, rules)?.key)).toEqual(["hard:16v10", "soft:A,7v3|drawn"]);
  });

  it("asks each due index once", () => {
    const questions = indexReviewQuestions(["insurance", "hard:16v10", "gone"], rules, seeded(5));
    expect(questions.map((question) => resolveIndex(question, rules)?.id)).toEqual(["insurance", "hard:16v10"]);
  });

  it("narrows a review chart to its level's due cells, tables in chart order", () => {
    const keys = [chartReviewKey("basic", "pairs|pairs:8,8vA"), chartReviewKey("indices", "hard|hard:16v10"), chartReviewKey("basic", "surrender|hard:16v10")];
    expect(chartReviewScope(keys, "basic")).toEqual({ ids: ["surrender", "pairs"], only: ["pairs|pairs:8,8vA", "surrender|hard:16v10"] });
    expect(chartReviewScope(keys, "indices")).toEqual({ ids: ["hard"], only: ["hard|hard:16v10"] });
  });
});
