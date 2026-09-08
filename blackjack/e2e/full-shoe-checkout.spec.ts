import { expect, test, type Page } from "@playwright/test";

async function prepareGuest(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("countlab:guest", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
    localStorage.setItem("hilo:settings", JSON.stringify({ surrender: "early" }));
  });
}

test("checkout stays silent, completes a stacked shoe, and saves its report", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One desktop end-to-end shoe is sufficient.");
  test.setTimeout(45_000);
  await prepareGuest(page);
  await page.goto("/training/full-shoe/");
  const game = page.getByRole("main");

  await game.locator("label").filter({ hasText: /^Mode/ }).locator("select").selectOption("checkout");
  await game.locator("label").filter({ hasText: /^Decks/ }).locator("select").selectOption("1");
  await game.locator("label").filter({ hasText: /^Penetration/ }).locator("select").selectOption("0.65");
  await game.getByLabel("Card animations").uncheck();
  await game.getByLabel("Stack the shoe").check();
  await expect(game.getByText("Early surrender vs 10", { exact: true })).toBeVisible();
  await game.getByRole("button", { name: "Start checkout" }).click();

  await expect(game.getByText("Results stay hidden")).toBeVisible();
  await expect(game.getByTestId("full-shoe-empty-tray")).toBeVisible();
  await expect(game.getByTestId("full-shoe-discard-photo")).toHaveCount(0);
  await expect(game.getByText("Coach accuracy")).toHaveCount(0);
  await expect(game.getByRole("button", { name: "Calculate EV" })).toHaveCount(0);

  // Deliberately underbet the first hand; checkout must not expose the error.
  await game.getByRole("button", { name: "$5", exact: true }).click();
  await game.locator("button:visible:not(:disabled)").filter({ hasText: /^Deal/ }).first().click();
  await expect(game.getByText("Bet spread mismatch")).toHaveCount(0);

  for (let step = 0; step < 160; step++) {
    if (await game.getByRole("heading", { name: "Full Shoe Complete" }).isVisible().catch(() => false)) break;
    const deal = game.locator("button:visible").filter({ hasText: /^Deal/ }).first();
    const decline = game.locator("button:visible:not(:disabled)").filter({ hasText: /Decline|No insurance/ }).first();
    const action = game.locator("button:visible:not(:disabled)").filter({ hasText: /^(Hit|Stand|Double|Split|Surrender)$/ }).first();
    if (await deal.isVisible().catch(() => false)) {
      await game.getByRole("button", { name: "$5", exact: true }).click();
      await game.locator("button:visible:not(:disabled)").filter({ hasText: /^Deal/ }).first().click();
    } else if (await decline.isVisible().catch(() => false)) {
      await decline.click();
    } else if (await action.isVisible().catch(() => false)) {
      await action.click();
    } else {
      await page.waitForTimeout(50);
    }
  }

  await expect(game.getByRole("heading", { name: "Full Shoe Complete" })).toBeVisible();
  for (const category of ["Betting", "Basic Strategy", "Deviations"]) await expect(game.getByText(category, { exact: true }).first()).toBeVisible();
  await expect(game.getByText("Decision review").first()).toBeVisible();
  await expect(game.getByText(/\$5 → 1 × \$10/).first()).toBeVisible();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hilo:sessions") || "[]"));
  expect(saved[0]).toMatchObject({ drill: "Full Shoe", metrics: { mode: "checkout", stacked: true }, tags: ["checkout", "stacked", "early"] });
});

test("six-deck Full Shoe moves from an empty tray to a real tray photo", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One desktop visual-flow check is sufficient.");
  test.setTimeout(30_000);
  await prepareGuest(page);
  await page.goto("/training/full-shoe/");
  const game = page.getByRole("main");

  await game.locator("label").filter({ hasText: /^Mode/ }).locator("select").selectOption("checkout");
  await game.getByLabel("Card animations").uncheck();
  await expect(game.locator("label").filter({ hasText: /^Penetration/ }).locator("select")).toHaveValue(String(5 / 6));
  await game.getByRole("button", { name: "Start checkout" }).click();
  await expect(game.getByTestId("full-shoe-empty-tray")).toBeVisible();

  for (let step = 0; step < 160; step++) {
    if (await game.getByTestId("full-shoe-discard-photo").isVisible().catch(() => false)) break;
    const deal = game.locator("button:visible").filter({ hasText: /^Deal/ }).first();
    const decline = game.locator("button:visible:not(:disabled)").filter({ hasText: /Decline|No insurance/ }).first();
    const action = game.locator("button:visible:not(:disabled)").filter({ hasText: /^(Hit|Stand|Double|Split|Surrender)$/ }).first();
    if (await deal.isVisible().catch(() => false)) {
      await game.getByRole("button", { name: "$5", exact: true }).click();
      await game.locator("button:visible:not(:disabled)").filter({ hasText: /^Deal/ }).first().click();
    } else if (await decline.isVisible().catch(() => false)) {
      await decline.click();
    } else if (await action.isVisible().catch(() => false)) {
      await action.click();
    } else {
      await page.waitForTimeout(50);
    }
  }

  const photo = game.getByTestId("full-shoe-discard-photo");
  await expect(photo).toBeVisible();
  await expect(photo).toHaveAttribute("src", /\/deck-estimation\/images\/tray-\d{4}\.jpg/);
  await expect(game.getByTestId("full-shoe-empty-tray")).toHaveCount(0);
});
