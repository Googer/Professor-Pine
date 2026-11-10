import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { maxEventCases, feedMaxEvents } from '../../../test/support/max-event-store-cases.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { createTestLogger } from '../../../test/support/test-logger.js';
import type { DB } from '../types.js';
import { MaxEventRepository } from './max-event-repository.js';

/** The kept max and big events of plan 8X-F (migration 029). */
describe('MaxEventRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  maxEventCases(async () => {
    await db.deleteFrom('MaxEvent').execute();
    return new MaxEventRepository(db);
  });

  it('leaves out a row it cannot read, and says so', async () => {
    await db.deleteFrom('MaxEvent').execute();
    const { log, entries } = createTestLogger();
    const store = new MaxEventRepository(db, log);
    const [event] = feedMaxEvents();
    if (!event) throw new Error('no max event in the feed');
    await store.replace({ max: [event], big: [] });
    await db
      .insertInto('MaxEvent')
      .values({
        kind: 'max-week',
        eventId: 'max-week-2026',
        name: 'Max Week',
        startsAt: '1',
        endsAt: '2',
        featured: null,
      })
      .execute();
    await db
      .insertInto('MaxEvent')
      .values({
        kind: 'max-monday',
        eventId: 'max-mondays-1999-01-04',
        name: 'Dynamax Abra during Max Monday',
        startsAt: '1',
        endsAt: '2',
        featured: JSON.stringify({ names: 'Abra' }),
      })
      .execute();
    expect(await store.all()).toEqual({ max: [event], big: [] });
    expect(
      entries.filter((entry) => entry.msg === 'a kept max event cannot be read; left out'),
    ).toHaveLength(2);
  });
});
