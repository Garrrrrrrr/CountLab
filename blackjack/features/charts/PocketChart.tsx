"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, Printer } from "lucide-react";
import type { Action } from "@/lib/blackjack/types";
import { Button, PageHeader, Segmented, toast } from "@/components/ui";
import { CORE_INDEX_COUNT, DEALERS, basicNeverWithCount, buildChart, cellKey, cellShortName, conflictNotes, indexList, rowLabel, rulesSummary, type PlayTable, type SurrenderTable, type TableRules } from "@/lib/strategy";
import { RulesControl } from "./RulesControl";
import { playCellView, surrenderCellView } from "./StrategyTable";
import { useChartRules } from "./useChartRules";

/** The light-theme action colours from globals.css, fixed so the card prints and saves the same in either theme. */
const FILL: Record<Action, string> = { H: "#e2e5eb", S: "#cf363d", D: "#1f844a", P: "#2c68d6", R: "#7c4dcc" };
const INK = (action: Action | null) => (action === "H" || !action ? "#1f2430" : "#ffffff");
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif";

const CW = 25, CH = 21, GAP = 1.5, LABEL = 24, PAD = 10, COL_GAP = 14;
const TABLE_W = LABEL + DEALERS.length * (CW + GAP);
const tableHeight = (rows: number) => 22 + rows * (CH + GAP);

interface View { action: Action | null; suffix?: string; strip?: { action: Action; label: string }; surrenderFlag?: boolean; note?: boolean }

/** Which index strips the card prints: all of Wong's numbers, or only the learn-first Illustrious 18 and Fab 4. */
export type PocketStrips = "all" | "core";
const STRIPS_KEY = "countlab:pocket-strips";

/** The remembered strip choice, a per-device convenience read after mount. */
export function usePocketStrips(): [PocketStrips, (next: PocketStrips) => void] {
  const [strips, setStrips] = useState<PocketStrips>("all");
  useEffect(() => {
    try { if (localStorage.getItem(STRIPS_KEY) === "core") setStrips("core"); } catch { /* storage unavailable */ }
  }, []);
  const choose = (next: PocketStrips) => {
    setStrips(next);
    try { localStorage.setItem(STRIPS_KEY, next); } catch { /* storage unavailable */ }
  };
  return [strips, choose];
}

/** Drops a cell's strip unless its index is in `keep` (keyed as `indexList` ids). */
const only = (view: View, id: string, keep: Set<string> | null): View => (keep && view.strip && !keep.has(id) ? { ...view, strip: undefined } : view);

function CellShape({ view, x, y }: { view: View; x: number; y: number }) {
  const ink = INK(view.action);
  return (
    <g>
      <rect x={x} y={y} width={CW} height={CH} rx={2.5} fill={view.action ? FILL[view.action] : "#f1f1ee"} />
      <text x={x + CW / 2} y={y + (view.strip ? 9.5 : 14)} textAnchor="middle" fontSize={10} fontWeight={700} fill={ink}>
        {view.action ?? "·"}{view.suffix && <tspan fontSize={7} fontWeight={500}>{view.suffix}</tspan>}
      </text>
      {view.strip && (
        <>
          <path d={`M${x} ${y + CH - 8}h${CW}v5.5a2.5 2.5 0 0 1-2.5 2.5h${-(CW - 5)}a2.5 2.5 0 0 1-2.5-2.5z`} fill={FILL[view.strip.action]} />
          <text x={x + CW / 2} y={y + CH - 1.9} textAnchor="middle" fontSize={6.4} fontWeight={700} fill={INK(view.strip.action)}>
            {view.strip.label === "any" ? `${view.strip.action} any` : `${view.strip.action}${view.strip.label}`}
          </text>
        </>
      )}
      {view.surrenderFlag && <path d={`M${x + CW - 7} ${y}h4.5a2.5 2.5 0 0 1 2.5 2.5v4.5z`} fill={FILL.R} />}
      {view.note && <text x={x + 2} y={y + 7} fontSize={7} fontWeight={700} fill={ink}>*</text>}
    </g>
  );
}

