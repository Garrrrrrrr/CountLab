import { expect, test, type Page } from "@playwright/test";

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(({ page }) => { expect(pageErrors.get(page)).toEqual([]); });

async function guest(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("countlab:guest", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
  });
}

for (const serviceWorkers of ["block", "allow"] as const) {
  test.describe(`production workers, service worker ${serviceWorkers}`, () => {
    test.use({ serviceWorkers });
    test("UTH river calculation finishes", async ({ page, context }) => {
      test.setTimeout(60000);
      await guest(page);
      if (serviceWorkers === "allow") {
        await page.goto("/");
        await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller).catch(() => false), { timeout: 30000 }).toBe(true);
        await page.getByRole("heading", { name: /Build the skills/ }).waitFor();
      }
      await page.goto("/ultimate-texas-holdem/#analyzer");
      await page.getByRole("button", { name: "Calculate optimal action" }).click();
      await expect(page.getByText("Calculation stopped unexpectedly. Try again.")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Cancel calculation" })).toHaveCount(0, { timeout: 15000 });
      await expect(page.getByText("Calculation stopped unexpectedly. Try again.")).toHaveCount(0);
      await expect(page.getByText("Recommended decision", { exact: true })).toBeVisible();
      if (serviceWorkers === "allow") {
        await context.setOffline(true);
        await page.reload();
        await page.getByRole("button", { name: "Calculate optimal action" }).click();
        await expect(page.getByText("Recommended decision", { exact: true })).toBeVisible();
      }
    });
  });
}


