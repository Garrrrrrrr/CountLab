import { expect, test, type Page } from "@playwright/test";

const TEMPLATES_KEY = "countlab:account:guest:countlab:cvcx-templates:v1";

async function prepare(page: Page, seed?: Record<string, string>) {
  await page.addInitScript((values) => {
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    for (const [key, value] of Object.entries(values ?? {})) if (!sessionStorage.getItem(`seeded:${key}`)) { localStorage.setItem(key, value); sessionStorage.setItem(`seeded:${key}`, "1"); }
  }, seed);
}

async function open(page: Page, path = "/calculator/") {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Calculator", level: 1 })).toBeVisible();
}

/** Shows a step: a tab below 1280px, already on screen beside the results above it. */
async function show(page: Page, name: "Game" | "Bankroll" | "Ramp" | "Results") {
  const tab = page.getByRole("tab", { name, exact: true });
  if (await tab.isVisible()) await tab.click();
}

/** Picks an option of a segmented control, which is a named group of radios. */
async function choose(page: Page, group: string, option: string) {
  await page.getByRole("group", { name: group, exact: true }).getByText(option, { exact: true }).click();
}

const stored = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{"items":[]}').items as { id: string; name: string; config: { bankroll: number; baseBet: number } }[], TEMPLATES_KEY);
const units = (page: Page, range: string) => page.getByRole("spinbutton", { name: `Units at ${range}`, exact: true });

async function saveScenario(page: Page, name: string) {
  await page.getByRole("button", { name: "Save scenario" }).click();
  const dialog = page.getByRole("dialog", { name: "Save scenario" });
  await dialog.getByRole("textbox", { name: "Scenario name" }).fill(name);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: `Saved “${name}”` })).toBeVisible();
  return dialog;
}

const desktopOnly = (name: string) => test.skip(name !== "desktop-chromium", "Covered once on desktop.");
const phonesOnly = (name: string) => test.skip(name === "desktop-chromium", "Phone layout only.");

test("prices the example setup exactly as the Game & Bankroll Lab did", async ({ page }, testInfo) => {
  await prepare(page);
  await open(page);
  if (testInfo.project.name !== "desktop-chromium") {
    const bar = page.getByRole("region", { name: "Live results" });
    await expect(bar).toContainText("$30.95");
    await expect(bar).toContainText("±$586");
    await expect(bar).toContainText("1.10%");
  }
  await show(page, "Results");
  const results = page.getByRole("region", { name: "Results", exact: true });
  await expect(page.getByTestId("calc-verdict")).toHaveText(/^\$30\.95/);
  await expect(results).toContainText("$16,598");
  await expect(results).toContainText("35,807");
  await expect(results).toContainText("$27.93");
  await expect(results).toContainText("5.28");
});

