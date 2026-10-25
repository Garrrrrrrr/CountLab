"use client";
import { useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { SetupGroup } from "@/components/drill/DrillKit";
import { Badge, Button, Sheet } from "@/components/ui";
import { CORE_INDEX_COUNT, indexList, type IndexEntry, type TableRules } from "@/lib/strategy";
import { entryLabel } from "@/lib/strategy-drills/indexPlays";

const GROUPS = [
  { title: "Surrender", has: (entry: IndexEntry) => entry.kind === "surrender" },
  { title: "Hard totals", has: (entry: IndexEntry) => entry.kind === "play" && entry.ref?.section === "hard" },
  { title: "Soft totals", has: (entry: IndexEntry) => entry.kind === "play" && entry.ref?.section === "soft" },
  { title: "Pairs", has: (entry: IndexEntry) => entry.kind === "play" && entry.ref?.section === "pairs" },
];

/** The custom level's index picker: a count on the setup page, and a sheet listing every chart index for these rules. */
export function CustomIndices({ rules, picked, onChange }: { rules: TableRules; picked: readonly string[]; onChange: (picked: string[]) => void }) {
  const [open, setOpen] = useState(false);
  // Insurance has no cell on the chart, so it is not offered.
  const entries = useMemo(() => indexList(rules).filter((entry) => entry.kind !== "insurance"), [rules]);
  const core = useMemo(() => entries.filter((entry) => entry.priority < CORE_INDEX_COUNT).map((entry) => entry.id), [entries]);
  const chosen = new Set(picked);
  const count = entries.filter((entry) => chosen.has(entry.id)).length;
  // Picks for other rules stay saved, so switching rules back keeps them.
  const keepOthers = picked.filter((id) => !entries.some((entry) => entry.id === id));
  const toggle = (id: string) => onChange(chosen.has(id) ? picked.filter((item) => item !== id) : [...picked, id]);
  const set = (ids: string[]) => onChange([...keepOthers, ...ids]);

  return (
    <SetupGroup title="Indices to practise" hint={count ? `${count} of ${entries.length} picked. Every other cell asks only its basic play.` : "None picked: the chart asks only basic plays."}>
      <Button variant="secondary" icon={<ListChecks size={17} aria-hidden />} onClick={() => setOpen(true)}>Choose indices</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Choose indices" description={`${count} of ${entries.length} picked for these rules.`}
        footer={<div className="flex justify-end"><Button onClick={() => setOpen(false)}>Done</Button></div>}>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" className="min-h-11 sm:min-h-9" onClick={() => set(core)}>I18 + Fab 4</Button>
          <Button size="sm" variant="secondary" className="min-h-11 sm:min-h-9" onClick={() => set(entries.map((entry) => entry.id))}>All</Button>
          <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-9" onClick={() => set([])}>None</Button>
        </div>
        {GROUPS.map((group) => {
          const items = entries.filter(group.has);
          if (!items.length) return null;
          return (
            <fieldset key={group.title} className="m-0 mb-4 min-w-0 p-0">
              <legend className="mb-1 text-sm font-semibold">{group.title}</legend>
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {items.map((entry) => (
                  <li key={entry.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5">
                      <input type="checkbox" className="h-4 w-4 shrink-0 accent-[rgb(var(--brand))]" checked={chosen.has(entry.id)} onChange={() => toggle(entry.id)} />
                      {/* Only the hand: the play and the number are what the chart asks. */}
                      <span className="tnum min-w-0 flex-1 text-sm font-semibold">{entryLabel({ kind: "play", ref: entry.ref })}</span>
                      {entry.priority < CORE_INDEX_COUNT && <Badge tone="brand">{entry.kind === "surrender" ? "Fab 4" : "I18"}</Badge>}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          );
        })}
      </Sheet>
    </SetupGroup>
  );
}
