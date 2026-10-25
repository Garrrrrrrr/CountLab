"use client";
import { useRef, type ReactNode } from "react";
import { TrayPhoto } from "@/components/blackjack";
import { cx } from "@/components/ui/cx";
import type { TrayPhoto as TrayPhotoData } from "@/lib/blackjack/deckPhotos";
import { useElementSize } from "./hooks";

/** Every tray photo is 629 × 848. */
const RATIO = 848 / 629;

/**
 * A tray photo as large as the space it is given: the slot grows to fill
 * what the question leaves above the keypad, and the photo takes the largest
 * size that fits it whole. The photo sits outside the flow, so it never
 * pushes the keypad off the screen.
 *
 * `freeze` stops it growing (the verdict is shorter than the keypad, and a
 * photo that jumps in size while it is being reviewed is distracting).
 */
export function FitTray({ photo, label, freeze = false, overlay, className, maxWidth = 460 }: {
  photo: TrayPhotoData | undefined;
  label: string;
  freeze?: boolean;
  overlay?: ReactNode;
  className?: string;
  maxWidth?: number;
}) {
  const [slot, size] = useElementSize<HTMLDivElement>();
  const frozen = useRef(0);
  const fitted = size ? Math.floor(Math.min(size.width, maxWidth, size.height / RATIO)) : 0;
  if (!freeze && fitted > 0) frozen.current = fitted;
  // Frozen, the photo may still shrink (a long verdict on a short phone) but never grows.
  const width = freeze && frozen.current ? Math.min(frozen.current, fitted || frozen.current) : fitted;
  return (
    <div ref={slot} className={cx("relative min-h-[10.5rem] flex-1", className)}>
      {/* Top-aligned: the verdict is shorter than the keypad, and a centred photo would drop as its slot grows. */}
      <div className="absolute inset-0 flex items-start justify-center">
        {width > 40 && (
          <div className="relative">
            <TrayPhoto photo={photo} width={width} label={label} priority />
            {overlay}
          </div>
        )}
      </div>
    </div>
  );
}
