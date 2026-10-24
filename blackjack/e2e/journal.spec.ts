import { expect, test, type Page } from "@playwright/test";

const SESSIONS_KEY = "countlab:account:guest:countlab:journal-sessions:v1";
const TRANSACTIONS_KEY = "countlab:account:guest:countlab:journal-transactions:v1";
const PRESETS_KEY = "countlab:account:guest:countlab:venue-presets:v1";
const DELETIONS_KEY = "countlab:account:guest:countlab:journal-deletions:v1";

const rules = { decks: 6, dealerHitsSoft17: true, doubleAfterSplit: true, resplitAces: true, lateSurrender: true, blackjackPayout: 1.5, penetration: 0.75, useIndices: true, indexPolicy: "h17-pro" };
const ramp = [{ trueCount: -8, units: 1 }, { trueCount: 1, units: 2 }, { trueCount: 2, units: 4 }, { trueCount: 3, units: 6 }, { trueCount: 4, units: 8 }];

type Seed = { sessions?: Record<string, unknown>[]; transactions?: Record<string, unknown>[]; bankrolls?: Record<string, unknown>[]; presets?: Record<string, unknown>[]; templates?: Record<string, unknown>[] };

/** Seeds the guest's journal once per test, in the storage format real users already have. Reloads keep what the page saved. */
async function seedJournal(page: Page, seed: Seed = {}) {
  await page.addInitScript((data) => {
    const scoped = (key: string) => `countlab:account:guest:${key}`;
    localStorage.setItem("countlab:account-migration:v1", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    if (sessionStorage.getItem("journal-seeded")) return;
    sessionStorage.setItem("journal-seeded", "1");
    const write = (key: string, items: unknown[] | undefined) => { if (items) localStorage.setItem(scoped(key), JSON.stringify({ version: 1, items })); };
    write("countlab:journal-bankrolls:v1", data.bankrolls);
    write("countlab:journal-sessions:v1", data.sessions);
    write("countlab:journal-transactions:v1", data.transactions);
    write("countlab:venue-presets:v1", data.presets);
    write("countlab:cvcx-templates:v1", data.templates);
  }, seed);
}

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const session = (overrides: Record<string, unknown> = {}) => ({
  id: "casino-session",
  createdAt: new Date().toISOString(),
  date: today(),
  location: "Bellagio",
  hours: 4,
  handsPerHour: 100,
  playerHands: 1,
  bettingUnit: 25,
  rules,
  ramp,
  netResult: 120,
  expenses: 15,
  notes: "Asked for a fresh shuffle.\nDealer was fast but consistent.",
  ...overrides,
});
const aria = { id: "aria", name: "Aria", createdAt: new Date().toISOString(), rules, ramp };
const scenarioConfig = { decks: 6, dealt: 5, bankroll: 20000, handsPerHour: 90, hours: 12, targetRisk: 0.05, maxSpread: 12, wongInAt: null, rampName: "1-12", ramp, chipIncrement: 5, baseBet: 40, dealerHitsSoft17: true, doubleAfterSplit: true, resplitAces: true, lateSurrender: true, europeanNoHoleCard: false, blackjackPayout: 1.5 };
const weekend = { id: "weekend", name: "Weekend 6-deck game", createdAt: new Date().toISOString(), config: scenarioConfig };

const prepareGuest = (page: Page, overrides: Record<string, unknown> = {}) => seedJournal(page, { sessions: [session(overrides)], presets: [aria] });
const stored = (page: Page, key = SESSIONS_KEY) => page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) ?? "null")?.items ?? null, key);
const trackErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
};
const desktopOnly = (name: string) => test.skip(name !== "desktop-chromium", "Desktop journal coverage.");
const phoneOnly = (name: string) => test.skip(name === "desktop-chromium", "Phone journal coverage.");
const announced = (page: Page, text: string) => page.getByRole("status").filter({ hasText: text });
const logButton = (page: Page) => page.getByRole("button", { name: "Log session" }).filter({ visible: true }).first();
const sessionRow = (page: Page, text: string | RegExp) => page.locator("[data-session-row]").filter({ hasText: text });
const logSheet = (page: Page) => page.getByRole("dialog", { name: "Log session" });
const details = (page: Page) => page.getByRole("dialog", { name: /, \d{4}$|invalid date/ });

