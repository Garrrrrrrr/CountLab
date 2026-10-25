"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Settings2, Target } from "lucide-react";
import { Badge, Button, Card, ConfirmSheet, cx, Kbd, Segmented, Sheet, announce } from "@/components/ui";
import { DrillSetup, DrillSummary, formatClock, PlayDock, PlayFrame, PresetPicker, ResumeBanner, SetupGroup } from "@/components/drill/DrillKit";
import { track } from "@/lib/analytics/track";
import { useSessions } from "@/lib/hooks/useSessions";
import { useSettings } from "@/lib/hooks/useSettings";
import { relativeTime } from "@/lib/statistics/drillRound";
import { makeSession, storage, type Session } from "@/lib/statistics/storage";
import { useDrillProgress } from "@/lib/statistics/useDrillProgress";
import { DEFAULT_TABLE_RULES, rulesFromSettings, rulesSummary, signedCount, type TableRules } from "@/lib/strategy";
import {
  availableTables, BASE_NAME, bestRunAcross, cellMistake, cleanEntries, coreIndexIds, explainCell, filledIn, formatEntry, gradeTable, isFilled, recallLevelOf, withIndices, recallTables,
  RECALL_TABLE_IDS, TABLE_TITLE, type CellEntry, type CellGrade, type Deviation, type RecallLevel, type RecallTable, type RecallTableId, type TableGrade,
} from "@/lib/strategy-drills/chartRecall";
import { RecentRounds, ReplaceRoundSheet, ReviewDue, startedRules } from "../strategy-shared/parts";
import { recordAnswer } from "@/lib/statistics/spacedRepetition";
import { chartReviewDue, chartReviewKey, chartReviewLevel, chartReviewScope } from "@/lib/strategy-drills/review";
import { RulesBar } from "../strategy-shared/RulesBar";
import { useSetupPref } from "../strategy-shared/useSetupPref";
import { RecallGrid, type GridView } from "./RecallGrid";
import { CustomIndices } from "./CustomIndices";
import { BaseKeypad, IndexPad } from "./RecallKeypad";
import { useActiveClock } from "./useActiveClock";

/** The history name the chart drill has always saved under, so old charts still count. */
const DRILL = "H17 Chart" as const;
const MAX_MISTAKES = 40;

type Scope = "all" | RecallTableId;
/** `picked` holds the custom level's indices by `indexList` id; absent until the reader picks. */
type Pref = { level: RecallLevel; scope: Scope; picked?: string[] };
const stringList = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined);
const cleanPref = (raw: Partial<Pref>): Pref => ({
  level: recallLevelOf(raw.level),
  scope: raw.scope === "all" || RECALL_TABLE_IDS.includes(raw.scope as RecallTableId) ? (raw.scope as Scope) : "all",
  picked: stringList(raw.picked),
});

/** One chart attempt: fixed when it starts, so a rules change elsewhere never re-grades it. */
/** `only` narrows a retry or a review chart to some cells; a review chart's answers update the schedule, a retry's do not. */
interface Game { rules: TableRules; level: RecallLevel; ids: RecallTableId[]; only?: string[]; review?: boolean; picked?: string[] }
type Phase = "setup" | "fill" | "review" | "summary";

interface RecallSaved extends Game { v: 2; index: number; phase: "fill" | "review"; entries: Record<string, CellEntry>; graded: RecallTableId[]; activeMs: number }

function readSaved(raw: unknown): RecallSaved | undefined {
  const state = raw as Partial<RecallSaved> | null;
  if (!state || state.v !== 2 || !state.rules || typeof state.rules.decks !== "number") return undefined;
  const rules = { ...DEFAULT_TABLE_RULES, ...state.rules };
  const allowed = availableTables(rules);
  const ids = Array.isArray(state.ids) ? state.ids.filter((id) => allowed.includes(id)) : [];
  if (!ids.length) return undefined;
  const entries = cleanEntries(state.entries);
  const graded = Array.isArray(state.graded) ? state.graded.filter((id) => ids.includes(id)) : [];
  if (!Object.keys(entries).length && !graded.length) return undefined;
  const index = Math.min(ids.length - 1, Math.max(0, Number.isInteger(state.index) ? state.index! : 0));
  const only = Array.isArray(state.only) ? state.only.filter((key): key is string => typeof key === "string") : undefined;
  const level = recallLevelOf(state.level);
  return { v: 2, rules, level, picked: level === "custom" ? stringList(state.picked) ?? [] : undefined, ids, only: only?.length ? only : undefined, review: state.review === true || undefined, index, phase: state.phase === "review" && graded.includes(ids[index]) ? "review" : "fill", entries, graded, activeMs: typeof state.activeMs === "number" && state.activeMs >= 0 ? state.activeMs : 0 };
}

