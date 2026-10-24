import rawDeckEstimationPhotos from "../../public/deck-estimation/manifest.json";

export interface DeckPhoto {
  file: string;
  /** Labelled number of decks remaining in the shoe. */
  decks: number;
  numDecks: number;
}

export const DECK_ESTIMATION_PHOTOS = rawDeckEstimationPhotos as DeckPhoto[];
export const PHOTO_DECK_OPTIONS = Array.from(new Set(DECK_ESTIMATION_PHOTOS.map((photo) => photo.numDecks))).sort((a, b) => a - b);
export const PHOTO_UNIQUE_COUNT = new Set(DECK_ESTIMATION_PHOTOS.map((photo) => photo.file)).size;

/** Selects a recorded round uniformly, preserving the drill's existing weighting. */
export function randomDeckPhoto(numDecks: number, rng: () => number = Math.random): DeckPhoto {
  const matching = DECK_ESTIMATION_PHOTOS.filter((photo) => photo.numDecks === numDecks);
  const pool = matching.length ? matching : DECK_ESTIMATION_PHOTOS;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

/**
 * Finds the closest honest tray image for a live shoe.
 *
 * A shoe needs more than one unique photo to provide useful visual coverage.
 * Before the first labelled depth, the physical tray is emptier than any
 * available photo, so callers receive `undefined` and render an empty tray.
 */
export function nearestDeckPhoto(numDecks: number, decksRemaining: number): DeckPhoto | undefined {
  const matching = DECK_ESTIMATION_PHOTOS.filter((photo) => photo.numDecks === numDecks);
  if (new Set(matching.map((photo) => photo.file)).size < 2) return undefined;
  const earliest = Math.max(...matching.map((photo) => photo.decks));
  if (decksRemaining > earliest) return undefined;
  return matching.reduce((nearest, photo) =>
    Math.abs(photo.decks - decksRemaining) < Math.abs(nearest.decks - decksRemaining) ? photo : nearest,
  );
}

/**
 * The fewest distinct photos a shoe size needs before the Deck Estimation
 * drill offers it; with fewer, a session is the same picture over and over.
 */
export const MIN_DRILL_PHOTOS = 5;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2));
};

/**
 * One entry per distinct photo of a shoe size. Most photos were labelled in
 * several recorded rounds with slightly different depths (1.31–1.37 decks),
 * so each gets the median label: the same picture always has the same answer.
 */
export function deckPhotoSet(numDecks: number): DeckPhoto[] {
  const labels = new Map<string, number[]>();
  for (const photo of DECK_ESTIMATION_PHOTOS) {
    if (photo.numDecks !== numDecks) continue;
    labels.set(photo.file, [...(labels.get(photo.file) ?? []), photo.decks]);
  }
  return [...labels].map(([file, decks]) => ({ file, decks: median(decks), numDecks }));
}

/** Shoe sizes with enough distinct photos for a drill session. */
export const DRILL_PHOTO_DECK_OPTIONS = PHOTO_DECK_OPTIONS.filter((decks) => deckPhotoSet(decks).length >= MIN_DRILL_PHOTOS);

/**
 * The next tray for a session: a photo not yet shown in it, so a 10-photo
 * session never repeats a picture. Once every photo has been shown (a long
 * session on a small set), any photo but the one just shown.
 */
export function drawDeckPhoto(numDecks: number, seen: readonly string[], rng: () => number = Math.random): DeckPhoto {
  const set = deckPhotoSet(numDecks);
  const pool = set.length ? set : deckPhotoSet(DRILL_PHOTO_DECK_OPTIONS[0] ?? PHOTO_DECK_OPTIONS[0]);
  const fresh = pool.filter((photo) => !seen.includes(photo.file));
  const candidates = fresh.length ? fresh : pool.length > 1 ? pool.filter((photo) => photo.file !== seen[seen.length - 1]) : pool;
  return candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
}

/** One discard-tray photo and the decks it shows in the tray. */
export interface TrayPhoto {
  file: string;
  /** Decks sitting in the discard tray in this picture. */
  discarded: number;
}

/**
 * Every photo once, by how many decks it shows discarded.
 *
 * The manifest labels each recorded round with decks *remaining* for the shoe
 * it was dealt from, so one picture appears under several shoe sizes (tray-0001
 * is 0.5 remaining of one deck, 1.5 of two, 5.5 of six). What the picture
 * actually shows is the shoe size minus that label, and those agree to within
 * 0.08 decks for every photo — so the discard depth is the photo's real
 * property, and one set serves every shoe size.
 */
export const TRAY_PHOTOS: readonly TrayPhoto[] = (() => {
  const depths = new Map<string, number[]>();
  for (const photo of DECK_ESTIMATION_PHOTOS) depths.set(photo.file, [...(depths.get(photo.file) ?? []), photo.numDecks - photo.decks]);
  return [...depths]
    .map(([file, values]) => ({ file, discarded: Number(median(values).toFixed(2)) }))
    .sort((a, b) => a.discarded - b.discarded);
})();

/** Public URL of a photo, from its manifest path. */
export const trayPhotoSrc = (photo: { file: string }) => `/deck-estimation/${photo.file}`;

/**
 * The photo closest to a live discard depth, or undefined while the tray is
 * still emptier than the shallowest photo (half a deck), when the honest
 * picture is an empty tray.
 */
export function trayPhotoFor(discarded: number): TrayPhoto | undefined {
  if (discarded < TRAY_PHOTOS[0].discarded - 0.25) return undefined;
  return TRAY_PHOTOS.reduce((nearest, photo) => (Math.abs(photo.discarded - discarded) < Math.abs(nearest.discarded - discarded) ? photo : nearest));
}

/**
 * Photos that make sense for a shoe of `numDecks`: at least a quarter deck
 * must still be in the shoe, or there is nothing left to deal.
 */
export const trayPhotosForShoe = (numDecks: number): TrayPhoto[] => TRAY_PHOTOS.filter((photo) => photo.discarded <= numDecks - 0.25);

/**
 * The next photo for a drill session: one not yet shown this session, so a
 * set never repeats until it runs out, and never the one just shown.
 */
export function drawTrayPhoto(numDecks: number, seen: readonly string[], rng: () => number = Math.random): TrayPhoto {
  const pool = trayPhotosForShoe(numDecks);
  const usable = pool.length ? pool : [...TRAY_PHOTOS];
  const fresh = usable.filter((photo) => !seen.includes(photo.file));
  const candidates = fresh.length ? fresh : usable.length > 1 ? usable.filter((photo) => photo.file !== seen[seen.length - 1]) : usable;
  return candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
}
