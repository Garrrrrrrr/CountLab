import type { Session } from "../statistics/storage";

/**
 * Certification is derived, not stored.
 *
 * A pass *is* a `Session` tagged `test-out`, so expiry is just its date plus the
 * `validDays` the exam carried. That inherits Supabase sync, backup export, the
 * practice streak, and the statistics page without adding a table, a
 * localStorage namespace, or a backup key of its own — the same way
 * `countingMastery` and `streaks` derive everything from the session log.
 */
export type CertificationStatus = "current" | "expiring" | "lapsed";

/** Whole days of remaining validity at or below which a certification asks to be renewed. */
export const EXPIRING_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Certification {
  examId: string;
  name: string;
  passedAt: string;
  expiresAt: string;
  status: CertificationStatus;
  accuracy: number;
  rulesSummary: string;
  /** Whole days until expiry; negative once lapsed. */
  daysRemaining: number;
}

const metricString = (session: Session, key: string, fallback = ""): string => {
  const value = session.metrics?.[key];
  return typeof value === "string" ? value : fallback;
};

const metricNumber = (session: Session, key: string, fallback: number): number => {
  const value = session.metrics?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

/** Every recorded attempt at any exam, newest first. */
export function examAttempts(sessions: Session[]): Session[] {
  return sessions
    .filter((session) => session.drill === "Test Out")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function toCertification(session: Session, now: Date): Certification | null {
  const examId = metricString(session, "examId");
  if (!examId) return null;
  const passedAt = new Date(session.date);
  if (Number.isNaN(passedAt.getTime())) return null;
  const validDays = metricNumber(session, "validDays", 30);
  const expiresAt = new Date(passedAt.getTime() + validDays * DAY_MS);
  const msRemaining = expiresAt.getTime() - now.getTime();
  const daysRemaining = Math.floor(msRemaining / DAY_MS);
  return {
    examId,
    name: metricString(session, "examName", examId),
    passedAt: passedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: msRemaining <= 0 ? "lapsed" : daysRemaining <= EXPIRING_WINDOW_DAYS ? "expiring" : "current",
    accuracy: session.accuracy,
    rulesSummary: metricString(session, "rulesSummary"),
    daysRemaining,
  };
}

/**
 * The standing certification for each exam that has ever been passed, newest
 * pass per exam winning.
 *
 * Failed attempts stay in the session history but never grant or revoke a
 * certification — a bad practice run after a good exam should not strip a
 * credential that was honestly earned and has not yet expired.
 */
export function certifications(sessions: Session[], now: Date = new Date()): Certification[] {
  const byExam = new Map<string, Certification>();
  // Newest first, so the first pass seen for an exam is the one that counts.
  for (const session of examAttempts(sessions)) {
    if (session.metrics?.passed !== true) continue;
    const certification = toCertification(session, now);
    if (!certification || byExam.has(certification.examId)) continue;
    byExam.set(certification.examId, certification);
  }
  return [...byExam.values()].sort((a, b) => new Date(b.passedAt).getTime() - new Date(a.passedAt).getTime());
}

export function certificationFor(
  examId: string,
  sessions: Session[],
  now: Date = new Date(),
): Certification | undefined {
  return certifications(sessions, now).find((certification) => certification.examId === examId);
}

/** The most recent attempt at one exam, passed or not, for "last attempt" copy. */
export function latestAttempt(examId: string, sessions: Session[]): Session | undefined {
  return examAttempts(sessions).find((session) => session.metrics?.examId === examId);
}
