"use client";

import { KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BJA_H17_SECTIONS,
  CHART_DEALERS,
  ChartSection,
  ChartSectionId,
  cellKey,
  chartToken,
} from "@/lib/blackjack/bjaH17Chart";
import { BASE_LETTERS, SHIFT_COMPOUNDS, displayBuffer, explainToken, feedKey, gradeChart, parseEntry, sectionLegend } from "@/lib/blackjack/chartEntry";
import { Button, GhostButton, MobileActionDock, Panel, Select } from "@/components/ui";
import { loadDrillProgress, useDrillProgress } from "@/lib/statistics/useDrillProgress";
import { Mistake, makeSession, storage } from "@/lib/statistics/storage";
import { analytics } from "@/lib/analytics";
import { railState, type RailState } from "@/lib/blackjack/railScroll";

type SectionChoice = "all" | ChartSectionId;
type Feedback = "live" | "end";

interface CellRef {
  key: string;
  section: ChartSectionId;
  row: string;
  dealer: string;
  sectionIndex: number;
  rowIndex: number;
  columnIndex: number;
}

type H17Saved = {
  entries: Record<string, string>;
  choice: SectionChoice;
  feedback: Feedback;
  startedAt: number;
};

export function H17ChartDrill() {
  const [saved] = useState(() => loadDrillProgress<H17Saved>("H17 Chart"));

  useEffect(() => {
    analytics.track("practice_started", { drill: "h17_chart", mode: "all", question_target: 320 });
    // A restored run is still a new attempt in this browser session.
  }, []);

  const [choice, setChoice] = useState<SectionChoice>(saved?.choice ?? "all");
  const sections = useMemo<readonly ChartSection[]>(
    () => (choice === "all" ? BJA_H17_SECTIONS : BJA_H17_SECTIONS.filter((section) => section.id === choice)),
    [choice],
  );

  const cells = useMemo<CellRef[]>(() => {
    const list: CellRef[] = [];
    sections.forEach((section, sectionIndex) => {
      section.rows.forEach((row, rowIndex) => {
        CHART_DEALERS.forEach((dealer, columnIndex) => {
          list.push({ key: cellKey(section.id, row, dealer), section: section.id, row, dealer, sectionIndex, rowIndex, columnIndex });
        });
      });
    });
    return list;
  }, [sections]);

  const positions = useMemo(() => {
    const map = new Map<string, number>();
    cells.forEach((cell, index) => map.set(`${cell.sectionIndex}:${cell.rowIndex}:${cell.columnIndex}`, index));
    return map;
  }, [cells]);

  const [entries, setEntries] = useState<Record<string, string>>(saved?.entries ?? {});
  const [focus, setFocus] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(saved?.feedback ?? "live");
  const [graded, setGraded] = useState(false);
  const [rails, setRails] = useState<Record<string, RailState>>({});
  const [startedAt, setStartedAt] = useState(() => saved?.startedAt ?? Date.now());
  const grade = useMemo(() => gradeChart(sections, entries), [sections, entries]);
  const gradeByKey = useMemo(() => new Map(grade.cells.map((cell) => [cell.key, cell])), [grade]);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const measureRail = useCallback((id: string, node: HTMLDivElement | null) => {
    if (!node) return;
    const firstCell = node.querySelector("tbody td");
    const next = railState({
      scrollLeft: node.scrollLeft,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      columnWidth: firstCell ? firstCell.getBoundingClientRect().width : 0,
    });
    setRails((current) => {
      const previous = current[id];
      return previous && previous.scrollable === next.scrollable && previous.atStart === next.atStart && previous.atEnd === next.atEnd && previous.hiddenRight === next.hiddenRight
        ? current
        : { ...current, [id]: next };
    });
  }, []);

  useDrillProgress("H17 Chart", !graded, {
    entries, choice, feedback, startedAt,
  } satisfies H17Saved);

  useEffect(() => { setFocus(0); }, [choice]);

  /** Move the chart cursor without making an input active (touch-safe). */
  const selectAt = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(cells.length - 1, index));
    setFocus(clamped);
    return clamped;
  }, [cells.length]);

  /** Keyboard navigation deliberately focuses the destination input. */
  const focusAt = useCallback((index: number) => {
    const clamped = selectAt(index);
    inputs.current[clamped]?.focus();
    inputs.current[clamped]?.select();
  }, [selectAt]);

  const focusRelative = useCallback((index: number, rowDelta: number, columnDelta: number) => {
    const cell = cells[index];
    if (!cell) return;
    const section = sections[cell.sectionIndex];
    const rowIndex = Math.max(0, Math.min(section.rows.length - 1, cell.rowIndex + rowDelta));
    const columnIndex = Math.max(0, Math.min(CHART_DEALERS.length - 1, cell.columnIndex + columnDelta));
    const target = positions.get(`${cell.sectionIndex}:${rowIndex}:${columnIndex}`);
    if (target !== undefined) focusAt(target);
  }, [cells, focusAt, positions, sections]);

  const applyResult = useCallback((index: number, result: ReturnType<typeof feedKey>, focusInput = true) => {
    const cell = cells[index];
    if (!cell || result.disposition === "ignore") return;
    setEntries((current) => ({ ...current, [cell.key]: result.buffer }));
    const move = focusInput ? focusAt : selectAt;
    if (result.disposition === "commit") move(index + 1);
    if (result.disposition === "back") move(index - 1);
  }, [cells, focusAt, selectAt]);

  const pressKey = useCallback((index: number, key: string, shiftKey = false) => {
    const cell = cells[index];
    if (!cell) return;
    // These are the touch dock's controls. Advancing the selected cell must
    // not programmatically focus an input, or iOS opens its keyboard again.
    applyResult(index, feedKey(cell.section, entries[cell.key] ?? "", key, shiftKey), false);
  }, [applyResult, cells, entries]);

  const handleKey = useCallback((event: ReactKeyboardEvent<HTMLInputElement>, index: number) => {
    const cell = cells[index];
    if (event.key === "Tab") {
      event.preventDefault();
      focusAt(index + (event.shiftKey ? -1 : 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      focusAt(index + 1);
      return;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if (arrows[event.key]) {
      event.preventDefault();
      focusRelative(index, arrows[event.key][0], arrows[event.key][1]);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const result = feedKey(cell.section, entries[cell.key] ?? "", event.key, event.shiftKey);
    if (result.disposition === "ignore") {
      // Swallow stray letters so the browser never types into the field itself.
      if (event.key.length === 1) event.preventDefault();
      return;
    }
    event.preventDefault();
    applyResult(index, result);
  }, [applyResult, cells, entries, focusAt, focusRelative]);

  const cellTone = useCallback((cell: CellRef, index: number) => {
    const buffer = entries[cell.key] ?? "";
    const settled = graded || (feedback === "live" && parseEntry(cell.section, buffer) !== null);
    if (!settled) return focus === index ? "border-emerald-400/70 ring-1 ring-emerald-400/40" : "border-white/[.08]";
    const result = gradeByKey.get(cell.key);
    return result?.correct
      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
      : "border-red-500/50 bg-red-500/15 text-red-200";
  }, [entries, feedback, focus, gradeByKey, graded]);

  const submit = useCallback(() => {
    if (graded) return;
    const duration = Date.now() - startedAt;
    const mistakes: Mistake[] = grade.cells
      .filter((cell) => !cell.correct)
      .map((cell) => ({
        question: `${cell.sectionLabel} · ${cell.row} vs ${cell.dealer}`,
        userAnswer: cell.answered ? cell.typed : "(skipped)",
        correctAnswer: cell.expected,
        explanation: explainToken(cell.section, chartToken(
          BJA_H17_SECTIONS.find((section) => section.id === cell.section)!, cell.row, cell.dealer)),
      }));
    const session = makeSession(
      "H17 Chart", grade.total, grade.correct, duration, grade.bestStreak, mistakes, grade.bySection,
    );
    storage.addSession(session);
    storage.clearProgress("H17 Chart");
    analytics.track("practice_completed", {
      drill: "h17_chart",
      questions: grade.total,
      correct: grade.correct,
      accuracy: session.accuracy,
      best_streak: grade.bestStreak,
      duration_ms: duration,
      mode: choice,
    });
    setGraded(true);
  }, [choice, grade, graded, startedAt]);

  const total = sections.reduce((sum, section) => sum + section.cells.size, 0);

  return (
    <>
      <div className="mb-5 sm:mb-7">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">Chart recall</p>
        <h1 className="mt-2 text-3xl font-semibold">H17 Chart</h1>
        <p className="mt-2 max-w-2xl text-zinc-400">
          Fill in the whole H17 deviation chart from memory. One keystroke per cell — Tab, Enter,
          or an arrow key moves on. Each table&rsquo;s keys are listed above it.
          <span className="hidden sm:inline"> {" "}Hold{" "}<kbd className="rounded border border-white/15 bg-black/25 px-1 py-px font-mono text-[.68rem]">Shift</kbd>{" "}for the two-part answers (Y/N, Ds) instead of typing two keys.</span>
          <span className="sm:hidden"> Use the keypad below the chart for two-part answers.</span> Deviation cells want the
          true count and the direction it applies, like <code>4+</code> (true count 4 or higher) or{" "}
          <code>-1-</code> (true count -1 or lower).
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          <div className="max-w-xs">
            <Select label="Section" value={choice} onChange={(event) => setChoice(event.target.value as SectionChoice)}>
              <option value="all">Whole chart</option>
              {BJA_H17_SECTIONS.map((section) => (
                <option key={section.id} value={section.id}>{section.label}</option>
              ))}
            </Select>
          </div>
          <div className="max-w-xs">
            <Select label="Feedback" value={feedback} onChange={(event) => setFeedback(event.target.value as Feedback)}>
              <option value="live">Check as I go</option>
              <option value="end">Grade at the end</option>
            </Select>
          </div>
        </div>
        <p className="text-sm text-zinc-500">{total} cells</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={graded}>Submit</Button>
        <GhostButton onClick={() => { setEntries({}); setGraded(false); setStartedAt(Date.now()); selectAt(0); }}>Start over</GhostButton>
        {!graded && <span className="text-sm text-zinc-500">{grade.answered} / {grade.total} filled</span>}
      </div>

      {graded && (
        <Panel className="mb-5">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <b className="text-3xl">{grade.correct} / {grade.total}</b>
            <span className="text-zinc-400">{Math.round((grade.correct / grade.total) * 100)}% correct</span>
            <span className="text-zinc-500">{grade.wrong} wrong · {grade.skipped} skipped</span>
            <span className="text-zinc-500">Best run {grade.bestStreak}</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(grade.bySection).map(([label, value]) => (
              <div key={label} className="rounded-xl bg-black/20 p-3">
                <p className="text-xs text-zinc-500">{label}</p>
                <b className="text-lg">{Math.round((value.correct / value.total) * 100)}%</b>
                <span className="ml-2 text-xs text-zinc-500">{value.correct}/{value.total}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            Every wrong cell is marked in red with the chart&rsquo;s answer beneath it.
          </p>
        </Panel>
      )}

      <div className="space-y-5">
        {sections.map((section, sectionIndex) => (
          <Panel key={section.id}>
            <h2 className="text-lg font-semibold">{section.label}</h2>
            <ul className="mb-4 mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-zinc-500 sm:flex sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2">
              {sectionLegend(section.id).map((entry) => (
                <li key={entry.keys.join("+")} className="inline-flex min-w-0 items-center gap-1.5">
                  {entry.combo ? <>
                    <kbd className="shrink-0 rounded border border-white/15 bg-black/25 px-1.5 py-0.5 font-mono text-[.68rem] text-zinc-400 sm:hidden">{entry.shows}</kbd>
                    <span className="hidden shrink-0 items-center gap-1.5 sm:inline-flex">
                      {entry.keys.map((key, position) => <span key={key} className="inline-flex items-center gap-1.5">
                        {position > 0 && <span aria-hidden="true">+</span>}
                        <kbd className="rounded border border-white/15 bg-black/25 px-1.5 py-0.5 font-mono text-[.68rem] text-zinc-400">{key}</kbd>
                      </span>)}
                    </span>
                  </> : <kbd className="shrink-0 rounded border border-white/15 bg-black/25 px-1.5 py-0.5 font-mono text-[.68rem] text-zinc-400">{entry.keys[0]}</kbd>}
                  <span className="text-zinc-600" aria-hidden="true">→</span>
                  <span className="truncate font-mono text-zinc-300">{entry.shows}</span>
                  <span className="hidden truncate sm:inline">({entry.meaning})</span>
                </li>
              ))}
              <li className="col-span-2 inline-flex min-w-0 items-center gap-1.5">
                <kbd className="shrink-0 rounded border border-white/15 bg-black/25 px-1.5 py-0.5 font-mono text-[.68rem] text-zinc-400">0–9</kbd>
                <span aria-hidden="true">then</span>
                <kbd className="shrink-0 rounded border border-white/15 bg-black/25 px-1.5 py-0.5 font-mono text-[.68rem] text-zinc-400">+</kbd>
                <span aria-hidden="true">or</span>
                <kbd className="shrink-0 rounded border border-white/15 bg-black/25 px-1.5 py-0.5 font-mono text-[.68rem] text-zinc-400">−</kbd>
                <span className="text-zinc-600" aria-hidden="true">→</span>
                <span className="truncate font-mono text-zinc-300">a true count, e.g. 4+</span>
                <span className="hidden sm:inline">(deviate at this count or beyond)</span>
              </li>
            </ul>
            <div className="relative">
              <div
                ref={(node) => measureRail(section.id, node)}
                onScroll={(event) => measureRail(section.id, event.currentTarget)}
                className="-mx-1 snap-x snap-mandatory overflow-x-auto px-1"
              >
              <table className="w-full min-w-[34rem] table-fixed border-separate border-spacing-1 text-center text-sm">
                <thead>
                  <tr>
                    <th className="w-11 bg-[#0c100d] px-1.5 text-left text-xs font-semibold uppercase tracking-[.14em] text-zinc-500 sm:sticky sm:left-0 sm:z-10">
                      Hand
                    </th>
                    {CHART_DEALERS.map((dealer) => (
                      <th key={dealer} className="px-1 pb-1 text-xs font-semibold text-zinc-500">{dealer}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row, rowIndex) => (
                    <tr key={row}>
                      <th scope="row" className="w-11 bg-[#0c100d] px-1.5 text-left font-medium text-zinc-300 sm:sticky sm:left-0 sm:z-10">
                        {row}
                      </th>
                      {CHART_DEALERS.map((dealer, columnIndex) => {
                        const index = positions.get(`${sectionIndex}:${rowIndex}:${columnIndex}`)!;
                        const cell = cells[index];
                        return (
                          <td key={dealer} className="snap-start">
                            <input
                              ref={(element) => { inputs.current[index] = element; }}
                              value={displayBuffer(cell.section, entries[cell.key] ?? "")}
                              onChange={() => undefined}
                              onKeyDown={(event) => handleKey(event, index)}
                              onFocus={() => setFocus(index)}
                              aria-label={`${section.label} ${row} versus ${dealer}`}
                              autoComplete="off"
                              autoCorrect="off"
                              spellCheck={false}
                              className={`h-11 w-full min-w-[2.4rem] rounded-md border bg-black/25 text-center font-mono text-zinc-100 outline-none ${cellTone(cell, index)}`}
                            />
                            {(graded || feedback === "live") && (() => {
                              const result = gradeByKey.get(cell.key);
                              const settled = graded || parseEntry(cell.section, entries[cell.key] ?? "") !== null;
                              if (!settled || !result || result.correct) return null;
                              return <p className="mt-0.5 font-mono text-[.6rem] leading-none text-emerald-300/80">{result.expected}</p>;
                            })()}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {rails[section.id]?.scrollable && !rails[section.id]?.atEnd && (
                <>
                  <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#0c100d] to-transparent" />
                  <p className="pointer-events-none absolute bottom-1 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[.65rem] font-medium text-zinc-300">{rails[section.id].hiddenRight} more →</p>
                </>
              )}
            </div>
          </Panel>
        ))}
      </div>

      <p className="mt-5 text-xs leading-5 text-zinc-500">
        Chart source: Blackjack Apprenticeship, H17 Deviation Chart (2018). Insurance or even money:
        take at true count +3 or above.
      </p>

      <MobileActionDock label="Chart entry keys">
        <div className="flex flex-wrap gap-1.5">
          {BASE_LETTERS[cells[focus]?.section ?? "hard"].map((key) => (
            <GhostButton
              key={key}
              className="min-w-11 px-2 py-1.5 text-sm uppercase"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pressKey(focus, key)}
            >
              {key}
            </GhostButton>
          ))}
          {Object.entries(SHIFT_COMPOUNDS[cells[focus]?.section ?? "hard"] ?? {}).map(([trigger, buffer]) => (
            <GhostButton
              key={buffer}
              className="min-w-11 px-2 py-1.5 text-sm"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pressKey(focus, trigger, true)}
            >
              {displayBuffer(cells[focus]?.section ?? "hard", buffer)}
            </GhostButton>
          ))}
          {["-", "0", "1", "2", "3", "4", "5", "6", "+"].map((key) => (
            <GhostButton
              key={key}
              className="min-w-11 px-2 py-1.5 text-sm"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pressKey(focus, key)}
            >
              {key}
            </GhostButton>
          ))}
          <GhostButton
            className="px-2 py-1.5 text-sm"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pressKey(focus, "Backspace")}
          >
            ⌫
          </GhostButton>
          <GhostButton
            className="px-2 py-1.5 text-sm"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectAt(focus + 1)}
          >
            Next
          </GhostButton>
        </div>
      </MobileActionDock>
    </>
  );
}