/** The tables as asked: a retry chart narrows each table to the cells that were wrong. */
function scopedTables(game: Game): RecallTable[] {
  const tables = recallTables(game.rules, game.level, game.ids, game.picked);
  if (!game.only) return tables;
  const only = new Set(game.only);
  return tables.map((table) => ({ ...table, cells: table.cells.filter((cell) => only.has(cell.key)) })).filter((table) => table.cells.length > 0);
}

const LEVELS = [
  { value: "basic" as const, title: "Basic strategy", detail: "Hit, stand, double or split in every cell, and which hands to surrender." },
  { value: "indices" as const, title: "All indices", detail: "Also every index Wong prints for your rules: the play the count switches to and the number." },
  { value: "core" as const, title: "I18 + Fab 4", detail: "Basic strategy, plus the indices to learn first: the Illustrious 18 and the Fab 4 surrenders." },
  { value: "custom" as const, title: "Custom", detail: "Basic strategy, plus only the indices you pick." },
];
const cellCount = (count: number) => `${count} ${count === 1 ? "cell" : "cells"}`;
/** The level in a few words, for summaries and the resume banner. */
const LEVEL_WORDS: Record<RecallLevel, string> = { basic: "basic plays", indices: "all indices", core: "I18 + Fab 4", custom: "custom indices" };

