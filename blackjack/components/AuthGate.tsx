"use client";

import { isKnownRoute, isPublicRoute } from "@/lib/routes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { useFormAnalytics } from "@/lib/analytics";
import { Button, GhostButton } from "./ui";
import { BrandLockup } from "./Brand";

// Unknown URLs render the missing-page screen rather than asking visitors to sign in.
const PUBLIC_PATHS = { has: (path: string) => isPublicRoute(path) || !isKnownRoute(path) };

// Supabase Auth already rate-limits sign-in/sign-up server-side; this is a
// client-side complement that slows down credential guessing directly in the
// browser (e.g. someone driving the form from the console) with an
// escalating lockout, independent of that server-side limit.
const LOCK_THRESHOLD = 5;
const lockDurationMs = (strikes: number) =>
  Math.min(30_000 * 2 ** Math.floor(strikes / LOCK_THRESHOLD - 1), 5 * 60_000);

export function AuthGate({ children }: { children: ReactNode }) {
  const path = usePathname().replace(/\/$/, "") || "/";
  const router = useRouter();
  // /signin always offers the form, even to a guest who chose to add an account.
  const onSigninPage = path === "/signin";
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
  const formAnalytics = useFormAnalytics(formName, !loading && (!user || passwordRecovery) && (!guest || onSigninPage) && !PUBLIC_PATHS.has(path));

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
  if (loading) return <div className="grid min-h-svh place-items-center bg-[var(--paper)] text-[var(--ink-muted)]" role="status"><span className="flex flex-col items-center gap-4 text-sm"><span className="animate-pulse"><BrandLockup tagline="Loading your workspace…" /></span></span></div>;
  if ((user && !passwordRecovery) || (guest && !onSigninPage)) return <>{children}</>;
  const enterAsGuest = () => {
    continueAsGuest();
    if (onSigninPage) router.push("/dashboard");
  };

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
    <div className="grid min-h-svh w-full min-w-0 bg-[var(--paper)] px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1.5rem+env(safe-area-inset-top))] text-[var(--ink)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:p-0">
      <section aria-label="Why create an account" className="hidden flex-col justify-between border-r border-[var(--rule)] bg-[radial-gradient(circle_at_20%_10%,rgba(52,211,153,.14),transparent_45%),var(--paper-raised)] p-12 lg:flex">
        <Link href="/" className="w-fit rounded-xl"><BrandLockup tagline="Blackjack practice and analysis" /></Link>
        <div className="max-w-md">
          <p className="font-data text-xs font-semibold uppercase tracking-[.18em] text-[var(--accent)]">Your training, everywhere</p>
          <h2 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-[-.03em]">Keep every drill, journal entry, and saved game.</h2>
          <ul className="mt-8 space-y-4 text-sm leading-6 text-[var(--ink-muted)]">
            {[
              ["fa-cloud-arrow-up", "Back up drill history, certifications, and the session journal."],
              ["fa-mobile-screen", "Pick up on your phone where you left off on your laptop."],
              ["fa-shield-halved", "Guest history stays separate until you choose to import it."],
            ].map(([icon, text]) => <li key={icon} className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--rule)] bg-[var(--paper)] text-[var(--accent)]"><i className={`fa-solid ${icon} text-xs`} aria-hidden="true" /></span><span className="pt-1">{text}</span></li>)}
          </ul>
        </div>
        <p className="text-xs text-[var(--ink-muted)]">Every drill and tool also works without an account.</p>
      </section>
      <div className="grid min-w-0 place-items-center lg:p-12">
      <div className="w-full min-w-0 max-w-sm">
        <Link href="/" className="mb-8 inline-flex rounded-xl lg:hidden"><BrandLockup /></Link>
        <h1 className="font-display text-2xl font-semibold tracking-[-.02em]">
          {passwordRecovery ? "Choose a new password" : mode === "sign-in" ? "Sign in to CountLab" : mode === "sign-up" ? "Create your account" : "Reset your password"}
        </h1>
        <p className="mb-6 mt-2 text-sm text-[var(--ink-muted)]">{passwordRecovery ? "Enter and confirm a new password for this account." : mode === "reset-request" ? "We will email you a link to set a new password." : "Accounts keep your training and journal backed up across devices."}</p>
        {!passwordRecovery && <GhostButton className="mb-5 w-full" onClick={enterAsGuest}><i className="fa-solid fa-user-clock mr-2 text-[var(--ink-muted)]" aria-hidden="true" />Try CountLab as a guest</GhostButton>}
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
          <span className="h-px flex-1 bg-[var(--rule)]" />
          or
          <span className="h-px flex-1 bg-[var(--rule)]" />
        </div>
        <GhostButton type="button" onClick={submitGoogle} disabled={googleSubmitting} className="w-full">
          <i className="fa-brands fa-google mr-2" aria-hidden="true" />
          {googleSubmitting ? "Redirecting…" : "Continue with Google"}
        </GhostButton></>}
        {!passwordRecovery && mode !== "reset-request" && <button
          type="button"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(undefined);
            setInfo(undefined);
          }}
          className="mt-4 min-h-11 w-full rounded-xl px-3 text-center text-xs text-[var(--ink-muted)] hover:bg-overlay/[.05] hover:text-[var(--ink)]"
        >
          {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>}
        {mode === "sign-in" && !passwordRecovery && <button type="button" onClick={() => { setMode("reset-request"); setError(undefined); setInfo(undefined); }} className="mt-2 min-h-11 w-full rounded-xl px-3 text-center text-xs text-[var(--ink-muted)] hover:bg-overlay/[.05] hover:text-[var(--ink)]">Forgot password?</button>}
        {mode === "reset-request" && !passwordRecovery && <button type="button" onClick={() => { setMode("sign-in"); setError(undefined); setInfo(undefined); }} className="mt-3 min-h-11 w-full rounded-xl px-3 text-center text-xs text-[var(--ink-muted)] hover:bg-overlay/[.05] hover:text-[var(--ink)]">Back to sign in</button>}
        {passwordRecovery && <button type="button" onClick={cancelPasswordRecovery} className="mt-3 min-h-11 w-full rounded-xl px-3 text-center text-xs text-[var(--ink-muted)] hover:bg-overlay/[.05] hover:text-[var(--ink)]">Cancel</button>}
        {!passwordRecovery && <p className="mt-4 text-xs leading-5 text-[var(--ink-muted)]">Guest progress stays on this device. After signing in, open Settings to preview and import this device’s guest history. Nothing transfers automatically.</p>}
        <p className="mt-6 text-center text-xs text-[var(--ink-muted)]">
          <Link href="/" className="hover:text-[var(--ink)]">Home</Link>
          {" · "}
          <Link href="/terms" className="hover:text-[var(--ink)]">Terms</Link>
          {" · "}
          <Link href="/privacy" className="hover:text-[var(--ink)]">Privacy</Link>
        </p>
      </div>
      </div>
    </div>
  );
}
