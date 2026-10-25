import { expect, test, type Page } from "@playwright/test";

/** The consent bar would sit over the thumb zone; these tests are about the drills. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
  });
});

const visible = (page: Page, name: RegExp | string) => page.getByRole("button", { name }).filter({ visible: true }).first();
const dock = (page: Page) => page.locator("[data-answer-dock]");
async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

/** Answers one hand with the first live button, and steps past its explanation if it stops on one. */
async function answerOne(page: Page) {
  await dock(page).locator("button:not([disabled])").first().click();
  const next = page.getByRole("button", { name: /Next hand|See results/ });
  if (await next.isVisible().catch(() => false)) {
    await page.waitForTimeout(400);
    await next.click();
  }
}

test.describe("Basic Strategy", () => {
  test("plays a round, explains a miss with the chart row and saves the session", async ({ page }) => {
    await page.goto("/train/basic-strategy/");
    await expect(page.getByRole("heading", { level: 1, name: "Basic Strategy" })).toBeVisible();
    await noSideScroll(page);
    await page.getByRole("radio", { name: "10" }).evaluate((element: HTMLElement) => element.click());
    await page.getByRole("radio", { name: "Every hand" }).evaluate((element: HTMLElement) => element.click());
    await visible(page, /Start 10 hands/).click();

    await expect(page.getByRole("group", { name: "Choose an action" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Table" })).toContainText(/Dealer shows the/);
    await noSideScroll(page);
    await page.keyboard.press("h");
    const feedback = dock(page).getByRole("status");
    await expect(feedback).toBeVisible();
    await expect(feedback.locator("table")).toContainText(/this hand/);
    await page.waitForTimeout(400);
    await page.keyboard.press("Enter");
    for (let hand = 2; hand <= 10; hand += 1) await answerOne(page);

    await expect(page.getByRole("heading", { level: 1, name: /Basic Strategy/ })).toBeVisible();
    await expect(page.getByText("By hand type")).toBeVisible();
    const sessions = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.endsWith("hilo:sessions")).map((key) => JSON.parse(localStorage.getItem(key)!)).flat());
    expect(sessions[0]).toMatchObject({ drill: "Basic Strategy", questions: 10 });
  });

  test("downloads the misses with their right answers as CSV", async ({ page }) => {
    await page.goto("/train/basic-strategy/");
    await page.getByRole("radio", { name: "10" }).evaluate((element: HTMLElement) => element.click());
    await page.getByRole("radio", { name: "Never" }).evaluate((element: HTMLElement) => element.click());
    await visible(page, /Start 10 hands/).click();
    // Hit every hand: some of ten are always wrong.
    for (let hand = 0; hand < 10; hand += 1) {
      await expect(page.getByLabel(new RegExp(`Question ${hand + 1} of 10`))).toBeVisible();
      await page.keyboard.press("h");
    }
    await expect(page.getByRole("heading", { name: "Review your misses" })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save CSV" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^basic-strategy-misses-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = await (await import("node:fs")).promises.readFile((await file.path())!, "utf8");
    expect(text.split("\r\n")[0]).toBe("question,yourAnswer,correctAnswer,why");
    expect(text).toMatch(/,Hit,/);
  });

  test("schedules missed hands for review and counts them on the hub", async ({ page }) => {
    await page.goto("/train/basic-strategy/");
    await page.getByRole("radio", { name: "10" }).evaluate((element: HTMLElement) => element.click());
    await page.getByRole("radio", { name: "Never" }).evaluate((element: HTMLElement) => element.click());
    await visible(page, /Start 10 hands/).click();
    for (let hand = 0; hand < 10; hand += 1) {
      await expect(page.getByLabel(new RegExp(`Question ${hand + 1} of 10`))).toBeVisible();
      await page.keyboard.press("h");
    }
    // One per chart cell missed: the same cell missed twice is one item to review.
    const misses = await page.getByRole("listitem").filter({ hasText: /You said Hit/ }).count();
    await page.getByRole("button", { name: "Change setup" }).click();
    const banner = page.getByText(/Review due: \d+ hands?/);
    await expect(banner).toBeVisible();
    const due = Number((await banner.textContent())!.match(/\d+/)![0]);
    expect(due).toBeGreaterThan(0);
    expect(due).toBeLessThanOrEqual(misses);
    await page.getByRole("button", { name: `Review ${due}` }).click();
    await expect(page.getByLabel(new RegExp(`Question 1 of ${due}$`))).toBeVisible();
    await page.goto("/train/");
    await expect(page.getByText(`${due} due for review`)).toBeVisible();
  });

  test("resumes an unfinished round after a reload", async ({ page }) => {
    await page.goto("/train/basic-strategy/");
    await page.getByRole("radio", { name: "Never" }).evaluate((element: HTMLElement) => element.click());
    await visible(page, /Start \d+ hands/).click();
    await answerOne(page);
    await answerOne(page);
    await page.waitForTimeout(700);
    await page.reload();
    await expect(page.getByText("Unfinished session.")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel(/Question 3 of/)).toBeVisible();
  });

  test("hides surrender when the table rules have none", async ({ page }) => {
    await page.goto("/train/basic-strategy/");
    await expect(page.getByRole("radio", { name: /Surrender/ })).toHaveCount(1);
    await page.getByRole("button", { name: "Change table rules" }).click();
    const sheet = page.getByRole("dialog", { name: "Table rules" });
    await sheet.getByRole("radio", { name: "None" }).evaluate((element: HTMLElement) => element.click());
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText(/6D · H17 · DAS · NS/)).toBeVisible();
    await expect(page.getByRole("radio", { name: /^Surrender/ })).toHaveCount(0);
    await page.getByRole("radio", { name: "Never" }).evaluate((element: HTMLElement) => element.click());
    await visible(page, /Start \d+ hands/).click();
    for (let hand = 0; hand < 5; hand += 1) {
      await expect(page.getByRole("button", { name: /^Surrender/ })).toBeDisabled();
      await answerOne(page);
    }
  });
});

test.describe("Index Plays", () => {
  test("states the true count, says whether surrender is allowed and shows the count ladder", async ({ page }) => {
    await page.goto("/train/deviations/");
    await expect(page.getByRole("heading", { level: 1, name: "Index Plays" })).toBeVisible();
    await expect(page.getByText(/index plays for these rules/)).toBeVisible();
    await noSideScroll(page);
    await page.getByRole("radio", { name: "Every hand" }).evaluate((element: HTMLElement) => element.click());
    await page.getByRole("switch", { name: /Study mode/ }).evaluate((element: HTMLElement) => element.click());
    await visible(page, /Start \d+ hands/).click();
    await expect(page.getByRole("heading", { level: 2, name: /^(What's the play|Take insurance) at (0|[+−]\d)\?$/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Table" }).getByText(/^(TC|True count)$/).filter({ visible: true })).toHaveCount(1);
    await expect(page.getByText(/surrender is allowed|no surrender|offers insurance|no surrender or double/i).first()).toBeVisible();
    await expect(page.getByText(/^Index/).first()).toBeVisible();
    await dock(page).locator("button:not([disabled])").first().click();
    await expect(dock(page).getByRole("img", { name: /The count here is/ })).toBeVisible();
    await noSideScroll(page);
  });
});

test.describe("Chart Recall", () => {
  test("fills and grades a table, marking wrong cells with the right answer", async ({ page }) => {
    await page.goto("/train/chart-recall/");
    await expect(page.getByRole("heading", { level: 1, name: "Chart Recall" })).toBeVisible();
    await page.getByRole("radio", { name: "Soft" }).evaluate((element: HTMLElement) => element.click());
    await visible(page, /Start \(80 cells\)/).click();
    const grid = page.getByRole("table", { name: "Soft totals" });
    await expect(grid).toBeVisible();
    await noSideScroll(page);
    await expect(grid.getByRole("button", { name: "Soft 18 (A,7) versus dealer 3: empty" })).toBeVisible();
    for (let cell = 0; cell < 80; cell += 1) await page.keyboard.press("s");
    await expect(grid.getByRole("button", { name: /Soft 20 \(A,9\) versus dealer 2: Stand/ })).toBeVisible();
    await page.getByRole("button", { name: "Grade soft totals" }).click();
    await expect(page.getByText(/Soft totals: \d+ of 80/)).toBeVisible();
    await expect(page.getByRole("table", { name: "Soft totals, graded" }).getByRole("button", { name: /Soft 18 \(A,7\) versus dealer 3: wrong; you put Stand; the chart says Double, otherwise stand/ })).toBeVisible();
    await page.getByRole("button", { name: "See results" }).click();
    await expect(page.getByText("Cells right")).toBeVisible();
  });

  test("keeps a half-filled chart for later, with its index entries", async ({ page }) => {
    await page.goto("/train/chart-recall/");
    await page.getByRole("radio", { name: /With indices/ }).click();
    await page.getByRole("radio", { name: "Hard" }).evaluate((element: HTMLElement) => element.click());
    await visible(page, /Start \(100 cells\)/).click();
    for (let cell = 0; cell < 11; cell += 1) await page.keyboard.press("h");
    // 16 v 3 is selected now: give it an index (and no play yet) to check that index entries survive too.
    await page.getByRole("button", { name: "Index", exact: true }).click();
    await page.getByRole("button", { name: "Stand", exact: true }).click();
    await page.getByRole("button", { name: "Toggle minus sign" }).click();
    await page.getByRole("button", { name: "3", exact: true }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("11/100 filled")).toBeVisible();
    await page.getByRole("button", { name: "End drill" }).click();
    await page.getByRole("button", { name: "Leave for now" }).click();
    await page.reload();
    await expect(page.getByText(/11 cells filled/)).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("11/100 filled")).toBeVisible();
    await expect(page.getByRole("button", { name: /Hard 16 versus dealer 3: no play; stand at −3/ })).toBeVisible();
  });

  test("fits eleven columns on a 320px phone", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/train/chart-recall/");
    await visible(page, /Start \(/).click();
    const grid = page.getByRole("table").first();
    await expect(grid).toBeVisible();
    const box = await grid.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    await noSideScroll(page);
  });
});
