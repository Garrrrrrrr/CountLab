"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Cloud, CloudOff, Download, FileJson, LoaderCircle, LogOut, Upload, UserRound } from "lucide-react";
import { Button, ButtonLink, ConfirmSheet, PageHeader, Segmented, SelectField, Toggle, toast } from "@/components/ui";
import { applyTheme } from "@/components/shell/ThemeToggle";
import { useSettings } from "@/lib/hooks/useSettings";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { useIsAdmin } from "@/lib/supabase/admin";
import { accountStorage, guestBackup, hasLegacyBackup, legacyBackup } from "@/lib/supabase/accountStorage";
import { storage, type Settings } from "@/lib/statistics/storage";
import { analytics } from "@/lib/analytics";
import { APP_VERSION } from "@/lib/analytics/config";
import { CONTACT_EMAIL } from "@/lib/contact";

function Group({ id, title, sub, children }: { id?: string; title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id ?? title}-heading`} className="scroll-mt-20">
      <h2 id={`${id ?? title}-heading`} className="px-1 text-sm font-semibold text-ink-2">{title}</h2>
      {sub && <p className="mt-0.5 px-1 text-sm leading-5 text-ink-3">{sub}</p>}
      <div className="card mt-2 divide-y divide-line">{children}</div>
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="p-4">{children}</div>;
}

const download = (content: string, type: string, name: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};

const today = () => new Date().toISOString().slice(0, 10);

export function SettingsPage() {
  const { settings, update } = useSettings();
  const isAdmin = useIsAdmin();
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => update({ [key]: value } as Partial<Settings>);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" sub="Changes save as you make them." />
      <div className="space-y-7">
        <AccountGroup />

        <Group title="Table rules" sub="Drills, the full shoe and the charts start from these.">
          <Row>
            <Segmented label="Decks" value={settings.decks} onChange={(decks) => set("decks", decks)}
              options={[1, 2, 4, 6, 8].map((value) => ({ value, label: String(value) }))} />
          </Row>
          <Row>
            <Segmented label="Dealer on soft 17" value={settings.dealerHitsSoft17 ? "h17" : "s17"} onChange={(value) => set("dealerHitsSoft17", value === "h17")}
              options={[{ value: "h17", label: "Hits (H17)" }, { value: "s17", label: "Stands (S17)" }]} />
          </Row>
          <Row>
            <Segmented label="Surrender" value={settings.surrender} onChange={(value) => set("surrender", value)}
              options={[{ value: "none", label: "None" }, { value: "late", label: "Late" }, { value: "early", label: "Early vs 10" }]} />
          </Row>
          <Row><Toggle label="Double after split" checked={settings.doubleAfterSplit} onChange={(value) => set("doubleAfterSplit", value)} /></Row>
          <Row><Toggle label="Resplit aces" checked={settings.resplitAces} onChange={(value) => set("resplitAces", value)} /></Row>
          <Row>
            <SelectField label="Penetration" hint="How much of the shoe is dealt before the shuffle." value={settings.penetration} onChange={(event) => set("penetration", Number(event.target.value))}>
              {[0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.83, 0.85, 0.9].map((value) => <option key={value} value={value}>{Math.round(value * 100)}% dealt</option>)}
            </SelectField>
          </Row>
        </Group>

        <Group title="Counting">
          <Row>
            <Segmented label="True count rounding" value={settings.rounding} onChange={(value) => set("rounding", value)}
              options={[{ value: "floor", label: "Floor" }, { value: "truncate", label: "Truncate" }, { value: "nearest", label: "Nearest" }]} />
            <p className="mt-2 text-xs leading-5 text-ink-3">Floor rounds down: −1.2 becomes −2 and +2.8 becomes +2. Truncate drops the fraction: −1.2 becomes −1. Use the method your indices were built for; floor is the common choice.</p>
          </Row>
          <Row>
            <SelectField label="Card speed" value={settings.speed} onChange={(event) => set("speed", Number(event.target.value))}>
              {[2000, 1500, 1000, 750, 500, 350, 250].map((value) => <option key={value} value={value}>{value >= 1000 ? `${value / 1000} s` : `${value} ms`} per card</option>)}
            </SelectField>
          </Row>
          <Row>
            <Segmented label="Feedback" value={settings.countingFeedback} onChange={(value) => set("countingFeedback", value)}
              options={[{ value: "immediate", label: "After each answer" }, { value: "end", label: "At the end" }]} />
          </Row>
          <Row>
            <Segmented label="Questions per session" value={settings.countingSessionQuestions} onChange={(value) => set("countingSessionQuestions", value)}
              options={[5, 10, 20].map((value) => ({ value: value as 5 | 10 | 20, label: String(value) }))} />
          </Row>
        </Group>

        <Group title="Appearance">
          <Row>
            <Segmented label="Theme" value={settings.theme} onChange={(theme) => { applyTheme(theme); set("theme", theme); }}
              options={[{ value: "system", label: "Device" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
          </Row>
          <Row><Toggle label="Animations" description="Card dealing and screen transitions." checked={settings.animations} onChange={(value) => set("animations", value)} /></Row>
          <Row><Toggle label="Sound" description="A tone after each answer in drills." checked={settings.sound} onChange={(value) => set("sound", value)} /></Row>
          <Row><Toggle label="Keyboard shortcuts" description="H S D P R and number keys in drills, on devices with a keyboard." checked={settings.shortcuts} onChange={(value) => set("shortcuts", value)} /></Row>
        </Group>

        <PrivacyGroup />
        <DataGroup />

        <Group title="About">
          <Row>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <Link href="/terms" className="font-medium text-ink underline-offset-2 hover:underline">Terms of Service</Link>
              <Link href="/privacy" className="font-medium text-ink underline-offset-2 hover:underline">Privacy Policy</Link>
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-ink underline-offset-2 hover:underline">Contact</a>
              {isAdmin && <Link href="/admin" className="font-medium text-brand-text underline-offset-2 hover:underline">Product analytics</Link>}
            </div>
            <p className="mt-2 text-xs text-ink-3">CountLab {APP_VERSION}. For training and education. Gamble responsibly.</p>
          </Row>
        </Group>
      </div>
    </div>
  );
}

function AccountGroup() {
  const { user, syncStatus, signOut, loading } = useAuth();
  const [legacy, setLegacy] = useState(false);
  const [pending, setPending] = useState<{ kind: "guest" | "legacy"; snapshot: string; preview: string; newJournal: number } | "delete" | null>(null);
  useEffect(() => { setLegacy(hasLegacyBackup()); }, []);

  const previewImport = (kind: "guest" | "legacy") => {
    try {
      const snapshot = kind === "guest" ? guestBackup() : legacyBackup();
      const parsed = JSON.parse(snapshot) as { sessions?: unknown[]; local?: Record<string, string> };
      const journalKey = "countlab:journal-sessions:v1";
      const source = JSON.parse(parsed.local?.[journalKey] ?? "null") as { items?: Array<{ id?: string }> } | null;
      const current = JSON.parse(accountStorage.getItem(journalKey) ?? "null") as { items?: Array<{ id?: string }> } | null;
      const existing = new Set(current?.items?.map((item) => item.id) ?? []);
      const ids = new Set(source?.items?.map((item) => item.id).filter((id): id is string => typeof id === "string") ?? []);
      const newJournal = [...ids].filter((id) => !existing.has(id)).length;
      setPending({ kind, snapshot, newJournal, preview: `${parsed.sessions?.length ?? 0} training sessions, ${ids.size} journal sessions (${newJournal} new to this account) and ${Object.keys(parsed.local ?? {}).length} saved collections. Records already in your account are kept.` });
    } catch {
      toast("That history could not be read. Nothing was changed.", "neg");
    }
  };

  const SyncIcon = syncStatus === "error" ? CloudOff : syncStatus === "syncing" ? LoaderCircle : Cloud;
  return (
    <Group id="account" title="Account">
      <Row>
        {loading ? <p className="text-sm text-ink-3">Checking your account…</p> : user ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand/20 text-base font-bold uppercase text-brand-text">{(user.email ?? "?").slice(0, 1)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{user.email}</p>
              <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-ink-2">
                <SyncIcon size={15} aria-hidden className={syncStatus === "syncing" ? "animate-spin" : syncStatus === "error" ? "text-warn" : "text-pos"} />
                {syncStatus === "error" ? "Sync paused. Check your connection; changes are kept on this device." : syncStatus === "syncing" ? "Syncing…" : syncStatus === "synced" ? "Training, journal and settings are synced." : "Not synced yet."}
              </p>
            </div>
            <Button variant="secondary" size="sm" icon={<LogOut size={16} aria-hidden />} onClick={() => void signOut()}>Sign out</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3"><UserRound size={20} aria-hidden /></span>
              <p className="min-w-0 flex-1 text-sm leading-6 text-ink-2">You are using CountLab as a guest. Everything is saved on this device. Sign in to back it up and use it on other devices.</p>
            </div>
            <ButtonLink href="/signin" size="sm" className="self-start sm:self-auto">Sign in</ButtonLink>
          </div>
        )}
      </Row>
      {(user || legacy) && (
        <Row>
          <p className="text-sm font-medium">Bring in other history</p>
          <p className="mt-0.5 text-sm leading-5 text-ink-3">Guest history and your account are kept apart until you choose to merge them.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {user && <Button size="sm" variant="secondary" onClick={() => previewImport("guest")}>Import this device&rsquo;s guest history</Button>}
            {legacy && <Button size="sm" variant="secondary" onClick={() => previewImport("legacy")}>Recover earlier history on this device</Button>}
          </div>
        </Row>
      )}
      {user && (
        <Row>
          <button type="button" className="text-sm font-semibold text-neg underline-offset-2 hover:underline" onClick={() => setPending("delete")}>Request account deletion</button>
        </Row>
      )}
      <ConfirmSheet open={pending !== null && pending !== "delete"} onClose={() => setPending(null)} tone="primary" confirmLabel="Import my history"
        title={pending !== null && pending !== "delete" && pending.kind === "legacy" ? "Recover earlier history?" : "Import guest history?"}
        onConfirm={() => {
          if (!pending || pending === "delete") return;
          try {
            const result = storage.importData(pending.snapshot);
            toast(`Imported ${result.sessions} sessions and ${pending.newJournal} journal entries`, "pos");
          } catch (error) {
            toast(error instanceof Error ? error.message : "Import failed. Nothing was changed.", "neg");
          }
        }}>
        {pending !== null && pending !== "delete" && (
          <>
            {pending.preview}
            {pending.kind === "legacy" && " Older versions did not record who owned this device's copy, so only recover it if it is yours."}
          </>
        )}
      </ConfirmSheet>
      <ConfirmSheet open={pending === "delete"} onClose={() => setPending(null)} title="Request account deletion" confirmLabel="Open email"
        onConfirm={() => {
          location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("CountLab account deletion request")}&body=${encodeURIComponent(`Please delete my CountLab account (${user?.email ?? ""}) and its training, journal and analytics data.\n\nI have exported the data I want to keep.`)}`;
        }}>
        Export a backup first (Data, below). This opens an email to {CONTACT_EMAIL}; your account stays available until the request is processed.
      </ConfirmSheet>
    </Group>
  );
}

