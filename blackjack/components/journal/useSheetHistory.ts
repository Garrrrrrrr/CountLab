"use client";
import { useCallback, useEffect, useRef } from "react";

const MARK = "countlabJournalSheet";
const isMarked = () => Boolean((history.state as Record<string, unknown> | null)?.[MARK]);
/** The current address with a different hash; "#log" never survives a closed sheet. */
export const addressWith = (hash?: string) => `${location.pathname}${location.search}${hash ?? (location.hash === "#log" ? "" : location.hash)}`;

/**
 * Gives open sheets a history entry, so the phone's Back button closes the
 * sheet (through its unsaved-changes guard) instead of leaving the journal.
 * One entry covers a run of sheets opened from each other.
 *
 * `onBack` runs when Back is pressed with a sheet open; it returns false to
 * keep the sheet (the entry is then restored).
 */
export function useSheetHistory(onBack: () => boolean) {
  const pushed = useRef(false);
  const lastAddress = useRef("");
  const ignoreNextPop = useRef(false);
  const afterBack = useRef<(() => void) | null>(null);
  const back = useRef(onBack);
  useEffect(() => { back.current = onBack; }, [onBack]);

  const enter = useCallback((hash?: string) => {
    const address = addressWith(hash);
    lastAddress.current = address;
    if (pushed.current && isMarked()) history.replaceState({ [MARK]: true }, "", address);
    else {
      history.pushState({ [MARK]: true }, "", address);
      pushed.current = true;
    }
  }, []);

  /** Drops the sheet's entry; `after` runs once the address is back to the page's own. */
  const leave = useCallback((after?: () => void) => {
    if (pushed.current && isMarked()) {
      pushed.current = false;
      ignoreNextPop.current = true;
      afterBack.current = after ?? null;
      history.back();
      return;
    }
    pushed.current = false;
    if (location.hash === "#log") history.replaceState(null, "", addressWith(""));
    after?.();
  }, []);

  useEffect(() => {
    const onPop = () => {
      if (ignoreNextPop.current) {
        ignoreNextPop.current = false;
        const after = afterBack.current;
        afterBack.current = null;
        after?.();
        return;
      }
      if (!pushed.current || isMarked()) return;
      pushed.current = false;
      if (!back.current()) {
        history.pushState({ [MARK]: true }, "", lastAddress.current);
        pushed.current = true;
      }
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  return { enter, leave };
}
