"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Heading } from "./DrillKit";
import { Badge, Button, DataTable, GhostButton, Metric, Panel } from "./ui";
import { formatClock } from "./ExamStages";
import { sectionMeta, summariseRules, type ExamResult, type SectionResult } from "@/lib/blackjack/testOut";
import { setPracticeFocus } from "@/lib/statistics/spacedRepetition";
import type { Mistake } from "@/lib/statistics/storage";
import Link from "next/link";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

interface SectionRow extends SectionResult {
  id: string;
}

/**
 * The end-of-exam report.
 *
 * `SessionSummary` is the shared end-of-drill screen, but it has no notion of a
 * pass, a per-section floor, or a certification date, so the exam gets its own
 * report rather than bending that one out of shape for a single caller.
 */
export function ExamReport({ result, onRetake }: { result: ExamResult; onRetake: () => void }) {
  const router = useRouter();
  const { config } = result;
  const passed = result.overallPassed;
  const expiresAt = useMemo(
    () => new Date(Date.now() + config.validDays * 24 * 60 * 60 * 1000).toISOString(),
    [config.validDays],
  );

  const rows: SectionRow[] = result.sections.map((section) => ({ ...section, id: section.section }));

  /** Send the taker to the drill for a failed section, focused on their worst category there. */
  const practise = (section: SectionResult) => {
    const meta = sectionMeta(section.section);
    const weakest = Object.entries(section.categories)
      .filter(([, value]) => value.total > 0)
      .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total)[0];
    if (weakest) setPracticeFocus(meta.drill, weakest[0]);
    router.push(meta.href);
  };

  const mistakesBySection = result.sections
    .map((section) => ({ label: section.label, mistakes: section.mistakes }))
    .filter((group) => group.mistakes.length > 0);

  return <>
    <Heading
      eyebrow={config.name}
      title={passed ? "Passed" : "Not yet"}
      description={passed
        ? `Certified on ${summariseRules(config.rules)} until ${formatDate(expiresAt)}.`
        : "Every section has to clear its own floor as well as the overall bar. The sections below show which ones did not."}
    />

    <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
      <div className="space-y-3">
        <Panel className={passed ? "border-emerald-400/40 bg-emerald-400/[.08]" : "border-amber-400/40 bg-amber-400/[.08]"}>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--ink-muted)]">Verdict</p>
          <p className={`font-display mt-2 text-4xl font-semibold ${passed ? "text-emerald-300" : "text-amber-300"}`}>
            {passed ? "Pass" : "Not yet"}
          </p>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            {result.correct} of {result.questions} correct · needed {config.overallPassAccuracy}%
          </p>
        </Panel>
        <Metric label="Overall accuracy" value={`${result.accuracy}%`} />
        <Metric label="Time taken" value={formatClock(Math.round(result.elapsedMs / 1000))} />
        <Metric label="Best streak" value={result.bestStreak} />
        {passed && <Metric label="Certified until" value={formatDate(expiresAt)} sub={`${config.validDays} days`} />}
        <div className="grid gap-2">
          <Button className="min-h-11 w-full" onClick={onRetake}>{passed ? "Take another exam" : "Retake"}</Button>
          <GhostButton className="min-h-11 w-full" onClick={() => router.push("/statistics")}>View history</GhostButton>
        </div>
      </div>

      <div className="space-y-5">
        <Panel>
          <h2 className="font-display text-lg font-semibold">Section by section</h2>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">A section passes only when it clears its own floor. Questions the clock swallowed count as wrong.</p>
          <div className="mt-4">
            <DataTable
              caption="Exam sections"
              rows={rows}
              columns={[
                { label: "Section", render: (row) => <span className="font-medium">{row.label}</span> },
                { label: "Score", render: (row) => `${row.correct} / ${row.questions}` },
                { label: "Accuracy", render: (row) => `${row.accuracy}%` },
                { label: "Floor", render: (row) => `${row.passAccuracy}%` },
                { label: "Time", render: (row) => formatClock(Math.round(row.elapsedMs / 1000)) + (row.timedOut ? " (out of time)" : "") },
                {
                  label: "Result",
                  render: (row) => <Badge tone={row.passed ? "cold" : "hot"}>{row.passed ? "Met" : "Missed"}</Badge>,
                },
              ]}
            />
          </div>
        </Panel>

        {result.failedSections.length > 0 && <Panel>
          <h2 className="font-display text-lg font-semibold">What to practise</h2>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">Each link opens the drill for that skill, focused on the category you scored worst in.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {result.sections.filter((section) => !section.passed).map((section) => <button
              key={section.section}
              type="button"
              onClick={() => practise(section)}
              className="pressable flex min-h-11 items-center justify-between gap-3 rounded-xl bg-black/20 p-4 text-left hover:bg-white/[.06]"
            >
              <span>
                <span className="block text-sm font-medium">{section.label}</span>
                <span className="text-xs text-[var(--ink-muted)]">{section.accuracy}% against a {section.passAccuracy}% floor</span>
              </span>
              <span className="text-emerald-400" aria-hidden="true">→</span>
            </button>)}
          </div>
        </Panel>}

        {mistakesBySection.map((group) => <Panel key={group.label}>
          <h2 className="font-display text-lg font-semibold">{group.label} — {group.mistakes.length} missed</h2>
          <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
            {group.mistakes.map((mistake: Mistake, index: number) => <li key={index} className="rounded-xl bg-black/20 p-3 text-sm">
              <p className="font-medium">{mistake.question}</p>
              <p className="mt-1 text-[var(--ink-muted)]">
                You said <b className="text-amber-300">{mistake.userAnswer}</b> · correct <b className="text-emerald-300">{mistake.correctAnswer}</b>
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">{mistake.explanation}</p>
            </li>)}
          </ul>
        </Panel>)}

        {mistakesBySection.length === 0 && <Panel>
          <p className="text-sm text-[var(--ink-muted)]">No mistakes to review — every question you were shown was correct.</p>
        </Panel>}

        <p className="text-xs text-[var(--ink-muted)]">
          Graded on {summariseRules(config.rules)}. Certifications and lapses are listed on the <Link className="text-emerald-400 hover:underline" href="/practice">practice hub</Link>.
        </p>
      </div>
    </div>
  </>;
}