test("a new journal explains itself and logs a first session from the empty state", async ({ page }) => {
  const errors = trackErrors(page);
  await seedJournal(page);
  await page.goto("/journal/");
  await expect(page.getByText("Log your casino sessions")).toBeVisible();
  await page.getByRole("button", { name: "Log session" }).filter({ visible: true }).first().click();
  const sheet = logSheet(page);
  await expect(sheet.getByLabel("Hours played")).toBeFocused();
  // Nothing is saved until the result is complete.
  await sheet.getByRole("button", { name: "Save session" }).click();
  await expect(sheet.getByText("Enter the table result. Use 0 if you broke even.")).toBeVisible();
  await expect(sheet.getByLabel("Amount won or lost")).toBeFocused();
  expect(await stored(page)).toBeNull();
  await sheet.getByText("Lost", { exact: true }).click();
  await sheet.getByLabel("Amount won or lost").fill("200");
  await sheet.getByRole("button", { name: "Save session" }).click();
  await expect(announced(page, "Session logged.")).toBeAttached();
  expect((await stored(page))[0]).toMatchObject({ netResult: -200, hours: 4, bettingUnit: 25 });
  await expect(page.getByText("Results vs expected")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the result is a direction and an amount, never a silent $0", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepareGuest(page, { netResult: -200 });
  await page.goto("/journal/");

  // An existing loss reads back as Lost and its size; unchanged, closing asks nothing.
  await sessionRow(page, "Bellagio").click();
  await details(page).getByRole("button", { name: "Edit session" }).click();
  const edit = page.getByRole("dialog", { name: "Edit session" });
  await expect(edit.getByRole("radio", { name: "Lost" })).toBeChecked();
  await expect(edit.getByLabel("Amount won or lost")).toHaveValue("200");
  await page.keyboard.press("Escape");
  await expect(edit).toHaveCount(0);

  await logButton(page).click();
  const sheet = logSheet(page);
  // A typed minus sign chooses Lost.
  await sheet.getByLabel("Amount won or lost").fill("-150");
  await expect(sheet.getByRole("radio", { name: "Lost" })).toBeChecked();
  await sheet.getByLabel("Amount won or lost").blur();
  await expect(sheet.getByLabel("Amount won or lost")).toHaveValue("150");
  // A double click is one save.
  await sheet.getByRole("button", { name: "Save session" }).dblclick();
  await expect(sheet).toHaveCount(0);
  expect(await stored(page)).toHaveLength(2);
  expect((await stored(page))[0].netResult).toBe(-150);

  // Breaking even needs no direction.
  await logButton(page).click();
  await sheet.getByLabel("Amount won or lost").fill("0");
  await sheet.getByRole("button", { name: "Save session" }).click();
  await expect(sheet).toHaveCount(0);
  expect((await stored(page))[0].netResult).toBe(0);

  // A positive amount still needs Won or Lost.
  await logButton(page).click();
  await sheet.getByLabel("Amount won or lost").fill("80");
  await sheet.getByRole("button", { name: "Save session" }).click();
  await expect(sheet.getByText("Choose Won or Lost.")).toBeVisible();
  expect(await stored(page)).toHaveLength(3);
});

test("amounts typed with separators save in full, and typos are flagged instead of cut short", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepareGuest(page);
  await page.goto("/journal/");

  await logButton(page).click();
  const sheet = logSheet(page);
  const amount = sheet.getByLabel("Amount won or lost");
  await sheet.getByText("Won", { exact: true }).click();
  await amount.pressSequentially("1,250");
  await amount.blur();
  await expect(amount).toHaveValue("1250");
  await sheet.getByRole("button", { name: "Save session" }).click();
  await expect(sheet).toHaveCount(0);
  expect((await stored(page))[0].netResult).toBe(1250);

  await logButton(page).click();
  await sheet.getByText("Lost", { exact: true }).click();
  await amount.fill("12,50");
  await amount.blur();
  await expect(amount).toHaveValue("12,50");
  await expect(sheet.getByText("Enter a number, e.g. 1250.")).toBeVisible();
  await expect(amount).toHaveAttribute("aria-invalid", "true");
  await sheet.getByRole("button", { name: "Save session" }).click();
  await expect(amount).toBeFocused();
  expect(await stored(page)).toHaveLength(2);
  await amount.fill("12.50");
  await sheet.getByRole("button", { name: "Save session" }).click();
  await expect(sheet).toHaveCount(0);
  expect((await stored(page))[0].netResult).toBe(-12.5);

  await page.getByRole("button", { name: "Deposit or withdrawal" }).filter({ visible: true }).first().click();
  const cash = page.getByRole("dialog", { name: "Deposit or withdrawal" });
  await cash.getByLabel("Amount").pressSequentially("$20,000");
  await cash.getByRole("button", { name: "Record deposit" }).click();
  await expect(cash).toHaveCount(0);
  expect(await stored(page, TRANSACTIONS_KEY)).toMatchObject([{ type: "deposit", amount: 20000 }]);
});

