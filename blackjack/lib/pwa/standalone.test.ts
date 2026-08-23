import { describe, expect, it } from "vitest";
import { installAffordance, isIOS, isIOSSafari, isStandalone, type PwaEnv } from "./standalone";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0 Mobile/15E148 Safari/604.1";
const IPADOS_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Mobile Safari/537.36";
const env = (over: Partial<PwaEnv>): PwaEnv => ({ displayModeStandalone: false, navigatorStandalone: false, userAgent: ANDROID_CHROME, maxTouchPoints: 0, ...over });

describe("PWA environment classification", () => {
  it("recognizes both standalone signals", () => {
    expect(isStandalone(env({}))).toBe(false);
    expect(isStandalone(env({ displayModeStandalone: true }))).toBe(true);
    expect(isStandalone(env({ navigatorStandalone: true, userAgent: IPHONE_SAFARI }))).toBe(true);
  });
  it("recognizes iOS including iPadOS desktop UAs", () => {
    expect(isIOS(env({ userAgent: IPHONE_SAFARI }))).toBe(true);
    expect(isIOS(env({ userAgent: IPADOS_SAFARI, maxTouchPoints: 5 }))).toBe(true);
    expect(isIOS(env({ userAgent: IPADOS_SAFARI }))).toBe(false);
    expect(isIOS(env({}))).toBe(false);
  });
  it("only accepts Safari as installable on iOS", () => {
    expect(isIOSSafari(env({ userAgent: IPHONE_SAFARI }))).toBe(true);
    expect(isIOSSafari(env({ userAgent: IPHONE_CHROME }))).toBe(false);
    expect(isIOSSafari(env({}))).toBe(false);
  });
  it("selects the appropriate install affordance", () => {
    expect(installAffordance(env({ displayModeStandalone: true }))).toBe("none");
    expect(installAffordance(env({ userAgent: IPHONE_SAFARI }))).toBe("ios-instructions");
    expect(installAffordance(env({ userAgent: IPHONE_CHROME }))).toBe("none");
    expect(installAffordance(env({}))).toBe("native");
  });
});
