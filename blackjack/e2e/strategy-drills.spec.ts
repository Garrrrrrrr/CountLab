import { expect, test, type Page } from "@playwright/test";

const ACCOUNT = "countlab:account:guest:";
const SESSIONS = `${ACCOUNT}hilo:sessions`;
const PROGRESS = `${ACCOUNT}hilo:progress:Basic Strategy`;

type Setup = {
  pref?: Record<string, unknown>;
  devPref?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  focus?: { drill: string; category: string };
  seed?: Record<string, unknown>;
};

/** A guest with analytics declined; optional device setup, saved settings, a practice focus and stored keys. */
async function prepare(page: Page, setup: Setup = {}) {
  await page.addInitScript(({ pref, devPref, settings, focus, seed, account }) => {
    if (sessionStorage.getItem("e2e-prepared")) return;
    sessionStorage.setItem("e2e-prepared", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
    localStorage.setItem("countlab:guest", "1");
    if (pref) localStorage.setItem("countlab:drill-setup:basic-strategy", JSON.stringify(pref));
    if (devPref) localStorage.setItem("countlab:drill-setup:deviations", JSON.stringify(devPref));
    if (settings) localStorage.setItem(`${account}hilo:settings`, JSON.stringify(settings));
    if (focus) sessionStorage.setItem("countlab:practice-focus", JSON.stringify(focus));
    for (const [key, value] of Object.entries(seed ?? {})) localStorage.setItem(key, JSON.stringify(value));
  }, { ...setup, account: ACCOUNT });
}

const hud = (page: Page) => page.getByRole("region", { name: "Session progress" });
/** The HUD's "Correct" figure: "right of answered". */
const answered = (page: Page, count: number) => expect(hud(page).locator("dd").first()).toHaveText(new RegExp(`of ${count}$`));
const sessions = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), SESSIONS);

/** Answers the hand on screen with a key it accepts: H on a play question, N on a surrender question. */
async function answerByKey(page: Page) {
  const surrender = await page.getByRole("heading", { name: "Surrender, or play the hand out?" }).count();
  await page.keyboard.press(surrender ? "n" : "h");
}

async function startWithEnter(page: Page) {
  await page.getByRole("heading", { name: "Set up your round" }).waitFor();
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Enter");
}

