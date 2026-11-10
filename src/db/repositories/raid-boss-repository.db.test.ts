import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FeedBoss } from '../../domain/pogo/raid-boss-feed.js';
import type { NewBossOverride } from '../../domain/pogo/raid-bosses.js';
import type { MaxTier } from '../../domain/pogo/max-tier.js';
import type { RaidTier } from '../../domain/pogo/raid-tier.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { MaxBossRepository, RaidBossRepository } from './raid-boss-repository.js';

const T3: RaidTier = { level: 'T3', shadow: false };
const T5: RaidTier = { level: 'T5', shadow: false };
const SHADOW_T5: RaidTier = { level: 'T5', shadow: true };
const MEGA: RaidTier = { level: 'Mega', shadow: false };
const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;

function boss(pokemonId: string, tier: RaidTier, extra: Partial<FeedBoss> = {}): FeedBoss {
  return { pokemonId, form: null, tier, shiny: false, name: pokemonId.toLowerCase(), ...extra };
}

function override(extra: Partial<NewBossOverride> = {}): NewBossOverride {
  return {
    action: 'add',
    pokemonId: 'MEWTWO',
    form: null,
    tier: T5,
    shiny: null,
    expiresAt: null,
    createdBy: '123456789012345678',
    ...extra,
  };
}

