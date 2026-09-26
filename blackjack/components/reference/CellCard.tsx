"use client";

import { ACTION_LABEL } from "@/lib/blackjack/actionStyles";
import { formatRate, formatValue } from "@/lib/blackjack/referenceChartModel";
import type { ChartView, H17Cell, PlayValue, RulesCell } from "@/lib/blackjack/referenceChartModel";
import type { ExplainSource } from "./CellExplainer";
import { H17_TONE_STYLE, SWATCH, TONE_STYLE } from "./cellStyles";

function ValueLines({ value }: { value: PlayValue | null | undefined }) {
  if (value === undefined) return null;
  if (value === null) return <p className="mt-1 text-xs text-[var(--ink-muted)]">Value not measured yet.</p>;
  return (
    <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">
      <span className={`block font-semibold ${value.ev < 0 ? "text-[var(--negative)]" : "text-[var(--ink)]"}`}>Worth {formatValue(value.ev)} units per 100 rounds</span>
      <span className="block">Changes the play {formatRate(value.fires)} times per 100 rounds</span>
    </p>
  );
}

function Eyebrow({ children }: { children: string }) {
  return <p className="font-data text-[.68rem] font-semibold uppercase tracking-[.12em] text-[var(--ink-muted)]">{children}</p>;
}

function CloseHint({ source }: { source: ExplainSource }) {
  if (source !== "pin") return null;
  return <p className="mt-2 hidden border-t border-[var(--rule)] pt-2 text-[.7rem] text-[var(--ink-muted)] [@media(pointer:coarse)]:block">Tap the cell again or anywhere else to close.</p>;
}

/** What a rules-chart cell means, in plain words. */
export function RulesCellCard({ cell, view, source }: { cell: RulesCell; view: ChartView; source: ExplainSource }) {
  const surrenderTable = cell.section === "surrender";
  const answer = surrenderTable ? (cell.action === "R" ? "Surrender" : "Don't surrender") : ACTION_LABEL[cell.action!];
  const detail = surrenderTable
    ? (cell.action === "R" ? "Give up half your bet instead of playing the hand." : "Don't surrender: play the hand out from the hand tables.")
    : cell.fallback ? `If you can't double, ${ACTION_LABEL[cell.fallback].toLowerCase()}.` : undefined;
  const play = cell.play;
  return (
    <>
      <Eyebrow>{surrenderTable ? `Surrender table · ${cell.title}` : cell.title}</Eyebrow>
      <p className="mt-1.5 flex items-center gap-2 text-base font-semibold">
        <span aria-hidden="true" className={`${SWATCH} ${TONE_STYLE[cell.tone]}`}><span>{cell.text === "Ds" ? <>D<span className="text-[.72em]">s</span></> : cell.text}</span></span>
        {answer}
      </p>
      {detail && <p className="mt-1 text-[var(--ink-muted)]">{detail}</p>}
      {cell.notes.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs leading-5 text-[var(--ink-muted)]">
          {cell.notes.map((note) => <li key={note} className="flex gap-1.5"><i className="fa-solid fa-circle-info mt-[3px] text-[.65rem] text-[var(--info)]" aria-hidden="true" />{note}</li>)}
        </ul>
      )}
      {play && view === "index" && (
        <div className="mt-2 border-t border-[var(--rule)] pt-2">
          <p className="flex items-center gap-2 text-[.68rem] font-semibold uppercase tracking-[.1em] text-[var(--ink-muted)]">
            Index play <span className={`ref-chip ref-chip-static ${play.available ? "" : "ref-chip-off"}`}>{play.chip}</span>
          </p>
          <p className="mt-1">{play.sentence}</p>
          {!play.available && <p className="mt-1 text-xs font-semibold text-[var(--warning)]">Not available under your table rules.</p>}
          <ValueLines value={play.value} />
        </div>
      )}
      {play && view === "basic" && (
        <p className="mt-2 border-t border-[var(--rule)] pt-2 text-xs text-[var(--ink-muted)]">The count changes this play. Switch to <b className="text-[var(--ink)]">With index plays</b> to see when.</p>
      )}
      <CloseHint source={source} />
    </>
  );
}

/** What a printed H17 token means, and the plain rule behind an index token. */
export function H17CellCard({ cell, source }: { cell: H17Cell; source: ExplainSource }) {
  return (
    <>
      <Eyebrow>{cell.section === "surrender" ? `Surrender table · ${cell.title}` : cell.title}</Eyebrow>
      <p className="mt-1.5 flex items-start gap-2">
        <span aria-hidden="true" className={`${SWATCH} ${H17_TONE_STYLE[cell.tone]}`}>{cell.text}</span>
        <span>{cell.explain}</span>
      </p>
      {cell.plain && <p className="mt-2 font-semibold">{cell.plain}</p>}
      <ValueLines value={cell.plain ? cell.value : undefined} />
      <CloseHint source={source} />
    </>
  );
}