test.describe("basic strategy on a keyboard", () => {
  test.skip(({ isMobile }) => isMobile, "Keyboard flows run on desktop.");

  test("Enter starts, a paused answer ignores answer keys, and one Enter moves on exactly one hand", async ({ page }) => {
    await prepare(page, { pref: { explain: "every" } });
    await page.goto("/training/basic-strategy/");
    await expect(page.getByRole("button", { name: "Start 10 hands" })).toBeVisible();
    await startWithEnter(page);
    await expect(hud(page).getByText("Hand 1 of 10", { exact: true })).toBeVisible();

    await answerByKey(page);
    const feedback = page.getByTestId("drill-feedback");
    await expect(feedback).toBeVisible();
    await answered(page, 1);
    // Answer keys do nothing while the reason is showing.
    await page.keyboard.press("h");
    await page.keyboard.press("n");
    await answered(page, 1);

    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");
    await expect(hud(page).getByText("Hand 2 of 10", { exact: true })).toBeVisible();
    await expect(feedback).toHaveCount(0);
    // A second Enter lands on the table, not on an answer button.
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await expect(hud(page).getByText("Hand 2 of 10", { exact: true })).toBeVisible();
    await expect(feedback).toHaveCount(0);
  });

  test("keys held with Ctrl, Cmd or Alt never answer", async ({ page }) => {
    await prepare(page, { pref: { explain: "every" } });
    await page.goto("/training/basic-strategy/");
    await page.getByRole("button", { name: "Start 10 hands" }).click();
    await expect(hud(page).getByText("Hand 1 of 10", { exact: true })).toBeVisible();
    for (const chord of ["Control+s", "Control+h", "Alt+h", "Meta+d", "Control+n"]) await page.keyboard.press(chord);
    await page.waitForTimeout(300);
    await expect(page.getByTestId("drill-feedback")).toHaveCount(0);
    await expect(hud(page).locator("dd").first()).toHaveText("0 of 0");
  });

  test("Enter starts the round after choosing an option", async ({ page }) => {
    await prepare(page);
    await page.goto("/training/basic-strategy/");
    await page.getByRole("radio", { name: "20 hands" }).click();
    await expect(page.getByRole("button", { name: "Start 20 hands" })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(hud(page).getByText("Hand 1 of 20", { exact: true })).toBeVisible();
  });

  test("a finished round shows its summary and records one session", async ({ page }) => {
    await prepare(page, { pref: { explain: "never" } });
    await page.goto("/training/basic-strategy/");
    await page.getByRole("button", { name: "Start 10 hands" }).click();
    for (let hand = 0; hand < 10; hand += 1) {
      await answered(page, hand);
      await answerByKey(page);
    }
    await expect(page.getByRole("heading", { level: 1, name: /Basic Strategy: \d+ of 10/ })).toBeVisible();
    const saved = await sessions(page);
    expect(saved).toHaveLength(1);
    expect(saved[0].drill).toBe("Basic Strategy");
    expect(saved[0].questions).toBe(10);
    expect(typeof saved[0].categories).toBe("object");
    expect(Object.values(saved[0].categories as Record<string, { total: number }>).reduce((sum, value) => sum + value.total, 0)).toBe(10);
    await expect(page.getByRole("button", { name: "Play again" })).toBeVisible();
  });

  test("ending before any answer saves nothing", async ({ page }) => {
    await prepare(page);
    await page.goto("/training/basic-strategy/");
    await page.getByRole("button", { name: "Start 10 hands" }).click();
    await hud(page).getByRole("button", { name: "End round" }).click();
    await expect(page.getByText("Nothing was answered, so nothing was saved.")).toBeVisible();
    expect(await sessions(page)).toHaveLength(0);
  });

  test("ending after three answers asks first, then saves a three-hand round", async ({ page }) => {
    await prepare(page, { pref: { explain: "never" } });
    await page.goto("/training/basic-strategy/");
    await page.getByRole("button", { name: "Start 10 hands" }).click();
    for (let hand = 0; hand < 3; hand += 1) {
      await answered(page, hand);
      await answerByKey(page);
    }
    await answered(page, 3);
    await hud(page).getByRole("button", { name: "End round" }).click();
    const dialog = page.getByRole("dialog", { name: "End this round?" });
    await expect(dialog).toContainText("3 of 10 hands answered");
    await dialog.getByRole("button", { name: "End and save" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /Basic Strategy: \d+ of 3/ })).toBeVisible();
    expect((await sessions(page))[0].questions).toBe(3);
  });

  test("a reload resumes the round where it stopped", async ({ page }) => {
    await prepare(page, { pref: { explain: "never" } });
    await page.goto("/training/basic-strategy/");
    await page.getByRole("button", { name: "Start 10 hands" }).click();
    await answerByKey(page);
    await answered(page, 1);
    await answerByKey(page);
    await answered(page, 2);
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.getByText("Picked up where you left off")).toBeVisible();
    await expect(hud(page).getByText("Hand 3 of 10", { exact: true })).toBeVisible();
  });

  test("progress saved on the old last-hand screen is recorded once, not dealt again", async ({ page }) => {
    await prepare(page, {
      seed: {
        [PROGRESS]: {
          drill: "Basic Strategy",
          updatedAt: new Date().toISOString(),
          state: { q: 9, mode: "standard", correctCount: 10, streak: 10, best: 10, totalMs: 9000, mistakes: [], categories: { Pairs: { correct: 4, total: 4 }, "Hard totals": { correct: 6, total: 6 } } },
        },
      },
    });
    await page.goto("/training/basic-strategy/");
    await expect(page.getByRole("heading", { level: 1, name: "Basic Strategy: 10 of 10" })).toBeVisible();
    const saved = await sessions(page);
    expect(saved).toHaveLength(1);
    expect(saved[0].questions).toBe(10);
    expect(await page.evaluate((key) => localStorage.getItem(key), PROGRESS)).toBeNull();
  });

  test("the last answer records the round, so a reload on its explanation does not count it twice", async ({ page }) => {
    await prepare(page, { pref: { explain: "every" } });
    await page.goto("/training/basic-strategy/");
    await page.getByRole("button", { name: "Start 10 hands" }).click();
    for (let hand = 0; hand < 10; hand += 1) {
      await answerByKey(page);
      await expect(page.getByTestId("drill-feedback")).toBeVisible();
      if (hand < 9) {
        await page.waitForTimeout(450);
        await page.getByRole("button", { name: "Next hand" }).click();
      }
    }
    await expect(page.getByRole("button", { name: "See results" })).toBeVisible();
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Set up your round" })).toBeVisible();
    const saved = await sessions(page);
    expect(saved).toHaveLength(1);
    expect(saved[0].questions).toBe(10);
  });

  test("Weak spots never deals surrender at a table without it", async ({ page }) => {
    const later = new Date(Date.now() + 86_400_000).toISOString();
    const box = (itemKey: string) => ({ itemKey, box: 3, dueAt: later, lastSeenAt: new Date().toISOString() });
    await prepare(page, {
      pref: { mode: "adaptive", explain: "never", length: 20 },
      settings: { surrender: "none" },
      seed: { [`${ACCOUNT}hilo:leitner:Basic Strategy`]: { "Hard totals": box("Hard totals"), "Soft totals": box("Soft totals"), Pairs: box("Pairs") } },
    });
    await page.goto("/training/basic-strategy/");
    await expect(page.getByRole("radio", { name: "Weak spots" })).toBeChecked();
    await page.getByRole("button", { name: "Start 20 hands" }).click();
    for (let hand = 0; hand < 20; hand += 1) {
      await answered(page, hand);
      await expect(page.getByRole("heading", { name: "Surrender, or play the hand out?" })).toHaveCount(0);
      await page.keyboard.press("h");
    }
    await expect(page.getByRole("heading", { level: 1, name: /Basic Strategy: \d+ of 20/ })).toBeVisible();
  });

  test("a weak-spot hand-off wins over an unfinished round, which stays one click away", async ({ page }) => {
    await prepare(page, {
      focus: { drill: "Basic Strategy", category: "Soft totals" },
      seed: {
        [PROGRESS]: { drill: "Basic Strategy", updatedAt: new Date().toISOString(), state: { q: 3, mode: "standard", correctCount: 2, streak: 0, best: 2, totalMs: 3000, mistakes: [], categories: { Pairs: { correct: 2, total: 3 } } } },
      },
    });
    await page.goto("/training/basic-strategy/");
    await expect(page.getByText("Focusing on Soft totals")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Weak spots" })).toBeChecked();
    await expect(page.getByText("You have an unfinished round")).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("countlab:practice-focus"))).toBeNull();
    await page.getByRole("button", { name: "Continue round" }).click();
    await expect(hud(page).getByText("Hand 4 of 10", { exact: true })).toBeVisible();
  });

  test("a round synced from another device is offered, not jumped into or overwritten", async ({ page }) => {
    await prepare(page);
    await page.goto("/training/basic-strategy/");
    await expect(page.getByRole("heading", { name: "Set up your round" })).toBeVisible();
    await page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({ drill: "Basic Strategy", updatedAt: new Date().toISOString(), state: { q: 4, mode: "standard", correctCount: 4, streak: 4, best: 4, totalMs: 4000, mistakes: [], categories: { Pairs: { correct: 4, total: 4 } }, length: 20 } }));
      dispatchEvent(new Event("hilo-storage"));
    }, PROGRESS);
    await expect(page.getByText("You have an unfinished round")).toBeVisible();
    await expect(page.getByText(/Hand 5 of 20, 4 answered/)).toBeVisible();
    expect(JSON.parse((await page.evaluate((key) => localStorage.getItem(key), PROGRESS))!).state.q).toBe(4);
    await page.getByRole("button", { name: "Continue round" }).click();
    await expect(hud(page).getByText("Hand 5 of 20", { exact: true })).toBeVisible();
  });

  test("Retry mistakes plays the missed hands as a tagged retry round", async ({ page }) => {
    await prepare(page, { pref: { explain: "never" } });
    await page.goto("/training/basic-strategy/");
    await page.getByRole("button", { name: "Start 10 hands" }).click();
    // Always hitting (or declining surrender) misses plenty of hands.
    for (let hand = 0; hand < 10; hand += 1) {
      await answered(page, hand);
      await answerByKey(page);
    }
    const retry = page.getByRole("button", { name: /^Retry mistakes \((\d+)\)$/ });
    await expect(retry).toBeVisible();
    const count = Number((await retry.textContent())!.match(/\((\d+)\)/)![1]);
    await retry.click();
    await expect(hud(page).getByText(`Retry 1 of ${count}`, { exact: true })).toBeVisible();
    for (let hand = 0; hand < count; hand += 1) {
      await answered(page, hand);
      await answerByKey(page);
    }
    await expect(page.getByText("Retry complete")).toBeVisible();
    const saved = await sessions(page);
    expect(saved[0].tags).toEqual(["retry"]);
    expect(saved[0].questions).toBe(count);
  });

  test("with shortcuts off, keys do nothing and the setup says so", async ({ page }) => {
    await prepare(page, { settings: { shortcuts: false } });
    await page.goto("/training/basic-strategy/");
    await expect(page.getByText("Keyboard shortcuts are off.")).toBeVisible();
    await page.getByRole("button", { name: "Start 10 hands" }).click();
    await page.keyboard.press("h");
    await page.keyboard.press("n");
    await page.waitForTimeout(300);
    await expect(hud(page).locator("dd").first()).toHaveText("0 of 0");
    await expect(page.getByText("Keyboard shortcuts are off.")).toBeVisible();
  });
});

