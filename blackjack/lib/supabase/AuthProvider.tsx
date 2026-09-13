"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { supabase } from "./client";
import { pullRemoteData, pushLocalDataToRemote } from "./sync";
import { JOURNAL_SYNC_ERROR_EVENT } from "../blackjack/journal";
import { accountGeneration, migrateLegacyData } from "./accountStorage";
import { setCurrentUser } from "./currentUser";
import { analytics, observeApiRequest, type EventPropertyMap } from "../analytics";
import { settleWithTimeout } from "@/lib/pwa/settleWithTimeout";

const GUEST_KEY = "countlab:guest";
const OAUTH_INTENT_KEY = "countlab:auth-intent";

/**
 * getSession() answers from local storage in the usual case; it only goes to the
 * network when the stored token has expired and needs a refresh. That refresh
 * cannot succeed while offline, and AuthGate renders nothing until it settles,
 * so the full budget would blank the app for eight seconds on a cold offline
 * start. Give the offline case just enough time for the local read.
 * autoRefreshToken restores the real session through onAuthStateChange once the
 * device is back online.
 */
const SESSION_TIMEOUT_MS = 8000;
const OFFLINE_SESSION_TIMEOUT_MS = 1200;

const sessionTimeoutMs = () =>
  typeof navigator !== "undefined" && navigator.onLine === false ? OFFLINE_SESSION_TIMEOUT_MS : SESSION_TIMEOUT_MS;

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
  /** Only acknowledged uploads and successful reads count as synced. */
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
    let cancelled = false;
    let authEventSeen = false;
    const preserveLegacy = () => {
      try { migrateLegacyData(); }
      catch (error) { console.error("[countlab] legacy history retained for recovery", error); }
    };
    const apply = (next: User | null) => {
      if (cancelled) return;
      setCurrentUser(next);
      setUser(next);
      setLoading(false);
      if (next) { localStorage.removeItem(GUEST_KEY); setGuest(false); }
      else setGuest(localStorage.getItem(GUEST_KEY) === "1");
    };
    // Old shared caches require explicit recovery regardless of the current login.
    settleWithTimeout(supabase.auth.getSession(), sessionTimeoutMs(),
      { data: { session: null } } as Awaited<ReturnType<typeof supabase.auth.getSession>>)
      .then(({ data }) => {
        if (cancelled) return;
        preserveLegacy();
        if (!authEventSeen) apply(data.session?.user ?? null);
        const intent = sessionStorage.getItem(OAUTH_INTENT_KEY);
        if (data.session?.user && intent === "sign-in") analytics.track("login_succeeded", { method: "google" });
        sessionStorage.removeItem(OAUTH_INTENT_KEY);
      });
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      authEventSeen = true;
      // A login is not evidence of ownership of the old shared cache.
      preserveLegacy();
      apply(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      if (event === "SIGNED_OUT") setPasswordRecovery(false);
    });
    return () => { cancelled = true; subscription.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user) { setSyncStatus("idle"); return; }
    const generation = accountGeneration();
    let cancelled = false, inFlight = false, requested = false;
    const current = () => !cancelled && generation === accountGeneration();
    const reconcile = async () => {
      if (!current() || document.hidden) return;
      if (inFlight) { requested = true; return; }
      if (navigator.onLine === false) { setSyncStatus("error"); return; }
      inFlight = true;
      requested = false;
      setSyncStatus("syncing");
      try {
        let pushError: unknown;
        try { await pushLocalDataToRemote(); } catch (error) { pushError = error; }
        if (!current()) return;
        await pullRemoteData(user.id);
        if (pushError) throw pushError;
        if (current() && !requested) setSyncStatus("synced");
      } catch (error) {
        if (current()) { console.error("[countlab] sync failed", error); setSyncStatus("error"); }
      } finally {
        inFlight = false;
        if (requested && current()) void reconcile();
      }
    };
    let pendingTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { void reconcile(); };
    const pending = () => {
      if (!current()) return;
      setSyncStatus("syncing");
      if (inFlight) requested = true;
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(refresh, 500);
    };
    const failed = () => { if (current()) setSyncStatus("error"); };
    refresh();
    const interval = window.setInterval(refresh, 20_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("countlab:sync-request", refresh);
    window.addEventListener("countlab:sync-pending", pending);
    window.addEventListener(JOURNAL_SYNC_ERROR_EVENT, failed);
    return () => {
      cancelled = true;
      clearTimeout(pendingTimer);
      window.removeEventListener("countlab:sync-pending", pending);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("countlab:sync-request", refresh);
      window.removeEventListener(JOURNAL_SYNC_ERROR_EVENT, failed);
    };
  }, [user]);

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
        // Return to a concrete app route. GitHub Pages can briefly serve a stale
        // repository-root document after an OAuth round trip, while /dashboard
        // always resolves to CountLab's exported application entrypoint.
        options: { redirectTo: typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined },
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

  return <AuthContext.Provider value={value}><div key={user?.id ?? "guest"}>{children}</div></AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
