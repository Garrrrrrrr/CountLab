import { expect, test, type Page } from "@playwright/test";

async function prepareGuest(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("countlab:guest", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
  });
}

test("reference exposes strategy and deviations as direct destinations", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop navigation coverage.");
  await prepareGuest(page);
  await page.goto("/reference/");

  await expect(page.getByRole("heading", { name: /reference, without the scavenger hunt/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /view basic strategy/i })).toHaveAttribute("href", "/reference/basic-strategy/");
  await expect(page.getByRole("link", { name: /view index deviations/i })).toHaveAttribute("href", "/reference/deviations/");

  await page.goto("/reference/deviations/");
  await expect(page.getByRole("heading", { name: "Index deviation chart" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Index deviations" })).toHaveAttribute("aria-selected", "true");
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