function Grid({ title, x, y, rows, view }: { title: string; x: number; y: number; rows: readonly { label: string; key: string }[]; view: (index: number, dealer: (typeof DEALERS)[number]) => View }) {
  return (
    <g>
      <text x={x} y={y + 9} fontSize={9} fontWeight={700} fill="#1f2430">{title}</text>
      {DEALERS.map((dealer, column) => (
        <text key={dealer} x={x + LABEL + column * (CW + GAP) + CW / 2} y={y + 19} textAnchor="middle" fontSize={7.5} fontWeight={600} fill="#5a6070">{dealer}</text>
      ))}
      {rows.map((row, index) => {
        const top = y + 22 + index * (CH + GAP);
        return (
          <g key={row.key}>
            <text x={x + LABEL - 3} y={top + 13.5} textAnchor="end" fontSize={8} fontWeight={700} fill="#3a4050">{row.label}</text>
            {DEALERS.map((dealer, column) => <CellShape key={dealer} view={view(index, dealer)} x={x + LABEL + column * (CW + GAP)} y={top} />)}
          </g>
        );
      })}
    </g>
  );
}

function playGrid(rules: TableRules, table: PlayTable, title: string, x: number, y: number, keep: Set<string> | null) {
  const rows = table.rows.map((row) => ({ label: rowLabel(table.id, row), key: row }));
  return <Grid title={title} x={x} y={y} rows={rows} view={(index, dealer) => {
    const key = cellKey({ section: table.id, row: table.rows[index], dealer });
    return only(playCellView(rules, table.cells.get(key)!, "indices", 0), key, keep);
  }} />;
}

function surrenderGrid(rules: TableRules, table: SurrenderTable, title: string, x: number, y: number, keep: Set<string> | null) {
  const rows = table.rows.map(({ row, section }) => ({ label: rowLabel(section, row), key: `${section}:${row}` }));
  return <Grid title={title} x={x} y={y} rows={rows} view={(index, dealer) => {
    const ref = { ...table.rows[index], dealer };
    return only(surrenderCellView(rules, table, ref, "indices", 0), `R:${cellKey(ref)}`, keep);
  }} />;
}

/** One card holding every table, sized for a 6×4 index card when printed. */
export function PocketChartSvg({ rules, strips = "all", svgRef }: { rules: TableRules; strips?: PocketStrips; svgRef?: React.Ref<SVGSVGElement> }) {
  const chart = useMemo(() => buildChart(rules), [rules]);
  const keep = useMemo(() => (strips === "core" ? new Set(indexList(rules).filter((entry) => entry.priority < CORE_INDEX_COUNT).map((entry) => entry.id)) : null), [rules, strips]);
  const { hard, soft, pairs } = chart.tables;
  const right = PAD + TABLE_W + COL_GAP;
  const top = 24;
  const softY = top + tableHeight(hard.rows.length) + 6;
  const surrenderY = top + tableHeight(pairs.rows.length) + 6;
  const leftEnd = softY + tableHeight(soft.rows.length);
  const rightEnd = chart.surrender ? surrenderY + tableHeight(chart.surrender.rows.length) : surrenderY - 6;
  const notesY = Math.max(leftEnd, rightEnd) + 12;
  const never = chart.surrender ? [...chart.surrender.cells.entries()].filter(([, rule]) => rule.basic && rule.at === Infinity).map(([key]) => cellShortName(key)) : [];
  const footnotes = [
    ...(never.length ? [`${never.join(", ")}: basic strategy surrenders; with a count, Wong never does.`] : []),
    ...conflictNotes(rules, [hard, soft, pairs].flatMap((table) => [...table.cells.values()].filter(basicNeverWithCount))),
  ];
  const width = right + TABLE_W + PAD;
  const height = notesY + 22 + footnotes.length * 9;
  const keyItems: [Action, string][] = [["H", "Hit"], ["S", "Stand"], ["D", "Double (Ds: else stand)"], ["P", "Split"], ...(chart.surrender ? [["R", "Surrender"] as [Action, string]] : [])];
  let keyX = PAD;
  const key: ReactNode[] = keyItems.map(([action, text]) => {
    const at = keyX;
    keyX += 12 + text.length * 3.5 + 10;
    return (
      <g key={action}>
        <rect x={at} y={notesY - 7} width={9} height={9} rx={1.5} fill={FILL[action]} />
        <text x={at + 12} y={notesY + 0.5} fontSize={7} fill="#3a4050">{text}</text>
      </g>
    );
  });
  return (
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height} fontFamily={FONT}
      role="img" aria-label={`Pocket strategy chart for ${rulesSummary(rules)}`} className="h-auto w-full print:h-[3.85in] print:w-auto">
      <rect width={width} height={height} fill="#ffffff" />
      <text x={PAD} y={14} fontSize={10} fontWeight={800} fill="#1f2430">
        CountLab <tspan fontWeight={600} fill="#3a4050">· {rulesSummary(rules)} · Hi-Lo, {strips === "core" ? "Illustrious 18 + Fab 4" : "Wong\u2019s indices"} · Insurance at +{chart.insuranceAt}</tspan>
      </text>
      {playGrid(rules, hard, "Hard", PAD, top, keep)}
      {playGrid(rules, soft, "Soft", PAD, softY, keep)}
      {playGrid(rules, pairs, "Pairs", right, top, keep)}
      {chart.surrender && surrenderGrid(rules, chart.surrender, rules.surrender === "early" ? "Surrender first (early v 10, late otherwise)" : "Surrender first", right, surrenderY, keep)}
      {key}
      <text x={PAD} y={notesY + 12} fontSize={6.8} fill="#3a4050">
        Strip: the play from that true count (↑ or higher, ↓ or lower). Purple corner: surrender first if allowed. 18+ stands, 5–7 hits.
      </text>
      {footnotes.map((note, line) => <text key={note} x={PAD} y={notesY + 21 + line * 9} fontSize={6.8} fill="#3a4050">* {note}</text>)}
    </svg>
  );
}

