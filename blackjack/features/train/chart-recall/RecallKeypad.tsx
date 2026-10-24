"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Delete, Eraser, Hash } from "lucide-react";
import { ACTION_FILL, ACTION_NAME } from "@/components/blackjack";
import { Button, cx } from "@/components/ui";
import type { Action } from "@/lib/blackjack/types";
import { signedCount } from "@/lib/strategy";
import { baseAction, DEV_KEYS, formatEntry, type CellEntry, type Deviation, type RecallCell, type RecallLevel, type RecallTable } from "@/lib/strategy-drills/chartRecall";

const KEY_FACE: Record<string, { face: string; name: string }> = {
  H: { face: "H", name: "Hit" }, S: { face: "S", name: "Stand" }, D: { face: "D", name: "Double" }, Ds: { face: "Ds", name: "Dbl / stand" },
  P: { face: "P", name: "Split" }, R: { face: "R", name: "Surrender" }, "-": { face: "—", name: "Don't" },
};
const KEY_LABEL: Record<string, string> = { H: "Hit", S: "Stand", D: "Double, otherwise hit", Ds: "Double, otherwise stand", P: "Split", R: "Surrender", "-": "Don't surrender" };
/** Keyboard letters, shown on devices with one. */
export const BASE_LETTER: Record<string, string> = { H: "h", S: "s", D: "d", Ds: "⇧d", P: "p", R: "r", "-": "n" };

const navButton = "flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-2 px-2 text-sm font-semibold text-ink transition hover:bg-surface-3 active:scale-[0.98] disabled:opacity-40";

/** Which cell is selected and what it holds, above the keys. */
function Caption({ cell, entry, filled, total, mode }: { cell: RecallCell; entry?: CellEntry; filled?: number; total?: number; mode?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3 px-0.5 text-sm">
      <p className="min-w-0 truncate"><span className="font-semibold">{cell.short}</span>{mode && <span className="text-ink-3"> · {mode}</span>}<span className="tnum text-ink-2">{entry && (entry.base || entry.dev) ? ` · ${formatEntry(entry)}` : ""}</span></p>
      {filled !== undefined && <p className="tnum shrink-0 text-xs text-ink-3">{filled}/{total} filled</p>}
    </div>
  );
}

/**
 * The thumb keypad for filling the chart: the table's plays as big coloured
 * keys (a press fills the selected cell and moves on), then back, forward,
 * the index entry and clear. Keys never take the system keyboard.
 */
