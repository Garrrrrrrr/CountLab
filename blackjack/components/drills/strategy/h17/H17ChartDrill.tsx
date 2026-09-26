"use client";
import Link from "next/link";
import { KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { DrillFrame, DrillHud, DrillSummary } from "@/components/drill";
import { announce, Button, Callout, GhostButton, KeyHint, Panel, Switch, toast } from "@/components/ui";
import { ConfirmModal } from "@/components/ConfirmModal";
import { analytics } from "@/lib/analytics";
import { CHART_DEALERS, cellKey, chartToken, type ChartSectionId } from "@/lib/blackjack/bjaH17Chart";
import { explainToken, feedCell, type FeedResult, type KeypadKey } from "@/lib/blackjack/chartEntry";
import { cellKeysOf, chartTableFor, gradeScope, indexCellKeys, sectionsFor, settledCounts, surrenderEntryKeys, withoutKeys, type SectionChoice } from "@/lib/blackjack/chartDrill";
import { CHART_SURRENDER_LABEL, type ChartSurrenderRule } from "@/lib/blackjack/es10Chart";
import { clockText, spokenDuration } from "@/lib/statistics/drillRound";
import { makeSession, storage, type Mistake, type Session, type Settings } from "@/lib/statistics/storage";
import { useDrillProgress } from "@/lib/statistics/useDrillProgress";
import { useWakeLock } from "@/lib/pwa/useWakeLock";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { reveal, useNow, useStoredSessions, useStrategySettings } from "../hooks";
import { PracticeLines, ReferenceLink } from "../parts";
import { ChartKeypad } from "./ChartKeypad";
import { SectionKeys } from "./ChartKeys";
import { ChartSection, type CellMode } from "./ChartSection";
import { ChartSetup, type ChartFeedback, type ChartPick } from "./ChartSetup";

const DRILL = "H17 Chart" as const;
const REFERENCE = { href: "/reference/h17-chart", label: "View H17 reference" };
const DESCRIPTION = "Fill in the H17 deviation chart from memory. Type a letter for each play, or a count like 4+ where the play changes with the count.";
const CHOICES: readonly SectionChoice[] = ["all", "pairs", "soft", "hard", "surrender"];

/**
 * Saved progress ("hilo:progress:H17 Chart"). `entries`, `choice`, `feedback`
 * and `startedAt` are the original shape; the rest are optional additions
 * older versions ignore: the surrender table the answers were typed for, the
 * time actually spent filling in (so a chart resumed the next day does not
 * count the night), and the cells in scope for index-only and retry charts.
 */
type H17Saved = {
  entries: Record<string, string>;
  choice: SectionChoice;
  feedback: ChartFeedback;
  startedAt: number;
  surrenderTable?: ChartSurrenderRule;
  activeMs?: number;
  only?: string[];
  scope?: "index" | "retry";
};

interface CellRef {
  key: string;
  section: ChartSectionId;
  row: string;
  dealer: string;
  sectionIndex: number;
  rowIndex: number;
  columnIndex: number;
}

const filledEntries = (entries: Record<string, unknown> | undefined) =>
  Object.fromEntries(Object.entries(entries ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""));

function boot(settings: Settings) {
  const progress = storage.progress<Partial<H17Saved>>(DRILL);
  const state = progress?.state;
  const entries = filledEntries(state?.entries);
  const resuming = Object.keys(entries).length > 0;
  const choice = CHOICES.includes(state?.choice as SectionChoice) ? (state!.choice as SectionChoice) : "all";
  const scope = state?.scope === "index" || state?.scope === "retry" ? state.scope : undefined;
  return {
    phase: resuming ? ("play" as const) : ("setup" as const),
    entries,
    pick: (scope === "index" ? "index" : choice) as ChartPick,
    feedback: (state?.feedback === "end" ? "end" : "live") as ChartFeedback,
    table: state?.surrenderTable === "late" || state?.surrenderTable === "early10" ? state.surrenderTable : chartTableFor(settings.surrender),
    activeMs: resuming && typeof state?.activeMs === "number" && state.activeMs >= 0 ? state.activeMs : 0,
    startedAt: typeof state?.startedAt === "number" ? state.startedAt : Date.now(),
    only: resuming && scope && Array.isArray(state?.only) ? state.only.filter((key): key is string => typeof key === "string") : undefined,
    scope: resuming ? scope : undefined,
  };
}

/** The HUD's Grade chart button, where Escape sends focus out of the chart. */
const gradeButton = () => document.querySelector<HTMLButtonElement>("main button[data-grade-chart]");
const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function H17ChartDrill() {
  const settings = useStrategySettings();
  const sessions = useStoredSessions();
  const [initial] = useState(() => boot(storage.settings()));
  const [phase, setPhase] = useState<"setup" | "play" | "summary">(initial.phase);
  const [pick, setPick] = useState<ChartPick>(initial.pick);
  const [feedback, setFeedback] = useState<ChartFeedback>(initial.feedback);
  const [table, setTable] = useState<ChartSurrenderRule>(initial.table);
  const [entries, setEntries] = useState<Record<string, string>>(initial.entries);
  const [only, setOnly] = useState<string[] | undefined>(initial.only);
  const [scope, setScope] = useState<"index" | "retry" | undefined>(initial.scope);
  const [startedAt, setStartedAt] = useState(initial.startedAt);
  const [activeMs, setActiveMs] = useState(initial.activeMs);
  const [focus, setFocus] = useState(0);
  const [result, setResult] = useState<Session>();
  const [resultMs, setResultMs] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmGrade, setConfirmGrade] = useState(false);
  const [mistakeRows, setMistakeRows] = useState(false);
  const keypad = useMediaQuery("(max-width: 1023px), (pointer: coarse)");
  const wide = useMediaQuery("(min-width: 640px)");
  const hintId = useId();
  const [mac] = useState(isMac);

  const choice: SectionChoice = pick === "index" ? "all" : pick;
  const sections = useMemo(() => sectionsFor(choice, table), [choice, table]);
  const onlySet = useMemo(() => (only ? new Set(only) : undefined), [only]);
  const cells = useMemo(() => {
    const list: CellRef[] = [];
    sections.forEach((section, sectionIndex) => section.rows.forEach((row, rowIndex) => CHART_DEALERS.forEach((dealer, columnIndex) => {
      const key = cellKey(section.id, row, dealer);
      if (!onlySet || onlySet.has(key)) list.push({ key, section: section.id, row, dealer, sectionIndex, rowIndex, columnIndex });
    })));
    return list;
  }, [sections, onlySet]);
  const indexOf = useMemo(() => new Map(cells.map((cell, index) => [cell.key, index])), [cells]);
  const positions = useMemo(() => new Map(cells.map((cell, index) => [`${cell.sectionIndex}:${cell.rowIndex}:${cell.columnIndex}`, index])), [cells]);
  const grade = useMemo(() => gradeScope(sections, entries, onlySet), [sections, entries, onlySet]);
  const settled = settledCounts(grade, entries);
  const filled = Object.keys(entries).length;
  const surrenderKeys = surrenderEntryKeys(entries);
  const graded = phase === "summary";

  // Each section gets only its own entries, reused while unchanged, so a keystroke re-renders one table.
  const slices = useRef(new Map<string, Record<string, string>>());
  const sectionValues = (id: ChartSectionId) => {
    const prefix = `${id}:`;
    const next = Object.fromEntries(Object.entries(entries).filter(([key]) => key.startsWith(prefix)));
    const previous = slices.current.get(id);
    if (previous && Object.keys(previous).length === Object.keys(next).length && Object.entries(next).every(([key, value]) => previous[key] === value)) return previous;
    slices.current.set(id, next);
    return next;
  };

  // The surrender table follows the table rules, unless answers were typed for the other table.
  useEffect(() => {
    if (surrenderKeys.length === 0 && table !== chartTableFor(settings.surrender)) setTable(chartTableFor(settings.surrender));
  }, [settings.surrender, surrenderKeys.length, table]);

  /* ---- Time spent filling in: only while the chart is open and the tab visible. ---- */
  const segment = useRef<number | null>(null);
  const fold = useCallback(() => {
    if (segment.current === null) return;
    const now = Date.now(), add = now - segment.current;
    segment.current = now;
    setActiveMs((current) => current + add);
  }, []);
  useEffect(() => {
    if (phase !== "play") return;
    const begin = () => { segment.current = document.visibilityState === "visible" ? Date.now() : null; };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") { fold(); segment.current = null; } else begin();
    };
    begin();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { document.removeEventListener("visibilitychange", onVisibility); fold(); segment.current = null; };
  }, [phase, fold]);
  const now = useNow(phase === "play");
  const elapsed = () => activeMs + (segment.current === null ? 0 : Math.max(0, Date.now() - segment.current));
  const shownMs = activeMs + (segment.current === null ? 0 : Math.max(0, now - segment.current));

  useWakeLock(phase === "play");
  // Answers deleted back to an empty chart leave nothing to resume.
  useEffect(() => {
    if (phase === "play" && filled === 0 && storage.progress(DRILL)) storage.clearProgress(DRILL);
  }, [phase, filled]);
  useDrillProgress(DRILL, phase === "play" && filled > 0, {
    entries, choice, feedback, startedAt, surrenderTable: table, activeMs, ...(only ? { only } : {}), ...(scope ? { scope } : {}),
  } satisfies H17Saved);

  /* ---- Resume and start ---- */
  const trackStart = () => analytics.track("practice_started", { drill: "h17_chart", mode: "all", question_target: 320 });
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    if (initial.phase === "play") trackStart();
  }, [initial.phase]);

  /* ---- Cell navigation and entry. Handlers read the latest state from a ref so each table's props stay stable. ---- */
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const live = useRef({ cells, entries, positions, sections, graded, focus });
  useEffect(() => { live.current = { cells, entries, positions, sections, graded, focus }; });

  const selectAt = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(live.current.cells.length - 1, index));
    setFocus(clamped);
    return clamped;
  }, []);
  const focusAt = useCallback((index: number) => {
    const clamped = selectAt(index);
    inputs.current[clamped]?.focus();
    inputs.current[clamped]?.select();
  }, [selectAt]);
  const focusRelative = useCallback((index: number, rowStep: number, columnStep: number) => {
    const { cells: list, positions: at, sections: shown } = live.current;
    const cell = list[index];
    if (!cell) return;
    const rows = shown[cell.sectionIndex].rows.length;
    let row = cell.rowIndex, column = cell.columnIndex;
    for (;;) {
      row += rowStep;
      column += columnStep;
      if (row < 0 || row >= rows || column < 0 || column >= CHART_DEALERS.length) return;
      const target = at.get(`${cell.sectionIndex}:${row}:${column}`);
      if (target !== undefined) { focusAt(target); return; }
    }
  }, [focusAt]);
  const apply = useCallback((index: number, fed: FeedResult, focusInput: boolean) => {
    const cell = live.current.cells[index];
    if (!cell || fed.disposition === "ignore") return;
    setEntries((current) => {
      const next = { ...current };
      if (fed.buffer) next[cell.key] = fed.buffer;
      else delete next[cell.key];
      return next;
    });
    fold();
    const move = focusInput ? focusAt : selectAt;
    if (fed.disposition === "commit") move(index + 1);
    if (fed.disposition === "back") move(index - 1);
    return cell;
  }, [focusAt, selectAt, fold]);

  const requestGrade = useRef<() => void>(() => undefined);
  const handleKey = useCallback((event: KeyboardEvent<HTMLInputElement>, index: number) => {
    const { cells: list, entries: current, graded: readOnly } = live.current;
    const cell = list[index];
    if (event.key === "Tab") {
      // Released at either end, so keyboard users can leave the chart.
      const target = index + (event.shiftKey ? -1 : 1);
      if (target < 0 || target >= list.length) return;
      event.preventDefault();
      focusAt(target);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      const button = gradeButton();
      if (button && !button.disabled) button.focus();
      else (event.currentTarget.closest("[data-drill-phase]")?.querySelector<HTMLElement>("h1"))?.focus();
      return;
    }
    const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[event.key]) {
      event.preventDefault();
      focusRelative(index, ...arrows[event.key]);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if ((event.ctrlKey || event.metaKey) && !readOnly) requestGrade.current();
      else focusAt(index + 1);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (readOnly || !cell) {
      if (event.key.length === 1 || event.key === "Backspace") event.preventDefault();
      return;
    }
    const fed = feedCell(cell.section, current[cell.key] ?? "", event.key, event.shiftKey);
    if (fed.disposition === "ignore") {
      // Swallow stray letters so the browser never types into the field itself.
      if (event.key.length === 1) event.preventDefault();
      return;
    }
    event.preventDefault();
    apply(index, fed, true);
  }, [apply, focusAt, focusRelative]);

  const pressKey = (key: KeypadKey) => {
    const cell = cells[focus];
    if (!cell || graded) return;
    const fed = feedCell(cell.section, entries[cell.key] ?? "", key.key, key.shift);
    apply(focus, fed, false);
    if (fed.disposition === "commit") {
      const next = cells[Math.min(cells.length - 1, focus + 1)];
      announce(`${cell.row} vs ${cell.dealer}: ${key.face}.${next && next !== cell ? ` Next: ${next.row} vs ${next.dealer}.` : ""}`);
    }
  };
  const register = useCallback((index: number, element: HTMLInputElement | null) => { inputs.current[index] = element; }, []);
  const onSelect = useCallback((index: number) => { setFocus(index); }, []);

  // Keep the selected cell on screen, clear of the header and the keypad.
  const previousFocus = useRef(focus);
  useEffect(() => {
    if (previousFocus.current === focus) return;
    previousFocus.current = focus;
    const cell = inputs.current[focus]?.closest("td");
    if (!cell) return;
    // The rail scrolls sideways to the cell; the page then clears the header and the keypad.
    const rail = cell.closest<HTMLElement>("[data-testid^='h17-rail-']");
    if (rail) {
      // Whole columns at a time, so the snap points agree; the right edge keeps clear of the fade.
      const sticky = 52, fade = 24, box = cell.getBoundingClientRect(), frame = rail.getBoundingClientRect(), step = box.width + 4;
      if (box.left < frame.left + sticky) rail.scrollBy({ left: -Math.ceil((frame.left + sticky - box.left) / step) * step });
      else if (box.right > frame.right - fade) rail.scrollBy({ left: Math.ceil((box.right - frame.right + fade) / step) * step });
    }
    requestAnimationFrame(() => reveal(cell));
  }, [focus]);

  /* ---- Grading ---- */
  const gradeNow = () => {
    setConfirmGrade(false);
    const duration = elapsed();
    const byKey = new Map(sections.map((section) => [section.id, section]));
    const mistakes: Mistake[] = grade.cells.filter((cell) => !cell.correct).map((cell) => ({
      question: `${cell.sectionLabel} · ${cell.row} vs ${cell.dealer}`,
      userAnswer: cell.answered ? cell.typed : "(skipped)",
      correctAnswer: cell.expected,
      explanation: explainToken(cell.section, chartToken(byKey.get(cell.section)!, cell.row, cell.dealer)),
    }));
    const session = makeSession(DRILL, grade.total, grade.correct, duration, grade.bestStreak, mistakes, grade.bySection, { scope: scope ?? pick, filled: grade.answered }, scope === "retry" ? ["retry"] : undefined);
    storage.addSession(session);
    storage.clearProgress(DRILL);
    analytics.track("practice_completed", {
      drill: "h17_chart",
      questions: grade.total,
      correct: grade.correct,
      accuracy: session.accuracy,
      best_streak: grade.bestStreak,
      duration_ms: duration,
      mode: choice,
      rules_preset: table === "early10" ? "6d_h17_das_es10" : "6d_h17_das_ls",
    });
    setResult(session);
    setResultMs(duration);
    setPhase("summary");
    setFocus(0);
    announce(`Chart graded: ${grade.correct} of ${grade.total}.`);
  };
  const askGrade = () => {
    if (phase !== "play" || grade.answered === 0) return;
    if (grade.skipped > 0) setConfirmGrade(true);
    else gradeNow();
  };
  useEffect(() => { requestGrade.current = askGrade; });

  const startPlay = (fresh: boolean, next: { only?: string[]; scope?: "index" | "retry" } = {}) => {
    if (fresh) {
      setStartedAt(Date.now());
      setActiveMs(0);
    }
    setOnly(next.only);
    setScope(next.scope);
    setResult(undefined);
    setFocus(0);
    setPhase("play");
    trackStart();
  };
  const scopeForPick = () => (pick === "index" ? { only: indexCellKeys(sectionsFor("all", table)), scope: "index" as const } : {});
  const start = () => startPlay(filled === 0, scopeForPick());
  const clearChart = () => {
    setConfirmClear(false);
    setEntries({});
    setStartedAt(Date.now());
    setActiveMs(0);
    if (segment.current !== null) segment.current = Date.now();
    storage.clearProgress(DRILL);
    selectAt(0);
  };
  const clearSurrender = () => {
    const removed = Object.fromEntries(surrenderKeys.map((key) => [key, entries[key]]));
    setEntries((current) => withoutKeys(current, surrenderKeys));
    toast({ message: `Cleared ${surrenderKeys.length} surrender ${surrenderKeys.length === 1 ? "answer" : "answers"}.`, tone: "info", action: { label: "Undo", onClick: () => setEntries((current) => ({ ...current, ...removed })) } });
  };

  // Starting with a keyboard, the first blank cell takes focus so typing starts at once; touch screens keep their scroll.
  const previousPhase = useRef(phase);
  useEffect(() => {
    const from = previousPhase.current;
    previousPhase.current = phase;
    if (phase !== "play" || from === "play" || !matchMedia("(pointer: fine)").matches) return;
    const firstBlank = cells.findIndex((cell) => !entries[cell.key]);
    focusAt(firstBlank < 0 ? 0 : firstBlank);
    // Only on entering play; the cell list is current at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const header = { eyebrow: "Chart recall", title: "H17 Chart" };
  const mismatch = surrenderKeys.length > 0 && table !== chartTableFor(settings.surrender);
  const mismatchNotice = mismatch && (
    <Callout tone="warn" title={`Your surrender answers are for the ${CHART_SURRENDER_LABEL[table].toLowerCase()} table`} action={<GhostButton size="compact" onClick={clearSurrender}>Clear surrender answers</GhostButton>}>
      Your table rules now say {settings.surrender === "early" ? "early surrender vs 10" : settings.surrender === "late" ? "late surrender" : "no surrender"}. The chart keeps the table you started with until you clear those answers.
    </Callout>
  );
  const sourceNote = (
    <p className="mt-5 text-xs leading-5 text-[var(--ink-muted)]">
      Chart source: Blackjack Apprenticeship, H17 Deviation Chart (2018), with one house addition: soft 20 doubles versus 4, 5 and 6 at +6, +5 and +4, the counts where doubling overtakes standing. Insurance or even money: take at true count +3 or above.
      {table === "early10" && " Under early surrender the ten column of the surrender table is Stanford Wong, Professional Blackjack, table 32; the 8, 9 and ace columns stay as the printed chart has them, since the two rules only differ where the dealer can hold a natural."}
    </p>
  );
  const clearModal = (
    <ConfirmModal open={confirmClear} tone="danger" title="Clear your answers?" description={`This clears all ${filled} ${filled === 1 ? "answer" : "answers"} and restarts the timer.`} confirmLabel="Clear and restart" cancelLabel="Cancel" onCancel={() => setConfirmClear(false)} onConfirm={clearChart} />
  );

  if (phase === "summary" && result) {
    const wrongKeys = grade.cells.filter((cell) => !cell.correct).map((cell) => cell.key);
    const rowsWithMistakes = new Set(grade.cells.filter((cell) => !cell.correct).map((cell) => `${cell.section}:${cell.row}`));
    const selected = cells[focus];
    const selectedGrade = selected && grade.cells.find((cell) => cell.key === selected.key);
    return (
      <div className="mx-auto max-w-[90rem]">
        <DrillSummary
          session={result}
          eyebrow="Chart graded"
          title={`H17 Chart: ${result.correct} of ${result.questions}`}
          newLabel="Start a new chart"
          onNew={() => { setEntries({}); startPlay(true, scope === "index" ? scopeForPick() : {}); }}
          onRetry={() => { setEntries({}); startPlay(true, { only: wrongKeys, scope: "retry" }); }}
          retryLabel={`Retry wrong cells (${wrongKeys.length})`}
          onChangeSetup={() => { setEntries({}); setOnly(undefined); setScope(undefined); setResult(undefined); setPhase("setup"); }}
          tiles={[
            { label: "Accuracy", value: `${result.accuracy}%`, tone: result.accuracy >= 85 ? "good" : result.accuracy >= 70 ? "neutral" : "bad" },
            { label: "Wrong", value: grade.wrong, tone: grade.wrong ? "bad" : "neutral" },
            { label: "Blank", value: grade.skipped },
            { label: "Best run", value: grade.bestStreak, sub: "right in a row" },
            { label: "Time", value: clockText(resultMs) },
          ]}
          breakdown={{ title: "By section", rows: Object.entries(grade.bySection).map(([label, value]) => ({ label, ...value })) }}
          detail={
            <Panel>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Your chart</h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">Wrong cells are struck through with the chart&apos;s answer underneath. Blank cells have a dashed red edge. Select a cell to read what the chart means.</p>
                </div>
                <Switch label="Only rows with mistakes" checked={mistakeRows} onChange={setMistakeRows} className="w-56" />
              </div>
              <div className="space-y-4">
                {sections.map((section) => {
                  const rows = mistakeRows ? section.rows.filter((row) => rowsWithMistakes.has(`${section.id}:${row}`)) : undefined;
                  if (rows && rows.length === 0) return null;
                  return (
                    <ChartSection
                      key={section.id}
                      section={section}
                      values={sectionValues(section.id)}
                      indexOf={indexOf}
                      selectedKey={selected?.key}
                      mode="graded"
                      keypad={keypad}
                      rows={rows}
                      filled={grade.bySection[section.label]?.correct ?? 0}
                      total={grade.bySection[section.label]?.total ?? 0}
                      onKeyDown={handleKey}
                      onSelect={onSelect}
                      register={register}
                      footer={selected?.section === section.id && selectedGrade && (
                        <p className="mt-3 rounded-lg bg-overlay/[.05] px-3 py-2 text-sm leading-6 text-[var(--ink)]" aria-live="off">
                          <b>{selected.row} vs {selected.dealer}:</b>{" "}
                          {selectedGrade.correct ? "right." : selectedGrade.answered ? <>you wrote <span className="font-data">{selectedGrade.typed}</span>; the chart prints <span className="font-data">{selectedGrade.expected}</span>.</> : <>left blank; the chart prints <span className="font-data">{selectedGrade.expected}</span>.</>}{" "}
                          <span className="text-[var(--ink-muted)]">{explainToken(section.id, chartToken(section, selected.row, selected.dealer))}</span>
                        </p>
                      )}
                    />
                  );
                })}
              </div>
              {sourceNote}
            </Panel>
          }
        />
        <div className="mx-auto mt-5 flex max-w-3xl flex-wrap items-center justify-between gap-3 text-sm text-[var(--ink-muted)]">
          <PracticeLines drill={DRILL} sessions={sessions} unit={{ one: "chart", many: "charts" }} showLast={false} />
          <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-[var(--accent)] underline-offset-2 hover:underline"><i className="fa-solid fa-house text-xs" aria-hidden="true" />Dashboard</Link>
        </div>
      </div>
    );
  }

  if (phase === "play") {
    const selected = cells[focus];
    const answeredLabel = `${grade.answered} of ${grade.total} filled`;
    const jump = (id: ChartSectionId) => {
      const index = cells.findIndex((cell) => cell.section === id && !entries[cell.key]);
      focusAt(index >= 0 ? index : cells.findIndex((cell) => cell.section === id));
    };
    const mode: CellMode = feedback;
    return (
      <DrillFrame eyebrow={wide ? header.eyebrow : ""} title={header.title} phase="play" width="wide" actions={<ReferenceLink {...REFERENCE} className="hidden sm:inline-flex" />}>
        <DrillHud
          progress={{ done: grade.answered, total: grade.total, label: `${scope === "retry" ? "Retry: " : scope === "index" ? "Index cells: " : ""}${answeredLabel}` }}
          stats={[
            ...(feedback === "live" ? [
              { id: "right", label: "Right", value: settled.right, tone: "good" as const },
              { id: "wrong", label: "Wrong", value: settled.wrong, tone: settled.wrong ? "bad" as const : "neutral" as const },
            ] : []),
            { id: "time", label: "Time", value: <><span aria-hidden="true">{clockText(shownMs)}</span><span className="sr-only">{spokenDuration(shownMs)}</span></>, phone: true },
          ]}
          chip={(
            <>
              <GhostButton size="compact" className="hidden md:inline-flex" onClick={() => setConfirmClear(true)} disabled={filled === 0}>Clear chart</GhostButton>
              <GhostButton size="compact" className="hidden md:inline-flex" onClick={() => setPhase("setup")}>Change setup</GhostButton>
              <Button data-grade-chart="" size="compact" onClick={askGrade} disabled={grade.answered === 0} aria-describedby={hintId} className="inline-flex items-center gap-2">
                <span>Grade<span className="hidden sm:inline"> chart</span></span>
                <span aria-hidden="true" className="hidden lg:[@media(pointer:fine)]:inline"><KeyHint>{mac ? "⌘ ↵" : "Ctrl ↵"}</KeyHint></span>
              </Button>
              <span id={hintId} className="sr-only">{grade.answered === 0 ? "Fill in at least one cell first." : `${grade.skipped} cells still blank.`}</span>
            </>
          )}
        />
        {choice === "all" && (
          <nav aria-label="Jump to a table" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs font-medium text-[var(--ink-muted)]">Jump to</span>
            {sections.map((section) => (
              <GhostButton key={section.id} size="compact" onMouseDown={(event) => event.preventDefault()} onClick={() => jump(section.id)}>
                {section.id === "pairs" ? "Pairs" : section.id === "soft" ? "Soft" : section.id === "hard" ? "Hard" : "Surrender"}
              </GhostButton>
            ))}
          </nav>
        )}
        {mismatchNotice && <div className="mb-4">{mismatchNotice}</div>}
        <div className="space-y-5">
          {sections.map((section) => {
            const keys = cellKeysOf([section]).filter((key) => !onlySet || onlySet.has(key));
            if (keys.length === 0) return null;
            return (
              <ChartSection
                key={section.id}
                section={section}
                values={sectionValues(section.id)}
                indexOf={indexOf}
                selectedKey={selected?.key}
                mode={mode}
                keypad={keypad}
                filled={keys.filter((key) => entries[key]).length}
                total={keys.length}
                header={!keypad && selected?.section === section.id ? <SectionKeys section={section.id} /> : undefined}
                onKeyDown={handleKey}
                onSelect={onSelect}
                register={register}
              />
            );
          })}
        </div>
        {sourceNote}
        <div className="mt-5 flex flex-wrap gap-2 md:hidden">
          <GhostButton onClick={() => setConfirmClear(true)} disabled={filled === 0}>Clear chart</GhostButton>
          <GhostButton onClick={() => setPhase("setup")}>Change setup</GhostButton>
        </div>
        {keypad && selected && (
          <ChartKeypad
            section={selected.section}
            caption={`${selected.row} vs ${selected.dealer} · ${sections[selected.sectionIndex].label}`}
            onKey={pressKey}
            onNext={() => selectAt(focus + 1)}
          />
        )}
        {clearModal}
        <ConfirmModal
          open={confirmGrade}
          title="Grade with blank cells?"
          description={`${grade.skipped} of ${grade.total} cells are still blank. Blank cells count as wrong, so this chart would score at most ${Math.round(((grade.total - grade.skipped) / grade.total) * 100)}%, and it counts as a chart attempt.`}
          confirmLabel="Grade anyway"
          cancelLabel="Keep filling"
          onCancel={() => setConfirmGrade(false)}
          onConfirm={gradeNow}
        />
      </DrillFrame>
    );
  }

  return (
    <DrillFrame {...header} description={DESCRIPTION} phase="setup" actions={<ReferenceLink {...REFERENCE} />}>
      <ChartSetup
        settings={settings}
        table={table}
        pick={pick}
        onPick={(next) => { setPick(next); setFocus(0); }}
        feedback={feedback}
        onFeedback={setFeedback}
        filled={filled}
        surrenderLocked={surrenderKeys.length > 0}
        onClearSurrender={clearSurrender}
        notices={mismatchNotice || undefined}
        firstTime={!sessions.some((session) => session.drill === DRILL)}
        onStart={start}
        onClear={() => setConfirmClear(true)}
        footnote={<PracticeLines drill={DRILL} sessions={sessions} unit={{ one: "chart", many: "charts" }} />}
      />
      {clearModal}
    </DrillFrame>
  );
}
