import { expect, test, type Page } from "@playwright/test";

const SESSIONS_KEY = "countlab:account:guest:countlab:journal-sessions:v1";
const TRANSACTIONS_KEY = "countlab:account:guest:countlab:journal-transactions:v1";
const PRESETS_KEY = "countlab:account:guest:countlab:venue-presets:v1";

const rules = {
  decks: 6,
  dealerHitsSoft17: true,
  doubleAfterSplit: true,
  resplitAces: true,
  lateSurrender: true,
  blackjackPayout: 1.5,
  penetration: 0.75,
  useIndices: true,
  indexPolicy: "h17-pro",
};

const ramp = [
  { trueCount: -8, units: 1 },
  { trueCount: 1, units: 2 },
  { trueCount: 2, units: 4 },
  { trueCount: 3, units: 6 },
  { trueCount: 4, units: 8 },
];

type Seed = { sessions?: Record<string, unknown>[]; transactions?: Record<string, unknown>[]; bankrolls?: Record<string, unknown>[]; presets?: Record<string, unknown>[]; templates?: Record<string, unknown>[] };

/**
 * Seeds the guest's journal once per test. The seed is skipped on reloads, so
 * a test can reload and see what the page itself saved.
 */
async function seedJournal(page: Page, seed: Seed = {}) {
  await page.addInitScript((data) => {
    // Product data is namespaced per account (see lib/supabase/accountStorage).
    // Seed straight into the guest scope and mark the legacy migration done, so
    // the fixture is not swept into the unclaimed scope before the page reads it.
    const scoped = (key: string) => `countlab:account:guest:${key}`;
    localStorage.setItem("countlab:account-migration:v1", "1");
    localStorage.setItem("countlab:guest", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
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

const session = (overrides: Record<string, unknown> = {}) => ({
  id: "casino-session",
  createdAt: new Date().toISOString(),
  date: new Date().toISOString().slice(0, 10),
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
const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const aria = { id: "aria", name: "Aria", createdAt: new Date().toISOString(), rules, ramp };
/** A Game & Bankroll Lab scenario, as saved in the cvcx template library. */
const scenarioConfig = { decks: 6, dealt: 5, bankroll: 20000, handsPerHour: 90, hours: 12, targetRisk: 0.05, maxSpread: 12, wongInAt: null, rampName: "1-12", ramp, chipIncrement: 5, baseBet: 40, dealerHitsSoft17: true, doubleAfterSplit: true, resplitAces: true, lateSurrender: true, europeanNoHoleCard: false, blackjackPayout: 1.5 };
const weekend = { id: "weekend", name: "Weekend 6-deck game", createdAt: new Date().toISOString(), config: scenarioConfig };

async function prepareGuest(page: Page, overrides: Record<string, unknown> = {}) {
  await seedJournal(page, { sessions: [session(overrides)], presets: [aria] });
}

const stored = (page: Page, key = SESSIONS_KEY) => page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) ?? "null")?.items ?? null, key);
const trackErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
};
const desktopOnly = (name: string) => test.skip(name !== "desktop-chromium", "Desktop journal coverage.");

test("session log identifies the casino and venue presets fill the casino name", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  const pageErrors = trackErrors(page);
  await prepareGuest(page);
  await page.goto("/journal/");

  await expect(page.getByRole("radio", { name: "All time" })).toBeChecked();
  await expect(page.getByText("Result · All time", { exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Casino" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Bellagio" })).toBeVisible();
  const sessionRow = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "Bellagio" }) });
  await sessionRow.getByRole("button", { name: /Details for/ }).click();
  const details = page.getByRole("dialog", { name: /Session · / });
  await expect(details.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect(details).toContainText("Asked for a fresh shuffle.");
  await expect(details).toContainText("Dealer was fast but consistent.");
  await details.getByRole("button", { name: "Close" }).click();
  await expect(details).toHaveCount(0);

  await page.getByRole("button", { name: "Log session" }).click();
  const logSheet = page.getByRole("dialog", { name: "Log session" });
  await logSheet.getByRole("button", { name: "Change game" }).click();
  await logSheet.getByLabel("Start from").selectOption({ label: "Aria" });
  await expect(logSheet.getByLabel("Casino name (optional)")).toHaveValue("Aria");
  await expect(logSheet).toContainText("From saved venue: Aria");
  // Loading a venue changed the form, so closing asks before throwing it away.
  await logSheet.getByRole("button", { name: "Cancel" }).click();
  await logSheet.getByRole("button", { name: "Discard" }).click();
  await expect(logSheet).toHaveCount(0);

  await sessionRow.getByRole("button", { name: /Details for/ }).click();
  await page.getByRole("dialog", { name: /Session · / }).getByRole("button", { name: "Edit session" }).click();
  const editSheet = page.getByRole("dialog", { name: "Edit session" });
  const dateInput = editSheet.getByLabel("Date", { exact: true });
  await dateInput.fill("");
  await expect(page.getByText("Enter a complete, valid date.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Session Journal" })).toBeVisible();
  expect(pageErrors).toEqual([]);

  await dateInput.fill("2026-09-08");
  await expect(page.getByText("Enter a complete, valid date.", { exact: true })).toHaveCount(0);
  await editSheet.getByRole("button", { name: "Save changes" }).click();
  await expect(editSheet).toHaveCount(0);
  const savedDate = (await stored(page)).find((item: { id?: string }) => item.id === "casino-session")?.date;
  expect(savedDate).toBe("2026-09-08");
  // Focus returns to the edited row.
  await expect(sessionRow.getByRole("button", { name: /Details for Sep 8/ })).toBeFocused();
});

