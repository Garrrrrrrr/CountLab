import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";
import { ChevronLeft, CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cx } from "./cx";

/** The standard raised container. `pad` matches the page rhythm: 16px on phones, 20px from `sm`. */
export function Card({ className, pad = true, as: Tag = "div", ...rest }: HTMLAttributes<HTMLElement> & { pad?: boolean; as?: "div" | "section" | "article" | "aside" }) {
  return <Tag className={cx("card", pad && "p-4 sm:p-5", className)} {...rest} />;
}

export function CardTitle({ children, action, sub, className }: { children: ReactNode; action?: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-3 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{children}</h2>
        {sub && <p className="mt-0.5 text-sm text-ink-2">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * The top of every page. On phones the title is the page's only heading chrome,
 * so it stays compact; `back` renders a real link rather than history.back(),
 * which would leave the app when the page was opened from a bookmark.
 */
export function PageHeader({ title, sub, eyebrow, back, actions, className }: {
  title: ReactNode; sub?: ReactNode; eyebrow?: ReactNode; back?: { href: string; label: string }; actions?: ReactNode; className?: string;
}) {
  return (
    <header className={cx("mb-5 sm:mb-7", className)}>
      {back && (
        <Link href={back.href} className="-ml-1 mb-2 inline-flex h-8 items-center gap-1 rounded-lg pr-2 text-sm font-medium text-ink-2 hover:text-ink">
          <ChevronLeft size={18} aria-hidden /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
          <h1 className="text-[1.625rem] leading-tight sm:text-3xl">{title}</h1>
          {sub && <p className="mt-1.5 max-w-2xl text-[0.9375rem] leading-6 text-ink-2">{sub}</p>}
        </div>
        {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Stat({ label, value, sub, tone, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "pos" | "neg" | "brand"; className?: string }) {
  const toneClass = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : tone === "brand" ? "text-brand-text" : "text-ink";
  return (
    <div className={cx("min-w-0", className)}>
      <p className="truncate text-xs font-medium text-ink-3">{label}</p>
      <p className={cx("tnum mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl", toneClass)}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "brand" | "pos" | "neg" | "warn" | "info"; className?: string }) {
  const tones = {
    neutral: "bg-surface-2 text-ink-2 border-line",
    brand: "bg-brand/15 text-brand-text border-brand/30",
    pos: "bg-pos/10 text-pos border-pos/25",
    neg: "bg-neg/10 text-neg border-neg/25",
    warn: "bg-warn/10 text-warn border-warn/25",
    info: "bg-info/10 text-info border-info/25",
  };
  return <span className={cx("inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}

const CALLOUT = {
  info: { icon: Info, cls: "border-info/25 bg-info/[0.07]", ink: "text-info" },
  warn: { icon: TriangleAlert, cls: "border-warn/30 bg-warn/[0.08]", ink: "text-warn" },
  pos: { icon: CircleCheck, cls: "border-pos/25 bg-pos/[0.07]", ink: "text-pos" },
  neg: { icon: CircleAlert, cls: "border-neg/25 bg-neg/[0.07]", ink: "text-neg" },
};

export function Callout({ tone = "info", title, children, className, action }: { tone?: keyof typeof CALLOUT; title?: ReactNode; children?: ReactNode; className?: string; action?: ReactNode }) {
  const { icon: Icon, cls, ink } = CALLOUT[tone];
  return (
    <div className={cx("flex gap-3 rounded-xl border p-3.5 text-sm", cls, className)}>
      <Icon size={18} className={cx("mt-0.5 shrink-0", ink)} aria-hidden />
      <div className="min-w-0 flex-1 leading-6">
        {title && <p className="font-semibold text-ink">{title}</p>}
        {children && <div className="text-ink-2">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action, className, heading }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string; heading?: "h1" | "h2" }) {
  const Title = heading ?? "p";
  return (
    <div className={cx("flex flex-col items-center rounded-[var(--radius)] border border-dashed border-line-strong px-6 py-10 text-center", className)}>
      {icon && <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-ink-2">{icon}</div>}
      <Title className={cx("font-semibold", heading === "h1" && "text-xl")}>{title}</Title>
      {children && <p className="mt-1 max-w-sm text-sm leading-6 text-ink-2">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ProgressBar({ value, max = 1, label, tone = "brand", className }: { value: number; max?: number; label: string; tone?: "brand" | "pos" | "neg"; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill = tone === "pos" ? "bg-pos" : tone === "neg" ? "bg-neg" : "bg-brand";
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className={cx("h-1.5 overflow-hidden rounded-full bg-surface-3", className)}>
      <div className={cx("h-full rounded-full transition-[width] duration-300", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-xl bg-surface-2", className)} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-grid h-5 min-w-5 place-items-center rounded border border-line-strong bg-surface px-1 font-mono text-[0.6875rem] font-medium text-ink-3">{children}</kbd>;
}

/** A labelled group of rows, iOS-settings style: the rows share one card and hairlines between them. */
export function List({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <div role={label ? "group" : undefined} aria-label={label} className={cx("card divide-y divide-line overflow-hidden", className)}>{children}</div>;
}

export function ListRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex min-h-14 items-center gap-3 px-4 py-2.5", className)}>{children}</div>;
}
