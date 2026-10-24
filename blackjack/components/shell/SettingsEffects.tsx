"use client";
import { useEffect } from "react";
import { useSettings } from "@/lib/hooks/useSettings";
import { applyTheme } from "./ThemeToggle";

/**
 * Keeps the page in step with saved settings that arrive later: a theme or
 * animation choice synced from another device, or restored from a backup.
 */
export function SettingsEffects() {
  const { settings, ready } = useSettings();
  useEffect(() => {
    if (ready) applyTheme(settings.theme);
  }, [ready, settings.theme]);
  useEffect(() => {
    if (!ready) return;
    const off = !settings.animations;
    if (off) document.documentElement.dataset.motion = "off";
    else delete document.documentElement.dataset.motion;
    try { localStorage.setItem("countlab:motion", off ? "off" : "on"); } catch { /* storage blocked: applies to this page only */ }
  }, [ready, settings.animations]);
  return null;
}