test("mobile session cards open the full session notes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-se", "Phone session-log coverage.");
  await prepareGuest(page);
  await page.goto("/journal/");

  const card = page.getByRole("list", { name: "Sessions" }).getByRole("button", { name: /Bellagio/ });
  await expect(card).toBeVisible();
  await card.click();
  const details = page.getByRole("dialog", { name: /Session · / });
  await expect(details).toContainText("Asked for a fresh shuffle.");
  await expect(details).toContainText("Dealer was fast but consistent.");
});

test("bankroll health prices ruin risk against the real bankroll and warns when the unit is too big", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  const pageErrors = trackErrors(page);
  await prepareGuest(page);
  await page.goto("/journal/");

  const panel = page.getByRole("region", { name: "Bankroll health" });
  await expect(panel.getByText("Risk of ruin", { exact: true })).toBeVisible();
  // The seeded session is a $25 unit on a bankroll of only its own $120 result,
  // which is wildly overbet, so the warning has to be the thing on screen. With
  // no deposit on record the read is provisional and asks for the real roll.
  await expect(panel.getByText(/what this bankroll supports/)).toBeVisible();
  await expect(panel).toContainText("Provisional: no starting bankroll recorded");
  await panel.getByRole("button", { name: "Record starting bankroll" }).click();
  const sheet = page.getByRole("dialog", { name: "Deposit or withdrawal" });
  await expect(sheet.getByLabel("Note (optional)")).toHaveValue("Starting bankroll");
  expect(pageErrors).toEqual([]);
});

