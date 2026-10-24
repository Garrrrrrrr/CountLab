"use client";
import { useEffect, useId, useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import { defaultCvcxTemplateName, type CvcxTemplate } from "@/lib/blackjack/cvcxLibrary";
import { normalizeConfig, toTemplateConfig, uniqueName } from "@/lib/blackjack/labConfig";
import { labBlocker } from "@/lib/blackjack/labModel";
import { Button, ButtonLink, Sheet, TextField } from "@/components/ui";
import { Note } from "./parts";
import type { Calc } from "./useCalculator";

const MAX_SCENARIOS = 20;

/** "Log a session with this game": the Journal opens its log form prefilled from the saved scenario. */
export function JournalLink({ template, className }: { template: CvcxTemplate; className?: string }) {
  const blocked = labBlocker(normalizeConfig(template.config), "journal");
  if (blocked) return <Note className={className}>The Journal {blocked.reason.charAt(0).toLowerCase() + blocked.reason.slice(1)}</Note>;
  return (
    <ButtonLink href={`/journal?scenario=${encodeURIComponent(template.id)}`} variant="secondary" size="sm" className={className} icon={<BookOpen size={15} aria-hidden />}>
      Log a session with this game
    </ButtonLink>
  );
}

/**
 * Saves the page as a scenario, or updates the open one. The dialog keeps its
 * name ("Save scenario") through the success view so it is always found the
 * same way.
 */
export function SaveSheet({ calc, open, onClose }: { calc: Calc; open: boolean; onClose: () => void }) {
  const formId = useId();
  const savedHeading = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<CvcxTemplate | null>(null);
  const { active, templates } = calc;

  // Each opening starts from the open scenario's name.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setName(active?.name ?? calc.draftName); setSaved(null); }
  }
  useEffect(() => { if (saved) savedHeading.current?.focus(); }, [saved]);

  const placeholder = defaultCvcxTemplateName(toTemplateConfig(calc.config));
  const typed = name.trim() || placeholder;
  const updating = active !== null && templates.some((template) => template.id === active.id);
  const newName = uniqueName(typed, templates.map((template) => template.name));
  const oldest = templates.length >= MAX_SCENARIOS ? templates.at(-1) : undefined;
  const save = (mode: "new" | "update") => setSaved(calc.saveScenario(mode === "update" ? name.trim() || active!.name : newName, mode));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Save scenario"
      size="sm"
      footer={saved ? (
        <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Done</Button></div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {updating && <Button variant="secondary" onClick={() => save("new")}>Save as new</Button>}
          <Button type="submit" form={formId}>{updating ? `Update “${active!.name}”` : "Save"}</Button>
        </div>
      )}
    >
      {saved ? (
        <div>
          <h3 ref={savedHeading} tabIndex={-1} className="text-lg font-semibold outline-none">Saved “{saved.name}”</h3>
          <p className="mt-1 text-sm leading-6 text-ink-2">Find it under Scenarios to load, rename or compare it. Later changes here are kept only when you save again.</p>
          <JournalLink template={saved} className="mt-4" />
        </div>
      ) : (
        <form id={formId} onSubmit={(event) => { event.preventDefault(); save(updating ? "update" : "new"); }}>
          <TextField label="Scenario name" value={name} onChange={(event) => setName(event.target.value)} placeholder={placeholder} data-analytics-field="scenario_name" maxLength={80} />
          <Note className="mt-2">Saves the game, bankroll, bet ramp, hands and trip length on this page.</Note>
          {updating && (
            <Note className="mt-2"><b className="text-ink">Update</b> replaces “{active!.name}”, and links to it open the new version. <b className="text-ink">Save as new</b> keeps it and saves a copy named “{newName}”.</Note>
          )}
          {!updating && newName !== typed && name.trim() && (
            <p className="mt-2 text-xs leading-5 text-warn">You already have a scenario named “{typed}”. This one will be saved as “{newName}”.</p>
          )}
          {oldest && (
            <p className="mt-2 text-xs leading-5 text-warn">You have {MAX_SCENARIOS} saved scenarios, the most kept. Saving a new one removes the oldest, “{oldest.name}”.</p>
          )}
        </form>
      )}
    </Sheet>
  );
}
