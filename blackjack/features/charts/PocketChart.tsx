"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, Printer } from "lucide-react";
import type { Action } from "@/lib/blackjack/types";
import { Button, PageHeader, Segmented, toast } from "@/components/ui";
import { CORE_INDEX_COUNT, DEALERS, basicNeverWithCount, buildChart, cellKey, cellShortName, conflictNotes, indexList, rowLabel, rulesSummary, type PlayTable, type TableRules } from "@/lib/strategy";
import { RulesControl } from "./RulesControl";
import { playCellView, surrenderCellView } from "./StrategyTable";
import { useChartRules } from "./useChartRules";

/** Card colours: light for paper and bright screens, dark for a phone at night. Action hues match the charts in both. */
export type PocketTheme = "light" | "dark";
const ACTION: Record<Exclude<Action, "H">, string> = { S: "#cf363d", D: "#1f844a", P: "#2c68d6", R: "#7c4dcc" };
const PALETTE = {
  light: { bg: "#ffffff", panel: "#f7f6f2", line: "#e6e3db", band: "#ebe8e0", ink: "#15181e", ink2: "#535a67", ink3: "#7a808c", hit: "#e2e5eb", hitInk: "#1f2430", empty: "#efede7", brand: "#f5b93c", brandText: "#8a5c00", mark: "#15181e" },
  dark: { bg: "#0d0f13", panel: "#161920", line: "#262b35", band: "#1f232c", ink: "#eceef2", ink2: "#a4abb8", ink3: "#767e8c", hit: "#353b47", hitInk: "#e8ebf0", empty: "#1c2028", brand: "#f6be46", brandText: "#f6be46", mark: "#262b35" },
} as const;
type Palette = (typeof PALETTE)[PocketTheme];
const fill = (palette: Palette, action: Action) => (action === "H" ? palette.hit : ACTION[action]);
const ink = (palette: Palette, action: Action | null) => (!action || action === "H" ? palette.hitInk : "#ffffff");
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

const CW = 26, CH = 24, GAP = 2, LABEL = 30, INSET = 10, PAD = 14, COL_GAP = 12, HEADER = 52, FOOTER = 20;
const GRID_W = LABEL + DEALERS.length * (CW + GAP) - GAP;
const PANEL_W = GRID_W + 2 * INSET;
const panelHeight = (rows: number) => INSET + 34 + rows * (CH + GAP) - GAP + INSET;
/** Rough text width for laying out pills and wrapping notes; the card uses system fonts. */
const textWidth = (text: string, size: number, bold = false) => text.length * size * (bold ? 0.6 : 0.53);

function wrap(text: string, width: number, size: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size) > width) { lines.push(line); line = word; } else line = next;
  }
  return line ? [...lines, line] : lines;
}

interface View { action: Action | null; suffix?: string; strip?: { action: Action; label: string }; surrenderFlag?: boolean; note?: boolean }

/** Which index strips the card prints: all of Wong's numbers, or only the learn-first Illustrious 18 and Fab 4. */
export type PocketStrips = "all" | "core";

/** A per-device choice, read after mount so the first render matches the static page. */
function useDevicePref<T extends string>(key: string, allowed: readonly T[], initial: T, fallback?: () => T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(initial);
  const defaults = useRef({ allowed, fallback });
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key) as T | null;
      if (saved && defaults.current.allowed.includes(saved)) { setValue(saved); return; }
    } catch { /* storage unavailable */ }
    if (defaults.current.fallback) setValue(defaults.current.fallback());
  }, [key]);
  const choose = (next: T) => {
    setValue(next);
    try { localStorage.setItem(key, next); } catch { /* storage unavailable */ }
  };
  return [value, choose];
}

const STRIP_CHOICES = ["all", "core"] as const;
const THEME_CHOICES = ["light", "dark"] as const;
export const usePocketStrips = () => useDevicePref<PocketStrips>("countlab:pocket-strips", STRIP_CHOICES, "all");