test.describe("in an evening west of UTC", () => {
  test.use({ timezoneId: "America/Toronto" });

  test("a new session remembers the latest game and defaults to the local date", async ({ page }, testInfo) => {
    desktopOnly(testInfo.project.name);
    // 9:30 pm in Toronto is already the next day in UTC.
    await page.clock.setFixedTime(new Date("2026-09-26T21:30:00-04:00"));
    await prepareGuest(page, { bettingUnit: 50, date: "2026-09-20" });
    await page.goto("/journal/");
    await logButton(page).click();
    const sheet = logSheet(page);
    await expect(sheet).toContainText("$50 unit");
    await expect(sheet).toContainText("From your latest session (Sep 20 · Bellagio)");
    await expect(sheet.getByLabel("Date", { exact: true })).toHaveValue("2026-09-26");
    await sheet.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Deposit or withdrawal" }).filter({ visible: true }).first().click();
    await expect(page.getByRole("dialog", { name: "Deposit or withdrawal" }).getByLabel("Date", { exact: true })).toHaveValue("2026-09-26");
  });
});

test("details show the notes, edits save and return focus, and a delete confirms and moves focus on", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  const errors = trackErrors(page);
  await seedJournal(page, { sessions: [
    session({ id: "a", date: daysAgo(1), location: "Aria" }),
    session({ id: "b", date: daysAgo(2), location: "Wynn", notes: undefined }),
  ] });
  await page.goto("/journal/");

  await sessionRow(page, "Aria").click();
  const sheet = details(page);
  await expect(sheet.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect(sheet).toContainText("Dealer was fast but consistent.");
  await sheet.getByRole("button", { name: "Edit session" }).click();
  const edit = page.getByRole("dialog", { name: "Edit session" });
  await expect(edit.getByLabel("Date", { exact: true })).toBeFocused();
  await edit.getByLabel("Date", { exact: true }).fill("");
  await expect(edit.getByText("Enter a complete, valid date.")).toBeVisible();
  await edit.getByLabel("Date", { exact: true }).fill("2026-09-08");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).toHaveCount(0);
  expect((await stored(page)).find((item: { id: string }) => item.id === "a").date).toBe("2026-09-08");
  await expect(sessionRow(page, "Aria")).toBeFocused();

  await sessionRow(page, "Wynn").click();
  await details(page).getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete this session?" });
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(details(page)).toBeVisible();
  await details(page).getByRole("button", { name: "Delete" }).click();
  await confirm.getByRole("button", { name: "Delete session" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(announced(page, "Session deleted.")).toBeAttached();
  await expect(sessionRow(page, "Aria")).toBeFocused();
  expect((await stored(page)).map((item: { id: string }) => item.id)).toEqual(["a"]);
  // The deletion is remembered, so a sync cannot bring the session back.
  expect((await stored(page, DELETIONS_KEY)).map((item: { id: string }) => item.id)).toContain("b");
  expect(errors).toEqual([]);
});

test("unsaved input asks before it goes, and Enter in the venue name only saves the venue", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepareGuest(page);
  await page.goto("/journal/");
  const before = await stored(page);

  // Enter opens the form when the page itself has focus.
  await page.locator("h1").click();
  await page.keyboard.press("Enter");
  const sheet = logSheet(page);
  await expect(sheet.getByLabel("Hours played")).toBeFocused();

  await sheet.getByRole("button", { name: "Change game" }).click();
  await sheet.getByLabel("Venue name").fill("Golden Nugget");
  await sheet.getByLabel("Venue name").press("Enter");
  await expect(sheet.getByText("Venue “Golden Nugget” saved.")).toBeVisible();
  expect(await stored(page)).toEqual(before);
  expect((await stored(page, PRESETS_KEY)).map((preset: { name: string }) => preset.name)).toContain("Golden Nugget");
  // Enter in a per-count bet only commits that bet.
  await sheet.getByRole("button", { name: "Customize bet per count" }).click();
  const bet = sheet.getByLabel("Bet at true count +2");
  await bet.fill("150");
  await bet.press("Enter");
  await expect(sheet).toContainText("+2 and up $150");
  expect(await stored(page)).toEqual(before);

  await sheet.getByLabel("Amount won or lost").fill("75");
  await page.keyboard.press("Escape");
  await expect(sheet.getByText("Discard this session?")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Keep editing" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sheet.getByText("Discard this session?")).toHaveCount(0);
  await expect(sheet.getByLabel("Amount won or lost")).toBeFocused();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await page.keyboard.press("Enter");
  await expect(sheet.getByRole("button", { name: "Cancel" })).toBeFocused();
  await sheet.getByRole("button", { name: "Close" }).click();
  await sheet.getByRole("button", { name: "Discard" }).click();
  await expect(sheet).toHaveCount(0);
  expect(await stored(page)).toEqual(before);
});

test("saved venues fill the casino, can be added and deleted", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await seedJournal(page, { sessions: [session()], presets: [aria, { ...aria, id: "wynn", name: "Wynn" }] });
  await page.goto("/journal/#venues");
  await expect(page.getByRole("tab", { name: /Venues/ })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "Delete saved venue Aria" }).click();
  await page.getByRole("dialog", { name: "Delete this saved venue?" }).getByRole("button", { name: "Delete" }).click();
  await expect(announced(page, "Venue “Aria” deleted.")).toBeAttached();
  expect((await stored(page, PRESETS_KEY)).map((preset: { id: string }) => preset.id)).toEqual(["wynn"]);
  await expect(page.getByRole("button", { name: "Log a session here" })).toBeFocused();

  await page.getByRole("button", { name: "Log a session here" }).click();
  const sheet = logSheet(page);
  await expect(sheet.getByLabel("Casino (optional)")).toHaveValue("Wynn");
  await expect(sheet).toContainText("From saved venue: Wynn");
  await sheet.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "New venue" }).click();
  const venue = page.getByRole("dialog", { name: "New venue" });
  await venue.getByRole("button", { name: "Save venue" }).click();
  await expect(venue.getByText("Name the venue.")).toBeVisible();
  await venue.getByLabel("Casino name").fill("Horseshoe");
  await venue.getByLabel("Blackjack pays").selectOption("1.2");
  await venue.getByRole("button", { name: "Save venue" }).click();
  await expect(venue).toHaveCount(0);
  expect((await stored(page, PRESETS_KEY))[0]).toMatchObject({ name: "Horseshoe", rules: { blackjackPayout: 1.2 } });
});

