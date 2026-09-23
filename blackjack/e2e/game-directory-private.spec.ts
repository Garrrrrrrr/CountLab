import { expect, test } from "@playwright/test";

const locationId = "33333333-3333-4333-8333-333333333333";
const supabaseProject = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co").hostname.split(".")[0];
const location = {
  id: locationId, name: "Private Draft Casino", aliases: [], operator: null, country: "US",
  subdivision: "NV", city: "Reno", address: "1 Test Way", website: null,
  latitude: 39.5296, longitude: -119.8138, coordinate_quality: "verified", coordinate_source: "test",
  operating_status: "open", game_availability: "reported", publication_status: "draft",
  published_at: null, version: 1, deleted_at: null,
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
};
const game = {
  id: "44444444-4444-4444-8444-444444444444", location_id: locationId,
  game_type: "blackjack", table_count: 2, decks: 6, decks_cut: 1.5, min_bet: 25,
  max_bet: 500, currency: "USD", payout: "3:2", soft_17: "H17",
  double_rules: "any_two", double_after_split: true, max_split_hands: null,
  resplit_aces: false, surrender: "late", dealer_procedure: "hole_card_peek",
  dealer_blackjack_wager_treatment: "all_bets_lost", mid_shoe_entry: "allowed",
  dealing_method: "shoe", shuffle_method: null, reported_house_edge_pct: null,
  availability: "reported", publication_status: "draft", reported_month: "2026-09-01",
  verified_at: null, extra_rules: {}, version: 1, deleted_at: null,
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
};

test("signed-in admin sees private draft casino on the map", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium" || !process.env.NEXT_PUBLIC_MAPTILER_KEY, "Map key and desktop required.");
  await page.addInitScript(({ supabaseProject }) => {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const user = { id: "55555555-5555-4555-8555-555555555555", aud: "authenticated", role: "authenticated", email: "admin@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };
    const payload = btoa(JSON.stringify({ sub: user.id, aud: "authenticated", role: "authenticated", exp: expires })).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem(`sb-${supabaseProject}-auth-token`, JSON.stringify({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.test`, token_type: "bearer", expires_in: 3600, expires_at: expires, refresh_token: "test", user }));
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
  }, { supabaseProject });
  await page.route((url) => url.pathname.endsWith("/rest/v1/rpc/is_admin"), (route) => route.fulfill({ status: 200, contentType: "application/json", body: "true" }));
  await page.route((url) => url.pathname.endsWith("/rest/v1/directory_locations"), (route) => route.fulfill({ status: 200, contentType: "application/json", body: route.request().headers().accept?.includes("object+json") ? JSON.stringify(location) : JSON.stringify([location]) }));
  await page.route((url) => url.pathname.endsWith("/rest/v1/directory_games"), (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([game]) }));
  await page.route((url) => url.pathname.endsWith("/rest/v1/directory_notes"), (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route((url) => url.pathname.endsWith("/auth/v1/user"), (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "55555555-5555-4555-8555-555555555555", aud: "authenticated", email: "admin@example.com" }) }));
  await page.route("https://api.maptiler.com/**", async (route) => {
    const response = await route.fetch({ headers: { ...route.request().headers(), origin: "https://countlab.ca", referer: "https://countlab.ca/directory/" } });
    await route.fulfill({ response });
  });
  await page.goto("/directory/");
  await expect(page.getByText("Private admin view.", { exact: false })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "1 location" })).toBeVisible();
  const map = page.getByRole("img", { name: "Map of directory locations" });
  await expect(map).toHaveAttribute("data-map-loaded", "true", { timeout: 15000 });
  await expect(map).toHaveAttribute("data-map-marker-count", "1");
  await expect(map).toHaveAttribute("data-map-rendered-count", "1");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: /Private Draft Casino/ }).click();
  await expect(page.getByRole("heading", { name: "Private Draft Casino" })).toBeVisible();
  await page.getByRole("button", { name: "Back to results" }).click();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.getByText("1 of 1 matching locations have map coordinates.")).toBeVisible();
  await expect(page.locator('input[type="file"][accept=".json,application/json"]')).toHaveCount(0);
  await expect(map).toHaveAttribute("data-map-marker-count", "1");
  await expect(map).toHaveAttribute("data-map-rendered-count", "1");
  const bounds = await map.boundingBox();
  await map.click({ position: { x: Math.round(bounds!.width / 2), y: Math.round(bounds!.height / 2) - 18 } });
  await expect(page.getByLabel("Selected casino details").getByRole("heading", { name: "Private Draft Casino" })).toBeVisible();
  await page.unrouteAll({ behavior: "ignoreErrors" });
});
