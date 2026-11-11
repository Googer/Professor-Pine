import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
import type { DB } from '../types.js';
import { RowIds } from './row-ids.js';
import { DEFAULT_USER_SETTINGS, UserRepository } from './user-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const CAROL = '312345678901234569';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';

describe('UserRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let users: UserRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    users = new UserRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('User').execute();
  });

  it('returns defaults for a member with no row, without creating one', async () => {
    expect(await users.get(ALICE)).toEqual({ snowflake: ALICE, ...DEFAULT_USER_SETTINGS });
    expect(await db.selectFrom('User').selectAll().execute()).toHaveLength(0);
    expect(await users.idFor(ALICE)).toBeUndefined();
  });

  it('has the column defaults as its defaults', async () => {
    await users.ensure(ALICE);
    expect(await users.get(ALICE)).toEqual({ snowflake: ALICE, ...DEFAULT_USER_SETTINGS });
  });

  it('ensure creates one row and returns the same id each time', async () => {
    const first = await users.ensure(ALICE);
    const second = await users.ensure(ALICE);
    expect(second).toBe(first);
    expect(await users.idFor(ALICE)).toBe(first);
    expect(await db.selectFrom('User').selectAll().execute()).toHaveLength(1);
  });

  it('update creates the row and stores every field', async () => {
    await users.update(ALICE, {
      mentions: false,
      mentionsGroups: false,
      mentionsShouts: false,
      mentionsTrainStops: false,
      bossSetNotification: true,
      autoStatus: PartyStatus.Coming,
      raidPrivacy: RaidPrivacy.Anonymous,
      nickname: 'AliceGo',
      friendCode: '1234 5678 9012',
      pokebattlerId: 4242,
    });
    expect(await users.get(ALICE)).toEqual({
      snowflake: ALICE,
      mentions: false,
      mentionsGroups: false,
      mentionsShouts: false,
      mentionsTrainStops: false,
      bossSetNotification: true,
      autoStatus: PartyStatus.Coming,
      raidPrivacy: RaidPrivacy.Anonymous,
      nickname: 'AliceGo',
      friendCode: '1234 5678 9012',
      pokebattlerId: 4242,
    });
  });

  it('update changes only the fields given and only that member', async () => {
    await users.update(ALICE, { nickname: 'AliceGo', mentions: false });
    await users.update(BOB, { nickname: 'BobGo' });
    await users.update(ALICE, { friendCode: '1111 2222 3333' });
    const alice = await users.get(ALICE);
    expect(alice.nickname).toBe('AliceGo');
    expect(alice.mentions).toBe(false);
    expect(alice.friendCode).toBe('1111 2222 3333');
    expect((await users.get(BOB)).friendCode).toBeNull();
  });

  it('update with an empty patch only ensures the row', async () => {
    await users.update(ALICE, {});
    expect(await users.idFor(ALICE)).toBeDefined();
  });

  it('clears nullable fields with null', async () => {
    await users.update(ALICE, { nickname: 'AliceGo', pokebattlerId: 7 });
    await users.update(ALICE, { nickname: null, pokebattlerId: null });
    const alice = await users.get(ALICE);
    expect(alice.nickname).toBeNull();
    expect(alice.pokebattlerId).toBeNull();
  });

  it('reads a legacy row with a NULL raidBoss and an out-of-range status', async () => {
    await db
      .insertInto('User')
      .values({ userSnowflake: ALICE, raidBoss: null, status: 42 })
      .execute();
    const alice = await users.get(ALICE);
    expect(alice.bossSetNotification).toBe(false);
    expect(alice.autoStatus).toBe(PartyStatus.Interested);
  });

  it('reads the settings of several members at once, with the defaults for those without a row', async () => {
    await users.update(ALICE, { mentions: false, friendCode: '1111 2222 3333' });
    await users.update(BOB, { mentionsShouts: false });
    const found = await users.getMany([BOB, CAROL, ALICE, BOB]);
    expect([...found.keys()].sort()).toEqual([ALICE, BOB, CAROL]);
    expect(found.get(ALICE)).toEqual(await users.get(ALICE));
    expect(found.get(BOB)).toEqual({
      snowflake: BOB,
      ...DEFAULT_USER_SETTINGS,
      mentionsShouts: false,
    });
    expect(found.get(CAROL)).toEqual({ snowflake: CAROL, ...DEFAULT_USER_SETTINGS });
    // Reading creates no row.
    expect(await users.idFor(CAROL)).toBeUndefined();
  });

  it('asks the database nothing for an empty list', async () => {
    const closed = new UserRepository({
      selectFrom: () => {
        throw new Error('no query was expected');
      },
    } as unknown as Kysely<DB>);
    expect(await closed.getMany([])).toEqual(new Map());
  });

  it('reads more members than one query names', async () => {
    const many = Array.from({ length: 1_203 }, (_unused, index) =>
      String(500000000000000000n + BigInt(index)),
    );
    await users.update(many[0] ?? '', { mentions: false });
    await users.update(many[1_202] ?? '', { mentionsGroups: false });
    const found = await users.getMany(many);
    expect(found.size).toBe(1_203);
    expect(found.get(many[0] ?? '')?.mentions).toBe(false);
    expect(found.get(many[1_202] ?? '')?.mentionsGroups).toBe(false);
    expect(found.get(many[600] ?? '')).toEqual({ snowflake: many[600], ...DEFAULT_USER_SETTINGS });
  });

  it('finds a member by game nickname, ignoring case', async () => {
    await users.update(ALICE, { nickname: 'AliceGo' });
    expect(await users.withNickname('alicego')).toEqual([
      { snowflake: ALICE, nickname: 'AliceGo' },
    ]);
    expect(await users.withNickname('nobody')).toEqual([]);
  });

  it('finds everybody who registered one in-game name, without regard to case and accents', async () => {
    await users.update(BOB, { nickname: 'pinétrainer' });
    await users.update(ALICE, { nickname: 'PineTrainer' });
    await users.update(CAROL, { nickname: 'PineTrainer2' });
    // Each with the name as they registered it.
    expect(await users.withNickname('PINETRAINER')).toEqual([
      { snowflake: BOB, nickname: 'pinétrainer' },
      { snowflake: ALICE, nickname: 'PineTrainer' },
    ]);
    // The whole name, not a part of it, and no padding.
    expect(await users.withNickname('PineTrain')).toEqual([]);
    expect(await users.withNickname('PineTrainer ')).toEqual([]);
  });

  describe('forgetting a member (plan 8G, `/admin forget`)', () => {
    const NOW = 1_800_000_000_000;

    beforeEach(async () => {
      // Two servers, each with a region for the saved routes; a server's rows go with it.
      await db.deleteFrom('Guild').execute();
      await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
      await sql`insert into Region (id, guildId, channelId)
                values (1, 1, 1234567890123456788), (2, 2, 1234567890123456789)`.execute(db);
    });

    /** A want of each table, a gym notice and a saved route of the member in a server. */
    const hang = async (member: string, guild: 1 | 2) => {
      const userId = await users.ensure(member);
      await sql`insert into PokemonNotification (pokemon, guildId, userId)
                values (150, ${guild}, ${userId})`.execute(db);
      await sql`insert into TargetWant (guildId, userId, target, createdAt)
                values (${guild}, ${userId}, 'reward:pokemon:147', ${NOW})`.execute(db);
      await sql`insert into GymNotification (gym, userId, guildId)
                values ('12', ${userId}, ${guild})`.execute(db);
      await sql`insert into SavedRoutes (userId, name, region, gyms)
                values (${userId}, 'Loop', ${guild}, '1,2')`.execute(db);
    };
    /** How many rows each table that hangs on `User` holds, and the members with a row. */
    const rows = async () => {
      const count = async (table: 'PokemonNotification' | 'TargetWant' | 'GymNotification') =>
        (await db.selectFrom(table).select('id').execute()).length;
      return {
        members: (await db.selectFrom('User').select('userSnowflake').orderBy('id').execute()).map(
          (row) => row.userSnowflake,
        ),
        wants: await count('PokemonNotification'),
        targetWants: await count('TargetWant'),
        gymTargets: await count('GymNotification'),
        savedRoutes: (await db.selectFrom('SavedRoutes').select('id').execute()).length,
      };
    };

    it('counts what hangs on a member’s row, over every server', async () => {
      await users.update(ALICE, { friendCode: '1111 2222 3333', nickname: 'AliceGo' });
      await hang(ALICE, 1);
      await hang(ALICE, 2);
      await hang(BOB, 1);
      expect(await users.holdingsOf(ALICE)).toEqual({
        friendCode: true,
        inGameName: true,
        pokebattlerId: false,
        wants: 2,
        targetWants: 2,
        gymTargets: 2,
        savedRoutes: 2,
      });
      expect(await users.holdingsOf(BOB)).toEqual({
        friendCode: false,
        inGameName: false,
        pokebattlerId: false,
        wants: 1,
        targetWants: 1,
        gymTargets: 1,
        savedRoutes: 1,
      });
      // Nothing is held of a member without a row, and asking makes none.
      expect(await users.holdingsOf(CAROL)).toBeUndefined();
      expect(await users.idFor(CAROL)).toBeUndefined();
    });

    it('forgets a member: their row and what hangs on it in every server, and nobody else’s', async () => {
      await users.update(ALICE, { friendCode: '1111 2222 3333', pokebattlerId: 7 });
      await users.update(BOB, { friendCode: '4444 5555 6666', nickname: 'BobGo' });
      await hang(ALICE, 1);
      await hang(ALICE, 2);
      await hang(BOB, 1);
      await hang(BOB, 2);
      const bobBefore = await users.get(BOB);

      // What went is what was counted.
      const held = await users.holdingsOf(ALICE);
      expect(await users.forget(ALICE)).toEqual(held);
      expect(held).toMatchObject({ wants: 2, targetWants: 2, gymTargets: 2, savedRoutes: 2 });

      expect(await users.holdingsOf(ALICE)).toBeUndefined();
      expect(await users.get(ALICE)).toEqual({ snowflake: ALICE, ...DEFAULT_USER_SETTINGS });
      // The other member keeps their row as it was and their two rows of every table.
      expect(await users.get(BOB)).toEqual(bobBefore);
      expect(await rows()).toEqual({
        members: [BOB],
        wants: 2,
        targetWants: 2,
        gymTargets: 2,
        savedRoutes: 2,
      });
      expect(await users.holdingsOf(BOB)).toMatchObject({ wants: 2, savedRoutes: 2 });
    });

    it('forgets nothing of a member without a row, and of one forgotten already', async () => {
      await hang(BOB, 1);
      expect(await users.forget(ALICE)).toBeUndefined();
      await hang(ALICE, 1);
      expect(await users.forget(ALICE)).toBeDefined();
      expect(await users.forget(ALICE)).toBeUndefined();
      expect(await rows()).toEqual({
        members: [BOB],
        wants: 1,
        targetWants: 1,
        gymTargets: 1,
        savedRoutes: 1,
      });
    });

    it('forgets the row id the process remembered, so that their next change makes a new row', async () => {
      const ids = new RowIds();
      const remembering = new UserRepository(db, ids);
      const before = await remembering.ensure(ALICE);
      expect(ids.user(ALICE)).toBe(before);
      await remembering.forget(ALICE);
      expect(ids.user(ALICE)).toBeUndefined();
      const after = await remembering.ensure(ALICE);
      expect(after).not.toBe(before);
    });

    it('joins a caller’s transaction: nothing is gone when that is rolled back', async () => {
      await users.update(ALICE, { nickname: 'AliceGo' });
      await hang(ALICE, 1);
      await expect(
        db.transaction().execute(async (trx) => {
          await new UserRepository(trx).forget(ALICE);
          throw new Error('rolled back');
        }),
      ).rejects.toThrow('rolled back');
      expect(await users.holdingsOf(ALICE)).toMatchObject({ inGameName: true, wants: 1 });
    });
  });
});
