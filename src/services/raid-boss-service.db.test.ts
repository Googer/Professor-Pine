import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { startMigratedDatabase } from '../../test/support/migrated-db.js';
import { readRaidBossFeed } from '../../test/support/raid-bosses.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { RaidBossRepository } from '../db/repositories/raid-boss-repository.js';
import type { DB } from '../db/types.js';
import type { BossListChange } from '../domain/pogo/raid-bosses.js';
import type { RaidTier } from '../domain/pogo/raid-tier.js';
import { RaidBossService, type FetchFeed } from './raid-boss-service.js';

const HOUR = 3_600_000;
const T5: RaidTier = { level: 'T5', shadow: false };
const SHADOW_T5: RaidTier = { level: 'T5', shadow: true };

/** The service on the real tables: what the unit tests check against a store kept in memory. */
describe('RaidBossService with the database', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let now: number;
  let body: string;
  let status: number;

  const respond: FetchFeed = () =>
    Promise.resolve({
      ok: status === 200,
      status,
      headers: { get: (name) => (name === 'etag' ? '"v1"' : null) },
      text: () => Promise.resolve(body),
    });

  function service() {
    const changes: BossListChange[] = [];
    const raidBosses = new RaidBossService({
      url: 'https://example.test/raids.min.json',
      refreshMs: HOUR,
      staleAfterMs: 48 * HOUR,
      store: new RaidBossRepository(db),
      gameData: { catalogue: catalogueFixture() },
      fetch: respond,
      log: createTestLogger().log,
      now: () => now,
    });
    raidBosses.onChange((change) => {
      changes.push(change);
    });
    return { raidBosses, changes };
  }

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('RaidBoss').execute();
    await db.deleteFrom('RaidBossOverride').execute();
    now = Date.UTC(2026, 9, 10, 12);
    body = JSON.stringify(readRaidBossFeed());
    status = 200;
  });

  it('syncs the downloaded feed into the tables and serves it', async () => {
    const { raidBosses } = service();
    await raidBosses.load();
    expect(raidBosses.bosses()).toEqual([]);
    expect((await raidBosses.sync()).status).toBe('updated');
    expect(raidBosses.bosses()).toHaveLength(14);
    expect(raidBosses.autoset(T5)?.key).toBe('yveltal');
    expect(raidBosses.autoset(SHADOW_T5)?.key).toBe('landorus_incarnate');
    const rows = await db.selectFrom('RaidBoss').select(['pokemonId', 'form', 'active']).execute();
    expect(rows).toHaveLength(14);
    expect(rows.find((row) => row.pokemonId === 'YVELTAL')).toEqual({
      pokemonId: 'YVELTAL',
      form: '',
      active: 1,
    });
  });

  it('carries the list, its age and the overrides over a restart', async () => {
    const first = service().raidBosses;
    await first.load();
    await first.sync();
    const override = await first.addOverride({
      action: 'autoset',
      pokemonId: 'ZEKROM',
      form: null,
      tier: T5,
      shiny: true,
      expiresAt: now + 24 * HOUR,
      createdBy: '123456789012345678',
    });
    const synced = now;
    now += 2 * HOUR;

    const { raidBosses } = service();
    await raidBosses.load();
    expect(raidBosses.lastSyncedAt).toBe(synced);
    expect(raidBosses.overrides()).toEqual([override]);
    expect(raidBosses.bossesOf(T5).map((b) => [b.key, b.source, b.autoset])).toEqual([
      ['yveltal', 'feed', false],
      ['zekrom', 'override', true],
    ]);
    expect(raidBosses.autoset(T5)).toMatchObject({ key: 'zekrom', shiny: true });
  });

  it('retires bosses the feed drops, announces the change and deletes expired overrides', async () => {
    const { raidBosses, changes } = service();
    await raidBosses.load();
    await raidBosses.sync();
    await raidBosses.addOverride({
      action: 'hide',
      pokemonId: 'YVELTAL',
      form: null,
      tier: T5,
      shiny: null,
      expiresAt: now + HOUR,
      createdBy: '123456789012345678',
    });
    expect(raidBosses.bossesOf(T5)).toEqual([]);

    now += HOUR;
    body = JSON.stringify([
      { name: 'Yveltal', tier: '5-Star Raids', canBeShiny: true },
      { name: 'Zekrom', tier: '5-Star Raids', canBeShiny: false },
    ]);
    expect((await raidBosses.sync()).status).toBe('updated');
    expect(changes).toHaveLength(1);
    expect(changes[0]?.added.map((b) => b.pokemonId)).toEqual(['ZEKROM']);
    expect(changes[0]?.removed).toHaveLength(13);
    expect(raidBosses.bosses().map((b) => b.key)).toEqual(['yveltal', 'zekrom']);
    expect(await db.selectFrom('RaidBossOverride').selectAll().execute()).toEqual([]);
    const active = await db
      .selectFrom('RaidBoss')
      .select('pokemonId')
      .where('active', '=', 1)
      .orderBy('pokemonId')
      .execute();
    expect(active.map((row) => row.pokemonId)).toEqual(['YVELTAL', 'ZEKROM']);
  });

  it('records a 304 as a successful sync and keeps the list after a failure', async () => {
    const { raidBosses } = service();
    await raidBosses.load();
    await raidBosses.sync();
    now += HOUR;
    status = 304;
    expect(await raidBosses.sync()).toEqual({ status: 'unchanged' });
    expect(await new RaidBossRepository(db).lastSyncedAt()).toBe(now);
    const synced = now;
    now += HOUR;
    status = 503;
    expect((await raidBosses.sync()).status).toBe('failed');
    expect(raidBosses.bosses()).toHaveLength(14);
    expect(await new RaidBossRepository(db).lastSyncedAt()).toBe(synced);
  });
});
