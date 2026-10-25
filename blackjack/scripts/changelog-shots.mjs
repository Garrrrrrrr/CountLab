/**
 * Retakes the screenshots on the What's new page (public/changelog-shots/). Run it against a
 * served export: `npm run build && node scripts/serve-export.mjs`, then in another shell
 * `node scripts/changelog-shots.mjs [baseUrl]`. Desktop shots are 1280x800, phone shots
 * 390x844 at 2x, all light theme with the consent bar answered.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const OUT = join(import.meta.dirname, "..", "public", "changelog-shots");

const desktop = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/** Scrolls an element to `gap` pixels from the top (under the desktop top bar by default). */
const toTop = (locator, gap = 72) => locator.evaluate((element, gap) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - gap), gap);

const SHOTS = [
  { file: "home.jpg", device: desktop, path: "/" },
  { file: "charts-indices.jpg", device: desktop, path: "/charts/" },
  { file: "pocket-chart.jpg", device: desktop, path: "/charts/pocket/" },
  { file: "calculator.jpg", device: desktop, path: "/calculator/" },
  {
    file: "calculator-ramp.jpg", device: desktop, path: "/calculator/",
    act: async (page) => toTop(page.getByRole("heading", { name: "Bet ramp", exact: true })),
  },
  { file: "train-phone.jpg", device: phone, path: "/train/" },
  {
    file: "running-count-phone.jpg", device: phone, path: "/train/running-count/",
    act: async (page) => {
      await page.getByRole("radio", { name: "Flash" }).locator("xpath=ancestor::label[1]").click();
      await toTop(page.getByRole("radio", { name: "Flash" }).locator("xpath=ancestor::label[1]"), 24);
    },
  },
  {
    file: "bet-ramp-phone.jpg", device: phone, path: "/train/bet-ramp/",
    act: async (page) => {
      await page.getByRole("button", { name: /^Start \d+ counts$/ }).filter({ visible: true }).first().click();
      await page.getByText("True count", { exact: true }).waitFor();
    },
  },
  {
    file: "full-shoe-phone.jpg", device: phone, path: "/train/full-shoe/",
    act: async (page) => {
      await page.getByRole("button", { name: "Buy in and shuffle" }).filter({ visible: true }).first().click();
      for (let chip = 0; chip < 2; chip++) await page.getByRole("button", { name: "Add a $5 chip" }).click();
      await page.getByRole("button", { name: /^Deal/ }).click();
      const decline = page.locator("button:not([disabled])", { hasText: /^(No insurance|No, play it)/ });
      const actions = page.getByRole("group", { name: "Choose an action" }).locator("button:not([disabled])").first();
      await Promise.race([actions.waitFor(), decline.waitFor()]);
      if (await decline.isVisible()) await decline.click();
      await actions.waitFor({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(800);
    },
  },
  {
    file: "journal-log-phone.jpg", device: phone, path: "/journal/",
    act: async (page) => {
      await page.getByRole("button", { name: "Log session" }).filter({ visible: true }).first().click();
      const sheet = page.getByRole("dialog", { name: "Log session" });
      await sheet.getByRole("button", { name: /More details/ }).click();
      await sheet.getByLabel("Bought in for").fill("1000");
      await sheet.getByLabel("Cashed out").fill("1350");
      await sheet.getByLabel("Rounds played").fill("420");
      await sheet.getByLabel("Top bet").fill("200");
      await sheet.getByRole("button", { name: "Watched by the pit" }).click();
      await sheet.getByRole("button", { name: /More details/ }).evaluate((element) => element.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(300);
    },
  },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHROMIUM_PATH ? undefined : "chrome", executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH });
const only = process.argv.slice(3);
for (const shot of SHOTS.filter((item) => !only.length || only.includes(item.file))) {
  const context = await browser.newContext({ ...shot.device, colorScheme: "light", reducedMotion: "reduce", serviceWorkers: "block" });
  await context.addInitScript(() => {
    localStorage.setItem("countlab:analytics:consent_seen", "1");
    localStorage.setItem("countlab:analytics:consent", "denied");
  });
  const page = await context.newPage();
  await page.goto(BASE + shot.path);
  await page.locator("h1").first().waitFor();
  await page.waitForTimeout(1200);
  if (shot.act) await shot.act(page);
  await page.screenshot({ path: join(OUT, shot.file), type: "jpeg", quality: 78 });
  console.log("saved", shot.file);
  await context.close();
}
await browser.close();
