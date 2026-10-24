"use client";
import { EmptyState, PageHeader } from "@/components/ui";
import { pageInfo } from "@/lib/routes";

/** Placeholder until this feature is built. */
export function ProgressPage() {
  const info = pageInfo("/progress");
  return <><PageHeader title={info.title} sub={info.description} /><EmptyState title="Coming soon" /></>;
}
