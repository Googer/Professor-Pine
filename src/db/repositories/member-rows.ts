import type { Kysely } from 'kysely';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';
import { RowIds } from './row-ids.js';

/** The rows of `User` and `Guild` that a member's rows in a server hang on. */
export interface MemberInGuild {
  userId: number;
  guildId: number;
}

/** MySQL's `ER_NO_REFERENCED_ROW_2`: a row was hung on a parent row that does not exist. */
const NO_REFERENCED_ROW = 1452;

function isMissingParentRow(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && 'errno' in err && err.errno === NO_REFERENCED_ROW
  );
}

/** The id of a member's row, from what was seen (`ids`) or from the table; undefined when none. */
async function userRow(db: Kysely<DB>, memberId: string, ids: RowIds): Promise<number | undefined> {
  const seen = ids.user(memberId);
  if (seen !== undefined) return seen;
  const row = await db
    .selectFrom('User')
    .select('id')
    .where('userSnowflake', '=', memberId)
    .executeTakeFirst();
  // A row read inside a caller's transaction may be one that transaction made and rolls back.
  if (row && !db.isTransaction) ids.sawUser(memberId, row.id);
  return row?.id;
}

/** The id of a server's row, from what was seen (`ids`) or from the table; undefined when none. */
async function guildRow(db: Kysely<DB>, guildId: string, ids: RowIds): Promise<number | undefined> {
  const seen = ids.guild(guildId);
  if (seen !== undefined) return seen;
  const row = await db
    .selectFrom('Guild')
    .select('id')
    .where('snowflake', '=', guildId)
    .executeTakeFirst();
  if (row && !db.isTransaction) ids.sawGuild(guildId, row.id);
  return row?.id;
}

/**
 * The row ids of a member and a server, without creating either and without a lock: for reading
 * what a member has in a server. Undefined when one of the two has no row, and the member has
 * nothing there then. With `ids` (the process's memory of rows it has seen) a row that is
 * known is not asked for again: the read that follows is then the only round trip.
 */
export async function findMemberInGuild(
  db: Kysely<DB>,
  memberId: string,
  guildId: string,
  ids: RowIds = RowIds.none,
): Promise<MemberInGuild | undefined> {
  const userId = await userRow(db, memberId, ids);
  if (userId === undefined) return undefined;
  const guild = await guildRow(db, guildId, ids);
  return guild === undefined ? undefined : { userId, guildId: guild };
}

/**
 * Runs `work` in a transaction that holds the member's row of `User` locked, so that two
 * changes of one member's wants, targets or the like run one after the other: neither "one row
 * per target" nor a count can then be passed by both. The tables themselves have no unique key
 * to lean on.
 *
 * With `create` the member's row and the server's are made when missing, and `work` always
 * runs; without it `work` gets undefined when either is missing (there is nothing to change),
 * and no transaction is opened for that.
 *
 * Both rows are looked for before the transaction, without a lock. The server's row is also
 * made there when it is missing (as `GuildRepository.ensure` makes it): made inside, a plain
 * read after the insert would look at the transaction's older view and miss the row when
 * another member's first change made it a moment earlier. The member's row is made inside, by
 * an insert only when it was missing, as `SavedRouteRepository.save` does and for its reasons:
 * an insert that finds the row uses up an id all the same, a plain read inside the transaction
 * would fix what it sees before it holds the lock, and a locking read of a row that is not
 * there makes two first changes wait for each other.
 *
 * These reads before the transaction assume that `db` is not itself a caller's transaction:
 * the repositories that use this are built over the pool. Inside a caller's transaction the
 * work would still be correct, but the first read would fix that transaction's view before the
 * member's lock is held.
 *
 * With `ids` (the process's memory of rows it has seen) the two looks before the transaction
 * are skipped for rows that are known, which leaves the transaction itself: of a member's
 * second change in a server nothing is asked twice. The member's row is locked by its
 * snowflake all the same, so what is remembered of it decides only whether an insert is
 * tried; when a remembered row turns out to be gone it is forgotten and the change runs once
 * more as for a member who was never seen. So does a change with `create` whose row was read
 * from the table and is gone once locked: the owner's `/admin forget` (plan 8G) deleted it
 * and committed while the lock waited. The server's row is used by its remembered id; when
 * that row is gone (the legacy bot deletes it on leaving a server, and the next one has
 * another id), `work` fails the foreign key of whatever it hangs on the server (MySQL's error
 * 1452): the server is then forgotten and the change runs once more, with the row as it is
 * now, or made anew. Not inside a caller's transaction: there the first run's writes are not
 * rolled back (there is no savepoint), so a second run would add to them; the server is
 * forgotten and the failure is the caller's, whose next try reads the row.
 */
