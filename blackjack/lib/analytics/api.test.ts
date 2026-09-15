import { beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({ analytics: { track } }));

import { observeApiRequest } from "./api";

describe("observeApiRequest", () => {
  beforeEach(() => track.mockReset());

  it("can suppress successful background request events", async () => {
    await expect(observeApiRequest(
      "supabase",
      "background_sync",
      Promise.resolve({ error: null, status: 200 }),
      { trackSuccess: false },
    )).resolves.toMatchObject({ status: 200 });

    expect(track).not.toHaveBeenCalled();
  });

  it("still records failures when success events are suppressed", async () => {
    await observeApiRequest(
      "supabase",
      "background_sync",
      Promise.resolve({ error: { message: "Network timeout" } }),
      { trackSuccess: false },
    );

    expect(track).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith("api_request_failed", expect.objectContaining({
      service: "supabase",
      operation: "background_sync",
      error_category: "network",
    }));
  });
});
