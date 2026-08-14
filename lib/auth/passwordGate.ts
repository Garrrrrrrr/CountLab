import { AUTH_CONFIG } from "./authConfig.generated";

const SESSION_KEY = "countlab:auth-session";
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const AUTH_EVENT = "countlab-auth";

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function deriveHashHex(password: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(AUTH_CONFIG.salt) as BufferSource, iterations: AUTH_CONFIG.iterations, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function verifyPassword(candidate: string): Promise<boolean> {
  if (!candidate) return false;
  const candidateHash = await deriveHashHex(candidate);
  return constantTimeEqual(candidateHash, AUTH_CONFIG.hash);
}

interface StoredSession {
  hash: string;
  expiresAt: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const availableStorage = (): StorageLike | undefined => typeof window === "undefined" ? undefined : window.localStorage;

export function hasValidSession(store = availableStorage()): boolean {
  if (!store) return false;
  try {
    const parsed = JSON.parse(store.getItem(SESSION_KEY) || "null") as StoredSession | null;
    return Boolean(parsed) && parsed!.hash === AUTH_CONFIG.hash && parsed!.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export function startSession(store = availableStorage()): void {
  if (!store) return;
  const session: StoredSession = { hash: AUTH_CONFIG.hash, expiresAt: Date.now() + SESSION_TTL_MS };
  store.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(store = availableStorage()): void {
  if (!store) return;
  store.removeItem(SESSION_KEY);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_EVENT));
}
