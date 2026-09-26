import { expect, test, type Page } from "@playwright/test";

const SETTINGS_KEY = "countlab:account:guest:hilo:settings";

async function prepare(page: Page, { guest = true, settings }: { guest?: boolean; settings?: Record<string, unknown> } = {}) {
  await page.addInitScript(({ asGuest, saved, key }) => {
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
    if (asGuest) localStorage.setItem("countlab:guest", "1");
    // Seed once, so a reload inside a test keeps what the test saved.
    if (saved && !sessionStorage.getItem("seeded")) {
      localStorage.setItem(key, JSON.stringify(saved));
      sessionStorage.setItem("seeded", "1");
    }
  }, { asGuest: guest, saved: settings, key: SETTINGS_KEY });
}

/** Counts writes of the saved settings blob, the only thing these pages save. */
async function countSettingsWrites(page: Page) {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    (window as unknown as { settingsWrites: number }).settingsWrites = 0;
    Storage.prototype.setItem = function (name: string, value: string) {
      if (name === key) (window as unknown as { settingsWrites: number }).settingsWrites++;
      return original.call(this, name, value);
    };
  }, SETTINGS_KEY);
  return () => page.evaluate(() => (window as unknown as { settingsWrites: number }).settingsWrites);
}

const savedSurrender = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}").surrender, SETTINGS_KEY);

/** Controls and cells respond once the page's script has hydrated; until then the switch is disabled. */
const hydrated = (page: Page) => expect(page.getByRole("radio", { name: /^(Basic strategy|Late surrender \(LS\))$/ }).first()).toBeEnabled();

const desktopOnly = (name: string) => test.skip(name !== "desktop-chromium", "Viewport-independent behaviour, covered once on desktop.");

test("a visitor without an account goes from a chart to its drill as a guest", async ({ page }) => {
  await prepare(page, { guest: false });
  await page.goto("/reference/");
  const drill = page.getByRole("link", { name: /Basic Strategy drill/ });
  await drill.scrollIntoViewIfNeeded();
  await drill.click();
  await expect(page).toHaveURL(/\/training\/basic-strategy\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in to CountLab" })).toHaveCount(0);
});

test("the view switch carries the title, canonical address and Back", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await page.goto("/reference/");
  await expect(page).toHaveTitle(/Strategy charts/);
  await page.getByRole("radio", { name: "1 deck", exact: true }).click();
  await page.getByRole("radio", { name: "With index plays", exact: true }).click();
  await expect(page).toHaveURL(/\/reference\/deviations\/$/);
  await expect(page).toHaveTitle(/Index deviation chart/);
  await expect(page.locator("link[rel='canonical']")).toHaveAttribute("href", /\/reference\/deviations\/$/);
  await expect(page.getByRole("navigation", { name: "Tools" }).getByRole("link", { name: "Index deviation chart", exact: true })).toHaveAttribute("aria-current", "page");

  await page.goBack();
  await expect(page).toHaveURL(/\/reference\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Basic strategy chart");
  await expect(page.getByRole("radio", { name: "Basic strategy", exact: true })).toBeChecked();
  await expect(page).toHaveTitle(/Strategy charts/);
  // Back stays on this page, so the rules picked for this visit are still there.
  await expect(page.getByRole("radio", { name: "1 deck", exact: true })).toBeChecked();

  await page.goForward();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Index deviation chart");
  await page.reload();
  await expect(page.getByRole("radio", { name: "With index plays", exact: true })).toBeChecked();
});

test("coming Back to a view reached with the switch restores its own title and canonical address", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  const tools = page.getByRole("navigation", { name: "Tools" });
  for (const view of [
    { from: "/reference/", switchTo: "With index plays", title: /Index deviation chart/, h1: "Index deviation chart", canonical: /\/reference\/deviations\/$/ },
    { from: "/reference/deviations/", switchTo: "Basic strategy", title: /Strategy charts/, h1: "Basic strategy chart", canonical: /\/reference\/$/ },
  ]) {
    await page.goto(view.from);
    await hydrated(page);
    await page.getByRole("radio", { name: view.switchTo, exact: true }).click();
    await expect(page).toHaveTitle(view.title);
    await tools.getByRole("link", { name: "H17 deviation chart", exact: true }).click();
    await expect(page).toHaveTitle(/H17 deviation chart/);
    // Back remounts the page with the tree of the address the switch left.
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1 }), `switched from ${view.from}`).toHaveText(view.h1);
    await expect(page).toHaveTitle(view.title);
    await expect(page.locator("link[rel='canonical']")).toHaveAttribute("href", view.canonical);
    await expect(page.locator("meta[property='og:url']")).toHaveAttribute("content", view.canonical);
  }
});