test("cash movements record a note, show every record behind the recent cap, and deletes name the record", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await seedJournal(page, {
    sessions: [session()],
    transactions: Array.from({ length: 15 }, (_, index) => ({ id: `t${index}`, createdAt: new Date().toISOString(), date: `2026-08-${String(index + 1).padStart(2, "0")}`, type: "deposit", amount: 100 + index })),
  });
  await page.goto("/journal/#cash");
  const panel = page.getByRole("tabpanel");
  await panel.getByRole("button", { name: "Show all 15" }).click();
  await expect(panel.getByRole("button", { name: "Show recent only" })).toBeVisible();

  await panel.getByRole("button", { name: "Deposit or withdrawal" }).click();
  const sheet = page.getByRole("dialog", { name: "Deposit or withdrawal" });
  await sheet.getByLabel("Amount").fill("250");
  await sheet.getByLabel("Note (optional)").fill("Reload");
  await sheet.getByRole("button", { name: "Record deposit" }).click();
  await expect(announced(page, "Deposit recorded.")).toBeAttached();
  expect((await stored(page, TRANSACTIONS_KEY)).find((item: { note?: string }) => item.note === "Reload")).toMatchObject({ type: "deposit", amount: 250 });

  await panel.getByRole("button", { name: /Delete deposit of \$250 from/ }).click();
  await page.getByRole("dialog", { name: "Delete this deposit?" }).getByRole("button", { name: "Delete" }).click();
  await expect(announced(page, "Deposit deleted.")).toBeAttached();
  await expect(panel.getByRole("button", { name: /Delete deposit of \$114 from/ })).toBeFocused();
});

