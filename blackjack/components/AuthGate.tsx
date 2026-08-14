"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, ReactNode, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { Button, Panel } from "./ui";

const PUBLIC_PATHS = new Set(["/terms", "/privacy"]);

export function AuthGate({ children }: { children: ReactNode }) {
  const path = usePathname().replace(/\/$/, "") || "/dashboard";
  const { user, loading, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  if (PUBLIC_PATHS.has(path)) return <>{children}</>;
  if (loading) return null;
  if (user) return <>{children}</>;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    setInfo(undefined);
    const failure = mode === "sign-in" ? await signIn(email, password) : await signUp(email, password);
    setSubmitting(false);
    if (failure) {
      setError(failure);
      return;
    }
    if (mode === "sign-up") setInfo("Check your email to confirm your account, then sign in.");
  };

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Panel className="w-full max-w-sm">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[.9rem] bg-gradient-to-br from-[#b4f27d] to-[#65c875] text-lg font-bold text-[#112010]">
            A♠
          </span>
          <div>
            <b className="block tracking-[-.02em]">CountLab</b>
            <small className="text-zinc-500">{mode === "sign-in" ? "Sign in to your account" : "Create an account"}</small>
          </div>
        </div>
        <form onSubmit={submit}>
          <div className="grid gap-3">
            <label className="grid gap-2 text-[.8rem] font-medium text-zinc-400">
              Email
              <input
                type="email"
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="field min-h-11 w-full rounded-xl px-3 text-[.95rem] text-zinc-100 outline-none"
              />
            </label>
            <label className="grid gap-2 text-[.8rem] font-medium text-zinc-400">
              Password
              <input
                type="password"
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="field min-h-11 w-full rounded-xl px-3 text-[.95rem] text-zinc-100 outline-none"
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-300">
              {error}
            </p>
          )}
          {info && <p className="mt-3 text-sm text-emerald-300">{info}</p>}
          <Button type="submit" disabled={submitting || !email || !password} className="mt-5 w-full">
            {submitting ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(undefined);
            setInfo(undefined);
          }}
          className="mt-4 w-full text-center text-xs text-zinc-500 hover:text-zinc-300"
        >
          {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
        <p className="mt-5 text-center text-xs text-zinc-600">
          <Link href="/terms" className="hover:text-zinc-400">Terms</Link>
          {" · "}
          <Link href="/privacy" className="hover:text-zinc-400">Privacy</Link>
        </p>
      </Panel>
    </div>
  );
}
