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
