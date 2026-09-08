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
  const tablePhoto = game.getByTestId("full-shoe-table-discard-photo");
  await expect(photo).toBeVisible();
  await expect(tablePhoto).toBeVisible();
  await expect(photo).toHaveAttribute("src", /\/deck-estimation\/images\/tray-\d{4}\.jpg/);
  await expect(tablePhoto).toHaveAttribute("src", /\/deck-estimation\/images\/tray-\d{4}\.jpg/);
  await expect(game.getByTestId("full-shoe-empty-tray")).toHaveCount(0);
  await expect(game.getByTestId("full-shoe-table-empty-tray")).toHaveCount(0);
});

test("custom ramp values grade and persist when the player ends the session early", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One desktop session-end check is sufficient.");
  test.setTimeout(30_000);
  await prepareGuest(page);
  await page.goto("/training/full-shoe/");
  const game = page.getByRole("main");
  const spread = game.locator("label").filter({ hasText: /^Bet spread/ }).locator("select");
  const divisorPrecision = game.locator("label").filter({ hasText: /^Deck divisor precision/ }).locator("select");

  await expect(divisorPrecision).toHaveValue("0.5");
  await expect(divisorPrecision.locator("option")).toHaveCount(3);
  await expect(divisorPrecision.locator("option")).toHaveText(["Full deck", "Half deck", "Quarter deck"]);
  await expect(game.getByLabel("TC +1 units")).toHaveValue("2");
  await expect(game.getByLabel("TC +5 units")).toHaveValue("8");
  await expect(game.getByLabel("TC +6 or higher units")).toHaveValue("8");
  await game.getByLabel("TC +1 units").fill("3");
  await game.getByLabel("TC +1 units").press("Tab");
  await expect(spread).toHaveValue("custom");

  await game.locator("label").filter({ hasText: /^Mode/ }).locator("select").selectOption("checkout");
  await game.getByLabel("Card animations").uncheck();
  await game.getByRole("button", { name: "Start checkout" }).click();
  await game.getByRole("button", { name: "$5", exact: true }).click();
  await game.locator("button:visible:not(:disabled)").filter({ hasText: /^Deal/ }).first().click();

  const end = game.getByRole("button", { name: "End", exact: true });
  await expect(end).toBeEnabled();
  await end.click();
  await expect(game.getByRole("heading", { name: "Session Ended" })).toBeVisible();
  await expect(game.getByText("0 of 1 correct").first()).toBeVisible();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hilo:sessions") || "[]"));
  expect(saved[0]).toMatchObject({
    drill: "Full Shoe",
    questions: 1,
    correct: 0,
    metrics: { completionReason: "ended", mode: "checkout", rampTc1: 3, rampTc5: 8, rampTc6Plus: 8 },
  });
});

test("resplitting four hands keeps every hand inside its table seat", async ({ page }) => {
  test.setTimeout(30_000);
  await prepareGuest(page);
  await page.goto("/training/full-shoe/");
  const game = page.getByRole("main");

  await game.locator("label").filter({ hasText: /^Decks/ }).locator("select").selectOption("1");
  await game.getByLabel("Card animations").uncheck();
  await page.evaluate(() => {
    let seed = 413_895;
    Math.random = () => ((seed = (seed * 1_664_525 + 1_013_904_223) >>> 0) / 4_294_967_296);
  });
  await game.getByRole("button", { name: "Buy in and shuffle" }).click();
  await game.getByRole("button", { name: "$5", exact: true }).click();
  await game.getByRole("button", { name: "$5", exact: true }).click();
  await game.locator("button:visible:not(:disabled)").filter({ hasText: /^Deal/ }).first().click();

  await game.getByRole("button", { name: "Split", exact: true }).click();
  await game.getByRole("button", { name: "Split", exact: true }).click();
  await game.getByRole("button", { name: "Stand", exact: true }).click();
  await game.getByRole("button", { name: "Split", exact: true }).click();

  const seat = game.locator('[data-table-spot="2"]');
  const handLayout = seat.getByTestId("full-shoe-spot-hands");
  await expect(seat.getByTestId("full-shoe-player-hand")).toHaveCount(4);
  const geometry = await handLayout.evaluate((layout) => ({
    clientWidth: layout.clientWidth,
    scrollWidth: layout.scrollWidth,
    hands: Array.from(layout.querySelectorAll('[data-testid="full-shoe-player-hand"]')).map((hand) => {
      const rect = hand.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    }),
    seat: (() => {
      const rect = layout.closest('[data-table-spot]')!.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    })(),
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  for (const hand of geometry.hands) {
    expect(hand.left).toBeGreaterThanOrEqual(geometry.seat.left - 1);
    expect(hand.right).toBeLessThanOrEqual(geometry.seat.right + 1);
  }
});