export function ChartRecallDrill() {
  const { settings, update } = useSettings();
  const sessions = useSessions(DRILL);
  const [pref, remember] = useSetupPref<Pref>("chart-recall", { level: "basic", scope: "all" }, cleanPref);
  const reviewLevel = pref.level === "basic" ? "basic" : "indices";
  const [saved, setSaved] = useState(() => {
    const progress = storage.progress(DRILL);
    const state = readSaved(progress?.state);
    return state && progress ? { state, updatedAt: progress.updatedAt } : undefined;
  });
  const [phase, setPhase] = useState<Phase>("setup");
  const [game, setGame] = useState<Game>();
  const [index, setIndex] = useState(0);
  const [entries, setEntries] = useState<Record<string, CellEntry>>({});
  const [graded, setGraded] = useState<RecallTableId[]>([]);
  const [selected, setSelected] = useState<string>();
  const [indexMode, setIndexMode] = useState(false);
  /** What the index pad opens with when a count was typed straight into a cell. */
  const [indexStart, setIndexStart] = useState<string>();
  /** A "-" (or "d" in the surrender table) just typed, which a digit right after turns into a negative count. */
  const minus = useRef<{ key: string; time: number } | null>(null);
  const [view, setView] = useState<GridView>("chart");
  const [session, setSession] = useState<Session>();
  const [confirmGrade, setConfirmGrade] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const clock = useActiveClock(phase === "fill");

  const tables = useMemo(() => (game ? scopedTables(game) : []), [game]);
  const table = tables[index];
  const level = game?.level ?? "basic";
  const gradeOf = useCallback((target: RecallTable) => gradeTable(target, entries, level), [entries, level]);
  const currentGrade = useMemo(() => (table && graded.includes(table.id) ? gradeOf(table) : undefined), [table, graded, gradeOf]);
  const gradeMap = useMemo(() => (currentGrade ? new Map(currentGrade.cells.map((cell) => [cell.cell.key, cell])) : undefined), [currentGrade]);
  const cell = table?.cells.find((item) => item.key === selected) ?? table?.cells[0];
  const filled = table ? filledIn(table, entries) : 0;

  const playing = phase === "fill" || phase === "review";
  const progress = useDrillProgress(DRILL, playing && Boolean(game) && (Object.keys(entries).length > 0 || graded.length > 0), game ? {
    v: 2, ...game, index, phase: phase === "review" ? "review" : "fill", entries, graded, activeMs: Math.floor(clock.ms / 5000) * 5000,
  } satisfies RecallSaved : {}, { throttleMs: 3000 });

  /* ---- Moving between cells ---- */
  const select = useCallback((key: string | undefined) => { setSelected(key); setIndexMode(false); }, []);
  const move = (step: number) => {
    if (!table || !cell) return;
    const at = table.cells.indexOf(cell);
    const next = table.cells[Math.max(0, Math.min(table.cells.length - 1, at + step))];
    select(next.key);
  };
  const moveRow = (step: number) => {
    if (!table || !cell) return;
    const rows = table.rows.map((row) => row.cells.filter((item) => table.cells.includes(item))).filter((row) => row.length);
    const rowIndex = rows.findIndex((row) => row.includes(cell));
    const target = rows[rowIndex + step];
    if (!target) return;
    const column = cell.ref.dealer;
    select((target.find((item) => item.ref.dealer === column) ?? target[0]).key);
  };
  // Keyboard focus follows the selection when it is already on the grid; the selected cell always scrolls clear of the keypad.
  useEffect(() => {
    if (!selected) return;
    const node = document.querySelector<HTMLElement>(`[data-cell="${CSS.escape(selected)}"]`);
    if (!node) return;
    if (document.activeElement?.hasAttribute("data-cell")) node.focus({ preventScroll: true });
    node.scrollIntoView({ block: "nearest" });
  }, [selected, phase, indexMode]);

  /* ---- Entering answers ---- */
  const setBase = (token: string) => {
    if (!cell || phase !== "fill") return;
    setEntries((current) => ({ ...current, [cell.key]: { ...current[cell.key], base: token } }));
    const at = table!.cells.indexOf(cell);
    const next = table!.cells[at + 1];
    announce(`${cell.short}: ${BASE_NAME[token]}.${next ? "" : " Last cell of this table."}`);
    if (next) select(next.key);
  };
  const setDev = (dev: Deviation | undefined) => {
    if (!cell) return;
    setEntries((current) => {
      const entry = { ...current[cell.key], dev };
      const copy = { ...current };
      if (!entry.base && !entry.dev) delete copy[cell.key];
      else copy[cell.key] = entry;
      return copy;
    });
    setIndexMode(false);
    announce(dev ? `${cell.short}: index saved.` : `${cell.short}: no index.`);
  };
  /** A bare count in the surrender table: surrender at that count or higher. */
  const setCount = (key: string, at: number, advance: boolean) => {
    const target = table!.cells.find((item) => item.key === key)!;
    setEntries((current) => ({ ...current, [key]: { dev: { play: "R", at } } }));
    const next = table!.cells[table!.cells.indexOf(target) + 1];
    announce(`${target.short}: surrender at ${signedCount(at)} or higher.${next ? "" : " Last cell of this table."}`);
    if (advance && next) select(next.key);
  };
  const openIndex = (start?: string) => { setIndexStart(start); setIndexMode(true); };
  const clearCell = () => {
    if (!cell) return;
    setEntries((current) => { const copy = { ...current }; delete copy[cell.key]; return copy; });
  };

  useEffect(() => {
    if (!playing || indexMode || !table || !cell || leaving || confirmGrade) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      const arrows: Record<string, () => void> = { ArrowRight: () => move(1), ArrowLeft: () => move(-1), ArrowDown: () => moveRow(1), ArrowUp: () => moveRow(-1) };
      if (arrows[event.key]) { event.preventDefault(); arrows[event.key](); return; }
      if (phase !== "fill") return;
      const key = event.key.toLowerCase();
      if (event.key === "Backspace" || event.key === "Delete") { event.preventDefault(); clearCell(); return; }
      if (event.key === "Enter" && target?.hasAttribute("data-cell")) { event.preventDefault(); move(1); return; }
      if (key === "i" && withIndices(level)) { event.preventDefault(); openIndex(); return; }
      // Counts typed straight into a cell. In the surrender table "5" is surrender at +5 or higher and
      // "-5" or "d5" at −5; "-" alone still means no surrender, so a digit right after it rewrites that cell.
      const surrender = table.id === "surrender";
      const pending = minus.current && Date.now() - minus.current.time < 1500 ? minus.current : null;
      minus.current = null;
      if (withIndices(level) && /^[0-9]$/.test(key)) {
        event.preventDefault();
        const at = pending && key !== "0" ? -Number(key) : Number(key);
        if (surrender) setCount(pending?.key ?? cell.key, at, !pending || pending.key === cell.key);
        else openIndex(String(at));
        return;
      }
      if (withIndices(level) && key === "+") { event.preventDefault(); return; }
      if (withIndices(level) && surrender && (key === "-" || key === "d")) minus.current = { key: cell.key, time: Date.now() };
      if (withIndices(level) && surrender && key === "d") { event.preventDefault(); return; }
      if (withIndices(level) && !surrender && key === "-") { event.preventDefault(); openIndex("-"); return; }
      const token = key === "d" && event.shiftKey ? "Ds" : key === "n" || key === "-" ? "-" : ({ h: "H", s: "S", d: "D", p: "P", r: "R" } as Record<string, string>)[key];
      if (token && table.baseKeys.includes(token)) { event.preventDefault(); setBase(token); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---- The keypad's height, so a selected cell scrolls clear of it ---- */
  const dock = useRef<HTMLDivElement>(null);
  const [dockSpace, setDockSpace] = useState(220);
  useLayoutEffect(() => {
    const node = dock.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setDockSpace(node.getBoundingClientRect().height));
    observer.observe(node);
    return () => observer.disconnect();
  }, [phase, game]);

  /* ---- Starting, grading, finishing ---- */
  const begin = (next: Game, state?: RecallSaved) => {
    const list = scopedTables(next);
    if (!list.length) return;
    setGame(next);
    setSession(undefined);
    setEntries(state?.entries ?? {});
    setGraded(state?.graded ?? []);
    // A retry chart drops tables with nothing left to ask, so a saved position is clamped to what remains.
    const at = Math.min(state?.index ?? 0, list.length - 1);
    setIndex(at);
    clock.set(state?.activeMs ?? 0);
    setView("chart");
    setPhase(state?.phase === "review" && state.graded.includes(list[at].id) ? "review" : "fill");
    const firstBlank = list[at].cells.find((item) => !isFilled(state?.entries[item.key])) ?? list[at].cells[0];
    select(firstBlank.key);
    track("drill_started", { drill: DRILL, mode: next.level, questionTarget: list.reduce((sum, item) => sum + item.cells.length, 0), ...startedRules(next.rules) });
  };
  // Starting over discards a saved chart, so ask first; `replacing` is the start waiting on the answer.
  const [replacing, setReplacing] = useState<(() => void) | null>(null);
  const startFresh = () => (saved ? setReplacing(() => beginFresh) : beginFresh());
  const beginFresh = (review?: { ids: RecallTableId[]; only: string[] }) => {
    setReplacing(null);
    const rules = rulesFromSettings(settings);
    const allowed = availableTables(rules);
    const ids = pref.scope === "all" || !allowed.includes(pref.scope) ? allowed : [pref.scope];
    storage.clearProgress(DRILL);
    setSaved(undefined);
    // Reviews run on the two schedules the answers file under (see chartReviewLevel).
    begin(review ? { rules, level: reviewLevel, ...review, review: true } : { rules, level: pref.level, ids, picked: pref.level === "custom" ? pref.picked ?? coreIndexIds(rules) : undefined });
  };
  const startReview = (scope: { ids: RecallTableId[]; only: string[] }) => (saved ? setReplacing(() => () => beginFresh(scope)) : beginFresh(scope));

  const gradeNow = () => {
    if (!table) return;
    setConfirmGrade(false);
    setIndexMode(false);
    setGraded((current) => (current.includes(table.id) ? current : [...current, table.id]));
    setPhase("review");
    setView("chart");
    const result = gradeOf(table);
    if (game && (!game.only || game.review)) for (const cell of result.cells) recordAnswer(DRILL, chartReviewKey(chartReviewLevel(game.level, Boolean(cell.cell.expected.dev)), cell.cell.key), cell.ok);
    const firstMiss = result.cells.find((item) => !item.ok);
    setSelected(firstMiss?.cell.key);
    announce(`${table.title} graded: ${result.correct} of ${result.total} right${result.blank ? `, ${result.blank} blank` : ""}.`);
  };
  const requestGrade = () => {
    if (!table) return;
    if (filledIn(table, entries) < table.cells.length) setConfirmGrade(true);
    else gradeNow();
  };

  const finish = () => {
    if (!game) return;
    const done = tables.filter((item) => graded.includes(item.id));
    if (!done.length) { setPhase("setup"); return; }
    const results = done.map((item) => ({ table: item, grade: gradeOf(item) }));
    const total = results.reduce((sum, item) => sum + item.grade.total, 0);
    const correct = results.reduce((sum, item) => sum + item.grade.correct, 0);
    const blank = results.reduce((sum, item) => sum + item.grade.blank, 0);
    const mistakes = results.flatMap(({ table: item, grade }) => grade.cells.filter((entry) => !entry.ok).map((entry) => cellMistake(game.rules, entry, item))).slice(0, MAX_MISTAKES);
    const categories = Object.fromEntries(results.map(({ grade }) => [grade.title, { correct: grade.correct, total: grade.total }]));
    const ms = clock.read();
    const made = makeSession(DRILL, total, correct, ms, bestRunAcross(results.map((item) => item.grade)), mistakes, categories,
      { level: game.level, tables: done.map((item) => item.id).join(" "), blank, elapsedSeconds: Math.round(ms / 1000), chartRules: rulesSummary(game.rules) }, game.review ? ["review"] : game.only ? ["retry"] : undefined);
    storage.addSession(made);
    progress.cancel();
    storage.clearProgress(DRILL);
    setSession(made);
    setSaved(undefined);
    setPhase("summary");
  };
  const nextTable = () => {
    if (index + 1 < tables.length) {
      const next = tables[index + 1];
      setIndex(index + 1);
      setPhase("fill");
      select((next.cells.find((item) => !isFilled(entries[item.key])) ?? next.cells[0]).key);
    } else finish();
  };
  const leaveForNow = () => {
    progress.flush();
    setLeaving(false);
    setPhase("setup");
    const stored = storage.progress(DRILL);
    const state = readSaved(stored?.state);
    setSaved(state && stored ? { state, updatedAt: stored.updatedAt } : undefined);
  };
  const exit = () => {
    if (!Object.keys(entries).length && !graded.length) { setPhase("setup"); return; }
    setLeaving(true);
  };

  /* ---- Screens ---- */
  if (playing && game && table && cell) {
    const surrender = table.id === "surrender";
    const reviewCell = gradeMap?.get(cell.key);
    return (
      <PlayFrame title="Chart Recall" onExit={exit} clock={clock.ms}>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow truncate">{tables.length > 1 && `Table ${index + 1} of ${tables.length} · `}<span className="tnum normal-case tracking-normal">{rulesSummary(game.rules)}</span></p>
            <h2 className="mt-0.5 text-xl font-semibold">{table.title}{game.only && <span className="ml-2 align-middle"><Badge tone="info">{game.review ? "Review" : "Retry"}</Badge></span>}</h2>
          </div>
          {phase === "fill" ? (
            <Button variant="secondary" onClick={requestGrade} disabled={filled === 0}>Grade</Button>
          ) : (
            <Segmented label="Show" hideLabel className="w-36 shrink-0" value={view} onChange={setView} options={[{ value: "chart", label: "Chart" }, { value: "mine", label: "Mine" }]} />
          )}
        </div>
        {phase === "fill" && tables.length > 1 && (
          <ol className="mb-3 flex gap-1" aria-label="Tables">
            {tables.map((item, position) => (
              <li key={item.id} className={cx("h-1 flex-1 rounded-full", position < index || graded.includes(item.id) ? "bg-pos" : position === index ? "bg-brand" : "bg-surface-3")}>
                <span className="sr-only">{item.title}{graded.includes(item.id) ? ", graded" : position === index ? ", current" : ""}</span>
              </li>
            ))}
          </ol>
        )}
        <RecallGrid table={table} entries={entries} selected={cell.key} onSelect={select} grades={gradeMap} view={view} dockSpace={dockSpace} />
        {phase === "fill" && (
          <p className="mt-3 hidden text-center text-xs text-ink-3 [@media(hover:hover)]:block">
            Keys: {table.baseKeys.map((token) => <span key={token} className="mr-1.5 inline-flex items-center gap-1"><Kbd>{token === "Ds" ? "⇧D" : token === "-" ? "N" : token}</Kbd>{BASE_NAME[token].split(",")[0].toLowerCase()}</span>)}
            {withIndices(level) && <span className="mr-1.5 inline-flex items-center gap-1"><Kbd>I</Kbd>index</span>}
            {withIndices(level) && (table.id === "surrender"
              ? <span className="mr-1.5 inline-flex items-center gap-1"><Kbd>5</Kbd><Kbd>-5</Kbd><Kbd>D5</Kbd>surrender at a count</span>
              : <span className="mr-1.5 inline-flex items-center gap-1"><Kbd>0–9</Kbd><Kbd>-</Kbd>index count</span>)}
            {" "}<Kbd>←</Kbd><Kbd>→</Kbd> move · <Kbd>⌫</Kbd> clear
          </p>
        )}
        <PlayDock>
          <div ref={dock}>
            {phase === "review" && currentGrade ? (
              <ReviewDock grade={currentGrade} cell={reviewCell} rules={game.rules} last={index + 1 >= tables.length} nextTitle={tables[index + 1]?.title} onNext={nextTable} />
            ) : indexMode ? (
              <IndexPad key={cell.key} cell={cell} surrender={surrender} initial={entries[cell.key]?.dev} start={indexStart} onSave={setDev} onCancel={() => setIndexMode(false)} />
            ) : (
              <>
                {filled === table.cells.length && (
                  <Button block className="mb-2" onClick={gradeNow} trailing={<ChevronRight size={18} aria-hidden />}>Grade {table.title.toLowerCase()}</Button>
                )}
                <BaseKeypad table={table} cell={cell} entry={entries[cell.key]} level={level} filled={filled} total={table.cells.length}
                  onBase={setBase} onClear={clearCell} onMove={move} onIndex={() => openIndex()} />
              </>
            )}
          </div>
        </PlayDock>
        <ConfirmSheet open={confirmGrade} onClose={() => setConfirmGrade(false)} onConfirm={gradeNow} title="Grade with blank cells?" confirmLabel="Grade now" tone="primary">
          {table.cells.length - filled} of {table.cells.length} cells are still blank. Blank cells count as wrong.
        </ConfirmSheet>
        <Sheet open={leaving} onClose={() => setLeaving(false)} title="Leave the chart?" size="sm"
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setLeaving(false)}>Keep going</Button>
              <Button variant="secondary" onClick={leaveForNow}>Leave for now</Button>
              {graded.length > 0 && <Button onClick={() => { setLeaving(false); finish(); }}>Finish and save</Button>}
            </div>
          }>
          <p className="text-[0.9375rem] leading-6 text-ink-2">
            Your answers stay saved on this device; continue any time from the Chart Recall page.
            {graded.length > 0 && ` Finish and save records the ${graded.length === 1 ? "graded table" : `${graded.length} graded tables`} in your history now.`}
          </p>
        </Sheet>
      </PlayFrame>
    );
  }

  if (phase === "summary" && session && game) {
    const results = tables.filter((item) => graded.includes(item.id)).map((item) => ({ table: item, grade: gradeOf(item) }));
    const wrongKeys = results.flatMap(({ grade }) => grade.cells.filter((entry) => !entry.ok).map((entry) => entry.cell.key));
    const blank = results.reduce((sum, item) => sum + item.grade.blank, 0);
    return (
      <DrillSummary
        title={game.review ? "Chart Recall: review done" : game.only ? "Chart Recall: retry done" : "Chart Recall"}
        score={session.accuracy}
        scoreLabel="Cells right"
        scoreSub={<><span className="tnum font-semibold text-ink">{session.correct} of {session.questions}</span> cells · {LEVEL_WORDS[game.level]} · {rulesSummary(game.rules)}</>}
        stats={[
          { label: "Time", value: formatClock(clock.read()) },
          { label: "Wrong", value: session.questions - session.correct - blank },
          { label: "Blank", value: blank },
          { label: "Best run", value: session.bestStreak },
        ]}
        // The graded grids below show every miss; the list reads the first few with their reasons.
        mistakes={session.mistakes.slice(0, 10)}
        exportMistakes={session.mistakes}
        onAgain={() => begin({ rules: game.rules, level: game.level, ids: game.ids, picked: game.picked })}
        againLabel="New chart"
        next={{ href: "/charts", label: "Open the chart" }}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          {wrongKeys.length > 0 && <Button variant="secondary" icon={<Target size={18} aria-hidden />} onClick={() => begin({ rules: game.rules, level: game.level, ids: game.ids, picked: game.picked, only: wrongKeys })}>Retry {wrongKeys.length} wrong {wrongKeys.length === 1 ? "cell" : "cells"}</Button>}
          <Button variant="secondary" icon={<Settings2 size={18} aria-hidden />} onClick={() => setPhase("setup")}>Change setup</Button>
        </div>
        {results.map(({ table: item, grade }) => <GradedTableCard key={item.id} table={item} grade={grade} entries={entries} rules={game.rules} />)}
      </DrillSummary>
    );
  }

  const rules = rulesFromSettings(settings);
  const allowed = availableTables(rules);
  const scope: Scope = pref.scope === "all" || allowed.includes(pref.scope) ? pref.scope : "all";
  const picked = pref.picked ?? coreIndexIds(rules);
  const count = recallTables(rules, pref.level, scope === "all" ? allowed : [scope], picked).reduce((sum, item) => sum + item.cells.length, 0);
  const reviewScope = chartReviewScope(chartReviewDue(rules, reviewLevel), reviewLevel);
  return (
    <DrillSetup
      title="Chart Recall"
      intro="Fill in the strategy chart for your table rules from memory, one table at a time. Each table is graded as you finish it, with every wrong cell marked and the right answer shown."
      onStart={startFresh}
      startLabel={`Start (${count} cells)`}
      resume={saved && (
        <ResumeBanner
          detail={`${LEVEL_WORDS[saved.state.level].replace(/^./, (first) => first.toUpperCase())}, ${TABLE_TITLE[saved.state.ids[saved.state.index]].toLowerCase()}: ${cellCount(Object.values(saved.state.entries).filter(isFilled).length)} filled, saved ${relativeTime(saved.updatedAt)}.`}
          onResume={() => { const state = saved.state; setSaved(undefined); begin(state, state); }}
          onDiscard={() => { storage.clearProgress(DRILL); setSaved(undefined); }}
        />
      )}
      aside={<RecentRounds sessions={sessions} unit="cells" />}
    >
      <ReplaceRoundSheet open={Boolean(replacing)} detail={`Your unfinished chart has ${cellCount(saved ? Object.values(saved.state.entries).filter(isFilled).length : 0)} filled.`} onConfirm={() => replacing?.()} onClose={() => setReplacing(null)} />
      <ReviewDue count={reviewScope.only.length} unit={[reviewLevel === "indices" ? "cell with indices" : "cell", reviewLevel === "indices" ? "cells with indices" : "cells"]} onStart={() => startReview(reviewScope)} />
      <RulesBar settings={settings} update={update} note={rules.surrender === "none" ? "No surrender table: your rules have no surrender." : undefined} />
      <SetupGroup title="Difficulty">
        <PresetPicker label="Difficulty" value={pref.level} onChange={(value) => remember({ level: value })} options={LEVELS} />
      </SetupGroup>
      {pref.level === "custom" && <CustomIndices rules={rules} picked={picked} onChange={(next) => remember({ picked: next })} />}
      <SetupGroup title="What to fill in" hint="The whole chart goes table by table: surrender first (it is decided first at the table), then hard, soft and pairs.">
        <Segmented label="What to fill in" hideLabel className="max-sm:[&>div]:flex-wrap max-sm:[&_label]:basis-1/3" value={scope} onChange={(value) => remember({ scope: value })}
          options={[{ value: "all" as Scope, label: "All tables" }, ...allowed.map((id) => ({ value: id as Scope, label: id === "surrender" ? "Surrender" : id === "hard" ? "Hard" : id === "soft" ? "Soft" : "Pairs" }))]} />
      </SetupGroup>
      <Card className="text-sm leading-6 text-ink-2">
        <h2 className="mb-1 text-sm font-semibold text-ink">How it works</h2>
        <p>Tap a cell, or just follow the highlight: each key fills the cell and moves to the next. {withIndices(pref.level) ? "For an index play, tap Index and enter the play it switches to and the count, then its basic play. On a keyboard you can type the count straight into a cell: in the surrender table, 5 means surrender at +5 or higher and -5 or d5 means at −5; elsewhere it opens the index with that count." : ""} Codes: <b className="text-ink">Ds</b> doubles or else stands; <b className="text-ink">—</b> in the surrender table means play the hand.</p>
      </Card>
    </DrillSetup>
  );
}

