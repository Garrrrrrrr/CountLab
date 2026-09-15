import { expect, test, type Page } from "@playwright/test";

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
  });
}

test("new visitors can try a drill and read reference without an account", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Build the skills/ })).toBeVisible();
  await page.getByRole("link", { name: "Try a counting drill →" }).click();
  await expect(page.getByRole("heading", { name: "Running Count", exact: true })).toBeVisible();
  await page.goto("/reference/");
  await expect(page.getByRole("heading", { name: "Basic strategy chart" })).toBeVisible();
  await expect(page).toHaveTitle(/Strategy charts/);
  await expect(page.getByRole("heading", { name: "Full Shoe Blackjack" })).toHaveCount(0);
});

test("reference tabs support arrow keys and link to their panel", async ({ page }) => {
  await prepare(page);
  await page.goto("/reference/");
  const strategy = page.getByRole("tab", { name: "Strategy", exact: true });
  await expect(strategy).toBeEnabled();
  await strategy.focus();
  await expect(strategy).toBeFocused();
  await strategy.press("ArrowRight");
  const deviations = page.getByRole("tab", { name: "Index deviations" });
  await expect(deviations).toBeFocused();
  await expect(deviations).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toBeVisible();
});

test("reference tabs wait for their keyboard handlers when JavaScript is delayed", async ({ page }) => {
  await prepare(page);
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>((resolve) => { releaseScripts = resolve; });
  await page.route(/\/_next\/.*\.js(?:\?.*)?$/, async (route) => {
    await scriptsReady;
    await route.continue();
  });
  try {
    await page.goto("/reference/", { waitUntil: "commit" });
    const strategy = page.getByRole("tab", { name: "Strategy", exact: true });
    await expect(strategy).toBeVisible();
    await expect(strategy).toBeDisabled();
    releaseScripts();
    await expect(strategy).toBeEnabled();
    await strategy.focus();
    await strategy.press("ArrowRight");
    const deviations = page.getByRole("tab", { name: "Index deviations" });
    await expect(deviations).toBeFocused();
    await expect(deviations).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toHaveAccessibleName("Index deviations");
  } finally {
    releaseScripts();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("tool search contains focus and navigates the selected keyboard result", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Find a tool" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").fill("trip");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/trip-planner/);
  await expect(dialog).toHaveCount(0);
});

test("changing UTH inputs invalidates a delayed result", async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    localStorage.setItem("countlab:guest", "1");
    class SlowWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror = null;
      postMessage(message: { id: number }) {
        // Deliberately delivers even after termination to exercise request identity too.
        setTimeout(() => { this.onmessage?.({ data: { id: message.id, error: "STALE RESPONSE" } }); document.documentElement.dataset.delayedWorkerDelivered = "true"; }, 700);
      }
      terminate() {}
    }
    Object.defineProperty(window, "Worker", { value: SlowWorker });
  });
  await page.goto("/ultimate-texas-holdem/#analyzer");
  await page.getByRole("button", { name: "Calculate optimal action" }).click();
  await expect(page.getByRole("button", { name: "Cancel calculation" })).toBeVisible();
  await page.getByRole("button", { name: "Random valid hand" }).click();
  await expect(page.getByRole("button", { name: "Calculate optimal action" })).toBeEnabled();
  await page.waitForFunction(() => document.documentElement.dataset.delayedWorkerDelivered === "true");
  await expect(page.getByText("STALE RESPONSE")).not.toBeVisible();
});

test("a saved scenario carries its inputs from the Lab into trip planning", async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => localStorage.setItem("countlab:guest", "1"));
  await page.goto("/cvcx/");
  const bankroll = page.getByLabel("Available bankroll", { exact: true });
  await expect(bankroll).toBeAttached();
  if (!await bankroll.isVisible()) await page.locator("summary").filter({ hasText: "Bankroll" }).first().click();
  await bankroll.fill("12345");
  const scenario = page.getByRole("region", { name: "Shared analysis scenario" });
  await scenario.locator("summary").click();
  await scenario.getByRole("textbox", { name: "Scenario name" }).fill("Weekend test");
  await scenario.getByRole("button", { name: "Save shared scenario" }).click();
  await scenario.getByRole("link", { name: /Plan trip/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Loaded Weekend test" })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Starting bankroll", includeHidden: true })).toHaveValue("12345");
});

test("statistics filters count only matching sessions and label missing measurements", async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    localStorage.setItem("countlab:guest", "1");
    const common = { questions: 10, correct: 8, accuracy: 80, averageResponseTime: 1000, bestStreak: 3, mistakes: [], date: new Date().toISOString() };
    localStorage.setItem("countlab:account:guest:hilo:sessions", JSON.stringify([
      { ...common, id: "one", drill: "Running Count", metrics: { rules: "6D H17" } },
      { ...common, id: "two", drill: "True Count", metrics: { rules: "8D S17" } },
    ]));
  });
  await page.goto("/statistics/");
  await expect(page.getByRole("status")).toContainText("2 sessions");
  await page.getByRole("combobox", { name: "Drill", exact: true }).selectOption("Running Count");
  await expect(page.getByRole("status")).toContainText("1 sessions");
  await expect(page.getByText("Not measured", { exact: true }).first()).toBeVisible();
  await page.getByRole("combobox", { name: "Table rules" }).selectOption("8D S17");
  await expect(page.getByRole("status")).toContainText("0 sessions");
});

test("light and dark themes keep readable navigation contrast", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  for (const theme of ["light", "dark"]) {
    const contrast = await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
      const header = document.querySelector("header")!;
      const link = header.querySelector("a")!;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      const luminance = (color: string) => {
        context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--paper");
        context.fillRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((n) => {
          const c = n / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      const foreground = luminance(getComputedStyle(link).color);
      const background = luminance(getComputedStyle(header).backgroundColor);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    }, theme);
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  }
});
