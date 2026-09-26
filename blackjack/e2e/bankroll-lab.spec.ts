import { expect, test, type Page } from "@playwright/test";

const TEMPLATES_KEY = "countlab:account:guest:countlab:cvcx-templates:v1";
const SIMULATIONS_KEY = "countlab:account:guest:countlab:simulation-templates:v1";

async function prepare(page: Page, seed?: Record<string, string>) {
  await page.addInitScript((values) => {
    localStorage.setItem("countlab:guest", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
    for (const [key, value] of Object.entries(values ?? {})) if (!sessionStorage.getItem(`seeded:${key}`)) { localStorage.setItem(key, value); sessionStorage.setItem(`seeded:${key}`, "1"); }
  }, seed);
}

async function openLab(page: Page, path = "/cvcx/") {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Game & Bankroll Lab" })).toBeVisible();
}

/** Shows a step: a tab below 1280px, already on screen beside the results above it. */
async function show(page: Page, name: "Game" | "Bankroll" | "Bet ramp" | "Results") {
  const tab = page.getByRole("tab", { name, exact: true });
  if (await tab.count()) await tab.click();
}

const stored = (page: Page, key: string) => page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) ?? '{"items":[]}').items as { id: string; name: string; config: { bankroll: number } }[], key);

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

test("Enter never presses a Lab action, even while Undo and a unit suggestion are on screen", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await openLab(page);
  await page.getByRole("button", { name: "Build optimal ramp" }).click();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Use a \$\d+ betting unit$/ })).toBeVisible();
  await page.getByRole("heading", { name: "Game & Bankroll Lab" }).click();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Betting unit", { exact: true })).toHaveValue("15");
  await expect(page.getByText("Optimal", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
});

test("the optimal ramp changes only the ramp and can be undone", async ({ page }) => {
  await prepare(page);
  await openLab(page);
  await show(page, "Bet ramp");
  await page.getByRole("button", { name: "Build optimal ramp" }).click();
  await expect(page.getByRole("radio", { name: "1–12 spread" })).not.toBeChecked();
  await expect(page.getByLabel("Betting unit", { exact: true })).toHaveValue("15");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("radio", { name: "1–12 spread" })).toBeChecked();
});

test("a direct edit retires the Undo offer and survives", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await openLab(page);
  await page.getByRole("button", { name: "Build optimal ramp" }).click();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  await page.getByLabel("Available bankroll", { exact: true }).fill("30000");
  await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
  await expect(page.getByLabel("Available bankroll", { exact: true })).toHaveValue("30000");
  await expect(page.getByText("Optimal", { exact: true })).toBeVisible();
});

test("arrowing through the ramp presets never touches the betting unit", async ({ page }) => {
  await prepare(page);
  await openLab(page);
  await show(page, "Bet ramp");
  await page.getByRole("radio", { name: "1–12 spread" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("radio", { name: "1–8 spread" })).toBeChecked();
  await expect(page.getByLabel("Betting unit", { exact: true })).toHaveValue("15");
  await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
});

test("Undo is a Tab away from the change, answers Ctrl+Z, and never times out", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await page.clock.install();
  await prepare(page);
  await openLab(page);
  const preset = page.getByRole("radio", { name: "1–12 spread" });
  await page.getByRole("button", { name: "Build optimal ramp" }).focus();
  await page.keyboard.press("Enter");
  await expect(preset).not.toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Undo: Built the optimal ramp for this game." })).toBeFocused();
  await page.clock.fastForward(60_000);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(preset).toBeChecked();
  await expect(page.getByRole("button", { name: /^Undo/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Build optimal ramp" }).click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(preset).toBeChecked();

  // Start over removes its own button, so focus moves to its Undo instead of the page.
  await page.getByLabel("Available bankroll", { exact: true }).fill("30000");
  await page.getByRole("button", { name: "Start over" }).focus();
  await page.keyboard.press("Enter");
  const undoStart = page.getByRole("button", { name: "Undo: Started over with the example setup." });
  await expect(undoStart).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Available bankroll", { exact: true })).toHaveValue("30000");
});

test("comparing presets after replacing a custom ramp keeps the way back to it", async ({ page }) => {
  await prepare(page);
  await openLab(page);
  await show(page, "Bet ramp");
  await page.getByLabel("Units at +4 and up", { exact: true }).fill("16");
  await page.getByRole("radio", { name: "1–4 spread" }).check();
  await expect(page.getByLabel("Units at +4 and up", { exact: true })).toHaveValue("4");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "1–8 spread" })).toBeChecked();
  await page.getByRole("radio", { name: "1–12 spread" }).check();
  await page.getByRole("button", { name: "Undo: Switched to the 1–12 ramp." }).click();
  await expect(page.getByLabel("Units at +4 and up", { exact: true })).toHaveValue("16");
  await expect(page.getByText("Custom", { exact: true })).toBeVisible();
});

