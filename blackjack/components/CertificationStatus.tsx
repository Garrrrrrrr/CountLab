"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "./ui";
import { certifications, type Certification, type CertificationStatus as Status } from "@/lib/blackjack/certification";
import { storage, type Session } from "@/lib/statistics/storage";

const TONE: Record<Status, "cold" | "warm" | "hot"> = {
  current: "cold",
  expiring: "warm",
  lapsed: "hot",
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function statusLine(certification: Certification): string {
  if (certification.status === "lapsed") return "Lapsed — retake to renew";
  if (certification.status === "expiring") {
    return certification.daysRemaining <= 0
      ? `Expires today · ${formatDate(certification.expiresAt)}`
      : `Expires in ${certification.daysRemaining} day${certification.daysRemaining === 1 ? "" : "s"} · ${formatDate(certification.expiresAt)}`;
  }
  return `Certified until ${formatDate(certification.expiresAt)}`;
}

/**
 * Standing certifications, derived from the session log rather than stored, so
 * this stays correct after a sync, an import, or a history clear.
 */
export function CertificationStatus() {
  const [sessions, setSessions] = useState<Session[]>([]);
  useEffect(() => {
    const load = () => setSessions(storage.sessions());
    load();
    addEventListener("hilo-storage", load);
    return () => removeEventListener("hilo-storage", load);
  }, []);
  const earned = useMemo(() => certifications(sessions), [sessions]);

  if (earned.length === 0) return null;

  return <section aria-labelledby="certifications" className="mt-7">
    <div className="mb-3 flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-lg border border-[var(--rule)] text-[var(--count-cold)]">
        <i className="fa-solid fa-award" aria-hidden="true" />
      </span>
      <div>
        <h2 id="certifications" className="font-display text-xl font-semibold">Certifications</h2>
        <p className="text-sm text-[var(--ink-muted)]">Exams you have passed, and how long each one stays current.</p>
      </div>
    </div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {earned.map((certification) => <Link
        key={certification.examId}
        href="/training/test-out"
        className="surface pressable flex min-h-28 flex-col rounded-2xl border p-4 transition-colors hover:border-[var(--ink-muted)]"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold">{certification.name}</h3>
          <Badge tone={TONE[certification.status]}>{certification.status === "current" ? "Current" : certification.status === "expiring" ? "Renew soon" : "Lapsed"}</Badge>
        </div>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">{statusLine(certification)}</p>
        <p className="mt-auto pt-3 text-xs text-[var(--ink-muted)]">
          {certification.accuracy}% on {certification.rulesSummary || "your saved rules"}
        </p>
      </Link>)}
    </div>
  </section>;
}
