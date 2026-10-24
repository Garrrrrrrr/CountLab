import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cx } from "@/components/ui/cx";

/** The three primitives the analytics dashboard was written against, drawn with the current tokens. */
export function Panel({ children, className, ...rest }: { children: ReactNode; className?: string } & Omit<HTMLAttributes<HTMLElement>, "className" | "children">) {
  return <section {...rest} className={cx("card min-w-0 p-4 sm:p-5", className)}>{children}</section>;
}

export function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card min-w-0 p-4">
      <p className="truncate text-xs font-medium text-ink-3">{label}</p>
      <p className="tnum mt-1 truncate text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

export function GhostButton({ className, selected = false, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button type="button" {...props}
      className={cx("min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
        selected ? "border-ink bg-ink text-bg" : "border-line bg-surface-2 text-ink hover:bg-surface-3", className)} />
  );
}
