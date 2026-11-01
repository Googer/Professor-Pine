import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { MemorySpawnReports } from '../../../test/support/spawn-reports.js';
import type { DB } from '../types.js';
import { SpawnReportRepository, type SpawnReportStorage } from './spawn-report-repository.js';

const CHANNEL = '512345678901234567';
const FIRST = '612345678901234567';
const SECOND = '612345678901234568';
const NOW = 1_800_000_000_000;

describe('SpawnReportRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('SpawnReport').execute();
  });

  const stores: [string, () => SpawnReportStorage][] = [
    ['the repository', () => new SpawnReportRepository(db)],
    ['its twin in memory', () => new MemorySpawnReports()],
  ];

  describe.each(stores)('%s', (_name, make) => {
    it('lists what was recorded, the one due first at the head', async () => {
      const store = make();
      expect(await store.all()).toEqual([]);
      await store.add({ channelId: CHANNEL, messageId: SECOND, deleteAt: NOW + 2 });
      await store.add({ channelId: CHANNEL, messageId: FIRST, deleteAt: NOW + 1 });
      expect(await store.all()).toEqual([
        { channelId: CHANNEL, messageId: FIRST, deleteAt: NOW + 1 },
        { channelId: CHANNEL, messageId: SECOND, deleteAt: NOW + 2 },
      ]);
    });

    it('keeps a report that is recorded again as it was', async () => {
      const store = make();
      await store.add({ channelId: CHANNEL, messageId: FIRST, deleteAt: NOW });
      await store.add({ channelId: SECOND, messageId: FIRST, deleteAt: NOW + 9 });
      expect(await store.all()).toEqual([{ channelId: CHANNEL, messageId: FIRST, deleteAt: NOW }]);
    });

    it('forgets a report, and copes with one it does not know', async () => {
      const store = make();
      await store.add({ channelId: CHANNEL, messageId: FIRST, deleteAt: NOW });
      await store.remove(FIRST);
      await store.remove(FIRST);
      expect(await store.all()).toEqual([]);
    });
  });
});