test("moving a step's start from the keyboard keeps focus on it", async ({ page }) => {
  await prepare(page);
  await openLab(page);
  await show(page, "Bet ramp");
  const start = page.getByRole("combobox", { name: /^Step \d+ starts at$/ }).last();
  const before = Number(await start.inputValue());
  await start.focus();
  await page.keyboard.press("ArrowDown");
  await expect(start).toBeFocused();
  await expect(start).toHaveValue(String(before + 1));
  await page.keyboard.press("ArrowDown");
  await expect(start).toBeFocused();
  await expect(start).toHaveValue(String(before + 2));
});

test("every choice group is named by its question", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await openLab(page);
  await page.locator("summary").filter({ hasText: "Change rules" }).click();
  await page.locator("summary").filter({ hasText: "Compare with other games" }).click();
  for (const name of ["Decks", "Penetration", "How you play hands", "Dealer on soft 17", "Blackjack pays", "Doubling allowed on", "Dealer hole card", "Start from", "Edit as", "Price each game with"]) {
    await expect(page.getByRole("group", { name, exact: true }), name).toHaveCount(1);
  }
  await expect(page.getByRole("group", { name: "Blackjack pays" }).getByRole("radio", { name: "6:5" })).toBeVisible();
});

test("the optimal ramp shows its trade-off before it's built", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await openLab(page);
  const tradeOff = page.getByTestId("optimal-trade-off");
  await expect(tradeOff).toContainText(/Its SCORE is \$\d+ against \$\d+ for your ramp, so it earns less than your ramp at the same risk\./);
  await page.getByRole("button", { name: "Build optimal ramp" }).click();
  await expect(tradeOff).toHaveCount(0);
});