test("surrender saves once, only on a real change", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  const writes = await countSettingsWrites(page);
  await page.goto("/reference/");
  const late = page.getByRole("radio", { name: "Late surrender (LS)" });
  await expect(late).toBeEnabled();
  await late.click();
  await page.waitForTimeout(900);
  expect(await writes(), "re-picking the checked option saves nothing").toBe(0);

  // Arrowing across the options saves once, for the option the reader stops on.
  await late.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("radio", { name: "None (no surrender)" })).toBeChecked();
  await expect.poll(() => savedSurrender(page)).toBe("none");
  await page.waitForTimeout(900);
  expect(await writes()).toBe(1);

  await page.getByRole("radio", { name: "Early vs 10 (early surrender, ES10)" }).click();
  await expect.poll(() => savedSurrender(page)).toBe("early");
  await expect(page.getByRole("link", { name: /Training default rules/ })).toContainText("ES10");
  await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();
  // Early surrender adds the hands it gives up against a ten: 13, 12 and 7,7.
  await expect(page.getByTestId("chart-rail-surrender").locator("tbody tr")).toHaveCount(8);
});

test("the H17 chart never rewrites a saved 'no surrender'", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page, { settings: { surrender: "none" } });
  const writes = await countSettingsWrites(page);
  await page.goto("/reference/h17-chart/");
  await hydrated(page);
  await expect(page.getByText("Your saved table has no surrender; skip the surrender table.")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Late surrender (LS)" })).not.toBeChecked();
  await expect(page.getByRole("radio", { name: "Early vs 10 (early surrender, ES10)" })).not.toBeChecked();
  await page.getByRole("button", { name: "What is Surrender?" }).click();
  await page.getByLabel("16 versus dealer 10: The chart prints 0+").click();
  await page.waitForTimeout(900);
  expect(await writes()).toBe(0);
  expect(await savedSurrender(page)).toBe("none");

  await page.getByRole("radio", { name: "Early vs 10 (early surrender, ES10)" }).click();
  await expect(page.getByTestId("h17-reference-rail-surrender").locator("tbody tr")).toHaveCount(7);
  await expect.poll(() => savedSurrender(page)).toBe("early");
});

test("saved rules the reader has not touched follow changes made elsewhere", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await page.goto("/reference/");
  await hydrated(page);
  await expect(page.getByRole("radio", { name: "Dealer hits soft 17 (H17)" })).toBeChecked();
  await expect(page.getByLabel("11 versus dealer A: Double")).toBeVisible();
  await page.evaluate((key) => {
    const current = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...current, dealerHitsSoft17: false, surrender: "none" }));
    window.dispatchEvent(new Event("hilo-storage"));
  }, SETTINGS_KEY);
  await expect(page.getByRole("radio", { name: "Dealer stands on soft 17 (S17)" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "None (no surrender)" })).toBeChecked();
  await expect(page.getByText("This table offers no surrender. Play every hand out from the hand tables.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Reset to/ })).toHaveCount(0);
  // The chart repaints for the new rule: 11 v A hits at S17.
  await expect(page.getByLabel("11 versus dealer A: Hit")).toBeVisible();
});

test("the folded rules button counts changes against the saved rules as they move", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/reference/");
  await hydrated(page);
  const rules = page.getByRole("button", { name: /^Table rules/ });
  await rules.click();
  await page.getByRole("radio", { name: "1 deck", exact: true }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(rules).toBeFocused();
  await expect(rules).toHaveAccessibleName(/1D .*\(1 changed from your saved rules\)/);
  // Saving the same deck count elsewhere makes the reader's pick the saved rule.
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) || "{}"), decks: 1, dealerHitsSoft17: false }));
    window.dispatchEvent(new Event("hilo-storage"));
  }, SETTINGS_KEY);
  await expect(rules).toHaveAccessibleName(/1D · S17/);
  await expect(rules).not.toHaveAccessibleName(/changed/);
});

