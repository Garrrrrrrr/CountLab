import { expect, test, type Page } from "@playwright/test";

/** Skip the analytics question so it never covers what a test taps. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("countlab:analytics:consent_seen", "1");
      localStorage.setItem("countlab:analytics:consent", "denied");
    } catch { /* storage blocked */ }
  });
});

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource|NEXT_PUBLIC_SUPABASE/.test(message.text())) errors.push(message.text());
  });
  return errors;
};

test.describe("pages", () => {
  for (const path of ["/", "/train/", "/charts/", "/charts/indices/", "/progress/", "/settings/", "/signin/", "/terms/", "/privacy/", "/calculator/", "/journal/"]) {
    test(`${path} renders without errors or sideways scroll`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });
  }

  test("unknown addresses get the not-found page", async ({ page }) => {
    await page.goto("/no-such-page/");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});

test.describe("old addresses", () => {
  test("redirect to the new pages and keep the query string", async ({ page }) => {
    await page.goto("/reference/?decks=2");
    await expect(page).toHaveURL(/\/charts\/\?decks=2/);
    await page.goto("/training/full-shoe/");
    await expect(page).toHaveURL(/\/train\/full-shoe\/$/);
    await page.goto("/cvcx/");
    await expect(page).toHaveURL(/\/calculator\/$/);
    await page.goto("/dashboard/");
    await expect(page).toHaveURL(/\/progress\/$/);
  });
});

test.describe("strategy charts", () => {
  const cell = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name}`) });

  test("print the published indices for the default H17 game", async ({ page }) => {
    await page.goto("/charts/");
    await expect(cell(page, "Hard 16 versus dealer 10")).toHaveAccessibleName(/Hit.*Stand at 0 or higher.*Surrender first/);
    await expect(cell(page, "Hard 12 versus dealer 4")).toHaveAccessibleName(/Stand.*Hit at −1 or lower/);
    await expect(cell(page, "Hard 11 versus dealer ace")).toHaveAccessibleName(/Double.*Hit at −2 or lower/);
    await expect(cell(page, "Surrender Hard 17 versus dealer ace")).toHaveAccessibleName(/surrender, at every count/);
    await expect(cell(page, "Surrender Hard 15 versus dealer 10")).toHaveAccessibleName(/unless the true count is −1 or lower/);
  });

  test("follow the rules in the link and redraw when they change", async ({ page }) => {
    await page.goto("/charts/?decks=6&soft17=s17&das=1&surrender=none");
    await expect(page.getByRole("button", { name: /Table rules/ })).toContainText("S17");
    await expect(page.locator("#surrender")).toHaveCount(0);
    await expect(cell(page, "Hard 11 versus dealer ace")).toHaveAccessibleName(/Hit.*Double at \+1 or higher/);
    await page.goto("/charts/?decks=6&soft17=h17&das=1&surrender=early");
    await expect(page.locator("#surrender-title")).toContainText("early vs 10");
    await expect(cell(page, "Surrender Hard 14 versus dealer 10")).toHaveAccessibleName(/surrender, unless the true count is −1 or lower/);
  });

  test("show every play at a chosen count and explain a cell", async ({ page }) => {
    await page.goto("/charts/");
    await page.getByRole("radio", { name: "At a count" }).check({ force: true });
    await page.getByRole("button", { name: "Increase True count" }).click();
    await page.getByRole("button", { name: "Increase True count" }).click();
    await expect(cell(page, "Hard 10 versus dealer 10")).toHaveAccessibleName(/at a true count of \+4, double \(basic strategy says hit\)/);
    await cell(page, "Hard 16 versus dealer 10").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: "Hard 16 vs 10" })).toBeVisible();
    await expect(sheet).toContainText("If you can’t surrender");
    await expect(sheet).toContainText("0 or higher");
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  });

  test("move between cells with the arrow keys", async ({ page }) => {
    await page.goto("/charts/");
    await cell(page, "Hard 17 versus dealer 2").focus();
    await page.keyboard.press("ArrowDown");
    await expect(cell(page, "Hard 16 versus dealer 2")).toBeFocused();
    await page.keyboard.press("End");
    await expect(cell(page, "Hard 16 versus dealer ace")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Hard 16 vs an ace" })).toBeVisible();
  });

  test("rank the Illustrious 18 and Fab 4 first in the index list", async ({ page }) => {
    await page.goto("/charts/indices/");
    const first = page.locator("ol").first().locator("li");
    await expect(first.nth(0)).toContainText("Insurance");
    await expect(first.nth(1)).toContainText("Hard 16 v 10");
  });
});

test.describe("settings", () => {
  test("table rules flow into the charts", async ({ page }) => {
    await page.goto("/settings/");
    // The controls stay disabled until saved settings load; `force` would click straight through that.
    await expect(page.getByRole("radio", { name: "Stands (S17)" }).first()).toBeEnabled();
    await page.getByRole("radio", { name: "Stands (S17)" }).first().check({ force: true });
    await page.getByRole("radio", { name: "None" }).first().check({ force: true });
    await page.goto("/charts/");
    await expect(page.getByRole("button", { name: /Table rules/ })).toContainText("S17");
    await expect(page.getByRole("button", { name: /Table rules/ })).toContainText("NS");
  });

  test("the theme applies immediately", async ({ page }) => {
    await page.goto("/settings/");
    await expect(page.getByRole("radio", { name: "Dark" })).toBeEnabled();
    await page.getByRole("radio", { name: "Dark" }).check({ force: true });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});
