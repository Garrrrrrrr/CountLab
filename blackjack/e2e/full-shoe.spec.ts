import { expect, test, type Page } from "@playwright/test";

async function prepareGuest(page: Page, settings: Record<string, unknown> = {}) {
  await page.addInitScript((settings) => {
    localStorage.setItem("countlab:guest", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
    localStorage.setItem("countlab:account:guest:hilo:settings", JSON.stringify({ surrender: "late", ...settings }));
  }, settings);
}

/** A seeded Math.random, installed just before the shoe is shuffled. */
async function seed(page: Page, value: number) {
  await page.evaluate((value) => {
    let state = value;
    Math.random = () => ((state = (state * 1_664_525 + 1_013_904_223) >>> 0) / 4_294_967_296);
  }, value);
}

/** Segmented controls are radios inside labels; click the radio itself so fixed bars never get in the way. */
const pick = (page: Page, group: string, option: string) =>
  page.getByRole("group", { name: group }).locator("label", { hasText: option }).first().locator("input").evaluate((input: HTMLInputElement) => input.click());

async function open(page: Page, { mode = "Coached", checks = "off", decks, penetration }: { mode?: "Coached" | "Checkout"; checks?: string; decks?: string; penetration?: string } = {}) {
  await page.goto("/train/full-shoe/");
  await expect(page.getByRole("heading", { name: "Full Shoe", level: 1 })).toBeVisible();
  await page.getByRole("radio", { name: new RegExp(`^${mode}`) }).dispatchEvent("click");
  if (decks) await pick(page, "Decks", decks);
  if (penetration) await pick(page, "Penetration (where the cut card sits)", penetration);
  await page.getByLabel("Count checks between rounds").selectOption(checks);
  await pick(page, "Dealing speed", "Fast");
}

const start = (page: Page, mode: "Coached" | "Checkout" = "Coached") =>
  page.getByRole("button", { name: mode === "Coached" ? "Buy in and shuffle" : "Start checkout" }).filter({ visible: true }).first().click();
const fiveChip = (page: Page) => page.getByRole("button", { name: "Add a $5 chip" });
const deal = (page: Page) => page.getByRole("button", { name: /^Deal/ }).click();
const action = (page: Page, name: string) => page.getByRole("group", { name: "Choose an action" }).getByRole("button", { name: new RegExp(`^${name}`) });
/** An action button that can be pressed right now; `isVisible` answers at once instead of waiting. */
const ready = (page: Page, name: string) => page.getByRole("group", { name: "Choose an action" }).locator("button:not([disabled])", { hasText: new RegExp(`^${name}`) });
const visible = (locator: ReturnType<Page["locator"]>) => locator.isVisible().catch(() => false);

test("a checkout stays silent, finishes the shoe, and files its report", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One desktop shoe is enough.");
  test.setTimeout(90_000);
  await prepareGuest(page);
  await open(page, { mode: "Checkout", checks: "3", decks: "1", penetration: "65%" });
  await start(page, "Checkout");

  await expect(page.getByTestId("full-shoe-empty-tray").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Coach" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^EV/ })).toHaveCount(0);

  // Underbet the first round on purpose: a checkout must not say so.
  await fiveChip(page).click();
  await deal(page);
  await expect(page.getByText("Bet off the ramp")).toHaveCount(0);

  for (let step = 0; step < 400; step++) {
    if (await page.getByRole("heading", { name: /Checkout report|Shoe ended early/ }).isVisible().catch(() => false)) break;
    const dealButton = page.getByRole("button", { name: /^Deal/ });
    const decline = page.locator("button:not([disabled])", { hasText: /^(No insurance|No, play it)/ });
    const countCheck = page.getByTestId("count-check");
    if (await visible(countCheck)) {
      const prompt = (await countCheck.getByRole("heading").textContent()) ?? "";
      await page.keyboard.type(prompt.startsWith("Decks") ? "0.5" : "0");
      await page.keyboard.press("Enter");
    } else if (await visible(dealButton)) {
      await fiveChip(page).click();
      await fiveChip(page).click();
      await dealButton.click();
    } else if (await visible(decline)) {
      await decline.click();
    } else if (await visible(ready(page, "Stand"))) {
      await ready(page, "Stand").click();
    } else {
      await page.waitForTimeout(60);
    }
  }

  await expect(page.getByRole("heading", { name: "Checkout report" })).toBeVisible();
  for (const category of ["Betting", "Basic strategy", "Running count", "True count"]) await expect(page.getByTestId("scorecard").getByText(category, { exact: true })).toBeVisible();
  // The underbet is the first mistake: "You: $5 · Right: 1 × $10".
  await expect(page.getByText("1 × $10").first()).toBeVisible();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("countlab:account:guest:hilo:sessions") || "[]"));
  expect(saved[0]).toMatchObject({ drill: "Full Shoe", metrics: { mode: "checkout", stacked: true, completionReason: "shoe-complete" }, tags: ["checkout", "stacked", "late"] });
  expect(saved[0].categories["Running count"].total).toBeGreaterThan(0);

  const grader = page.getByTestId("hand-grader");
  await expect(grader.locator("[data-round='1']")).toHaveAttribute("data-grade", "error");
  const rounds = await grader.getByTestId("hand-grade-tile").count();
  expect(rounds).toBeGreaterThan(1);

  // The shoe is in the library and reopens with the same rounds.
  await page.getByRole("button", { name: "Change the setup" }).click();
  await expect(page.getByTestId("saved-shoe-row")).toHaveCount(1);
  await page.getByTestId("review-saved-shoe").click();
  await expect(page.getByTestId("hand-grade-tile")).toHaveCount(rounds);
  await expect(page.getByTestId("hand-grader").locator("[data-round='1']")).toHaveAttribute("data-grade", "error");
});