test("editing a step reprices the setup", async ({ page }) => {
  await prepare(page);
  await openLab(page);
  await show(page, "Bet ramp");
  const verdict = page.getByTestId("lab-verdict");
  const before = await verdict.textContent();
  await page.getByLabel("Units at +4 and up", { exact: true }).fill("16");
  await expect(page.locator("#ramp")).toContainText("1–16");
  await expect(verdict).not.toHaveText(before!);
  await page.getByRole("button", { name: "Add a step" }).click();
  await expect(page.getByLabel("Units at +5 and up", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Units at +5 and up", { exact: true })).toHaveValue("17");
});

test("sitting out low counts shows in the steps and locks those counts in the table", async ({ page }) => {
  await prepare(page);
  await openLab(page);
  await show(page, "Bet ramp");
  await page.getByLabel("When you play", { exact: true }).selectOption("1");
  await expect(page.getByText("sitting out (set by When you play)")).toBeVisible();
  await page.getByRole("radio", { name: "Every count" }).check();
  await expect(page.getByLabel("Bet at true count 0", { exact: true }).filter({ visible: true })).toBeDisabled();
  await expect(page.getByText("Sitting out: When you play starts at +1.").filter({ visible: true }).first()).toBeVisible();
});

test("a ramp with no bets says so instead of showing certain ruin", async ({ page }) => {
  await prepare(page);
  await openLab(page);
  await show(page, "Bet ramp");
  await page.getByLabel("When you play", { exact: true }).selectOption("3");
  await page.getByLabel("Units at +3", { exact: true }).fill("0");
  await page.getByLabel("Units at +4 and up", { exact: true }).fill("0");
  await show(page, "Results");
  const results = page.getByRole("region", { name: "Results" });
  await expect(results.getByText("You aren't betting at any count")).toBeVisible();
  await expect(results).not.toContainText("100.00%");
  await expect(results.getByRole("button", { name: "Simulate this game" })).toBeDisabled();
});

test("venues save and delete, and Escape closes only the confirmation", async ({ page }) => {
  await prepare(page);
  await openLab(page);
  await page.getByRole("button", { name: /^Scenarios/ }).click();
  const sheet = page.getByRole("dialog", { name: "Scenarios & venues" });
  await sheet.getByRole("tab", { name: /Venues/ }).click();
  await sheet.getByRole("textbox", { name: "Venue name" }).fill("Downtown");
  await sheet.getByRole("button", { name: "Save venue" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Saved venue “Downtown”.");
  const remove = sheet.getByRole("button", { name: "Delete venue Downtown" });
  await remove.click();
  const confirm = page.getByRole("dialog", { name: "Delete venue?" });
  await expect(confirm).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await expect(remove).toBeFocused();
  await remove.click();
  await page.getByRole("dialog", { name: "Delete venue?" }).getByRole("button", { name: "Delete" }).click();
  await expect(sheet.getByText("No venues yet")).toBeVisible();
});

test("a venue saved in the Lab fills the Journal and restores its play mode", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await openLab(page);
  await page.getByRole("radio", { name: "Basic strategy only" }).check();
  await page.getByRole("button", { name: /^Scenarios/ }).click();
  let sheet = page.getByRole("dialog", { name: "Scenarios & venues" });
  await sheet.getByRole("tab", { name: /Venues/ }).click();
  await sheet.getByRole("textbox", { name: "Venue name" }).fill("Riverside");
  await sheet.getByRole("button", { name: "Save venue" }).click();
  await page.keyboard.press("Escape");
  await page.goto("/journal/");
  await expect(page.locator("select option", { hasText: "Riverside" }).first()).toBeAttached();
  await openLab(page);
  await page.getByRole("radio", { name: "Hi-Lo with indices" }).check();
  await page.getByRole("button", { name: /^Scenarios/ }).click();
  sheet = page.getByRole("dialog", { name: "Scenarios & venues" });
  await sheet.getByRole("tab", { name: /Venues/ }).click();
  await sheet.getByRole("button", { name: "Load venue Riverside" }).click();
  await expect(page.getByRole("radio", { name: "Basic strategy only" })).toBeChecked();
});

test("a scenario can be saved, edited, updated in place and copied", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await openLab(page);
  await (await saveScenario(page, "A")).getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Scenario: A", { exact: true })).toBeVisible();
  const [saved] = await stored(page, TEMPLATES_KEY);

  await page.getByLabel("Available bankroll", { exact: true }).fill("30000");
  await expect(page.getByText("Scenario: A · edited")).toBeVisible();
  await page.getByRole("button", { name: "Save scenario" }).click();
  let dialog = page.getByRole("dialog", { name: "Save scenario" });
  await dialog.getByRole("button", { name: "Update “A”" }).click();
  await dialog.getByRole("button", { name: "Done" }).click();
  let items = await stored(page, TEMPLATES_KEY);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ id: saved.id, name: "A", config: { bankroll: 30000 } });
  await expect(page.getByText("Scenario: A", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Save scenario" }).click();
  dialog = page.getByRole("dialog", { name: "Save scenario" });
  await dialog.getByRole("button", { name: "Save as new" }).click();
  await expect(dialog.getByRole("heading", { name: "Saved “A (2)”" })).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  items = await stored(page, TEMPLATES_KEY);
  expect(items.map((item) => item.name)).toEqual(["A (2)", "A"]);

  // Deleting from the library: Escape backs out of the confirmation only.
  await page.getByRole("button", { name: /^Scenarios/ }).click();
  const sheet = page.getByRole("dialog", { name: "Scenarios & venues" });
  const remove = sheet.getByRole("button", { name: "Delete A (2)" });
  await remove.click();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeVisible();
  await expect(remove).toBeFocused();
  await remove.click();
  await page.getByRole("dialog", { name: "Delete scenario?" }).getByRole("button", { name: "Delete" }).click();
  await expect(sheet.getByRole("listitem").filter({ hasText: "A (2)" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Scenarios/ })).toHaveAccessibleName(/1 saved/);
  await expect(page.getByText("Unsaved setup")).toBeVisible();
});

test("a scenario link that isn't saved here points to the library", async ({ page }) => {
  await prepare(page);
  await openLab(page, "/cvcx/?scenario=missing");
  await expect(page.getByText("That scenario isn't saved on this account or device.")).toBeVisible();
  await page.getByRole("button", { name: "Open Scenarios" }).click();
  await expect(page.getByRole("dialog", { name: "Scenarios & venues" })).toBeVisible();
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
  await openLab(page, "/cvcx/?scenario=legacy-1");
  await expect(page.getByText("Loaded “Legacy”.")).toBeVisible();
  await expect(page.getByText("Scenario: Legacy", { exact: true })).toBeVisible();
  await expect(page.getByText(/· edited/)).toHaveCount(0);
  if (testInfo.project.name !== "desktop-chromium") await expect(page.getByRole("tab", { name: "Results" })).toHaveAttribute("aria-selected", "true");
  await show(page, "Bet ramp");
  await expect(page.getByLabel("Units at +4 and up", { exact: true })).toHaveValue("8");
  await expect(page.getByRole("radio", { name: "2 hands at +3", exact: true })).toBeChecked();
  await expect(page.getByLabel("Betting unit", { exact: true })).toHaveValue("25");
});

test("Simulate reuses an unchanged scenario and never piles up copies", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await openLab(page);
  await (await saveScenario(page, "Trip")).getByRole("button", { name: "Done" }).click();
  for (let click = 0; click < 2; click++) {
    await page.getByRole("button", { name: "Simulate this game" }).click();
    await expect(page).toHaveURL(/\/simulation\/?\?scenario=/);
    expect(await stored(page, TEMPLATES_KEY)).toHaveLength(1);
    expect(await stored(page, SIMULATIONS_KEY)).toHaveLength(1);
    await openLab(page);
    await expect(page.getByText("Scenario: Trip", { exact: true })).toBeVisible();
  }
});

test("Simulate explains, in the Lab's words, a rule the simulator can't model", async ({ page }) => {
  await prepare(page);
  await openLab(page);
  await show(page, "Game");
  await page.locator("summary").filter({ hasText: "Change rules" }).click();
  await page.getByRole("radio", { name: "Stands (S17)" }).check();
  await show(page, "Results");
  const results = page.getByRole("region", { name: "Results" });
  const simulate = results.getByRole("button", { name: "Simulate this game" });
  await expect(simulate).toBeDisabled();
  await expect(results.getByText("The Session Simulator models only the audited rules")).toBeVisible();
  await results.getByRole("button", { name: "Reset to audited rules" }).click();
  await expect(simulate).toBeEnabled();
});

test("tools that can't open a no-hole-card scenario are shown as unavailable", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await openLab(page);
  await page.locator("summary").filter({ hasText: "Change rules" }).click();
  await page.getByRole("radio", { name: "No hole card (European)" }).check();
  const dialog = await saveScenario(page, "Euro");
  for (const tool of ["Session Simulator", "Compare Scenarios", "Trip Planner", "Session Journal"]) {
    await expect(dialog.getByText(`${tool} unavailable`)).toBeVisible();
    await expect(dialog.getByRole("link", { name: tool })).toHaveCount(0);
  }
});