/** The card's colours: the reader's last choice, else whatever the site is showing now. */
export const usePocketTheme = () => useDevicePref<PocketTheme>("countlab:pocket-theme", THEME_CHOICES, "light", () => {
  const chosen = document.documentElement.dataset.theme;
  return chosen === "dark" || (chosen !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
});

/** Drops a cell's strip unless its index is in `keep` (keyed as `indexList` ids). */
const only = (view: View, id: string, keep: Set<string> | null): View => (keep && view.strip && !keep.has(id) ? { ...view, strip: undefined } : view);

function CellShape({ view, x, y, palette }: { view: View; x: number; y: number; palette: Palette }) {
  // No basic play: an empty cell, or (surrender by count only) a dash over the strip.
  const letter = view.action ? ink(palette, view.action) : palette.ink3;
  return (
    <g>
      <rect x={x} y={y} width={CW} height={CH} rx={4} fill={view.action ? fill(palette, view.action) : palette.empty} />
      {(view.action || view.strip) && (
        <text x={x + CW / 2} y={y + (view.strip ? 10.5 : 15.5)} textAnchor="middle" fontSize={view.strip ? 10 : 11} fontWeight={800} fill={letter}>
          {view.action ?? "–"}{view.suffix && <tspan fontSize={7} fontWeight={600}>{view.suffix}</tspan>}
        </text>
      )}
      {view.strip && (
        <>
          <path d={`M${x} ${y + CH - 9.5}h${CW}v5.5a4 4 0 0 1-4 4h${-(CW - 8)}a4 4 0 0 1-4-4z`} fill={fill(palette, view.strip.action)} />
          <text x={x + CW / 2} y={y + CH - 2.4} textAnchor="middle" fontSize={6.6} fontWeight={700} fill={ink(palette, view.strip.action)}>
            {view.strip.label === "any" ? `${view.strip.action} any` : `${view.strip.action}${view.strip.label}`}
          </text>
        </>
      )}
      {view.surrenderFlag && <path d={`M${x + CW - 9} ${y}h5a4 4 0 0 1 4 4v5z`} fill={ACTION.R} />}
      {view.note && <text x={x + 3} y={y + 8} fontSize={8} fontWeight={800} fill={letter}>*</text>}
    </g>
  );
}

function Panel({ x, y, height, title, caption, palette, children }: { x: number; y: number; height: number; title: string; caption?: string; palette: Palette; children?: ReactNode }) {
  return (
    <g>
      <rect x={x} y={y} width={PANEL_W} height={height} rx={10} fill={palette.panel} stroke={palette.line} strokeWidth={0.8} />
      <text x={x + INSET} y={y + INSET + 7} fontSize={7.5} fontWeight={800} letterSpacing={0.9} fill={palette.ink}>{title.toUpperCase()}</text>
      {caption && <text x={x + PANEL_W - INSET} y={y + INSET + 7} textAnchor="end" fontSize={7} fill={palette.ink3}>{caption}</text>}
      {children}
    </g>
  );
}

function Grid({ title, caption, x, y, height, rows, view, palette }: {
  title: string; caption?: string; x: number; y: number; height: number; palette: Palette;
  rows: readonly { label: string; key: string }[]; view: (index: number, dealer: (typeof DEALERS)[number]) => View;
}) {
  const left = x + INSET + LABEL;
  return (
    <Panel x={x} y={y} height={height} title={title} caption={caption ?? "dealer's upcard"} palette={palette}>
      <rect x={left - 2} y={y + INSET + 13} width={GRID_W - LABEL + 4} height={14} rx={4} fill={palette.band} />
      {DEALERS.map((dealer, column) => (
        <text key={dealer} x={left + column * (CW + GAP) + CW / 2} y={y + INSET + 23} textAnchor="middle" fontSize={7.5} fontWeight={700} fill={palette.ink2}>{dealer}</text>
      ))}
      {rows.map((row, index) => {
        const top = y + INSET + 34 + index * (CH + GAP);
        return (
          <g key={row.key}>
            <text x={left - 6} y={top + 15} textAnchor="end" fontSize={8.5} fontWeight={800} fill={palette.ink}>{row.label}</text>
            {DEALERS.map((dealer, column) => <CellShape key={dealer} view={view(index, dealer)} x={left + column * (CW + GAP)} y={top} palette={palette} />)}
          </g>
        );
      })}
    </Panel>
  );
}

/** One card holding every table, in two columns: tall like a phone screen, and a 4×6 index card held upright when printed. */
export function PocketChartSvg({ rules, strips = "all", theme = "light", svgRef, className }: {
  rules: TableRules; strips?: PocketStrips; theme?: PocketTheme; svgRef?: React.Ref<SVGSVGElement>; className?: string;
}) {
  const chart = useMemo(() => buildChart(rules), [rules]);
  const keep = useMemo(() => (strips === "core" ? new Set(indexList(rules).filter((entry) => entry.priority < CORE_INDEX_COUNT).map((entry) => entry.id)) : null), [rules, strips]);
  const palette = PALETTE[theme];
  const { hard, soft, pairs } = chart.tables;
  const surrender = chart.surrender;
  const never = surrender ? [...surrender.cells.entries()].filter(([, rule]) => rule.basic && rule.at === Infinity).map(([key]) => cellShortName(key)) : [];
  const footnotes = [
    ...(never.length ? [`${never.join(", ")}: basic strategy surrenders; with a count, Wong never does.`] : []),
    ...conflictNotes(rules, [hard, soft, pairs].flatMap((table) => [...table.cells.values()].filter(basicNeverWithCount))),
  ];
  const notes = [
    `Insurance: take it at a true count of +${chart.insuranceAt} or higher.`,
    "Hard 18 and up always stands; 5 to 7 always hits. Soft 21 stands.",
    "Indices assume a truncated true count (−1.6 counts as −1).",
    ...footnotes.map((note) => `* ${note}`),
  ].flatMap((note) => wrap(note, PANEL_W - 2 * INSET, 7.2));

  const width = PAD + 2 * PANEL_W + COL_GAP + PAD;
  const subtitle = `Basic strategy with Hi-Lo, ${strips === "core" ? "Illustrious 18 + Fab 4" : "Wong’s indices"}`;

  // Rule pills, right-aligned with the insurance count last; a second row when they would reach the title.
  const insurance = `Insure at +${chart.insuranceAt}`;
  let pillX = width - PAD;
  const pillAt = (text: string) => { const w = textWidth(text, 8, true) + 14; pillX -= w; const at = pillX; pillX -= 5; return { text, at, w }; };
  const insurancePill = pillAt(insurance);
  const rulePills = rulesSummary(rules).split(" · ").filter(Boolean).reverse().map(pillAt);
  const pillY = pillX + 5 < PAD + 34 + textWidth(subtitle, 8) + 12 ? PAD + 31 : PAD + 3;

  // Two columns, a table heading each with panels stacked under it. The key goes on whichever side
  // evens out the heights, and the last panel in a column runs to the bottom.
  type Slot = "hard" | "soft" | "pairs" | "surrender" | "key" | "notes";
  const right: Slot[] = surrender ? ["pairs", "surrender"] : ["pairs"];
  const options: Slot[][][] = [[["hard", "soft", "notes"], [...right, "key"]], [["hard", "soft", "key"], [...right, "notes"]]];
  const minimum: Record<Slot, number> = {
    hard: panelHeight(hard.rows.length), soft: panelHeight(soft.rows.length), pairs: panelHeight(pairs.rows.length),
    surrender: surrender ? panelHeight(surrender.rows.length) : 0, key: surrender ? 184 : 122, notes: 30 + notes.length * 10.5,
  };
  const top = HEADER + pillY - PAD - 3;
  const stack = (columns: Slot[][]) => columns.flatMap((slots, column) => {
    let y = top;
    return slots.map((slot, index) => { const at = y; y += minimum[slot] + COL_GAP; return { slot, x: PAD + column * (PANEL_W + COL_GAP), y: at, last: index === slots.length - 1 }; });
  });
  const lowest = (panels: ReturnType<typeof stack>) => Math.max(...panels.filter((panel) => panel.last).map((panel) => panel.y + minimum[panel.slot]));
  const placed = options.map(stack).reduce((best, next) => (lowest(next) < lowest(best) ? next : best));
  const bottom = lowest(placed);
  const at = Object.fromEntries(placed.map(({ slot, x, y, last }) => [slot, { x, y, height: last ? bottom - y : minimum[slot] }])) as Record<Slot, { x: number; y: number; height: number }>;
  const { x: keyX, y: keyY } = at.key, { x: notesX, y: notesY } = at.notes;
  const height = bottom + FOOTER;

  const keyItems: [Action, string, string?][] = [["H", "Hit"], ["S", "Stand"], ["D", "Double"], ["D", "Double, else stand", "s"], ["P", "Split"], ...(surrender ? [["R", "Surrender"] as [Action, string]] : [])];
  const example = (x: number, y: number, view: View, text: string) => (
    <g>
      <CellShape view={view} x={x} y={y} palette={palette} />
      {wrap(text, PANEL_W - 2 * INSET - CW - 10, 7.2).map((line, index) => <text key={line} x={x + CW + 8} y={y + 9 + index * 9.5} fontSize={7.2} fill={palette.ink2}>{line}</text>)}
    </g>
  );
  const playView = (table: PlayTable) => (index: number, dealer: (typeof DEALERS)[number]) => {
    const key = cellKey({ section: table.id, row: table.rows[index], dealer });
    return only(playCellView(rules, table.cells.get(key)!, "indices", 0), key, keep);
  };
  const playRows = (table: PlayTable) => table.rows.map((row) => ({ label: rowLabel(table.id, row), key: row }));

  return (
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height} fontFamily={FONT}
      role="img" aria-label={`Pocket strategy chart for ${rulesSummary(rules)}`} className={className ?? "h-auto w-full print:h-auto print:w-[3.9in]"}>
      <rect width={width} height={height} fill={palette.bg} />

      <g transform={`translate(${PAD} ${PAD}) scale(${26 / 64})`}>
        <rect width="64" height="64" rx="15" fill={palette.mark} />
        <rect x="17" y="11" width="30" height="42" rx="5.5" fill="#F5B93C" transform="rotate(-9 32 32)" />
        <path d="M32 21.5c-2.9 4.6-9.2 7.6-9.2 12.6 0 3.3 2.6 5.7 5.7 5.7 1.3 0 2.5-.4 3.3-1.2-.4 2.3-1.6 4.1-3.3 5.3h7c-1.7-1.2-2.9-3-3.3-5.3.8.8 2 1.2 3.3 1.2 3.1 0 5.7-2.4 5.7-5.7 0-5-6.3-8-9.2-12.6Z" fill={palette.mark} transform="rotate(-9 32 32)" />
      </g>
      <text x={PAD + 34} y={PAD + 11} fontSize={13} fontWeight={800} fill={palette.ink}>Count<tspan fill={palette.brandText}>Lab</tspan></text>
      <text x={PAD + 34} y={PAD + 23} fontSize={8} fill={palette.ink2}>{subtitle}</text>
      {rulePills.map(({ text, at, w }) => (
        <g key={text}>
          <rect x={at} y={pillY} width={w} height={17} rx={8.5} fill={palette.panel} stroke={palette.line} strokeWidth={0.8} />
          <text x={at + w / 2} y={pillY + 11.5} textAnchor="middle" fontSize={8} fontWeight={700} fill={palette.ink}>{text}</text>
        </g>
      ))}
      <rect x={insurancePill.at} y={pillY} width={insurancePill.w} height={17} rx={8.5} fill={palette.brand} />
      <text x={insurancePill.at + insurancePill.w / 2} y={pillY + 11.5} textAnchor="middle" fontSize={8} fontWeight={800} fill="#211804">{insurance}</text>

      <Grid title="Hard totals" {...at.hard} rows={playRows(hard)} view={playView(hard)} palette={palette} />
      {surrender && (
        <Grid title="Surrender first" caption={rules.surrender === "early" ? "early v 10, late otherwise" : "late surrender"} {...at.surrender} palette={palette}
          rows={surrender.rows.map(({ row, section }) => ({ label: rowLabel(section, row), key: `${section}:${row}` }))}
          view={(index, dealer) => { const ref = { ...surrender.rows[index], dealer }; return only(surrenderCellView(rules, surrender, ref, "indices", 0), `R:${cellKey(ref)}`, keep); }} />
      )}

      <Grid title="Soft totals" {...at.soft} rows={playRows(soft)} view={playView(soft)} palette={palette} />
      <Panel {...at.key} title="How to read it" palette={palette}>
        {keyItems.map(([action, text, suffix], index) => {
          const x = keyX + INSET + (index % 3) * 100, y = keyY + INSET + 16 + Math.floor(index / 3) * 19;
          return (
            <g key={text}>
              <rect x={x} y={y} width={20} height={15} rx={3.5} fill={fill(palette, action)} />
              <text x={x + 10} y={y + 10.5} textAnchor="middle" fontSize={8.5} fontWeight={800} fill={ink(palette, action)}>{action}{suffix && <tspan fontSize={6}>{suffix}</tspan>}</text>
              <text x={x + 25} y={y + 10.5} fontSize={7.4} fill={palette.ink2}>{text}</text>
            </g>
          );
        })}
        {example(keyX + INSET, keyY + INSET + 58, { action: "H", strip: { action: "S", label: "+2↑" } }, "Hit; stand from a true count of +2 up. A strip is the play the count switches to; ↓ means at that count or lower.")}
        {surrender && example(keyX + INSET, keyY + INSET + 90, { action: "H", surrenderFlag: true }, "A purple corner means surrender first if the table allows it; the surrender panel has its counts.")}
        {surrender && example(keyX + INSET, keyY + INSET + 122, { action: null, strip: { action: "R", label: "+3↑" } }, "In the surrender panel, a dash means play the hand: surrender only from a true count of +3 up.")}
      </Panel>

      <Grid title="Pairs" {...at.pairs} rows={playRows(pairs)} view={playView(pairs)} palette={palette} />
      <Panel {...at.notes} title="Notes" palette={palette}>
        {notes.map((line, index) => <text key={index} x={notesX + INSET} y={notesY + INSET + 22 + index * 10.5} fontSize={7.2} fill={palette.ink2}>{line}</text>)}
      </Panel>

      <text x={PAD} y={height - 7} fontSize={7} fill={palette.ink3}>countlab.ca</text>
      <text x={width - PAD} y={height - 7} textAnchor="end" fontSize={7} fill={palette.ink3}>Indices: Stanford Wong, Professional Blackjack</text>
    </svg>
  );
}

