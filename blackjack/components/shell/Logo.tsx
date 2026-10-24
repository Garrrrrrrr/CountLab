import { cx } from "@/components/ui/cx";

/** The CountLab mark: a gold card with a spade pip. Same drawing as app/icon.svg. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={cx("shrink-0", className)}>
      <rect width="64" height="64" rx="15" fill="#15181E" />
      <rect x="17" y="11" width="30" height="42" rx="5.5" fill="#F5B93C" transform="rotate(-9 32 32)" />
      <path d="M32 21.5c-2.9 4.6-9.2 7.6-9.2 12.6 0 3.3 2.6 5.7 5.7 5.7 1.3 0 2.5-.4 3.3-1.2-.4 2.3-1.6 4.1-3.3 5.3h7c-1.7-1.2-2.9-3-3.3-5.3.8.8 2 1.2 3.3 1.2 3.1 0 5.7-2.4 5.7-5.7 0-5-6.3-8-9.2-12.6Z" fill="#15181E" transform="rotate(-9 32 32)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={30} />
      <span className="text-[1.0625rem] font-semibold tracking-tight">Count<span className="text-brand-text">Lab</span></span>
    </span>
  );
}