test("phone steps fit the screen and the dock reaches the results and back", async ({ page }, testInfo) => {
  phonesOnly(testInfo.project.name);
  await prepare(page);
  await openLab(page);
  await show(page, "Bet ramp");
  await page.getByRole("radio", { name: "Every count" }).check();
  const tooWide = await page.locator("main *").evaluateAll((nodes) => nodes.filter((node) => {
    const box = node.getBoundingClientRect();
    return box.width > 0 && !node.closest(".sr-only, [role='tablist']") && (box.left < -1 || box.right > innerWidth + 1);
  }).map((node) => `${node.tagName}.${node.className}`.slice(0, 80)));
  expect(tooWide).toEqual([]);
  const dock = page.getByRole("group", { name: "Live results" });
  await expect(dock).toBeVisible();
  await dock.getByRole("button", { name: "Results" }).click();
  await expect(page.getByRole("tab", { name: "Results" })).toHaveAttribute("aria-selected", "true");
  await dock.getByRole("button", { name: "Back to Bet ramp" }).click();
  await expect(page.getByRole("tab", { name: "Bet ramp" })).toHaveAttribute("aria-selected", "true");
});

test("every step fits a 320px screen", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await page.setViewportSize({ width: 320, height: 740 });
  await prepare(page);
  await openLab(page);
  const check = async (label: string) => {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), { message: label }).toBeLessThanOrEqual(320);
    const clipped = await page.locator("main button:visible, main input:visible, main select:visible").evaluateAll((nodes) => nodes.filter((node) => {
      const box = node.getBoundingClientRect();
      return !node.closest("[role='tablist']") && (box.left < -1 || box.right > innerWidth + 1);
    }).map((node) => node.getAttribute("aria-label") || node.textContent?.trim()));
    expect(clipped, label).toEqual([]);
  };
  for (const tab of ["Game", "Bankroll", "Bet ramp", "Results"] as const) {
    await show(page, tab);
    if (tab === "Game") await page.locator("summary").filter({ hasText: "Change rules" }).click();
    if (tab === "Results") await page.locator("summary").filter({ hasText: "Compare with other games" }).click();
    await check(tab);
  }
  await show(page, "Bet ramp");
  await page.getByRole("radio", { name: "Every count" }).check();
  await check("Every count");
});