export const pocketFileName = (rules: TableRules, strips: PocketStrips = "all", theme: PocketTheme = "light") =>
  `countlab-chart-${rulesSummary(rules).replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}${strips === "core" ? "-i18-fab4" : ""}${theme === "dark" ? "-dark" : ""}.png`;

/**
 * Saves the card as a PNG. On a phone the share sheet offers "Save Image" to the photo library,
 * which a plain download does not; elsewhere it downloads.
 */
export async function savePng(svg: SVGSVGElement, name: string) {
  // As many pixels as iOS Safari will draw (16.7M), so the image stays sharp when zoomed in.
  const scale = Math.sqrt(16_000_000 / (svg.viewBox.baseVal.width * svg.viewBox.baseVal.height));
  const source = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("image")); image.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(svg.viewBox.baseVal.width * scale);
    canvas.height = Math.floor(svg.viewBox.baseVal.height * scale);
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
  const [theme, setTheme] = usePocketTheme();
  const svg = useRef<SVGSVGElement>(null);
  const save = () => svg.current && savePng(svg.current, pocketFileName(rules, strips, theme)).catch(() => toast("Couldn’t make the image. Try Print and save as PDF instead."));
  return (
    <div>
      <PageHeader
        className="print:hidden"
        back={{ href: "/charts", label: "Charts" }}
        title="Pocket chart"
        sub="Every table on one card for your rules: basic strategy with Wong's index numbers. Print it on a 4×6 index card, or save it as an image for your phone."
      />
      <div className="no-print space-y-3">
        <RulesControl rules={rules} onChange={setRules} differsFromSaved={differsFromSaved} onSave={saveAsMine} onReset={resetToSaved} />
        <div className="flex flex-wrap gap-3">
          <Segmented label="Index strips" value={strips} onChange={setStrips} className="w-full sm:w-96"
            options={[{ value: "all", label: "All of Wong’s", hint: "Every index Wong prints for these rules" }, { value: "core", label: "I18 + Fab 4", hint: "Only the Illustrious 18 and Fab 4, the indices to learn first" }]} />
          <Segmented label="Card colours" value={theme} onChange={setTheme} className="w-full sm:w-56"
            options={[{ value: "light", label: "Light", hint: "Prints and saves light" }, { value: "dark", label: "Dark", hint: "Saves dark; printing stays light" }]} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<Printer size={16} aria-hidden />} onClick={() => window.print()}>Print</Button>
          <Button variant="secondary" icon={<Download size={16} aria-hidden />} onClick={save}>Save image</Button>
        </div>
      </div>
      <div className={`mt-4 overflow-hidden rounded-2xl border border-line print:mt-0 print:rounded-none print:border-0 ${theme === "dark" ? "print:hidden" : ""}`}>
        <PocketChartSvg rules={rules} strips={strips} theme={theme} svgRef={svg} />
      </div>
      {/* Paper always gets the light card. */}
      {theme === "dark" && <div className="hidden print:block"><PocketChartSvg rules={rules} strips={strips} /></div>}
    </div>
  );
}
