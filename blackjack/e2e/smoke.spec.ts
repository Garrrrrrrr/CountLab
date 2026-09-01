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
  await expect(page.getByRole("link", { name: "Practice" })).toBeVisible();
  await expect(page.getByLabel("Audited true-count range")).toBeVisible();
});

test("phone has four area destinations with usable tap targets", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chromium", "Mobile smoke coverage.");
  await prepareGuest(page);
  await page.goto("/dashboard/");
  for (const name of ["Practice", "Analyze", "Play", "Reference"]) {
    const link = page.getByLabel("Mobile navigation").getByRole("link", { name });
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});