test("cash movements record a note and reveal every transaction behind the recent cap", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await seedJournal(page, {
    sessions: [session()],
    transactions: Array.from({ length: 15 }, (_, index) => ({
      id: `t${index}`,
      createdAt: new Date().toISOString(),
      date: `2026-08-${String(index + 1).padStart(2, "0")}`,
      type: "deposit",
      amount: 100 + index,
      note: index === 0 ? "Seeded note" : undefined,
    })),
  });
  await page.goto("/journal/#cash");

  const panel = page.getByRole("tabpanel");
  await expect(page.getByRole("tab", { name: /Cash movements/ })).toHaveAttribute("aria-selected", "true");
  const showAll = panel.getByRole("button", { name: /Show all 15/ });
  await expect(showAll).toBeVisible();
  await showAll.click();
  await expect(panel.getByRole("button", { name: "Show recent only" })).toBeVisible();

  await panel.getByRole("button", { name: "Deposit / withdrawal" }).click();
  const sheet = page.getByRole("dialog", { name: "Deposit or withdrawal" });
  await expect(sheet.getByLabel("Note (optional)")).toBeVisible();
  await sheet.getByLabel("Amount").fill("250");
  await sheet.getByLabel("Note (optional)").fill("Reload");
  await sheet.getByRole("button", { name: "Record deposit" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Deposit recorded." })).toBeVisible();
  const recorded = (await stored(page, TRANSACTIONS_KEY)).find((item: { note?: string }) => item.note === "Reload");
  expect(recorded).toMatchObject({ type: "deposit", amount: 250 });

  // Deleting names the exact record and moves focus to the next row.
  await panel.getByRole("button", { name: /Delete deposit of \$250 from/ }).click();
  await page.getByRole("dialog", { name: "Delete deposit?" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Deposit deleted." })).toBeVisible();
  await expect(panel.getByRole("button", { name: /Delete deposit of \$114 from/ })).toBeFocused();
});

test("the phone dock opens the log form instead of saving", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chromium", "The dock is a phone control.");
  await seedJournal(page);
  await page.goto("/journal/");

  const dockButton = page.getByRole("group", { name: "Session journal actions" }).getByRole("button", { name: "Log session" });
  // One line, so the primary action never shrinks behind the secondary one.
  expect((await dockButton.boundingBox())?.height).toBeLessThanOrEqual(48);
  await dockButton.click();
  const sheet = page.getByRole("dialog", { name: "Log session" });
  await expect(sheet).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), SESSIONS_KEY)).toBeNull();
  await expect(page.getByRole("group", { name: "Session journal actions" })).toHaveCount(0);

  await sheet.getByRole("button", { name: "Save session" }).click();
  await expect(sheet.getByText("Enter the table result. Use 0 if you broke even.")).toBeVisible();
  await expect(sheet.getByLabel("Amount won or lost")).toBeFocused();
  await sheet.getByRole("radio", { name: "Lost" }).check();
  await sheet.getByLabel("Amount won or lost").fill("200");
  await sheet.getByRole("button", { name: "Save session" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Session logged." })).toBeVisible();
  expect((await stored(page))[0].netResult).toBe(-200);
});

test.describe("in an evening west of UTC", () => {
  test.use({ timezoneId: "America/Toronto" });

  test("a new session remembers the latest game and defaults to the local date", async ({ page }, testInfo) => {
    desktopOnly(testInfo.project.name);
    // 9:30 pm in Toronto is already the next day in UTC.
    await page.clock.setFixedTime(new Date("2026-09-26T21:30:00-04:00"));
    await prepareGuest(page, { bettingUnit: 50, date: "2026-09-20" });
    await page.goto("/journal/");

    await page.getByRole("button", { name: "Log session" }).click();
    const sheet = page.getByRole("dialog", { name: "Log session" });
    await expect(sheet).toContainText("$50 unit");
    await expect(sheet).toContainText("From your latest session (Sep 20 · Bellagio)");
    await expect(sheet.getByLabel("Date", { exact: true })).toHaveValue("2026-09-26");
    await sheet.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("button", { name: "Deposit / withdrawal" }).first().click();
    await expect(page.getByRole("dialog", { name: "Deposit or withdrawal" }).getByLabel("Date", { exact: true })).toHaveValue("2026-09-26");
  });
});

test("the result is a direction and an amount, never a silent $0", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepareGuest(page, { netResult: -200 });
  await page.goto("/journal/");

  // An existing loss reads back as Lost and its size.
  await page.getByRole("button", { name: /Edit session on/ }).click();
  const edit = page.getByRole("dialog", { name: "Edit session" });
  await expect(edit.getByRole("radio", { name: "Lost" })).toBeChecked();
  await expect(edit.getByLabel("Amount won or lost")).toHaveValue("200");
  // Nothing changed, so closing asks nothing.
  await page.keyboard.press("Escape");
  await expect(edit).toHaveCount(0);

  await page.getByRole("button", { name: "Log session" }).click();
  const sheet = page.getByRole("dialog", { name: "Log session" });
  // A typed minus sign chooses Lost instead of being clamped away.
  await sheet.getByLabel("Amount won or lost").fill("-150");
  await expect(sheet.getByRole("radio", { name: "Lost" })).toBeChecked();
  await sheet.getByLabel("Amount won or lost").blur();
  await expect(sheet.getByLabel("Amount won or lost")).toHaveValue("150");
  // A double click is one save.
  await sheet.getByRole("button", { name: "Save session" }).dblclick();
  await expect(sheet).toHaveCount(0);
  let items = await stored(page);
  expect(items).toHaveLength(2);
  expect(items[0].netResult).toBe(-150);

  // Breaking even needs no direction.
  await page.getByRole("button", { name: "Log session" }).click();
  await sheet.getByLabel("Amount won or lost").fill("0");
  await sheet.getByRole("button", { name: "Save session" }).click();
  await expect(sheet).toHaveCount(0);
  items = await stored(page);
  expect(items).toHaveLength(3);
  expect(items[0].netResult).toBe(0);

  // A positive amount still needs Won or Lost.
  await page.getByRole("button", { name: "Log session" }).click();
  await sheet.getByLabel("Amount won or lost").fill("80");
  await sheet.getByRole("button", { name: "Save session" }).click();
  await expect(sheet.getByText("Choose Won or Lost.")).toBeVisible();
  expect(await stored(page)).toHaveLength(3);
});

