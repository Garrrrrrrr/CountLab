"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWakeLock } from "@/lib/pwa/useWakeLock";
import { ConfirmModal } from "./ConfirmModal";
import { ExamReport } from "./ExamReport";
import { QuestionStage, ShoeStage, formatClock } from "./ExamStages";
import { Heading } from "./DrillKit";
import { Badge, Button, GhostButton, NumberField, Panel, Section, Select, Switch } from "./ui";
import { CUSTOM_EXAM_ID, customExamConfig, examPresets } from "@/lib/blackjack/examPresets";
import {
  EXAM_SECTIONS,
  enabledSections,
  examToSession,
  gradeExam,
  sectionMeta,
  summariseRules,
  validateExamConfig,
  type ExamConfig,
  type ExamResult,
  type ExamSectionId,
  type SectionRun,
} from "@/lib/blackjack/testOut";
import { storage } from "@/lib/statistics/storage";
import { track } from "@/lib/analytics/track";
import { analytics } from "@/lib/analytics";

type Phase = "setup" | "gate" | "running" | "done";

const DECK_OPTIONS = [1, 2, 4, 6, 8];
const PENETRATION_OPTIONS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85];

/** Total clock for the enabled sections, or null when any of them is untimed. */
function totalSeconds(config: ExamConfig): number | null {
  const active = enabledSections(config);
  if (active.some((section) => section.timeLimitSeconds === null)) return null;
  return active.reduce((sum, section) => sum + (section.timeLimitSeconds ?? 0), 0);
}

