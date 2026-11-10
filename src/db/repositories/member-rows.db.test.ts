import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { GuildRepository } from './guild-repository.js';
import { findMemberInGuild, withMemberLocked } from './member-rows.js';
import { RowIds } from './row-ids.js';
import { UserRepository } from './user-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';

/** The rows of `User` and `Guild` with the process's memory of them (`RowIds`, plan 4F). */
describe('member rows with a memory of the rows that were seen', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  /** The statements since they were last cleared. */
  const statements: string[] = [];

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase({
      log: (event) => {
        statements.push(event.query.sql);
      },
    }));
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('GymNotification').execute();
    await db.deleteFrom('User').execute();
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (1, ${HOME})`.execute(db);
    statements.length = 0;
  });

  /** A change that adds one gym target, as a repository would. */
  const addTarget = (ids: RowIds | undefined, memberId = ALICE, guildId = HOME, gym = '1') =>
    withMemberLocked(
      db,
      memberId,
      guildId,
      true,
      async (trx, member) => {
        if (!member) throw new Error('no member');
        await trx
          .insertInto('GymNotification')
          .values({ ...member, gym })
          .execute();
        return member;
      },
      ids,
    );
  const targets = () => db.selectFrom('GymNotification').select(['userId', 'gym']).execute();

  it('asks for both rows every time without a memory, as it always did', async () => {
    await addTarget(undefined);
    statements.length = 0;
    await addTarget(undefined, ALICE, HOME, '2');
    // The member's row, the server's, begin, the lock, the insert, commit.
    expect(statements).toHaveLength(6);
    statements.length = 0;
    expect(await findMemberInGuild(db, ALICE, HOME)).toBeDefined();
    expect(statements).toHaveLength(2);
  });

  it('asks for a row once with a memory, and then only locks the member’s', async () => {
    const ids = new RowIds();
    const first = await addTarget(ids);
    // The look for the member's row, the server's, begin, the member's row, the lock, the
    // insert, commit.
    expect(statements).toHaveLength(7);
    expect(ids.user(ALICE)).toBe(first.userId);
    expect(ids.guild(HOME)).toBe(1);
    statements.length = 0;
    expect(await addTarget(ids, ALICE, HOME, '2')).toEqual(first);
    expect(statements.map((statement) => statement.split(' ')[0])).toEqual([
      'begin',
      'select',
      'insert',
      'commit',
    ]);
    // The lock is still taken, by the snowflake, whatever is remembered.
    expect(statements[1]).toContain('for update');
    statements.length = 0;
    expect(await findMemberInGuild(db, ALICE, HOME, ids)).toEqual(first);
    expect(statements).toEqual([]);
  });

  it('never remembers a row that is missing', async () => {
    const ids = new RowIds();
    expect(await findMemberInGuild(db, BOB, HOME, ids)).toBeUndefined();
    expect(await findMemberInGuild(db, BOB, AWAY, ids)).toBeUndefined();
    const userId = await new UserRepository(db).ensure(BOB);
    // Found at once, though it was looked for in vain a moment ago.
    expect(await findMemberInGuild(db, BOB, HOME, ids)).toEqual({ userId, guildId: 1 });
    expect(await findMemberInGuild(db, BOB, AWAY, ids)).toBeUndefined();
    const away = await new GuildRepository(db).ensure(AWAY);
    expect(await findMemberInGuild(db, BOB, AWAY, ids)).toEqual({ userId, guildId: away });
  });

  it('does not remember the row of a member whose first change failed', async () => {
    const ids = new RowIds();
    await expect(
      withMemberLocked(db, ALICE, HOME, true, () => Promise.reject(new Error('no')), ids),
    ).rejects.toThrow('no');
    // The row was made inside the transaction and went with it.
    expect(await db.selectFrom('User').selectAll().execute()).toEqual([]);
    expect(ids.user(ALICE)).toBeUndefined();
    const member = await addTarget(ids);
    expect(ids.user(ALICE)).toBe(member.userId);
  });

  it('forgets a member’s row that is gone after all, and makes the change as for a new member', async () => {
    const ids = new RowIds();
    const before = await addTarget(ids);
    // Deleted behind the bot's back: nothing in either bot does this, but a hand might.
    await db.deleteFrom('User').execute();
    expect(await targets()).toEqual([]);
    const after = await addTarget(ids);
    expect(after.userId).not.toBe(before.userId);
    expect(await targets()).toEqual([{ userId: after.userId, gym: '1' }]);
    expect(ids.user(ALICE)).toBe(after.userId);
    // Without `create` there is then simply nothing to change.
    await db.deleteFrom('User').execute();
    const seen = await withMemberLocked(
      db,
      ALICE,
      HOME,
      false,
      (_trx, member) => Promise.resolve(member),
      ids,
    );
    expect(seen).toBeUndefined();
    expect(ids.user(ALICE)).toBeUndefined();
  });

  it('forgets a server whose row was deleted behind the process, and makes the change on its new row', async () => {
    const ids = new RowIds();
    await addTarget(ids);
    expect(ids.guild(HOME)).toBe(1);
    // The legacy bot left the server and came back: the row is another, with another id.
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (7, ${HOME})`.execute(db);
    expect(await targets()).toEqual([]);
    // The write fails the foreign key on the remembered id, and is made once more.
    const again = await addTarget(ids);
    expect(again.guildId).toBe(7);
    expect(ids.guild(HOME)).toBe(7);
    expect(ids.guildSnowflake(1)).toBeUndefined();
    expect(await db.selectFrom('GymNotification').select(['guildId', 'gym']).execute()).toEqual([
      { guildId: 7, gym: '1' },
    ]);
    // Deleted and not made again: the change makes the row, as it always did.
    await db.deleteFrom('Guild').execute();
    const made = await addTarget(ids, ALICE, HOME, '2');
    expect(made.guildId).not.toBe(7);
    expect(ids.guild(HOME)).toBe(made.guildId);
    // Without `create` there is nothing to change in a server that has no row.
    await db.deleteFrom('Guild').execute();
    const seen = await withMemberLocked(
      db,
      ALICE,
      HOME,
      false,
      async (trx, member) => {
        if (member)
          await trx
            .insertInto('GymNotification')
            .values({ ...member, gym: '3' })
            .execute();
        return member;
      },
      ids,
    );
    expect(seen).toBeUndefined();
    expect(ids.guild(HOME)).toBeUndefined();
  });

  it('does not take another failure of the work for a missing server, nor one on an id it just read', async () => {
    const ids = new RowIds();
    await addTarget(ids);
    let runs = 0;
    await expect(
      withMemberLocked(
        db,
        ALICE,
        HOME,
        true,
        () => {
          runs += 1;
          return Promise.reject(new Error('no'));
        },
        ids,
      ),
    ).rejects.toThrow('no');
    expect(runs).toBe(1);
    expect(ids.guild(HOME)).toBe(1);
    // A foreign key that fails for another reason, with nothing remembered: once, and thrown.
    runs = 0;
    await expect(
      withMemberLocked(
        db,
        ALICE,
        HOME,
        true,
        async (trx, member) => {
          runs += 1;
          await trx
            .insertInto('GymNotification')
            .values({ userId: member?.userId ?? 0, guildId: 999, gym: '1' })
            .execute();
        },
        new RowIds(),
      ),
    ).rejects.toMatchObject({ errno: 1452 });
    expect(runs).toBe(1);
  });

  it('makes one row of two first changes of one member at once, and remembers it', async () => {
    const ids = new RowIds();
    const [first, second] = await Promise.all([
      addTarget(ids, ALICE, HOME, '1'),
      addTarget(ids, ALICE, HOME, '2'),
    ]);
    expect(first.userId).toBe(second.userId);
    const users = await db.selectFrom('User').select('id').execute();
    expect(users).toEqual([{ id: first.userId }]);
    expect(ids.user(ALICE)).toBe(first.userId);
    expect((await targets()).map((row) => row.gym).sort()).toEqual(['1', '2']);
    // And two members at once in a server nobody has seen.
    await db.deleteFrom('GymNotification').execute();
    await db.deleteFrom('Guild').execute();
    const fresh = new RowIds();
    const both = await Promise.all([
      addTarget(fresh, ALICE, AWAY, '1'),
      addTarget(fresh, BOB, AWAY, '1'),
    ]);
    expect(both[0].guildId).toBe(both[1].guildId);
    expect(await db.selectFrom('Guild').select('id').execute()).toEqual([{ id: both[0].guildId }]);
    expect(fresh.guild(AWAY)).toBe(both[0].guildId);
  });

  it('remembers nothing inside a caller’s transaction, also when it makes the change once more', async () => {
    const ids = new RowIds();
    // A new member and a new server, in a transaction that is rolled back.
    await expect(
      db.transaction().execute(async (trx) => {
        await withMemberLocked(
          trx,
          BOB,
          AWAY,
          true,
          async (inner, member) => {
            if (!member) throw new Error('no member');
            await inner
              .insertInto('GymNotification')
              .values({ ...member, gym: '1' })
              .execute();
          },
          ids,
        );
        throw new Error('rolled back');
      }),
    ).rejects.toThrow('rolled back');
    expect(ids.user(BOB)).toBeUndefined();
    expect(ids.guild(AWAY)).toBeUndefined();
    expect(await db.selectFrom('User').selectAll().execute()).toEqual([]);
    expect(await findMemberInGuild(db, BOB, AWAY, ids)).toBeUndefined();

    // A member who is remembered wrongly: forgotten, the change made, and not remembered anew.
    const before = await addTarget(ids);
    await db.deleteFrom('User').execute();
    const inside = await db
      .transaction()
      .execute((trx) =>
        withMemberLocked(trx, ALICE, HOME, true, (_inner, member) => Promise.resolve(member), ids),
      );
    expect(inside?.userId).not.toBe(before.userId);
    expect(ids.user(ALICE)).toBeUndefined();

    // A server that is remembered wrongly: forgotten, but the change is not made once more.
    // What the work wrote before it failed is still in the caller's transaction, and a
    // second run would write it again.
    await addTarget(ids);
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (9, ${HOME})`.execute(db);
    await sql`create table if not exists WorkLog (note varchar(20) not null)`.execute(db);
    await sql`delete from WorkLog`.execute(db);
    let runs = 0;
    const change = (inner: Kysely<DB>) =>
      withMemberLocked(
        inner,
        ALICE,
        HOME,
        true,
        async (trx, member) => {
          if (!member) throw new Error('no member');
          runs += 1;
          // A write that succeeds, then the one that fails the foreign key.
          await sql`insert into WorkLog (note) values ('ran')`.execute(trx);
          await trx
            .insertInto('GymNotification')
            .values({ ...member, gym: '4' })
            .execute();
          return member;
        },
        ids,
      );
    // The caller goes on after the failure and commits: the first run's write is there once.
    await db.transaction().execute(async (trx) => {
      await expect(change(trx)).rejects.toMatchObject({ errno: 1452 });
    });
    expect(runs).toBe(1);
    expect(ids.guild(HOME)).toBeUndefined();
    const logged = await sql<{ note: string }>`select note from WorkLog`.execute(db);
    expect(logged.rows).toEqual([{ note: 'ran' }]);
    expect(await db.selectFrom('GymNotification').selectAll().execute()).toEqual([]);
    // The caller's next try reads the row as it is; nothing is remembered from inside it.
    const moved = await db.transaction().execute((trx) => change(trx));
    expect(moved.guildId).toBe(9);
    expect(runs).toBe(2);
    expect(ids.guild(HOME)).toBeUndefined();
    expect(await db.selectFrom('GymNotification').select(['guildId', 'gym']).execute()).toEqual([
      { guildId: 9, gym: '4' },
    ]);
    await sql`drop table WorkLog`.execute(db);
  });

  it('gives the repositories of a process one memory: a row one of them read is known to all', async () => {
    const ids = new RowIds();
    const users = new UserRepository(db, ids);
    const guilds = new GuildRepository(db, ids);
    await users.update(ALICE, { mentions: false });
    // Reading the settings is seeing the row.
    await users.get(ALICE);
    expect(await guilds.idFor(HOME)).toBe(1);
    statements.length = 0;
    expect(await findMemberInGuild(db, ALICE, HOME, ids)).toEqual({
      userId: await users.idFor(ALICE),
      guildId: 1,
    });
    expect(await guilds.idFor(HOME)).toBe(1);
    expect(await guilds.snowflakeOf(1)).toBe(HOME);
    expect(statements).toEqual([]);
  });

  it('puts the memory right in ensure, which never trusts it', async () => {
    const ids = new RowIds();
    const guilds = new GuildRepository(db, ids);
    expect(await guilds.idFor(HOME)).toBe(1);
    // Deleted and made again behind the process: the memory still has the old id.
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (5, ${HOME})`.execute(db);
    expect(await guilds.idFor(HOME)).toBe(1);
    expect(await guilds.snowflakeOf(1)).toBe(HOME);
    statements.length = 0;
    expect(await guilds.ensure(HOME)).toBe(5);
    // It wrote and read, whatever it remembered.
    expect(statements.map((statement) => statement.split(' ')[0])).toEqual(['insert', 'select']);
    expect(await guilds.idFor(HOME)).toBe(5);
    expect(await guilds.snowflakeOf(5)).toBe(HOME);
    expect(ids.guildSnowflake(1)).toBeUndefined();
    // Deleted and not made again: ensure makes it.
    await db.deleteFrom('Guild').execute();
    const made = await guilds.ensure(HOME);
    expect(made).not.toBe(5);
    expect(ids.guild(HOME)).toBe(made);
  });

  it('forgets a server whose row the bot deletes, and takes its new row when it comes back', async () => {
    const ids = new RowIds();
    const guilds = new GuildRepository(db, ids);
    const first = await guilds.ensure(AWAY);
    expect(ids.guild(AWAY)).toBe(first);
    await guilds.remove(AWAY);
    expect(ids.guild(AWAY)).toBeUndefined();
    expect(ids.guildSnowflake(first)).toBeUndefined();
    expect(await guilds.idFor(AWAY)).toBeUndefined();
    expect(await guilds.snowflakeOf(first)).toBeUndefined();
    const second = await guilds.ensure(AWAY);
    expect(second).not.toBe(first);
    expect(await guilds.idFor(AWAY)).toBe(second);
    expect(await guilds.snowflakeOf(second)).toBe(AWAY);
  });
});
