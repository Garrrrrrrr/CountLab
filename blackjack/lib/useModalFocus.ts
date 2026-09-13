"use client";
import { RefObject, useEffect, useRef } from "react";

export function useModalFocus(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open || !ref.current) return;
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]"))
      .filter((el) => !el.matches(":disabled, [tabindex='-1']") && !el.closest("[inert]") && el.getClientRects().length > 0);
    (focusable()[0] ?? dialog).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== "Tab") return;
      const targets = focusable();
      const first = targets[0], last = targets.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (!dialog.contains(document.activeElement) || document.activeElement === dialog || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus();
      }
    };
    const contain = (event: FocusEvent) => { if (!dialog.contains(event.target as Node)) (focusable()[0] ?? dialog).focus(); };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", contain);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", contain);
      if (previous?.isConnected) previous.focus();
    };
  }, [open, ref]);
}