export const pocketFileName = (rules: TableRules, strips: PocketStrips = "all") => `countlab-chart-${rulesSummary(rules).replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}${strips === "core" ? "-i18-fab4" : ""}.png`;

/**
 * Saves the card as a PNG. On a phone the share sheet offers "Save Image" to the photo library,
 * which a plain download does not; elsewhere it downloads.
 */
export async function savePng(svg: SVGSVGElement, name: string) {
  const scale = 4;
  const source = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("image")); image.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = svg.viewBox.baseVal.width * scale;
    canvas.height = svg.viewBox.baseVal.height * scale;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("png");
    const file = new File([png], name, { type: "image/png" });
    if (window.matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "CountLab strategy chart" });
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        // Sharing refused (e.g. no user gesture left): fall back to a download.
      }
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(png);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PocketChartPage() {
  const { rules, setRules, differsFromSaved, saveAsMine, resetToSaved } = useChartRules();
  const [strips, setStrips] = usePocketStrips();
  const svg = useRef<SVGSVGElement>(null);
  const save = () => svg.current && savePng(svg.current, pocketFileName(rules, strips)).catch(() => toast("Couldn’t make the image. Try Print and save as PDF instead."));
  return (
    <div>
      <PageHeader
        className="print:hidden"
        back={{ href: "/charts", label: "Charts" }}
        title="Pocket chart"
        sub="Every table on one card for your rules: basic strategy with Wong's index numbers. Print it on a 6×4 index card, or save it as an image for your phone."
      />
      <div className="no-print space-y-3">
        <RulesControl rules={rules} onChange={setRules} differsFromSaved={differsFromSaved} onSave={saveAsMine} onReset={resetToSaved} />
        <Segmented label="Index strips" value={strips} onChange={setStrips} className="sm:w-96"
          options={[{ value: "all", label: "All of Wong’s", hint: "Every index Wong prints for these rules" }, { value: "core", label: "I18 + Fab 4", hint: "Only the Illustrious 18 and Fab 4, the indices to learn first" }]} />
        <div className="flex flex-wrap gap-2">
          <Button icon={<Printer size={16} aria-hidden />} onClick={() => window.print()}>Print</Button>
          <Button variant="secondary" icon={<Download size={16} aria-hidden />} onClick={save}>Save image</Button>
        </div>
      </div>
      <div className="card mt-4 overflow-hidden p-1 print:mt-0 print:border-0 print:p-0">
        <PocketChartSvg rules={rules} strips={strips} svgRef={svg} />
      </div>
    </div>
  );
}
