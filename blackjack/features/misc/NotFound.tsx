import { Compass } from "lucide-react";
import { ButtonLink, EmptyState } from "@/components/ui";

export function NotFound() {
  return (
    <EmptyState className="mt-10" icon={<Compass size={22} aria-hidden />} title="Page not found"
      action={<div className="flex flex-wrap justify-center gap-2"><ButtonLink href="/train">Train</ButtonLink><ButtonLink href="/charts" variant="secondary">Charts</ButtonLink></div>}>
      That address doesn&rsquo;t match anything on CountLab. It may have moved in the redesign.
    </EmptyState>
  );
}
