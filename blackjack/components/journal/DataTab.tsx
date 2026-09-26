"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { parseCsv } from "@/lib/blackjack/csv";
import { journalLibrary, type BankrollTransaction, type JournalSession } from "@/lib/blackjack/journal";
import { localDateString } from "@/lib/blackjack/journalForm";
import { plural } from "@/lib/blackjack/journalFormat";
import { previewJsonImport, type ImportPreview } from "@/lib/blackjack/journalView";
import { ConfirmModal } from "../ConfirmModal";
import { Callout, GhostButton, Panel, toast } from "../ui";
import { useSyncState } from "./SyncBadge";

/** Supabase accepts about 30 journal writes a minute, so the library spaces imported uploads 2.1s apart. */
const UPLOAD_SECONDS_PER_RECORD = 2.1;

/** Where a signed-in journal stands, in the same terms as the header's sync badge. */
const STORAGE_NOTE: Record<"offline" | "syncing" | "error" | "synced" | "waiting", { tone: "info" | "good" | "warn"; text: string }> = {
  offline: { tone: "info", text: "Saved on this device; it syncs when you reconnect." },
  syncing: { tone: "info", text: "Syncing to your account…" },
  waiting: { tone: "info", text: "Syncing to your account…" },
  error: { tone: "warn", text: "Your last sync failed, but everything is saved on this device." },
  synced: { tone: "good", text: "Synced to your account." },
};

type Pending = { kind: "json"; raw: string; preview: ImportPreview } | { kind: "csv"; raw: string; rows: number };

