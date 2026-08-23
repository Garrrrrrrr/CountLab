import { expect, test } from "@playwright/test";

const section = "Pair splitting";
const hand = "A,A";
const dealers = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("countlab:guest", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
  });
  await page.goto("/training/h17-chart/");
  await expect(page.getByRole("heading", { name: "H17 Chart" })).toBeVisible();
  await page.getByLabel("Section").selectOption("pairs");
});

test("every dealer column clears the sticky hand label", async ({ page }) => {
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
  const first = page.getByLabel(`${section} ${hand} versus 2`);
  const second = page.getByLabel(`${section} ${hand} versus 3`);

  await page.getByRole("group", { name: "Chart entry keys" }).getByRole("button", { name: "y", exact: true }).click();

  await expect(second).toHaveClass(/border-emerald-400/);
  await expect(first).toHaveValue("Y");
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe("INPUT");
});