export async function withMemberLocked<T>(
  db: Kysely<DB>,
  memberId: string,
  guildId: string,
  create: boolean,
  work: (trx: Kysely<DB>, member: MemberInGuild | undefined) => Promise<T>,
  ids: RowIds = RowIds.none,
): Promise<T> {
  const remembered = ids.user(memberId) !== undefined;
  const guildRemembered = ids.guild(guildId) !== undefined;
  const known = (await userRow(db, memberId, ids)) !== undefined;
  // Nothing to change for a member without a row: no lock is needed to say so.
  if (!known && !create) return work(db, undefined);
  let guildRowId = await guildRow(db, guildId, ids);
  if (guildRowId === undefined) {
    if (!create) return work(db, undefined);
    // The bot records a server when it joins it; this is for a row that went missing. Two
    // members may come here at once: the unique key makes one row of it.
    await db
      .insertInto('Guild')
      .values({ snowflake: guildId })
      .onDuplicateKeyUpdate({ snowflake: guildId })
      .execute();
    guildRowId = await guildRow(db, guildId, ids);
    if (guildRowId === undefined) throw new Error(`Guild row for ${guildId} vanished after insert`);
  }
  const guild = guildRowId;
  /** Set when the row that was only remembered is no longer there. */
  let forgotten = false;
  let made: number | undefined;
  const changed = inTransaction(db, async (trx) => {
    if (!known) {
      await trx
        .insertInto('User')
        .values({ userSnowflake: memberId })
        .onDuplicateKeyUpdate({ userSnowflake: memberId })
        .execute();
    }
    const user = await trx
      .selectFrom('User')
      .select('id')
      .where('userSnowflake', '=', memberId)
      .forUpdate()
      .executeTakeFirst();
    if (!user) {
      // Only remembered wrongly; or read just before the owner's `/admin forget` deleted it
      // (plan 8G), whose commit this lock waited for: either way the member is new now, and a
      // change that makes their row runs once more as for a new member.
      if (remembered || (known && create)) {
        forgotten = true;
        return undefined;
      }
      // Deleted since it was seen: nothing to change.
      if (!create) return { value: await work(trx, undefined) };
      throw new Error(`User row for ${memberId} vanished after insert`);
    }
    made = user.id;
    // From here on plain reads see everything that was written before the lock was got: the
    // first of them fixes what the transaction sees.
    return { value: await work(trx, { userId: user.id, guildId: guild }) };
  });
  let result: { value: T } | undefined;
  try {
    result = await changed;
  } catch (err) {
    // Only for an id that came from the memory: one that was just read and fails all the
    // same is a failure like any other. The second run reads the row, so it cannot come here.
    if (!guildRemembered || !isMissingParentRow(err)) throw err;
    ids.forgetGuild(guildId);
    // The transaction was the caller's: what `work` wrote before it failed is still in it,
    // and nothing here can take it back. The caller rolls back, or knows what it kept.
    if (db.isTransaction) throw err;
    return withMemberLocked(db, memberId, guildId, create, work, ids);
  }
  if (forgotten || result === undefined) {
    ids.forgetUser(memberId);
    return withMemberLocked(db, memberId, guildId, create, work, ids);
  }
  // Only now, and only when the transaction was this function's own: the row is committed.
  if (made !== undefined && !db.isTransaction) ids.sawUser(memberId, made);
  return result.value;
}
