import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
import type { DB } from '../types.js';
import { DEFAULT_USER_SETTINGS, UserRepository } from './user-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const CAROL = '312345678901234569';

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
});
