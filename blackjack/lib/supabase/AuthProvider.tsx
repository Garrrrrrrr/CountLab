"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { supabase } from "./client";
import { clearLocalUserData, pullRemoteData, pushLocalDataToRemote } from "./sync";
import { track } from "../analytics/track";

const GUEST_KEY = "countlab:guest";

interface AuthState {
  user: User | null;
  loading: boolean;
  guest: boolean;
  continueAsGuest(): void;
  exitGuest(): void;
  signIn(email: string, password: string): Promise<string | undefined>;
  signUp(email: string, password: string): Promise<string | undefined>;
  signInWithGoogle(): Promise<string | undefined>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState(false);

  useEffect(() => {
    setGuest(localStorage.getItem(GUEST_KEY) === "1");
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
      if (data.session?.user) void pullRemoteData(data.session.user.id);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (event === "SIGNED_IN" && session?.user) {
        // Any data recorded while browsing as a guest belongs to this account now.
        pushLocalDataToRemote();
        localStorage.removeItem(GUEST_KEY);
        setGuest(false);
        void pullRemoteData(session.user.id);
      }
      if (event === "SIGNED_OUT") clearLocalUserData();
    });
    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value: AuthState = {
    user,
    loading,
    guest,
    continueAsGuest() {
      localStorage.setItem(GUEST_KEY, "1");
      setGuest(true);
      track("auth_continue_as_guest");
    },
    exitGuest() {
      localStorage.removeItem(GUEST_KEY);
      setGuest(false);
      track("auth_exit_guest");
    },
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error) track("auth_sign_in");
      return error?.message;
    },
    async signUp(email, password) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (!error) track("auth_sign_up");
      return error?.message;
    },
    async signInWithGoogle() {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
      });
      if (!error) track("auth_sign_in_google");
      return error?.message;
    },
    async signOut() {
      track("auth_sign_out");
      localStorage.removeItem(GUEST_KEY);
      setGuest(false);
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
