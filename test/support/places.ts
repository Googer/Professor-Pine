import type { Place } from '../../src/domain/geo/nominatim.js';
import type { Box } from '@pine/wayspot-core/region-membership';
import { bestPlace } from '../../src/domain/geo/nominatim.js';
import type { PlaceOutcome, PlaceSearch } from '../../src/services/place-search.js';

/**
 * Nominatim as a test wants it: nothing leaves the process. A search is answered with the
 * largest of the places of `found` under its text (lower case; none when there are none) and
 * their count, as the real one answers, or with `failing`.
 * Every search is recorded in `asked`. Like the real one it never throws and never answers in
 * the same turn of the event loop.
 */
export class FakePlaces implements PlaceSearch {
  enabled = true;
  readonly found = new Map<string, Place[]>();
  readonly asked: { text: string; box: Box }[] = [];
  failing: Extract<PlaceOutcome, { ok: false }> | undefined;

  search(text: string, box: Box): Promise<PlaceOutcome> {
    this.asked.push({ text, box });
    const places = this.found.get(text.trim().toLowerCase()) ?? [];
    const outcome: PlaceOutcome = this.failing ?? {
      ok: true,
      place: bestPlace(places),
      found: places.length,
    };
    return new Promise((resolve) => {
      setImmediate(() => {
        resolve(outcome);
      });
    });
  }
}
