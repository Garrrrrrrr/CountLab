import { expect, test, type Page } from "@playwright/test";

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
    localStorage.setItem("countlab-install-dismissed", "1");
    localStorage.setItem("countlab:guest", "1");
  });
}
const desktop = (name: string) => name === "desktop-chromium";

test("Enter on a disclosure opens it instead of firing the page's Enter action", async ({ page }, testInfo) => {
  test.skip(!desktop(testInfo.project.name), "Keyboard behaviour is viewport-independent.");
  await prepare(page);
  await page.goto("/training/basic-strategy/");
  const more = page.locator("summary", { hasText: "More options" });
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("details", { has: more })).toHaveAttribute("open", "");
  await expect(page.getByRole("button", { name: "Start 10 hands" })).toBeVisible();
});

test("closing tool search returns focus to the button that opened it", async ({ page }, testInfo) => {
  await prepare(page);
  await page.goto("/practice/");
  if (!desktop(testInfo.project.name)) await page.getByLabel("Mobile navigation").getByRole("button", { name: "Menu" }).click();
  const search = page.locator("#primary-navigation").getByRole("button", { name: /^Find a tool/ });
  await search.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox", { name: "Find a tool" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Find a tool" })).toHaveCount(0);
  await expect(search).toBeFocused();
});

test("closing a Journal sheet opened from the phone dock returns focus to the dock", async ({ page }, testInfo) => {
  test.skip(desktop(testInfo.project.name), "The action dock is phone-only.");
  await prepare(page);
  await page.goto("/journal/");
  const log = page.getByRole("group", { name: "Session journal actions" }).getByRole("button", { name: "Log session" });
  await log.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Log session" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Log session" })).toHaveCount(0);
  await expect(log).toBeFocused();
});

test("tabbing through the log form without typing is not an unsaved change", async ({ page }, testInfo) => {
  test.skip(!desktop(testInfo.project.name), "Form state is viewport-independent.");
  await prepare(page);
  await page.goto("/journal/");
  await page.getByRole("button", { name: "Log session" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Log session" });
  // With no sessions yet the game editor starts open, so its number fields are in the tab order.
  await sheet.getByLabel("Betting unit").focus();
  await page.keyboard.press("Tab");
  await sheet.getByLabel("Hands per hour").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Keep editing" })).toHaveCount(0);
});
