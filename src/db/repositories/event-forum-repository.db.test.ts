import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  eventForumCases,
  listedEvent,
  listedEventCases,
} from '../../../test/support/event-forum-store-cases.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { createTestLogger } from '../../../test/support/test-logger.js';
import type { DB } from '../types.js';
import { EventForumRepository } from './event-forum-repository.js';
import { ListedEventRepository } from './listed-event-repository.js';

/** The events forum's tables of plan 8V-1 (migration 033). */
describe('EventForumRepository and ListedEventRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  describe('EventForumRepository', () => {
    eventForumCases(async () => {
      await db.deleteFrom('EventPost').execute();
      await db.deleteFrom('EventForum').execute();
      return new EventForumRepository(db);
    });
  });

  describe('ListedEventRepository', () => {
    listedEventCases(async () => {
      await db.deleteFrom('ListedEvent').execute();
      return new ListedEventRepository(db);
    });

    it('leaves out a row it cannot read, and says so', async () => {
      await db.deleteFrom('ListedEvent').execute();
      const { log, entries } = createTestLogger();
      const store = new ListedEventRepository(db, log);
      await store.replace([listedEvent()]);
      await db
        .insertInto('ListedEvent')
        .values({
          eventId: 'broken',
          eventType: 'event',
          name: 'Broken',
          startsAt: '1',
          endsAt: '2',
          formerIds: JSON.stringify({ not: 'a list' }),
        })
        .execute();
      expect((await store.all()).map((event) => event.id)).toEqual([listedEvent().id]);
      expect(entries).toContainEqual(
        expect.objectContaining({ msg: 'a kept listed event cannot be read; left out' }),
      );
    });
  });
});
