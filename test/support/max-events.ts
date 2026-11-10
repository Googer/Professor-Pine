import { readFileSync } from 'node:fs';
import path from 'node:path';

const fixtures = path.resolve(import.meta.dirname, '../fixtures');

/**
 * ScrapedDuck's events feed as downloaded on 2026-10-20 at 21:54, its max events kept unchanged
 * (six `max-mondays`, one of them "Dynamax Sneasel during Max Monday" without hours and one
 * "Max Monday: Pokémon to be announced"; one `max-battles`, the lake trio's Max Battle Day of
 * 2026-10-24 14:00 to 17:00), the `event` "Dynamax Trails" and one Raid Hour (Palkia, 2026-10-21);
 * and (plan 8X-3) its three `wild-area` and three `pokemon-go-tour` events unchanged: the global
 * Wild Area 2026 (2026-11-14 10:00 to 11-15 18:00) and GO Tour Alola (2027-02-27 to 28) in local
 * time, and the in-person city editions in UTC. Plan 8R-1 added, unchanged from the feed of
 * 2026-10-21 at 21:40, its two events with field research of their own (`extraData.generic.
 * hasFieldResearchTasks`): Into the Wild (`event`, 2026-11-09 10:00 to 11-13 20:00, several
 * days) and Pawniard Community Day (2026-11-21 14:00 to 17:00, one day).
 */
export function readMaxEventFeed(): unknown {
  return JSON.parse(readFileSync(path.join(fixtures, 'max-events.json'), 'utf8'));
}
