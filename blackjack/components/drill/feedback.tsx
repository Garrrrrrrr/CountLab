"use client";
import Link from "next/link";
import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { Callout, GhostButton } from "../ui";
import { ConfirmModal } from "../ConfirmModal";

/**
 * The verdict on one answer: right or wrong, what was expected, why, and the
 * single action that continues. It takes focus when it appears (as a labelled
 * group, not the button), so Enter continues through the page's one Enter
 * action and a screen reader reads the verdict. Announce the verdict with
 * `announce()` from the drill; this panel adds no live region of its own.
 */
export function FeedbackPanel({ ok, title, detail, rows, cause, children, visual, link, action, autoFocus = true, testId }: {
  ok: boolean;
  title: ReactNode;
  detail?: ReactNode;
  /** Side-by-side answers for multi-part questions. */
  rows?: ReadonlyArray<{ label: string; yours: string; correct: string; ok: boolean }>;
  /** The likely reason for a miss, in plain words. */
  cause?: ReactNode;
  /** The explanation. */
  children?: ReactNode;
  visual?: ReactNode;
  link?: { href: string; label: string };
  /** The one primary Button that continues. */
  action?: ReactNode;
  autoFocus?: boolean;
  testId?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => { if (autoFocus) panel.current?.focus({ preventScroll: false }); }, [autoFocus]);
  return (
    <div ref={panel} role="group" aria-labelledby={titleId} tabIndex={-1} data-testid={testId} className={`min-w-0 rounded-2xl border p-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] sm:p-5 ${ok ? "border-emerald-500/30 bg-emerald-400/[.08]" : "border-red-500/30 bg-red-500/[.06]"}`}>
      <p id={titleId} className="flex items-center gap-2 text-lg font-semibold">
        <i className={`fa-solid ${ok ? "fa-circle-check text-[var(--accent)]" : "fa-circle-xmark text-[var(--negative)]"}`} aria-hidden="true" />
        {title}
      </p>
      {detail && <div className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">{detail}</div>}
      {rows && rows.length > 0 && (
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs text-[var(--ink-muted)]"><tr><th scope="col" className="pb-1 font-medium"><span className="sr-only">Item</span></th><th scope="col" className="pb-1 font-medium">Yours</th><th scope="col" className="pb-1 font-medium">Correct</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-overlay/10">
                <th scope="row" className="py-1.5 pr-3 font-medium">{row.label}</th>
                <td className={`py-1.5 pr-3 font-data ${row.ok ? "text-[var(--accent)]" : "text-[var(--negative)]"}`}>{row.yours}<span className="sr-only">{row.ok ? " (correct)" : " (incorrect)"}</span></td>
                <td className="py-1.5 font-data">{row.correct}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {cause && <p className="mt-3 text-sm"><b>Likely cause:</b> <span className="text-[var(--ink-muted)]">{cause}</span></p>}
      {children && <div className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">{children}</div>}
      {visual && <div className="mt-4 min-w-0">{visual}</div>}
      {(link || action) && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {action}
          {link && <Link href={link.href} className="text-sm font-semibold text-[var(--accent)] underline-offset-2 hover:underline">{link.label} <i className="fa-solid fa-arrow-right ml-0.5 text-[.65rem]" aria-hidden="true" /></Link>}
        </div>
      )}
    </div>
  );
}

const relative = (iso?: string) => {
  if (!iso) return "";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : new Date(iso).toLocaleDateString();
};

/**
 * Makes resumed progress visible: where the reader left off and a way to
 * start over, confirmed so a mis-tap cannot throw away a session.
 */
export function ResumeBanner({ detail, updatedAt, onDiscard, discardLabel = "Start over" }: { detail: ReactNode; updatedAt?: string; onDiscard: () => void; discardLabel?: string }) {
  const [confirming, setConfirming] = useState(false);
  // The relative time depends on the clock, so it is filled in after mount to match the prerendered HTML.
  const [saved, setSaved] = useState("");
  useEffect(() => { setSaved(relative(updatedAt)); }, [updatedAt]);
  return (
    <>
      <Callout tone="info" title="Picked up where you left off" action={<GhostButton size="compact" onClick={() => setConfirming(true)}>{discardLabel}</GhostButton>}>
        {detail}{saved && ` · saved ${saved}`}
      </Callout>
      <ConfirmModal open={confirming} tone="danger" title="Discard this session?" description="Your progress in this session will be lost. Completed sessions in Statistics are not affected." confirmLabel="Discard session" cancelLabel="Keep going" onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); onDiscard(); }} />
    </>
  );
}
