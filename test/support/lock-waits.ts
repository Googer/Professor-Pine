import { sql, type QueryExecutorProvider } from 'kysely';

/** The id of the connection a database handle or transaction runs on (`connection_id()`). */
export async function connectionId(db: QueryExecutorProvider): Promise<number> {
  const own = await sql<{ id: number | string }>`select connection_id() as id`.execute(db);
  return Number(own.rows[0]?.id);
}

/**
 * How many transactions of this database's user (the test server is shared) wait for a lock now,
 * other than the one on connection `holder` when given. Read from
 * `performance_schema.data_lock_waits` (one row per lock a transaction waits for and per
 * transaction it waits behind, so transactions are counted once) and `threads` (the user and
 * connection of a waiting transaction), which the test user may read. Not from
 * `information_schema.innodb_trx` and `processlist`: MySQL 9.7 converts every statement's text
 * into their utf8mb3 columns, and fails (error 3854) while any session of the server runs a
 * statement with a character beyond three bytes, such as the emoji of a gym's name.
 */
export async function lockWaitsNow(db: QueryExecutorProvider, holder?: number): Promise<number> {
  const rows = await sql<{ waits: number | string }>`
    select count(distinct w.requesting_engine_transaction_id) as waits
    from performance_schema.data_lock_waits w
    join performance_schema.threads t on t.thread_id = w.requesting_thread_id
    where t.processlist_user = substring_index(current_user(), '@', 1)
      and (${holder ?? null} is null or t.processlist_id <> ${holder ?? null})`.execute(db);
  return Number(rows.rows[0]?.waits);
}

/**
 * How many transactions of this database's user, other than the one on connection `holder` (the
 * one holding the lock), wait for a lock (`lockWaitsNow`): asked until one does, or until
 * `deadline` milliseconds have passed. A real MySQL tells nobody when a statement begins to
 * wait, so it is asked every 150 milliseconds.
 */
export async function lockWaits(db: QueryExecutorProvider, holder: number, deadline = 10_000) {
  const waiting = () => lockWaitsNow(db, holder);
  const end = Date.now() + deadline;
  let waits = await waiting();
  while (waits === 0 && Date.now() < end) {
    // eslint-disable-next-line no-restricted-syntax -- a real MySQL: asked until the statement waits
    await new Promise((resolve) => setTimeout(resolve, 150));
    waits = await waiting();
  }
  return waits;
}
