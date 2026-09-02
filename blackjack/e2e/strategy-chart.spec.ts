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
  await page.getByLabel("13 versus dealer 2: Stand").hover();
  await expect(page.getByRole("tooltip")).toContainText(
    "Hit a hard 13 against a dealer 2 once the true count drops to -1 or below; otherwise stand.",
  );

  await page.getByRole("tab", { name: "Pairs" }).click();
  await expect(page.locator("[data-testid='chart-rail-pairs'] tbody td")).toHaveCount(100);

  await page.getByRole("tab", { name: "H17 chart" }).click();
  await expect(page.getByRole("heading", { name: "H17 deviation chart" })).toBeVisible();
  await expect(page.getByText(/answer key for the H17 chart recall drill/i)).toBeVisible();
  await expect(page.getByRole("tab", { name: "Hard totals" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-testid='h17-reference-rail-hard'] tbody td")).toHaveCount(100);
  await expect(page.getByLabel("16 versus dealer 9: The chart prints 4+: the deviation applies at true count +4 and above.")).toHaveText("4+");

  await page.getByRole("tab", { name: "Late surrender" }).click();
  await expect(page.locator("[data-testid='h17-reference-rail-surrender'] tbody td")).toHaveCount(40);
  await expect(page.getByLabel("15 versus dealer 10: The chart prints 0-: the deviation applies at any negative running count.")).toHaveText("0-");
});
