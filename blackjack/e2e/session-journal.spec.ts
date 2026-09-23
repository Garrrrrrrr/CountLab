import { expect, test, type Page } from "@playwright/test";

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

async function prepareGuest(page: Page) {
  await page.addInitScript(({ rules: seededRules, ramp: seededRamp }) => {
    // Product data is namespaced per account (see lib/supabase/accountStorage).
    // Seed straight into the guest scope and mark the legacy migration done, so
    // the fixture is not swept into the unclaimed scope before the page reads it.
    const scoped = (key: string) => `countlab:account:guest:${key}`;
    localStorage.setItem("countlab:account-migration:v1", "1");
    localStorage.setItem("countlab:guest", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
    const date = new Date().toISOString().slice(0, 10);
    localStorage.setItem(scoped("countlab:journal-sessions:v1"), JSON.stringify({
      version: 1,
      items: [{
        id: "casino-session",
        createdAt: new Date().toISOString(),
        date,
        location: "Bellagio",
        hours: 4,
        handsPerHour: 100,
        playerHands: 1,
        bettingUnit: 25,
        rules: seededRules,
        ramp: seededRamp,
        netResult: 120,
        expenses: 15,
        notes: "Asked for a fresh shuffle.\nDealer was fast but consistent.",
      }],
    }));
    localStorage.setItem(scoped("countlab:venue-presets:v1"), JSON.stringify({
      version: 1,
      items: [{ id: "aria", name: "Aria", createdAt: new Date().toISOString(), rules: seededRules, ramp: seededRamp }],
    }));
  }, { rules, ramp });
}

test("session log identifies the casino and venue presets fill the casino name", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop session-log coverage.");
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await prepareGuest(page);
  await page.goto("/journal/");

  await expect(page.getByText("Actual result · 30 days")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Casino" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Bellagio" })).toBeVisible();
  const sessionRow = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "Bellagio" }) });
  await sessionRow.getByRole("button", { name: "Notes" }).click();
  const notesPanel = page.locator("table").getByText("Session notes", { exact: true }).locator("..");
  await expect(notesPanel).toContainText("Asked for a fresh shuffle.");
  await expect(notesPanel).toContainText("Dealer was fast but consistent.");

  await page.getByLabel("Load a venue's rules and ramp").selectOption("aria");
  await expect(page.getByLabel("Casino name (optional)")).toHaveValue("Aria");

  await sessionRow.getByRole("button", { name: "Edit" }).click();
  const dateInput = page.getByLabel("Date").first();
  await dateInput.fill("");
  await expect(page.getByText("Enter a complete, valid date.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Session Journal" })).toBeVisible();
  expect(pageErrors).toEqual([]);

  await dateInput.fill("2026-09-08");
  await expect(page.getByText("Enter a complete, valid date.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Save changes" }).first().click();
  const savedDate = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("countlab:account:guest:countlab:journal-sessions:v1") ?? "{}");
    return stored.items?.find((session: { id?: string }) => session.id === "casino-session")?.date;
  });
  expect(savedDate).toBe("2026-09-08");
});

test("mobile session cards expand the full session notes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-se", "Phone session-log coverage.");
  await prepareGuest(page);
  await page.goto("/journal/");

  const notesButton = page.locator("div.md\\:hidden").getByRole("button", { name: /Session notes/ });
  await expect(notesButton).toBeVisible();
  await notesButton.click();
  const notesPanel = notesButton.locator("..");
  await expect(notesPanel).toContainText("Asked for a fresh shuffle.");
  await expect(notesPanel).toContainText("Dealer was fast but consistent.");
});

test("bankroll health prices ruin risk against the real bankroll and warns when the unit is too big", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop bankroll-health coverage.");
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await prepareGuest(page);
  await page.goto("/journal/");

  const panel = page.locator("section, div").filter({ hasText: "Bankroll health" }).first();
  await expect(panel.getByText("Risk of ruin")).toBeVisible();
  // The seeded session is a $25 unit on a bankroll of only its own $120 result,
  // which is wildly overbet, so the warning has to be the thing on screen.
  await expect(page.getByText(/what this bankroll supports/)).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("cash movements record a note and reveal every transaction behind the recent cap", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop cash-movement coverage.");
  await prepareGuest(page);
  await page.addInitScript(() => {
    localStorage.setItem("countlab:account:guest:countlab:journal-transactions:v1", JSON.stringify({
      version: 1,
      items: Array.from({ length: 15 }, (_, index) => ({
        id: `t${index}`,
        createdAt: new Date().toISOString(),
        date: `2026-08-${String(index + 1).padStart(2, "0")}`,
        type: "deposit",
        amount: 100 + index,
        note: index === 0 ? "Seeded note" : undefined,
      })),
    }));
  });
  await page.goto("/journal/");

  // Cash movements renders expanded by default, so there is nothing to open.
  await expect(page.getByLabel("Note (optional)")).toBeVisible();
  const showAll = page.getByRole("button", { name: /Show all 15/ });
  await expect(showAll).toBeVisible();
  await showAll.click();
  await expect(page.getByRole("button", { name: "Show recent only" })).toBeVisible();
});
