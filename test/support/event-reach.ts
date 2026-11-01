import { readFileSync } from 'node:fs';
import path from 'node:path';

const fixtures = path.resolve(import.meta.dirname, '../fixtures');

/**
 * Nine items of ScrapedDuck's events feed (`events.json`) as fetched on 2026-10-24 (plan 8R-7),
 * cut to the fields the readers read (`eventID`, `name`, `eventType`, `link`, `start`, `end`,
 * `extraData.generic` and a community day's `extraData.communityday.spawns`), values unchanged:
 * Pokémon Night Out 2026 - Los Angeles (`event`, UTC times), City Safari: Boston (Rescheduled)
 * (`city-safari`, local times, `hasFieldResearchTasks`: the staging's finding F1), Wild Area 2026
 * Mexico City (UTC) and Global (local), Into the Wild (`event`, research), Pawniard Community Day
 * (research, its spawns), and GO Tour Alola's Kaohsiung and Los Angeles (UTC) and Global (local).
 */
/**
 * GO Fest 2025's Max Finale as ScrapedDuck listed it (the review of plan 8R-7, W1): a GO Fest
 * for every member, at local times, with field research and spawns, whose id and name say no
 * "global". Matt's rule of 2026-10-24 reads it (local times are enough for a Wild Area, GO Tour
 * or GO Fest). The fields are those the readers read; the hours are the event's, Saturday and
 * Sunday 10:00 to 18:00.
 */
export const MAX_FINALE = {
  eventID: 'pokemon-go-fest-2025-max-finale',
  name: 'Pokémon GO Fest 2025: Max Finale',
  eventType: 'pokemon-go-fest',
  link: 'https://leekduck.com/events/pokemon-go-fest-2025-max-finale/',
  start: '2025-08-23T10:00:00.000',
  end: '2025-08-24T18:00:00.000',
  extraData: { generic: { hasSpawns: true, hasFieldResearchTasks: true } },
};

export function readEveryoneFeed(): unknown {
  return JSON.parse(
    readFileSync(path.join(fixtures, 'scrapedduck-events-2026-10-24.json'), 'utf8'),
  );
}
