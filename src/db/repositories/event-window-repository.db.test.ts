import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  eventWindowCases,
  INTO_THE_WILD_LOCAL,
} from '../../../test/support/event-window-store-cases.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { EventWindowRepository } from './event-window-repository.js';

/** The event window of migration 049. */
describe('EventWindowRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  eventWindowCases(async () => {
    await db.deleteFrom('EventWindow').execute();
    return new EventWindowRepository(db);
  });

  it('trusts the moment over a wall-clock time a write of 2.0 left behind (fix round 1, M6)', async () => {
    await db.deleteFrom('EventWindow').execute();
    const store = new EventWindowRepository(db, 'America/New_York');
    await store.keep(INTO_THE_WILD_LOCAL);
    expect(await store.current()).toEqual(INTO_THE_WILD_LOCAL);
    // 2.0, going back, ends the window now and knows nothing of the wall-clock columns.
    const now = INTO_THE_WILD_LOCAL.start + 3_600_000;
    await db
      .updateTable('EventWindow')
      .set({ endsAt: String(now) })
      .execute();
    const { endLocal: _gone, ...rest } = INTO_THE_WILD_LOCAL;
    expect(await store.current()).toEqual({ ...rest, end: now });
  });
});