describe('RaidBossRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let bosses: RaidBossRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    bosses = new RaidBossRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('RaidBoss').execute();
    await db.deleteFrom('RaidBossOverride').execute();
  });

  describe('the tables', () => {
    it('use the character set and collation of the legacy tables', async () => {
      const { rows } = await sql<{ name: string; collation: string }>`
        select table_name as name, table_collation as collation from information_schema.tables
        where table_schema = database() and table_name in ('RaidBoss', 'RaidBossOverride', 'Pokemon')
        order by name`.execute(db);
      expect(rows).toEqual([
        { name: 'Pokemon', collation: 'utf8mb4_0900_ai_ci' },
        { name: 'RaidBoss', collation: 'utf8mb4_0900_ai_ci' },
        { name: 'RaidBossOverride', collation: 'utf8mb4_0900_ai_ci' },
      ]);
    });

    it('allow one row per Pokémon, form, level and shadow flag', async () => {
      const row = {
        pokemonId: 'YVELTAL',
        form: '',
        level: 'T5',
        shadow: 0,
        name: 'Yveltal',
        firstSeen: '1',
        lastSeen: '1',
      };
      await db.insertInto('RaidBoss').values(row).execute();
      await expect(db.insertInto('RaidBoss').values(row).execute()).rejects.toThrow(/Duplicate/);
      await db
        .insertInto('RaidBoss')
        .values({ ...row, shadow: 1 })
        .execute();
    });
  });

  describe('the feed list', () => {
    it('is empty, and never synced, in a new database', async () => {
      expect(await bosses.listActive()).toEqual([]);
      expect(await bosses.lastSyncedAt()).toBeUndefined();
    });

    it('stores a list and reads it back', async () => {
      const list = [
        boss('BLASTOISE', MEGA, { form: 'BLASTOISE_MEGA', shiny: true, name: 'Mega Blastoise' }),
        boss('YVELTAL', T5, { name: 'Yveltal' }),
        boss('LANDORUS', SHADOW_T5, { form: 'LANDORUS_INCARNATE', name: 'Landorus (Incarnate)' }),
      ];
      await bosses.replaceFeed(list, NOW);
      expect(await bosses.listActive()).toEqual(
        list.map((entry) => ({ ...entry, firstSeen: NOW, lastSeen: NOW })),
      );
      expect(await bosses.lastSyncedAt()).toBe(NOW);
    });

    it('stores the picture of a boss, replaces it, and clears it when the feed has none', async () => {
      await bosses.replaceFeed([boss('YVELTAL', T5, { image: 'https://example.test/a.png' })], NOW);
      expect((await bosses.listActive())[0]?.image).toBe('https://example.test/a.png');
      await bosses.replaceFeed([boss('YVELTAL', T5, { image: 'https://example.test/b.png' })], NOW);
      expect((await bosses.listActive())[0]?.image).toBe('https://example.test/b.png');
      await bosses.replaceFeed([boss('YVELTAL', T5)], NOW);
      expect((await bosses.listActive())[0]).not.toHaveProperty('image');
    });

    it('stores text outside the Latin alphabet', async () => {
      await bosses.replaceFeed([boss('MR_MIME', T3, { name: 'Flabébé ♀ メガ' })], NOW);
      expect((await bosses.listActive())[0]?.name).toBe('Flabébé ♀ メガ');
    });

    it('replaces the list: keeps, updates, adds and retires', async () => {
      await bosses.replaceFeed(
        [boss('YVELTAL', T5), boss('STARMIE', T3), boss('UMBREON', T3)],
        NOW,
      );
      await bosses.replaceFeed(
        [
          boss('YVELTAL', T5, { shiny: true, name: 'Yveltal!' }),
          boss('UMBREON', T3),
          boss('ZEKROM', T5),
        ],
        NOW + HOUR,
      );
      expect(
        (await bosses.listActive()).map((b) => [
          b.pokemonId,
          b.shiny,
          b.name,
          b.firstSeen,
          b.lastSeen,
        ]),
      ).toEqual([
        ['YVELTAL', true, 'Yveltal!', NOW, NOW + HOUR],
        ['UMBREON', false, 'umbreon', NOW, NOW + HOUR],
        ['ZEKROM', false, 'zekrom', NOW + HOUR, NOW + HOUR],
      ]);
      const retired = await db
        .selectFrom('RaidBoss')
        .select(['pokemonId', 'active', 'lastSeen'])
        .where('active', '=', 0)
        .execute();
      expect(retired).toEqual([{ pokemonId: 'STARMIE', active: 0, lastSeen: String(NOW) }]);
      expect(await bosses.lastSyncedAt()).toBe(NOW + HOUR);
    });

    it('starts a returning boss again instead of adding a second row', async () => {
      await bosses.replaceFeed([boss('YVELTAL', T5), boss('ZEKROM', T5)], NOW);
      await bosses.replaceFeed([boss('ZEKROM', T5)], NOW + HOUR);
      await bosses.replaceFeed([boss('ZEKROM', T5), boss('YVELTAL', T5)], NOW + 2 * HOUR);
      expect((await bosses.listActive()).map((b) => [b.pokemonId, b.firstSeen])).toEqual([
        ['YVELTAL', NOW + 2 * HOUR],
        ['ZEKROM', NOW],
      ]);
      const { count } = await db
        .selectFrom('RaidBoss')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();
      expect(Number(count)).toBe(2);
    });

    it('tells apart forms, tiers and shadow raids of one species', async () => {
      const list = [
        boss('GIRATINA', T5, { form: 'GIRATINA_ALTERED' }),
        boss('GIRATINA', T5, { form: 'GIRATINA_ORIGIN' }),
        boss('GIRATINA', T5),
        boss('GIRATINA', SHADOW_T5),
        boss('GIRATINA', T3),
      ];
      await bosses.replaceFeed(list, NOW);
      expect(await bosses.listActive()).toHaveLength(5);
      await bosses.replaceFeed(list.slice(1), NOW + HOUR);
      expect((await bosses.listActive()).map((b) => [b.form, b.tier])).toEqual(
        list.slice(1).map((b) => [b.form, b.tier]),
      );
    });

    it('stores a boss listed twice once', async () => {
      await bosses.replaceFeed(
        [boss('YVELTAL', T5), boss('YVELTAL', T5, { shiny: true }), boss('yveltal', T5)],
        NOW,
      );
      expect((await bosses.listActive()).map((b) => [b.pokemonId, b.shiny])).toEqual([
        ['YVELTAL', false],
      ]);
    });

    it('retires everything for an empty list', async () => {
      await bosses.replaceFeed([boss('YVELTAL', T5)], NOW);
      await bosses.replaceFeed([], NOW + HOUR);
      expect(await bosses.listActive()).toEqual([]);
      expect(await bosses.lastSyncedAt()).toBeUndefined();
    });

    it('changes nothing when the transaction it runs in is rolled back', async () => {
      await bosses.replaceFeed([boss('YVELTAL', T5)], NOW);
      await expect(
        db.transaction().execute(async (trx) => {
          await new RaidBossRepository(trx).replaceFeed([boss('ZEKROM', T5)], NOW + HOUR);
          throw new Error('rolled back');
        }),
      ).rejects.toThrow('rolled back');
      expect((await bosses.listActive()).map((b) => [b.pokemonId, b.lastSeen])).toEqual([
        ['YVELTAL', NOW],
      ]);
    });

    it('changes nothing when one of its writes fails', async () => {
      await db
        .insertInto('RaidBoss')
        .values({
          pokemonId: 'YVELTÁL',
          form: '',
          level: 'T5',
          shadow: 0,
          active: 0,
          name: 'accented',
          firstSeen: '1',
          lastSeen: '1',
        })
        .execute();
      // The collation treats the two ids as equal while the repository does not, so the second
      // insert hits the unique key after the first has been written.
      await expect(
        bosses.replaceFeed([boss('ZEKROM', T5), boss('YVELTAL', T5)], NOW),
      ).rejects.toThrow();
      const zekrom = await db
        .selectFrom('RaidBoss')
        .select('id')
        .where('pokemonId', '=', 'ZEKROM')
        .execute();
      expect(zekrom).toEqual([]);
    });

    it('records that the list is still current', async () => {
      await bosses.replaceFeed([boss('YVELTAL', T5), boss('ZEKROM', T5)], NOW);
      await bosses.replaceFeed([boss('YVELTAL', T5)], NOW + HOUR);
      await bosses.touchActive(NOW + 2 * HOUR);
      expect(await bosses.lastSyncedAt()).toBe(NOW + 2 * HOUR);
      expect((await bosses.listActive())[0]).toMatchObject({
        firstSeen: NOW,
        lastSeen: NOW + 2 * HOUR,
      });
      const retired = await db
        .selectFrom('RaidBoss')
        .select('lastSeen')
        .where('active', '=', 0)
        .executeTakeFirstOrThrow();
      expect(retired.lastSeen).toBe(String(NOW));
    });

    it('leaves out a row whose level it does not know', async () => {
      await bosses.replaceFeed([boss('YVELTAL', T5)], NOW);
      await db
        .insertInto('RaidBoss')
        .values([
          { pokemonId: 'A', level: 'T9', name: 'a', firstSeen: '1', lastSeen: '1' },
          { pokemonId: 'B', level: 'Mega', shadow: 1, name: 'b', firstSeen: '1', lastSeen: '1' },
        ])
        .execute();
      expect((await bosses.listActive()).map((b) => b.pokemonId)).toEqual(['YVELTAL']);
    });
  });

  describe('overrides', () => {
    it('has none in a new database', async () => {
      expect(await bosses.listOverrides()).toEqual([]);
    });

    it('stores every kind and reads them back, oldest first', async () => {
      const inputs = [
        override({ action: 'add', shiny: true, expiresAt: NOW + HOUR }),
        override({ action: 'hide', pokemonId: 'YVELTAL' }),
        override({ action: 'autoset', pokemonId: 'BLASTOISE', form: 'BLASTOISE_MEGA', tier: MEGA }),
        override({ action: 'shiny', pokemonId: 'KIRLIA', tier: null, shiny: false }),
        override({ action: 'shiny', pokemonId: 'KIRLIA', tier: SHADOW_T5, shiny: true }),
      ];
      const saved = [];
      for (const [index, input] of inputs.entries()) {
        saved.push(await bosses.saveOverride(input, NOW + index));
      }
      expect(saved.map((o) => o.createdAt)).toEqual([NOW, NOW + 1, NOW + 2, NOW + 3, NOW + 4]);
      expect(new Set(saved.map((o) => o.id)).size).toBe(5);
      expect(await bosses.listOverrides()).toEqual(saved);
      expect(saved[0]).toEqual({ ...inputs[0], id: saved[0]?.id, createdAt: NOW });
    });

    it('replaces an earlier override of the same kind for the same boss', async () => {
      const first = await bosses.saveOverride(override({ shiny: false }), NOW);
      await bosses.saveOverride(override({ tier: SHADOW_T5 }), NOW);
      await bosses.saveOverride(override({ action: 'hide' }), NOW);
      await bosses.saveOverride(override({ form: 'MEWTWO_A' }), NOW);
      const second = await bosses.saveOverride(
        override({ shiny: true, expiresAt: NOW + HOUR }),
        NOW + 5,
      );
      const all = await bosses.listOverrides();
      expect(all).toHaveLength(4);
      expect(all.some((o) => o.id === first.id)).toBe(false);
      expect(all.find((o) => o.id === second.id)).toMatchObject({
        shiny: true,
        expiresAt: NOW + HOUR,
        createdAt: NOW + 5,
      });
    });

    it('replaces the autoset of a tier whatever its Pokémon, and nothing else', async () => {
      const replaced = await bosses.saveOverride(
        override({ action: 'autoset', pokemonId: 'A' }),
        NOW,
      );
      await bosses.saveOverride(
        override({ action: 'autoset', pokemonId: 'B', tier: SHADOW_T5 }),
        NOW,
      );
      await bosses.saveOverride(override({ action: 'add', pokemonId: 'C' }), NOW);
      await bosses.saveOverride(override({ action: 'hide', pokemonId: 'D' }), NOW);
      await bosses.saveOverride(
        override({ action: 'autoset', pokemonId: 'E', form: 'E_X' }),
        NOW + 1,
      );
      const all = await bosses.listOverrides();
      expect(all.some((o) => o.id === replaced.id)).toBe(false);
      expect(all.map((o) => [o.action, o.pokemonId])).toEqual([
        ['autoset', 'B'],
        ['add', 'C'],
        ['hide', 'D'],
        ['autoset', 'E'],
      ]);
    });

    it('replaces an every-tier shiny override without touching one for a single tier', async () => {
      await bosses.saveOverride(override({ action: 'shiny', tier: null, shiny: true }), NOW);
      await bosses.saveOverride(override({ action: 'shiny', tier: T5, shiny: true }), NOW);
      await bosses.saveOverride(override({ action: 'shiny', tier: null, shiny: false }), NOW + 1);
      expect((await bosses.listOverrides()).map((o) => [o.tier, o.shiny])).toEqual([
        [T5, true],
        [null, false],
      ]);
    });

    it('removes one by id', async () => {
      const saved = await bosses.saveOverride(override(), NOW);
      expect(await bosses.removeOverride(saved.id)).toBe(true);
      expect(await bosses.removeOverride(saved.id)).toBe(false);
      expect(await bosses.listOverrides()).toEqual([]);
    });

    it('removes the ones that have expired', async () => {
      await bosses.saveOverride(override({ pokemonId: 'A', expiresAt: NOW - 1 }), NOW - HOUR);
      await bosses.saveOverride(override({ pokemonId: 'B', expiresAt: NOW }), NOW - HOUR);
      await bosses.saveOverride(override({ pokemonId: 'C', expiresAt: NOW + 1 }), NOW - HOUR);
      await bosses.saveOverride(override({ pokemonId: 'D', expiresAt: null }), NOW - HOUR);
      // Compared as numbers: as text, '5' would sort after '1800000000000' and survive.
      await bosses.saveOverride(override({ pokemonId: 'E', expiresAt: 5 }), NOW - HOUR);
      expect(await bosses.removeExpiredOverrides(NOW)).toBe(3);
      expect((await bosses.listOverrides()).map((o) => o.pokemonId)).toEqual(['C', 'D']);
      expect(await bosses.removeExpiredOverrides(NOW)).toBe(0);
    });

    it('leaves out rows it cannot read', async () => {
      await bosses.saveOverride(override(), NOW);
      await db
        .insertInto('RaidBossOverride')
        .values([
          { pokemonId: 'A', action: 'explode', level: 'T5', createdBy: '1', createdAt: '1' },
          { pokemonId: 'B', action: 'add', level: 'T9', createdBy: '1', createdAt: '1' },
          { pokemonId: 'C', action: 'add', level: 'EX', shadow: 1, createdBy: '1', createdAt: '1' },
        ])
        .execute();
      expect((await bosses.listOverrides()).map((o) => o.pokemonId)).toEqual(['MEWTWO']);
    });

    it('reports an override whose tier it does not know, once, and leaves the row', async () => {
      const reported: { id: number; level: string }[] = [];
      const telling = new RaidBossRepository(db, (override) => reported.push(override));
      await telling.saveOverride(override(), NOW);
      await db
        .insertInto('RaidBossOverride')
        .values([
          // The EX tier, which plan 4F removed, and a tier of some later version.
          { pokemonId: 'MEWTWO', action: 'add', level: 'EX', createdBy: '1', createdAt: '1' },
          { pokemonId: 'B', action: 'add', level: 'T9', createdBy: '1', createdAt: '1' },
        ])
        .execute();
      expect((await telling.listOverrides()).map((o) => o.tier?.level)).toEqual(['T5']);
      expect(reported.map((row) => row.level)).toEqual(['EX', 'T9']);
      await telling.listOverrides();
      expect(reported).toHaveLength(2);
      const rows = await db.selectFrom('RaidBossOverride').select('level').orderBy('id').execute();
      expect(rows.map((row) => row.level)).toEqual(['T5', 'EX', 'T9']);
    });

    it('does not show a stored boss of the EX tier, and the next sync retires its row', async () => {
      await db
        .insertInto('RaidBoss')
        .values({
          pokemonId: 'MEWTWO',
          form: '',
          level: 'EX',
          shadow: 0,
          shiny: 0,
          name: 'Mewtwo',
          active: 1,
          firstSeen: String(NOW),
          lastSeen: String(NOW),
        })
        .execute();
      expect(await bosses.listActive()).toEqual([]);
      await bosses.replaceFeed([boss('ZEKROM', T5)], NOW + HOUR);
      expect((await bosses.listActive()).map((found) => found.pokemonId)).toEqual(['ZEKROM']);
      const kept = await db
        .selectFrom('RaidBoss')
        .select(['level', 'active'])
        .where('pokemonId', '=', 'MEWTWO')
        .execute();
      expect(kept).toEqual([{ level: 'EX', active: 0 }]);
    });
  });

  // Plan 8X-2: the max bosses share the tables, kept apart by their levels (`MaxTier`).
  describe('the families of bosses', () => {
    let max: MaxBossRepository;
    const maxBoss = (pokemonId: string, tier: MaxTier): FeedBoss<MaxTier> => ({
      pokemonId,
      form: null,
      tier,
      shiny: false,
      name: pokemonId.toLowerCase(),
    });
    const maxOverride = (extra: Partial<NewBossOverride<MaxTier>> = {}) => ({
      ...override(),
      tier: 'D2' as MaxTier,
      ...extra,
    });

    beforeAll(() => {
      max = new MaxBossRepository(db);
    });

    it('store the max tiers and read them back', async () => {
      const list = [maxBoss('MACHAMP', 'D2'), maxBoss('MACHAMP', 'G'), maxBoss('UXIE', 'D5')];
      await max.replaceFeed(list, NOW);
      expect(await max.listActive()).toEqual(
        list.map((entry) => ({ ...entry, firstSeen: NOW, lastSeen: NOW })),
      );
      const levels = await db.selectFrom('RaidBoss').select('level').orderBy('id').execute();
      expect(levels.map((row) => row.level)).toEqual(['D2', 'G', 'D5']);
    });

    it('a max sync never retires or hides a raid boss, and a raid sync no max boss', async () => {
      await bosses.replaceFeed([boss('YVELTAL', T5), boss('MACHAMP', T3)], NOW);
      await max.replaceFeed([maxBoss('MACHAMP', 'D2')], NOW);
      await max.replaceFeed([maxBoss('UXIE', 'D5')], NOW + HOUR);
      expect((await bosses.listActive()).map((b) => [b.pokemonId, b.lastSeen])).toEqual([
        ['YVELTAL', NOW],
        ['MACHAMP', NOW],
      ]);
      await bosses.replaceFeed([boss('ZEKROM', T5)], NOW + 2 * HOUR);
      expect((await max.listActive()).map((b) => [b.pokemonId, b.tier])).toEqual([['UXIE', 'D5']]);
      await max.replaceFeed([], NOW + 3 * HOUR);
      expect((await bosses.listActive()).map((b) => b.pokemonId)).toEqual(['ZEKROM']);
    });

    it('each family is touched and dated by itself', async () => {
      await bosses.replaceFeed([boss('YVELTAL', T5)], NOW);
      await max.replaceFeed([maxBoss('MACHAMP', 'D2')], NOW + HOUR);
      // A fresh max sync must not hide that the raid feed is stale, nor the reverse.
      expect(await bosses.lastSyncedAt()).toBe(NOW);
      expect(await max.lastSyncedAt()).toBe(NOW + HOUR);
      await bosses.touchActive(NOW + 2 * HOUR);
      expect(await max.lastSyncedAt()).toBe(NOW + HOUR);
      await max.touchActive(NOW + 3 * HOUR);
      expect(await bosses.lastSyncedAt()).toBe(NOW + 2 * HOUR);
      expect(await max.lastSyncedAt()).toBe(NOW + 3 * HOUR);
    });

    it('a raid boss and a max boss of one Pokémon are two rows', async () => {
      await bosses.replaceFeed([boss('MACHAMP', T3)], NOW);
      await max.replaceFeed([maxBoss('MACHAMP', 'D2'), maxBoss('MACHAMP', 'G')], NOW);
      expect(await bosses.listActive()).toHaveLength(1);
      expect(await max.listActive()).toHaveLength(2);
    });

    it('keep their overrides apart, a shiny override without a tier with the raids', async () => {
      const told: { id: number; level: string }[] = [];
      const raids = new RaidBossRepository(db, (row) => told.push(row));
      const raidAdd = await raids.saveOverride(override(), NOW);
      const anyTier = await raids.saveOverride(
        override({ action: 'shiny', pokemonId: 'MACHAMP', tier: null, shiny: true }),
        NOW,
      );
      const maxHide = await max.saveOverride(maxOverride({ action: 'hide' }), NOW);
      const maxShiny = await max.saveOverride(
        maxOverride({ action: 'shiny', pokemonId: 'MACHAMP', tier: 'G', shiny: true }),
        NOW,
      );
      expect((await raids.listOverrides()).map((o) => o.id)).toEqual([raidAdd.id, anyTier.id]);
      expect(await max.listOverrides()).toEqual([maxHide, maxShiny]);
      // A max override is no override of a tier the raids do not know.
      expect(told).toEqual([]);
    });

    it('a family removes only its own overrides', async () => {
      const raidAdd = await bosses.saveOverride(override({ expiresAt: NOW }), NOW - HOUR);
      const maxAdd = await max.saveOverride(maxOverride({ expiresAt: NOW }), NOW - HOUR);
      expect(await max.removeOverride(raidAdd.id)).toBe(false);
      expect(await bosses.removeOverride(maxAdd.id)).toBe(false);
      expect(await max.removeExpiredOverrides(NOW)).toBe(1);
      expect((await bosses.listOverrides()).map((o) => o.id)).toEqual([raidAdd.id]);
      expect(await bosses.removeExpiredOverrides(NOW)).toBe(1);
      expect(await max.removeOverride(maxAdd.id)).toBe(false);
    });

    it('stores an upcoming boss from its start, and follows the start until it has come', async () => {
      const uxie = (startsAt?: number) => ({
        ...maxBoss('UXIE', 'D5'),
        ...(startsAt === undefined ? {} : { startsAt }),
      });
      await max.replaceFeed([uxie(NOW + 10 * HOUR), maxBoss('SNEASEL', 'D1')], NOW);
      const first = (await max.listActive()).map((b) => [b.pokemonId, b.firstSeen]);
      expect(first).toEqual([
        ['UXIE', NOW + 10 * HOUR],
        ['SNEASEL', NOW],
      ]);
      // Moved to an earlier start before it came: the stored start follows.
      await max.replaceFeed([uxie(NOW + 5 * HOUR), maxBoss('SNEASEL', 'D1')], NOW + HOUR);
      expect((await max.listActive())[0]?.firstSeen).toBe(NOW + 5 * HOUR);
      // Once it has come it stays a boss from then, whatever the feed says of a start.
      await max.replaceFeed([uxie(NOW + 30 * HOUR)], NOW + 6 * HOUR);
      expect((await max.listActive())[0]?.firstSeen).toBe(NOW + 5 * HOUR);
      // A start that is no later than the read is the read.
      await max.replaceFeed([maxBoss('SNEASEL', 'D1'), uxie(NOW)], NOW + 7 * HOUR);
      expect((await max.listActive()).map((b) => [b.pokemonId, b.firstSeen])).toEqual([
        ['UXIE', NOW + 5 * HOUR],
        ['SNEASEL', NOW + 7 * HOUR],
      ]);
    });

    it('a max override replaces only max overrides', async () => {
      await bosses.saveOverride(override({ action: 'hide', pokemonId: 'MACHAMP' }), NOW);
      await max.saveOverride(maxOverride({ action: 'hide', pokemonId: 'MACHAMP' }), NOW);
      await max.saveOverride(maxOverride({ action: 'hide', pokemonId: 'MACHAMP' }), NOW + 1);
      expect(await bosses.listOverrides()).toHaveLength(1);
      expect((await max.listOverrides()).map((o) => o.createdAt)).toEqual([NOW + 1]);
    });
  });
});
