import { expect, test, type Page } from "@playwright/test";

async function prepareGuest(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("countlab:guest", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
  });
}

test("reference opens the strategy chart and switches to index plays", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop navigation coverage.");
  await prepareGuest(page);
  await page.goto("/reference/");

  await expect(page.getByRole("heading", { level: 1, name: "Basic strategy chart" })).toBeVisible();
  const basic = page.getByRole("radio", { name: "Basic strategy", exact: true });
  const index = page.getByRole("radio", { name: "With index plays", exact: true });
  await expect(basic).toBeChecked();

  await index.click();
  await expect(page.getByRole("heading", { level: 1, name: "Index deviation chart" })).toBeVisible();
  await expect(index).toBeChecked();
  await expect(page).toHaveURL(new RegExp("/reference/deviations/$"));

  await page.goto("/reference/deviations/");
  await expect(page.getByRole("radio", { name: "With index plays", exact: true })).toBeChecked();

  await page.goto("/reference/h17-chart/");
  await expect(page.getByRole("heading", { level: 1, name: "H17 deviation chart" })).toBeVisible();
  // The printed H17 chart is an index chart, so its way back is the index view.
  await expect(page.getByRole("link", { name: "Chart for your rules" })).toHaveAttribute("href", "/reference/deviations/");
});

test("practice organizes drills by skill", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop information-architecture coverage.");
  await prepareGuest(page);
  await page.goto("/practice/");

  await expect(page.getByRole("heading", { name: "Count with confidence" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Make the right play" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Put it together" })).toBeVisible();
  await expect(page.getByRole("link", { name: /full shoe/i }).first()).toHaveAttribute("href", "/training/full-shoe/");
});

test("deviation drill opens its matching reference view", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop drill navigation coverage.");
  await prepareGuest(page);
  await page.goto("/training/deviations/");

  const reference = page.getByRole("link", { name: "View deviation reference" });
  await expect(reference).toHaveAttribute("href", "/reference/deviations/");
  await reference.click();

  await expect(page).toHaveURL(/\/reference\/deviations\/$/);
  await expect(page.getByRole("radio", { name: "With index plays", exact: true })).toBeChecked();
  await expect(page.getByRole("heading", { level: 1, name: "Index deviation chart" })).toBeVisible();
});
