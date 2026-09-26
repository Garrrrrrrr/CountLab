import { expect, test, type Page } from "@playwright/test";

async function prepare(page: Page, { guest = false } = {}) {
  await page.addInitScript((asGuest) => {
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
    if (asGuest) localStorage.setItem("countlab:guest", "1");
  }, guest);
}

test("the home count demo deals cards and quizzes the running count", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  const demo = page.getByRole("list", { name: "Most recent cards" });
  await expect(demo.getByRole("listitem")).toHaveCount(4);
  await page.getByRole("button", { name: "Deal next card" }).click();
  await expect(demo.getByRole("listitem")).toHaveCount(5);
  await page.getByRole("button", { name: "Quiz me" }).click();
  await expect(page.getByLabel("Hidden")).toBeVisible();
  await page.getByRole("button", { name: "Reveal count" }).click();
  await expect(page.getByLabel("Hidden")).toHaveCount(0);
});

test("the header theme toggle flips the theme and remembers it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Theme persistence is viewport-independent.");
  await prepare(page, { guest: true });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/practice/");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
});

test("unknown addresses show the missing-page screen instead of a sign-in form", async ({ page }) => {
  await prepare(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // An unknown path inside a real area must not borrow that area's breadcrumb either.
  for (const path of ["/no-such-page/", "/reference/no-such-chart/"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "This page went over 21." })).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: "Reference" })).toHaveAttribute("href", "/reference/");
    await expect(page.getByRole("button", { name: "Try CountLab as a guest" })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("private pages stay gated at every URL spelling", async ({ page }) => {
  await prepare(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const path of ["/journal/", "/journal/index.html"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Sign in to CountLab" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Session Journal" })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("a guest who chooses to sign in reaches the form", async ({ page }) => {
  await prepare(page, { guest: true });
  await page.goto("/signin/");
  await expect(page.getByRole("heading", { name: "Sign in to CountLab" })).toBeVisible();
  await page.getByRole("button", { name: "Try CountLab as a guest" }).click();
  await expect(page).toHaveURL(/\/dashboard\/$/);
});

test("the analysis landing lays out the suggested order and games deep-link to their modes", async ({ page }) => {
  await prepare(page, { guest: true });
  await page.goto("/analyze/");
  await expect(page.locator("main").getByRole("link", { name: "Game & Bankroll Lab" })).toHaveAttribute("href", "/cvcx/");
  await expect(page.getByText("Step 1", { exact: true })).toBeVisible();
  await page.goto("/play/");
  await page.getByRole("list", { name: "Ultimate Texas Hold'em sections" }).getByRole("link", { name: "Analyzer" }).click();
  await expect(page).toHaveURL(/ultimate-texas-holdem\/#analyzer$/);
  await expect(page.getByRole("tab", { name: "Analyzer" })).toHaveAttribute("aria-selected", "true");
});

test("settings shows unsaved rule changes until they are saved", async ({ page }) => {
  await prepare(page, { guest: true });
  await page.goto("/settings/");
  await page.getByLabel("Dealer").selectOption("s17");
  const bar = page.getByRole("region", { name: "Unsaved settings" });
  await expect(bar).toContainText("You have unsaved changes.");
  // A theme picked from the header mid-edit applies at once and survives saving the rule draft.
  await page.getByRole("button", { name: /Switch to (dark|light) theme/ }).click();
  const theme = await page.locator("html").getAttribute("data-theme");
  expect(theme).toMatch(/^(dark|light)$/);
  await expect(bar).toContainText("You have unsaved changes.");
  await bar.getByRole("button", { name: "Save settings" }).click();
  await expect(bar).toContainText("Settings saved.");
  await expect(page.getByRole("link", { name: /Training default rules: S17/ })).toBeAttached();
  // A later change from elsewhere (a sync pull, a backup import) must update the form, not pose as unsaved edits.
  await page.evaluate(() => {
    const key = "countlab:account:guest:hilo:settings";
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)!), decks: 8 }));
    dispatchEvent(new Event("hilo-storage"));
  });
  await expect(page.getByLabel("Default decks")).toHaveValue("8");
  await expect(page.getByLabel("Dealer")).toHaveValue("s17");
  await expect(bar).toHaveCount(0, { timeout: 5000 });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme!);
  await expect(page.getByRole("radio", { name: theme === "dark" ? "Dark" : "Light" })).toHaveAttribute("aria-checked", "true");
});

test("tool search finds tools by what they do", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The keyboard shortcut is desktop-only.");
  await prepare(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Find a tool/ })).toBeEnabled();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Find a tool" });
  await dialog.getByRole("combobox").fill("risk");
  await expect(dialog.getByRole("option").first()).toContainText("Game & Bankroll Lab");
});

test("public pages and the footer fit a 320px screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await prepare(page, { guest: true });
  for (const path of ["/", "/analyze/", "/play/", "/dashboard/", "/settings/", "/training/basic-strategy/", "/reference/", "/reference/h17-chart/"]) {
    await page.goto(path);
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    const clipped = await page.locator("main :is(a, button, h1, h2):visible").evaluateAll((nodes) => nodes.filter((node) => {
      const box = node.getBoundingClientRect();
      return !node.closest(".overflow-x-auto, [role='tablist'], .mobile-scroll-rail") && (box.left < -1 || box.right > innerWidth + 1);
    }).map((node) => node.textContent?.trim().slice(0, 40)));
    expect(clipped, path).toEqual([]);
    // Fixed mobile navigation and action docks must not cover the footer once scrolled to the end.
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const covered = await page.locator("footer a").evaluateAll((links) => links.filter((link) => {
      const box = link.getBoundingClientRect();
      return !link.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
    }).map((link) => link.textContent));
    expect(covered, path).toEqual([]);
  }
});

test("the desktop sidebar lists every tool by group and remembers collapsed groups", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The sidebar is permanent on desktop only.");
  await prepare(page, { guest: true });
  await page.goto("/practice/");
  const nav = page.getByRole("navigation", { name: "Tools" });
  for (const name of ["Running Count", "Game & Bankroll Lab", "Session Journal", "Chase the Flush", "Index deviation chart"]) {
    await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await nav.getByRole("button", { name: "Table games" }).click();
  await expect(nav.getByRole("button", { name: "Table games" })).toHaveAttribute("aria-expanded", "false");
  await expect(nav.getByRole("link", { name: "Chase the Flush" })).toBeHidden();
  await page.reload();
  await expect(nav.getByRole("link", { name: "Chase the Flush" })).toBeHidden();
  // Opening a tool in a collapsed group reveals that group and marks the page.
  await page.goto("/chase-flush/");
  await expect(nav.getByRole("link", { name: "Chase the Flush" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Table games");
});
