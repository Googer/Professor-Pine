import type { WayspotRow } from '../../src/domain/wayspots/kept.js';
import { parseBigEventFeed, parseMaxEventFeed } from '../../src/domain/time/max-events.js';
import { at, TEST_SPOT } from './parties.js';
import { MAX_ZONE } from './max-bosses.js';
import { maxBossServiceWith } from './max-boss-service.js';
import { readMaxEventFeed } from './max-events.js';
import type { SafetyOptions } from './meetup-safety-service.js';
import { raidEventsFixture } from './raid-events.js';
import { reportsWith } from './reports-service.js';
import { createTestContext } from './test-context.js';
import { MemoryUsers } from './users.js';
import { keptRow } from './wayspot-cases.js';
import { wayspotsWith } from './wayspots.js';

/** Thursday 2026-10-22, 14:00: an ordinary day, after the max feed was read (10-20). */
export const MAX_THURSDAY = at('2026-10-22T14:00');

/** The power spot of `TEST_SPOT`, kept as the Wayfarer import keeps it. */
export const SPOT_ROW = keptRow(1, {
  id: TEST_SPOT.id,
  kind: 'powerspot',
  title: 'Gazebo of the Park',
  lat: TEST_SPOT.lat,
  lon: TEST_SPOT.lon,
  address: '1 Park Lane, Pinewood, PA 15000, USA',
  image: null,
});

/**
 * Reporting max battles over the services, as `/max` and the map do (plan 8X-5): the reports'
 * services (`reportsWith`, without the moderators' channel unless `safety` names it), the max
 * bosses of the recorded feed, the recorded max and big events, the kept power spot `SPOT_ROW`
 * (and `rows` beside it), the members' settings of `made.userSettings`, in a context
 * (`createTestContext`) whose place search is built. The services read `Date.now()`: fake `Date`
 * to the day of the test (`MAX_THURSDAY`) before calling it.
 */
export async function maxReportingWith(
  safety: SafetyOptions = { moderation: null },
  rows: readonly WayspotRow[] = [],
) {
  const made = await reportsWith(safety);
  // The services read the faked Date, as the bot's read the clock (a battle is made when reported).
  Object.defineProperty(made.clock, 'now', { get: () => Date.now() });
  const bosses = await maxBossServiceWith();
  await bosses.service.sync();
  // The service's clock is the test's (Date is faked to the day of each test).
  bosses.state.now = Date.now();
  const { wayspots } = await wayspotsWith([SPOT_ROW, ...rows]);
  const feed = readMaxEventFeed();
  const { ctx, entries } = createTestContext({
    partyService: made.service,
    parties: made.store,
    regions: made.regions,
    attendance: made.attendance,
    maxBosses: bosses.service,
    maxBossAdmin: bosses.service,
    raidEvents: raidEventsFixture(MAX_ZONE, {
      max: parseMaxEventFeed(feed, MAX_ZONE).events,
      big: parseBigEventFeed(feed, MAX_ZONE),
    }),
    wayspots,
    users: new MemoryUsers(made.userSettings),
    maxBattles: made.maxes,
    meetupSafety: made.safety,
    reports: made.reports,
  });
  await ctx.placeFinder.built();
  // `entries` is the context's log; `logged` the services' (the reports' among them).
  return { ...made, ctx, entries, logged: made.entries, bosses };
}
