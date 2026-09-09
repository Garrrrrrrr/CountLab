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
    localStorage.setItem("countlab:guest", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
    const date = new Date().toISOString().slice(0, 10);
    localStorage.setItem("countlab:journal-sessions:v1", JSON.stringify({
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
      }],
    }));
    localStorage.setItem("countlab:venue-presets:v1", JSON.stringify({
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

  await expect(page.getByRole("columnheader", { name: "Casino" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Bellagio" })).toBeVisible();

  await page.getByLabel("Load a venue's rules and ramp").selectOption("aria");
  await expect(page.getByLabel("Casino name (optional)")).toHaveValue("Aria");

  await page.getByRole("row").filter({ has: page.getByRole("cell", { name: "Bellagio" }) }).getByRole("button", { name: "Edit" }).click();
  const dateInput = page.getByLabel("Date").first();
  await dateInput.fill("");
  await expect(page.getByText("Enter a complete, valid date.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Session Journal" })).toBeVisible();
  expect(pageErrors).toEqual([]);

  await dateInput.fill("2026-09-08");
  await expect(page.getByText("Enter a complete, valid date.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Save changes" }).first().click();
  const savedDate = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("countlab:journal-sessions:v1") ?? "{}");
    return stored.items?.find((session: { id?: string }) => session.id === "casino-session")?.date;
  });
  expect(savedDate).toBe("2026-09-08");
});
