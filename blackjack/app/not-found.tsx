import Link from "next/link";
import { Button, Panel } from "@/components/ui";

export default function NotFound() {
  return (
    <Panel className="py-20 text-center">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="mt-2 text-zinc-400">The page you&apos;re looking for doesn&apos;t exist or may have moved.</p>
      <Link href="/dashboard">
        <Button className="mt-5">Back to dashboard</Button>
      </Link>
    </Panel>
  );
}