test("the Kelly-weighted ramp changes only the ramp, shows its trade-off first, and can be undone", async ({ page }) => {
  await prepare(page);
  await open(page);
  await show(page, "Ramp");
  await page.getByRole("button", { name: "Suggest a ramp", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Suggest a ramp" });
  await expect(sheet.getByTestId("optimal-trade-off")).toContainText(/Its SCORE is \$[\d.]+ against \$[\d.]+ for your ramp, so it earns more than your ramp at the same risk\./);
  await sheet.getByRole("button", { name: "Use it with my $15 unit" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "1–12", exact: true })).not.toBeChecked();
  await expect(page.getByText("Kelly-weighted", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo: Built the Kelly-weighted ramp for this game." }).click();
  await expect(page.getByRole("radio", { name: "1–12", exact: true })).toBeChecked();
  await show(page, "Bankroll");
  await expect(page.getByLabel("Betting unit", { exact: true })).toHaveValue("15");
});

test("a suggested spread applies its ramp and unit together, with Undo", async ({ page }) => {
  await prepare(page);
  await open(page);
  await show(page, "Ramp");
  await page.getByRole("button", { name: "Suggest a ramp", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Suggest a ramp" });
  await sheet.getByLabel("Hourly goal", { exact: true }).fill("20");
  const title = await sheet.getByRole("status").locator("p.font-semibold").first().textContent();
  const [, spread, unit] = title!.match(/^(1–\d+) spread with a \$(\d+) unit$/)!;
  await sheet.getByRole("listitem").filter({ hasText: "Recommended" }).getByRole("button", { name: /^Use / }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("radio", { name: spread, exact: true })).toBeChecked();
  await show(page, "Bankroll");
  await expect(page.getByLabel("Betting unit", { exact: true })).toHaveValue(unit);
  await show(page, "Ramp");
  await page.getByRole("button", { name: /^Undo: Now betting/ }).click();
  await show(page, "Bankroll");
  await expect(page.getByLabel("Betting unit", { exact: true })).toHaveValue("15");
});

test("arrowing through the presets never touches the unit or offers Undo", async ({ page }) => {
  await prepare(page);
  await open(page);
  await show(page, "Ramp");
  await page.getByRole("radio", { name: "1–12", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("radio", { name: "1–8", exact: true })).toBeChecked();
  await expect(page.getByRole("button", { name: /^Undo/ })).toHaveCount(0);
  await show(page, "Bankroll");
  await expect(page.getByLabel("Betting unit", { exact: true })).toHaveValue("15");
});

test("comparing presets after replacing a custom ramp keeps the way back to it", async ({ page }) => {
  await prepare(page);
  await open(page);
  await show(page, "Ramp");
  await units(page, "+4 and up").fill("16");
  await choose(page, "Start from a preset", "1–4");
  await expect(units(page, "+4 and up")).toHaveValue("4");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "1–8", exact: true })).toBeChecked();
  await choose(page, "Start from a preset", "1–12");
  await page.getByRole("button", { name: "Undo: Switched to the 1–12 ramp." }).click();
  await expect(units(page, "+4 and up")).toHaveValue("16");
  await expect(page.getByText("Custom", { exact: true })).toBeVisible();
});

test("editing a step reprices the setup, and a new step takes focus", async ({ page }, testInfo) => {
  await prepare(page);
  await open(page);
  await show(page, "Ramp");
  const before = await page.getByRole("region", { name: "Live results" }).or(page.getByTestId("calc-verdict")).first().textContent();
  await units(page, "+4 and up").fill("16");
  await expect(page.locator("#ramp")).toContainText("Custom ramp (1–16)");
  await expect(page.getByRole("region", { name: "Live results" }).or(page.getByTestId("calc-verdict")).first()).not.toHaveText(before!);
  await page.getByRole("button", { name: "Increase Units at +4 and up" }).click();
  await expect(units(page, "+4 and up")).toHaveValue("17");
  await page.getByRole("button", { name: "Add a step" }).click();
  await expect(units(page, "+5 and up")).toBeFocused();
  await expect(units(page, "+5 and up")).toHaveValue("18");
  if (testInfo.project.name === "desktop-chromium") await expect(page.getByTestId("calc-verdict")).not.toHaveText(/^\$30\.95/);
});

test("moving a step's start from the keyboard keeps focus on it", async ({ page }) => {
  await prepare(page);
  await open(page);
  await show(page, "Ramp");
  const start = page.getByRole("combobox", { name: /^Step \d+ starts at$/ }).last();
  const before = Number(await start.inputValue());
  await start.focus();
  await page.keyboard.press("ArrowDown");
  await expect(start).toBeFocused();
  await expect(start).toHaveValue(String(before + 1));
});

test("sitting out low counts shows in the steps and locks those counts in the table", async ({ page }) => {
  await prepare(page);
  await open(page);
  await show(page, "Ramp");
  await page.getByLabel("When you play", { exact: true }).selectOption("1");
  await expect(page.getByText("sitting out (set by When you play)")).toBeVisible();
  await choose(page, "Edit as", "Every count");
  await expect(page.getByLabel("Hands at true count 0", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Bet at true count 0", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Bet at true count +1", { exact: true })).toHaveValue("30");
  await page.getByLabel("Bet at true count +1", { exact: true }).fill("45");
  await expect(page.locator("#ramp")).toContainText("Custom ramp");
});

test("a ramp with no bets says so instead of showing certain ruin", async ({ page }) => {
  await prepare(page);
  await open(page);
  await show(page, "Ramp");
  await page.getByLabel("When you play", { exact: true }).selectOption("3");
  await units(page, "+3 only").or(units(page, "+3")).first().fill("0");
  await units(page, "+4 and up").fill("0");
  await show(page, "Results");
  const results = page.getByRole("region", { name: "Results", exact: true });
  await expect(results.getByText("You are not betting at any count")).toBeVisible();
  await expect(results).not.toContainText("100.00%");
  await expect(results.getByRole("button", { name: "Log a session with this game" })).toBeDisabled();
});

test("estimated rules are marked, explained, and reset in one step", async ({ page }) => {
  await prepare(page);
  await open(page);
  await show(page, "Game");
  await page.locator("summary").filter({ hasText: "Change rules" }).click();
  await choose(page, "Dealer on soft 17", "Stands (S17)");
  await choose(page, "Blackjack pays", "6:5");
  const callout = page.getByText("Estimated results").locator("..");
  await expect(callout).toContainText("Dealer stands on soft 17: +0.22 points");
  await expect(callout).toContainText("Blackjack pays 6:5: −1.39 points");
  await page.getByRole("button", { name: "Reset to simulated rules" }).first().click();
  await expect(page.getByText("Simulated exactly")).toBeVisible();
});

test("a scenario saves, updates in place, copies, renames and deletes", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await open(page);
  await (await saveScenario(page, "A")).getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Scenario: A", { exact: true })).toBeVisible();
  const [saved] = await stored(page);

  await page.getByLabel("Bankroll", { exact: true }).fill("30000");
  await expect(page.getByText("Scenario: A · edited")).toBeVisible();
  await page.getByRole("button", { name: "Save scenario" }).click();
  let dialog = page.getByRole("dialog", { name: "Save scenario" });
  await dialog.getByRole("button", { name: "Update “A”" }).click();
  await dialog.getByRole("button", { name: "Done" }).click();
  let items = await stored(page);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ id: saved.id, name: "A", config: { bankroll: 30000 } });

  await page.getByRole("button", { name: "Save scenario" }).click();
  dialog = page.getByRole("dialog", { name: "Save scenario" });
  await dialog.getByRole("button", { name: "Save as new" }).click();
  await expect(dialog.getByRole("heading", { name: "Saved “A (2)”" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Log a session with this game" })).toHaveAttribute("href", /\/journal\/?\?scenario=/);
  await dialog.getByRole("button", { name: "Done" }).click();
  items = await stored(page);
  expect(items.map((item) => item.name)).toEqual(["A (2)", "A"]);

  await page.getByRole("button", { name: /^Scenarios/ }).click();
  const sheet = page.getByRole("dialog", { name: "Scenarios and venues" });
  await sheet.getByRole("button", { name: "Rename A (2)" }).click();
  await sheet.getByLabel("New name for A (2)").fill("Weekend");
  await sheet.getByRole("button", { name: "Save name" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Renamed to “Weekend”.");
  expect((await stored(page)).map((item) => item.name)).toEqual(["Weekend", "A"]);
  await expect(page.getByText("Scenario: Weekend", { exact: true })).toBeVisible();

  const remove = sheet.getByRole("button", { name: "Delete Weekend" });
  await remove.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Delete scenario?" })).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await expect(remove).toBeFocused();
  await remove.click();
  await page.getByRole("dialog", { name: "Delete scenario?" }).getByRole("button", { name: "Delete" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Deleted “Weekend”.");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Scenarios/ })).toHaveAccessibleName(/1 saved/);
  await expect(page.getByText("Unsaved setup")).toBeVisible();
});

test("saved scenarios compare side by side with the current setup", async ({ page }) => {
  await prepare(page);
  await open(page);
  await saveScenario(page, "Six deck");
  // The saved count badge once pushed the header past a 320px screen, which zoomed the page out and misplaced taps.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByRole("dialog", { name: "Save scenario" }).getByRole("button", { name: "Done" }).click();
  await show(page, "Game");
  await choose(page, "Decks", "8");
  await show(page, "Results");
  await choose(page, "Compare with", "Saved");
  const table = page.getByRole("table", { name: "Scenarios side by side" });
  await expect(table).toContainText("Six deck (edited)");
  await expect(table).toContainText("8D · 75%");
  await expect(table).toContainText("6D · 75%");
  await expect(table.getByRole("row", { name: /Win an hour/ })).toContainText("$30.95");
});

test("other games rank by SCORE and one can be switched to, with Undo", async ({ page }) => {
  await prepare(page);
  await open(page);
  await show(page, "Results");
  await expect(page.locator("#compare")).toContainText("Your game ranks #16 of 20.");
  await page.getByRole("button", { name: "Use 6 decks, 5.25 dealt" }).click();
  await expect(page.locator("#compare")).toContainText("Your game ranks #9 of 20.");
  await page.getByRole("button", { name: "Undo: Switched to 6 decks, 5.25 dealt." }).click();
  await expect(page.locator("#compare")).toContainText("Your game ranks #16 of 20.");
});

test("the trip outlook follows the trip length", async ({ page }) => {
  await prepare(page);
  await open(page);
  await show(page, "Results");
  const trip = page.locator("#trip");
  await expect(trip).toContainText("+$3,095");
  await trip.getByRole("button", { name: "8h" }).click();
  await expect(trip).toContainText("+$248");
  await expect(trip.getByRole("img", { name: /^Trip results: 2 in 3 trips between/ })).toBeVisible();
  await trip.getByLabel("Chance of losing at least", { exact: true }).fill("0");
  await expect(trip).toContainText(/Chance of a loss\s*\d/);
});

test("venues save and delete, and Escape closes only the confirmation", async ({ page }) => {
  await prepare(page);
  await open(page);
  await page.getByRole("button", { name: /^Scenarios/ }).click();
  const sheet = page.getByRole("dialog", { name: "Scenarios and venues" });
  await sheet.getByRole("tab", { name: /Venues/ }).click();
  await sheet.getByRole("textbox", { name: "Venue name" }).fill("Downtown");
  await sheet.getByRole("button", { name: "Save venue" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Saved venue “Downtown”.");
  const remove = sheet.getByRole("button", { name: "Delete venue Downtown" });
  await remove.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Delete venue?" })).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await remove.click();
  await page.getByRole("dialog", { name: "Delete venue?" }).getByRole("button", { name: "Delete" }).click();
  await expect(sheet.getByText("No venues yet")).toBeVisible();
});

test("a legacy scenario opened by link loads unedited, with its hands per count", async ({ page }, testInfo) => {
  const legacy = {
    id: "legacy-1", name: "Legacy", createdAt: "2025-01-01T00:00:00.000Z",
    config: {
      decks: 6, dealt: 4.5, bankroll: 20000, handsPerHour: 90, hours: 50, targetRisk: 0.05, maxSpread: 8, wongInAt: null,
      rampName: "1-8", ramp: [{ trueCount: -8, units: 1 }, { trueCount: 1, units: 2 }, { trueCount: 2, units: 4 }, { trueCount: 3, units: 6 }, { trueCount: 4, units: 8 }],
      chipIncrement: 0.5, baseBet: 25, playerHands: 1, extraHandsAt: 3, highCountHands: 2,
      dealerHitsSoft17: true, doubleAfterSplit: true, resplitAces: true, lateSurrender: true, europeanNoHoleCard: false, blackjackPayout: 1.5,
    },
  };
  await prepare(page, { [TEMPLATES_KEY]: JSON.stringify({ version: 1, items: [legacy] }) });
  await open(page, "/calculator/?scenario=legacy-1");
  await expect(page.getByText("Loaded “Legacy”.")).toBeVisible();
  await expect(page.getByText("Scenario: Legacy", { exact: true })).toBeVisible();
  await expect(page.getByText(/· edited/)).toHaveCount(0);
  await expect(page).not.toHaveURL(/scenario=/);
  if (testInfo.project.name !== "desktop-chromium") await expect(page.getByRole("tab", { name: "Results" })).toHaveAttribute("aria-selected", "true");
  await show(page, "Ramp");
  await expect(units(page, "+4 and up")).toHaveValue("8");
  await expect(page.getByRole("radio", { name: "2 hands at +3", exact: true })).toBeChecked();
  await show(page, "Bankroll");
  await expect(page.getByLabel("Betting unit", { exact: true })).toHaveValue("25");
});

test("a scenario link that isn't saved here keeps the draft and points to the library", async ({ page }) => {
  await prepare(page);
  await open(page);
  await show(page, "Bankroll");
  await page.getByLabel("Bankroll", { exact: true }).fill("12345");
  await page.waitForTimeout(400);
  await open(page, "/calculator/?scenario=missing");
  await expect(page.getByText("That scenario is not saved on this account or device.")).toBeVisible();
  await expect(page).not.toHaveURL(/scenario=/);
  await show(page, "Bankroll");
  await expect(page.getByLabel("Bankroll", { exact: true })).toHaveValue("12345");
  await page.getByRole("button", { name: "Open Scenarios" }).click();
  await expect(page.getByRole("dialog", { name: "Scenarios and venues" })).toBeVisible();
});

test("working inputs survive leaving the page", async ({ page }) => {
  await prepare(page);
  await open(page);
  await show(page, "Bankroll");
  await page.getByLabel("Bankroll", { exact: true }).fill("12345");
  await page.waitForTimeout(400);
  await page.goto("/progress/");
  await open(page);
  await show(page, "Bankroll");
  await expect(page.getByLabel("Bankroll", { exact: true })).toHaveValue("12345");
  await expect(page.getByText("Unsaved setup")).toBeVisible();
});

test("Log a session saves the game once and opens the Journal with it", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await open(page);
  for (let click = 0; click < 2; click++) {
    await page.getByRole("button", { name: "Log a session with this game" }).click();
    await expect(page).toHaveURL(/\/journal\/?\?scenario=/);
    const items = await stored(page);
    expect(items).toHaveLength(1);
    expect(page.url()).toContain(encodeURIComponent(items[0].id));
    await open(page);
    await expect(page.getByText("Scenario: Game from Calculator", { exact: true })).toBeVisible();
  }
});

test("the Journal hand-off explains a rule the Journal can't model", async ({ page }) => {
  await prepare(page);
  await open(page);
  await show(page, "Game");
  await page.locator("summary").filter({ hasText: "Change rules" }).click();
  await choose(page, "Dealer hole card", "No hole card");
  await show(page, "Results");
  const results = page.getByRole("region", { name: "Results", exact: true });
  await expect(results.getByRole("button", { name: "Log a session with this game" })).toBeDisabled();
  await expect(results.getByText(/The Journal doesn't model the no-hole-card/)).toBeVisible();
  await results.getByRole("button", { name: "Reset to simulated rules" }).click();
  await expect(results.getByRole("button", { name: "Log a session with this game" })).toBeEnabled();
});

test("phones: every tab fits the screen, and the results bar expands and leads to the results", async ({ page }, testInfo) => {
  phonesOnly(testInfo.project.name);
  await prepare(page);
  await open(page);
  const check = async (label: string) => {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth), { message: label }).toBeLessThanOrEqual(0);
    const clipped = await page.locator("main button:visible, main input:visible, main select:visible").evaluateAll((nodes) => nodes.filter((node) => {
      const box = node.getBoundingClientRect();
      return !node.closest(".overflow-x-auto, .sr-only") && (box.left < -1 || box.right > innerWidth + 1);
    }).map((node) => node.getAttribute("aria-label") || node.textContent?.trim()));
    expect(clipped, label).toEqual([]);
  };
  for (const tab of ["Game", "Bankroll", "Ramp", "Results"] as const) {
    await show(page, tab);
    if (tab === "Game") await page.locator("summary").filter({ hasText: "Change rules" }).click();
    await check(tab);
  }
  await show(page, "Ramp");
  await choose(page, "Edit as", "Every count");
  await check("Every count");
  const table = page.getByRole("table", { name: "Bet and hands at every true count" });
  expect(await table.evaluate((node) => node.scrollWidth <= node.parentElement!.clientWidth + 1)).toBe(true);

  const bar = page.getByRole("region", { name: "Live results" });
  await expect(bar).toBeVisible();
  const box = (await bar.boundingBox())!;
  const tabBar = (await page.getByRole("navigation", { name: "Main" }).last().boundingBox())!;
  expect(Math.abs(box.y + box.height - tabBar.y)).toBeLessThanOrEqual(2);
  await bar.getByRole("button", { expanded: false }).first().click();
  await expect(bar).toContainText("SCORE");
  await bar.getByRole("button", { name: /All results/ }).click();
  await expect(page.getByRole("tab", { name: "Results" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Live results" })).toHaveCount(0);
});

test("desktop: inputs on the left, results stay in view while editing", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await open(page);
  await expect(page.getByRole("tablist", { name: "Calculator steps" })).toBeHidden();
  await expect(page.getByRole("region", { name: "Live results" })).toBeHidden();
  await page.locator("#trip").scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "Results", exact: true })).toBeInViewport();
  const results = (await page.locator("#results").boundingBox())!;
  const game = (await page.locator("#ramp").boundingBox())!;
  expect(results.x).toBeGreaterThan(game.x + game.width);
});

test("hash links pick a tab on phones and scroll on desktop", async ({ page }, testInfo) => {
  await prepare(page);
  await open(page, "/calculator/#ramp");
  if (testInfo.project.name === "desktop-chromium") {
    await expect(page.getByRole("heading", { name: "Bet ramp", exact: true })).toBeInViewport();
    return;
  }
  await expect(page.getByRole("tab", { name: "Ramp" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Results" }).click();
  await expect(page).toHaveURL(/\/calculator\/#results$/);
});

test("printing shows every step and the results", async ({ page }) => {
  await prepare(page);
  await open(page);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("calc-verdict")).toBeVisible();
  for (const name of ["The game", "Bankroll and unit", "Bet ramp", "What happens on your trip", "Results"]) await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Live results" })).toBeHidden();
});

test("inputs keep their analytics names", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await open(page);
  await page.locator("summary").filter({ hasText: "Change rules" }).click();
  const fields = await page.locator("[data-analytics-field], input[name]").evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute("data-analytics-field") ?? node.getAttribute("name")))]);
  expect(fields).toEqual(expect.arrayContaining([
    "available_bankroll", "unit_amount", "rounds_per_hour", "hours_played", "target_risk_of_ruin", "number_of_decks", "penetration",
    "play_variation", "strategy", "blackjack_payout", "double_rule", "dealer_hits_soft_17", "preset", "enter_the_game_at",
    "ramp_step_units", "ramp_step_start",
  ]));
  const sections = await page.locator("details").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-analytics-section")));
  expect(sections).toEqual(expect.arrayContaining(["table_rules", "scope_and_method"]));
});

test("a blank or out-of-range number says why and leaves the results alone", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await open(page);
  await show(page, "Game");
  const pace = page.getByLabel("Rounds per hour", { exact: true });
  const before = await page.getByTestId("calc-verdict").textContent();
  await pace.fill("0");
  await expect(page.getByText("Must be at least 1. The results still use the last valid value.")).toBeVisible();
  await expect(pace).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("calc-verdict")).toHaveText(before!);
  await pace.blur();
  await expect(pace).toHaveValue("100");
});

test("a share link opens the same setup", async ({ page, context }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await prepare(page);
  await open(page);
  await show(page, "Bankroll");
  await page.getByLabel("Bankroll", { exact: true }).fill("41000");
  await page.getByRole("button", { name: "Share a link to this setup" }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/calculator\/\?setup=[\w-]+$/);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(link);
  await expect(page.getByText("Opened a shared setup.")).toBeVisible();
  await show(page, "Bankroll");
  await expect(page.getByLabel("Bankroll", { exact: true })).toHaveValue("41000");
  await expect(page).not.toHaveURL(/setup=/);
});

test("Compare ranks one-rule changes to the current game", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await open(page);
  await show(page, "Results");
  await choose(page, "Compare with", "Rules");
  const list = page.getByRole("list", { name: "Rule changes ranked by SCORE" });
  await expect(list.getByRole("listitem").filter({ hasText: "Your game" })).toContainText("Yours");
  await expect(list.getByRole("listitem").filter({ hasText: "Early surrender vs 10" })).toBeVisible();
  await list.getByRole("button", { name: "Use early surrender vs 10" }).click();
  await show(page, "Game");
  await page.getByText("Change rules", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Early vs 10" })).toBeChecked();
});

test("leaving a shoe played from the top charges the player's own time between shoes", async ({ page }) => {
  await prepare(page);
  await open(page);
  await show(page, "Ramp");
  const minutes = page.getByLabel("Time to find a fresh shoe");
  await expect(minutes).toHaveCount(0);
  await page.getByLabel("When you leave").selectOption("-1");
  await expect(minutes).toHaveValue("5");
  await expect(page.getByText(/You play about [\d.]+ rounds a shoe, and each move to a fresh shoe counts as 5 minutes/)).toBeVisible();
  await show(page, "Results");
  const trip = page.locator("#trip");
  const charged = await trip.textContent();
  await show(page, "Ramp");
  await minutes.fill("0");
  await expect(page.getByText(/counts as 0 minutes without play/)).toBeVisible();
  await show(page, "Results");
  await expect(trip).not.toHaveText(charged!);
  // Kept with the working draft, and hidden for a back-counter, who stays to watch.
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Calculator", level: 1 })).toBeVisible();
  await show(page, "Ramp");
  await expect(minutes).toHaveValue("0");
  await page.getByLabel("When you play").selectOption("2");
  await expect(minutes).toHaveCount(0);
});
