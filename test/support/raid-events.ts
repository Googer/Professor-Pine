import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseRaidEventFeed, type RaidEvent } from '../../src/domain/time/raid-events.js';
import type { BigEvent, MaxEvent } from '../../src/domain/time/max-events.js';
import { allIn, type FeedTimed } from '../../src/domain/time/feed-times.js';
import type {
  MaxEventProvider,
  RaidEventProvider,
  ResearchEventProvider,
} from '../../src/services/raid-event-service.js';
import type { ResearchEvent } from '../../src/domain/time/research-events.js';

const fixtures = path.resolve(import.meta.dirname, '../fixtures');

/**
 * Eleven events of the feed as downloaded on 2026-10-11, without their pictures and details:
 * three Raid Hours (Wednesdays 14, 21 and 28 October 2026, 18:00 to 19:00), two Raid Days
 * (31 October and 28 November, 14:00 to 17:00) and six events of other kinds.
 */
export function readRaidEventFeed(): unknown {
  return JSON.parse(readFileSync(path.join(fixtures, 'raid-events.json'), 'utf8'));
}

/**
 * The Raid Hours and Raid Days of the fixture, read in the zone of the test settings; no max
 * event and no big event unless a test gives them (`max`, `big`: `parseMaxEventFeed`,
 * `parseBigEventFeed` of `readMaxEventFeed()`, or events of its own).
 */
export function raidEventsFixture(
  zone = 'America/New_York',
  extra: {
    max?: readonly MaxEvent[];
    big?: readonly BigEvent[];
    research?: readonly ResearchEvent[];
  } = {},
): RaidEventProvider & MaxEventProvider & ResearchEventProvider {
  const events: readonly RaidEvent[] = parseRaidEventFeed(readRaidEventFeed(), zone);
  const max = extra.max ?? [];
  const big = extra.big ?? [];
  const research = extra.research ?? [];
  // In another zone, as `RaidEventService` gives them (plan 19A-2: wall-clock times on its clock).
  const inZone = <T extends FeedTimed>(list: readonly T[], asked?: string): readonly T[] =>
    asked === undefined || asked === zone ? list : allIn(list, asked);
  return {
    events: (asked) => inZone(events, asked),
    maxEvents: (asked) => inZone(max, asked),
    bigEvents: (asked) => inZone(big, asked),
    researchEvents: (asked) => inZone(research, asked),
  };
}
