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
import { SECTION_LETTERS, displayBuffer, explainToken, feedKey, gradeChart, parseEntry } from "@/lib/blackjack/chartEntry";
import { Button, GhostButton, MobileActionDock, Panel, Select } from "@/components/ui";
import { loadDrillProgress, useDrillProgress } from "@/lib/statistics/useDrillProgress";
import { Mistake, makeSession, storage } from "@/lib/statistics/storage";
import { analytics } from "@/lib/analytics";

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
  const [startedAt, setStartedAt] = useState(() => saved?.startedAt ?? Date.now());
  const grade = useMemo(() => gradeChart(sections, entries), [sections, entries]);
  const gradeByKey = useMemo(() => new Map(grade.cells.map((cell) => [cell.key, cell])), [grade]);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useDrillProgress("H17 Chart", !graded, {
    entries, choice, feedback, startedAt,
  } satisfies H17Saved);

  useEffect(() => { setFocus(0); }, [choice]);

  const focusAt = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(cells.length - 1, index));
    setFocus(clamped);
    inputs.current[clamped]?.focus();
    inputs.current[clamped]?.select();
  }, [cells.length]);

  const focusRelative = useCallback((index: number, rowDelta: number, columnDelta: number) => {
    const cell = cells[index];
    if (!cell) return;
    const section = sections[cell.sectionIndex];
    const rowIndex = Math.max(0, Math.min(section.rows.length - 1, cell.rowIndex + rowDelta));
    const columnIndex = Math.max(0, Math.min(CHART_DEALERS.length - 1, cell.columnIndex + columnDelta));
    const target = positions.get(`${cell.sectionIndex}:${rowIndex}:${columnIndex}`);
    if (target !== undefined) focusAt(target);
  }, [cells, focusAt, positions, sections]);

  const applyResult = useCallback((index: number, result: ReturnType<typeof feedKey>) => {
    const cell = cells[index];
    if (!cell || result.disposition === "ignore") return;
    setEntries((current) => ({ ...current, [cell.key]: result.buffer }));
    if (result.disposition === "commit") focusAt(index + 1);
    if (result.disposition === "back") focusAt(index - 1);
  }, [cells, focusAt]);

  const pressKey = useCallback((index: number, key: string) => {
    const cell = cells[index];
    if (!cell) return;
    applyResult(index, feedKey(cell.section, entries[cell.key] ?? "", key));
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
    const result = feedKey(cell.section, entries[cell.key] ?? "", event.key);
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
          Fill in the whole H17 deviation chart from memory. One keystroke per cell; Tab or Enter
          moves on. Deviation cells want the index and its sign, like <code>4+</code> or <code>-1-</code>.
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
        <GhostButton onClick={() => { setEntries({}); setGraded(false); setStartedAt(Date.now()); focusAt(0); }}>Start over</GhostButton>
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
            <h2 className="mb-4 text-lg font-semibold">{section.label}</h2>
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[34rem] border-separate border-spacing-1 text-center text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-[#0c100d] px-2 text-left text-xs font-semibold uppercase tracking-[.14em] text-zinc-500">
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
                      <th scope="row" className="sticky left-0 z-10 bg-[#0c100d] px-2 text-left font-medium text-zinc-300">
                        {row}
                      </th>
                      {CHART_DEALERS.map((dealer, columnIndex) => {
                        const index = positions.get(`${sectionIndex}:${rowIndex}:${columnIndex}`)!;
                        const cell = cells[index];
                        return (
                          <td key={dealer}>
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
                              className={`h-9 w-full min-w-[2.4rem] rounded-md border bg-black/25 text-center font-mono text-zinc-100 outline-none ${cellTone(cell, index)}`}
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
          </Panel>
        ))}
      </div>

      <p className="mt-5 text-xs leading-5 text-zinc-500">
        Chart source: Blackjack Apprenticeship, H17 Deviation Chart (2018). Insurance or even money:
        take at true count +3 or above.
      </p>

      <MobileActionDock label="Chart entry keys">
        <div className="flex flex-wrap gap-1.5">
          {[...new Set(SECTION_LETTERS[cells[focus]?.section ?? "hard"].flatMap((token) => [...token]))].map((key) => (
            <GhostButton
              key={key}
              className="min-w-11 px-2 py-1.5 text-sm uppercase"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pressKey(focus, key)}
            >
              {key}
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
            onClick={() => focusAt(focus + 1)}
          >
            Next
          </GhostButton>
        </div>
      </MobileActionDock>
    </>
  );
}
