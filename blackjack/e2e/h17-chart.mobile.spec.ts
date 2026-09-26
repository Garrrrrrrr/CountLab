import { expect, test, type Page } from "@playwright/test";

const section = "Pair splitting";
const hand = "A,A";
const dealers = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];

async function prepareChart(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("countlab:guest", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
  });
  await page.goto("/training/h17-chart/");
  await expect(page.getByRole("heading", { name: "H17 Chart" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View H17 reference" })).toHaveAttribute("href", "/reference/h17-chart/");
  await page.getByRole("radio", { name: /^Pair splitting/ }).check();
  await page.getByRole("button", { name: "Start filling in" }).click();
}

test("every dealer column clears the sticky hand label", async ({ page }) => {
  test.skip(test.info().project.name === "desktop-chromium", "The chart keypad is a mobile-only control.");
  await prepareChart(page);
  const rail = page.getByTestId("h17-rail-pairs");
  const label = page.getByTestId("h17-hand-pairs-A,A");

  for (const dealer of dealers) {
    const cell = rail.getByLabel(`${section} ${hand} versus ${dealer}`);
    const snapCell = cell.locator("xpath=..");
    await snapCell.evaluate((element) => element.scrollIntoView({ block: "nearest", inline: "start" }));
    await expect.poll(async () => {
      const [cellBox, labelBox] = await Promise.all([snapCell.boundingBox(), label.boundingBox()]);
      return Boolean(cellBox && labelBox && cellBox.x >= labelBox.x + labelBox.width - 1);
    }).toBe(true);
  }
});

test("touch dock advances the selected cell without focusing an input", async ({ page }) => {
  test.skip(test.info().project.name === "desktop-chromium", "The chart keypad is a mobile-only control.");
  await prepareChart(page);
  const first = page.getByLabel(`${section} ${hand} versus 2`);
  const second = page.getByLabel(`${section} ${hand} versus 3`);

  await page.getByRole("group", { name: "Chart entry keys" }).getByRole("button", { name: "Y", exact: true }).click();

  await expect(second).toHaveAttribute("data-selected", "true");
  await expect(first).toHaveValue("Y");
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe("INPUT");
});

test("the keypad enters every early-surrender index, including 8+ and 7+", async ({ page }) => {
  test.skip(test.info().project.name === "desktop-chromium", "The chart keypad is a mobile-only control.");
  await page.addInitScript(() => {
    localStorage.setItem("countlab:guest", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
  });
  await page.goto("/training/h17-chart/");
  await page.locator("summary", { hasText: "More options" }).click();
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.getByRole("radio", { name: "Early surrender against a 10" }).check();
  await page.getByRole("group", { name: "What to fill in" }).getByRole("radio", { name: /^Early surrender vs 10/ }).check();
  await page.getByRole("button", { name: "Start filling in" }).click();

  const keypad = page.getByRole("group", { name: "Chart entry keys" });
  await expect(keypad.getByRole("button", { name: "7", exact: true })).toBeVisible();
  await expect(keypad.getByRole("button", { name: "9", exact: true })).toBeVisible();
  // Selecting a cell by focus stands in for a tap; the keypad then types into it without the system keyboard.
  const cell = page.getByLabel("Early surrender vs 10 12 versus 10");
  await cell.focus();
  await keypad.getByRole("button", { name: "8", exact: true }).click();
  await keypad.getByRole("button", { name: "Plus", exact: true }).click();
  await expect(cell).toHaveValue("8+");
  const eight = page.getByLabel("Early surrender vs 10 8,8 versus 9");
  await eight.focus();
  await keypad.getByRole("button", { name: "7", exact: true }).click();
  await keypad.getByRole("button", { name: "Plus", exact: true }).click();
  await expect(eight).toHaveValue("7+");
});

test("on a phone the graded chart opens at its score, and a tapped cell's reading shows beside it", async ({ page }) => {
  test.skip(test.info().project.name === "desktop-chromium", "The chart keypad is a mobile-only control.");
  await prepareChart(page);
  // One line of HUD above the chart: no Jump row, and a Grade button big enough to tap.
  await expect(page.getByRole("navigation", { name: "Jump to a table" })).toBeHidden();
  const grade = page.getByRole("button", { name: /^Grade/ });
  expect((await grade.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  const keypad = page.getByRole("group", { name: "Chart entry keys" });
  for (const key of ["Y", "N", "Y"]) await keypad.getByRole("button", { name: key, exact: true }).click();
  await grade.click();
  await page.getByRole("button", { name: "Grade anyway" }).click();
  const score = page.getByRole("heading", { level: 1, name: /H17 Chart: \d+ of 100/ });
  await expect(score).toBeInViewport();
  await expect(score).toBeFocused();
  await expect(page.locator("[data-cell-reading]")).toHaveCount(0);

  const cell = page.getByLabel(`${section} ${hand} versus 5`);
  await cell.scrollIntoViewIfNeeded();
  await cell.click();
  const reading = page.locator("[data-cell-reading]");
  await expect(reading).toContainText(`${hand} vs 5`);
  await expect(reading).toBeInViewport({ ratio: 1 });
  await expect(cell).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
