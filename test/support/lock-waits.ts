import { sql, type QueryExecutorProvider } from 'kysely';

/** The id of the connection a database handle or transaction runs on (`connection_id()`). */
export async function connectionId(db: QueryExecutorProvider): Promise<number> {
  const own = await sql<{ id: number | string }>`select connection_id() as id`.execute(db);
  return Number(own.rows[0]?.id);
}

/**
 * How many transactions of this database's user (the test server is shared), other than the one
 * on connection `holder` (the one holding the lock), wait for a lock: asked until one does, or
 * until `deadline` milliseconds have passed. A real MySQL tells nobody when a statement begins to
 * wait, so `information_schema.innodb_trx` is asked; InnoDB fills it anew only once it has not
 * been read for 0.1 seconds, so it is asked every 150 milliseconds (asked more often, it would show
 * the same moment for ever).
 */
export async function lockWaits(db: QueryExecutorProvider, holder: number, deadline = 10_000) {
  const waiting = async () => {
    const rows = await sql<{ waits: number | string }>`
      select count(*) as waits
      from information_schema.innodb_trx t
      join information_schema.processlist p on p.id = t.trx_mysql_thread_id
      where t.trx_state = 'LOCK WAIT' and t.trx_mysql_thread_id <> ${holder}
        and p.user = substring_index(current_user(), '@', 1)`.execute(db);
    return Number(rows.rows[0]?.waits);
  };
  const end = Date.now() + deadline;
  let waits = await waiting();
  while (waits === 0 && Date.now() < end) {
    // eslint-disable-next-line no-restricted-syntax -- a real MySQL: asked until the statement waits
    await new Promise((resolve) => setTimeout(resolve, 150));
    waits = await waiting();
  }
  return waits;
}