test("the result dock never covers the footer or the sidebar", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  for (const [width, height] of [[390, 844], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    await openLab(page);
    const dock = page.getByRole("group", { name: "Live results" });
    await expect(dock).toBeVisible();
    if (width >= 1024) expect((await dock.boundingBox())!.x).toBeGreaterThanOrEqual(272);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const covered = await page.locator("footer a").evaluateAll((links) => links.filter((link) => {
      const box = link.getBoundingClientRect();
      return !link.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
    }).map((link) => link.textContent));
    expect(covered, `${width}px`).toEqual([]);
  }
});

test("printing shows every step and the results", async ({ page }) => {
  await prepare(page);
  await openLab(page);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("heading", { name: "Results", exact: true })).toBeVisible();
  await expect(page.getByTestId("lab-verdict")).toBeVisible();
  for (const name of ["Game", "Bankroll", "Bet ramp", "Trip outlook"]) await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Live results" })).toBeHidden();
});

test("hash links pick a step on phones and scroll to it on desktop, keeping the query", async ({ page }, testInfo) => {
  await prepare(page);
  if (testInfo.project.name === "desktop-chromium") {
    await openLab(page, "/cvcx/#results");
    await expect(page.getByRole("heading", { name: "Results", exact: true })).toBeInViewport();
    await openLab(page, "/cvcx/#ramp");
    await expect(page.getByRole("heading", { name: "Bet ramp", exact: true })).toBeInViewport();
    return;
  }
  await openLab(page, "/cvcx/?scenario=missing#ramp");
  await expect(page.getByRole("tab", { name: "Bet ramp" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Results" }).click();
  await expect(page).toHaveURL(/\/cvcx\/\?scenario=missing#results$/);
});

test("inputs keep their analytics names and disclosures their section keys", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await openLab(page);
  const fields = await page.locator("[data-analytics-field]").evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute("data-analytics-field")))]);
  expect(fields).toEqual(expect.arrayContaining([
    "available_bankroll", "unit_amount", "rounds_per_hour", "hours_played", "target_risk_of_ruin", "number_of_decks", "penetration",
    "play_variation", "strategy", "blackjack_payout", "double_rule", "dealer_hits_soft_17", "preset", "enter_the_game_at",
    "maximum_spread", "bet_rounding", "ramp_step_units", "ramp_step_start", "hands_per_count",
  ]));
  const sections = await page.locator("details").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-analytics-section") ?? node.querySelector("summary")?.getAttribute("data-analytics-id")));
  expect(sections).toEqual(expect.arrayContaining(["table_rules", "optimizer_settings", "compare_against_the_other_games", "scope_and_method"]));
});

