"use client";

import { useEffect, useId, useRef, useState } from "react";
import { defaultCvcxTemplateName, type CvcxTemplate } from "@/lib/blackjack/cvcxLibrary";
import { toTemplateConfig, uniqueName } from "@/lib/blackjack/labConfig";
import { Button, GhostButton, Sheet } from "@/components/ui";
import { ScenarioDestinations } from "./ScenarioLibrary";
import type { Lab } from "./useLab";

const MAX_SCENARIOS = 20;

/**
 * Saves the page as a scenario, or updates the open one, then offers the
 * other tools that can open it. The dialog keeps its name ("Save scenario")
 * through the success view so it is always found the same way.
 */
export function SaveScenario({ lab, open, onClose }: { lab: Lab; open: boolean; onClose: () => void }) {
  const formId = useId();
  const input = useRef<HTMLInputElement>(null);
  const savedHeading = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<CvcxTemplate | null>(null);
  const { active, templates } = lab;

  // Each opening starts from the open scenario's name, or the one a directory hand-off suggested.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setName(active?.name ?? lab.draftName); setSaved(null); }
  }
  useEffect(() => { if (saved) savedHeading.current?.focus(); }, [saved]);

  const taken = templates.map((template) => template.name);
  const typed = name.trim() || defaultCvcxTemplateName(toTemplateConfig(lab.config));
  const updating = active !== null && templates.some((template) => template.id === active.id);
  const newName = uniqueName(typed, taken);
  const renamedCopy = newName !== typed;
  const oldest = templates.length >= MAX_SCENARIOS ? templates.at(-1) : undefined;

  const save = (mode: "new" | "update") => setSaved(lab.saveScenario(mode === "update" ? name.trim() || active!.name : newName, mode));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Save scenario"
      initialFocusRef={input}
      footer={saved ? (
        <div className="flex justify-end"><Button enterAction={false} onClick={onClose}>Done</Button></div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <GhostButton type="button" onClick={onClose}>Cancel</GhostButton>
          {updating && <GhostButton type="button" onClick={() => save("new")}>Save as new</GhostButton>}
          <Button type="submit" form={formId} enterAction={false}>{updating ? `Update “${active!.name}”` : "Save"}</Button>
        </div>
      )}
    >
      {saved ? (
        <div>
          <h3 ref={savedHeading} tabIndex={-1} aria-live="polite" className="font-display text-lg font-semibold outline-none">Saved “{saved.name}”</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">Open it in another planning tool. Each opens this saved copy; later changes here travel only when you update it.</p>
          <p className="mb-2 mt-4 text-[.8rem] font-medium text-[var(--ink-muted)]">Open it in:</p>
          <ScenarioDestinations template={saved} />
        </div>
      ) : (
        <form id={formId} onSubmit={(event) => { event.preventDefault(); save(updating ? "update" : "new"); }}>
          <label className="grid min-w-0 gap-2 text-[.8rem] font-medium tracking-[.01em] text-[var(--ink-muted)]">
            Scenario name
            <input ref={input} value={name} onChange={(event) => setName(event.target.value)} placeholder={defaultCvcxTemplateName(toTemplateConfig(lab.config))} data-analytics-field="scenario_name" maxLength={80} className="field min-h-11 w-full min-w-0 rounded-lg px-3 text-[.9rem] text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)]" />
          </label>
          <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">
            Saves the game, bankroll, bet ramp and hands on this page. Other tools open the saved copy; later changes here travel only when you save again.
          </p>
          {updating && (
            <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">
              <b className="text-[var(--ink)]">Update</b> replaces “{active!.name}”, and links to it open the new version. <b className="text-[var(--ink)]">Save as new</b> keeps it and saves a copy named “{newName}”.
            </p>
          )}
          {!updating && renamedCopy && name.trim() && (
            <p className="mt-2 text-xs leading-5 text-[var(--warning)]">You already have a scenario named “{typed}”. This one will be saved as “{newName}”.</p>
          )}
          {oldest && (
            <p className="mt-2 text-xs leading-5 text-[var(--warning)]">You have {MAX_SCENARIOS} saved scenarios, the most kept. Saving a new one removes the oldest, “{oldest.name}”.</p>
          )}
        </form>
      )}
    </Sheet>
  );
}
