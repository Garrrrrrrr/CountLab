import { expect, test, type Page } from "@playwright/test";

/*
 * The counting drills: Running Count, True Count, Deck Estimation and the
 * Counting Benchmark. Every drill phase must show exactly one Enter action
 * (the global handler presses it), answers are validated before grading, and
 * saved progress resumes, can be discarded, and never outlives its session.
 */

const PREFIX = "countlab:account:guest:";
const progressKey = (drill: string) => `${PREFIX}hilo:progress:${drill}`;

async function guest(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("countlab:guest", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
  });
}

/** Seeds storage once per test, before the first page load only (reloads keep what the app wrote). */
async function seedOnce(page: Page, entries: Record<string, unknown>, session: Record<string, unknown> = {}) {
  await page.addInitScript(({ entries, session }) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value));
    for (const [key, value] of Object.entries(session)) sessionStorage.setItem(key, JSON.stringify(value));
  }, { entries, session });
}

const main = (page: Page) => page.getByRole("main");
const visibleEnterActions = (page: Page) => page.locator("main button[data-enter-action='true']:visible:not(:disabled)");

/** Exactly one visible Enter action, with this label. */
async function expectOneEnterAction(page: Page, name: string | RegExp) {
  await expect(visibleEnterActions(page)).toHaveCount(1);
  await expect(visibleEnterActions(page)).toHaveText(name);
}

/** Enter with nothing focused, so the page's one Enter action takes it. */
async function pressEnterOnPage(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Enter");
}

const clickVisible = (page: Page, name: string | RegExp) => main(page).getByRole("button", { name }).locator("visible=true").first().click();
const sessions = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]") as Array<{ drill: string; questions: number }>, `${PREFIX}hilo:sessions`);
const progress = (page: Page, drill: string) => page.evaluate((key) => localStorage.getItem(key), progressKey(drill));

/** Feedback ignores presses in its first 250 ms, so a double Enter cannot skip it. */
const settle = (page: Page) => page.waitForTimeout(300);

