"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Trash, Upload } from "lucide-react";
import { Button, Callout, Card, ConfirmSheet, Sheet, toast } from "@/components/ui";
import { parseCsv } from "@/lib/blackjack/csv";
import { journalLibrary, type BankrollTransaction, type JournalSession } from "@/lib/blackjack/journal";
import { localDateString } from "@/lib/blackjack/journalForm";
import { plural } from "@/lib/blackjack/journalFormat";
import { previewJsonImport, type ImportPreview } from "@/lib/blackjack/journalView";
import { InputField } from "./parts";
import { useSyncState } from "./SyncStatus";

/** Supabase accepts about 30 journal writes a minute, so the library spaces uploads 2.1s apart. */
const UPLOAD_SECONDS_PER_RECORD = 2.1;
const CONFIRM_WORD = "delete";

type Pending = { kind: "json"; raw: string; preview: ImportPreview } | { kind: "csv"; raw: string; rows: number };

function download(contents: string, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const uploadNote = (signedIn: boolean, records: number) => {
  if (!signedIn || records <= 20) return "";
  const minutes = Math.ceil((records * UPLOAD_SECONDS_PER_RECORD) / 60);
  return ` Sending ${plural(records, "change")} to your account takes about ${plural(minutes, "minute")}; it carries on next visit if you close CountLab.`;
};

/**
 * Backups and spreadsheets, in the same file formats and names as before, and
 * a guarded way to start over. Imports say what they will do before anything
 * is written.
 */
export function DataTab({ signedIn, sessions, transactions, extraBankrolls, onDeleteAll }: {
  signedIn: boolean;
  sessions: JournalSession[];
  transactions: BankrollTransaction[];
  /** Bankrolls beyond the one that always stays. */
  extraBankrolls: number;
  onDeleteAll: () => { sessions: number; transactions: number; bankrolls: number };
}) {
  const jsonInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");
  const sync = useSyncState();
  const today = localDateString();
  const nothing = sessions.length === 0 && transactions.length === 0 && extraBankrolls === 0;

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
        message = `Imported ${plural(pending.preview.sessions, "session")} and ${plural(pending.preview.transactions, "cash movement")}.${droppedNote}`;
        uploads = pending.preview.sessions + pending.preview.transactions;
      } else {
        const imported = journalLibrary.importSessionsCsv(pending.raw);
        message = `Imported ${plural(imported, "session")} from CSV.`;
        uploads = imported;
      }
      setResult(message + uploadNote(signedIn, uploads));
      toast(message, "pos");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "The journal backup could not be imported.");
    }
  };

  const exportJson = () => { download(journalLibrary.exportData(), "application/json", `countlab-journal-${today}.json`); toast("Journal exported.", "pos"); };
  const deleteAll = () => {
    const removed = onDeleteAll();
    setDeleting(false);
    setTyped("");
    const message = `Deleted ${plural(removed.sessions, "session")} and ${plural(removed.transactions, "cash movement")}.`;
    setResult(message + uploadNote(signedIn, removed.sessions + removed.transactions + removed.bankrolls));
    toast(message);
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      {signedIn && sync.status !== "guest" ? (
        <Callout tone={sync.status === "error" || sync.status === "offline" ? "warn" : sync.status === "synced" ? "pos" : "info"} title={sync.title}>
          {sync.detail} A JSON backup is still a good idea before a big import.
        </Callout>
      ) : (
        <Callout tone="info" title="Saved in this browser only">
          Export a JSON backup now and then. After you <Link href="/signin" className="font-semibold text-brand-text underline underline-offset-4">sign in</Link>, you can bring this device&apos;s journal into your account from <Link href="/settings" className="font-semibold text-brand-text underline underline-offset-4">Settings</Link>.
        </Callout>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card as="section" aria-labelledby="journal-json-title" className="grid grid-cols-1 content-start gap-3">
          <h3 id="journal-json-title" className="text-base font-semibold">Full backup (JSON)</h3>
          <p className="text-sm leading-6 text-ink-2">Bankrolls, sessions and cash movements, to restore or move to another device. Records in a backup replace ones with the same ID. Saved venues are in the full backup in Settings.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Download size={16} aria-hidden />} onClick={exportJson}>Export JSON</Button>
            <Button variant="secondary" icon={<Upload size={16} aria-hidden />} onClick={() => jsonInput.current?.click()}>Import JSON</Button>
            <input ref={jsonInput} type="file" accept="application/json,.json" aria-label="Choose a JSON journal backup" tabIndex={-1} className="hidden" onChange={(event) => void read("json", event.target.files?.[0])} />
          </div>
        </Card>
        <Card as="section" aria-labelledby="journal-csv-title" className="grid grid-cols-1 content-start gap-3">
          <h3 id="journal-csv-title" className="text-base font-semibold">Spreadsheet (CSV)</h3>
          <p className="text-sm leading-6 text-ink-2">Open in Excel or Google Sheets. Importing a CSV always adds new sessions; it never updates existing ones.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<FileSpreadsheet size={16} aria-hidden />} onClick={() => { download(journalLibrary.exportSessionsCsv(), "text/csv", `countlab-journal-sessions-${today}.csv`); toast("Sessions exported as CSV.", "pos"); }}>Export sessions CSV</Button>
            <Button variant="secondary" icon={<FileSpreadsheet size={16} aria-hidden />} onClick={() => { download(journalLibrary.exportTransactionsCsv(), "text/csv", `countlab-journal-transactions-${today}.csv`); toast("Cash movements exported as CSV.", "pos"); }}>Export cash movements CSV</Button>
            <Button variant="secondary" icon={<Upload size={16} aria-hidden />} onClick={() => csvInput.current?.click()}>Import sessions CSV</Button>
            <input ref={csvInput} type="file" accept="text/csv,.csv" aria-label="Choose a sessions CSV" tabIndex={-1} className="hidden" onChange={(event) => void read("csv", event.target.files?.[0])} />
          </div>
        </Card>
      </div>
      <p role="status" className="text-sm text-ink empty:hidden">{result}</p>
      {error && <Callout tone="neg" title="Import failed"><span role="alert">{error}</span></Callout>}

      <Card as="section" aria-labelledby="journal-delete-title" className="grid grid-cols-1 content-start gap-3 border-neg/30">
        <h3 id="journal-delete-title" className="text-base font-semibold">Delete all journal data</h3>
        <p className="text-sm leading-6 text-ink-2">Removes every session and cash movement{signedIn ? " from this device and your account" : " from this browser"}, and every bankroll but one. Saved venues stay. This can&apos;t be undone, so export a backup first.</p>
        <div><Button variant="secondary" className="text-neg hover:text-neg" disabled={nothing} icon={<Trash size={16} aria-hidden />} onClick={() => setDeleting(true)}>Delete all journal data</Button></div>
      </Card>

      <ConfirmSheet
        open={pending !== null}
        title={pending?.kind === "csv" ? "Import sessions from CSV?" : "Import this backup?"}
        confirmLabel="Import"
        tone="primary"
        onClose={() => setPending(null)}
        onConfirm={confirmImport}
      >
        {pending?.kind === "csv"
          ? `This adds ${plural(pending.rows, "row")} as new sessions; rows that aren't valid sessions are skipped. Importing the same file twice creates duplicates.`
          : pending?.kind === "json"
            ? `This backup has ${plural(pending.preview.sessions, "session")} and ${plural(pending.preview.transactions, "cash movement")}. ${pending.preview.replacing > 0 ? `${plural(pending.preview.replacing, "record")} already on this device will be replaced by the backup's copy, including any edits made since the backup.` : "None of them are here yet, so everything is added."}`
            : null}
      </ConfirmSheet>

      <Sheet open={deleting} size="sm" title="Delete all journal data?" onClose={() => { setDeleting(false); setTyped(""); }}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => { setDeleting(false); setTyped(""); }}>Cancel</Button>
            <Button variant="danger" disabled={typed.trim().toLocaleLowerCase() !== CONFIRM_WORD} onClick={deleteAll}>Delete everything</Button>
          </div>
        }>
        <div className="grid grid-cols-1 gap-4 text-[0.9375rem] leading-6 text-ink-2">
          <p>This deletes {plural(sessions.length, "session")} and {plural(transactions.length, "cash movement")}{extraBankrolls > 0 ? `, and ${plural(extraBankrolls, "bankroll")}` : ""}{signedIn ? ", on every device signed in to your account" : ""}. It can&apos;t be undone.</p>
          <Button variant="secondary" className="justify-self-start" icon={<Download size={16} aria-hidden />} onClick={exportJson}>Download a backup first</Button>
          <InputField label={<>Type <b className="font-semibold text-ink">{CONFIRM_WORD}</b> to confirm</>} value={typed} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(event) => setTyped(event.target.value)} />
        </div>
      </Sheet>
    </div>
  );
}
