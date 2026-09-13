/** Product data is isolated from device preferences and from every other account. */
export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

let scope = "guest";
let generation = 0;
const prefix = (owner: string) => `countlab:account:${encodeURIComponent(owner)}:`;
const productKey = (key: string) => key.startsWith("hilo:") || /^countlab:(journal-|full-shoe-|cvcx-|simulation-|venue-|onboarding-|uth:|chase:|scenario:)/.test(key);
const deviceStore = () => globalThis.localStorage;
export const accountScope = () => scope;
export const accountGeneration = () => generation;

export function scopedStorage(owner: string, store: KeyStorage = deviceStore()) {
  const base = prefix(owner);
  return {
    getItem: (key: string) => store.getItem(base + key),
    setItem: (key: string, value: string) => store.setItem(base + key, value),
    removeItem: (key: string) => store.removeItem(base + key),
    keys: () => Array.from({ length: store.length }, (_, index) => store.key(index))
      .filter((key): key is string => key !== null && key.startsWith(base)).map((key) => key.slice(base.length)),
  };
}

export const accountStorage = {
  getItem: (key: string) => scopedStorage(scope).getItem(key),
  setItem: (key: string, value: string) => scopedStorage(scope).setItem(key, value),
  removeItem: (key: string) => scopedStorage(scope).removeItem(key),
  keys: () => scopedStorage(scope).keys(),
};

export function selectAccountScope(userId: string | null) {
  const next = userId ?? "guest";
  if (next === scope) return;
  scope = next;
  generation++;
}

/** The old shared cache has no trustworthy owner, even with a current login.
 * Preserve it for explicit recovery; never upload it just because someone signs in. */
export function migrateLegacyData(store: KeyStorage = deviceStore()) {
  if (store.getItem("countlab:account-migration:v1")) return;
  const target = scopedStorage("legacy-unclaimed", store);
  const keys = Array.from({ length: store.length }, (_, index) => store.key(index)).filter((key): key is string => !!key && productKey(key));
  // Copy every value successfully before removing any original.
  for (const key of keys) {
    const original = store.getItem(key)!;
    if (target.getItem(key) === null) target.setItem(key, original);
    else if (target.getItem(key) !== original) {
      // Never discard a conflicting old collection during a partially completed migration.
      scopedStorage("legacy-unclaimed", store).setItem(key, original);
    }
  }
  store.setItem("countlab:account-migration:v1", "1");
  for (const key of keys) store.removeItem(key);
}

export function guestBackup(store: KeyStorage = deviceStore()) {
  const guest = scopedStorage("guest", store);
  return JSON.stringify({ version: 2, sessions: JSON.parse(guest.getItem("hilo:sessions") ?? "[]"), local: Object.fromEntries(guest.keys().filter(productKey).filter((key) => !key.includes("-ack:") && !key.includes("-delete-ack:")).filter((key) => key !== "hilo:settings" && key !== "hilo:sessions").map((key) => [key, guest.getItem(key)])) });
}

function legacyKeys(store: KeyStorage) {
  return Array.from({ length: store.length }, (_, index) => store.key(index)).filter((key): key is string => !!key && productKey(key));
}
export function hasLegacyBackup(store: KeyStorage = deviceStore()) { return scopedStorage("legacy-unclaimed", store).keys().length > 0 || legacyKeys(store).length > 0; }
export function legacyBackup(store: KeyStorage = deviceStore()) {
  const preserved = scopedStorage("legacy-unclaimed", store);
  // If copying failed (for example a full disk), the original keys are still
  // intact and can be recovered without first duplicating them on disk.
  const legacy = {
    getItem: (key: string) => store.getItem(key) ?? preserved.getItem(key),
    keys: () => [...new Set([...preserved.keys(), ...legacyKeys(store)])],
  };
  return JSON.stringify({ version: 2, sessions: JSON.parse(legacy.getItem("hilo:sessions") ?? "[]"), settings: JSON.parse(legacy.getItem("hilo:settings") ?? "{}"), local: Object.fromEntries(legacy.keys().filter(productKey).filter((key) => key !== "hilo:settings" && key !== "hilo:sessions").map((key) => [key, legacy.getItem(key)])) });
}
