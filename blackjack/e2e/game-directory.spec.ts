import { expect, test } from "@playwright/test";

const locationId = "11111111-1111-4111-8111-111111111111";
const gameId = "22222222-2222-4222-8222-222222222222";
const location = {
  id: locationId, name: "Test Casino", aliases: [], operator: null, country: "US",
  subdivision: "NV", city: "Reno", address: "1 Test Way", website: null,
  latitude: 39.5296, longitude: -119.8138, coordinate_quality: "verified", coordinate_source: "test fixture",
  operating_status: "open", game_availability: "reported", publication_status: "published",
  published_at: "2026-09-01T00:00:00Z", version: 1, deleted_at: null,
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
};
const game = {
  id: gameId, location_id: locationId, game_type: "blackjack", table_count: 2,
  decks: 6, decks_cut: 1.5, min_bet: 25, max_bet: 500, currency: "USD",
  payout: "3:2", soft_17: "H17", double_rules: "any_two",
  double_after_split: true, max_split_hands: null, resplit_aces: false,
  surrender: "late", dealer_procedure: "hole_card_peek",
  dealer_blackjack_wager_treatment: "all_bets_lost", mid_shoe_entry: "allowed",
  dealing_method: "shoe", shuffle_method: null, reported_house_edge_pct: null,
  availability: "reported", publication_status: "published", reported_month: "2026-09-01",
  verified_at: null, extra_rules: { source_codes: ["h17", "ls", "ds", "shoe"], unknown_codes: [] },
  version: 1, deleted_at: null, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
};

test("anonymous visitor can browse and open a direct directory game link", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Single desktop public route smoke test.");
  await page.addInitScript(() => {
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
  });
  await page.route((url) => url.pathname.endsWith("/rest/v1/rpc/directory_search"), (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 1, locations: [{ ...location, game_count: 1, earliest_min_bet: 25, latest_reported_month: "2026-09-01" }] }) }));
  await page.route((url) => url.pathname.endsWith("/rest/v1/directory_locations"), (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(location) }));
  await page.route((url) => url.pathname.endsWith("/rest/v1/directory_games"), (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([game]) }));
  await page.route((url) => url.pathname.endsWith("/rest/v1/directory_notes"), (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  if (process.env.NEXT_PUBLIC_MAPTILER_KEY) {
    // The browser key accepts the production origin, even when this test runs
    // against a localhost export in CI.
    await page.route("https://api.maptiler.com/**", async (route) => {
      const response = await route.fetch({ headers: { ...route.request().headers(), origin: "https://countlab.ca", referer: "https://countlab.ca/directory/" } });
      await route.fulfill({ response });
    });
  }

  await page.goto("/directory/");
  await expect(page.getByRole("heading", { name: "Game directory" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Map", exact: true })).toHaveAttribute("aria-pressed", "true");
  if (process.env.NEXT_PUBLIC_MAPTILER_KEY) {
    const map = page.getByRole("img", { name: "Map of directory locations" });
    await expect(map).toBeVisible();
    await expect(map).toHaveAttribute("data-map-loaded", "true", { timeout: 15000 });
    const dimensions = await map.boundingBox();
    expect(dimensions?.width).toBeGreaterThan(800);
    expect(dimensions?.height).toBeGreaterThan(600);
    await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
  } else {
    await expect(page.getByText("Map is unavailable. Browse locations in the list.")).toBeVisible();
  }
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByRole("button", { name: /Test Casino/ })).toBeVisible();
  await page.goto(`/directory/?location=${locationId}`);
  await expect(page.getByRole("heading", { name: "Test Casino" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Analyze this game/ })).toBeVisible();
  await page.getByRole("link", { name: /Analyze this game/ }).click();
  await page.getByRole("button", { name: "Try CountLab as a guest" }).click();
  await expect(page.getByText("Loaded Test Casino")).toBeVisible();
});
