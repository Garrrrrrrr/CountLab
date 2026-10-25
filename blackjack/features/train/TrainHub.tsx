"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarClock, Camera, CircleCheck, Play } from "lucide-react";
import { ButtonLink, PageHeader } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { useSessions } from "@/lib/hooks/useSessions";
import { useSettings } from "@/lib/hooks/useSettings";
import { DRILLS } from "@/lib/routes";
import { storage } from "@/lib/statistics/storage";
import { rulesFromSettings, rulesSummary, type TableRules } from "@/lib/strategy";
import { reviewDueCounts } from "@/lib/strategy-drills/review";
import { DRILL_ICON, DRILL_TYPE, READY_AT, drillStats, suggestNext, timeAgo, type DrillStats } from "./drillMeta";

const GROUPS = [
  { skill: "count", title: "Count", sub: "Keep the count, read the tray, convert to a true count." },
  { skill: "play", title: "Play", sub: "Basic strategy and the index plays that change it." },
] as const;

/** Unfinished sessions saved in the last week, newest first. */
function useUnfinished() {
  const [unfinished, setUnfinished] = useState<{ slug: string; updatedAt: string }[]>([]);
  useEffect(() => {
    const week = Date.now() - 7 * 86_400_000;
    setUnfinished(DRILLS.flatMap((drill) => {
      const progress = storage.progress(DRILL_TYPE[drill.slug]);
      return progress && new Date(progress.updatedAt).getTime() > week ? [{ slug: drill.slug, updatedAt: progress.updatedAt }] : [];
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }, []);
  return unfinished;
}

/** Missed hands, indices and chart cells due for review, by drill slug. Read after mount: the schedule lives in this browser's storage. */
function useReviewDue(rules: TableRules, sessions: unknown) {
  const [due, setDue] = useState<Partial<Record<string, number>>>({});
  const rulesKey = JSON.stringify(rules);
  useEffect(() => {
    const refresh = () => setDue(reviewDueCounts(JSON.parse(rulesKey) as TableRules));
    refresh();
    window.addEventListener("hilo-storage", refresh);
    return () => window.removeEventListener("hilo-storage", refresh);
  }, [rulesKey, sessions]);
  return due;
}

export function TrainHub() {
  const sessions = useSessions();
  const { settings } = useSettings();
  const due = useReviewDue(rulesFromSettings(settings), sessions);
  const stats = useMemo(() => drillStats(sessions), [sessions]);
  const unfinished = useUnfinished();
  const resume = unfinished[0] && DRILLS.find((drill) => drill.slug === unfinished[0].slug);
  const next = suggestNext(stats);
  const fullShoe = stats.find((entry) => entry.drill.slug === "full-shoe")!;

  return (
    <div>
      <PageHeader title="Train" sub="Short focused drills, then a full shoe to put them together." />
      <Link href="/settings" className="-mt-2 mb-5 inline-flex min-h-9 items-center gap-2 rounded-lg text-sm text-ink-2 hover:text-ink">
        Your table: <span className="font-mono font-semibold text-ink">{rulesSummary(rulesFromSettings(settings))}</span> <span className="font-semibold text-brand-text">Change</span>
      </Link>

      {resume ? (
        <FocusCard eyebrow="Pick up where you left off" title={resume.name} detail={`Unfinished session from ${timeAgo(unfinished[0].updatedAt)}.`} href={resume.href} action="Continue" slug={resume.slug} />
      ) : (
        <FocusCard eyebrow={next.sessions.length ? "Practise next" : "Start here"} title={next.drill.name}
          detail={next.sessions.length ? `Recent accuracy ${next.recent}%, table-ready at ${READY_AT[next.drill.slug]}%.` : next.drill.blurb}
          href={next.drill.href} action={next.sessions.length ? "Practise" : "Start"} slug={next.drill.slug} />
      )}

      <div className="mt-8 space-y-8">
        {GROUPS.map((group) => (
          <section key={group.skill} aria-labelledby={`group-${group.skill}`}>
            <h2 id={`group-${group.skill}`} className="text-lg font-semibold">{group.title}</h2>
            <p className="mt-0.5 text-sm text-ink-3">{group.sub}</p>
            <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {stats.filter((entry) => entry.drill.skill === group.skill).map((entry) => <li key={entry.drill.slug}><DrillCard stats={entry} due={due[entry.drill.slug]} /></li>)}
            </ul>
          </section>
        ))}
        <section aria-labelledby="group-combined">
          <h2 id="group-combined" className="text-lg font-semibold">Put it together</h2>
          <p className="mt-0.5 text-sm text-ink-3">Count, bet and play a whole shoe at a live table.</p>
          <FullShoeCard stats={fullShoe} />
        </section>
      </div>
    </div>
  );
}

function FocusCard({ eyebrow, title, detail, href, action, slug }: { eyebrow: string; title: string; detail: string; href: string; action: string; slug: string }) {
  const Icon = DRILL_ICON[slug];
  return (
    <div className="card flex flex-col gap-4 overflow-hidden p-4 sm:flex-row sm:items-center sm:p-5">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand text-brand-ink"><Icon size={22} aria-hidden /></span>
        <div className="min-w-0">
          <p className="eyebrow text-brand-text">{eyebrow}</p>
          <p className="mt-0.5 text-lg font-semibold">{title}</p>
          <p className="text-sm leading-5 text-ink-2">{detail}</p>
        </div>
      </div>
      <ButtonLink href={href} size="lg" icon={<Play size={17} aria-hidden />} className="sm:w-auto" block>{action}</ButtonLink>
    </div>
  );
}

function DrillCard({ stats, due }: { stats: DrillStats; due?: number }) {
  const { drill, recent, last, ready } = stats;
  const Icon = DRILL_ICON[drill.slug];
  return (
    <Link href={drill.href} className="card group flex h-full items-start gap-3.5 p-4 transition hover:border-line-strong">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2 transition group-hover:text-brand-text"><Icon size={20} aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-semibold">{drill.name}</span>
          {ready && <CircleCheck size={16} className="text-pos" aria-label="Table-ready" />}
        </span>
        <span className="mt-0.5 block text-sm leading-5 text-ink-2">{drill.blurb}</span>
        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
          {last ? <span className="tnum">{recent}% recently · {timeAgo(last.date)}</span> : <span>Not tried yet</span>}
          {drill.usesTrayPhotos && <span className="inline-flex items-center gap-1"><Camera size={13} aria-hidden /> Real tray photos</span>}
          {Boolean(due) && <span className="inline-flex items-center gap-1 font-semibold text-brand-text"><CalendarClock size={13} aria-hidden /> {due} due for review</span>}
        </span>
      </span>
    </Link>
  );
}

function FullShoeCard({ stats }: { stats: DrillStats }) {
  const { drill, last, recent } = stats;
  return (
    <div className="mt-3 overflow-hidden rounded-[var(--radius)] border border-line bg-felt text-white shadow-1">
      <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
        <div>
          <p className="text-xl font-semibold">{drill.name}</p>
          <p className="mt-1 max-w-xl text-sm leading-6 text-white/75">Coached practice tells you after every bet and play. Checkout stays silent and grades the whole shoe at the end, like a test before you play for real.</p>
          <p className="mt-2 text-xs text-white/60">{last ? `Last shoe ${timeAgo(last.date)} · ${recent}% recently` : "Uses real discard-tray photos so you estimate decks the way you will at a casino."}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:w-64">
          <Link href={`${drill.href}?mode=coached`} className="flex h-12 items-center justify-center rounded-xl bg-white/15 font-semibold backdrop-blur hover:bg-white/25">Coached</Link>
          <Link href={`${drill.href}?mode=checkout`} className={cx("flex h-12 items-center justify-center gap-1.5 rounded-xl bg-brand font-semibold text-brand-ink hover:brightness-105")}>Checkout <ArrowRight size={16} aria-hidden /></Link>
        </div>
      </div>
    </div>
  );
}
