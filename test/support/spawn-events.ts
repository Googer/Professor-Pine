import { readFileSync } from 'node:fs';
import path from 'node:path';

const fixtures = path.resolve(import.meta.dirname, '../fixtures');

/**
 * ScrapedDuck's events feed (`events.json`) as fetched once for plan 8R-4 on 2026-10-22, whole and
 * unchanged: Halloween 2026 Part I and Part II (`event`, `generic.hasSpawns`, their spawns on
 * their Leek Duck pages), Pawniard Community Day (2026-11-21, `extraData.communityday.spawns`),
 * the Teddiursa Spotlight Hour of 2026-11-05 (`extraData.spotlight.list`, a costumed Teddiursa),
 * Wild Areas, City Safaris and Pokémon Night Outs (location-bound), a season, Raid Hours and Max
 * Mondays.
 */
export function readSpawnEventFeed(): unknown {
  return JSON.parse(
    readFileSync(path.join(fixtures, 'scrapedduck-events-2026-10-22.json'), 'utf8'),
  );
}

/** A Leek Duck event page of `test/fixtures/`, cut to the sections read (plan 8R-4). */
export function readEventPage(
  file: 'leekduck-event-halloween-2026-part-1.html' | 'leekduck-event-spotlight-2026-11-05.html',
): string {
  return readFileSync(path.join(fixtures, file), 'utf8');
}
