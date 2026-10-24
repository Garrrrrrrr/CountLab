"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, Save } from "lucide-react";
import { useCalculatorAnalytics } from "@/lib/analytics";
import { track } from "@/lib/analytics/track";
import { money, percent } from "@/lib/blackjack/labFormat";
import { tripOutlook } from "@/lib/blackjack/labModel";
import { announce, Button, Callout, cx, PageHeader } from "@/components/ui";
import { BankrollCard } from "./BankrollCard";
import { CompareCard } from "./CompareCard";
import { GameCard } from "./GameCard";
import { LibrarySheet } from "./LibrarySheet";
import { MethodNotes } from "./MethodNotes";
import { InlineUndo } from "./parts";
import { RampCard } from "./RampCard";
import { ResultsBar } from "./ResultsBar";
import { ResultsPanel } from "./ResultsPanel";
import { SaveSheet } from "./SaveSheet";
import { SuggestSheet } from "./SuggestSheet";
import { TripCard } from "./TripCard";
import { useCalculator, type Calc } from "./useCalculator";

type Tab = "game" | "bankroll" | "ramp" | "results";
const TABS: readonly { value: Tab; label: string }[] = [
  { value: "game", label: "Game" },
  { value: "bankroll", label: "Bankroll" },
  { value: "ramp", label: "Ramp" },
  { value: "results", label: "Results" },
];
/** Anchors a link can carry, and the tab each lives on below the two-column layout. */
const ANCHORS: Record<string, Tab> = { game: "game", bankroll: "bankroll", ramp: "ramp", results: "results", trip: "results", compare: "results" };
/** Below this width the page is four tabs with a results bar; from it, inputs and results sit side by side. */
const COMPACT_QUERY = "(max-width: 1279.98px)";
const compact = () => matchMedia(COMPACT_QUERY).matches;

/** Lets keyboard users scroll the sticky results column when it is taller than the window. */
function useScrollableRegion<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const update = () => {
      if (element.scrollHeight > element.clientHeight + 1 && !compact()) element.tabIndex = 0;
      else element.removeAttribute("tabindex");
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return ref;
}

/** Which setup is open, whether it changed, and the way back to the example. */
function StatusLine({ calc }: { calc: Calc }) {
  const { active, edited, pristine } = calc;
  return (
    <div className="-mt-2 mb-4 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2 sm:-mt-4">
      {active ? (
        <p className="flex min-w-0 items-center gap-2">
          {edited && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />}
          <span className="min-w-0 truncate">Scenario: <b className="font-semibold text-ink">{active.name}</b>{edited && " · edited"}</span>
        </p>
      ) : pristine ? (
        <p>Example setup: a typical 6-deck game. Change anything and the results update.</p>
      ) : (
        <p>Unsaved setup</p>
      )}
      {!pristine && (
        <button type="button" onClick={calc.startOver} className="no-print min-h-11 rounded-md font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink sm:min-h-0">
          Start over
        </button>
      )}
      <InlineUndo calc={calc} source="header" className="no-print" />
    </div>
  );
}

/**
 * The Calculator: the Game & Bankroll Lab rebuilt. One page that answers what
 * a game earns, how much it swings, whether a bankroll can take it and what a
 * trip looks like, from the audited simulation profiles. Wide screens show the
 * inputs beside sticky results; narrower ones show four tabs with a live
 * results bar above the tab bar.
 */
