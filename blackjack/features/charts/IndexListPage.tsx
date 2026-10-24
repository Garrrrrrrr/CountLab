"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Grid3x3 } from "lucide-react";
import type { Action } from "@/lib/blackjack/types";
import { ACTION_FILL, ACTION_NAME } from "@/components/blackjack/actions";
import { ButtonLink, PageHeader, Segmented } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { CORE_INDEX_COUNT, SOURCE_NAME, handLabel, indexList, signedCount, type IndexEntry, type TableRules } from "@/lib/strategy";
import { CellSheet } from "./CellSheet";
import { RulesControl } from "./RulesControl";
import { useChartRules } from "./useChartRules";

const dealerText = (dealer: string) => (dealer === "A" ? "A" : dealer);

function entryTitle(entry: IndexEntry) {
  if (entry.kind === "insurance") return "Insurance";
  const ref = entry.ref!;
  return `${handLabel(ref.section, ref.row)} v ${dealerText(ref.dealer)}`;
}

function entryPlay(entry: IndexEntry) {
  const when = `${signedCount(entry.at)} or ${entry.dir === "up" ? "higher" : "lower"}`;
  if (entry.kind === "insurance") return { play: "Take insurance", when, otherwise: "decline" };
  const play = entry.play as Action;
  return { play: ACTION_NAME[play], when, otherwise: ACTION_NAME[entry.basic as Action].toLowerCase() };
}

export function IndexListPage() {
  const { rules, setRules, differsFromSaved, saveAsMine, resetToSaved } = useChartRules();
  const [scope, setScope] = useState<"core" | "all">("all");
  const [open, setOpen] = useState<IndexEntry | null>(null);
  const entries = useMemo(() => indexList(rules), [rules]);
  const core = entries.filter((entry) => entry.priority < CORE_INDEX_COUNT);
  const more = entries.filter((entry) => entry.priority >= CORE_INDEX_COUNT);
  return (
    <div>
      <PageHeader
        back={{ href: "/charts", label: "Charts" }}
        title="Index plays"
        sub="Every count-based change to basic strategy for your rules, in the order most players learn them. A true count is the running count divided by the decks left."
        actions={<ButtonLink href={`/train/deviations`} size="sm" className="hidden sm:inline-flex">Drill these</ButtonLink>}
      />
      <div className="space-y-3">
        <RulesControl rules={rules} onChange={setRules} differsFromSaved={differsFromSaved} onSave={saveAsMine} onReset={resetToSaved} />
        <Segmented label="Show" hideLabel value={scope} onChange={setScope} className="sm:w-96"
          options={[{ value: "core", label: `Learn first (${core.length})` }, { value: "all", label: `All (${entries.length})` }]} />
      </div>

      <IndexGroup title="Learn these first" sub="Insurance, the Illustrious 18 and the Fab 4 surrenders: most of the value of counting your plays." entries={core} rules={rules} onOpen={setOpen} />
      {scope === "all" && more.length > 0 && <IndexGroup title="More index plays" sub="Smaller gains, or plays that only come up at extreme counts." entries={more} rules={rules} onOpen={setOpen} startAt={core.length} />}

      <div className="mt-6 flex flex-wrap gap-2">
        <ButtonLink href="/charts" variant="secondary" icon={<Grid3x3 size={16} aria-hidden />}>See them on the chart</ButtonLink>
        <ButtonLink href="/train/deviations">Drill index plays</ButtonLink>
      </div>
      <CellSheet rules={rules} cell={open?.ref ?? null} open={Boolean(open?.ref)} onClose={() => setOpen(null)} />
    </div>
  );
}

function IndexGroup({ title, sub, entries, rules, onOpen, startAt = 0 }: { title: string; sub: string; entries: IndexEntry[]; rules: TableRules; onOpen: (entry: IndexEntry) => void; startAt?: number }) {
  if (!entries.length) return null;
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-0.5 text-sm text-ink-3">{sub}</p>
      <ol className="card mt-3 divide-y divide-line overflow-hidden">
        {entries.map((entry, position) => {
          const { play, when, otherwise } = entryPlay(entry);
          const action = entry.kind === "insurance" ? null : (entry.play as Action);
          const body = (
            <>
              <span className="tnum w-6 shrink-0 text-right text-xs font-semibold text-ink-3">{startAt + position + 1}</span>
              <span className={cx("grid h-9 w-11 shrink-0 place-items-center rounded-lg font-mono text-sm font-bold", action ? ACTION_FILL[action] : "bg-brand/20 text-brand-text")} aria-hidden>
                {signedCount(entry.at)}{entry.dir === "up" ? "↑" : "↓"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{entryTitle(entry)}{entry.kind === "surrender" && <span className="ml-1.5 text-xs font-medium text-ink-3">surrender</span>}</span>
                <span className="block text-sm leading-5 text-ink-2">{play} at {when}; otherwise {otherwise}.</span>
                <span className="block text-xs text-ink-3">{SOURCE_NAME[entry.source]}</span>
              </span>
              {entry.ref && <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />}
            </>
          );
          return (
            <li key={entry.id}>
              {entry.ref ? (
                <button type="button" onClick={() => onOpen(entry)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface-2 sm:px-4">{body}</button>
              ) : (
                <div className="flex items-center gap-3 px-3 py-3 sm:px-4">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
      {rules.decks <= 2 && <p className="mt-2 text-xs text-ink-3">Shoe-game index values. <Link href="/charts" className="underline">Basic strategy</Link> is exact for your deck count.</p>}
    </section>
  );
}
