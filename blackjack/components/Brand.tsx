/** The CountLab mark: an ace of spades on the felt-green tile used by the app icon. */
export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dimensions = size === "lg" ? "h-14 w-14 rounded-2xl text-2xl" : size === "sm" ? "h-8 w-8 rounded-[.65rem] text-sm" : "h-10 w-10 rounded-[.9rem] text-lg";
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center bg-gradient-to-br from-[#b4f27d] to-[#65c875] font-bold text-[#112010] shadow-[0_8px_24px_rgba(81,190,102,.22)] ${dimensions}`}>
      A♠
    </span>
  );
}

export function BrandLockup({ tagline = "Blackjack studio" }: { tagline?: string }) {
  return (
    <span className="flex items-center gap-3">
      <BrandMark />
      <span className="min-w-0">
        <b className="block tracking-[-.02em]">CountLab</b>
        <small className="block text-[var(--ink-muted)]">{tagline}</small>
      </span>
    </span>
  );
}
