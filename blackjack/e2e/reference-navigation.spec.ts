import { expect, test, type Page } from "@playwright/test";

async function prepareGuest(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("countlab:guest", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
  });
}

test("reference opens the combined strategy and deviations chart", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop navigation coverage.");
  await prepareGuest(page);
  await page.goto("/reference/");

  await expect(page.getByRole("heading", { name: "Basic strategy chart" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Strategy" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tab", { name: "Index deviations" }).click();
  await expect(page.getByRole("heading", { name: "Index deviation chart" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Index deviations" })).toHaveAttribute("aria-selected", "true");

  await page.goto("/reference/deviations/");
  await expect(page.getByRole("tab", { name: "Index deviations" })).toHaveAttribute("aria-selected", "true");

  await page.goto("/reference/h17-chart/");
  await expect(page.getByRole("tab", { name: "H17 chart" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "H17 deviation chart" })).toBeVisible();
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
