import { expect, test } from "@playwright/test";

/**
 * Runs against the local export in CI and, after each deploy, against
 * countlab.ca (see .github/workflows/deploy.yml, which greps for
 * "service worker allow"). It proves the offline worker installs, takes
 * control, and serves pages the reader has visited with no network.
 */
test.describe("service worker allow", () => {
  test.use({ serviceWorkers: "allow" });

  test("installs, takes control and serves visited pages offline", async ({ page, context }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem("countlab:analytics:consent_seen", "1");
      localStorage.setItem("countlab:analytics:consent", "denied");
    });
    await page.goto("/");
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)).catch(() => false), { timeout: 45_000 }).toBe(true);
    await page.goto("/charts/");
    await expect(page.getByRole("heading", { name: "Strategy charts" })).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Strategy charts" })).toBeVisible();
    await page.getByRole("button", { name: /^Hard 16 versus dealer 10/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Play at each true count");
    await context.setOffline(false);
    expect(errors).toEqual([]);
  });
});
