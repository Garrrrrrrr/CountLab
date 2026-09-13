import type { User } from "@supabase/supabase-js";
import { selectAccountScope } from "./accountStorage";

let cachedUser: User | null = null;
const listeners = new Set<(user: User | null) => void>();

export function getCurrentUser(): User | null {
  return cachedUser;
}

/** Lets the auth provider establish identity before dependent stores begin an upload. */
export function setCurrentUser(user: User | null): void {
  selectAccountScope(user?.id ?? null);
  cachedUser = user;
  listeners.forEach((listener) => listener(cachedUser));
}

export function onCurrentUserChange(listener: (user: User | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
