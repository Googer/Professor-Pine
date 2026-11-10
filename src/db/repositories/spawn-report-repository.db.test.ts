import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { MemorySpawnReports } from '../../../test/support/spawn-reports.js';
import type { Place } from '../../domain/geo/place.js';
import type { DB } from '../types.js';
import {
  SpawnReportRepository,
  type ShownSpawn,
  type SpawnReportStorage,
} from './spawn-report-repository.js';

const CHANNEL = '512345678901234567';
const FIRST = '612345678901234567';
const SECOND = '612345678901234568';
const THIRD = '612345678901234569';
const NOW = 1_800_000_000_000;
const GUILD = '412345678901234567';
const OTHER_GUILD = '412345678901234568';

/** What the map shows of a report: Dratini with perfect IVs near The Stacks. */
const SHOWN: ShownSpawn = {
  guildId: GUILD,
  pokemon: { key: 'dratini', name: 'Dratini' },
  costumed: false,
  iv: 'perfect',
  details: 'by the bench',
  reporterName: 'Alice',
  image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm147.icon.png',
  near: {
    kind: 'gym',
    id: '1',
    title: 'The Stacks',
    lat: 40.05,
    lon: -80.05,
    address: '1 Library Lane',
    image: null,
  },
  madeAt: NOW - 2_000,
};

/** A dropped pin near a PokéStop. */
const PIN: Place = {
  kind: 'pin',
  lat: 40.02,
  lon: -80.02,
  near: { kind: 'stop', title: 'Yellow Mural' },
  linkName: null,
};

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

    it("lists a server's reports that stand with what the map shows of them, the one due first at the head", async () => {
      const store = make();
      await store.add({
        channelId: CHANNEL,
        messageId: SECOND,
        deleteAt: NOW + 2_000,
        shown: { ...SHOWN, madeAt: NOW - 1_000, near: PIN },
      });
      await store.add({
        channelId: CHANNEL,
        messageId: FIRST,
        deleteAt: NOW + 1_000,
        shown: SHOWN,
      });
      // Another server's, one gone by its time, and one of before the map kept anything.
      await store.add({
        channelId: CHANNEL,
        messageId: THIRD,
        deleteAt: NOW + 5,
        shown: { ...SHOWN, guildId: OTHER_GUILD },
      });
      await store.add({ channelId: CHANNEL, messageId: '7', deleteAt: NOW, shown: SHOWN });
      await store.add({ channelId: CHANNEL, messageId: '8', deleteAt: NOW + 9 });
      expect(await store.standing(GUILD, NOW)).toEqual([
        { channelId: CHANNEL, messageId: FIRST, deleteAt: NOW + 1_000, ...SHOWN },
        {
          channelId: CHANNEL,
          messageId: SECOND,
          deleteAt: NOW + 2_000,
          ...SHOWN,
          madeAt: NOW - 1_000,
          near: PIN,
        },
      ]);
      // `all` is what the sweep reads: every row, as before.
      expect((await store.all()).map((row) => row.messageId)).toEqual([
        '7',
        THIRD,
        '8',
        FIRST,
        SECOND,
      ]);
    });

    it('keeps the plain facts of a report without its extras: no IVs, details, name, picture or place', async () => {
      const store = make();
      const bare = {
        ...SHOWN,
        costumed: true,
        iv: null,
        details: null,
        reporterName: null,
        image: null,
        near: null,
      };
      await store.add({ channelId: CHANNEL, messageId: FIRST, deleteAt: NOW + 1, shown: bare });
      expect(await store.standing(GUILD, NOW)).toEqual([
        { channelId: CHANNEL, messageId: FIRST, deleteAt: NOW + 1, ...bare },
      ]);
    });
  });
});