test("bankroll health asks for a starting bankroll before pricing risk of ruin on results alone", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepareGuest(page);
  await page.goto("/journal/");
  const panel = page.getByRole("region", { name: "Bankroll health" });
  await expect(panel.getByText("Risk of ruin", { exact: true })).toBeVisible();
  await expect(panel).toContainText("No starting bankroll recorded");
  await expect(panel.getByText(/what this bankroll supports/)).toBeVisible();
  await panel.getByRole("button", { name: "Record starting bankroll" }).click();
  await expect(page.getByRole("dialog", { name: "Deposit or withdrawal" }).getByLabel("Note (optional)")).toHaveValue("Starting bankroll");
});

test("each bankroll remembers its own game, and new or moved sessions say when they leave the view", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await seedJournal(page, {
    bankrolls: [{ id: "main", createdAt: new Date(0).toISOString(), name: "Main" }, { id: "trip", createdAt: new Date(1000).toISOString(), name: "Trip" }],
    sessions: [
      session({ id: "home", bankrollId: "main", bettingUnit: 25, date: daysAgo(1), notes: undefined }),
      session({ id: "away", bankrollId: "trip", bettingUnit: 100, date: daysAgo(3), location: "Wynn", notes: undefined }),
    ],
  });
  await page.goto("/journal/");
  await page.getByLabel("Bankroll", { exact: true }).selectOption("trip");
  await logButton(page).click();
  const sheet = logSheet(page);
  await expect(sheet).toContainText("$100 unit");
  await expect(sheet.getByLabel("Bankroll", { exact: true })).toHaveValue("trip");
  await sheet.getByText("Won", { exact: true }).click();
  await sheet.getByLabel("Amount won or lost").fill("500");
  await sheet.getByRole("button", { name: "Save session" }).click();
  await expect(sheet).toHaveCount(0);
  expect((await stored(page))[0]).toMatchObject({ bankrollId: "trip", bettingUnit: 100, netResult: 500 });

  await sessionRow(page, "Wynn").click();
  await details(page).getByRole("button", { name: "Edit session" }).click();
  const edit = page.getByRole("dialog", { name: "Edit session" });
  await edit.getByLabel("Bankroll", { exact: true }).selectOption("main");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("which isn't the bankroll you're viewing")).toBeVisible();
  expect((await stored(page)).find((item: { id: string }) => item.id === "away").bankrollId).toBe("main");
  await page.getByRole("button", { name: "Show it" }).click();
  await expect(page.getByLabel("Bankroll", { exact: true })).toHaveValue("main");
  await expect(sessionRow(page, "Wynn")).toBeFocused();
});

