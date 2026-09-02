import { expect, test, type Page } from "@playwright/test";

async function prepareGuest(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("countlab:guest", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
  });
}

/**
 * The exam page, scoped past the Full Shoe game.
 *
 * `AppShell` keeps `FullShoeGame` mounted and hidden outside the router, so an
 * unscoped `main` query also sees that game's heading and controls.
 */
const exam = (page: Page) => page.getByRole("main");

/** Shrink an exam to a length a test can actually finish. */
async function configureConversionSection(page: Page, questions: number, seconds: number) {
  await exam(page).getByLabel("Exam").selectOption("quick-true-count");
  await exam(page).getByLabel("True count questions").fill(String(questions));
  await exam(page).getByLabel("True count time limit (seconds)").fill(String(seconds));
}

/** Read the true count the current question is asking for, and answer it. */
async function answerConversionQuestion(page: Page, correctly: boolean) {
  // The prompt's group label carries both halves of the question in one string.
  const prompt = await exam(page)
    .locator("[aria-label^='Running count']")
    .getAttribute("aria-label");
  const match = /Running count ([+-]?\d+) with ([\d.]+) decks remaining/.exec(prompt ?? "");
  expect(match, `could not read the conversion prompt, got: ${prompt}`).not.toBeNull();
  const runningCount = Number(match![1]);
  const decks = Number(match![2]);
  // The presets grade on floor rounding, which is also the default setting.
  const answer = Math.floor(runningCount / decks);
  await exam(page).getByLabel("True count", { exact: true }).fill(String(correctly ? answer : answer + 7));
  await exam(page).getByLabel("True count", { exact: true }).press("Enter");
}

test.describe("test out", () => {
  test.beforeEach(async ({ page }) => {
    await prepareGuest(page);
  });

  test("runs a configured exam end to end and certifies a pass", async ({ page }) => {
    await page.goto("/training/test-out/");
    await expect(exam(page).getByRole("heading", { name: "Test Out", level: 1 })).toBeVisible();

    await configureConversionSection(page, 2, 0);
    await exam(page).getByRole("button", { name: "Start exam" }).click();

    // The stage gate states the section's terms before its clock starts.
    await expect(exam(page).getByRole("heading", { name: "Section 1 of 1" })).toBeVisible();
    await exam(page).getByRole("button", { name: /Start true count/i }).click();

    await expect(exam(page).getByText("1 / 2")).toBeVisible();
    await answerConversionQuestion(page, true);
    await expect(exam(page).getByText("2 / 2")).toBeVisible();
    await answerConversionQuestion(page, true);

    await expect(exam(page).getByRole("heading", { name: "Passed", level: 1 })).toBeVisible();
    await expect(exam(page).getByText("2 of 2 correct")).toBeVisible();
    await expect(exam(page).getByText(/Certified on .* until /)).toBeVisible();

    // The pass is recorded under its own drill so it cannot pollute another
    // drill's history, and carries the verdict the certification is derived from.
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem("hilo:sessions") ?? "[]")[0]);
    expect(session.drill).toBe("Test Out");
    expect(session.metrics.passed).toBe(true);
    expect(session.tags).toContain("test-out");
  });

  test("scores questions the clock swallowed as wrong and still reports the section", async ({ page }) => {
    await page.goto("/training/test-out/");
    await configureConversionSection(page, 3, 10);
    await exam(page).getByRole("button", { name: "Start exam" }).click();
    await exam(page).getByRole("button", { name: /Start true count/i }).click();

    await expect(exam(page).getByText("1 / 3")).toBeVisible();
    await answerConversionQuestion(page, true);

    // Let the section's clock run out on the two remaining questions.
    await expect(exam(page).getByRole("heading", { name: "Not yet", level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(exam(page).getByText("1 of 3 correct")).toBeVisible();
    // DataTable renders the phone card and the desktop table into the same DOM
    // and hides one by viewport, so assert on whichever is actually shown.
    await expect(exam(page).getByText(/out of time/).filter({ visible: true })).toHaveCount(1);
  });

  test("disabling a section removes its stage", async ({ page }) => {
    await page.goto("/training/test-out/");
    // The full checkout runs every section; turning one off must shorten the run.
    await expect(exam(page).getByText(/^7 sections · /)).toBeVisible();
    await exam(page).getByRole("switch", { name: "Include Capstone shoe" }).click();
    await expect(exam(page).getByText(/^6 sections · /)).toBeVisible();
    await expect(exam(page).getByLabel("Capstone shoe rounds")).toHaveCount(0);
  });

  test("blocks an exam with nothing enabled instead of running an empty one", async ({ page }) => {
    await page.goto("/training/test-out/");
    for (const name of ["Running count", "Deck estimation", "True count", "Basic strategy", "Index deviations", "Bet sizing", "Capstone shoe"]) {
      await exam(page).getByRole("switch", { name: `Include ${name}` }).click();
    }
    await expect(exam(page).getByText("Enable at least one section.")).toBeVisible();
    await expect(exam(page).getByRole("button", { name: "Start exam" })).toBeDisabled();
  });

  test("the retired proficiency test redirects to the exam", async ({ page }) => {
    await page.goto("/training/proficiency-test/");
    await expect(page).toHaveURL(/\/training\/test-out\/?$/);
    await expect(exam(page).getByRole("heading", { name: "Test Out", level: 1 })).toBeVisible();
  });

  test("a lapsed certification asks to be renewed on the practice hub", async ({ page }) => {
    await page.addInitScript(() => {
      const passedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      localStorage.setItem("hilo:sessions", JSON.stringify([{
        id: "lapsed-exam",
        drill: "Test Out",
        questions: 10,
        correct: 10,
        accuracy: 100,
        averageResponseTime: 2000,
        bestStreak: 10,
        date: passedAt,
        mistakes: [],
        metrics: { examId: "hi-lo-checkout", examName: "Hi-Lo Checkout", passed: true, validDays: 30 },
        tags: ["test-out", "hi-lo-checkout", "passed"],
      }]));
    });
    await page.goto("/practice/");
    await expect(exam(page).getByRole("heading", { name: "Certifications" })).toBeVisible();
    await expect(exam(page).getByText("Lapsed — retake to renew")).toBeVisible();
  });
});
