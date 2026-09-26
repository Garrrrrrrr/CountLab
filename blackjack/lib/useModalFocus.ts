"use client";
import { RefObject, useEffect, useRef } from "react";

/**
 * Open modals, innermost last. Only the top one handles Escape, Tab, and
 * focus containment, so a confirmation opened over a sheet closes on its own
 * without taking the sheet with it.
 */
const stack: HTMLElement[] = [];
/** The page's own overflow before the first modal locked scrolling. */
let pageOverflow = "";

export function useModalFocus(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void, initialFocus?: RefObject<HTMLElement | null>) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open || !ref.current) return;
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    if (!stack.length) pageOverflow = document.body.style.overflow;
    stack.push(dialog);
    document.body.style.overflow = "hidden";
    const isTop = () => stack.at(-1) === dialog;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]"))
      .filter((el) => !el.matches(":disabled, [tabindex='-1']") && !el.closest("[inert]") && el.getClientRects().length > 0);
    (initialFocus?.current ?? focusable()[0] ?? dialog).focus();
    const keydown = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== "Tab") return;
      const targets = focusable();
      const first = targets[0], last = targets.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (!dialog.contains(document.activeElement) || document.activeElement === dialog || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus();
      }
    };
    const contain = (event: FocusEvent) => {
      if (!isTop()) return;
      // Floating notes (help tips, toasts) live outside the dialog but belong to it.
      if ((event.target as Element | null)?.closest?.("[data-modal-companion]")) return;
      if (!dialog.contains(event.target as Node)) (focusable()[0] ?? dialog).focus();
    };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", contain);
    return () => {
      stack.splice(stack.indexOf(dialog), 1);
      if (!stack.length) document.body.style.overflow = pageOverflow;
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", contain);
      if (previous?.isConnected) previous.focus();
    };
  }, [open, ref, initialFocus]);
}
