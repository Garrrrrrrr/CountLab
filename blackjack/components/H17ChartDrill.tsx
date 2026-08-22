"use client";

import { useMemo, useState } from "react";
import {
  BJA_H17_SECTIONS,
  CHART_DEALERS,
  ChartSection,
  ChartSectionId,
  cellKey,
} from "@/lib/blackjack/bjaH17Chart";
import { Panel, Select } from "@/components/ui";

type SectionChoice = "all" | ChartSectionId;

export function H17ChartDrill() {
  const [choice, setChoice] = useState<SectionChoice>("all");
  const sections = useMemo<readonly ChartSection[]>(
    () => (choice === "all" ? BJA_H17_SECTIONS : BJA_H17_SECTIONS.filter((section) => section.id === choice)),
    [choice],
  );
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
        <div className="max-w-xs">
          <Select label="Section" value={choice} onChange={(event) => setChoice(event.target.value as SectionChoice)}>
            <option value="all">Whole chart</option>
            {BJA_H17_SECTIONS.map((section) => (
              <option key={section.id} value={section.id}>{section.label}</option>
            ))}
          </Select>
        </div>
        <p className="text-sm text-zinc-500">{total} cells</p>
      </div>

      <div className="space-y-5">
        {sections.map((section) => (
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
                  {section.rows.map((row) => (
                    <tr key={row}>
                      <th scope="row" className="sticky left-0 z-10 bg-[#0c100d] px-2 text-left font-medium text-zinc-300">
                        {row}
                      </th>
                      {CHART_DEALERS.map((dealer) => (
                        <td key={dealer}>
                          <div
                            data-cell={cellKey(section.id, row, dealer)}
                            className="flex h-9 w-full min-w-[2.4rem] items-center justify-center rounded-md border border-white/[.08] bg-black/25 font-mono text-zinc-100"
                          />
                        </td>
                      ))}
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
    </>
  );
}