/** The score and the selected cell's answer after a table is graded, with the way on. */
function ReviewDock({ grade, cell, rules, last, nextTitle, onNext }: { grade: TableGrade; cell?: CellGrade; rules: TableRules; last: boolean; nextTitle?: string; onNext: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { button.current?.focus({ preventScroll: true }); }, [grade.id]);
  const perfect = grade.correct === grade.total;
  return (
    <div className="space-y-2.5">
      <div role="status" className={cx("rounded-2xl border p-3", perfect ? "border-pos/30 bg-pos/10" : "border-line bg-surface")}>
        <p className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="whitespace-nowrap font-semibold">{grade.title}: <span className="tnum">{grade.correct} of {grade.total}</span></span>
          <span className="tnum whitespace-nowrap text-sm text-ink-2">{grade.wrong} wrong · {grade.blank} blank</span>
        </p>
        <p className="mt-1 text-sm leading-5 text-ink-2">
          {cell ? <CellVerdict grade={cell} rules={rules} /> : perfect ? "Every cell right." : "Tap a cell with a red mark to see the answer and why."}
        </p>
      </div>
      <Button ref={button} block onClick={onNext} trailing={<ChevronRight size={18} aria-hidden />}>{last ? "See results" : `Next: ${nextTitle?.toLowerCase()}`}</Button>
    </div>
  );
}