test("failed calculations can retry with a new worker", async ({ page }) => {
  await guest(page);
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    let first = true;
    Object.defineProperty(window, "Worker", { value: function(url: string | URL, options?: WorkerOptions) {
      if (!first) return new NativeWorker(url, options);
      first = false;
      const fake = {
        onerror: null as ((event: Event) => void) | null,
        postMessage() { setTimeout(() => fake.onerror?.(new Event("error", { cancelable: true })), 50); },
        terminate() {},
      };
      return fake;
    }});
  });
  await page.goto("/ultimate-texas-holdem/#analyzer");
  await page.getByRole("button", { name: "Calculate optimal action" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Try again" })).toBeVisible();
  await page.getByRole("button", { name: "Calculate optimal action" }).click();
  await expect(page.getByText("Recommended decision", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Try again" })).toHaveCount(0);
});

test("both simulation modes produce results from the production export", async ({ page }) => {
  await guest(page);
  await page.goto("/simulation/");
  const rounds = page.getByRole("spinbutton", { name: "Rounds to simulate", includeHidden: true });
  await rounds.waitFor({ state: "attached" });
  if (!await rounds.isVisible()) await page.locator("summary").filter({ hasText: "Simulation setup" }).click();
  await rounds.fill("100");
  await rounds.blur();
  await page.getByRole("button", { name: /^(Run|Run simulation)$/ }).filter({ visible: true }).first().click();
  await expect(page.getByText("Total profit", { exact: true }).first()).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Fast approximation" }).click();
  await page.getByRole("combobox", { name: "Rounds per path" }).selectOption("10000");
  await page.getByRole("combobox", { name: "Independent paths" }).selectOption("10");
  await page.getByRole("button", { name: /^(Run|Run simulation)$/ }).filter({ visible: true }).first().click();
  await expect(page.getByText("Median bankroll", { exact: true })).toBeVisible({ timeout: 20000 });
});

test("cancel stops a nonresponsive simulation immediately and allows another run", async ({ page }) => {
  await guest(page);
  await page.addInitScript(() => {
    class StuckWorker { postMessage() {} terminate() { document.documentElement.dataset.workerTerminated = "true"; } }
    Object.defineProperty(window, "Worker", { value: StuckWorker });
  });
  await page.goto("/simulation/");
  const run = page.getByRole("button", { name: /^(Run|Run simulation)$/ }).filter({ visible: true }).first();
  await run.click();
  await page.getByRole("button", { name: "Cancel", exact: true }).filter({ visible: true }).first().click();
  await expect(run).toBeEnabled();
  await expect(page.locator("html")).toHaveAttribute("data-worker-terminated", "true");
});

test("Chase river analyzer completes", async ({ page }) => {
  await guest(page);
  await page.addInitScript(() => {
    localStorage.setItem("countlab:account:guest:countlab:chase-flush:setup:v1", JSON.stringify({ mode: "analyze", stage: 4, target: "board", pickerSuit: "s", player: [0, 1, 2], dealer: [3], board: [4, 5, 6, 7], policy: "all", sixCardPayout: 50 }));
  });
  await page.goto("/chase-flush/#analyze");
  await page.getByRole("button", { name: "Calculate optimal action" }).click();
  await expect(page.getByText("Recommended decision", { exact: true })).toBeVisible({ timeout: 15000 });
});

test("starter drill and experience preference survive navigation", async ({ page }) => {
  await guest(page);
  await page.goto("/training/running-count/?session=starter");
  // The starter values are the Starter session card; the card count lives under Customize.
  await expect(page.getByRole("radio", { name: /^Starter/ })).toBeChecked();
  await page.getByRole("button", { name: "Customize" }).click();
  await expect(page.getByRole("spinbutton", { name: "Cards in session" })).toHaveValue("20");
  await page.goto("/practice/");
  await page.getByRole("button", { name: "experienced", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "experienced", exact: true })).toHaveAttribute("aria-pressed", "true");
});


test("game headings and selected tabs retain contrast in both themes", async ({ page }) => {
  await guest(page);
  await page.goto("/ultimate-texas-holdem/");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    for (const locator of [page.getByRole("heading", { level: 1 }), page.getByRole("tab", { selected: true }).first()]) {
      const contrast = await locator.evaluate((element) => {
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
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("game tables and bankroll recommendations fit a 320px screen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await guest(page);
  for (const path of ["ultimate-texas-holdem", "chase-flush", "bet-spread-recommender"]) {
    const response = await page.goto(`/${path}/`);
    expect(response?.status()).toBe(200);
    await page.getByRole("heading", { level: 1 }).waitFor();
    if (path === "bet-spread-recommender") await page.locator("summary").filter({ hasText: "Targets" }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    const clipped = await page.locator("main button:visible, main input:visible, main select:visible").evaluateAll((nodes) => nodes.filter((node) => {
      const box = node.getBoundingClientRect();
      // Tabs and card rows intentionally have their own horizontal scroller.
      return !node.closest('[role="tablist"]') && (box.left < -1 || box.right > innerWidth + 1);
    }).map((node) => node.textContent?.trim() || node.getAttribute("aria-label")));
    expect(clipped).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${path}-320.png`), fullPage: true });
  }
});


test("DDM exact analyzer completes a fixed hand", async ({ page }) => {
  await guest(page);
  await page.goto("/double-down-madness/#hand");
  await page.getByRole("button", { name: "Clear hand" }).click();
  await page.getByRole("button", { name: "10", exact: true }).click();
  await page.getByRole("button", { name: "10", exact: true }).click();
  await page.getByRole("button", { name: "Calculate exact EV" }).click();
  await expect(page.getByRole("heading", { name: "Action EV" })).toBeVisible({ timeout: 15000 });
});

test("history import previews and merges without discarding existing sessions", async ({ page }) => {
  await guest(page);
  await page.addInitScript(() => {
    const common = { questions: 10, correct: 8, accuracy: 80, averageResponseTime: 1000, bestStreak: 3, mistakes: [], date: new Date().toISOString(), drill: "Running Count" };
    localStorage.setItem("countlab:account:guest:hilo:sessions", JSON.stringify([{ ...common, id: "existing" }]));
    localStorage.setItem("countlab:account:legacy-unclaimed:hilo:sessions", JSON.stringify([{ ...common, id: "recovered" }]));
  });
  await page.goto("/settings/");
  await page.getByRole("button", { name: "Recover previous device history" }).click();
  const dialog = page.getByRole("dialog", { name: "Import history into this account?" });
  await expect(dialog).toContainText("Preview: 1 training sessions");
  await dialog.getByRole("button", { name: "Import my history" }).click();
  await expect(dialog).toHaveCount(0);
  const sessions = await page.evaluate(() => JSON.parse(localStorage.getItem("countlab:account:guest:hilo:sessions")!));
  expect(sessions.map((session: { id: string }) => session.id).sort()).toEqual(["existing", "recovered"]);
});
