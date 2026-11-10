import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { fixtureForms } from '../../../test/support/wants.js';
import { PokemonNotificationRepository } from '../repositories/pokemon-notification-repository.js';
import { UserRepository } from '../repositories/user-repository.js';
import type { DB } from '../types.js';
import { exWantsToElite } from './2026_10_13_009_ex_wants_to_elite.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const CAROL = '312345678901234569';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';

/** The numbers the codec stored the two tiers under. */
const EX = -21;
const ELITE = -20;

describe('migration 009: a want for EX raids becomes a want for elite raids', () => {
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
    await db.deleteFrom('PokemonNotification').execute();
    await db.deleteFrom('User').execute();
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
  });

  const row = async (member: string, guildId: number, pokemon: number, type: string) =>
    db
      .insertInto('PokemonNotification')
      .values({ userId: await users.ensure(member), guildId, pokemon, type })
      .execute();
  /** `[member, server row, pokemon, type]` of every row, in the order they were made. */
  const stored = async () => {
    const rows = await db
      .selectFrom('PokemonNotification')
      .innerJoin('User', 'User.id', 'PokemonNotification.userId')
      .select(['User.userSnowflake as member', 'guildId', 'pokemon', 'type'])
      .orderBy('PokemonNotification.id')
      .execute();
    return rows.map((found) => [found.member, found.guildId, found.pokemon, found.type]);
  };
  const migrate = () => exWantsToElite.up(db);

  it('rewrites the EX want of a member who has no elite want in that server', async () => {
    await row(ALICE, 1, EX, 'raid');
    // Another member's elite want, and her own in another server, do not count as hers here.
    await row(BOB, 1, ELITE, 'raid');
    await row(ALICE, 2, ELITE, 'raid');
    await migrate();
    expect(await stored()).toEqual([
      [ALICE, 1, ELITE, 'raid'],
      [BOB, 1, ELITE, 'raid'],
      [ALICE, 2, ELITE, 'raid'],
    ]);
  });

  it('deletes the EX want of a member who already has the elite want in that server', async () => {
    await row(ALICE, 1, ELITE, 'raid');
    await row(ALICE, 1, EX, 'raid');
    await row(ALICE, 1, 150, 'both');
    // In the other server she has only the EX want: that one is rewritten.
    await row(ALICE, 2, EX, 'raid');
    await migrate();
    expect(await stored()).toEqual([
      [ALICE, 1, ELITE, 'raid'],
      [ALICE, 1, 150, 'both'],
      [ALICE, 2, ELITE, 'raid'],
    ]);
  });

  it('reads the type as the codec does: raid or both in any case, and writes raid', async () => {
    await row(ALICE, 1, EX, 'Both');
    await row(BOB, 1, EX, 'RAID');
    await row(BOB, 1, ELITE, 'both');
    await migrate();
    expect(await stored()).toEqual([
      [ALICE, 1, ELITE, 'raid'],
      [BOB, 1, ELITE, 'both'],
    ]);
  });

  it('reads a type with blanks around it, as the codec does', async () => {
    await row(ALICE, 1, EX, ' raid ');
    await row(BOB, 1, ELITE, ' Both');
    await row(BOB, 1, EX, 'RAID  ');
    await migrate();
    expect(await stored()).toEqual([
      [ALICE, 1, ELITE, 'raid'],
      [BOB, 1, ELITE, ' Both'],
    ]);
  });

  it('makes elite rows of two EX rows of one member, which then read as one want', async () => {
    await row(ALICE, 1, EX, 'raid');
    await row(ALICE, 1, EX, 'both');
    await migrate();
    expect(await stored()).toEqual([
      [ALICE, 1, ELITE, 'raid'],
      [ALICE, 1, ELITE, 'raid'],
    ]);
    const wants = new PokemonNotificationRepository(db, fixtureForms());
    expect(await wants.list(ALICE, HOME)).toEqual({
      wants: [{ target: { kind: 'tier', tier: { level: 'Elite', shadow: false } }, scope: 'raid' }],
      unreadable: 0,
    });
    // Taking the want off takes both rows.
    expect(
      await wants.remove(ALICE, HOME, { kind: 'tier', tier: { level: 'Elite', shadow: false } }),
    ).toBe(true);
    expect(await stored()).toEqual([]);
  });

  it('leaves alone a row the codec cannot read, and does not count one as the elite want', async () => {
    // A tier typed `spawn` is unreadable: never changed, never deleted on its own.
    await row(ALICE, 1, EX, 'spawn');
    await row(BOB, 1, ELITE, 'spawn');
    await row(BOB, 1, EX, 'raid');
    await migrate();
    expect(await stored()).toEqual([
      [ALICE, 1, EX, 'spawn'],
      [BOB, 1, ELITE, 'spawn'],
      [BOB, 1, ELITE, 'raid'],
    ]);
  });

  it('touches nothing else, and does nothing the second time', async () => {
    await row(ALICE, 1, -5, 'raid');
    await row(ALICE, 1, -6, 'both');
    await row(ALICE, 1, -35, 'raid');
    await row(ALICE, 1, 21, 'spawn');
    await row(CAROL, 1, EX, 'raid');
    await migrate();
    const once = await stored();
    expect(once).toEqual([
      [ALICE, 1, -5, 'raid'],
      [ALICE, 1, -6, 'both'],
      [ALICE, 1, -35, 'raid'],
      [ALICE, 1, 21, 'spawn'],
      [CAROL, 1, ELITE, 'raid'],
    ]);
    await migrate();
    expect(await stored()).toEqual(once);
  });

  it('leaves the member with one elite want that the repository reads', async () => {
    await row(ALICE, 1, EX, 'raid');
    await row(BOB, 1, EX, 'raid');
    await row(BOB, 1, ELITE, 'raid');
    await migrate();
    const wants = new PokemonNotificationRepository(db, fixtureForms());
    for (const member of [ALICE, BOB]) {
      expect(await wants.list(member, HOME)).toEqual({
        wants: [
          { target: { kind: 'tier', tier: { level: 'Elite', shadow: false } }, scope: 'raid' },
        ],
        unreadable: 0,
      });
    }
  });

  it('is skipped and counted, never deleted, when such a row turns up afterwards', async () => {
    // Written by an older version of this bot after a rollback, once the migration has run.
    await row(ALICE, 1, EX, 'raid');
    const wants = new PokemonNotificationRepository(db, fixtureForms());
    expect(await wants.list(ALICE, HOME)).toEqual({ wants: [], unreadable: 1 });
    expect(await stored()).toEqual([[ALICE, 1, EX, 'raid']]);
  });
});
