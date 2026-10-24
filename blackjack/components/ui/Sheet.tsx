"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "./cx";

/** Open sheets, innermost last, so only the top one answers Escape. */
const stack: string[] = [];

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * A modal panel: a bottom sheet on phones, a centred dialog from `sm` up.
 *
 * Focus moves into the sheet on open, is trapped while it is open, and goes
 * back to whatever opened it on close. The page behind stops scrolling, which
 * on iOS also needs `overscroll-behavior: contain` on the scrolling body.
 */
export function Sheet({ open, onClose, title, description, children, footer, size = "md", initialFocus }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** A selector inside the sheet to focus first; defaults to the first focusable element after the close button. */
  initialFocus?: string;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    stack.push(id);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const focusFirst = () => {
      const root = panel.current;
      if (!root) return;
      const preferred = initialFocus ? root.querySelector<HTMLElement>(initialFocus) : null;
      const candidates = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((node) => !node.dataset.sheetClose);
      (preferred ?? candidates[0] ?? root).focus({ preventScroll: true });
    };
    const frame = requestAnimationFrame(focusFirst);
    const onKey = (event: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab" || !panel.current) return;
      const nodes = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((node) => node.offsetParent !== null);
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(id), 1);
      if (!stack.length) document.body.style.overflow = overflow;
      opener?.focus?.({ preventScroll: true });
    };
  }, [open, id, initialFocus]);

  if (!open || !mounted) return null;
  const width = size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-3xl" : "sm:max-w-xl";
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
      <div className="animate-fade absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => closeRef.current()} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-desc` : undefined}
        tabIndex={-1}
        className={cx(
          "animate-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line bg-surface shadow-2 outline-none sm:animate-pop sm:rounded-3xl",
          width,
        )}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-surface-3 sm:hidden" aria-hidden />
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-3 sm:pt-5">
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2>
            {description && <p id={`${id}-desc`} className="mt-1 text-sm leading-6 text-ink-2">{description}</p>}
          </div>
          <button type="button" data-sheet-close="true" onClick={() => closeRef.current()} aria-label="Close" className="-mr-2 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-3 hover:bg-surface-2 hover:text-ink">
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer && <div className="shrink-0 border-t border-line px-5 py-3.5" style={{ paddingBottom: "calc(0.875rem + var(--safe-b))" }}>{footer}</div>}
        {!footer && <div className="shrink-0 sm:hidden" style={{ height: "var(--safe-b)" }} />}
      </div>
    </div>,
    document.body,
  );
}

/** A confirm dialog for destructive or irreversible actions. */
export function ConfirmSheet({ open, onClose, onConfirm, title, children, confirmLabel = "Confirm", tone = "danger" }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: ReactNode; children?: ReactNode; confirmLabel?: string; tone?: "danger" | "primary";
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="h-11 rounded-xl border border-line bg-surface-2 px-4 font-semibold hover:bg-surface-3">Cancel</button>
          <button type="button" onClick={() => { onConfirm(); onClose(); }} className={cx("h-11 rounded-xl px-4 font-semibold", tone === "danger" ? "bg-neg text-white" : "bg-brand text-brand-ink")}>{confirmLabel}</button>
        </div>
      }>
      {children && <div className="text-[0.9375rem] leading-6 text-ink-2">{children}</div>}
    </Sheet>
  );
}