async function hideTab(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

test.beforeEach(async ({ page }) => { await guest(page); });

test.describe("running count", () => {
  test.setTimeout(60_000);

  test("the starter session counts, grades with a clear verdict and ends in a summary", async ({ page }) => {
    await page.goto("/training/running-count/?session=starter");
    await expect(main(page).getByRole("heading", { name: "Running Count", level: 1 })).toBeVisible();
    await expect(main(page).getByRole("radio", { name: /^Starter/ })).toBeChecked();
    await expectOneEnterAction(page, "Start counting");
    await pressEnterOnPage(page);

    const field = main(page).getByLabel("Running count", { exact: true });
    await expect(field).toBeVisible({ timeout: 20_000 });
    await expect(field).toBeFocused();
    await expectOneEnterAction(page, "Check count");

    // A blank or malformed count is not graded.
    await field.press("Enter");
    await expect(main(page).getByText("Enter a whole number, like −2 or 3.")).toBeVisible();
    await expect(field).toHaveAttribute("aria-invalid", "true");

    await field.fill("99");
    await field.press("Enter");
    const verdict = main(page).getByRole("group", { name: "Not quite" });
    await expect(verdict).toContainText("Off by");
    await expect(verdict).toContainText("Running count");
    await expectOneEnterAction(page, "Continue");
    await settle(page);
    await verdict.getByRole("button", { name: "Continue" }).click();

    await main(page).getByRole("button", { name: "End drill" }).click();
    await expect(main(page).getByText("Session complete")).toBeVisible();
    await expect(main(page).getByRole("heading", { name: "Running Count", level: 1 })).toBeVisible();
    await expectOneEnterAction(page, "Try again");
    await expect(main(page).getByText("Mistakes (1)")).toBeVisible();
    expect(await sessions(page)).toHaveLength(1);
    expect(await progress(page, "Running Count")).toBeNull();
  });

  test("a reload mid-deal resumes, and discarding returns to the session the reader came for", async ({ page }) => {
    await page.goto("/training/running-count/?session=starter");
    await clickVisible(page, "Start counting");
    await expect(page.getByRole("region", { name: "Session progress" })).toContainText(/Card [2-4] of 20/, { timeout: 15_000 });
    await page.reload();
    await expect(main(page).getByText("Picked up where you left off")).toBeVisible();
    // Older app versions only know the "answer" and "paused" phases.
    const saved = JSON.parse((await progress(page, "Running Count"))!);
    expect(["answer", "paused"]).toContain(saved.state.phase);
    expect(saved.state.cards).toHaveLength(20);
    await expect(visibleEnterActions(page)).toHaveCount(1);

    await main(page).getByRole("button", { name: "Start Starter instead" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Discard session" }).click();
    await expect(main(page).getByRole("radio", { name: /^Starter/ })).toBeChecked();
    expect(await progress(page, "Running Count")).toBeNull();
    expect(await sessions(page)).toHaveLength(0);
  });

  test("switching tabs pauses the deal and pausing keeps the count hidden", async ({ page }) => {
    await page.goto("/training/running-count/?session=starter");
    await clickVisible(page, "Start counting");
    const hud = page.getByRole("region", { name: "Session progress" });
    await expect(hud).toContainText(/Card [1-3] of 20/, { timeout: 15_000 });
    await hideTab(page);
    await expect(main(page).getByRole("heading", { name: "Paused" })).toBeVisible();
    const card = async () => (await hud.innerText()).match(/Card \d+ of 20/)![0];
    const pausedAt = await card();
    await page.waitForTimeout(1500);
    expect(await card()).toBe(pausedAt);
    await expectOneEnterAction(page, "Resume session");
    await expect(main(page).getByText("Running count so far")).toHaveCount(0);
    await main(page).getByRole("button", { name: "Show my count" }).click();
    await expect(main(page).getByText("Running count so far")).toBeVisible();
  });

  test("an unfinished session synced after the page opened is offered, not overwritten", async ({ page }) => {
    await page.goto("/training/running-count/");
    await expect(main(page).getByRole("button", { name: "Customize" })).toBeVisible();
    await page.evaluate((key) => {
      const cards = Array.from({ length: 20 }, () => ({ rank: "5", suit: "hearts" }));
      const state = { preset: "one-deck-speed", decks: 1, amount: 20, speed: 1000, group: "1", checkpoint: "5", bias: "none", feedbackMode: "immediate", phase: "paused", cards, cursor: 7, size: 1, answer: "", checks: 1, correct: 1, streak: 1, best: 1, mistakes: [], categories: {}, elapsed: 9000, interruptionUsed: false };
      localStorage.setItem(key, JSON.stringify({ drill: "Running Count", state, updatedAt: new Date().toISOString() }));
      dispatchEvent(new Event("hilo-storage"));
    }, progressKey("Running Count"));
    await expect(main(page).getByText("You have an unfinished session")).toBeVisible();
    await expect(main(page).getByText(/Card 7 of 20/)).toBeVisible();
    await main(page).getByRole("button", { name: "Resume it" }).click();
    await expect(main(page).getByRole("heading", { name: "Paused" })).toBeVisible();
  });
});

test.describe("true count", () => {
  test("the shoe size picker sets the shoe the questions come from", async ({ page }) => {
    await page.goto("/training/true-count/");
    // Radios are addressed directly: the shared SegmentedControl's legend does not name its group.
    await main(page).getByRole("radio", { name: "8", exact: true }).check();
    await expect(main(page).getByText(/8-deck shoe/).first()).toBeVisible();
    await clickVisible(page, "Start 10 questions");
    await expect(main(page).getByText("8-deck shoe").first()).toBeVisible();
    await expect(main(page).locator("p", { hasText: /^([+\u2212]\d+|0)$/ }).first()).toBeVisible();
    await expect(main(page).getByLabel("True count", { exact: true })).toBeFocused();
  });

  test("Enter on a chosen session starts it, and a double Enter cannot skip a question", async ({ page }) => {
    await page.goto("/training/true-count/");
    const card = main(page).getByRole("radio", { name: /^Division only/ });
    await card.check();
    await card.focus();
    await page.keyboard.press("Enter");
    const field = main(page).getByLabel("True count", { exact: true });
    await expect(field).toBeFocused();
    await expectOneEnterAction(page, "Check answer");
    await field.fill("\u221299");
    await field.press("Enter");
    await expect(main(page).getByRole("group", { name: "Not quite" })).toBeVisible();
    await expectOneEnterAction(page, "Next question");
    await settle(page);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    const hud = page.getByRole("region", { name: "Session progress" });
    await expect(hud).toContainText("Question 2 of 10");
    await expect(main(page).getByText("Enter a whole number, like −2 or 3.")).toBeVisible();
    await expect(hud).toContainText("0%");
  });

  test("results at the end keep accuracy out of the progress bar", async ({ page }) => {
    await page.goto("/training/true-count/");
    await main(page).getByRole("button", { name: "Customize" }).click();
    await main(page).getByRole("radio", { name: "At the end" }).check();
    await clickVisible(page, /Start \d+ questions/);
    await main(page).getByLabel("True count", { exact: true }).fill("0");
    await main(page).getByLabel("True count", { exact: true }).press("Enter");
    const hud = page.getByRole("region", { name: "Session progress" });
    await expect(hud).toContainText("Answered");
    await expect(hud).toContainText("Question 2 of");
    await expect(hud).not.toContainText("Accuracy");
    await expect(main(page).getByRole("group", { name: /Correct|Not quite/ })).toHaveCount(0);
  });

  test("the Test Out hand-off focuses the questions and is consumed", async ({ page }) => {
    await seedOnce(page, {}, { "countlab:practice-focus": { drill: "True Count", category: "negative count" } });
    await page.goto("/training/true-count/");
    await expect(main(page).getByText("Focused practice")).toBeVisible();
    await expect(main(page).getByText("Negative counts", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("countlab:practice-focus"))).toBeNull();
  });

  test("ending before any answer saves nothing", async ({ page }) => {
    await page.goto("/training/true-count/");
    await clickVisible(page, /Start \d+ questions/);
    await main(page).getByRole("button", { name: "End drill" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "End without saving" }).click();
    await expect(main(page).getByRole("heading", { name: "Choose a session" })).toBeVisible();
    expect(await sessions(page)).toHaveLength(0);
    expect(await progress(page, "True Count")).toBeNull();
  });

  test("the last answer saves the session once and nothing can revive it", async ({ page }) => {
    await page.goto("/training/true-count/");
    await main(page).getByRole("button", { name: "Customize" }).click();
    await main(page).getByRole("radio", { name: "5", exact: true }).check();
    await clickVisible(page, "Start 5 questions");
    for (let question = 1; question <= 5; question++) {
      await main(page).getByRole("button", { name: "Skip question" }).click();
      await expect(main(page).getByRole("group", { name: "Not quite" })).toBeVisible();
      if (question < 5) { await settle(page); await main(page).getByRole("button", { name: "Next question" }).click(); }
    }
    await expectOneEnterAction(page, "See results");
    expect(await sessions(page)).toHaveLength(1);
    await hideTab(page);
    await page.waitForTimeout(600);
    expect(await progress(page, "True Count")).toBeNull();
    await page.reload();
    await expect(main(page).getByRole("heading", { name: "Choose a session" })).toBeVisible();
    expect(await progress(page, "True Count")).toBeNull();
    const saved = await sessions(page);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ drill: "True Count", questions: 5 });
  });
});

test.describe("deck estimation", () => {
  test("a decimal comma is accepted and the photo stays beside the verdict", async ({ page }) => {
    await page.goto("/training/deck-estimation/");
    await expect(main(page).getByRole("radio", { name: "1 (not enough photos yet)" })).toBeDisabled();
    await clickVisible(page, /Start \d+ estimates/);
    const field = main(page).getByLabel("Decks remaining");
    await expect(field).toBeFocused();
    await field.fill("2,5");
    await field.press("Enter");
    await expect(main(page).getByRole("group", { name: /Correct|Not quite/ })).toBeVisible();
    await expect(main(page).getByRole("img", { name: /Discard tray photo/ })).toBeVisible();
    await expectOneEnterAction(page, "Next tray");
  });

  test("progress saved on the last feedback shows results instead of an 11th tray", async ({ page }) => {
    const state = { decks: 6, resolution: 0.5, feedbackMode: "immediate", phase: "feedback", question: 10, remaining: 3.79, photo: { file: "images/tray-0015.jpg", decks: 3.79, numDecks: 6 }, answer: "4", correct: 9, errors: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], mistakes: [], categories: {}, message: "Correct: 4 decks remain", totalMs: 20000 };
    await seedOnce(page, { [progressKey("Deck Estimation")]: { drill: "Deck Estimation", state, updatedAt: new Date().toISOString() } });
    await page.goto("/training/deck-estimation/");
    await expect(page.getByRole("region", { name: "Session progress" })).toContainText("Tray 10 of 10");
    await expect(main(page).getByText("Tray 11")).toHaveCount(0);
    await expectOneEnterAction(page, "See results");
    await main(page).getByRole("button", { name: "See results" }).click();
    await expect(main(page).getByText("Session complete")).toBeVisible();
    expect(await sessions(page)).toHaveLength(1);
    expect(await progress(page, "Deck Estimation")).toBeNull();
  });
});

