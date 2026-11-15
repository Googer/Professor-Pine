import { CompiledQuery, sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import { createDb } from '../kysely.js';
import { DEPRECATED_SYNTAX, lastWarnings } from '../../../test/support/mysql-warnings.js';
import { MemoryWayfarer } from '../../../test/support/wayfarer.js';
import {
  CANDIDATE,
  wayfarerStorageCases,
  type WayfarerSetup,
} from '../../../test/support/wayfarer-cases.js';
import type { ReviewItem } from '../../domain/wayspots/review.js';
import type { DB } from '../types.js';
import { WayfarerRepository, type UnreadableWayfarerRow } from './wayfarer-repository.js';

const NOW = 1_800_000_000_000;

describe('WayfarerRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let database: TestDatabase;
  let home: number;
  let away: number;
  let gyms: [number, number, number];

  async function addGym(name: string): Promise<number> {
    const result = await db
      .insertInto('Gym')
      .values({ name, lat: 40.44, lon: -79.99 })
      .executeTakeFirstOrThrow();
    return Number(result.insertId);
  }

  async function addGuild(snowflake: string): Promise<number> {
    const result = await db.insertInto('Guild').values({ snowflake }).executeTakeFirstOrThrow();
    return Number(result.insertId);
  }

  beforeAll(async () => {
    ({ db, stop, database } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('GymReview').execute();
    await db.deleteFrom('WayspotImport').execute();
    await db.deleteFrom('GymWayfarer').execute();
    await db.deleteFrom('Gym').execute();
    await db.deleteFrom('Guild').execute();
    home = await addGuild('412345678901234567');
    away = await addGuild('412345678901234568');
    gyms = [await addGym('First'), await addGym('Second'), await addGym('Third')];
  });

  function repositorySetup(): WayfarerSetup {
    const unreadable: UnreadableWayfarerRow[] = [];
    return {
      store: new WayfarerRepository(db, (row) => unreadable.push(row)),
      unreadable,
      home,
      away,
      gyms,
      async spoilReview(id, columns) {
        await db
          .updateTable('GymReview')
          .set({
            ...(columns.kind === undefined ? {} : { kind: columns.kind }),
            ...(columns.candidates === undefined
              ? {}
              : { candidates: JSON.stringify(columns.candidates) }),
          })
          .where('id', '=', id)
          .execute();
      },
      async spoilImport(id, counts) {
        await db
          .updateTable('WayspotImport')
          .set({ counts: JSON.stringify(counts) })
          .where('id', '=', id)
          .execute();
      },
    };
  }

  function memorySetup(): WayfarerSetup {
    const unreadable: UnreadableWayfarerRow[] = [];
    const store = new MemoryWayfarer((row) => unreadable.push(row));
    return {
      store,
      unreadable,
      home,
      away,
      gyms,
      spoilReview(id, columns) {
        const row = store.reviews.find((review) => review.id === id);
        if (row) Object.assign(row, columns);
        return Promise.resolve();
      },
      spoilImport(id, counts) {
        const row = store.imports.find((stored) => stored.id === id);
        if (row) row.counts = counts;
        return Promise.resolve();
      },
    };
  }

  describe('the repository', () => {
    wayfarerStorageCases(() => Promise.resolve(repositorySetup()));
  });

  describe('its twin in memory', () => {
    wayfarerStorageCases(() => Promise.resolve(memorySetup()));
  });

  it('reads the newest answers of a server’s gyms through the gym index, not the server’s queue (plan 19B-2)', async () => {
    // A server's queue of some size: many decided items of other gyms.
    const others = await Promise.all(Array.from({ length: 60 }, (_, n) => addGym(`Other ${n}`)));
    await db
      .insertInto('GymReview')
      .values(
        others.flatMap((gymId) =>
          [0, 1, 2].map((n) => ({
            guildId: home,
            gymId,
            kind: 'unknown',
            candidates: '[]',
            createdAt: String(NOW + n),
            queuedAt: String(NOW + n),
            decision: 'keep',
            decidedAt: String(NOW + n),
          })),
        ),
      )
      .execute();
    await sql`analyze table GymReview`.execute(db);
    const asked: CompiledQuery[] = [];
    const logged = createDb<DB>(database.config, (event) => {
      if (event.level === 'query') asked.push(event.query);
    });
    try {
      await new WayfarerRepository(logged).latestDecided(home, gyms);
      const [query] = asked;
      if (query === undefined) throw new Error('nothing was asked');
      const plan = await db.executeQuery<{ key: string | null }>(
        CompiledQuery.raw(`explain format=traditional ${query.sql}`, [...query.parameters]),
      );
      expect(plan.rows[0]?.key).toBe('gymreview_gymid_foreign');
    } finally {
      await logged.destroy();
    }
  });

  it('lets the record and the items of a deleted gym go with it', async () => {
    const store = new WayfarerRepository(db);
    const [first, second] = gyms;
    await store.seen([first, second], NOW);
    await store.saveReviews(
      home,
      null,
      [
        { gymId: first, kind: 'match', candidates: [CANDIDATE] },
        { gymId: second, kind: 'unknown', candidates: [] },
      ],
      NOW,
    );
    await db.deleteFrom('Gym').where('id', '=', first).execute();
    expect([...(await store.records([first, second])).keys()]).toEqual([second]);
    expect((await store.openReviews(home)).map((item) => item.gymId)).toEqual([second]);
  });

  it('refuses a second open item of one gym in one server', async () => {
    const [first] = gyms;
    const row = {
      guildId: home,
      gymId: first,
      openGymId: first,
      kind: 'match',
      candidates: '[]',
      createdAt: String(NOW),
      queuedAt: String(NOW),
    };
    await db.insertInto('GymReview').values(row).execute();
    await expect(db.insertInto('GymReview').values(row).execute()).rejects.toThrow(/Duplicate/);
    await db
      .insertInto('GymReview')
      .values({ ...row, openGymId: null, decision: 'keep' })
      .execute();
  });

  it('keeps the items of an import that is gone, without it', async () => {
    const store = new WayfarerRepository(db);
    const importId = await store.addImport({
      guildId: home,
      staffId: '312345678901234567',
      importedAt: NOW,
      startedAt: null,
      finishedAt: null,
      counts: {},
    });
    await store.saveReviews(
      home,
      importId,
      [{ gymId: gyms[0], kind: 'unknown', candidates: [] }],
      NOW,
    );
    await db.deleteFrom('WayspotImport').where('id', '=', importId).execute();
    expect(await store.nextReview(home)).toMatchObject({ gymId: gyms[0], importId: null });
  });

  it('notes when gyms were seen and refreshes open items without the VALUES() function MySQL deprecates', async () => {
    const seen = await lastWarnings(db, async (trx) => {
      const store = new WayfarerRepository(trx);
      await store.seen(gyms, NOW);
      await store.seen(gyms, NOW + 1);
    });
    const items: ReviewItem[] = gyms.map((gymId) => ({ gymId, kind: 'unknown', candidates: [] }));
    const saved = await lastWarnings(db, async (trx) => {
      const store = new WayfarerRepository(trx);
      await store.saveReviews(home, null, items, NOW);
      await store.saveReviews(home, null, items, NOW + 1);
    });
    for (const warnings of [seen, saved]) {
      expect(warnings.filter((warning) => warning.Code === DEPRECATED_SYNTAX)).toEqual([]);
    }
    const store = new WayfarerRepository(db);
    expect((await store.records(gyms)).get(gyms[0])?.lastSeen).toBe(NOW + 1);
    expect(await store.openCounts(home)).toEqual({ match: 0, missing: 0, unknown: 3 });
  });

  it('writes and closes more items than go in one statement', async () => {
    const store = new WayfarerRepository(db);
    await db
      .insertInto('Gym')
      .values(
        Array.from({ length: 1200 }, (_, i) => ({ name: `Gym ${String(i)}`, lat: 40, lon: -80 })),
      )
      .execute();
    const ids = (await db.selectFrom('Gym').select('id').orderBy('id').execute()).map(
      (row) => row.id,
    );
    const items: ReviewItem[] = ids.map((gymId) => ({ gymId, kind: 'unknown', candidates: [] }));
    await store.saveReviews(home, null, items, NOW);
    await store.saveReviews(home, null, items, NOW + 1);
    await store.seen(ids, NOW);
    expect(await store.openCounts(home)).toEqual({ match: 0, missing: 0, unknown: ids.length });
    expect((await store.records(ids)).size).toBe(ids.length);
    expect(await store.closeReviews(home, ids, 'resolved', null, NOW + 2)).toBe(ids.length);
    expect(await store.nextReview(home)).toBeUndefined();
  });
});
