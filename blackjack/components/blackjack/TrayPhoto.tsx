"use client";
import { useState } from "react";
import { Expand } from "lucide-react";
import { trayPhotoSrc, type TrayPhoto as TrayPhotoData } from "@/lib/blackjack/deckPhotos";
import { Sheet } from "@/components/ui/Sheet";
import { cx } from "@/components/ui/cx";

/** The photos are 629×848. */
const RATIO = 848 / 629;

/**
 * A real photo of the discard tray. Every exercise that asks how many decks are
 * left shows one of these rather than a drawing, because estimating from a
 * real stack of cards is the skill being trained.
 *
 * `photo` undefined renders an empty tray: before the first half deck is
 * discarded there is no honest picture to show.
 */
export function TrayPhoto({ photo, label = "Discard tray", width, className, zoomable = true, priority = false, caption }: {
  photo: TrayPhotoData | undefined;
  label?: string;
  /** Rendered width in px. Leave unset to fill the container. */
  width?: number;
  className?: string;
  zoomable?: boolean;
  priority?: boolean;
  caption?: React.ReactNode;
}) {
  const [zoom, setZoom] = useState(false);
  const [loaded, setLoaded] = useState<string | null>(null);
  const style = width ? { width, height: Math.round(width * RATIO) } : { aspectRatio: `629 / 848` };
  const body = photo ? (
    // A plain <img>: the export has no image optimizer, and these files are already sized for the web.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={trayPhotoSrc(photo)}
      alt={`${label}: photo of the discard tray`}
      width={629}
      height={848}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      onLoad={() => setLoaded(photo.file)}
      className={cx("h-full w-full select-none object-cover transition-opacity duration-200", loaded === photo.file ? "opacity-100" : "opacity-0")}
    />
  ) : (
    <div className="grid h-full w-full place-items-center bg-[linear-gradient(180deg,#2a2f37,#1a1d23)] p-3 text-center text-xs font-medium text-white/70">Tray still empty</div>
  );
  return (
    <figure className={cx("relative m-0 shrink-0", className)} style={width ? { width } : undefined}>
      <div className="relative overflow-hidden rounded-2xl border border-line bg-[#2b2e33]" style={style}>
        {body}
        {photo && zoomable && (
          <button type="button" onClick={() => setZoom(true)} aria-label="Enlarge tray photo"
            className="absolute bottom-1.5 right-1.5 grid h-8 w-8 place-items-center rounded-lg bg-black/45 text-white backdrop-blur-sm hover:bg-black/60">
            <Expand size={15} aria-hidden />
          </button>
        )}
      </div>
      {caption && <figcaption className="mt-1.5 text-center text-xs text-ink-3">{caption}</figcaption>}
      {photo && zoomable && (
        <Sheet open={zoom} onClose={() => setZoom(false)} title={label} size="md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={trayPhotoSrc(photo)} alt={`${label}, enlarged`} width={629} height={848} className="mx-auto max-h-[70dvh] w-auto rounded-2xl" />
        </Sheet>
      )}
    </figure>
  );
}