test.describe("counting benchmark", () => {
  test("a new reader gets an empty state with the starter drill", async ({ page }) => {
    await page.goto("/training/benchmark/");
    await expect(main(page).getByText("No counting sessions yet")).toBeVisible();
    await main(page).getByRole("link", { name: "Start the starter drill" }).click();
    await expect(main(page).getByRole("radio", { name: /^Starter/ })).toBeChecked();
  });

  test("target links open the drill set up for that target, also in a new tab", async ({ page }) => {
    await page.goto("/training/benchmark/");
    await expect(main(page).getByRole("link", { name: "Practice Running Count" })).toHaveAttribute("href", /focus=one-deck-speed/);
    await main(page).getByRole("link", { name: "Practice Running Count" }).click();
    await expect(main(page).getByRole("radio", { name: /^One-deck speed/ })).toBeChecked();
    await expect(main(page).getByText("Focused practice")).toBeVisible();
    await page.goto("/training/benchmark/");
    await main(page).getByRole("link", { name: "Practice: Estimate within 0.25 decks on average" }).click();
    await expect(main(page).getByRole("radio", { name: /^Quarter deck/ })).toBeChecked();
  });

  test("a weak spot opens True Count focused on it", async ({ page }) => {
    const base = { questions: 10, correct: 5, accuracy: 50, averageResponseTime: 2000, bestStreak: 2, mistakes: [], date: new Date().toISOString() };
    await seedOnce(page, { [`${PREFIX}hilo:sessions`]: [{ ...base, id: "tc", drill: "True Count", categories: { "negative, 0.5-deck divisor": { correct: 1, total: 5 }, "positive, 0.5-deck divisor": { correct: 4, total: 5 } } }] });
    await page.goto("/training/benchmark/");
    await expect(main(page).getByText("Latest: 50% (target 95%)")).toBeVisible();
    await main(page).getByRole("button", { name: /Negative counts/ }).click();
    await expect(main(page).getByText("Focused practice")).toBeVisible();
    await expect(main(page).getByText("Negative counts", { exact: true })).toBeVisible();
  });
});

