"use client";

import { useEffect, useState } from "react";
import { analytics } from "@/lib/analytics";
import { installAffordance, readPwaEnv } from "@/lib/pwa/standalone";
import { Button, GhostButton } from "./ui";

const DISMISSED_KEY = "countlab-install-dismissed";
type InstallMode = "none" | "ios-instructions" | "native";
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [mode, setMode] = useState<InstallMode>("none");
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;
    const affordance = installAffordance(readPwaEnv());
    if (affordance === "ios-instructions") {
      setMode("ios-instructions");
      analytics.track("install_prompt", { outcome: "shown", surface: "ios_instructions" });
    }
    if (affordance !== "native") return;
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
      setMode("native");
      analytics.track("install_prompt", { outcome: "shown", surface: "native" });
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (mode === "none") return null;
  const dismiss = () => {
    analytics.track("install_prompt", { outcome: "dismissed", surface: mode === "ios-instructions" ? "ios_instructions" : "native" });
    localStorage.setItem(DISMISSED_KEY, "1");
    setMode("none");
  };
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    analytics.track("install_prompt", { outcome: choice.outcome, surface: "native" });
    localStorage.setItem(DISMISSED_KEY, "1");
    setMode("none");
  };
  return (
    <div role="complementary" aria-label="Install CountLab" className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-2xl border border-white/10 bg-[#101411]/95 p-4 shadow-2xl backdrop-blur-2xl lg:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <p className="text-sm font-semibold text-zinc-100">Install CountLab</p>
      {mode === "ios-instructions" ? (
        <p className="mt-1 text-xs leading-5 text-zinc-400">Tap the Share button, then <b className="text-zinc-300">Add to Home Screen</b>. Installing keeps it working offline and stops iOS clearing your saved statistics.</p>
      ) : <p className="mt-1 text-xs leading-5 text-zinc-400">Add CountLab to your home screen for offline drills and a full-screen app window.</p>}
      <div className="mt-3 flex justify-end gap-2">
        <GhostButton className="px-3 py-1.5 text-sm" onClick={dismiss}>Not now</GhostButton>
        {mode === "native" && <Button className="px-3 py-1.5 text-sm" onClick={install}>Install</Button>}
      </div>
    </div>
  );
}