test("bankrolls are managed in a sheet without window dialogs", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  page.on("dialog", (dialog) => { throw new Error(`Unexpected ${dialog.type()} dialog`); });
  await prepareGuest(page);
  await page.goto("/journal/");
  await page.getByRole("button", { name: "Bankroll: Main" }).click();
  const sheet = page.getByRole("dialog", { name: "Bankrolls" });
  await expect(sheet.getByRole("button", { name: "Delete Main" })).toBeDisabled();
  await sheet.getByLabel("New bankroll name").fill("main");
  await expect(sheet.getByText("You already have a bankroll with that name.")).toBeVisible();
  await sheet.getByLabel("New bankroll name").fill("Vegas");
  await sheet.getByRole("button", { name: "Create bankroll" }).click();
  await expect(sheet.getByLabel("New bankroll name")).toBeFocused();
  await sheet.getByRole("button", { name: "Rename Vegas" }).click();
  await sheet.getByLabel("Bankroll name", { exact: true }).fill("Vegas 2026");
  await sheet.getByLabel("Bankroll name", { exact: true }).press("Enter");
  await expect(sheet.getByRole("button", { name: "Rename Vegas 2026" })).toBeFocused();
  await sheet.getByRole("button", { name: "Delete Vegas 2026" }).click();
  await expect(sheet).toContainText("move to “Main”");
  await sheet.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "Delete Main" })).toBeDisabled();
  await expect(sheet.getByRole("button", { name: "Rename Main" })).toBeFocused();
});

test("a Calculator scenario link opens the form with its game, once; unsupported and missing ones say so", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await seedJournal(page, { sessions: [session()], templates: [weekend, { id: "enhc", name: "European game", createdAt: new Date().toISOString(), config: { ...scenarioConfig, europeanNoHoleCard: true } }] });
  await page.goto("/journal/?scenario=weekend");
  const sheet = logSheet(page);
  await expect(sheet).toContainText("Loaded “Weekend 6-deck game” from the Calculator");
  await expect(sheet).toContainText("$40 unit");
  await expect(sheet.getByRole("link", { name: "Open in Calculator" })).toHaveCount(1);
  await expect(sheet.getByRole("link", { name: "Open in Calculator" })).toHaveAttribute("href", /\/calculator\/?\?scenario=weekend/);
  await sheet.getByText("Won", { exact: true }).click();
  await sheet.getByLabel("Amount won or lost").fill("300");
  await sheet.getByRole("button", { name: "Save session" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page).not.toHaveURL(/scenario=/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Journal", level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await stored(page))[0]).toMatchObject({ bettingUnit: 40, netResult: 300 });

  await page.goto("/journal/?scenario=enhc");
  await expect(page.getByText("This tool does not support that hole-card or doubling rule.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open in Calculator" })).toHaveAttribute("href", /\/calculator\/?\?scenario=enhc/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/journal/?scenario=missing");
  await expect(page.getByText("The linked scenario isn't saved on this account and device.")).toBeVisible();
});

test("import and export keep their file names and say what an import will do", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepareGuest(page);
  await page.goto("/journal/#data");
  const panel = page.getByRole("tabpanel");
  for (const [button, name] of [["Export JSON", /^countlab-journal-\d{4}-\d{2}-\d{2}\.json$/], ["Export sessions CSV", /^countlab-journal-sessions-\d{4}-\d{2}-\d{2}\.csv$/], ["Export cash movements CSV", /^countlab-journal-transactions-\d{4}-\d{2}-\d{2}\.csv$/]] as const) {
    const download = page.waitForEvent("download");
    await panel.getByRole("button", { name: button }).click();
    expect((await download).suggestedFilename()).toMatch(name);
  }
  const backup = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), bankrolls: [], transactions: [], sessions: [session({ netResult: 999 }), session({ id: "restored", location: "Wynn", notes: undefined })] });
  await page.getByLabel("Choose a JSON journal backup").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(backup) });
  const confirm = page.getByRole("dialog", { name: "Import this backup?" });
  await expect(confirm).toContainText("1 record already on this device will be replaced");
  await confirm.getByRole("button", { name: "Import" }).click();
  await expect(panel.getByText("Imported 2 sessions and 0 cash movements.")).toBeVisible();
  expect(await stored(page)).toHaveLength(2);

  await page.getByLabel("Choose a JSON journal backup").setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{ not json") });
  await expect(panel.getByRole("alert")).toContainText("isn't valid JSON");
  expect(await stored(page)).toHaveLength(2);
});