function summarise(config: ExamConfig): string {
  const active = enabledSections(config);
  if (active.length === 0) return "No sections enabled.";
  const questions = active
    .filter((section) => sectionMeta(section.id).unit === "questions")
    .reduce((sum, section) => sum + section.questions, 0);
  const rounds = active
    .filter((section) => sectionMeta(section.id).unit === "rounds")
    .reduce((sum, section) => sum + section.questions, 0);
  const size = [
    questions ? `${questions} question${questions === 1 ? "" : "s"}` : "",
    rounds ? `${rounds} round${rounds === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" plus ");
  const clock = totalSeconds(config);
  const timing = clock === null ? "untimed" : `up to ${formatClock(clock)}`;
  const plural = active.length === 1 ? "section" : "sections";
  return `${active.length} ${plural} · ${size} · ${timing} · pass at ${config.overallPassAccuracy}% overall with every section above its own floor`;
}

export default function TestOut() {
  const [settings] = useState(() => storage.settings());
  const [presets] = useState(() => examPresets(settings));
  const [presetId, setPresetId] = useState(presets[0].id);
  const [config, setConfig] = useState<ExamConfig>(presets[0]);
  const [phase, setPhase] = useState<Phase>("setup");
  const [stageIndex, setStageIndex] = useState(0);
  const [runs, setRuns] = useState<SectionRun[]>([]);
  const [result, setResult] = useState<ExamResult>();
  const [confirmingAbandon, setConfirmingAbandon] = useState(false);
  const startedAt = useRef(0);

  const active = phase === "running" || phase === "gate";
  useWakeLock(active);
  const stages = useMemo(() => enabledSections(config), [config]);
  const problems = useMemo(() => validateExamConfig(config), [config]);
  const stage = stages[stageIndex];

  // An exam deliberately does not autosave: every other drill resumes where it
  // left off, but a resumable exam would let anyone dodge a section's clock by
  // closing the tab. Warn on the way out instead.
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [active]);

  const choosePreset = (id: string) => {
    setPresetId(id);
    setConfig(id === CUSTOM_EXAM_ID ? customExamConfig(settings) : presets.find((preset) => preset.id === id)!);
  };

  /** Any edit moves the exam off its preset, so a custom run is never recorded under a preset's name. */
  const edit = (next: ExamConfig) => {
    setConfig(presetId === CUSTOM_EXAM_ID
      ? next
      : { ...next, id: CUSTOM_EXAM_ID, name: "Custom exam", description: "Your own sections, lengths, clocks, and pass marks." });
    if (presetId !== CUSTOM_EXAM_ID) setPresetId(CUSTOM_EXAM_ID);
  };

  const editSection = (id: ExamSectionId, changes: Partial<ExamConfig["sections"][number]>) =>
    edit({ ...config, sections: config.sections.map((section) => (section.id === id ? { ...section, ...changes } : section)) });

  const start = () => {
    if (problems.length) return;
    setRuns([]);
    setStageIndex(0);
    setResult(undefined);
    startedAt.current = Date.now();
    setPhase("gate");
    // `preset` lands in practice_started.mode, which is where the analytics
    // contract records which variant of a drill was run.
    track("drill_started", {
      drill: "Test Out",
      preset: config.id,
      decks: config.rules.decks,
      penetration: config.rules.penetration,
      dealerRule: config.rules.dealerHitsSoft17 ? "H17" : "S17",
      questionTarget: stages.reduce((sum, section) => sum + section.questions, 0),
    });
  };

  const completeStage = (run: SectionRun) => {
    const collected = [...runs, run];
    setRuns(collected);
    const next = stageIndex + 1;
    if (next >= stages.length) {
      const graded = gradeExam(config, collected);
      const session = examToSession(graded);
      storage.addSession(session);
      setResult(graded);
      setPhase("done");
      return;
    }
    setStageIndex(next);
    setPhase("gate");
  };

  const abandon = () => {
    setConfirmingAbandon(false);
    setPhase("setup");
    setRuns([]);
    setStageIndex(0);
    // Nothing is recorded: an abandoned attempt is not a failed one, and
    // writing a zero would poison both the history and the certification.
    analytics.track("feature_abandoned", {
      feature: "test_out",
      category: "training",
      duration_ms: startedAt.current ? Date.now() - startedAt.current : 0,
      stage: stage?.id,
    });
  };

  if (phase === "done" && result) {
    return <ExamReport result={result} onRetake={() => setPhase("setup")} />;
  }

  if (phase === "gate" && stage) {
    const meta = sectionMeta(stage.id);
    const unit = meta.unit === "rounds" ? "round" : "question";
    return <>
      <Heading eyebrow={config.name} title={`Section ${stageIndex + 1} of ${stages.length}`} description="The clock starts when you begin the section. There is no feedback until the exam is finished." />
      <Panel className="max-w-2xl">
        <h2 className="font-display text-2xl font-semibold">{meta.label}</h2>
        <p className="mt-2 text-[var(--ink-muted)]">{meta.description}</p>
        <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-black/20 p-3"><dt className="text-xs text-zinc-500">Length</dt><dd className="mt-1 font-semibold">{stage.questions} {unit}{stage.questions === 1 ? "" : "s"}</dd></div>
          <div className="rounded-xl bg-black/20 p-3"><dt className="text-xs text-zinc-500">Time</dt><dd className="mt-1 font-semibold">{stage.timeLimitSeconds === null ? "Untimed" : formatClock(stage.timeLimitSeconds)}</dd></div>
          <div className="rounded-xl bg-black/20 p-3"><dt className="text-xs text-zinc-500">Pass mark</dt><dd className="mt-1 font-semibold">{stage.passAccuracy}%</dd></div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button className="min-h-11" onClick={() => setPhase("running")}>Start {meta.label.toLowerCase()}</Button>
          <GhostButton className="min-h-11" onClick={() => setConfirmingAbandon(true)}>End exam</GhostButton>
        </div>
      </Panel>
      <ConfirmModal open={confirmingAbandon} tone="danger" title="End this attempt?" description="Nothing is recorded and the sections you have finished are discarded." confirmLabel="End attempt" onConfirm={abandon} onCancel={() => setConfirmingAbandon(false)} />
    </>;
  }

  if (phase === "running" && stage) {
    return <>
      <Heading eyebrow={config.name} title={sectionMeta(stage.id).label} description={`Section ${stageIndex + 1} of ${stages.length}. No hints, no pausing, no going back.`} />
      {stage.id === "shoe"
        ? <ShoeStage key={stage.id} section={stage} rules={config.rules} onComplete={completeStage} onAbandon={() => setConfirmingAbandon(true)} />
        : <QuestionStage key={`${stage.id}-${stageIndex}`} section={stage} rules={config.rules} onComplete={completeStage} onAbandon={() => setConfirmingAbandon(true)} />}
      <ConfirmModal open={confirmingAbandon} tone="danger" title="End this attempt?" description="Nothing is recorded and the sections you have finished are discarded." confirmLabel="End attempt" onConfirm={abandon} onCancel={() => setConfirmingAbandon(false)} />
    </>;
  }

  const rules = config.rules;
  return <>
    <Heading
      eyebrow="Proficiency exam"
      title="Test Out"
      description="Prove the whole skill at once. Sections run one after another, each against its own clock and its own pass mark, and a pass certifies you until it lapses."
    />
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-5">
        <Panel>
          <Select label="Exam" value={presetId} onChange={(event) => choosePreset(event.target.value)}>
            {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
            <option value={CUSTOM_EXAM_ID}>Custom exam</option>
          </Select>
          <p className="mt-3 text-sm text-[var(--ink-muted)]">{config.description}</p>
        </Panel>

        <Section icon="fa-table-list" title="Sections" summary={`${enabledSections(config).length} of ${EXAM_SECTIONS.length} enabled`}>
          <div className="space-y-3">
            {config.sections.map((section) => {
              const meta = sectionMeta(section.id);
              return <div key={section.id} className={`rounded-2xl border p-4 ${section.enabled ? "border-[var(--rule)] bg-[var(--paper)]" : "border-transparent bg-black/10 opacity-70"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{meta.label}</h3>
                    <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">{meta.description}</p>
                  </div>
                  <Switch checked={section.enabled} onChange={(enabled) => editSection(section.id, { enabled })} label={`Include ${meta.label}`} />
                </div>
                {section.enabled && <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {/* Every section repeats these three fields, so each label names its
                      section — otherwise nothing but visual position tells a screen
                      reader which "Questions" field it has landed on. */}
                  <NumberField
                    label={`${meta.label} ${meta.unit === "rounds" ? "rounds" : "questions"}`}
                    value={section.questions}
                    min={1}
                    max={meta.unit === "rounds" ? 20 : 100}
                    onValueChange={(questions) => editSection(section.id, { questions })}
                  />
                  <NumberField
                    label={`${meta.label} time limit (seconds)`}
                    value={section.timeLimitSeconds ?? 0}
                    min={0}
                    max={3600}
                    onValueChange={(seconds) => editSection(section.id, { timeLimitSeconds: seconds === 0 ? null : seconds })}
                  />
                  <NumberField
                    label={`${meta.label} pass mark (%)`}
                    value={section.passAccuracy}
                    min={0}
                    max={100}
                    onValueChange={(passAccuracy) => editSection(section.id, { passAccuracy })}
                  />
                </div>}
              </div>;
            })}
            <p className="text-xs text-[var(--ink-muted)]">A time limit of 0 runs the section untimed. Questions the clock swallows are scored as wrong.</p>
          </div>
        </Section>

        <Section icon="fa-sliders" title="Table rules" summary={summariseRules(rules)}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select label="Shoe" value={rules.decks} onChange={(event) => edit({ ...config, rules: { ...rules, decks: +event.target.value } })}>
              {DECK_OPTIONS.map((decks) => <option key={decks} value={decks}>{decks} decks</option>)}
            </Select>
            <Select label="Dealer on soft 17" value={rules.dealerHitsSoft17 ? "h17" : "s17"} onChange={(event) => edit({ ...config, rules: { ...rules, dealerHitsSoft17: event.target.value === "h17" } })}>
              <option value="h17">Hits (H17)</option>
              <option value="s17">Stands (S17)</option>
            </Select>
            <Select label="Penetration" value={rules.penetration} onChange={(event) => edit({ ...config, rules: { ...rules, penetration: +event.target.value } })}>
              {PENETRATION_OPTIONS.map((value) => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}
            </Select>
            <Select label="True-count rounding" value={rules.rounding} onChange={(event) => edit({ ...config, rules: { ...rules, rounding: event.target.value as typeof rules.rounding } })}>
              <option value="floor">Floor</option>
              <option value="truncate">Truncate</option>
              <option value="nearest">Nearest</option>
            </Select>
            <Select label="Deck resolution" value={rules.deckResolution} onChange={(event) => edit({ ...config, rules: { ...rules, deckResolution: +event.target.value as typeof rules.deckResolution } })}>
              <option value="1">Full deck</option>
              <option value="0.5">Half deck</option>
              <option value="0.25">Quarter deck</option>
            </Select>
            <Select label="Bet spread" value={rules.spread} onChange={(event) => edit({ ...config, rules: { ...rules, spread: event.target.value as typeof rules.spread } })}>
              {(["1-4", "1-8", "1-12"] as const).map((spread) => <option key={spread} value={spread}>{spread}</option>)}
            </Select>
            <NumberField label="Betting unit" prefix="$" value={rules.baseBet} min={1} onValueChange={(baseBet) => edit({ ...config, rules: { ...rules, baseBet } })} />
            <NumberField label="Player spots" value={rules.spots} min={1} max={7} onValueChange={(spots) => edit({ ...config, rules: { ...rules, spots } })} />
            <div className="grid gap-2 sm:col-span-2 lg:col-span-3 sm:grid-cols-2 lg:grid-cols-4">
              <Switch checked={rules.doubleAfterSplit} onChange={(doubleAfterSplit) => edit({ ...config, rules: { ...rules, doubleAfterSplit } })} label="Double after split" />
              <Switch checked={rules.resplitAces} onChange={(resplitAces) => edit({ ...config, rules: { ...rules, resplitAces } })} label="Resplit aces" />
              <Switch checked={rules.lateSurrender} onChange={(lateSurrender) => edit({ ...config, rules: { ...rules, lateSurrender } })} label="Late surrender" />
              <Switch checked={rules.wongOutNegative} onChange={(wongOutNegative) => edit({ ...config, rules: { ...rules, wongOutNegative } })} label="Bet $0 at negative counts" />
            </div>
          </div>
          <p className="mt-4 text-xs text-[var(--ink-muted)]">These rules decide the right answers. They start from your training settings and do not change them.</p>
        </Section>

        <Section icon="fa-award" title="Passing and certification" summary={`${config.overallPassAccuracy}% overall · valid ${config.validDays} days`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Overall pass mark (%)" value={config.overallPassAccuracy} min={0} max={100} onValueChange={(overallPassAccuracy) => edit({ ...config, overallPassAccuracy })} />
            <NumberField label="Certification valid for (days)" value={config.validDays} min={1} max={365} onValueChange={(validDays) => edit({ ...config, validDays })} />
          </div>
          <p className="mt-4 text-xs text-[var(--ink-muted)]">Both bars have to clear: the overall score and every enabled section&apos;s own floor. An average alone would let a strong count hide a weak index game.</p>
        </Section>
      </div>

      <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <Panel>
          <h2 className="font-display text-lg font-semibold">{config.name}</h2>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">{summarise(config)}</p>
          <ul className="mt-4 space-y-2">
            {enabledSections(config).map((section, order) => <li key={section.id} className="flex items-center justify-between gap-2 rounded-xl bg-black/20 px-3 py-2 text-sm">
              <span className="truncate"><span className="text-zinc-500">{order + 1}.</span> {sectionMeta(section.id).label}</span>
              <Badge tone="cold">{section.questions}{sectionMeta(section.id).unit === "rounds" ? "R" : "Q"}</Badge>
            </li>)}
          </ul>
          {problems.length > 0 && <ul className="mt-4 space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            {problems.map((problem) => <li key={`${problem.field}:${problem.message}`}>{problem.message}</li>)}
          </ul>}
          <Button className="mt-5 min-h-11 w-full" disabled={problems.length > 0} onClick={start}>Start exam</Button>
          <p className="mt-3 text-xs leading-5 text-[var(--ink-muted)]">
            No hints, no pausing, and no feedback until the end. Progress is not saved — leaving this page ends the attempt without recording it.
          </p>
        </Panel>
      </div>
    </div>
  </>;
}
