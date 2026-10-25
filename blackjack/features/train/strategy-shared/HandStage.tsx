"use client";
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type Ref } from "react";
import { cardName, PlayingCard } from "@/components/blackjack";
import { cx } from "@/components/ui";
import type { Card } from "@/lib/blackjack/types";

/** One width for every card on the stage: a fifth of a phone's width, held down on short screens, capped on desktop. */
const CARD_W = "min(19vw, 10.5dvh, 96px)";

/**
 * The felt: the dealer's upcard (with the hole card face down) above the
 * player's hand, as a table reads. Screen readers get one sentence for the
 * whole deal instead of a list of pictures.
 */
export function HandStage({ ref, upcard, cards, total, dealKey, animate = true, hold = false, badge, children, className }: {
  /** Focus lands here on a new hand, so a carried-over Enter never answers it. */
  ref?: Ref<HTMLElement>;
  upcard: Card;
  cards: Card[];
  /** "Soft 18", under the player's cards. */
  total?: string;
  /** Changes with every hand, so the deal animation replays. */
  dealKey: number | string;
  animate?: boolean;
  /**
   * Keep the felt at the height it had while the question was asked. The
   * explanation is taller than the action pad, so it rises over the empty
   * lower felt instead of shrinking the table and moving the cards.
   */
  hold?: boolean;
  /** Top-right of the felt: the true count, in the index drill. */
  badge?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const sizing = { "--card-w": CARD_W } as CSSProperties;
  const overlap = cards.length > 2;
  const own = useRef<HTMLElement | null>(null);
  const height = useRef<number | undefined>(undefined);
  useLayoutEffect(() => { if (!hold && own.current) height.current = own.current.offsetHeight; });
  const attach = (node: HTMLElement | null) => {
    own.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as { current: HTMLElement | null }).current = node;
  };
  return (
    <section ref={attach} tabIndex={-1} aria-label="Table" style={hold && height.current ? { height: height.current, flex: "none" } : undefined} className={cx("relative flex flex-col justify-start overflow-hidden rounded-3xl bg-gradient-to-b from-felt to-felt-2 px-4 pb-4 pt-5 text-white shadow-2 outline-none", className)}>
      <p className="sr-only">
        Dealer shows the {cardName(upcard)}. Your hand: {cards.map(cardName).join(", ")}{total ? `, ${total.toLowerCase()}` : ""}.
      </p>
      {badge && <div className="absolute right-3 top-3 z-10">{badge}</div>}
      <div aria-hidden className="flex flex-col items-center gap-2.5 min-[400px]:gap-5">
        <div className="flex flex-col items-center">
          <span className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-white/65">Dealer</span>
          <div key={`d-${dealKey}`} className="flex">
            <PlayingCard card={upcard} style={sizing} animate={animate} />
            <PlayingCard faceDown style={{ ...sizing, marginLeft: "calc(var(--card-w) * -0.42)" }} animate={animate} delay={60} />
          </div>
        </div>
        <div className="flex flex-col items-center">
          <div key={`p-${dealKey}`} className="flex">
            {cards.map((card, index) => (
              <PlayingCard key={index} card={card} animate={animate} delay={120 + index * 60}
                style={{ ...sizing, marginLeft: index ? (overlap ? "calc(var(--card-w) * -0.38)" : "calc(var(--card-w) * 0.12)") : undefined }} />
            ))}
          </div>
          <span className="mt-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-white/65">
            You{total && <span className="normal-case tracking-normal text-white/90"> · {total}</span>}
          </span>
        </div>
      </div>
      {children}
    </section>
  );
}
