import { expect, test, type Page } from "@playwright/test";

const SETTINGS = "countlab:account:guest:hilo:settings";

async function prepare(page: Page, settings?: Record<string, unknown>, progress?: Record<string, unknown>) {
  await page.addInitScript(({ settings, progress, key }) => {
    if (sessionStorage.getItem("e2e-prepared")) return;
    sessionStorage.setItem("e2e-prepared", "1");
    localStorage.setItem("countlab:guest", "1");
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
    if (settings) localStorage.setItem(key, JSON.stringify(settings));
    if (progress) localStorage.setItem("countlab:account:guest:hilo:progress:H17 Chart", JSON.stringify(progress));
  }, { settings, progress, key: SETTINGS });
}

async function startHardTotals(page: Page) {
  await page.goto("/training/h17-chart/");
  await page.getByRole("radio", { name: /^Hard totals/ }).check();
  await page.getByRole("button", { name: "Start filling in" }).click();
  await expect(page.getByTestId("h17-rail-hard")).toBeVisible();
}

test.describe("H17 chart on a keyboard", () => {
  test.skip(({ isMobile }) => isMobile, "Keyboard flows run on desktop.");

  test("Tab leaves the chart from its last cell, and Esc reaches Grade chart", async ({ page }) => {
    await prepare(page);
    await startHardTotals(page);
    const grade = page.getByRole("button", { name: "Grade chart" });
    await expect(grade).toBeDisabled();

    await page.getByLabel("Hard totals 8 versus A").focus();
    await page.keyboard.press("Tab");
    await expect.poll(() => page.evaluate(() => {
      const active = document.activeElement;
      return active?.tagName === "INPUT" && Boolean(active.closest("[data-testid='h17-rail-hard']"));
    })).toBe(false);

    await page.getByLabel("Hard totals 17 versus 2").focus();
    await page.keyboard.type("s");
    await expect(grade).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(grade).toBeFocused();
  });

  test("typing over a cell replaces it, and Ctrl+Enter asks before grading blanks", async ({ page }) => {
    await prepare(page);
    await startHardTotals(page);
    const first = page.getByLabel("Hard totals 17 versus 2");
    await first.focus();
    await page.keyboard.type("hss");
    await expect(first).toHaveValue("H");
    await first.focus();
    await page.keyboard.type("s");
    await expect(first).toHaveValue("S");
    await page.keyboard.press("Control+Enter");
    await expect(page.getByRole("dialog", { name: "Grade with blank cells?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Keep filling" })).toBeFocused();
    await page.getByRole("button", { name: "Keep filling" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("grading with blanks confirms, then shows a read-only graded chart", async ({ page }) => {
    await prepare(page);
    await startHardTotals(page);
    await page.getByLabel("Hard totals 17 versus 2").focus();
    await page.keyboard.type("sss");
    await page.getByRole("button", { name: "Grade chart" }).click();
    const dialog = page.getByRole("dialog", { name: "Grade with blank cells?" });
    await expect(dialog).toContainText("97 of 100 cells are still blank");
    await dialog.getByRole("button", { name: "Grade anyway" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /H17 Chart: \d+ of 100/ })).toBeVisible();

    const cell = page.getByLabel("Hard totals 17 versus 5");
    await expect(cell).toHaveAttribute("readonly", "");
    await cell.focus();
    await page.keyboard.type("h");
    await expect(cell).toHaveValue("");
    await expect(page.getByRole("group", { name: "Chart entry keys" })).toHaveCount(0);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("countlab:account:guest:hilo:sessions") || "[]"));
    expect(saved[0]).toMatchObject({ drill: "H17 Chart", questions: 100, correct: 3 });
  });

  test("tapping the surrender option already chosen keeps a table without surrender", async ({ page }) => {
    await prepare(page, { surrender: "none" });
    await page.goto("/training/h17-chart/");
    await page.getByRole("button", { name: "Change", exact: true }).click();
    await expect(page.getByRole("radio", { name: "None", exact: true })).toBeChecked();
    await page.getByRole("radio", { name: "None", exact: true }).click();
    await page.waitForTimeout(200);
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}").surrender, SETTINGS)).toBe("none");
    await expect(page.getByText("Your table has no surrender. The chart still includes the late-surrender table")).toBeVisible();
  });

  test("a chart resumed days later counts only the time spent filling it in", async ({ page }) => {
    await prepare(page, undefined, {
      drill: "H17 Chart",
      updatedAt: new Date().toISOString(),
      state: { entries: { "hard:17v2": "s" }, choice: "hard", feedback: "live", startedAt: Date.now() - 3 * 86_400_000, activeMs: 65_000 },
    });
    await page.goto("/training/h17-chart/");
    const time = page.getByRole("region", { name: "Session progress" }).locator("dd").last();
    await expect(time).toHaveText(/^1:0\d/);
  });

  test("a chart synced from another device is offered in setup", async ({ page }) => {
    await prepare(page);
    await page.goto("/training/h17-chart/");
    await expect(page.getByRole("button", { name: "Start filling in" })).toBeVisible();
    await page.evaluate(() => {
      localStorage.setItem("countlab:account:guest:hilo:progress:H17 Chart", JSON.stringify({ drill: "H17 Chart", updatedAt: new Date().toISOString(), state: { entries: { "hard:17v2": "s", "hard:17v3": "s" }, choice: "hard", feedback: "end", startedAt: Date.now(), activeMs: 5000 } }));
      dispatchEvent(new Event("hilo-storage"));
    });
    await expect(page.getByText("You have an unfinished chart")).toBeVisible();
    await page.getByRole("button", { name: "Continue chart" }).click();
    await expect(page.getByLabel("Hard totals 17 versus 3")).toHaveValue("S");
    await expect(page.getByText("2 of 100 filled", { exact: true }).first()).toBeVisible();
  });
});