export function BaseKeypad({ table, cell, entry, level, filled, total, onBase, onClear, onMove, onIndex }: {
  table: RecallTable;
  cell: RecallCell;
  entry?: CellEntry;
  level: RecallLevel;
  filled: number;
  total: number;
  onBase: (token: string) => void;
  onClear: () => void;
  onMove: (step: -1 | 1) => void;
  onIndex: () => void;
}) {
  const position = table.cells.findIndex((item) => item.key === cell.key);
  return (
    <div role="group" aria-label="Chart keys">
      <Caption cell={cell} entry={entry} filled={filled} total={total} />
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${table.baseKeys.length}, minmax(0, 1fr))` }}>
        {table.baseKeys.map((token) => {
          const action = baseAction(token);
          return (
            <button key={token} type="button" onClick={() => onBase(token)} aria-label={KEY_LABEL[token]} aria-keyshortcuts={BASE_LETTER[token] === "⇧d" ? "Shift+D" : BASE_LETTER[token]}
              className={cx("flex h-[3.25rem] min-w-0 flex-col items-center justify-center rounded-2xl font-bold transition active:scale-[0.97] sm:h-14", action ? ACTION_FILL[action] : "bg-surface-3 text-ink", entry?.base === token && "ring-2 ring-brand ring-offset-2 ring-offset-bg")}>
              <span className="text-lg leading-none">{KEY_FACE[token].face}</span>
              <span className="mt-1 max-w-full truncate px-1 text-[0.625rem] font-semibold leading-none opacity-85">{KEY_FACE[token].name}</span>
            </button>
          );
        })}
      </div>
      <div className={cx("mt-1.5 grid gap-1.5", level === "indices" ? "grid-cols-4" : "grid-cols-3")}>
        <button type="button" className={navButton} onClick={() => onMove(-1)} disabled={position <= 0} aria-label="Previous cell"><ChevronLeft size={18} aria-hidden /><span className="hidden xs:inline">Back</span></button>
        {level === "indices" && (
          <button type="button" className={cx(navButton, entry?.dev && "border-brand/40 bg-brand/15")} onClick={onIndex} aria-keyshortcuts="i">
            <Hash size={16} aria-hidden className="text-brand-text" />Index
          </button>
        )}
        <button type="button" className={navButton} onClick={onClear} disabled={!entry} aria-label="Clear this cell"><Eraser size={17} aria-hidden /><span className="hidden xs:inline">Clear</span></button>
        <button type="button" className={navButton} onClick={() => onMove(1)} disabled={position >= table.cells.length - 1} aria-label="Next cell"><span className="hidden xs:inline">Next</span><ChevronRight size={18} aria-hidden /></button>
      </div>
    </div>
  );
}

/**
 * Index entry for one cell: the play the count switches to (always surrender
 * in the surrender table) and the index, a sign and one digit. Every index in
 * the chart is between −9 and +9.
 */
export function IndexPad({ cell, surrender, initial, onSave, onCancel }: {
  cell: RecallCell;
  surrender: boolean;
  initial?: Deviation;
  onSave: (dev: Deviation | undefined) => void;
  onCancel: () => void;
}) {
  const [play, setPlay] = useState<Action | undefined>(surrender ? "R" : initial?.play);
  const [value, setValue] = useState(initial ? String(initial.at) : "");
  const digits = value.replace("-", "");
  const ready = Boolean(play) && digits !== "";
  const save = () => { if (ready) onSave({ play: play!, at: Number(value) || 0 }); };
  const press = (key: string) => {
    if (key === "sign") setValue((current) => (current.startsWith("-") ? current.slice(1) : `-${current}`));
    else if (key === "back") setValue((current) => (current.replace("-", "") ? current.slice(0, -1) : ""));
    else setValue((current) => `${current.startsWith("-") ? "-" : ""}${key}`);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const action = DEV_KEYS.find((candidate) => candidate.toLowerCase() === key);
      if (action && !surrender) { event.preventDefault(); setPlay(action); }
      else if (/^[0-9]$/.test(key)) { event.preventDefault(); press(key); }
      else if (key === "-" || key === "+") { event.preventDefault(); setValue((current) => (key === "-" ? (current.startsWith("-") ? current : `-${current}`) : current.replace("-", ""))); }
      else if (key === "backspace") { event.preventDefault(); press("back"); }
      else if (key === "enter") { event.preventDefault(); save(); }
      else if (key === "escape") { event.preventDefault(); onCancel(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const shown = digits === "" ? "?" : signedCount(Number(value) || 0);
  const key = "flex h-11 items-center justify-center rounded-xl bg-surface-2 text-lg font-semibold text-ink transition active:scale-[0.97] active:bg-surface-3";
  return (
    <div role="group" aria-label={`Index for ${cell.short}`}>
      <Caption cell={cell} mode="index" />
      <p className="mb-2 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2 text-center text-[0.9375rem]" aria-live="polite">
        {surrender ? "Surrender" : play ? ACTION_NAME[play] : <span className="text-ink-3">Pick the play</span>} at <span className="tnum font-bold text-brand-text">{shown}</span>
      </p>
      {!surrender && (
        <div className="mb-1.5 grid grid-cols-4 gap-1.5">
          {DEV_KEYS.map((action) => (
            <button key={action} type="button" onClick={() => setPlay(action)} aria-pressed={play === action}
              className={cx("h-11 rounded-xl text-sm font-bold transition active:scale-[0.97]", ACTION_FILL[action], play === action ? "ring-2 ring-brand ring-offset-2 ring-offset-bg" : "opacity-80")}>
              {ACTION_NAME[action]}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-6 gap-1.5">
        {["sign", "1", "2", "3", "4", "5", "0", "6", "7", "8", "9", "back"].map((item) => (
          <button key={item} type="button" className={key} onClick={() => press(item)} aria-label={item === "sign" ? "Toggle minus sign" : item === "back" ? "Delete" : undefined}>
            {item === "sign" ? "±" : item === "back" ? <Delete size={20} aria-hidden /> : item}
          </button>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        <Button variant="secondary" onClick={() => onSave(undefined)} disabled={!initial}>No index</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={save} disabled={!ready}>Save</Button>
      </div>
    </div>
  );
}