test("coached play splits, explains, and checks the count", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One desktop flow is enough.");
  await prepareGuest(page);
  await open(page, { checks: "every" });
  await seed(page, 4612); // 8,8 against a 6
  await start(page);
  await fiveChip(page).click();
  await fiveChip(page).click();
  await deal(page);
  await expect(page.getByText("Bet on the ramp").first()).toBeVisible();
  await action(page, "Split").click();
  await expect(page.getByText("Split is right").first()).toBeVisible();
  await expect(page.getByTestId("full-shoe-player-hand")).toHaveCount(2);
  // A split hand cannot surrender.
  await expect(action(page, "Surrender")).toBeDisabled();

  const check = page.getByTestId("count-check");
  for (let i = 0; i < 100 && !(await visible(check)); i++) {
    if (await visible(ready(page, "Stand"))) await ready(page, "Stand").click();
    else await page.waitForTimeout(100);
  }
  await expect(check).toBeVisible({ timeout: 10_000 });
  await page.keyboard.type("99");
  await page.keyboard.press("Enter");
  await page.keyboard.type("6");
  await page.keyboard.press("Enter");
  await page.keyboard.type("0");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Count off").first()).toBeVisible();
  await page.getByRole("button", { name: /^Next bet/ }).click();
  await expect(page.getByRole("button", { name: /^Deal/ })).toBeVisible();
});

test("a custom ramp grades and persists when the shoe ends early", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One desktop check is enough.");
  await prepareGuest(page);
  await open(page, { mode: "Checkout" });
  await expect(page.getByLabel("+1", { exact: true })).toHaveValue("20");
  await page.getByLabel("+1", { exact: true }).fill("37");
  await page.getByLabel("+1", { exact: true }).blur();
  await expect(page.getByRole("group", { name: "Bet ramp" }).getByRole("radio", { name: "Custom" })).toBeChecked();
  await page.getByLabel("One unit").fill("12.5");
  await page.getByLabel("One unit").blur();
  await expect(page.getByLabel("+1", { exact: true })).toHaveValue("37");
  await start(page, "Checkout");
  await fiveChip(page).click();
  await deal(page);
  await page.getByRole("button", { name: "End drill" }).click();
  await page.getByRole("button", { name: "End and see the report" }).click();
  await expect(page.getByRole("heading", { name: "Shoe ended early" })).toBeVisible();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("countlab:account:guest:hilo:sessions") || "[]"));
  expect(saved[0]).toMatchObject({ drill: "Full Shoe", questions: 1, correct: 0, metrics: { completionReason: "ended", mode: "checkout", rampTc1: 37, rampTc6Plus: 80 } });
});

test("the table fits the phone screen without scrolling", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chromium", "Phones only.");
  await prepareGuest(page);
  await open(page);
  await seed(page, 31709); // 8,8 against a 9: split into four hands
  await start(page);
  await fiveChip(page).click();
  await fiveChip(page).click();
  await deal(page);
  for (let i = 0; i < 3; i++) await action(page, "Split").click();
  await expect(page.getByTestId("full-shoe-player-hand")).toHaveCount(4);
  const overflow = await page.evaluate(() => ({ x: document.documentElement.scrollWidth - window.innerWidth, y: document.documentElement.scrollHeight - window.innerHeight }));
  expect(overflow.x).toBeLessThanOrEqual(0);
  expect(overflow.y).toBeLessThanOrEqual(0);
  for (const hand of await page.getByTestId("full-shoe-player-hand").all()) {
    const box = (await hand.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
});