function download(contents: string, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Backups and spreadsheets, with a plain statement of where the journal is
 * kept. Imports say what they are about to do before anything is written.
 */
export function DataTab({ signedIn, sessions, transactions }: { signedIn: boolean; sessions: JournalSession[]; transactions: BankrollTransaction[] }) {
  const jsonInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const sync = useSyncState();

  const read = async (kind: Pending["kind"], file: File | undefined) => {
    if (!file) return;
    setError("");
    setResult("");
    try {
      const raw = await file.text();
      if (kind === "json") setPending({ kind, raw, preview: previewJsonImport(raw, { sessions, transactions }) });
      else setPending({ kind, raw, rows: parseCsv(raw).length });
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "The file could not be read.");
    } finally {
      if (jsonInput.current) jsonInput.current.value = "";
      if (csvInput.current) csvInput.current.value = "";
    }
  };

  const confirmImport = () => {
    if (!pending) return;
    setPending(null);
    try {
      let message: string;
      let uploads: number;
      if (pending.kind === "json") {
        const imported = journalLibrary.importData(pending.raw);
        const droppedNote = imported.dropped > 0 ? ` ${imported.dropped} of the oldest record${imported.dropped === 1 ? "" : "s"} did not fit under the storage limit.` : "";
        message = `Imported ${plural(imported.sessions, "session")} and ${plural(imported.transactions, "cash movement")}.${droppedNote}`;
        uploads = pending.preview.sessions + pending.preview.transactions;
      } else {
        const imported = journalLibrary.importSessionsCsv(pending.raw);
        message = `Imported ${plural(imported, "session")} from CSV.`;
        uploads = imported;
      }
      const minutes = Math.ceil((uploads * UPLOAD_SECONDS_PER_RECORD) / 60);
      const uploadNote = signedIn && uploads > 20 ? ` Uploading ${plural(uploads, "record")} to your account takes about ${plural(minutes, "minute")}; it resumes next visit if you close CountLab.` : "";
      setResult(message + uploadNote);
      toast({ message });
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "The journal backup could not be imported.");
    }
  };

  const today = localDateString();
  return (
    <div className="grid gap-4">
      {signedIn && sync.status !== "guest" ? (
        <Callout tone={STORAGE_NOTE[sync.status].tone} icon="fa-cloud-arrow-up">
          {STORAGE_NOTE[sync.status].text} A JSON backup is still a good idea before big imports.
        </Callout>
      ) : (
        <Callout tone="info" icon="fa-mobile-screen">
          Saved in this browser only. Export a JSON backup regularly. After you create an account, import this device&apos;s guest history from <Link href="/settings" className="font-semibold text-[var(--accent)] underline underline-offset-2">Settings</Link>.
        </Callout>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel aria-labelledby="journal-json-title" className="grid content-start gap-3">
          <h3 id="journal-json-title" className="text-base font-semibold">Full backup (JSON)</h3>
          <p className="text-sm leading-6 text-[var(--ink-muted)]">Bankrolls, sessions and cash movements. Use it to restore or move to another device. Records in the backup replace ones with the same ID. Saved venues aren&apos;t included; use the full backup in Settings for those.</p>
          <div className="flex flex-wrap gap-2">
            <GhostButton onClick={() => { download(journalLibrary.exportData(), "application/json", `countlab-journal-${today}.json`); toast({ message: "Journal exported." }); }}><i className="fa-solid fa-download mr-2 text-xs" aria-hidden="true" />Export JSON</GhostButton>
            <GhostButton onClick={() => jsonInput.current?.click()}><i className="fa-solid fa-upload mr-2 text-xs" aria-hidden="true" />Import JSON</GhostButton>
            <input ref={jsonInput} type="file" accept="application/json,.json" aria-label="Choose a JSON journal backup" tabIndex={-1} className="hidden" onChange={(event) => void read("json", event.target.files?.[0])} />
          </div>
        </Panel>
        <Panel aria-labelledby="journal-csv-title" className="grid content-start gap-3">
          <h3 id="journal-csv-title" className="text-base font-semibold">Spreadsheet (CSV)</h3>
          <p className="text-sm leading-6 text-[var(--ink-muted)]">Open in Excel or Google Sheets. Importing a CSV always adds new sessions; it never updates existing ones.</p>
          <div className="flex flex-wrap gap-2">
            <GhostButton onClick={() => { download(journalLibrary.exportSessionsCsv(), "text/csv", `countlab-journal-sessions-${today}.csv`); toast({ message: "Sessions exported as CSV." }); }}><i className="fa-solid fa-file-csv mr-2 text-xs" aria-hidden="true" />Export sessions CSV</GhostButton>
            <GhostButton onClick={() => { download(journalLibrary.exportTransactionsCsv(), "text/csv", `countlab-journal-transactions-${today}.csv`); toast({ message: "Cash movements exported as CSV." }); }}><i className="fa-solid fa-file-csv mr-2 text-xs" aria-hidden="true" />Export cash movements CSV</GhostButton>
            <GhostButton onClick={() => csvInput.current?.click()}><i className="fa-solid fa-upload mr-2 text-xs" aria-hidden="true" />Import sessions CSV</GhostButton>
            <input ref={csvInput} type="file" accept="text/csv,.csv" aria-label="Choose a sessions CSV" tabIndex={-1} className="hidden" onChange={(event) => void read("csv", event.target.files?.[0])} />
          </div>
        </Panel>
      </div>
      <div role="status" className="text-sm text-[var(--ink)]">{result}</div>
      {error && <Callout tone="bad" live title="Import failed">{error}</Callout>}
      <ConfirmModal
        open={pending !== null}
        title={pending?.kind === "csv" ? "Import sessions from CSV?" : "Import this backup?"}
        description={
          pending?.kind === "csv"
            ? `This adds ${plural(pending.rows, "row")} as new sessions (rows that aren't valid sessions are skipped). Importing the same file twice creates duplicates.`
            : pending?.kind === "json"
              ? `This backup has ${plural(pending.preview.sessions, "session")} and ${plural(pending.preview.transactions, "cash movement")}. ${pending.preview.replacing > 0 ? `${plural(pending.preview.replacing, "record")} already on this device will be replaced by the backup's copy, including any edits made since the backup.` : "None of them are on this device yet, so everything is added."}`
              : undefined
        }
        confirmLabel="Import"
        onCancel={() => setPending(null)}
        onConfirm={confirmImport}
      />
    </div>
  );
}
