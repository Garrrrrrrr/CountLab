"use client";

import { Callout, GhostButton, PageHeader } from "@/components/ui";
import type { Lab } from "./useLab";

/**
 * The page's purpose, which setup is open (and whether it has changed), and
 * the two library actions. Results are never repeated here.
 */
export function LabHeader({ lab, onOpenLibrary, onOpenSave }: { lab: Lab; onOpenLibrary: () => void; onOpenSave: () => void }) {
  const { active, edited, pristine, templates } = lab;
  return (
    <PageHeader
      eyebrow="Plan & analyze"
      title="Game & Bankroll Lab"
      description={<>Set up a game, your bankroll and your bet ramp.<span className="hidden sm:inline"> See what you&apos;d win per hour, how much it swings, and your risk of going broke.</span></>}
      actions={
        <div className="no-print grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <GhostButton onClick={onOpenLibrary} aria-haspopup="dialog">
            <i className="fa-regular fa-folder-open mr-2" aria-hidden="true" />Scenarios
            {templates.length > 0 && <span className="ml-2 rounded-full border border-[var(--rule)] px-1.5 font-data text-xs text-[var(--ink-muted)]"><span aria-hidden="true">{templates.length}</span><span className="sr-only">, {templates.length} saved</span></span>}
          </GhostButton>
          <GhostButton onClick={onOpenSave} aria-haspopup="dialog" aria-label="Save scenario">
            <i className="fa-regular fa-floppy-disk mr-2" aria-hidden="true" />Save<span className="hidden min-[360px]:inline"> scenario</span>
          </GhostButton>
        </div>
      }
    >
      <div className="mt-3 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--ink-muted)]">
        {active ? (
          <p className="flex min-w-0 items-center gap-2">
            {edited && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--warning)]" />}
            <span className="min-w-0 truncate">Scenario: <b className="font-semibold text-[var(--ink)]">{active.name}</b>{edited && " · edited"}</span>
          </p>
        ) : pristine ? (
          <p>Example setup: a typical 6-deck game. Change anything and the results update.</p>
        ) : (
          <p>Unsaved setup</p>
        )}
        {!pristine && (
          <button type="button" onClick={lab.startOver} className="no-print min-h-11 rounded-md text-sm font-semibold text-[var(--ink)] underline decoration-[var(--rule)] underline-offset-4 outline-none hover:decoration-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] sm:min-h-0">
            Start over
          </button>
        )}
      </div>
    </PageHeader>
  );
}

/** Arrival messages: a game handed over from the directory and a scenario opened by link. */
export function LabNotices({ lab, onOpenLibrary, arrivalDismissed, onDismissArrival }: { lab: Lab; onOpenLibrary: () => void; arrivalDismissed: boolean; onDismissArrival: () => void }) {
  const handoff = lab.directoryHandoff;
  const arrival = lab.arrival;
  const showArrival = !arrivalDismissed && (arrival.status === "loaded" || arrival.status === "missing");
  if (!handoff && !showArrival) return null;
  return (
    <div className="mb-5 grid gap-3">
      {handoff && (
        <div role={handoff.error ? "alert" : "status"}>
          <Callout tone={handoff.error ? "warn" : handoff.title.startsWith("Loaded") ? "good" : "info"} title={handoff.title} onDismiss={lab.dismissDirectoryHandoff}>
            {handoff.detail}
          </Callout>
        </div>
      )}
      {showArrival && (
        <div role="status">
          {arrival.status === "loaded" ? (
            <Callout tone="good" title={`Loaded “${arrival.scenario.name}”.`} onDismiss={onDismissArrival}>
              Changes here don&apos;t alter the saved scenario until you save.
            </Callout>
          ) : (
            <Callout tone="warn" title="That scenario isn't saved on this account or device." onDismiss={onDismissArrival} action={<GhostButton size="compact" onClick={onOpenLibrary}>Open Scenarios</GhostButton>}>
              It may have been deleted, or saved while signed in to another account.
            </Callout>
          )}
        </div>
      )}
    </div>
  );
}
