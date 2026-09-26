"use client";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { ButtonLink, Callout, EmptyState, PageHeader, Panel, PanelHeader, ProgressMeter } from "@/components/ui";
import { countingBenchmarkDetails, countingCategoryLabel, type BenchmarkDetail } from "@/lib/blackjack/countingTraining";
import { setPracticeFocus } from "@/lib/statistics/spacedRepetition";
import type { DrillType } from "@/lib/statistics/storage";
import { useStoredSessions } from "./hooks";

const WEAK_SPOT_DRILLS: { drill: DrillType; href: string; categories: string[] }[] = [
  { drill: "True Count", href: "/training/true-count", categories: ["positive", "negative", "zero"] },
  { drill: "Deck Estimation", href: "/training/deck-estimation", categories: ["1-deck", "0.5-deck", "0.25-deck"] },
  { drill: "Basic Strategy", href: "/training/basic-strategy", categories: ["Hard totals", "Soft totals", "Pairs", "Surrender"] },
];
const COUNTING_DRILLS: readonly DrillType[] = ["Running Count", "True Count", "Deck Estimation", "Full Shoe"];

function TargetRow({ detail, next }: { detail: BenchmarkDetail; next: boolean }) {
  return (
    <li className={`grid gap-3 rounded-xl border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${next ? "border-[var(--ink)] bg-[var(--paper)]" : "border-[var(--rule)]"}`}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {detail.met
            ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)]"><i className="fa-solid fa-circle-check" aria-hidden="true" />Met</span>
            : <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-muted)]"><i className="fa-regular fa-circle" aria-hidden="true" />Not yet</span>}
          {next && <span className="rounded-full bg-[var(--ink)] px-2 py-px text-[.65rem] font-semibold uppercase tracking-[.08em] text-[var(--paper)]">Next up</span>}
        </p>
        <p className="mt-1 font-semibold text-[var(--ink)]">{detail.label}</p>
        <p className="mt-0.5 text-sm text-[var(--ink-muted)]">Latest: <span className="font-data text-[var(--ink)]">{detail.latest}</span></p>
        {detail.note && <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{detail.note}</p>}
        {detail.progress !== undefined && <ProgressMeter className="mt-2 max-w-sm" label={`${detail.label}: progress`} value={Math.round(detail.progress * 100)} max={100} tone={detail.met ? "good" : "info"} valueText={`${Math.round(detail.progress * 100)}% of the way`} />}
      </div>
      <div className="flex justify-end">
        {next
          ? <ButtonLink href={detail.practiceHref} className="w-full sm:w-auto">Practice {detail.drill}</ButtonLink>
          : <ButtonLink href={detail.practiceHref} variant="quiet" aria-label={`Practice: ${detail.label}`} className="min-h-11 px-3 text-sm">Practice</ButtonLink>}
      </div>
    </li>
  );
}

/**
 * Are you table-ready? The four counting targets with your latest number for
 * each, the one to work on next, and the weak spots to drill.
 */