function CellVerdict({ grade, rules }: { grade: CellGrade; rules: TableRules }) {
  const chart = formatEntry(grade.cell.expected, grade.cell.dir);
  return (
    <>
      <span className="font-semibold text-ink">{grade.cell.short}: </span>
      {grade.ok ? <>right, <span className="tnum">{chart}</span>. </> : grade.blank ? <>blank; the chart says <span className="tnum font-semibold text-ink">{chart}</span>. </> : <>you put <span className="tnum text-neg line-through">{formatEntry(grade.entry)}</span>; the chart says <span className="tnum font-semibold text-ink">{chart}</span>. </>}
      <span className="text-ink-3">{explainCell(rules, grade.cell)}</span>
    </>
  );
}

/** A graded table on the summary: the reader's grid with misses marked, and the answer for any cell tapped. */
function GradedTableCard({ table, grade, entries, rules }: { table: RecallTable; grade: TableGrade; entries: Record<string, CellEntry>; rules: TableRules }) {
  const [view, setView] = useState<GridView>("chart");
  const [picked, setPicked] = useState<string>();
  const map = useMemo(() => new Map(grade.cells.map((cell) => [cell.cell.key, cell])), [grade]);
  const shown = picked ? map.get(picked) : undefined;
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{table.title} <span className="tnum font-normal text-ink-2">· {grade.correct} of {grade.total}</span></h2>
        <Segmented label={`${table.title}: show`} hideLabel className="w-36 shrink-0" value={view} onChange={setView} options={[{ value: "chart", label: "Chart" }, { value: "mine", label: "Mine" }]} />
      </div>
      <RecallGrid table={table} entries={entries} grades={map} view={view} selected={picked} onSelect={setPicked} />
      <p className="mt-3 text-sm leading-5 text-ink-2" aria-live="polite">
        {shown ? <CellVerdict grade={shown} rules={rules} /> : grade.correct === grade.total ? "Every cell right." : "Cells with a red mark were wrong or blank. Tap one for the answer."}
      </p>
    </Card>
  );
}

