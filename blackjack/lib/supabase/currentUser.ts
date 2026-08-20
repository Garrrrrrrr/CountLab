import type { User } from "@supabase/supabase-js";
import { supabase } from "./client";

let cachedUser: User | null = null;
const listeners = new Set<(user: User | null) => void>();

if (typeof window !== "undefined") {
  supabase.auth.getSession().then(({ data }) => {
    cachedUser = data.session?.user ?? null;
    listeners.forEach((listener) => listener(cachedUser));
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedUser = session?.user ?? null;
    listeners.forEach((listener) => listener(cachedUser));
  });
}

export function getCurrentUser(): User | null {
  return cachedUser;
}

/** Lets the auth provider establish identity before dependent stores begin an upload. */
export function setCurrentUser(user: User | null): void {
  cachedUser = user;
  listeners.forEach((listener) => listener(cachedUser));
}

export function onCurrentUserChange(listener: (user: User | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