test("deleting everything needs the typed word and leaves deletions a sync respects", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepareGuest(page);
  await page.goto("/journal/#data");
  await page.getByRole("button", { name: "Delete all journal data" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete all journal data?" });
  await expect(confirm.getByRole("button", { name: "Delete everything" })).toBeDisabled();
  await confirm.getByLabel(/Type delete to confirm/).fill("delete");
  await confirm.getByRole("button", { name: "Delete everything" }).click();
  await expect(confirm).toHaveCount(0);
  expect(await stored(page)).toEqual([]);
  expect((await stored(page, DELETIONS_KEY)).map((item: { id: string }) => item.id)).toContain("casino-session");
  await expect(page.getByText("Log your casino sessions")).toBeVisible();
});

test("tabs follow the address, unknown hashes change nothing, and #log opens the form", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepareGuest(page);
  for (const [hash, tab] of [["#venues", /Venues/], ["#cash", /Cash/], ["#data", /Data/]] as const) {
    await page.goto(`/journal/${hash}`);
    await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
  }
  await page.goto("/journal/#main");
  await expect(page.getByRole("tab", { name: /Data/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/journal/#log");
  await expect(logSheet(page)).toBeVisible();
  await logSheet(page).getByRole("button", { name: "Close" }).click();
  await expect(page).not.toHaveURL(/#log/);
});

test("a legacy session with an invalid date stays listed under any filter and can be repaired", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepareGuest(page, { date: "2026-9-8" });
  await page.goto("/journal/");
  await page.getByLabel("Dates").selectOption("7");
  await sessionRow(page, "Invalid date").click();
  const sheet = details(page);
  await expect(sheet).toContainText("This session's date is invalid. Edit it to fix.");
  await sheet.getByRole("button", { name: "Edit session" }).click();
  const edit = page.getByRole("dialog", { name: "Edit session" });
  await edit.getByLabel("Date", { exact: true }).fill(daysAgo(1));
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).toHaveCount(0);
  expect((await stored(page))[0].date).toBe(daysAgo(1));
});

test("a session's details simulate shoes and share an image", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepareGuest(page, { hours: 1 });
  await page.goto("/journal/");
  await sessionRow(page, "Bellagio").click();
  const sheet = details(page);
  await sheet.getByRole("button", { name: "Simulate shoes" }).click();
  await expect(sheet.getByRole("heading", { name: "Simulated shoes" })).toBeFocused({ timeout: 20_000 });
  await sheet.getByRole("button", { name: "Back to session" }).click();
  await expect(sheet.getByRole("heading", { name: "Notes" })).toBeVisible();
  await sheet.getByRole("button", { name: "Share image" }).click();
  const share = page.getByRole("dialog", { name: "Share this session" });
  const download = page.waitForEvent("download");
  await share.getByRole("button", { name: "Download image" }).click();
  expect((await download).suggestedFilename()).toMatch(/^countlab-session-\d{4}-\d{2}-\d{2}\.png$/);
  await share.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeVisible();
});

test("the results chart is a picture in theme colours with a translucent range", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await seedJournal(page, { sessions: Array.from({ length: 12 }, (_, index) => session({ id: `s${index}`, date: daysAgo(index * 3), netResult: [120, -450, 800, -300][index % 4], notes: undefined })) });
  await page.goto("/journal/");
  const chart = page.getByRole("img", { name: /Cumulative result .* against expected/ });
  await expect(chart).toBeVisible();
  const opacities = await chart.locator("path.recharts-area-area").evaluateAll((paths) => paths.map((path) => Number(getComputedStyle(path).fillOpacity)));
  expect(opacities.length).toBeGreaterThan(0);
  for (const opacity of opacities) expect(opacity).toBeLessThan(0.5);
  await expect(chart.locator("[tabindex]:not([tabindex='-1'])")).toHaveCount(0);
});