test("the grid is one Tab stop per table and explains the focused cell", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await page.goto("/reference/");
  const view = page.getByRole("radio", { name: "Basic strategy", exact: true });
  await expect(view).toBeEnabled();
  await view.focus();
  const stops: string[] = [];
  for (let step = 0; step < 60; step++) {
    await page.keyboard.press("Tab");
    const cell = await page.evaluate(() => document.activeElement?.getAttribute("data-cell") ?? null);
    if (cell) stops.push(cell);
    if (await page.evaluate(() => !!document.activeElement?.closest("[aria-labelledby='practice-links-heading']"))) break;
  }
  expect(stops).toEqual(["hard:17v2", "soft:A,9v2", "pairs:A,Av2", "surrender:17v2"]);

  const first = page.locator("[data-cell='hard:17v2']");
  await first.focus();
  await expect(page.getByRole("tooltip")).toContainText("Hard 17 vs dealer 2");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("[data-cell='hard:17v3']")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("[data-cell='hard:16v3']")).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.locator("[data-cell='hard:16vA']")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.locator("[data-cell='hard:16v2']")).toBeFocused();
  await page.keyboard.press("Control+End");
  const last = page.locator("[data-cell='hard:8vA']");
  await expect(last).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(last).toHaveAttribute("data-pinned", "");
  await expect(page.getByRole("tooltip")).toContainText("Hard 8 vs dealer ace");
  await expect(last).toHaveAttribute("aria-describedby", await page.getByRole("tooltip").getAttribute("id") ?? "");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(last).toBeFocused();

  // A pinned card stays the only card while the mouse wanders.
  await page.locator("[data-cell='soft:A,7v3']").click();
  await page.locator("[data-cell='soft:A,7v6']").hover();
  await page.waitForTimeout(300);
  await expect(page.getByRole("tooltip")).toHaveCount(1);
  await expect(page.getByRole("tooltip")).toContainText("Soft 18 (A,7) vs dealer 3");
});

test("N and Shift+N step through the index plays", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await page.goto("/reference/deviations/");
  await hydrated(page);
  await page.locator("[data-cell='hard:17v2']").focus();
  await page.keyboard.press("n");
  await expect(page.locator("[data-cell='hard:16v9']")).toBeFocused();
  await page.keyboard.press("n");
  await expect(page.locator("[data-cell='hard:16v10']")).toBeFocused();
  await page.keyboard.press("Shift+N");
  await expect(page.locator("[data-cell='hard:16v9']")).toBeFocused();
  // Stepping back from the first index play wraps to the last, in the surrender table.
  await page.keyboard.press("Shift+N");
  await expect(page.locator("[data-cell='surrender:14v10']")).toBeFocused();
});

test("the focus ring stands out against every cell fill", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/reference/");
    await hydrated(page);
    await page.locator("[data-cell='hard:12v3']").focus();
    await page.keyboard.press("ArrowLeft");
    const worst = await page.evaluate(() => {
      const parse = (value: string) => (value.match(/rgba?\([^)]*\)/g) ?? []).map((color) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number));
      const luminance = (rgb: number[]) => rgb.map((n) => { const c = n / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index], 0);
      const ratio = (a: number[], b: number[]) => { const [x, y] = [luminance(a), luminance(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const focused = document.activeElement as HTMLElement;
      const rings = parse(getComputedStyle(focused).boxShadow);
      // The Hit cell itself, its Hit neighbour and the Stand cell two along.
      const fills = ["hard:12v2", "hard:12v3", "hard:12v4", "hard:11v2"].map((key) => parse(getComputedStyle(document.querySelector(`[data-cell='${key}']`)!).backgroundColor)[0]);
      return Math.min(...fills.map((fill) => Math.max(...rings.map((ring) => ratio(ring, fill)))));
    });
    expect(worst, theme).toBeGreaterThanOrEqual(3);
  }
});

