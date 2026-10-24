"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useSettings } from "@/lib/hooks/useSettings";
import { IconButton } from "@/components/ui";
import type { Settings } from "@/lib/statistics/storage";

const NEXT: Record<Settings["theme"], Settings["theme"]> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Settings["theme"], string> = { system: "Theme: match device", light: "Theme: light", dark: "Theme: dark" };

/** Applies a theme choice to the page immediately, before it is saved. */
export function applyTheme(theme: Settings["theme"]) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  try { localStorage.setItem("countlab:theme", theme); } catch { /* storage blocked: the choice still applies to this page */ }
}

/** Cycles system → light → dark. One tap, saved straight away. */
export function ThemeToggle({ className }: { className?: string }) {
  const { settings, update } = useSettings();
  const Icon = settings.theme === "light" ? Sun : settings.theme === "dark" ? Moon : Monitor;
  return (
    <IconButton className={className} label={`${LABEL[settings.theme]}. Change theme`} onClick={() => {
      const next = NEXT[settings.theme];
      applyTheme(next);
      update({ theme: next });
    }}>
      <Icon size={19} aria-hidden />
    </IconButton>
  );
}
