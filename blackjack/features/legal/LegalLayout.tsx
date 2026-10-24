import type { ReactNode } from "react";

/** Shared reading layout for the terms and privacy pages: one column, generous type. */
export function LegalLayout({ title, updated, intro, children }: { title: string; updated: string; intro: ReactNode; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="text-[1.75rem] leading-tight sm:text-3xl">{title}</h1>
      <p className="mt-1 text-sm text-ink-3">Last updated {updated}</p>
      <div className="mt-5 text-[0.9375rem] leading-7 text-ink-2">{intro}</div>
      <div className="mt-8 space-y-8">{children}</div>
    </article>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-3 text-[0.9375rem] leading-7 text-ink-2 [&_a]:font-medium [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2 [&_b]:font-semibold [&_b]:text-ink [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">{children}</div>
    </section>
  );
}
