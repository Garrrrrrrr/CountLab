"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { AUTH_EVENT, hasValidSession, startSession, verifyPassword } from "@/lib/auth/passwordGate";
import { Button, Panel } from "./ui";

const PUBLIC_PATHS = new Set(["/terms", "/privacy"]);

export function PasswordGate({ children }: { children: ReactNode }) {
  const path = usePathname().replace(/^\/blackjack(?=\/|$)/, "").replace(/\/$/, "") || "/dashboard";
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (hasValidSession()) setUnlocked(true);
    const sync = () => setUnlocked(hasValidSession());
    addEventListener(AUTH_EVENT, sync);
    return () => removeEventListener(AUTH_EVENT, sync);
  }, []);

  if (unlocked || PUBLIC_PATHS.has(path)) return <>{children}</>;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setChecking(true);
    setError(undefined);
    const ok = await verifyPassword(password);
    setChecking(false);
    if (ok) {
      startSession();
      setUnlocked(true);
    } else {
      setError("Incorrect password.");
      setPassword("");
    }
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
            <small className="text-zinc-500">This section is private</small>
          </div>
        </div>
        <form onSubmit={submit}>
          <label className="grid gap-2 text-[.8rem] font-medium text-zinc-400">
            Password
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field min-h-11 w-full rounded-xl px-3 text-[.95rem] text-zinc-100 outline-none"
            />
          </label>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-300">
              {error}
            </p>
          )}
          <Button type="submit" disabled={checking || !password} className="mt-5 w-full">
            {checking ? "Checking…" : "Unlock"}
          </Button>
        </form>
        <p className="mt-5 text-center text-xs text-zinc-600">
          <Link href="/terms" className="hover:text-zinc-400">Terms</Link>
          {" · "}
          <Link href="/privacy" className="hover:text-zinc-400">Privacy</Link>
        </p>
      </Panel>
    </div>
  );
}
