"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * A page that used to live at this URL moved. Static hosting cannot send a
 * 301, so this replaces itself with the new address on load, keeping the query
 * string and hash: sign-in and password-reset links from older emails carry
 * their tokens there.
 */
export function LegacyRedirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    const target = `${to === "/" ? "/" : `${to}/`}${window.location.search}${window.location.hash}`;
    router.replace(target);
  }, [router, to]);
  return (
    <p className="py-16 text-center text-sm text-ink-2">
      This page has moved. <Link href={to} className="font-semibold text-ink underline underline-offset-2">Continue</Link>
    </p>
  );
}
