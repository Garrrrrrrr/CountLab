"use client";

import { isPublicRoute } from "@/lib/routes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { useFormAnalytics } from "@/lib/analytics";
import { Button, GhostButton, Panel } from "./ui";

const PUBLIC_PATHS = { has: isPublicRoute };

// Supabase Auth already rate-limits sign-in/sign-up server-side; this is a
// client-side complement that slows down credential guessing directly in the
// browser (e.g. someone driving the form from the console) with an
// escalating lockout, independent of that server-side limit.
const LOCK_THRESHOLD = 5;
const lockDurationMs = (strikes: number) =>
  Math.min(30_000 * 2 ** Math.floor(strikes / LOCK_THRESHOLD - 1), 5 * 60_000);

export function AuthGate({ children }: { children: ReactNode }) {
  const path = usePathname().replace(/\/$/, "") || "/";
  const {
    user, loading, guest, passwordRecovery, continueAsGuest, signIn, signUp,
    signInWithGoogle, requestPasswordReset, completePasswordReset, cancelPasswordRecovery,
  } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "reset-request">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [strikes, setStrikes] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const formName = passwordRecovery ? "password_reset_completion" : mode === "sign-in" ? "login" : mode === "sign-up" ? "signup" : "password_reset_request";
  const formAnalytics = useFormAnalytics(formName, !loading && (!user || passwordRecovery) && !guest && !PUBLIC_PATHS.has(path));

  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const id = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= lockedUntil) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  if (PUBLIC_PATHS.has(path)) return <>{children}</>;
  if (loading) return <div className="grid min-h-svh place-items-center" role="status">Loading your workspace...</div>;
  if ((user && !passwordRecovery) || guest) return <>{children}</>;

  const lockedForMs = Math.max(0, lockedUntil - now);
  const locked = lockedForMs > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    setInfo(undefined);
    if (locked) return;
    if ((mode === "sign-up" || passwordRecovery) && password !== confirmPassword) {
      formAnalytics.validationFailed("password_confirmation", "mismatch");
      setError("Passwords do not match.");
      return;
    }
    formAnalytics.submitted();
    setSubmitting(true);
    const failure = passwordRecovery
      ? await completePasswordReset(password)
      : mode === "sign-in"
        ? await signIn(email, password)
        : mode === "sign-up"
          ? await signUp(email, password)
          : await requestPasswordReset(email);
    setSubmitting(false);
    if (failure) {
      formAnalytics.failed("authentication");
      const nextStrikes = strikes + 1;
      setStrikes(nextStrikes);
      if (nextStrikes % LOCK_THRESHOLD === 0) {
        const until = Date.now() + lockDurationMs(nextStrikes);
        setLockedUntil(until);
        setNow(Date.now());
        setError(`Too many failed attempts. Try again in ${Math.ceil(lockDurationMs(nextStrikes) / 1000)}s.`);
      } else {
        setError(failure);
      }
      return;
    }
    setStrikes(0);
    setLockedUntil(0);
    formAnalytics.succeeded();
    if (mode === "sign-up") setInfo("Check your email to confirm your account, then sign in.");
    if (mode === "reset-request") setInfo("If that account exists, a reset link has been sent.");
  };

  const submitGoogle = async () => {
    setError(undefined);
    setInfo(undefined);
    setGoogleSubmitting(true);
    formAnalytics.submitted();
    const failure = await signInWithGoogle(mode === "sign-up" ? "sign-up" : "sign-in");
    if (failure) {
      formAnalytics.failed("oauth");
      setGoogleSubmitting(false);
      setError(failure);
    }
    else formAnalytics.succeeded();
    // On success the browser navigates away to Google, so no need to clear `googleSubmitting`.
  };

  return (
    <div className="grid min-h-svh w-full min-w-0 place-items-center overflow-x-hidden px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
      <Panel className="w-full min-w-0 max-w-sm">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[.9rem] bg-gradient-to-br from-[#b4f27d] to-[#65c875] text-lg font-bold text-[#112010]">
            A♠
          </span>
          <div>
            <b className="block tracking-[-.02em]">CountLab</b>
            <small className="text-[var(--ink-muted)]">
              {passwordRecovery ? "Choose a new password" : mode === "sign-in" ? "Sign in to your account" : mode === "sign-up" ? "Create an account" : "Reset your password"}
            </small>
          </div>
        </div>
        {!passwordRecovery && <><p className="mb-3 text-sm text-[var(--ink-muted)]">Accounts keep your training and journal backed up across devices.</p><GhostButton className="mb-5 w-full" onClick={continueAsGuest}>Try CountLab as a guest</GhostButton></>}
        <form onSubmit={submit}>
          <div className="grid gap-3">
            {!passwordRecovery && <label className="grid gap-2 text-[.8rem] font-medium text-[var(--ink-muted)]">
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => { formAnalytics.start("email"); setEmail(event.target.value); }}
                className="field min-h-11 w-full rounded-xl px-3 text-[.95rem] text-[var(--ink)] outline-none"
              />
            </label>}
            {mode !== "reset-request" && <label className="grid gap-2 text-[.8rem] font-medium text-[var(--ink-muted)]">
              Password
              <input
                type="password"
                autoComplete={mode === "sign-in" && !passwordRecovery ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => { formAnalytics.start("password"); setPassword(event.target.value); }}
                className="field min-h-11 w-full rounded-xl px-3 text-[.95rem] text-[var(--ink)] outline-none"
              />
            </label>}
            {(mode === "sign-up" || passwordRecovery) && (
              <label className="grid gap-2 text-[.8rem] font-medium text-[var(--ink-muted)]">
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => { formAnalytics.start("password_confirmation"); setConfirmPassword(event.target.value); }}
                  className="field min-h-11 w-full rounded-xl px-3 text-[.95rem] text-[var(--ink)] outline-none"
                />
              </label>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-[var(--negative)]">
              {error}
            </p>
          )}
          {info && <p className="mt-3 text-sm text-[var(--accent)]">{info}</p>}
          <Button
            type="submit"
            disabled={submitting || locked || (!passwordRecovery && !email) || (mode !== "reset-request" && !password) || ((mode === "sign-up" || passwordRecovery) && !confirmPassword)}
            className="mt-5 w-full"
          >
            {locked
              ? `Try again in ${Math.ceil(lockedForMs / 1000)}s`
              : submitting
                ? "Please wait…"
                : passwordRecovery
                  ? "Update password"
                  : mode === "sign-in"
                  ? "Sign in"
                  : mode === "sign-up"
                    ? "Create account"
                    : "Send reset link"}
          </Button>
        </form>
        {!passwordRecovery && mode !== "reset-request" && <><div className="my-4 flex items-center gap-3 text-[.7rem] font-medium uppercase tracking-[.08em] text-[var(--ink-muted)]">
          <span className="h-px flex-1 bg-white/[.09]" />
          or
          <span className="h-px flex-1 bg-white/[.09]" />
        </div>
        <GhostButton type="button" onClick={submitGoogle} disabled={googleSubmitting} className="w-full">
          <i className="fa-brands fa-google mr-2" />
          {googleSubmitting ? "Redirecting…" : "Continue with Google"}
        </GhostButton></>}
        {!passwordRecovery && mode !== "reset-request" && <button
          type="button"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(undefined);
            setInfo(undefined);
          }}
          className="mt-4 min-h-11 w-full rounded-xl px-3 text-center text-xs text-[var(--ink-muted)] hover:bg-white/[.05] hover:text-[var(--ink)]"
        >
          {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>}
        {mode === "sign-in" && !passwordRecovery && <button type="button" onClick={() => { setMode("reset-request"); setError(undefined); setInfo(undefined); }} className="mt-2 min-h-11 w-full rounded-xl px-3 text-center text-xs text-[var(--ink-muted)] hover:bg-white/[.05] hover:text-[var(--ink)]">Forgot password?</button>}
        {mode === "reset-request" && !passwordRecovery && <button type="button" onClick={() => { setMode("sign-in"); setError(undefined); setInfo(undefined); }} className="mt-3 min-h-11 w-full rounded-xl px-3 text-center text-xs text-[var(--ink-muted)] hover:bg-white/[.05] hover:text-[var(--ink)]">Back to sign in</button>}
        {passwordRecovery && <button type="button" onClick={cancelPasswordRecovery} className="mt-3 min-h-11 w-full rounded-xl px-3 text-center text-xs text-[var(--ink-muted)] hover:bg-white/[.05] hover:text-[var(--ink)]">Cancel</button>}
        {!passwordRecovery && <p className="mt-4 text-xs leading-5 text-[var(--ink-muted)]">Guest progress stays on this device. After signing in, open Settings to preview and import this device’s guest history. Nothing transfers automatically.</p>}
        <p className="mt-5 text-center text-xs text-[var(--ink-muted)]">
          <Link href="/terms" className="hover:text-[var(--ink-muted)]">Terms</Link>
          {" · "}
          <Link href="/privacy" className="hover:text-[var(--ink-muted)]">Privacy</Link>
        </p>
      </Panel>
    </div>
  );
}