test("section links work before the page's script arrives", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chromium", "The section rail is for phones.");
  await prepare(page);
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>((resolve) => { releaseScripts = resolve; });
  await page.route(/\/_next\/.*\.js(?:\?.*)?$/, async (route) => { await scriptsReady; await route.continue(); });
  try {
    await page.goto("/reference/", { waitUntil: "commit" });
    const rail = page.getByRole("navigation", { name: "Chart sections" });
    await expect(rail.getByRole("link", { name: "Pairs" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Table rules:/ })).toBeDisabled();
    await expect(page.getByRole("radio", { name: "Basic strategy", exact: true })).toBeDisabled();
    await rail.getByRole("link", { name: "Pairs" }).click();
    await expect(page).toHaveURL(/#pairs$/);
    await expect.poll(async () => {
      const heading = await page.getByRole("heading", { level: 2, name: "Pairs" }).boundingBox();
      const bar = await page.getByRole("region", { name: "Table rules" }).boundingBox();
      return (heading?.y ?? 0) >= (bar?.y ?? Infinity) + (bar?.height ?? 0);
    }).toBe(true);
  } finally {
    releaseScripts();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("narrow screens keep tokens, chips and the view switch inside their boxes", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/reference/h17-chart/");
  await page.getByRole("heading", { level: 1 }).waitFor();
  const clipped = await page.locator("[data-testid^='h17-reference-rail'] tbody button").evaluateAll((cells) => cells.filter((cell) => cell.scrollWidth > cell.clientWidth).map((cell) => cell.getAttribute("data-cell")));
  expect(clipped).toEqual([]);
  for (const width of [320, 360, 375, 390, 400]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/reference/");
    const views = page.locator("fieldset").filter({ has: page.getByRole("radio", { name: "Basic strategy", exact: true }) });
    expect(await views.evaluate((group) => { const options = group.querySelector(":scope > div:last-child")!; return options.scrollWidth <= options.clientWidth; }), `view switch at ${width}px`).toBe(true);
  }

  for (const [width, height] of [[1024, 768], [800, 1024]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/reference/deviations/");
    await page.getByRole("heading", { level: 1 }).waitFor();
    const overflowing = await page.locator(".ref-cell .ref-chip").evaluateAll((chips) => chips.filter((chip) => chip.getBoundingClientRect().width > (chip.parentElement as HTMLElement).clientWidth).length);
    expect(overflowing, `${width}px`).toBe(0);
  }
});

test("the folded rules panel keeps labels clear of their options and Done in view", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  for (const [width, height] of [[320, 568], [360, 640]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/reference/");
    await hydrated(page);
    await page.getByRole("button", { name: /^Table rules/ }).click();
    const done = page.getByRole("button", { name: "Done" });
    await expect(done).toBeInViewport({ ratio: 1 });
    const rail = await page.getByRole("navigation", { name: "Chart sections" }).boundingBox();
    const doneBox = await done.boundingBox();
    expect(doneBox!.x + doneBox!.width, `Done inside the rail at ${width}px`).toBeLessThanOrEqual(rail!.x + rail!.width);
    await page.getByRole("button", { name: "More rules" }).click();
    const problems = await page.locator("#reference-rules fieldset").evaluateAll((groups) => groups.flatMap((group) => {
      const name = group.querySelector("legend")?.textContent ?? "?";
      const options = group.querySelector(":scope > div:last-child")!;
      const box = options.getBoundingClientRect();
      // The label row holds the legend; a visually hidden one is 1px wide.
      const label = group.querySelector(":scope > div:first-child")!.getBoundingClientRect();
      const issues: string[] = [];
      if (options.scrollWidth > options.clientWidth) issues.push(`${name}: options scroll`);
      if (box.right > document.documentElement.clientWidth) issues.push(`${name}: options leave the screen`);
      const overlaps = label.width > 1 && label.left < box.right && label.right > box.left && label.top < box.bottom && label.bottom > box.top;
      if (overlaps) issues.push(`${name}: label under its options`);
      return issues;
    }));
    expect(problems, `${width}px`).toEqual([]);
    await done.click();
    await expect(page.locator("#reference-rules")).toBeHidden();
    await expect(page.getByRole("button", { name: /^Table rules/ })).toBeFocused();
  }
});

test("the whole hard table is on a phone's first screen in both views", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/reference/", "/reference/deviations/"]) {
    await page.goto(path);
    await hydrated(page);
    const hard = await page.getByTestId("chart-rail-hard").boundingBox();
    const nav = await page.getByRole("navigation", { name: "Mobile navigation" }).boundingBox();
    expect(hard!.y + hard!.height, path).toBeLessThanOrEqual(nav!.y);
  }
});

test("saved rules load without hydration errors on every chart", async ({ page }) => {
  await prepare(page, { settings: { decks: 1, dealerHitsSoft17: false, doubleAfterSplit: false, surrender: "early" } });
  const problems: string[] = [];
  page.on("console", (message) => { if (/hydrat|did not match/i.test(message.text())) problems.push(message.text()); });
  page.on("pageerror", (error) => problems.push(error.message));
  for (const path of ["/reference/", "/reference/deviations/", "/reference/h17-chart/"]) {
    await page.goto(path);
    await page.getByRole("heading", { level: 1 }).waitFor();
    // Phones keep the rule controls folded away, so read the inputs directly.
    if (!path.includes("h17")) await expect(page.locator("input[aria-label='1 deck']")).toBeChecked();
    else await expect(page.locator("input[aria-label='Early vs 10 (early surrender, ES10)']")).toBeChecked();
  }
  expect(problems).toEqual([]);
});

test("every section heading keeps a stable analytics key", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  const known = new Set(["hard_totals", "soft_totals", "pairs", "surrender", "chart_key", "index_deviations", "index_play_ranking", "ev_methodology", "practice_links", "complete_h17_chart", "pair_splitting", "late_surrender", "early_surrender_vs_10"]);
  for (const path of ["/reference/", "/reference/deviations/", "/reference/h17-chart/"]) {
    await page.goto(path);
    await page.getByRole("heading", { level: 1 }).waitFor();
    const keys = await page.locator("main h2").evaluateAll((headings) => headings.map((heading) => heading.getAttribute("data-analytics-section")));
    for (const key of keys) expect(known.has(key ?? ""), `${path}: ${key}`).toBe(true);
  }
});