test("amounts typed with separators save in full, and typos are flagged instead of cut short", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepareGuest(page);
  await page.goto("/journal/");

  await page.getByRole("button", { name: "Log session" }).click();
  const sheet = page.getByRole("dialog", { name: "Log session" });
  const amount = sheet.getByLabel("Amount won or lost");
  await sheet.getByRole("radio", { name: "Won" }).check();
  await amount.pressSequentially("1,250");
  await amount.blur();
  await expect(amount).toHaveValue("1250");
  await sheet.getByRole("button", { name: "Save session" }).click();
  await expect(sheet).toHaveCount(0);
  expect((await stored(page))[0].netResult).toBe(1250);

  // Text that isn't a number stays on screen with an error, and saving stops on it.
  await page.getByRole("button", { name: "Log session" }).click();
  await sheet.getByRole("radio", { name: "Lost" }).check();
  await amount.fill("12,50");
  await amount.blur();
  await expect(amount).toHaveValue("12,50");
  await expect(sheet.getByText("Enter a number, e.g. 1250.")).toBeVisible();
  await expect(amount).toHaveAttribute("aria-invalid", "true");
  await sheet.getByRole("button", { name: "Save session" }).click();
  await expect(amount).toBeFocused();
  expect(await stored(page)).toHaveLength(2);
  await amount.fill("12.50");
  await expect(sheet.getByText("Enter a number, e.g. 1250.")).toHaveCount(0);
  await sheet.getByRole("button", { name: "Save session" }).click();
  await expect(sheet).toHaveCount(0);
  expect((await stored(page))[0].netResult).toBe(-12.5);

  await page.getByRole("button", { name: "Deposit / withdrawal" }).first().click();
  const cash = page.getByRole("dialog", { name: "Deposit or withdrawal" });
  await cash.getByLabel("Amount").pressSequentially("$20,000");
  await cash.getByRole("button", { name: "Record deposit" }).click();
  await expect(cash).toHaveCount(0);
  expect(await stored(page, TRANSACTIONS_KEY)).toMatchObject([{ type: "deposit", amount: 20000 }]);
});

