import { expect, test, type Page } from "@playwright/test";

async function prepareGuest(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("countlab:guest", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
  });
}

test("strategy and index charts stay compact while showing a complete hand section", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop chart layout coverage.");
  await prepareGuest(page);
  await page.goto("/reference/basic-strategy/");

  await expect(page.getByRole("tab", { name: "Hard totals" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-testid='chart-rail-hard'] tbody td")).toHaveCount(100);
  const strategyCell = page.getByLabel("8 versus dealer 2: Hit");
  await expect(strategyCell).toBeVisible();
  expect((await strategyCell.boundingBox())?.height).toBeLessThanOrEqual(32);
  const chartBox = await page.locator("[data-testid='chart-rail-hard']").boundingBox();
  expect((chartBox?.y ?? Infinity) + (chartBox?.height ?? Infinity)).toBeLessThanOrEqual(900);

  await page.getByRole("tab", { name: "Index deviations" }).click();
  await expect(page.getByText(/Every cell keeps its basic-strategy action/i)).toBeVisible();
  await expect(page.locator("[data-testid='chart-rail-hard'] tbody td")).toHaveCount(100);
  await expect(page.getByLabel("8 versus dealer 2: Hit")).toBeVisible();

  await page.getByRole("tab", { name: "Pairs" }).click();
  await expect(page.locator("[data-testid='chart-rail-pairs'] tbody td")).toHaveCount(100);
});
