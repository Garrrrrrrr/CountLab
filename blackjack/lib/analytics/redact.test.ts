import { describe, expect, it } from "vitest";
import {
  bucketMoney,
  bucketProbability,
  bucketRate,
  bucketTrueCount,
  isForbiddenKey,
  normalizeErrorMessage,
  normalizeRoute,
  redactProperties,
  safeQuery,
} from "./redact";
import { classifyChannel } from "./context";

describe("analytics privacy and cardinality controls", () => {
  it("removes forbidden keys and scrubs PII-shaped values", () => {
    expect(redactProperties({
      email: "private@example.com",
      auth_token: "secret",
      label: "Contact private@example.com or +1 (555) 555-0199",
      count: Number.POSITIVE_INFINITY,
    })).toEqual({ label: "Contact <email> or <phone>", count: null });
    expect(isForbiddenKey("password")).toBe(true);
  });

  it("normalizes routes without query strings or dynamic identifiers", () => {
    expect(normalizeRoute("https://countlab.ca/blackjack/users/550e8400-e29b-41d4-a716-446655440000/?token=x"))
      .toBe("/users/:id");
    expect(normalizeRoute("/sessions/123456/results/"))
      .toBe("/sessions/:n/results");
  });

  it("only keeps explicitly approved acquisition parameters", () => {
    expect(safeQuery("?utm_source=discord&email=private%40example.com&ref=partner"))
      .toEqual({ utm_source: "discord", ref: "partner" });
  });

  it("normalizes volatile and private error detail", () => {
    const message = normalizeErrorMessage("User private@example.com failed at https://example.test/u/123 with 'private text'");
    expect(message).toBe("User <email> failed at <url> with <str>");
  });

  it("buckets financial and high-cardinality numeric values", () => {
    expect(bucketMoney(23_741)).toBe("10k-25k");
    expect(bucketMoney(-120)).toBe("-100-250");
    expect(bucketRate(21)).toBe("20..50");
    expect(bucketProbability(0.07)).toBe("5-10%");
    expect(bucketTrueCount(11.8)).toBe(6);
  });

  it("classifies acquisition sources", () => {
    expect(classifyChannel("", {})).toBe("direct");
    expect(classifyChannel("https://google.com/search?q=countlab", {})).toBe("organic_search");
    expect(classifyChannel("", { utm_medium: "newsletter" })).toBe("email");
    expect(classifyChannel("https://discord.com/channels/1", {})).toBe("social");
  });
});
