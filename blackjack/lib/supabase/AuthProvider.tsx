"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { supabase } from "./client";
import { clearLocalUserData, pullRemoteData } from "./sync";

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<string | undefined>;
  signUp(email: string, password: string): Promise<string | undefined>;
  signInWithGoogle(): Promise<string | undefined>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
      if (event === "SIGNED_IN" && session?.user) void pullRemoteData(session.user.id);
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
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error?.message;
    },
    async signUp(email, password) {
      const { error } = await supabase.auth.signUp({ email, password });
      return error?.message;
    },
    async signInWithGoogle() {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
      });
      return error?.message;
    },
    async signOut() {
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
