import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { MemoryUnownGifts } from '../../../test/support/unown-gifts.js';
import type { DB } from '../types.js';
import { UnownGiftRepository, type UnownGiftStorage } from './unown-gift-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const NOWHERE = '499999999999999999';
const NOW = 1_800_000_000_000;

describe('UnownGiftRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let gifts: UnownGiftRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    gifts = new UnownGiftRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
  });

  const stored = () =>
    db
      .selectFrom('UnownWantGift')
      .select(['guildId', 'memberId', 'createdAt'])
      .orderBy('guildId')
      .orderBy('memberId')
      .execute();

  it('records once per member and server, and keeps the first record as it is', async () => {
    expect(await gifts.given(ALICE, HOME)).toBe(false);
    await gifts.record(ALICE, HOME, NOW);
    await gifts.record(ALICE, HOME, NOW + 5_000);
    expect(await gifts.given(ALICE, HOME)).toBe(true);
    expect(await gifts.given(ALICE, AWAY)).toBe(false);
    expect(await gifts.given(BOB, HOME)).toBe(false);
    expect(await stored()).toEqual([{ guildId: 1, memberId: ALICE, createdAt: String(NOW) }]);
  });

  it('keeps members and servers apart', async () => {
    await gifts.record(ALICE, HOME, NOW);
    await gifts.record(ALICE, AWAY, NOW + 1);
    await gifts.record(BOB, AWAY, NOW + 2);
    expect(await stored()).toEqual([
      { guildId: 1, memberId: ALICE, createdAt: String(NOW) },
      { guildId: 2, memberId: ALICE, createdAt: String(NOW + 1) },
      { guildId: 2, memberId: BOB, createdAt: String(NOW + 2) },
    ]);
  });

  it('records nothing for a server the bot has no row for', async () => {
    await gifts.record(ALICE, NOWHERE, NOW);
    expect(await gifts.given(ALICE, NOWHERE)).toBe(false);
    expect(await stored()).toEqual([]);
  });

  it('makes one row when the same member is recorded many times at once', async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_unused, n) => gifts.record(ALICE, HOME, NOW + n)),
    );
    expect(await stored()).toHaveLength(1);
  });

  it('loses its rows with the server', async () => {
    await gifts.record(ALICE, HOME, NOW);
    await db.deleteFrom('Guild').where('snowflake', '=', HOME).execute();
    expect(await stored()).toEqual([]);
  });

  it('behaves as its twin in memory does', async () => {
    const memory = new MemoryUnownGifts(new Set([HOME, AWAY]));
    const script = async (storage: UnownGiftStorage) => [
      await storage.given(ALICE, HOME),
      await storage.record(ALICE, HOME, NOW),
      await storage.record(ALICE, HOME, NOW + 1),
      await storage.record(BOB, AWAY, NOW),
      await storage.record(BOB, NOWHERE, NOW),
      await storage.given(ALICE, HOME),
      await storage.given(ALICE, AWAY),
      await storage.given(BOB, AWAY),
      await storage.given(BOB, NOWHERE),
    ];
    expect(await script(gifts)).toEqual(await script(memory));
  });

  it('forgets a member in every server, counted, and nobody else (plan 8G)', async () => {
    await gifts.record(ALICE, HOME, NOW);
    await gifts.record(ALICE, AWAY, NOW + 1);
    await gifts.record(BOB, AWAY, NOW + 2);
    expect(await gifts.countOf(ALICE)).toBe(2);

    expect(await gifts.forget(ALICE)).toBe(2);

    expect(await gifts.countOf(ALICE)).toBe(0);
    expect(await stored()).toEqual([{ guildId: 2, memberId: BOB, createdAt: String(NOW + 2) }]);
    expect(await gifts.forget(ALICE)).toBe(0);
    expect(await gifts.given(BOB, AWAY)).toBe(true);
  });
});
