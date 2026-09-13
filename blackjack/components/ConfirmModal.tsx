"use client";
import { ReactNode, useId, useRef } from "react";
import { useModalFocus } from "@/lib/useModalFocus";
import { Button, GhostButton } from "./ui";

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  confirmDisabled = false,
  children,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  confirmDisabled?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const id = useId();
  useModalFocus(open, dialog, onCancel);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-end bg-black/75 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onCancel()}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-description` : undefined}
        tabIndex={-1}
        className={`surface max-h-[min(90svh,48rem)] w-full overflow-y-auto rounded-t-[1.75rem] p-5 outline-none sm:rounded-[1.75rem] sm:p-7 ${children ? "max-w-2xl" : "max-w-md"}`}
      >
        <h2 id={`${id}-title`} className="text-xl font-semibold">
          {title}
        </h2>
        {description && (
          <p id={`${id}-description`} className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">
            {description}
          </p>
        )}
        {children}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <GhostButton onClick={onCancel}>{cancelLabel}</GhostButton>
          <Button
            onClick={onConfirm}
            disabled={confirmDisabled}
            variant={tone === "danger" ? "danger" : "primary"}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