test("selected choices, rule chips and the Estimated mark keep their contrast in both themes", async ({ page }, testInfo) => {
  phonesOnly(testInfo.project.name);
  await prepare(page);
  await openLab(page);
  await page.locator("summary").filter({ hasText: "Change rules" }).click();
  await page.getByRole("radio", { name: "Stands (S17)" }).check();
  const targets = [
    page.getByRole("tab", { selected: true }),
    page.locator("label:has(input:checked)").filter({ hasText: "6 decks" }),
    page.getByRole("listitem").filter({ hasText: "Dealer stands on soft 17" }),
    page.getByRole("button", { name: /Estimated results/, includeHidden: true }).locator("span").first(),
  ];
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    // Let color transitions finish before sampling.
    await page.waitForTimeout(400);
    for (const locator of targets) {
      const contrast = await locator.first().evaluate((element) => {
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
      expect(contrast, `${theme}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("working inputs survive leaving the page", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepare(page);
  await openLab(page);
  await page.getByLabel("Available bankroll", { exact: true }).fill("12345");
  await page.goto("/dashboard/");
  await openLab(page);
  await expect(page.getByLabel("Available bankroll", { exact: true })).toHaveValue("12345");
  await expect(page.getByText("Unsaved setup")).toBeVisible();
});

test("a directory game arrives with its rules and a name to save it under", async ({ page }, testInfo) => {
  phonesOnly(testInfo.project.name);
  const locationId = "11111111-1111-4111-8111-111111111111";
  const gameId = "22222222-2222-4222-8222-222222222222";
  const location = { id: locationId, name: "Test Casino", country: "US", city: "Reno", publication_status: "published" };
  const game = {
    id: gameId, location_id: locationId, game_type: "blackjack", decks: 6, decks_cut: 1.5, min_bet: 25, max_bet: 500, currency: "USD",
    payout: "3:2", soft_17: "H17", double_rules: "any_two", double_after_split: true, max_split_hands: null, resplit_aces: false,
    surrender: "late", dealer_procedure: "hole_card_peek", dealer_blackjack_wager_treatment: "all_bets_lost", mid_shoe_entry: null,
    dealing_method: "shoe", shuffle_method: null, availability: "reported", publication_status: "published", reported_month: "2026-09-01",
    extra_rules: { source_codes: ["h17", "ls", "ds", "shoe"], unknown_codes: [] },
  };
  await prepare(page);
  await page.route((url) => url.pathname.endsWith("/rest/v1/directory_locations"), (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(location) }));
  await page.route((url) => url.pathname.endsWith("/rest/v1/directory_games"), (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([game]) }));
  await page.route((url) => url.pathname.endsWith("/rest/v1/directory_notes"), (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await openLab(page, `/cvcx/?directoryLocation=${locationId}&directoryGame=${gameId}`);
  const notice = page.getByRole("status").filter({ hasText: "Loaded Test Casino" });
  await expect(notice).toBeVisible();
  expect((await notice.boundingBox())!.y).toBeLessThan((await page.getByRole("tablist", { name: "Lab steps" }).boundingBox())!.y);
  await expect(page.getByRole("tab", { name: "Game" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("radio", { name: "Basic strategy only" })).toBeChecked();
  await expect(page.getByText("No resplitting aces")).toBeVisible();
  await show(page, "Bet ramp");
  await expect(page.getByText("This casino's mid-shoe entry rule is unverified.", { exact: false })).toBeVisible();
  await expect(page.getByText("This table's maximum bet is $500", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Save scenario" }).click();
  const dialog = page.getByRole("dialog", { name: "Save scenario" });
  await expect(dialog.getByRole("textbox", { name: "Scenario name" })).toHaveValue("Test Casino · 6D");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await notice.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText("Loaded Test Casino")).toHaveCount(0);
});