function PrivacyGroup() {
  const [enabled, setEnabled] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setEnabled(analytics.isEnabled()); }, []);
  return (
    <Group title="Privacy">
      <Row>
        <Toggle label="Product analytics" description="Privacy-minimized usage data that helps improve drills. No email, notes, passwords or exact bankrolls."
          checked={enabled} onChange={(value) => { setEnabled(value); analytics.setConsent(value, "settings"); }} />
      </Row>
      <Row>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Link href="/privacy" className="font-medium text-ink underline-offset-2 hover:underline">How analytics and storage work</Link>
          <button type="button" disabled={busy} className="font-semibold text-neg underline-offset-2 hover:underline disabled:opacity-50" onClick={() => setConfirm(true)}>
            {busy ? "Deleting…" : "Delete analytics history"}
          </button>
        </div>
      </Row>
      <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} title="Delete analytics history?" confirmLabel="Delete"
        onConfirm={async () => {
          setBusy(true);
          const deleted = await analytics.deleteHistory();
          setBusy(false);
          toast(deleted ? "Analytics history deleted" : "Could not delete it right now. Try again later.", deleted ? "pos" : "neg");
        }}>
        This removes this device&rsquo;s analytics and, if you are signed in, analytics linked to your account. Your training and journal are not touched.
      </ConfirmSheet>
    </Group>
  );
}

