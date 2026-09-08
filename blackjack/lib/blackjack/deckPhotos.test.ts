import { describe, expect, it } from "vitest";
import { DECK_ESTIMATION_PHOTOS, nearestDeckPhoto, randomDeckPhoto } from "./deckPhotos";

describe("deck-estimation photos", () => {
  it("returns an exact labelled depth for the requested shoe", () => {
    const exact = DECK_ESTIMATION_PHOTOS.find((photo) => photo.numDecks === 6 && photo.decks === 5.5)!;
    expect(nearestDeckPhoto(6, exact.decks)).toEqual(exact);
  });

  it("picks the closer labelled depth between two photos", () => {
    const depths = [...new Set(DECK_ESTIMATION_PHOTOS.filter((photo) => photo.numDecks === 6).map((photo) => photo.decks))]
      .sort((left, right) => right - left);
    const upper = depths[0];
    const lower = depths[1];
    const closerToLower = lower + (upper - lower) * 0.25;
    expect(nearestDeckPhoto(6, closerToLower)?.decks).toBe(lower);
  });

  it("uses an empty-tray fallback before coverage starts and for one-deck shoes", () => {
    expect(nearestDeckPhoto(6, 6)).toBeUndefined();
    expect(nearestDeckPhoto(1, 0.5)).toBeUndefined();
  });

  it("never crosses shoe sizes", () => {
    for (const numDecks of [2, 6, 8]) {
      expect(nearestDeckPhoto(numDecks, 1)?.numDecks).toBe(numDecks);
    }
  });

  it("keeps random drill selections inside the requested shoe pool", () => {
    for (const numDecks of [1, 2, 6, 8]) {
      for (const rng of [() => 0, () => 0.499, () => 0.999]) {
        expect(randomDeckPhoto(numDecks, rng).numDecks).toBe(numDecks);
      }
    }
  });

  it("covers every card depth from the first photo through a 5/6 cut", () => {
    for (let cardsDealt = 26; cardsDealt <= 5 * 52; cardsDealt++) {
      expect(nearestDeckPhoto(6, 6 - cardsDealt / 52), `${cardsDealt} cards dealt`).toBeDefined();
    }
  });
});
