import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Picks a segmented-control option by clicking its visible label, as a person would. The radio
 * itself is visually hidden, and forcing a click onto it skips the check that nothing (the fixed
 * tab bar, a dock) covers it.
 */
async function choose(radio: Locator) {
  await radio.locator("xpath=ancestor::label[1]").click();
  await expect(radio).toBeChecked();
}

/** The analytics consent bar sits over the pinned Start button on phones until answered. */
async function open(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  const decline = page.getByRole("button", { name: "No thanks" });
  if (await decline.isVisible().catch(() => false)) await decline.click();
}

async function start(page: Page, name: RegExp | string) {
  // Phones use the pinned button at the bottom, desktops the one under the options; whichever is shown.
  await page.getByRole("button", { name }).filter({ visible: true }).first().click();
}

async function press(page: Page, keys: string) {
  for (const key of keys) await page.keyboard.press(key === "-" ? "Minus" : key);
}

/** No sideways scrolling, and the keypad's Enter key fully on screen. */
async function expectFits(page: Page, enterName: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  const enter = page.getByRole("button", { name: enterName, exact: true });
  const box = await enter.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}

test.describe("counting drills", () => {
  test("deck estimation: photos, verdicts, summary", async ({ page }) => {
    await open(page, "/train/deck-estimation/", "Deck Estimation");
    await choose(page.getByRole("radio", { name: "5" }).first());
    await start(page, "Start 5 photos");
    for (let index = 0; index < 5; index++) {
      await expect(page.locator("img[alt*='photo of the discard tray']").first()).toBeVisible();
      await expectFits(page, "Check");
      await press(page, "3");
      await page.keyboard.press("Enter");
      const next = page.getByRole("button", { name: index === 4 ? "See results" : "Next photo" });
      await expect(next).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: /in the tray/ })).toBeVisible();
      // The verdict ignores a press in its first quarter second (a held Enter would skip it).
      await page.waitForTimeout(300);
      await next.click();
    }
    await expect(page.getByRole("heading", { name: "Deck Estimation", level: 1 })).toBeVisible();
    await expect(page.getByText("Average error")).toBeVisible();
    const saved = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.endsWith("hilo:sessions")).map(([, value]) => JSON.parse(value)).flat());
    expect(saved[0]).toMatchObject({ drill: "Deck Estimation", questions: 5 });
    expect(typeof saved[0].metrics.meanAbsoluteDeckError).toBe("number");
  });

  test("deck estimation: an unfinished session resumes after a reload", async ({ page }) => {
    await open(page, "/train/deck-estimation/", "Deck Estimation");
    await start(page, /^Start \d+ photos$/);
    await press(page, "2");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Next photo" }).click();
    await expect(page.getByLabel("Question 2 of 10")).toBeVisible();
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.getByText("Unfinished session.")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("Question 2 of 10")).toBeVisible();
  });

  test("true count from the tray: two answers, a verdict that explains, and a summary", async ({ page }) => {
    await open(page, "/train/true-count/", "True Count");
    await page.getByRole("radio", { name: /Tray \+ division/ }).click();
    await start(page, /^Start \d+ questions$/);
    await expect(page.getByText("Running count", { exact: true })).toBeVisible();
    await expectFits(page, "Next");
    await press(page, "3");
    await page.keyboard.press("Enter");
    await press(page, "-1");
    await page.keyboard.press("Enter");
    const verdict = page.getByRole("status").filter({ hasText: /true count/i }).filter({ hasText: "÷" });
    await expect(verdict).toBeVisible();
    // The question is random, so 3 decks and −1 is sometimes simply right.
    await expect(verdict).toContainText(/You said 3 decks and −1\.|Correct: true count −1/);
    await page.getByRole("button", { name: "End drill" }).click();
    await expect(page.getByText("Questions right", { exact: true })).toBeVisible();
  });

  test("true count with the decks given", async ({ page }) => {
    await open(page, "/train/true-count/", "True Count");
    await page.getByRole("radio", { name: /Division only/ }).click();
    await start(page, /^Start \d+ questions$/);
    await expect(page.getByText("What is the true count?")).toBeVisible();
    await expect(page.getByText("Decks left", { exact: true }).first()).toBeVisible();
    await expectFits(page, "Check");
  });

  test("running count: cards, a check, the verdict and a saved session", async ({ page }) => {
    await open(page, "/train/running-count/", "Running Count");
    await page.getByRole("radio", { name: /Beginner/ }).click();
    await page.getByLabel("Time per card").selectOption("300");
    await start(page, "Start counting");
    await expect(page.getByRole("list", { name: "Cards on the table" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("heading", { name: "What is the running count?" })).toBeVisible({ timeout: 15000 });
    await expectFits(page, "Check");
    await press(page, "0");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Since the last check: 5 cards/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Keep counting" })).toBeVisible();
    await page.getByRole("button", { name: "End drill" }).click();
    await expect(page.getByText("Checks right", { exact: true })).toBeVisible();
    const saved = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.endsWith("hilo:sessions")).map(([, value]) => JSON.parse(value)).flat());
    expect(saved[0]).toMatchObject({ drill: "Running Count", questions: 1 });
    expect(saved[0].metrics.cardsSeen).toBe(5);
  });

  test("running count: pause keeps the place and table rounds deal a dealer", async ({ page }) => {
    await open(page, "/train/running-count/", "Running Count");
    await page.getByRole("radio", { name: /Full table/ }).click();
    await start(page, "Start counting");
    await expect(page.getByRole("group", { name: "Dealer's cards" })).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /Pause/ }).click();
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
    await page.getByRole("button", { name: "Resume" }).click();
    await expect(page.getByRole("group", { name: "Dealer's cards" })).toBeVisible();
  });
});
