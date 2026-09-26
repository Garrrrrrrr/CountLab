"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { announce } from "@/components/ui";
import type { ChartView } from "@/lib/blackjack/referenceChartModel";
import { normalizePath, routeInfo } from "@/lib/routes";

export const VIEW_PATH: Record<ChartView, string> = { basic: "/reference/", index: "/reference/deviations/" };

const viewForPath = (path: string): ChartView | undefined =>
  path === "/reference" ? "basic" : path === "/reference/deviations" ? "index" : undefined;

/**
 * The address switches without a navigation, so the head the route was
 * prerendered with is brought along by hand: bookmarks, shares and the
 * page_viewed event all read these.
 */
function syncHead(path: string) {
  const route = normalizePath(path);
  const { title, description } = routeInfo(route);
  document.title = `${title} · CountLab`;
  const canonical = document.querySelector<HTMLLinkElement>("link[rel='canonical']");
  const origin = canonical ? new URL(canonical.href).origin : location.origin;
  const url = `${origin}${path}`;
  canonical?.setAttribute("href", url);
  const set = (selector: string, value: string) => document.querySelector(selector)?.setAttribute("content", value);
  set("meta[property='og:url']", url);
  set("meta[name='description']", description);
  set("meta[property='og:title']", title);
  set("meta[property='og:description']", description);
  set("meta[name='twitter:title']", title);
  set("meta[name='twitter:description']", description);
}

/**
 * Basic strategy or with index plays: one page, two addresses. Switching
 * pushes /reference/ or /reference/deviations/ without remounting, so the
 * table rules, scroll position and open panels survive, and Back returns to
 * the previous view. The view follows the address, so Back, the sidebar
 * links and a reload all agree with it.
 */
export function useChartView(initial: ChartView) {
  const pathname = usePathname();
  const fromPath = viewForPath(normalizePath(pathname ?? ""));
  const [view, setView] = useState<ChartView>(fromPath ?? initial);
  const shown = useRef(view);

  useEffect(() => {
    if (!fromPath || fromPath === shown.current) return;
    shown.current = fromPath;
    setView(fromPath);
    syncHead(VIEW_PATH[fromPath]);
  }, [fromPath]);

  const choose = useCallback((next: ChartView) => {
    if (next === shown.current) return;
    shown.current = next;
    setView(next);
    syncHead(VIEW_PATH[next]);
    window.history.pushState(null, "", VIEW_PATH[next] + location.search + location.hash);
    announce(next === "index" ? "Index plays shown" : "Basic strategy shown");
  }, []);

  return [view, choose] as const;
}
