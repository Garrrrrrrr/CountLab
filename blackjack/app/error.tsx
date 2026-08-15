"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, GhostButton, Panel } from "@/components/ui";
import { reportHandledError } from "@/lib/analytics";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[countlab] unhandled error", error);
    reportHandledError("ReactErrorBoundary", error, "app/error");
  }, [error]);

  return (
    <Panel className="py-20 text-center">
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-zinc-400">An unexpected error occurred. You can try again, or head back to the dashboard.</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/dashboard">
          <GhostButton>Back to dashboard</GhostButton>
        </Link>
      </div>
    </Panel>
  );
}