function DataGroup() {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ raw: string; count: number } | null>(null);
  return (
    <Group title="Data" sub="A JSON backup holds settings, drill history, the journal, saved calculator scenarios and venues.">
      <Row>
        <div className="grid gap-2 sm:grid-cols-3">
          <Button variant="secondary" icon={<FileJson size={17} aria-hidden />} onClick={() => { download(storage.exportData(), "application/json", `countlab-backup-${today()}.json`); toast("Backup downloaded", "pos"); }}>Export backup</Button>
          <Button variant="secondary" icon={<Upload size={17} aria-hidden />} onClick={() => input.current?.click()}>Import backup</Button>
          <Button variant="secondary" icon={<Download size={17} aria-hidden />} onClick={() => { download(storage.exportCsv(), "text/csv", `countlab-training-${today()}.csv`); toast("CSV downloaded", "pos"); }}>Drill history CSV</Button>
        </div>
        <input ref={input} type="file" accept="application/json,.json" className="hidden" aria-label="Choose a backup file"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            try {
              const raw = await file.text();
              const parsed = JSON.parse(raw);
              if (!Array.isArray(parsed.sessions)) throw new Error("That file is not a CountLab backup.");
              setPending({ raw, count: parsed.sessions.length });
            } catch (error) {
              toast(error instanceof Error ? error.message : "Import failed", "neg");
            }
          }} />
        <p className="mt-3 text-xs leading-5 text-ink-3">The CSV is a spreadsheet summary of drill sessions only. Restore from the JSON backup.</p>
      </Row>
      <ConfirmSheet open={pending !== null} onClose={() => setPending(null)} title="Import this backup?" confirmLabel="Import" tone="primary"
        onConfirm={() => {
          if (!pending) return;
          try {
            const result = storage.importData(pending.raw);
            toast(`Imported ${result.sessions} sessions and ${result.namespaces} collections`, "pos");
          } catch (error) {
            toast(error instanceof Error ? error.message : "Import failed. Nothing was changed.", "neg");
          }
        }}>
        {pending?.count ?? 0} training sessions and any saved collections in the file will be merged into what is here. Matching records take the backup&rsquo;s version; everything else is kept.
      </ConfirmSheet>
    </Group>
  );
}