test("Enter opens the log form and never logs by itself", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepareGuest(page);
  await page.goto("/journal/");
  const before = await stored(page);

  await page.locator("h1").click();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "Log session" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("Hours played")).toBeFocused();
  expect(await stored(page)).toEqual(before);

  // Enter in the venue name saves the venue, not the session.
  await sheet.getByRole("button", { name: "Change game" }).click();
  await sheet.getByLabel("Venue name").fill("Golden Nugget");
  await sheet.getByLabel("Venue name").press("Enter");
  await expect(sheet.getByText("Venue “Golden Nugget” saved.")).toBeVisible();
  await expect(sheet).toBeVisible();
  expect(await stored(page)).toEqual(before);
  expect((await stored(page, PRESETS_KEY)).map((preset: { name: string }) => preset.name)).toContain("Golden Nugget");
  // Enter in a per-count bet only commits that bet.
  await sheet.getByText("Customize bet per count").click();
  const bet = sheet.getByLabel("Bet at true count +2").filter({ visible: true });
  await bet.fill("150");
  await bet.press("Enter");
  await expect(sheet).toContainText("+2 and up $150");
  expect(await stored(page)).toEqual(before);

  // Unsaved input asks before it goes, with focus on the safe choice.
  await sheet.getByLabel("Amount won or lost").fill("75");
  await page.keyboard.press("Escape");
  await expect(sheet.getByText("Discard this session?")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Keep editing" })).toBeFocused();
  // Escape again keeps editing, with focus back where it was.
  await page.keyboard.press("Escape");
  await expect(sheet.getByText("Discard this session?")).toHaveCount(0);
  await expect(sheet.getByLabel("Amount won or lost")).toBeFocused();
  // Keeping the edits after Cancel lands on Cancel again, not on the page.
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet.getByRole("button", { name: "Keep editing" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sheet.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expect(sheet.getByLabel("Amount won or lost")).toHaveValue("75");
  await sheet.getByRole("button", { name: "Close" }).click();
  await sheet.getByRole("button", { name: "Discard" }).click();
  await expect(sheet).toHaveCount(0);
  expect(await stored(page)).toEqual(before);
});

test("each bankroll remembers its own game and new sessions land in the chosen bankroll", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await seedJournal(page, {
    bankrolls: [
      { id: "main", createdAt: new Date(0).toISOString(), name: "Main" },
      { id: "trip", createdAt: new Date(1000).toISOString(), name: "Trip" },
    ],
    sessions: [
      session({ id: "home", bankrollId: "main", bettingUnit: 25, date: daysAgo(1), notes: undefined }),
      session({ id: "away", bankrollId: "trip", bettingUnit: 100, date: daysAgo(3), location: "Wynn", notes: undefined }),
    ],
  });
  await page.goto("/journal/");
  await page.getByRole("combobox", { name: /^Bankroll/ }).selectOption("trip");
  await page.getByRole("button", { name: "Log session" }).click();
  const sheet = page.getByRole("dialog", { name: "Log session" });
  await expect(sheet).toContainText("$100 unit");
  await expect(sheet.getByRole("combobox", { name: /^Bankroll/ })).toHaveValue("trip");
  await sheet.getByRole("radio", { name: "Won" }).check();
  await sheet.getByLabel("Amount won or lost").fill("500");
  await sheet.getByRole("button", { name: "Save session" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Session logged." })).toBeVisible();
  expect((await stored(page))[0]).toMatchObject({ bankrollId: "trip", bettingUnit: 100, netResult: 500 });

  // Editing can move a session to another bankroll; the toast says it left the view.
  await page.getByRole("row").filter({ hasText: "Wynn" }).getByRole("button", { name: /Details for/ }).click();
  await page.getByRole("dialog", { name: /Session · / }).getByRole("button", { name: "Edit session" }).click();
  const edit = page.getByRole("dialog", { name: "Edit session" });
  await edit.getByRole("combobox", { name: /^Bankroll/ }).selectOption("main");
  await edit.getByRole("button", { name: "Save changes" }).click();
  const toastMessage = page.getByRole("status").filter({ hasText: "which isn't the bankroll you're viewing" });
  await expect(toastMessage).toBeVisible();
  expect((await stored(page)).find((item: { id: string }) => item.id === "away").bankrollId).toBe("main");
  await toastMessage.getByRole("button", { name: "Show" }).click();
  await expect(page.getByRole("combobox", { name: /^Bankroll/ })).toHaveValue("main");
  await expect(page.getByRole("row").filter({ hasText: "Wynn" }).getByRole("button", { name: /Details for/ })).toBeFocused();
});

test("a help tip inside a sheet closes on Escape without closing the sheet", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepareGuest(page);
  await page.goto("/journal/");
  await page.getByRole("button", { name: "Log session" }).click();
  const sheet = page.getByRole("dialog", { name: "Log session" });
  await sheet.getByRole("button", { name: /What is the 95% modeled outcome range/ }).filter({ visible: true }).click();
  const note = sheet.getByRole("note");
  await expect(note).toContainText("not a confidence interval");
  await page.keyboard.press("Escape");
  await expect(note).toHaveCount(0);
  await expect(sheet).toBeVisible();
});

test("a Lab scenario link opens the log form with the scenario loaded, once", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await seedJournal(page, {
    sessions: [session()],
    templates: [weekend, { id: "enhc", name: "European game", createdAt: new Date().toISOString(), config: { ...scenarioConfig, europeanNoHoleCard: true } }],
  });
  await page.goto("/journal/?scenario=weekend");

  const sheet = page.getByRole("dialog", { name: "Log session" });
  await expect(sheet).toContainText("Loaded “Weekend 6-deck game” from the Lab");
  await expect(sheet).toContainText("$40 unit");
  // The onward links appear once, in the callout, not again under the game.
  await expect(sheet.getByRole("link", { name: "Plan trip" })).toHaveCount(1);
  await expect(sheet.getByRole("link", { name: "Plan trip" })).toHaveAttribute("href", /\/trip-planner\/?\?scenario=weekend/);
  await sheet.getByRole("radio", { name: "Won" }).check();
  await sheet.getByLabel("Amount won or lost").fill("300");
  await sheet.getByRole("button", { name: "Save session" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page).not.toHaveURL(/scenario=/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Session Journal" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await stored(page)).toHaveLength(2);

  await page.goto("/journal/?scenario=enhc");
  await expect(page.getByText("This tool does not support that hole-card or doubling rule.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open in Lab" })).toHaveAttribute("href", /\/cvcx\/?\?scenario=enhc/);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto("/journal/?scenario=missing");
  await expect(page.getByText("The linked scenario isn't saved on this account and device.")).toBeVisible();
});

test("the results chart uses theme colours in light mode", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await page.emulateMedia({ colorScheme: "light" });
  await seedJournal(page, { sessions: Array.from({ length: 12 }, (_, index) => session({ id: `s${index}`, date: daysAgo(index * 3), netResult: [120, -450, 800, -300][index % 4], notes: undefined })) });
  await page.goto("/journal/");

  const chart = page.getByRole("img", { name: /Cumulative result .* against expected/ });
  await expect(chart).toBeVisible();
  await expect(chart.locator("[fill='#0c100d']")).toHaveCount(0);
  // The range is a translucent band, not an opaque mask over the axis.
  const opacities = await chart.locator("path.recharts-area-area").evaluateAll((paths) => paths.map((path) => Number(getComputedStyle(path).fillOpacity)));
  expect(opacities.length).toBeGreaterThan(0);
  for (const opacity of opacities) expect(opacity).toBeLessThan(0.5);
  // No keyboard stops inside a picture; the totals are in text above it.
  await expect(chart.locator("[tabindex]:not([tabindex='-1'])")).toHaveCount(0);
});