test("the True Count question fits a 320 × 568 phone with the keypad clear of every bar", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-se", "Checks the smallest touch phone.");
  await page.goto("/training/true-count/");
  await main(page).getByRole("radio", { name: /^Tray \+ division/ }).check();
  await clickVisible(page, /Start \d+ questions/);
  await expect(main(page).getByLabel("True count", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeHidden();
  for (const name of ["Delete last digit", "Plus or minus", "Decimal point", "Next"]) {
    const key = main(page).getByRole("button", { name, exact: true });
    await key.scrollIntoViewIfNeeded();
    const hit = await key.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
    });
    expect(hit, name).toBe(true);
    expect((await key.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByRole("region", { name: "Session progress" })).toBeInViewport();
});

test("verdicts, selected sessions and tray labels keep AA contrast in both themes", async ({ page }) => {
  const contrastOf = (selector: string) => page.locator(selector).first().evaluate((element) => {
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
  await page.goto("/training/true-count/");
  await main(page).getByRole("radio", { name: /^Tray \+ division/ }).check();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    expect(await contrastOf("main label:has(input[type='radio']:checked) span.font-semibold"), `${theme} selected session`).toBeGreaterThanOrEqual(4.5);
  }
  await clickVisible(page, /Start \d+ questions/);
  await main(page).getByLabel("Estimated decks remaining").fill("1");
  await main(page).getByLabel("True count", { exact: true }).fill("99");
  await main(page).getByLabel("True count", { exact: true }).press("Enter");
  await expect(main(page).getByRole("group", { name: "Not quite" })).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    expect(await contrastOf("main [role='group'][aria-labelledby] p[id]"), `${theme} verdict`).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf("main [role='group'][aria-labelledby] td"), `${theme} answer row`).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf("main [aria-label*='decks discarded'] span.rounded"), `${theme} tray label`).toBeGreaterThanOrEqual(4.5);
  }
});
