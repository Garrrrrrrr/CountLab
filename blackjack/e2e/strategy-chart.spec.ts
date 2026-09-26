import { expect, test, type Locator, type Page } from "@playwright/test";

async function prepareGuest(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("countlab:guest", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
  });
}

/** Text contrast against the element's composited background, as production-regressions.spec.ts measures it. */
function contrast(locator: Locator) {
  return locator.evaluate((element) => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white"; context.fillRect(0, 0, 1, 1);
    const ancestors: Element[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node);
    for (const node of ancestors) { context.fillStyle = getComputedStyle(node).backgroundColor; context.fillRect(0, 0, 1, 1); }
    const luminance = () => {
      const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((n) => { const c = n / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const background = luminance();
    context.fillStyle = getComputedStyle(element).color; context.fillRect(0, 0, 1, 1);
    const foreground = luminance();
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
}

test("strategy and index charts show every table at once and stay compact", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop chart layout coverage.");
  await prepareGuest(page);
  await page.goto("/reference/basic-strategy/");

  await expect(page.getByRole("heading", { level: 2, name: "Hard totals" })).toBeVisible();
  await expect(page.getByTestId("chart-rail-hard").locator("tbody td")).toHaveCount(100);
  await expect(page.getByTestId("chart-rail-soft").locator("tbody td")).toHaveCount(80);
  await expect(page.getByTestId("chart-rail-pairs").locator("tbody td")).toHaveCount(100);
  const strategyCell = page.getByLabel("8 versus dealer 2: Hit");
  await expect(strategyCell).toBeVisible();
  expect((await strategyCell.boundingBox())?.height).toBeLessThanOrEqual(32);
  const chartBox = await page.getByTestId("chart-rail-hard").boundingBox();
  expect((chartBox?.y ?? Infinity) + (chartBox?.height ?? Infinity)).toBeLessThanOrEqual(900);

  await page.getByRole("radio", { name: "With index plays", exact: true }).click();
  await expect(page.getByText(/Every cell keeps its basic-strategy action/i)).toBeVisible();
  await expect(page.getByTestId("chart-rail-hard").locator("tbody td")).toHaveCount(100);
  await expect(page.getByLabel("8 versus dealer 2: Hit")).toBeVisible();
  await page.getByLabel("13 versus dealer 2: Stand").hover();
  await expect(page.getByRole("tooltip")).toContainText(
    "Hit when the true count is -1 or lower; otherwise stand.",
  );

  await page.goto("/reference/h17-chart/");
  await expect(page.getByRole("heading", { name: "H17 deviation chart" })).toBeVisible();
  await expect(page.getByText(/answer key for the H17 chart recall drill/i)).toBeVisible();
  await expect(page.getByTestId("h17-reference-rail-hard").locator("tbody td")).toHaveCount(100);
  await expect(page.getByLabel("16 versus dealer 9: The chart prints 4+: the deviation applies at true count +4 and above.")).toHaveText("4+");
  await expect(page.getByTestId("h17-reference-rail-surrender").locator("tbody td")).toHaveCount(40);
  await expect(page.getByLabel("15 versus dealer 10: The chart prints 0-: the deviation applies at any negative running count.")).toHaveText("0-");
});

test("the charts fit a 320px screen with every dealer column", async ({ page }) => {
  await prepareGuest(page);
  await page.setViewportSize({ width: 320, height: 700 });
  for (const path of ["/reference/", "/reference/deviations/", "/reference/h17-chart/"]) {
    await page.goto(path);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    const rail = page.getByTestId(path.includes("h17") ? "h17-reference-rail-hard" : "chart-rail-hard");
    const ace = await rail.getByRole("columnheader", { name: "A", exact: true }).boundingBox();
    expect((ace?.x ?? Infinity) + (ace?.width ?? Infinity), path).toBeLessThanOrEqual(320);
    expect((await rail.locator("tbody button").first().boundingBox())?.width, path).toBeGreaterThanOrEqual(24);
  }
});

test("tapping a cell explains the play", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chromium", "Touch coverage.");
  await prepareGuest(page);
  await page.goto("/reference/deviations/");
  // Cells explain themselves once the page's script has taken over.
  await expect(page.getByRole("radio", { name: "With index plays", exact: true })).toBeEnabled();
  const cell = page.getByLabel("16 versus dealer 10: Hit");
  await cell.scrollIntoViewIfNeeded();
  await cell.tap();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toContainText("Hard 16 vs dealer 10");
  await expect(tooltip).toContainText("Hit when the true count is below 0; otherwise stand.");
  await page.getByRole("heading", { level: 1 }).tap();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("switching views keeps the table rules", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Viewport-independent state coverage.");
  await prepareGuest(page);
  await page.goto("/reference/");
  await page.getByRole("radio", { name: "1 deck", exact: true }).click();
  await page.getByRole("radio", { name: "Dealer stands on soft 17 (S17)" }).click();
  await page.getByRole("radio", { name: "With index plays", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("/reference/deviations/$"));
  await expect(page.getByRole("radio", { name: "1 deck", exact: true })).toBeChecked();
  await expect(page.getByText("The indices shown are the 4–8 deck sets.")).toBeVisible();
  // Nothing is saved yet for this visitor, so the reset returns to the defaults.
  const reset = page.getByRole("button", { name: /Reset to (my rules|defaults)/ });
  await reset.click();
  await expect(page.getByRole("radio", { name: "4–8 decks", exact: true })).toBeChecked();
  await expect(reset).toBeHidden();
});

test("index plays are ranked by value and link to their cell", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop ranking coverage.");
  await prepareGuest(page);
  await page.goto("/reference/deviations/");
  await expect(page.getByRole("radio", { name: "With index plays", exact: true })).toBeEnabled();
  const ranking = page.getByRole("list", { name: "Index plays ranked by value" });
  await expect(ranking.getByRole("listitem").first()).toContainText("Insurance");
  // At a late-surrender table the two-card 16 v 10 is surrendered, so the
  // second most valuable play is the 14 v 10 surrender index; the starred
  // 16 v 10 stand has its own group for hands surrender no longer covers.
  await expect(ranking.getByRole("listitem").nth(1)).toContainText("14 vs 10");
  await page.getByRole("button", { name: "Show hard 16 vs 10 on the chart" }).click();
  await expect(page.getByLabel("16 versus dealer 10: Hit")).toBeFocused();
  await expect(page.getByRole("tooltip")).toContainText("Worth +0.052 units per 100 rounds");
});

test("printing shows every table without the controls", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Print layout coverage.");
  await prepareGuest(page);
  await page.goto("/reference/");
  await expect(page.getByRole("radio", { name: "With index plays", exact: true })).toBeEnabled();
  await page.emulateMedia({ media: "print" });
  for (const section of ["hard", "soft", "pairs", "surrender"]) {
    await expect(page.getByTestId(`chart-rail-${section}`)).toBeVisible();
  }
  await expect(page.getByRole("region", { name: "Table rules" })).toBeHidden();
  await expect(page.getByRole("radio", { name: "With index plays", exact: true })).toBeHidden();
  await expect(page.getByText("Rules: 6 decks")).toBeVisible();
});

test("H17 index cells keep AA contrast in both themes", async ({ page }) => {
  await prepareGuest(page);
  await page.goto("/reference/h17-chart/");
  const cell = page.getByLabel("16 versus dealer 9: The chart prints 4+");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    expect(await contrast(cell), theme).toBeGreaterThanOrEqual(4.5);
  }
});