test("printing from the dark theme stays dark on light, on one page, with every ranked play", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page, { settings: { theme: "dark" } });
  await page.goto("/reference/deviations/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: /Show all \d+ ranked plays/ })).toBeVisible();
  await page.emulateMedia({ media: "print" });
  const onWhite = (selector: string) => page.locator(selector).first().evaluate((element) => {
    const rgb = getComputedStyle(element).color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const l = rgb.map((n) => { const c = n / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index], 0);
    return 1.05 / (l + 0.05);
  });
  expect(await onWhite("main h1")).toBeGreaterThanOrEqual(4.5);
  expect(await onWhite("[data-testid='chart-rail-hard'] tbody th")).toBeGreaterThanOrEqual(4.5);
  const ranked = page.getByRole("list", { name: "Index plays ranked by value" }).getByRole("listitem");
  const count = await ranked.count();
  expect(count).toBeGreaterThan(10);
  for (let index = 0; index < count; index++) await expect(ranked.nth(index)).toBeVisible();

  // The four tables fit one page on both paper sizes; the ranking starts a new one.
  await page.addStyleTag({ content: ".ref-ranking { display: none !important; }" });
  for (const format of ["Letter", "A4"]) {
    const pdf = await page.pdf({ format });
    expect((pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length, format).toBe(1);
  }
});

test("a drill's chart link opens the cell it names", async ({ page }) => {
  await prepare(page);
  // The Basic Strategy drill links a missed 2,2 vs 5 here; the pairs table sits below the first screen.
  await page.goto("/reference/?section=pairs&hand=2%2C2&dealer=5");
  const cell = page.locator("[data-cell='pairs:2,2v5']");
  await expect(cell).toBeFocused();
  await expect(cell).toHaveAttribute("data-pinned", "");
  await expect(cell).toBeInViewport();
  await page.goto("/reference/deviations/?section=surrender&hand=15&dealer=A");
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-cell"))).toBe("surrender:15vA");
});