export function CountingBenchmark() {
  const router = useRouter();
  const sessions = useStoredSessions();
  const details = useMemo(() => countingBenchmarkDetails(sessions), [sessions]);
  const met = details.filter((detail) => detail.met).length;
  const nextIndex = details.findIndex((detail) => !detail.met);
  const hasCounting = sessions.some((session) => COUNTING_DRILLS.includes(session.drill));
  const weakSpots = useMemo(() => {
    const rows: { drill: DrillType; href: string; category: string; accuracy: number; total: number }[] = [];
    for (const { drill, href, categories } of WEAK_SPOT_DRILLS) {
      const totals = sessions
        .filter((session) => session.drill === drill)
        .flatMap((session) => Object.entries(session.categories ?? {}))
        .reduce<Record<string, { correct: number; total: number }>>((all, [name, value]) => {
          const key = categories.find((category) => name === category || name.startsWith(category));
          if (!key) return all;
          all[key] ??= { correct: 0, total: 0 };
          all[key].correct += value.correct;
          all[key].total += value.total;
          return all;
        }, {});
      for (const [category, { correct, total }] of Object.entries(totals)) {
        if (total < 3) continue;
        rows.push({ drill, href, category, accuracy: correct / total, total });
      }
    }
    return rows.sort((a, b) => a.accuracy - b.accuracy).slice(0, 6);
  }, [sessions]);
  const practiceWeakSpot = (row: (typeof weakSpots)[number]) => {
    setPracticeFocus(row.drill, row.category);
    router.push(row.href);
  };

  return (
    <div className="mx-auto min-w-0 max-w-5xl">
      <PageHeader eyebrow="Mastery check" title="Counting Benchmark" description="Four targets that show your count is ready for a real table. Each uses your most recent qualifying session of that drill." />
      {!hasCounting && (
        <EmptyState
          className="mb-6"
          icon="fa-medal"
          title="No counting sessions yet"
          description="Run any counting drill and your results appear here automatically. The starter session takes about a minute."
          action={<ButtonLink href="/training/running-count?session=starter">Start the starter drill</ButtonLink>}
        />
      )}
      {/* Phones read the tally, then the targets, then Test Out; wide screens put the targets on the right. */}
      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
        <Panel className="lg:col-start-1 lg:row-start-1">
          <p className="text-[.7rem] font-semibold uppercase tracking-[.08em] text-[var(--ink-muted)]">Targets met</p>
          <p className="mt-1 font-data text-4xl font-semibold text-[var(--ink)]">{met} <span className="text-lg text-[var(--ink-muted)]">of {details.length}</span></p>
          <ol className="mt-3 grid grid-cols-4 gap-1.5" aria-label={`${met} of ${details.length} targets met`}>
            {details.map((detail) => <li key={detail.label} title={detail.label} className={`h-2 rounded-full ${detail.met ? "bg-[var(--accent)]" : "bg-overlay/[.1]"}`}><span className="sr-only">{detail.label}: {detail.met ? "met" : "not yet"}</span></li>)}
          </ol>
          <p className="mt-3 text-xs leading-5 text-[var(--ink-muted)]">A warm-up never removes a target: runs shorter than a full deck, or under 10 questions, do not count.</p>
        </Panel>
        <Panel className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <PanelHeader title="Targets" description="Practise opens the drill already set up for that target." />
          <ol className="grid gap-3">
            {details.map((detail, index) => <TargetRow key={detail.label} detail={detail} next={index === nextIndex} />)}
          </ol>
        </Panel>
        <div className="lg:col-start-1 lg:row-start-2">
          {met === details.length ? (
            <Callout tone="good" title="All four targets met." action={<ButtonLink href="/training/test-out">Take the Test Out exam</ButtonLink>}>
              Confirm it under exam conditions.
            </Callout>
          ) : (
            <Panel>
              <PanelHeader title="Test Out" description="A timed exam across every skill, scored section by section." />
              <ButtonLink href="/training/test-out" variant="quiet" className="w-full">Open Test Out</ButtonLink>
            </Panel>
          )}
        </div>
      </div>
      <Panel className="mt-5">
        <PanelHeader title="Weak spots" description="Your lowest-scoring categories across saved sessions (3 or more answers each). Pick one to drill it next." />
        {weakSpots.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {weakSpots.map((row) => {
              const percent = Math.round(row.accuracy * 100);
              const label = countingCategoryLabel(row.category);
              return (
                <button key={`${row.drill}:${row.category}`} type="button" onClick={() => practiceWeakSpot(row)} className="pressable grid min-h-11 gap-2 rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-4 text-left outline-none hover:border-[var(--ink-muted)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--ink)]">{label}</span>
                      <span className="text-xs text-[var(--ink-muted)]">{row.drill} · {row.total} seen</span>
                    </span>
                    <span className="font-data font-semibold text-[var(--warning)]">{percent}%</span>
                  </span>
                  <span aria-hidden="true"><ProgressMeter label={`${label}: ${percent}% correct`} value={percent} max={100} tone="warn" /></span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-[var(--rule)] p-4 text-sm text-[var(--ink-muted)]">No weak spots yet. They appear once a category has 3 or more answers.</p>
        )}
      </Panel>
    </div>
  );
}
