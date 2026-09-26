import { expect, test, type Page } from "@playwright/test";

async function prepareGuest(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("countlab:guest", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
  });
}

test("desktop lab navigation has visible primary controls", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop smoke coverage.");
  await prepareGuest(page);
  await page.goto("/cvcx/");
  await expect(page.getByRole("heading", { name: /game.*bankroll/i })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Tools" }).getByRole("link", { name: "All drills" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Results" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Bet ramp chart/ })).toBeVisible();
});

test("phone navigation reaches everyday destinations and opens the full menu", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chromium", "Mobile smoke coverage.");
  await prepareGuest(page);
  await page.goto("/dashboard/");
  const bar = page.getByLabel("Mobile navigation");
  for (const name of ["Dashboard", "Practice", "Charts", "Journal"]) {
    const link = bar.getByRole("link", { name });
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await bar.getByRole("button", { name: "Menu" }).click();
  const menu = page.getByRole("complementary", { name: "Primary navigation" });
  await menu.getByRole("link", { name: "Trip Planner" }).click();
  await expect(page).toHaveURL(/\/trip-planner\/$/);
  await expect(menu.getByRole("link", { name: "Trip Planner" })).not.toBeInViewport();
});
