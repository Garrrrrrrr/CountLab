"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { supabase } from "./client";
import { clearLocalUserData, pullRemoteData, pushLocalDataToRemote } from "./sync";
import { analytics, observeApiRequest, type EventPropertyMap } from "../analytics";

const GUEST_KEY = "countlab:guest";
const OAUTH_INTENT_KEY = "countlab:auth-intent";

function authFailure(message: string | undefined): EventPropertyMap["login_failed"]["reason_category"] {
  const normalized = (message ?? "").toLowerCase();
  if (/rate|too many|limit/.test(normalized)) return "rate_limited";
  if (/confirm|verified/.test(normalized)) return "unconfirmed";
  if (/network|fetch|timeout/.test(normalized)) return "network";
  if (/password|credential|invalid|email/.test(normalized)) return "invalid_credentials";
  if (/validation|format|required|length/.test(normalized)) return "validation";
  return "other";
}

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

interface AuthState {
  user: User | null;
  loading: boolean;
  guest: boolean;
  passwordRecovery: boolean;
  /** Reflects the most recent push/pull against Supabase; "error" only covers outright failures (e.g. offline), not row-level errors that are logged but otherwise swallowed. */
  syncStatus: SyncStatus;
  continueAsGuest(): void;
  exitGuest(): void;
  signIn(email: string, password: string): Promise<string | undefined>;
  signUp(email: string, password: string): Promise<string | undefined>;
  signInWithGoogle(intent: "sign-in" | "sign-up"): Promise<string | undefined>;
  requestPasswordReset(email: string): Promise<string | undefined>;
  completePasswordReset(password: string): Promise<string | undefined>;
  cancelPasswordRecovery(): void;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");

  useEffect(() => {
    setGuest(localStorage.getItem(GUEST_KEY) === "1");
    let cancelled = false;
    const runSync = (work: () => Promise<void>) => {
      setSyncStatus("syncing");
      work()
        .then(() => { if (!cancelled) setSyncStatus("synced"); })
        .catch((error) => {
          console.error("[countlab] sync failed", error);
          if (!cancelled) setSyncStatus("error");
        });
    };
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
      if (data.session?.user) runSync(() => pullRemoteData(data.session!.user.id));
      const oauthIntent = sessionStorage.getItem(OAUTH_INTENT_KEY);
      if (data.session?.user && oauthIntent === "sign-in") analytics.track("login_succeeded", { method: "google" });
      if (oauthIntent) sessionStorage.removeItem(OAUTH_INTENT_KEY);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (event === "SIGNED_IN" && session?.user) {
        // Any data recorded while browsing as a guest belongs to this account now.
        // Push before pulling, so the pull's merge sees rows this device just
        // wrote instead of racing a pull that started before the push landed.
        runSync(() => pushLocalDataToRemote().then(() => pullRemoteData(session.user.id)));
        localStorage.removeItem(GUEST_KEY);
        setGuest(false);
      }
      if (event === "SIGNED_OUT") {
        clearLocalUserData();
        setSyncStatus("idle");
      }
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      if (event === "TOKEN_REFRESHED" && !session) analytics.track("auth_session_expired", { reason: "refresh_failed" });
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
    passwordRecovery,
    syncStatus,
    continueAsGuest() {
      localStorage.setItem(GUEST_KEY, "1");
      setGuest(true);
      analytics.track("guest_mode_entered");
    },
    exitGuest() {
      localStorage.removeItem(GUEST_KEY);
      setGuest(false);
    },
    async signIn(email, password) {
      const { error } = await observeApiRequest("supabase", "auth_sign_in_password", supabase.auth.signInWithPassword({ email, password }));
      if (error) analytics.track("login_failed", { method: "password", reason_category: authFailure(error.message), locked_out: false });
      else analytics.track("login_succeeded", { method: "password" });
      return error?.message;
    },
    async signUp(email, password) {
      analytics.track("signup_started", { method: "password" });
      const { error } = await observeApiRequest("supabase", "auth_sign_up_password", supabase.auth.signUp({ email, password }));
      if (error) analytics.track("signup_failed", { method: "password", reason_category: authFailure(error.message) });
      return error?.message;
    },
    async signInWithGoogle(intent) {
      if (intent === "sign-up") analytics.track("signup_started", { method: "google" });
      sessionStorage.setItem(OAUTH_INTENT_KEY, intent);
      const { error } = await observeApiRequest("supabase", "auth_sign_in_google", supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
      }));
      if (error) {
        sessionStorage.removeItem(OAUTH_INTENT_KEY);
        if (intent === "sign-up") analytics.track("signup_failed", { method: "google", reason_category: authFailure(error.message) });
        else analytics.track("login_failed", { method: "google", reason_category: authFailure(error.message), locked_out: false });
      }
      return error?.message;
    },
    async requestPasswordReset(email) {
      analytics.track("password_reset_started", { method: "email" });
      const { error } = await observeApiRequest("supabase", "auth_password_reset_request", supabase.auth.resetPasswordForEmail(email, {
        redirectTo: typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined,
      }));
      if (error) analytics.track("password_reset_failed", { method: "email", reason_category: authFailure(error.message) });
      return error?.message;
    },
    async completePasswordReset(password) {
      const { error } = await observeApiRequest("supabase", "auth_password_reset_complete", supabase.auth.updateUser({ password }));
      if (error) analytics.track("password_reset_failed", { method: "email", reason_category: authFailure(error.message) });
      else {
        analytics.track("password_reset_completed", { method: "email" });
        analytics.track("conversion_completed", { conversion: "password_reset", authoritative: false });
        setPasswordRecovery(false);
      }
      return error?.message;
    },
    cancelPasswordRecovery() {
      setPasswordRecovery(false);
    },
    async signOut() {
      analytics.track("logout");
      localStorage.removeItem(GUEST_KEY);
      setGuest(false);
      await observeApiRequest("supabase", "auth_sign_out", supabase.auth.signOut());
      analytics.reset();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
