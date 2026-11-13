import { expect, it } from 'vitest';
import { geodataJson } from '../../src/domain/geo/google.js';
import type { GoogleAnswerStorage } from '../../src/services/google-answers.js';

/** An address as Google gave it (invented), with a name of more than ASCII. */
export const LOOKED_UP_GEODATA = geodataJson({
  route: 'Église Street',
  locality: 'Pinewood',
  formatted_address: '12 Église Street, Pinewood, PA 15000, USA',
});

/**
 * What the kept answers of Google do (plan 19B-3: by the point and the kind of question, never by
 * a gym's or a Wayspot's id), run against `GoogleAnswerRepository` and its twin
 * `MemoryGoogleAnswerStorage` alike. `made` gives an empty storage. Points come rounded
 * (`answerPoint`), as `GoogleAnswers` writes them.
 */
export function googleAnswerCases(made: () => Promise<GoogleAnswerStorage>): void {
  it('keeps each answer by its kind and point, a null for nothing found, and reads them all back', async () => {
    const storage = await made();
    expect(await storage.all()).toEqual([]);
    await storage.save([
      { kind: 'address', lat: 40.051234, lon: -80.051234, answer: LOOKED_UP_GEODATA, askedAt: 1 },
      // The same point, the other question: a row of its own.
      { kind: 'places', lat: 40.051234, lon: -80.051234, answer: 'Corner Bakery', askedAt: 2 },
      { kind: 'places', lat: 40.06, lon: -80.06, answer: null, askedAt: 1_793_000_000_000 },
    ]);
    const rows = await storage.all();
    expect([...rows].sort((a, b) => a.askedAt - b.askedAt)).toEqual([
      { kind: 'address', lat: 40.051234, lon: -80.051234, answer: LOOKED_UP_GEODATA, askedAt: 1 },
      { kind: 'places', lat: 40.051234, lon: -80.051234, answer: 'Corner Bakery', askedAt: 2 },
      { kind: 'places', lat: 40.06, lon: -80.06, answer: null, askedAt: 1_793_000_000_000 },
    ]);
  });

  it('keeps one answer per kind and point: the one saved last', async () => {
    const storage = await made();
    await storage.save([{ kind: 'places', lat: 40, lon: -80, answer: null, askedAt: 1 }]);
    await storage.save([{ kind: 'places', lat: 40, lon: -80, answer: 'Cafe Luna', askedAt: 2 }]);
    expect(await storage.all()).toEqual([
      { kind: 'places', lat: 40, lon: -80, answer: 'Cafe Luna', askedAt: 2 },
    ]);
  });

  it('removes answers by their kind and point, each only while it is the one kept there', async () => {
    const storage = await made();
    const kept = { kind: 'places' as const, lat: 40.051234, lon: -80.051234, answer: 'Cafe' };
    await storage.save([
      { ...kept, askedAt: 1 },
      // The other question at the point, and another point: neither is removed.
      { kind: 'address', lat: 40.051234, lon: -80.051234, answer: null, askedAt: 1 },
      { kind: 'places', lat: 40.06, lon: -80.06, answer: 'Mill', askedAt: 1 },
      { kind: 'places', lat: 40.07, lon: -80.07, answer: 'Dock', askedAt: 5 },
    ]);
    // The answer at 40.07 was asked anew (at 6) after the one to remove was read (at 5).
    await storage.save([{ kind: 'places', lat: 40.07, lon: -80.07, answer: 'Pier', askedAt: 6 }]);
    await storage.remove([
      { ...kept, askedAt: 1 },
      { kind: 'places', lat: 40.07, lon: -80.07, answer: 'Dock', askedAt: 5 },
    ]);
    await storage.remove([]);
    const rows = await storage.all();
    expect([...rows].sort((a, b) => a.lat - b.lat || a.kind.localeCompare(b.kind))).toEqual([
      { kind: 'address', lat: 40.051234, lon: -80.051234, answer: null, askedAt: 1 },
      { kind: 'places', lat: 40.06, lon: -80.06, answer: 'Mill', askedAt: 1 },
      { kind: 'places', lat: 40.07, lon: -80.07, answer: 'Pier', askedAt: 6 },
    ]);
  });

  it('saves nothing for an empty list', async () => {
    const storage = await made();
    await storage.save([]);
    expect(await storage.all()).toEqual([]);
  });
}
