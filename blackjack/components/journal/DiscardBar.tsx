"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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

/**
 * The unsaved-changes guard the form sheets share. Closing a changed form
 * (Cancel, Close, Escape, the backdrop or browser Back) shows the DiscardBar
 * instead. Keeping the edits, with its button or by dismissing the bar the
 * same ways, puts focus back where it was when the bar appeared. When that was
 * the footer's Cancel, which the bar replaced, focus goes to the new Cancel.
 *
 * Put `actionsRef` on the footer element whose first button is Cancel, and
 * pass `onSheetClose` to the Sheet.
 */
export function useDiscardGuard({ dirty, onClose, registerGuard }: {
  dirty: boolean;
  onClose: () => void;
  /** Lets the page ask before closing on browser Back; the guard returns false while there are unsaved changes. */
  registerGuard: (guard: (() => boolean) | null) => void;
}) {
  const [discarding, setDiscarding] = useState(false);
  const dirtyRef = useRef(dirty);
  const origin = useRef<Element | null>(null);
  const restoring = useRef(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  const ask = useCallback(() => {
    origin.current = document.activeElement;
    setDiscarding(true);
  }, []);
  useEffect(() => {
    registerGuard(() => {
      if (!dirtyRef.current) return true;
      ask();
      return false;
    });
    return () => registerGuard(null);
  }, [registerGuard, ask]);

  useEffect(() => {
    if (discarding || !restoring.current) return;
    restoring.current = false;
    const target = origin.current;
    origin.current = null;
    const inSheet = target instanceof HTMLElement && target.isConnected && target.getAttribute("role") !== "dialog" && target.closest("[role=dialog]") !== null;
    (inSheet ? target : actionsRef.current?.querySelector("button"))?.focus();
  }, [discarding]);

  const requestClose = () => { if (dirty) ask(); else onClose(); };
  const keepEditing = () => {
    restoring.current = true;
    setDiscarding(false);
  };
  /** Closing the sheet while the bar is up means "not yet": keep editing. */
  const onSheetClose = () => { if (discarding) keepEditing(); else requestClose(); };
  return { discarding, requestClose, keepEditing, onSheetClose, actionsRef };
}
