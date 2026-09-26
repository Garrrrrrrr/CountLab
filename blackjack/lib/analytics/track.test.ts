import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ analytics: { track: vi.fn() } }));

import { analytics } from "./client";
import { abandonActivePractice, track } from "./track";

const events = () => vi.mocked(analytics.track).mock.calls.map(([name, properties]) => ({ name, properties: properties as Record<string, unknown> }));

describe("legacy practice tracking", () => {
  beforeEach(() => {
    abandonActivePractice();
    vi.mocked(analytics.track).mockClear();
  });

  it("a discarded drill reports its progress, so starting again is not a restart", () => {
    track("drill_started", { drill: "True Count", questionTarget: 10 });
    track("true_count_answered", { ok: true, responseTimeMs: 900, attempt: 1 });
    // Discard (or End with nothing saved) calls this in place of saving a session.
    abandonActivePractice();
    track("drill_started", { drill: "True Count", questionTarget: 10 });
    const abandoned = events().find((event) => event.name === "practice_abandoned");
    expect(abandoned?.properties).toMatchObject({ drill: "true_count", questions_answered: 1, progress_percent: 10 });
    expect(events().map((event) => event.name)).not.toContain("practice_restarted");
  });

  it("starting over without abandoning reports a restart", () => {
    track("drill_started", { drill: "Running Count", amount: 20 });
    track("drill_started", { drill: "Running Count", amount: 20 });
    expect(events().map((event) => event.name)).toContain("practice_restarted");
  });
});
