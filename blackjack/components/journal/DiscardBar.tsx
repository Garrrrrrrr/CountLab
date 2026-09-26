"use client";
import { useEffect, useRef } from "react";
import { Button, GhostButton } from "../ui";

/**
 * Asks before unsaved input is thrown away, in place of a sheet's footer
 * rather than as a second dialog. Focus starts on the safe choice.
 */
export function DiscardBar({ message, onKeep, onDiscard }: { message: string; onKeep: () => void; onDiscard: () => void }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => { bar.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, []);
  return (
    <div ref={bar} role="alert" className="flex flex-wrap items-center justify-between gap-3">
      <p className="font-semibold text-[var(--ink)]"><i className="fa-solid fa-triangle-exclamation mr-2 text-[var(--warning)]" aria-hidden="true" />{message}</p>
      <div className="flex w-full gap-2 sm:w-auto">
        <GhostButton type="button" className="flex-1 sm:flex-none" onClick={onKeep}>Keep editing</GhostButton>
        <Button type="button" variant="danger" enterAction={false} className="flex-1 sm:flex-none" onClick={onDiscard}>Discard</Button>
      </div>
    </div>
  );
}