test("bankrolls are managed in a sheet without window.prompt", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  page.on("dialog", (dialog) => { throw new Error(`Unexpected ${dialog.type()} dialog`); });
  await prepareGuest(page);
  await page.goto("/journal/");

  await page.getByRole("button", { name: "Manage bankrolls" }).click();
  const sheet = page.getByRole("dialog", { name: "Bankrolls" });
  await expect(sheet.getByRole("button", { name: "Delete Main" })).toBeDisabled();
  await sheet.getByLabel("New bankroll name").fill("main");
  await expect(sheet.getByText("You already have a bankroll with that name.")).toBeVisible();
  await sheet.getByLabel("New bankroll name").fill("Vegas");
  await sheet.getByRole("button", { name: "Create bankroll" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Bankroll “Vegas” created." })).toBeVisible();
  // Each action leaves focus on something in the sheet, never on the page behind it.
  await expect(sheet.getByLabel("New bankroll name")).toBeFocused();
  await sheet.getByRole("button", { name: "Rename Vegas" }).click();
  await sheet.getByLabel("Bankroll name", { exact: true }).fill("Vegas 2026");
  await sheet.getByLabel("Bankroll name", { exact: true }).press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Bankroll renamed to “Vegas 2026”." })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Rename Vegas 2026" })).toBeFocused();
  await sheet.getByRole("button", { name: "Rename Vegas 2026" }).click();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet.getByRole("button", { name: "Rename Vegas 2026" })).toBeFocused();
  await sheet.getByRole("button", { name: "Close" }).click();
  // The new bankroll is the one in view, shown with its balance.
  await expect(page.getByRole("combobox", { name: /^Bankroll/ }).locator("option:checked")).toHaveText(/^Vegas 2026 — \$0$/);

  await page.getByRole("button", { name: "Manage bankrolls" }).click();
  await sheet.getByRole("button", { name: "Delete Vegas 2026" }).click();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet.getByRole("button", { name: "Delete Vegas 2026" })).toBeFocused();
  await sheet.getByRole("button", { name: "Delete Vegas 2026" }).click();
  await expect(sheet).toContainText("move to “Main”");
  await sheet.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Bankroll “Vegas 2026” deleted." })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Delete Main" })).toBeDisabled();
  await expect(sheet.getByRole("button", { name: "Rename Main" })).toBeFocused();
});

test("records tabs follow the address and ignore unrelated hashes", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepareGuest(page);
  for (const [hash, tab] of [["#venues", /Venues/], ["#cash", /Cash movements/], ["#data", /Import & export/]] as const) {
    await page.goto(`/journal/${hash}`);
    await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
  }
  // The skip link's hash, like any unknown one, changes nothing.
  await page.goto("/journal/#main-content");
  await expect(page.getByRole("tab", { name: /Import & export/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto("/journal/index.html#venues");
  await page.getByRole("tab", { name: /Sessions/ }).click();
  await expect(page).toHaveURL(/\/journal\/index\.html$/);

  await page.goto("/journal/#log");
  await expect(page.getByRole("dialog", { name: "Log session" })).toBeVisible();
  await page.getByRole("dialog", { name: "Log session" }).getByRole("button", { name: "Close" }).click();
  await expect(page).not.toHaveURL(/#log/);
});

test("browser Back closes an open sheet instead of leaving the journal", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Back is the phone's way out of a sheet.");
  await prepareGuest(page);
  await page.goto("/dashboard/");
  await page.goto("/journal/");
  await page.getByRole("group", { name: "Session journal actions" }).getByRole("button", { name: "Log session" }).click();
  const sheet = page.getByRole("dialog", { name: "Log session" });
  await sheet.getByLabel("Amount won or lost").fill("40");
  await page.goBack();
  // Unsaved input: the sheet stays and asks.
  await expect(sheet.getByText("Discard this session?")).toBeVisible();
  await sheet.getByRole("button", { name: "Discard" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/journal\/$/);

  await page.getByRole("list", { name: "Sessions" }).getByRole("button", { name: /Bellagio/ }).click();
  await expect(page.getByRole("dialog", { name: /Session · / })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Session Journal" })).toBeVisible();
});

test("browser Back out of a Lab scenario's form drops the link, so a reload doesn't reopen it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Back is the phone's way out of a sheet.");
  await seedJournal(page, { sessions: [session()], templates: [weekend] });
  await page.goto("/dashboard/");
  await page.goto("/journal/?scenario=weekend");
  const sheet = page.getByRole("dialog", { name: "Log session" });
  await expect(sheet).toContainText("Loaded “Weekend 6-deck game” from the Lab");
  // The onward links are listed once and are full-size touch targets.
  const lab = sheet.getByRole("link", { name: "Lab", exact: true });
  await expect(lab).toHaveCount(1);
  const box = await lab.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);

  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/journal\/$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Session Journal" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("details close when their session is deleted elsewhere, and the phone dock comes back", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "The dock is a phone control.");
  await prepareGuest(page);
  await page.goto("/journal/");
  await page.getByRole("list", { name: "Sessions" }).getByRole("button", { name: /Bellagio/ }).click();
  await expect(page.getByRole("dialog", { name: /Session · / })).toBeVisible();
  // What a sync pull does: rewrite storage, then tell the page.
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, items: [] }));
    dispatchEvent(new Event("countlab-journal"));
  }, SESSIONS_KEY);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "This session was deleted elsewhere" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Session journal actions" }).getByRole("button", { name: "Log session" })).toBeVisible();
  await expect(page).toHaveURL(/\/journal\/$/);
});

