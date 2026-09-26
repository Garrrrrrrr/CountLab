"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics/track";
import { money, percent } from "@/lib/blackjack/labFormat";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { announce, GhostButton } from "./ui";
import { BankrollCard } from "./cvcx/BankrollCard";
import { CompareGames } from "./cvcx/CompareGames";
import { GameCard } from "./cvcx/GameCard";
import { LabHeader, LabNotices } from "./cvcx/LabHeader";
import { MethodNotes } from "./cvcx/MethodNotes";
import { RampCard } from "./cvcx/RampCard";
import { ResultDock } from "./cvcx/ResultDock";
import { ResultsPanel } from "./cvcx/ResultsPanel";
import { SaveScenario } from "./cvcx/SaveScenario";
import { ScenarioLibrary } from "./cvcx/ScenarioLibrary";
import { TabList } from "./cvcx/TabList";
import { TripOutlook } from "./cvcx/TripOutlook";
import { useLab } from "./cvcx/useLab";

type LabTab = "game" | "bankroll" | "ramp" | "results";
const TABS: ReadonlyArray<{ value: LabTab; label: string; step?: number }> = [
  { value: "game", label: "Game", step: 1 },
  { value: "bankroll", label: "Bankroll", step: 2 },
  { value: "ramp", label: "Bet ramp", step: 3 },
  { value: "results", label: "Results" },
];
const TAB_LABEL = Object.fromEntries(TABS.map((item) => [item.value, item.label])) as Record<LabTab, string>;
const isTab = (value: string): value is LabTab => value in TAB_LABEL;
/** Below this width the Lab is four step tabs with a result dock; above it, inputs and results sit side by side. */
const COMPACT_QUERY = "(max-width: 1279.98px)";

/** Lets keyboard users scroll the sticky results column when it is taller than the window. */
function useScrollableRegion<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const update = () => {
      if (element.scrollHeight > element.clientHeight + 1) element.tabIndex = 0;
      else element.removeAttribute("tabindex");
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return ref;
}

/**
 * Game & Bankroll Lab: set up a game, a bankroll and a bet ramp, and see the
 * expected win, the swing, the risk of ruin and the bankroll it needs. Wide
 * screens show the three steps beside live results; narrower ones show the
 * same content as step tabs with a one-line result dock.
 */
