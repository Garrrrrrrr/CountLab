"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChecklistEntry, evaluateChecklist } from "@/lib/blackjack/practiceChecklist";
import { checklistStore } from "@/lib/blackjack/practiceChecklistStore";
import { storage } from "@/lib/statistics/storage";
import { computeStreak } from "@/lib/statistics/streaks";
import { Panel } from "@/components/ui";
import { analytics } from "@/lib/analytics";

/** Groups entries under the source routine's own section headings, in order. */
function bySection(items: ChecklistEntry[]): { section: string; entries: ChecklistEntry[] }[] {
  const groups: { section: string; entries: ChecklistEntry[] }[] = [];
  for (const entry of items) {
    const last = groups.at(-1);
    if (last && last.section === entry.item.section) last.entries.push(entry);
    else groups.push({ section: entry.item.section, entries: [entry] });
  }
  return groups;
}

const progressLabel = (entry: ChecklistEntry) =>
  entry.item.unit === "hands"
    ? `${entry.current} / ${entry.target} hands`
    : `${entry.current} / ${entry.target}`;

export function PracticeChecklist() {
  // Session history and ticks are both read after mount: this is a static
  // export, so touching localStorage during render would break hydration.
  const [sessions, setSessions] = useState<ReturnType<typeof storage.sessions>>([]);
  const [ticks, setTicks] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const load = () => {
      setSessions(storage.sessions());
      setTicks(checklistStore.ticks());
      setReady(true);
    };
    load();
    // Finishing a drill dispatches this, so the checklist fills in live.
    addEventListener("hilo-storage", load);
    return () => removeEventListener("hilo-storage", load);
  }, []);

  useEffect(() => {
    analytics.track("feature_opened", { feature: "practice_checklist", category: "training" });
  }, []);

  const day = useMemo(() => evaluateChecklist(sessions, ticks), [sessions, ticks]);
  const streakDays = useMemo(() => computeStreak(sessions).currentStreakDays, [sessions]);

  const toggle = useCallback((id: string) => {
    setTicks(checklistStore.toggle(id));
  }, []);

  const pct = Math.round((day.completed / day.total) * 100);
  const allDone = day.completed === day.total;

  return (
    <>
      <div className="mb-5 sm:mb-7">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">Daily practice</p>
        <h1 className="mt-2 text-3xl font-semibold">Today&rsquo;s checklist</h1>
        <p className="mt-2 max-w-2xl text-zinc-400">
          A day&rsquo;s work, in order. Items that measure a drill fill in by themselves as you
          practise &mdash; the rest happen away from the screen, so tick those yourself. Everything
          resets at midnight UTC.
        </p>
      </div>

      <Panel className="mb-5">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <b className="text-3xl">{ready ? `${day.completed} / ${day.total}` : "—"}</b>
          <span className="text-zinc-400">{ready ? `${pct}% of today done` : "Loading…"}</span>
          {streakDays > 0 && (
            <span className="text-amber-200">
              <i className="fa-solid fa-fire mr-1.5 text-amber-300" aria-hidden="true" />
              {streakDays}-day streak
            </span>
          )}
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-white/[.07]"
          role="progressbar"
          aria-valuenow={day.completed}
          aria-valuemin={0}
          aria-valuemax={day.total}
          aria-label="Checklist completion"
        >
          <div
            className="h-full rounded-full bg-emerald-400 transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        {allDone && ready && (
          <p className="mt-3 text-sm text-emerald-300">
            Everything done for today. Anything past this point is a bonus.
          </p>
        )}
      </Panel>

      <div className="space-y-5">
        {bySection(day.items).map((group) => (
          <Panel key={group.section}>
            <h2 className="text-lg font-semibold">{group.section}</h2>
            <ul className="mt-3 space-y-2">
              {group.entries.map((entry) => {
                const { item } = entry;
                const manual = item.kind === "manual";
                return (
                  <li
                    key={item.id}
                    className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border p-3 ${
                      entry.done
                        ? "border-emerald-500/40 bg-emerald-500/[.08]"
                        : "border-white/[.07] bg-black/20"
                    }`}
                  >
                    {manual ? (
                      <input
                        type="checkbox"
                        checked={entry.done}
                        onChange={() => toggle(item.id)}
                        aria-label={item.label}
                        className="h-5 w-5 shrink-0 accent-emerald-400"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[.6rem] ${
                          entry.done ? "bg-emerald-400 text-[#10200f]" : "border border-white/15 text-transparent"
                        }`}
                      >
                        <i className="fa-solid fa-check" />
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${entry.done ? "text-emerald-200" : "text-zinc-100"}`}>
                        {item.label}
                        {manual && (
                          <span className="ml-2 rounded-full border border-white/10 px-2 py-px text-[.6rem] uppercase tracking-[.12em] text-zinc-500">
                            Off-app
                          </span>
                        )}
                      </p>
                      {item.detail && <p className="mt-0.5 text-xs leading-5 text-zinc-500">{item.detail}</p>}
                      {!manual && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-white/[.07]">
                            <div
                              className="h-full rounded-full bg-emerald-400/80"
                              style={{ width: `${Math.round((entry.current / entry.target) * 100)}%` }}
                            />
                          </div>
                          <span className="shrink-0 font-mono text-[.68rem] text-zinc-500">
                            {progressLabel(entry)}
                          </span>
                        </div>
                      )}
                    </div>

                    {item.href && !entry.done && (
                      <Link
                        href={item.href}
                        className="pressable shrink-0 rounded-xl border border-white/[.09] bg-white/[.055] px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-white/[.1]"
                      >
                        Practise
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        ))}
      </div>

      <p className="mt-5 text-xs leading-5 text-zinc-500">
        Training routine adapted from Blackjack Apprenticeship&rsquo;s Card-Counting Motivator
        Checklist (2019). Daily targets for the full shoe and true count sets are CountLab&rsquo;s
        own &mdash; the original prescribes no number for those. Off-app items are recorded on this
        device only; drill progress follows your account.
      </p>
    </>
  );
}
