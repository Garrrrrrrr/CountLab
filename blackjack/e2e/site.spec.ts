import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Picks a segmented-control option by clicking its visible label, as a person would. The radio
 * itself is visually hidden, and forcing a click onto it skips the check that nothing (the fixed
 * tab bar, a dock) covers it.
 */
async function choose(radio: Locator) {
  await radio.locator("xpath=ancestor::label[1]").click();
  await expect(radio).toBeChecked();
}

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
  for (const path of ["/", "/train/", "/charts/", "/charts/indices/", "/charts/pocket/", "/progress/", "/settings/", "/signin/", "/terms/", "/privacy/", "/changelog/", "/calculator/", "/journal/"]) {
    test(`${path} renders without errors or sideways scroll`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });
  }

  test("what's new is reachable from Settings and its screenshots load", async ({ page }) => {
    await page.goto("/settings/");
    await page.getByRole("main").getByRole("link", { name: "What's new" }).click();
    await expect(page.getByRole("heading", { name: "What's new", level: 1 })).toBeVisible();
    const images = page.locator("main img");
    expect(await images.count()).toBeGreaterThan(5);
    for (const image of await images.all()) {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    }
  });

  test("unknown addresses get the not-found page", async ({ page }) => {
    await page.goto("/no-such-page/");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page).toHaveTitle(/^Page not found/);
    await expect(page.locator("main")).not.toContainText("redesign");
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

  test("print Wong's numbers for the default H17 game", async ({ page }) => {
    await page.goto("/charts/");
    // Wong, Professional Blackjack, tables A2 and 33.
    await expect(cell(page, "Hard 16 versus dealer 10")).toHaveAccessibleName(/Hit.*Stand at 0 or higher.*Surrender first/);
    await expect(cell(page, "Hard 12 versus dealer 4")).toHaveAccessibleName(/Stand.*Hit at −1 or lower/);
    await expect(cell(page, "Hard 11 versus dealer ace")).toHaveAccessibleName(/Double.*Hit at −1 or lower/);
    await expect(cell(page, "Surrender Hard 17 versus dealer ace")).toHaveAccessibleName(/basic strategy surrenders\. With a count, Wong never does/);
    await expect(cell(page, "Surrender Hard 15 versus dealer 10")).toHaveAccessibleName(/unless the true count is −1 or lower/);
    await expect(cell(page, "Surrender Hard 16 versus dealer 10")).toHaveAccessibleName(/unless the true count is −3 or lower/);
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

  test("footnote a cell where basic strategy and Wong never agree", async ({ page }) => {
    // Exact two-deck DAS basic strategy splits 6,6 v 7; Wong's multiple-deck numbers hit it at every count.
    await page.goto("/charts/?decks=2&soft17=h17&das=1&surrender=late");
    await expect(cell(page, "Pair of 6s versus dealer 7")).toHaveAccessibleName(/Split.*Wong's numbers hit at every count \(see the note under the table\)/);
    await expect(page.locator("#pairs")).toContainText("* 6,6 v 7: basic strategy, exact for 2 decks, splits; Wong's numbers hit at every count");
    await cell(page, "Pair of 6s versus dealer 7").click();
    await expect(page.getByRole("dialog")).toContainText("With a count, follow Wong.");
    await expect(page.getByRole("dialog")).toContainText("truncated toward zero");
    await page.goto("/charts/pocket/?decks=2&soft17=h17&das=1&surrender=late");
    await expect(page.getByRole("img", { name: /Pocket strategy chart/ })).toContainText("* 6,6 v 7: basic strategy, exact for 2 decks, splits");
  });

  test("show every play at a chosen count and explain a cell", async ({ page }) => {
    await page.goto("/charts/");
    await choose(page.getByRole("radio", { name: "At a count" }));
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

  test("pocket chart follows the rules", async ({ page }) => {
    await page.goto("/charts/pocket/?decks=1&soft17=s17&das=0&surrender=none");
    const card = page.getByRole("img", { name: /Pocket strategy chart for 1D · S17/ });
    await expect(card).toBeVisible();
    await expect(card).not.toContainText("Surrender first");
    await expect(page.getByRole("button", { name: "Save image" })).toBeVisible();
  });

  test("pocket chart can print only the Illustrious 18 and Fab 4, and remembers it", async ({ page, hasTouch }) => {
    await page.goto("/charts/pocket/?decks=6&soft17=h17&das=1&surrender=late");
    const card = page.getByRole("img", { name: /Pocket strategy chart/ });
    await expect(card).toContainText("Wong’s indices");
    await choose(page.getByRole("radio", { name: "I18 + Fab 4" }));
    await expect(card).toContainText("Illustrious 18 + Fab 4");
    await page.reload();
    await expect(page.getByRole("radio", { name: "I18 + Fab 4" })).toBeChecked();
    // The charts page's download uses the same choice.
    await page.goto("/charts/?decks=6&soft17=h17&das=1&surrender=late");
    if (!hasTouch) {
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download chart" }).filter({ visible: true }).click()]);
      expect(download.suggestedFilename()).toBe("countlab-chart-6d-h17-das-ls-i18-fab4.png");
    }
    // Phones open the pocket card from a button that says so.
    await expect(page.getByRole("link", { name: "Pocket chart" }).filter({ visible: true }).first()).toBeVisible();
  });

  test("pocket chart colours and shape are remembered and name the download", async ({ page, hasTouch }) => {
    test.skip(hasTouch, "Phones save through the share sheet, covered below.");
    await page.goto("/charts/pocket/?decks=6&soft17=h17&das=1&surrender=late");
    await choose(page.getByRole("radio", { name: "Dark" }));
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save image" }).click()]);
    expect(download.suggestedFilename()).toBe("countlab-chart-6d-h17-das-ls-dark.png");
    await choose(page.getByRole("radio", { name: "Phone" }));
    const [long] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save image" }).click()]);
    expect(long.suggestedFilename()).toBe("countlab-chart-6d-h17-das-ls-dark-phone.png");
    await page.goto("/charts/?decks=6&soft17=h17&das=1&surrender=late");
    const [fromCharts] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download chart" }).filter({ visible: true }).click()]);
    expect(fromCharts.suggestedFilename()).toBe("countlab-chart-6d-h17-das-ls-dark-phone.png");
  });

  test("download the chart from the charts page on any screen size", async ({ page, hasTouch }) => {
    // Phones get the share sheet (its "Save Image" reaches the photo library); stand in for it.
    await page.addInitScript(() => {
      const shared: string[] = [];
      Object.assign(window, { shared });
      Object.assign(navigator, { canShare: () => true, share: async ({ files }: { files: File[] }) => { shared.push(...files.map((file) => `${file.name} ${file.type}`)); } });
    });
    await page.goto("/charts/?decks=6&soft17=h17&das=1&surrender=early");
    const button = page.getByRole("button", { name: "Download chart" }).filter({ visible: true });
    await expect(button).toHaveCount(1);
    // Phone-width screens save the one-column shape unless the reader picked another.
    const name = `countlab-chart-6d-h17-das-es10${page.viewportSize()!.width < 640 ? "-phone" : ""}.png`;
    if (hasTouch) {
      await button.click();
      await expect.poll(() => page.evaluate(() => (window as unknown as { shared: string[] }).shared)).toEqual([`${name} image/png`]);
    } else {
      const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
      expect(download.suggestedFilename()).toBe(name);
    }
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
    // The controls stay disabled until saved settings and the account check have loaded.
    await expect(page.getByRole("radio", { name: "Stands (S17)" }).first()).toBeEnabled();
    await choose(page.getByRole("radio", { name: "Stands (S17)" }).first());
    await choose(page.getByRole("radio", { name: "None" }).first());
    await page.goto("/charts/");
    await expect(page.getByRole("button", { name: /Table rules/ })).toContainText("S17");
    await expect(page.getByRole("button", { name: /Table rules/ })).toContainText("NS");
  });

  test("the theme applies immediately", async ({ page }) => {
    await page.goto("/settings/");
    await expect(page.getByRole("radio", { name: "Dark" })).toBeEnabled();
    await choose(page.getByRole("radio", { name: "Dark" }));
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});
