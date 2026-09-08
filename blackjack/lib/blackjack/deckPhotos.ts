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