test("deleting a session moves focus to the next one", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await seedJournal(page, { sessions: [
    session({ id: "a", date: daysAgo(1), location: "Aria", notes: undefined }),
    session({ id: "b", date: daysAgo(2), location: "Wynn", notes: undefined }),
  ] });
  await page.goto("/journal/");
  await page.getByRole("row").filter({ hasText: "Aria" }).getByRole("button", { name: /Details for/ }).click();
  const details = page.getByRole("dialog", { name: /Session · / });
  await details.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete session?" }).getByRole("button", { name: "Cancel" }).click();
  // Cancel lands back on the session.
  await expect(details).toBeVisible();
  await details.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete session?" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Session deleted." })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Wynn" }).getByRole("button", { name: /Details for/ })).toBeFocused();
  expect((await stored(page)).map((item: { id: string }) => item.id)).toEqual(["b"]);
});

test("saved venues can be deleted everywhere they are offered", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await seedJournal(page, { sessions: [session()], presets: [aria, { ...aria, id: "wynn", name: "Wynn" }] });
  await page.goto("/journal/#venues");
  const panel = page.getByRole("tabpanel");
  await expect(panel.getByRole("cell", { name: /Bellagio/ })).toBeVisible();
  await panel.getByRole("button", { name: "Delete saved venue Aria" }).click();
  await page.getByRole("dialog", { name: "Delete saved venue?" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Venue “Aria” deleted." })).toBeVisible();
  expect((await stored(page, PRESETS_KEY)).map((preset: { id: string }) => preset.id)).toEqual(["wynn"]);
  await expect(panel.getByRole("button", { name: "Use for a session" })).toBeFocused();

  await panel.getByRole("button", { name: "Use for a session" }).click();
  const sheet = page.getByRole("dialog", { name: "Log session" });
  await expect(sheet.getByLabel("Casino name (optional)")).toHaveValue("Wynn");
  await expect(sheet).toContainText("From saved venue: Wynn");
  await sheet.getByRole("button", { name: "Change game" }).click();
  await expect(sheet.getByLabel("Start from").locator("option", { hasText: "Aria" })).toHaveCount(0);
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

  const backup = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), bankrolls: [], transactions: [], sessions: [
    session({ netResult: 999 }),
    session({ id: "restored", location: "Wynn", notes: undefined }),
  ] });
  await page.getByLabel("Choose a JSON journal backup").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(backup) });
  const confirm = page.getByRole("dialog", { name: "Import this backup?" });
  await expect(confirm).toContainText("1 record already on this device will be replaced");
  await confirm.getByRole("button", { name: "Import" }).click();
  await expect(panel.getByRole("status")).toContainText("Imported 2 sessions and 0 cash movements.");
  expect(await stored(page)).toHaveLength(2);

  await page.getByLabel("Choose a JSON journal backup").setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{ not json") });
  await expect(panel.getByRole("alert")).toContainText("isn't valid JSON");
  expect(await stored(page)).toHaveLength(2);
});

