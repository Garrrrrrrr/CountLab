/** Browser environment as plain data so classification stays DOM-free and testable. */
export interface PwaEnv {
  displayModeStandalone: boolean;
  navigatorStandalone: boolean;
  userAgent: string;
  maxTouchPoints: number;
}

/** Browsers on iOS that are not Safari. None of them can install a PWA. */
const NON_SAFARI_IOS = /CriOS|FxiOS|EdgiOS|OPiOS|mercury/;

export function isStandalone(env: PwaEnv): boolean {
  return env.displayModeStandalone || env.navigatorStandalone;
}

export function isIOS(env: PwaEnv): boolean {
  if (/iPad|iPhone|iPod/.test(env.userAgent)) return true;
  // iPadOS 13+ reports a Macintosh UA; touch points distinguish it from a Mac.
  return /Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1;
}

export function isIOSSafari(env: PwaEnv): boolean {
  return isIOS(env) && !NON_SAFARI_IOS.test(env.userAgent);
}

export function installAffordance(env: PwaEnv): "none" | "ios-instructions" | "native" {
  if (isStandalone(env)) return "none";
  if (isIOS(env)) return isIOSSafari(env) ? "ios-instructions" : "none";
  return "native";
}

/** Reads the live environment, or neutral values while prerendering. */
export function readPwaEnv(): PwaEnv {
  if (typeof window === "undefined") {
    return { displayModeStandalone: false, navigatorStandalone: false, userAgent: "", maxTouchPoints: 0 };
  }
  return {
    displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
    navigatorStandalone: (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    userAgent: window.navigator.userAgent,
    maxTouchPoints: window.navigator.maxTouchPoints,
  };
}
