import { ANALYTICS_CONFIG, STORAGE_KEYS } from "./config";
import { getCurrentUser, onCurrentUserChange } from "../supabase/currentUser";

const createId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;

export const newEventId = createId;

let anonId: string | undefined;

/**
 * A random per-device id. Never derived from anything personal, and stable
 * across sign-out: the device is the same device, and rotating it on every
 * logout would inflate the unique-visitor count instead of describing reality.
 */
export function getAnonId(): string {
  if (anonId) return anonId;
  if (typeof window === "undefined") return "ssr";
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.anonId);
    if (stored) {
      anonId = stored;
      return stored;
    }
  } catch {
    // Private mode: fall through to an in-memory id for this page only.
  }
  anonId = createId();
  try {
    localStorage.setItem(STORAGE_KEYS.anonId, anonId);
  } catch {
    // Best effort only.
  }
  return anonId;
}

export const getUserId = (): string | null => getCurrentUser()?.id ?? null;

export const onUserChange = onCurrentUserChange;

/** Clears the cached anonymous id (used by tests and by data-deletion flows). */
export function clearAnonId(): void {
  anonId = undefined;
  try {
    localStorage.removeItem(STORAGE_KEYS.anonId);
  } catch {
    // Best effort only.
  }
}

export function isOptedOut(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (localStorage.getItem(STORAGE_KEYS.optOut) === "1") return true;
    return ANALYTICS_CONFIG.requireConsent && localStorage.getItem(STORAGE_KEYS.analyticsConsent) !== "granted";
  } catch {
    return false;
  }
}

export function setOptedOut(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(STORAGE_KEYS.optOut, "1");
      localStorage.setItem(STORAGE_KEYS.analyticsConsent, "denied");
    } else {
      localStorage.removeItem(STORAGE_KEYS.optOut);
      localStorage.setItem(STORAGE_KEYS.analyticsConsent, "granted");
    }
  } catch {
    // Best effort only.
  }
}
