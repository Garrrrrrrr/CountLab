"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ChevronLeft } from "lucide-react";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { useFormAnalytics } from "@/lib/analytics";
import { Button, ButtonLink, Callout, Segmented, TextField } from "@/components/ui";
import { Wordmark } from "@/components/shell/Logo";

type Mode = "signin" | "signup" | "reset";

const BENEFITS = [
  "Back up your drill history and journal",
  "Pick up on your phone where you left off on a laptop",
  "Keep your table rules and calculator scenarios everywhere",
];

/** A G mark drawn in the four Google colours, so the button needs no image. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

export function SignInPage() {
  const router = useRouter();
  const { user, loading, signIn, signUp, signInWithGoogle, requestPasswordReset } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const formAnalytics = useFormAnalytics(mode === "signup" ? "signup" : mode === "reset" ? "password_reset" : "login", !loading && !user);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(undefined);
    setNotice(undefined);
    if (!email.includes("@")) { formAnalytics.validationFailed("email", "format"); setError("Enter your email address."); return; }
    if (mode !== "reset" && password.length < (mode === "signup" ? 8 : 1)) { formAnalytics.validationFailed("password", "length"); setError(mode === "signup" ? "Use at least 8 characters for your password." : "Enter your password."); return; }
    setBusy(true);
    formAnalytics.submitted();
    const message = mode === "signin" ? await signIn(email, password) : mode === "signup" ? await signUp(email, password) : await requestPasswordReset(email);
    setBusy(false);
    if (message) { formAnalytics.failed("server"); setError(message); return; }
    formAnalytics.succeeded();
    if (mode === "signup") setNotice("Check your email to confirm your account, then sign in.");
    else if (mode === "reset") setNotice("If that email has an account, a reset link is on its way.");
    else router.push("/train");
  };

  return (
    <div className="mx-auto grid min-h-[calc(100dvh-2rem)] max-w-5xl items-center gap-10 py-6 lg:grid-cols-2 lg:py-12">
      <div className="hidden lg:block">
        <Wordmark />
        <h1 className="mt-8 text-4xl leading-tight">Your training, on every device.</h1>
        <ul className="mt-6 space-y-3">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-3 text-ink-2">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/20 text-brand-text"><Check size={14} strokeWidth={3} aria-hidden /></span>
              {benefit}
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-ink-3">An account is optional. Everything works as a guest and stays on this device.</p>
      </div>

      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink lg:hidden"><ChevronLeft size={16} aria-hidden /> CountLab</Link>
        <div className="card p-5 sm:p-7">
          {user ? (
            <div className="space-y-4">
              <h1 className="text-2xl">You&rsquo;re signed in</h1>
              <p className="text-ink-2">Signed in as <span className="font-semibold text-ink">{user.email}</span>. Your training and journal sync to this account.</p>
              <ButtonLink href="/train" block size="lg">Go to training</ButtonLink>
            </div>
          ) : (
            <>
              <h1 className="text-2xl">{mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Sign in"}</h1>
              <p className="mt-1 text-sm text-ink-2">{mode === "reset" ? "We'll email you a link to choose a new password." : "Free. Syncs your training, journal and settings."}</p>
              {mode !== "reset" && (
                <>
                  <Segmented className="mt-5" label="Account" hideLabel value={mode} onChange={(value) => { setMode(value); setError(undefined); setNotice(undefined); }}
                    options={[{ value: "signin", label: "Sign in" }, { value: "signup", label: "Create account" }]} />
                  <Button variant="outline" block className="mt-4" icon={<GoogleMark />} disabled={busy}
                    onClick={async () => { const message = await signInWithGoogle(mode === "signup" ? "sign-up" : "sign-in"); if (message) setError(message); }}>
                    Continue with Google
                  </Button>
                  <div className="my-4 flex items-center gap-3 text-xs text-ink-3"><span className="h-px flex-1 bg-surface-3" />or with email<span className="h-px flex-1 bg-surface-3" /></div>
                </>
              )}
              <form onSubmit={submit} className="space-y-4" noValidate>
                <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                {mode !== "reset" && (
                  <TextField label="Password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)}
                    hint={mode === "signup" ? "At least 8 characters." : undefined} />
                )}
                {error && <Callout tone="neg">{error}</Callout>}
                {notice && <Callout tone="pos">{notice}</Callout>}
                <Button type="submit" block size="lg" disabled={busy}>
                  {busy ? "One moment…" : mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
                </Button>
              </form>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
                {mode === "reset"
                  ? <button type="button" className="font-semibold text-ink underline-offset-2 hover:underline" onClick={() => setMode("signin")}>Back to sign in</button>
                  : <button type="button" className="font-semibold text-ink underline-offset-2 hover:underline" onClick={() => setMode("reset")}>Forgot password?</button>}
                <Link href="/train" className="text-ink-2 hover:text-ink">Continue as a guest</Link>
              </div>
            </>
          )}
        </div>
        <p className="mt-4 text-center text-xs leading-5 text-ink-3">
          By continuing you agree to the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>. Guest history stays separate from your account until you import it in Settings.
        </p>
      </div>
    </div>
  );
}
