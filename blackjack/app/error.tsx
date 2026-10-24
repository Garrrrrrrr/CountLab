"use client";
import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Button, ButtonLink, EmptyState } from "@/components/ui";
import { reportHandledError } from "@/lib/analytics";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[countlab] unhandled error", error);
    reportHandledError("ReactErrorBoundary", error, "app/error");
  }, [error]);
  return (
    <EmptyState className="mt-10" icon={<RotateCcw size={22} aria-hidden />} heading="h1" title="Something went wrong"
      action={<div className="flex gap-2"><Button onClick={reset}>Try again</Button><ButtonLink href="/" variant="secondary">Go home</ButtonLink></div>}>
      This page hit an unexpected error. Your saved training and journal are not affected.
    </EmptyState>
  );
}
