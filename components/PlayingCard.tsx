import { Card } from "@/lib/blackjack/types";

const glyph = {
  spades: "\u2660",
  hearts: "\u2665",
  diamonds: "\u2666",
  clubs: "\u2663",
};

export function PlayingCard({
  card,
  hidden = false,
  size = "md",
  animated = false,
  fast = false,
  dealIndex = 0,
  flip = false,
}: {
  card?: Card;
  hidden?: boolean;
  size?: "sm" | "md" | "lg" | "table";
  animated?: boolean;
  fast?: boolean;
  dealIndex?: number;
  flip?: boolean;
}) {
  const scale =
      size === "table"
        ? "h-20 w-14 text-base lg:h-28 lg:w-20 lg:text-2xl 2xl:h-32 2xl:w-24 2xl:text-3xl"
        : size === "sm"
        ? "h-20 w-14 text-base"
        : size === "lg"
          ? "h-44 w-32 text-4xl"
          : "h-32 w-24 text-2xl",
    cornerOffset =
      size === "sm" || size === "table" ? "p-1.5 lg:p-2" : "p-2";

  if (hidden || !card)
    return (
      <div
        aria-label="Hidden card"
        style={animated ? { animationDelay: `${dealIndex * (fast ? 110 : 320)}ms` } : undefined}
        className={`${scale} ${animated ? fast ? "casino-deal-fast" : "casino-deal" : ""} shrink-0 rounded-xl border border-emerald-500/40 bg-[repeating-linear-gradient(45deg,#163d31,#163d31_5px,#0e2c24_5px,#0e2c24_10px)] shadow-xl ring-4 ring-white`}
      />
    );

  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <div
      aria-label={`${card.rank} of ${card.suit}`}
      style={animated && !flip ? { animationDelay: `${dealIndex * (fast ? 110 : 320)}ms` } : undefined}
      className={`${scale} ${flip ? fast ? "casino-card-flip-fast" : "casino-card-flip" : animated ? fast ? "casino-deal-fast" : "casino-deal" : ""} relative shrink-0 select-none overflow-hidden rounded-xl bg-[#f7f3e9] font-semibold ${red ? "text-red-600" : "text-zinc-950"} shadow-[0_12px_30px_#0008] ring-1 ring-black/20`}
    >
      <span className={`absolute left-0 top-0 ${cornerOffset} leading-[.8]`}>
        {card.rank}
        <small className="mt-0.5 block text-[.72em] leading-none">
          {glyph[card.suit]}
        </small>
      </span>
      <span className="absolute inset-0 grid place-items-center text-[1.45em] leading-none">
        {glyph[card.suit]}
      </span>
      <span
        className={`absolute bottom-0 right-0 rotate-180 ${cornerOffset} leading-[.8]`}
      >
        {card.rank}
        <small className="mt-0.5 block text-[.72em] leading-none">
          {glyph[card.suit]}
        </small>
      </span>
    </div>
  );
}
