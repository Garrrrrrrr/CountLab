"use client";
import { useEffect, useState } from "react";
import { storage, type DrillType, type Session } from "@/lib/statistics/storage";

/** Completed drill sessions, newest first, optionally for one drill. Re-reads on every storage change. */
export function useSessions(drill?: DrillType): Session[] {
  const [sessions, setSessions] = useState<Session[]>([]);
  useEffect(() => {
    const load = () => setSessions(drill ? storage.sessions().filter((session) => session.drill === drill) : storage.sessions());
    load();
    window.addEventListener("hilo-storage", load);
    return () => window.removeEventListener("hilo-storage", load);
  }, [drill]);
  return sessions;
}