test("the signed-in storage note says offline when offline, not synced", async ({ page, context }, testInfo) => {
  desktopOnly(testInfo.project.name);
  const supabaseProject = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co").hostname.split(".")[0];
  await page.addInitScript(({ supabaseProject }) => {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const user = { id: "55555555-5555-4555-8555-555555555555", aud: "authenticated", role: "authenticated", email: "player@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };
    const payload = btoa(JSON.stringify({ sub: user.id, aud: "authenticated", role: "authenticated", exp: expires })).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    localStorage.setItem(`sb-${supabaseProject}-auth-token`, JSON.stringify({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.test`, token_type: "bearer", expires_in: 3600, expires_at: expires, refresh_token: "test", user }));
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
  }, { supabaseProject });
  // There is no account service here, so every sync request fails.
  await page.route((url) => url.pathname.includes("/rest/v1/"), (route) => route.abort());
  await page.goto("/journal/#data");
  const panel = page.getByRole("tabpanel");
  await expect(panel.getByText(/A JSON backup is still a good idea/)).toBeVisible();
  await context.setOffline(true);
  await expect(panel).toContainText("Saved on this device; it syncs when you reconnect.");
  await expect(panel).not.toContainText("Synced to your account");
  await context.setOffline(false);
});

test("a legacy session with an invalid date stays listed and can be repaired", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepareGuest(page, { date: "2026-9-8" });
  await page.goto("/journal/");
  const results = page.getByRole("region", { name: "Results vs expected" });
  await results.getByRole("radio", { name: "7 days" }).check();
  const row = page.getByRole("row").filter({ hasText: "Invalid date" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /Details for/ }).click();
  const details = page.getByRole("dialog", { name: /Session · Invalid date/ });
  await expect(details).toContainText("This session's date is invalid. Edit it to fix.");
  await details.getByRole("button", { name: "Edit session" }).click();
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
  await page.getByRole("button", { name: /Details for/ }).click();
  const details = page.getByRole("dialog", { name: /Session · / });
  await details.getByRole("button", { name: "Simulate shoes" }).click();
  await expect(details.getByRole("heading", { name: "Simulated shoes" })).toBeFocused({ timeout: 20_000 });
  await details.getByRole("button", { name: "Back to session" }).click();
  await expect(details.getByRole("heading", { name: "Notes" })).toBeVisible();

  await details.getByRole("button", { name: "Share image" }).click();
  const share = page.getByRole("dialog", { name: "Share this session" });
  const download = page.waitForEvent("download");
  await share.getByRole("button", { name: "Download image" }).click();
  expect((await download).suggestedFilename()).toMatch(/^countlab-session-\d{4}-\d{2}-\d{2}\.png$/);
  await share.getByRole("button", { name: "Close" }).click();
  await expect(details).toBeVisible();
});

test("a short period with nothing in it offers all time back", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await prepareGuest(page, { date: daysAgo(60) });
  await page.goto("/journal/");
  const results = page.getByRole("region", { name: "Results vs expected" });
  const longRun = await results.getByRole("progressbar").getAttribute("aria-valuetext");
  await results.getByRole("radio", { name: "30 days" }).check();
  await expect(results.getByText("No sessions in the last 30 days.")).toBeVisible();
  // Long-run progress counts every hour, whatever the period.
  expect(await results.getByRole("progressbar").getAttribute("aria-valuetext")).toBe(longRun);
  await results.getByRole("button", { name: "Show all time" }).click();
  await expect(results.getByRole("radio", { name: "All time" })).toBeChecked();
  await expect(page.getByRole("cell", { name: "Bellagio" })).toBeVisible();
});

test("the journal fits a 320px phone, empty and with data", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-se", "Narrow-phone layout coverage.");
  // Long names and notes are what push a record list past the screen edge.
  await seedJournal(page, {
    sessions: [session({ location: "Resorts World Las Vegas Casino & Hotel Tower" }), session({ id: "aria-session", location: "Aria", date: daysAgo(2), notes: undefined })],
    transactions: [{ id: "reload", createdAt: new Date().toISOString(), date: daysAgo(1), type: "deposit", amount: 10000, note: "Reload from savings account for the summer trip to Atlantic City" }],
    presets: [{ ...aria, id: "hammond", name: "Horseshoe Hammond Casino & Hotel" }],
  });
  // The shell clips sideways overflow, so the page never scrolls; check that each record control is on screen.
  // (Against the width set here: a phone's innerWidth grows to fit content that overflows.)
  const offscreen = (width: number) => page.locator("#journal-records-panel").locator(":is(button, input, li, table, .overflow-x-auto):visible").evaluateAll((nodes, right) => nodes.filter((node) => {
    const box = node.getBoundingClientRect();
    return !node.parentElement?.closest(".overflow-x-auto") && (box.left < -1 || box.right > right + 1);
  }).map((node) => `${node.tagName} ${node.textContent?.trim().slice(0, 30)}`), width);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 640 });
    for (const path of ["/journal/", "/journal/#cash", "/journal/#venues"]) {
      await page.goto(path);
      await page.getByRole("heading", { name: "Session Journal" }).waitFor();
      await expect(page.locator("#journal-records-panel li").first()).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect(await offscreen(width), `${path} at ${width}px`).toEqual([]);
    }
  }
  await page.getByRole("group", { name: "Session journal actions" }).getByRole("button", { name: "Log session" }).click();
  await expect(page.getByRole("dialog", { name: "Log session" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  // Every part of the form, including the expanded game and per-count bets, fits the width.
  const dialog = page.getByRole("dialog", { name: "Log session" });
  await dialog.getByRole("button", { name: "Change game" }).click();
  await dialog.getByText("Customize bet per count").click();
  expect(await dialog.evaluate((element) => Array.from(element.querySelectorAll<HTMLElement>(".overflow-y-auto")).every((scroller) => scroller.scrollWidth <= scroller.clientWidth))).toBe(true);
  const clipped = await page.getByRole("dialog").locator(":is(button, input, select, label):visible").evaluateAll((nodes) => nodes.filter((node) => {
    const box = node.getBoundingClientRect();
    return !node.closest(".overflow-x-auto") && (box.left < -1 || box.right > 321);
  }).map((node) => node.textContent?.trim().slice(0, 30)));
  expect(clipped).toEqual([]);

  // The seed runs once per test, so clearing storage leaves an empty journal.
  await page.evaluate(() => localStorage.clear());
  await page.goto("/journal/");
  await expect(page.getByRole("heading", { name: "Start your journal" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