export function CvcxLab() {
  const lab = useLab();
  const compact = useMediaQuery(COMPACT_QUERY, false);
  const [tab, setTab] = useState<LabTab>("game");
  const [returnTab, setReturnTab] = useState<LabTab>("ramp");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [arrivalDismissed, setArrivalDismissed] = useState(false);
  const rampOpened = useRef(false);
  const results = useScrollableRegion<HTMLElement>();

  // A #game, #bankroll, #ramp or #results link picks the tab on narrow
  // screens and scrolls to that card on wide ones (the page mounts after
  // sign-in resolves, too late for the browser's own anchor jump).
  useEffect(() => {
    const follow = () => {
      const hash = location.hash.slice(1);
      if (!isTab(hash)) return;
      if (matchMedia(COMPACT_QUERY).matches) setTab(hash);
      else document.getElementById(hash)?.scrollIntoView({ block: "start" });
    };
    follow();
    addEventListener("hashchange", follow);
    return () => removeEventListener("hashchange", follow);
  }, []);

  // A scenario opened by link is complete, so it lands on its results.
  const arrivalStatus = lab.arrival.status;
  useEffect(() => {
    if (arrivalStatus === "loaded" && !isTab(location.hash.slice(1))) setTab("results");
  }, [arrivalStatus]);

  const selectTab = (next: LabTab, moveFocus = false) => {
    if (next === tab) return;
    if (next === "results") setReturnTab(tab);
    setTab(next);
    history.replaceState(null, "", `#${next}`);
    track("cvcx_tab_changed", { tab: next });
    if (!moveFocus) return;
    requestAnimationFrame(() => {
      const tabs = document.getElementById("lab-tabs");
      if (tabs && tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ block: "start" });
      document.getElementById(`${next}-title`)?.focus({ preventScroll: true });
    });
  };

  // Wide screens have no Bet ramp tab; count the first visit to the ramp card instead.
  const rampInteraction = () => {
    if (compact || rampOpened.current) return;
    rampOpened.current = true;
    track("cvcx_tab_changed", { tab: "ramp" });
  };

  const showRules = () => {
    setRulesOpen(true);
    if (compact) selectTab("game");
    requestAnimationFrame(() => document.getElementById("game")?.scrollIntoView({ block: "start" }));
  };

  // Screen readers hear the headline a second after the inputs settle, only when it changed.
  const { result, noBets } = lab.model;
  const spoken = noBets ? "Not betting at any count." : `Expected ${money(result.hourlyEv, 2)} an hour, risk of ruin ${percent(result.riskOfRuin)}.`;
  const lastSpoken = useRef(spoken);
  const settled = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => { settled.current = true; }, 1500);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!settled.current || spoken === lastSpoken.current) { lastSpoken.current = spoken; return; }
      lastSpoken.current = spoken;
      announce(spoken);
    }, 1000);
    return () => clearTimeout(timer);
  }, [spoken]);

  const panel = (id: LabTab, className = "") => ({
    id: `lab-panel-${id}`,
    "data-active": tab === id ? "" : undefined,
    role: compact ? "tabpanel" : undefined,
    "aria-labelledby": compact ? `lab-tab-${id}` : undefined,
    className: `lab-panel min-w-0 ${className}`,
  });
  const nextButton = (to: LabTab, label: string) => compact && (
    <GhostButton className="lab-next mt-4 w-full" onClick={() => selectTab(to, true)}>
      {label}<i className="fa-solid fa-arrow-right ml-2 text-xs" aria-hidden="true" />
    </GhostButton>
  );

  return (
    <div className="lab-root min-w-0">
      <LabHeader lab={lab} onOpenLibrary={() => setLibraryOpen(true)} onOpenSave={() => setSaveOpen(true)} />
      <LabNotices lab={lab} onOpenLibrary={() => setLibraryOpen(true)} arrivalDismissed={arrivalDismissed} onDismissArrival={() => setArrivalDismissed(true)} />

      {compact && (
        <div id="lab-tabs" className="lab-tabs no-print mb-4 scroll-mt-20">
          <TabList label="Lab steps" value={tab} onChange={(next) => selectTab(next)} items={TABS} idFor={(value) => `lab-tab-${value}`} panelIdFor={(value) => `lab-panel-${value}`} />
        </div>
      )}

      <div className="lab-workspace grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,23rem)] xl:gap-x-6">
        <div {...panel("game", "xl:col-start-1")}>
          <GameCard lab={lab} rulesOpen={rulesOpen} onRulesOpenChange={setRulesOpen} />
          {nextButton("bankroll", "Next: Bankroll")}
        </div>
        <div {...panel("bankroll", "xl:col-start-1")}>
          <BankrollCard lab={lab} />
          {nextButton("ramp", "Next: Bet ramp")}
        </div>
        <div {...panel("ramp", "xl:col-start-1")}>
          <RampCard lab={lab} onInteract={rampInteraction} />
          {nextButton("results", "See results")}
        </div>
        <div {...panel("results", "grid grid-cols-[minmax(0,1fr)] gap-4 xl:contents")}>
          <ResultsPanel ref={results} lab={lab} onShowRules={showRules} className="xl:sticky xl:top-[calc(5rem+env(safe-area-inset-top))] xl:col-start-2 xl:row-span-6 xl:row-start-1 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto" />
          <TripOutlook lab={lab} className="xl:col-start-1" />
          <CompareGames lab={lab} className="xl:col-start-1" />
          <MethodNotes estimated={lab.model.estimated} ruleAdjustment={lab.model.ruleAdjustment} className="xl:col-start-1" />
        </div>
      </div>

      {compact && (
        <ResultDock
          model={lab.model}
          onResults={() => selectTab("results", true)}
          back={tab === "results" ? { label: TAB_LABEL[returnTab], onClick: () => selectTab(returnTab, true) } : undefined}
        />
      )}

      <ScenarioLibrary
        lab={lab}
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onLoaded={() => { if (compact) selectTab("results"); }}
        onSaveCurrent={() => { setLibraryOpen(false); setSaveOpen(true); }}
      />
      <SaveScenario lab={lab} open={saveOpen} onClose={() => setSaveOpen(false)} />
    </div>
  );
}
