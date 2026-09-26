"use client";

import { HelpTip } from "@/components/ui";
import type { CellTone, ChartView, H17Tone, IndexPlayCounts } from "@/lib/blackjack/referenceChartModel";
import type { StrategyChartRules } from "@/lib/blackjack/strategyChart";
import { H17_TONE_STYLE, SWATCH, TONE_STYLE } from "./cellStyles";

const RULES_KEY: ReadonlyArray<[CellTone, string, string]> = [
  ["H", "H", "Hit"],
  ["S", "S", "Stand"],
  ["D", "D", "Double (if you can't, hit)"],
  ["Ds", "Ds", "Double (if you can't, stand)"],
  ["P", "P", "Split"],
  ["R", "R", "Surrender"],
];

const H17_KEY: ReadonlyArray<[H17Tone, string, string]> = [
  ["Y", "Y", "Split"],
  ["N", "N", "Don't split / don't surrender"],
  ["YN", "Y/N", "Split only if double after split is offered"],
  ["H", "H", "Hit"],
  ["S", "S", "Stand"],
  ["D", "D", "Double (if you can't, hit)"],
  ["Ds", "Ds", "Double (if you can't, stand)"],
  ["SUR", "SUR", "Surrender"],
  ["index", "4+", "True count +4 or higher"],
  ["index", "-1-", "True count −1 or lower"],
  ["index", "0+ / 0-", "Any positive / negative running count"],
];

const INSURANCE_PILL = "inline-flex rounded-lg border border-amber-600/40 bg-amber-400/10 px-2.5 py-1 text-sm font-medium text-[var(--ink)] print:px-1.5 print:py-0 print:text-[10px]";
const NOTE = "text-xs leading-5 text-[var(--ink-muted)] print:text-[9px] print:leading-4";

function Swatch({ tone, text, style }: { tone: string; text: string; style: string }) {
  return (
    <span aria-hidden="true" data-tone={tone} className={`${SWATCH} ${style}`}>
      <span>{text === "Ds" ? <>D<span className="text-[.72em]">s</span></> : text}</span>
    </span>
  );
}

const TRUE_COUNT_HELP = "Your running count divided by the decks still to be dealt. Index plays are the hands where the true count makes a different play better than basic strategy.";

/**
 * What a true count is. Phones move the key below the first table, so it
 * holds nothing focusable there (focus would jump back up the page): the
 * definition is written out instead of behind a tip, and paper gets it too.
 */
function TrueCountHelp() {
  return (
    <>
      <span className="md:hidden print:!inline"> The true count is your running count divided by the decks still to be dealt.</span>{" "}
      <HelpTip label="True count" className="max-md:hidden print:hidden">{TRUE_COUNT_HELP}</HelpTip>
    </>
  );
}

/** "36 index plays for these rules, insurance included (5 apply only after hitting or splitting)." */
function countLine({ total, afterHitting, unmeasured }: IndexPlayCounts) {
  const parts = [
    afterHitting ? `${afterHitting} apply only after hitting or splitting` : "",
    unmeasured ? `${unmeasured} not measured yet` : "",
  ].filter(Boolean);
  return `${total} index plays for these rules, insurance included${parts.length ? ` (${parts.join("; ")})` : ""}. `;
}

/** Every code on the rules chart in plain words, right above the tables (below the first one on phones). */
export function RulesChartKey({ view, rules, counts }: { view: ChartView; rules: StrategyChartRules; counts: IndexPlayCounts | null }) {
  const restricted = rules.doubleRule !== "any" || rules.europeanNoHoleCard;
  return (
    <div className="ref-key min-w-0 space-y-2 print:space-y-1">
      <h2 className="sr-only" data-analytics-section={view === "index" ? "index_deviations" : "chart_key"}>How to read this chart</h2>
      {view === "index" && <p className={INSURANCE_PILL}>Insurance: take at TC +3 or above.</p>}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--ink-muted)] print:gap-y-0.5 print:text-[9px]">
        {RULES_KEY.map(([tone, text, label]) => (
          <li key={tone} className="inline-flex items-center gap-1.5"><Swatch tone={tone} text={text} style={TONE_STYLE[tone]} />{label}</li>
        ))}
        {rules.surrender !== "none" && (
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`${SWATCH} relative ${TONE_STYLE.H}`}>H<span className="ref-flag" /></span>
            Corner flag: surrender first
          </li>
        )}
      </ul>
      {view === "index" && (
        <p className={NOTE}>
          Every cell keeps its basic-strategy action. A chip shows the index play: <span className="ref-chip ref-chip-static">S+2&#8593;</span> stand when the true count is +2 or higher; <span className="ref-chip ref-chip-static">H&#8722;1&#8595;</span> hit when it is &#8722;1 or lower.
          <TrueCountHelp />
        </p>
      )}
      <p className={NOTE}>
        <span>T = any 10-value card (10, J, Q, K). </span>
        {view === "basic" && <span>Basic strategy never takes insurance or even money. </span>}
        {rules.surrender !== "none" && <span>Surrender is on: check the Surrender table first; the other tables are for hands you play out. </span>}
        {view === "index" && counts && <span>{countLine(counts)}</span>}
        {view === "index" && rules.decks <= 2 && <span>The indices shown are the 4–8 deck sets. </span>}
        {view === "index" && restricted && <span>Dashed chips aren&apos;t available under your double or hole-card rule. </span>}
        {view === "index" && <span className="print:hidden">The printed H17 chart writes S+4&#8593; as 4+. </span>}
        <span className="hidden [@media(hover:hover)]:inline print:!hidden">Tip: arrow keys move between cells{view === "index" ? "; N and Shift+N jump to the next and previous index play" : ""}.</span>
      </p>
    </div>
  );
}

/** The printed H17 chart's legend, including the codes it only ever explained in its footnotes. */
export function H17ChartKey() {
  return (
    <div className="ref-key min-w-0 space-y-2 print:space-y-1">
      <p className={INSURANCE_PILL}>Insurance or even money: take at TC +3 or above.</p>
      <h2 className="sr-only" data-analytics-section="complete_h17_chart">How to read this chart</h2>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--ink-muted)] print:gap-y-0.5 print:text-[9px]">
        {H17_KEY.map(([tone, text, label]) => (
          <li key={text} className="inline-flex items-center gap-1.5"><Swatch tone={tone} text={text} style={H17_TONE_STYLE[tone]} />{label}</li>
        ))}
      </ul>
      <p className={NOTE}>
        T = any 10-value card. The rules chart writes 4+ as S+4&#8593; (stand at +4 and up).
        <TrueCountHelp />
        <span className="hidden [@media(hover:hover)]:inline print:!hidden"> Tip: arrow keys move between cells.</span>
      </p>
    </div>
  );
}