export function Calculator() {
  useCalculatorAnalytics("game_bankroll_lab");
  const calc = useCalculator();
  const { config, pricing } = calc;
  const trip = useMemo(() => tripOutlook(config, pricing.result), [config, pricing.result]);
  const [tab, setTab] = useState<Tab>("game");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const resultsColumn = useScrollableRegion<HTMLDivElement>();

  const selectTab = (next: Tab, moveFocus = false) => {
    if (next !== tab) {
      setTab(next);
      const url = new URL(location.href);
      url.hash = next;
      history.replaceState(history.state, "", url);
      track("cvcx_tab_changed", { tab: next });
    }
    if (!moveFocus) return;
    requestAnimationFrame(() => {
      const tabs = document.getElementById("calc-tabs");
      if (tabs && tabs.getBoundingClientRect().top < 0) window.scrollTo({ top: window.scrollY + tabs.getBoundingClientRect().top - 64 });
      document.getElementById(`${next}-title`)?.focus({ preventScroll: true });
    });
  };

  // A #game, #bankroll, #ramp, #results, #trip or #compare link picks the tab
  // on narrow screens and scrolls to that card on wide ones.
  useEffect(() => {
    const follow = () => {
      const hash = location.hash.slice(1);
      const target = ANCHORS[hash];
      if (!target) return;
      if (compact()) setTab(target);
      requestAnimationFrame(() => { if (!compact() || hash !== target) document.getElementById(hash)?.scrollIntoView({ block: "start" }); });
    };
    follow();
    addEventListener("hashchange", follow);
    return () => removeEventListener("hashchange", follow);
  }, []);

  // A scenario opened by link is complete, so it lands on its results.
  const arrived = calc.arrival.status;
  useEffect(() => {
    if (arrived === "loaded" && !ANCHORS[location.hash.slice(1)]) setTab("results");
  }, [arrived]);

  const showRules = () => {
    setRulesOpen(true);
    if (compact()) setTab("game");
    requestAnimationFrame(() => document.getElementById("game")?.scrollIntoView({ block: "start" }));
  };

  // Screen readers hear the headline a second after the inputs settle, only when it changed.
  const { result, noBets } = pricing;
  const spoken = noBets ? "Not betting at any count." : `Win ${money(result.hourlyEv, 2)} an hour, standard deviation ${money(result.sdPerHour)} an hour, risk of ruin ${percent(result.riskOfRuin)}.`;
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

  /** Hidden on the other tabs below the two-column layout; always shown when wide and in print. */
  const on = (which: Tab) => (tab === which ? "" : "hidden xl:block print:block");
  const arrival = calc.arrival;

  return (
    <div className="min-w-0 pb-20 lg:pb-0">
      <PageHeader
        eyebrow="Game and bankroll lab"
        title="Calculator"
        sub="What a game earns, how much it swings, whether your bankroll can take it, and what a trip could look like."
        actions={
          <div className="no-print flex gap-2">
            <Button variant="secondary" onClick={() => setLibraryOpen(true)} aria-haspopup="dialog" icon={<FolderOpen size={17} aria-hidden />}>
              Scenarios
              {calc.templates.length > 0 && <span className="tnum rounded-full bg-surface-3 px-1.5 text-xs text-ink-2"><span aria-hidden>{calc.templates.length}</span><span className="sr-only">, {calc.templates.length} saved</span></span>}
            </Button>
            <Button variant="secondary" onClick={() => setSaveOpen(true)} aria-haspopup="dialog" aria-label="Save scenario" icon={<Save size={17} aria-hidden />}>Save</Button>
          </div>
        }
      />
      <StatusLine calc={calc} />

      {arrival.status !== "none" && (
        <div role="status" className="mb-4">
          {arrival.status === "loaded" ? (
            <Callout tone="pos" title={`Loaded “${arrival.name}”.`} action={<Button variant="ghost" size="sm" className="-ml-2 min-h-11 sm:min-h-9" onClick={calc.dismissArrival}>Dismiss</Button>}>
              Changes here do not alter the saved scenario until you save.
            </Callout>
          ) : (
            <Callout tone="warn" title="That scenario is not saved on this account or device."
              action={<div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" className="min-h-11 sm:min-h-9" onClick={() => setLibraryOpen(true)}>Open Scenarios</Button><Button variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={calc.dismissArrival}>Dismiss</Button></div>}>
              It may have been deleted, or saved while signed in to another account.
            </Callout>
          )}
        </div>
      )}

      <div id="calc-tabs" role="tablist" aria-label="Calculator steps"
        className="no-print sticky top-[calc(3.5rem+var(--safe-t))] z-20 -mx-4 mb-4 grid grid-cols-4 border-b border-line bg-bg/90 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10 xl:hidden"
        onKeyDown={(event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
          event.preventDefault();
          const index = TABS.findIndex((item) => item.value === tab);
          const next = TABS[(index + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length];
          selectTab(next.value);
          requestAnimationFrame(() => document.getElementById(`calc-tab-${next.value}`)?.focus());
        }}>
        {TABS.map((item) => {
          const selected = item.value === tab;
          return (
            <button key={item.value} id={`calc-tab-${item.value}`} type="button" role="tab" aria-selected={selected} tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(item.value, true)}
              className={cx("relative h-12 min-w-0 truncate px-1 text-sm font-semibold transition", selected ? "text-ink after:absolute after:inset-x-3 after:bottom-[-1px] after:h-0.5 after:rounded-full after:bg-brand" : "text-ink-3 hover:text-ink")}>
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <GameCard calc={calc} rulesOpen={rulesOpen} onRulesOpenChange={setRulesOpen} className={on("game")} />
          <BankrollCard calc={calc} className={on("bankroll")} />
          <RampCard calc={calc} onSuggest={() => setSuggestOpen(true)} className={on("ramp")} />
          <TripCard calc={calc} trip={trip} className={on("results")} />
          <CompareCard calc={calc} trip={trip} onSave={() => setSaveOpen(true)} className={on("results")} />
          <MethodNotes useIndices={config.useIndices} className={on("results")} />
        </div>
        <div ref={resultsColumn} aria-label="Results column"
          className={cx("order-first min-w-0 xl:sticky xl:top-6 xl:order-none xl:max-h-[calc(100dvh-3rem)] xl:w-[23rem] xl:shrink-0 xl:overflow-y-auto xl:rounded-[var(--radius)]", on("results"))}>
          <ResultsPanel calc={calc} trip={trip} onShowRules={showRules} onSuggest={() => setSuggestOpen(true)} />
        </div>
      </div>

      {tab !== "results" && <ResultsBar calc={calc} trip={trip} onOpenResults={() => selectTab("results", true)} className="xl:hidden" />}

      <LibrarySheet calc={calc} open={libraryOpen} onClose={() => setLibraryOpen(false)} onLoaded={() => { if (compact()) selectTab("results"); }} onSaveCurrent={() => { setLibraryOpen(false); setSaveOpen(true); }} />
      <SaveSheet calc={calc} open={saveOpen} onClose={() => setSaveOpen(false)} />
      <SuggestSheet calc={calc} open={suggestOpen} onClose={() => setSuggestOpen(false)} />
    </div>
  );
}