test("phones: the pinned Log session button opens the form, and Back closes sheets", async ({ page }, testInfo) => {
  phoneOnly(testInfo.project.name);
  await prepareGuest(page);
  await page.goto("/progress/");
  await page.goto("/journal/");
  const dock = page.getByRole("group", { name: "Journal actions" }).getByRole("button", { name: "Log session" });
  expect((await dock.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await dock.click();
  const sheet = logSheet(page);
  await sheet.getByLabel("Amount won or lost").fill("40");
  await page.goBack();
  // Unsaved input: the sheet stays and asks.
  await expect(sheet.getByText("Discard this session?")).toBeVisible();
  await sheet.getByRole("button", { name: "Discard" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/journal\/$/);

  await page.getByRole("tab", { name: /Sessions/ }).click();
  await sessionRow(page, "Bellagio").click();
  await expect(details(page)).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Journal", level: 1 })).toBeVisible();
});

test("phones: details close when their session is deleted elsewhere", async ({ page }, testInfo) => {
  phoneOnly(testInfo.project.name);
  await prepareGuest(page);
  await page.goto("/journal/#sessions");
  await sessionRow(page, "Bellagio").click();
  await expect(details(page)).toBeVisible();
  // What a sync pull does: rewrite storage, then tell the page.
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, items: [] }));
    dispatchEvent(new Event("countlab-journal"));
  }, SESSIONS_KEY);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(announced(page, "This session was deleted elsewhere")).toBeAttached();
});

test("the journal fits a 320px phone, empty and with long names", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-se", "Narrow-phone layout coverage.");
  await seedJournal(page, {
    sessions: [session({ location: "Resorts World Las Vegas Casino & Hotel Tower" }), session({ id: "aria-session", location: "Aria", date: daysAgo(2), notes: undefined })],
    transactions: [{ id: "reload", createdAt: new Date().toISOString(), date: daysAgo(1), type: "deposit", amount: 10000, note: "Reload from savings account for the summer trip to Atlantic City" }],
    presets: [{ ...aria, id: "hammond", name: "Horseshoe Hammond Casino & Hotel" }],
  });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/journal/");
  await expect(page.getByText("Results vs expected")).toBeVisible();
  for (const tab of ["Overview", "Sessions", "Cash", "Venues", "Data"]) {
    await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
  await page.getByRole("group", { name: "Journal actions" }).getByRole("button", { name: "Log session" }).click();
  const dialog = logSheet(page);
  await dialog.getByRole("button", { name: "Change game" }).click();
  await dialog.getByRole("button", { name: "Customize bet per count" }).click();
  expect(await dialog.evaluate((element) => Array.from(element.querySelectorAll<HTMLElement>(".overflow-y-auto")).every((scroller) => scroller.scrollWidth <= scroller.clientWidth))).toBe(true);
  const clipped = await dialog.locator(":is(button, input, select, label):visible").evaluateAll((nodes) => nodes.filter((node) => {
    const box = node.getBoundingClientRect();
    return box.left < -1 || box.right > 321;
  }).map((node) => node.textContent?.trim().slice(0, 30)));
  expect(clipped).toEqual([]);

  await page.evaluate(() => localStorage.clear());
  await page.goto("/journal/");
  await expect(page.getByText("Log your casino sessions")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