test.describe("deviations", () => {
  test.skip(({ isMobile }) => isMobile, "Keyboard flows run on desktop.");

  test("an exam hand-off for insurance opens on insurance, and I answers it", async ({ page }) => {
    await prepare(page, { devPref: { explain: "every" }, focus: { drill: "Deviations", category: "Insurance vs A" } });
    await page.goto("/training/deviations/");
    await expect(page.getByText("Focusing on insurance")).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("countlab:practice-focus"))).toBeNull();
    await page.getByRole("button", { name: "Start 10 hands" }).click();
    await expect(page.getByRole("heading", { name: /^The dealer shows an ace\. Take insurance at true count/ })).toBeVisible();
    await page.keyboard.press("i");
    await expect(page.getByTestId("drill-feedback")).toBeVisible();
    await answered(page, 1);
  });

  test("a play the rules have no index for says so and seeds nothing", async ({ page }) => {
    await prepare(page, { focus: { drill: "Deviations", category: "12 vs 9" } });
    await page.goto("/training/deviations/");
    await expect(page.getByText("12 vs 9 isn't an index play under your table rules")).toBeVisible();
  });
});

test("the strategy drills fit a 320px screen in setup and play", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Viewport is set explicitly.");
  await page.setViewportSize({ width: 320, height: 640 });
  await prepare(page, { pref: { explain: "every" }, devPref: { explain: "every" } });
  const fits = async (label: string) => {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), { message: label }).toBeLessThanOrEqual(320);
    const clipped = await page.locator("main :is(a, button, h1, h2):visible").evaluateAll((nodes) => nodes.filter((node) => {
      const box = node.getBoundingClientRect();
      return !node.closest(".overflow-x-auto, [role='tablist'], .mobile-scroll-rail") && (box.left < -1 || box.right > innerWidth + 1);
    }).map((node) => node.textContent?.trim().slice(0, 40)));
    expect(clipped, label).toEqual([]);
  };
  for (const path of ["/training/basic-strategy/", "/training/deviations/"]) {
    await page.goto(path);
    await page.getByRole("heading", { name: "Set up your round" }).waitFor();
    await fits(`${path} setup`);
    await page.getByRole("button", { name: "Start 10 hands" }).filter({ visible: true }).click();
    await page.getByRole("region", { name: "Session progress" }).waitFor();
    await fits(`${path} play`);
    await page.locator(".mobile-action-dock").getByRole("button").filter({ visible: true }).and(page.locator(":not([aria-disabled='true'])")).first().click();
    await page.getByTestId("drill-feedback").waitFor();
    await fits(`${path} paused`);
  }
  await page.goto("/training/h17-chart/");
  await page.getByRole("heading", { name: "Set up your chart" }).waitFor();
  await fits("h17 setup");
  await page.getByRole("button", { name: "Start filling in" }).filter({ visible: true }).click();
  await page.getByTestId("h17-keypad").waitFor();
  await fits("h17 play");
});

test("on a phone the reason for a wrong answer clears the answer dock", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chromium", "The dock is a phone control.");
  // A fixed random stream deals A,5 against a 6 (double), so Hit is a miss with a typical explanation.
  await page.addInitScript(() => { Math.random = () => 0.42; });
  await prepare(page, { pref: { explain: "every" } });
  await page.goto("/training/basic-strategy/");
  await page.getByRole("button", { name: "Start 10 hands" }).click();
  const dock = page.getByRole("group", { name: "Basic strategy actions" });
  await dock.getByRole("button").and(page.locator(":not([aria-disabled='true'])")).first().click();
  const feedback = page.getByTestId("drill-feedback");
  await expect(feedback).toContainText("Not quite: the play is Double");
  await expect(dock.getByRole("button", { name: "Next hand" })).toBeVisible();
  await expect.poll(async () => {
    const [panel, bar] = await Promise.all([feedback.boundingBox(), dock.boundingBox()]);
    return Boolean(panel && bar && panel.y >= 0 && panel.y + panel.height <= bar.y + 1);
  }).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
