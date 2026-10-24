import { describe, expect, it } from "vitest";
import { DECK_ESTIMATION_PHOTOS, deckPhotoSet, drawDeckPhoto, DRILL_PHOTO_DECK_OPTIONS, nearestDeckPhoto, randomDeckPhoto } from "./deckPhotos";

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

describe("deck-estimation drill photo sets", () => {
  it("labels each distinct photo once, with the median of its recorded rounds", () => {
    const set = deckPhotoSet(2);
    expect(new Set(set.map((photo) => photo.file)).size).toBe(set.length);
    const tray = set.find((photo) => photo.file === "images/tray-0003.jpg")!;
    const labels = DECK_ESTIMATION_PHOTOS.filter((photo) => photo.numDecks === 2 && photo.file === tray.file).map((photo) => photo.decks);
    expect(tray.decks).toBeGreaterThanOrEqual(Math.min(...labels));
    expect(tray.decks).toBeLessThanOrEqual(Math.max(...labels));
  });

  it("offers only shoe sizes with enough distinct photos", () => {
    expect(DRILL_PHOTO_DECK_OPTIONS).not.toContain(1);
    expect(DRILL_PHOTO_DECK_OPTIONS).toEqual(expect.arrayContaining([2, 6, 8]));
  });

  it("never repeats a photo within a session until the set runs out", () => {
    const seen: string[] = [];
    let seed = 0.13;
    const rng = () => { seed = (seed * 9301 + 49297) % 233280 / 233280; return seed; };
    for (let index = 0; index < 10; index++) seen.push(drawDeckPhoto(6, seen, rng).file);
    expect(new Set(seen).size).toBe(10);
    const small = deckPhotoSet(2).map((photo) => photo.file);
    const next = drawDeckPhoto(2, small, rng);
    expect(next.numDecks).toBe(2);
    expect(next.file).not.toBe(small[small.length - 1]);
  });
});

describe("tray photos by discard depth", () => {
  it("gives every manifest file one depth that agrees with all its labels", async () => {
    const { TRAY_PHOTOS } = await import("./deckPhotos");
    const files = new Set(DECK_ESTIMATION_PHOTOS.map((photo) => photo.file));
    expect(TRAY_PHOTOS).toHaveLength(files.size);
    for (const photo of TRAY_PHOTOS) {
      for (const label of DECK_ESTIMATION_PHOTOS.filter((entry) => entry.file === photo.file)) {
        expect(Math.abs(label.numDecks - label.decks - photo.discarded)).toBeLessThan(0.085);
      }
    }
  });

  it("finds the nearest photo within a tenth of a deck across a six-deck shoe", async () => {
    const { trayPhotoFor } = await import("./deckPhotos");
    expect(trayPhotoFor(0.1)).toBeUndefined();
    for (let discarded = 0.5; discarded <= 5.5; discarded += 0.05) {
      expect(Math.abs(trayPhotoFor(discarded)!.discarded - discarded)).toBeLessThanOrEqual(0.1);
    }
  });

  it("only draws photos that leave cards in the shoe, without repeating", async () => {
    const { drawTrayPhoto, trayPhotosForShoe } = await import("./deckPhotos");
    const pool = trayPhotosForShoe(2);
    expect(pool.every((photo) => photo.discarded <= 1.75)).toBe(true);
    const seen: string[] = [];
    for (let index = 0; index < pool.length; index++) seen.push(drawTrayPhoto(2, seen).file);
    expect(new Set(seen).size).toBe(pool.length);
  });
});
