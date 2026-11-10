import { Kysely, MysqlDialect, type LogConfig } from 'kysely';
import { createPool, type Pool, type PoolConnection } from 'mysql2';
import type { DbConfig } from './db-config.js';

/** The mode under which MySQL reads a backslash in a string as itself, not as an escape. */
const NO_BACKSLASH_ESCAPES = 'NO_BACKSLASH_ESCAPES';

/**
 * Why a session of this `sql_mode` is refused, or nothing. mysql2 puts the values of a statement
 * into its text on the client and escapes them with backslashes (`query()`, which Kysely uses):
 * a server that does not read a backslash as an escape would read such text wrongly, and a quote
 * in a member's text would end the string.
 */
export function sqlModeRefusal(mode: string): string | undefined {
  if (!mode.toUpperCase().split(',').includes(NO_BACKSLASH_ESCAPES)) return undefined;
  return (
    `This MySQL server's sql_mode has ${NO_BACKSLASH_ESCAPES}, under which Professor Pine cannot ` +
    `put text into its statements safely (it escapes with backslashes): take ` +
    `${NO_BACKSLASH_ESCAPES} out of the server's sql_mode. The stack's own MySQL runs without it.`
  );
}

/** What Kysely and the bot use of a mysql2 pool. */
export type CheckedPool = Pick<Pool, 'getConnection' | 'end'>;

/**
 * The pool, with every connection asked for its session's `sql_mode` before it is first handed
 * out (one question per connection, not per use): one with `NO_BACKSLASH_ESCAPES` is closed and
 * the caller gets `sqlModeRefusal`'s sentence, so nothing is ever escaped for it. Every pool of
 * the bot, the migrator and the scripts is made by `createDb`, so the check is in one place. A
 * session's mode is the server's at the time it connects; nothing of Pine sets it.
 */
export function checkedPool(pool: Pool): CheckedPool {
  const asked = new WeakSet<PoolConnection>();
  return {
    getConnection(callback) {
      pool.getConnection((err, connection) => {
        // mysql2 hands no connection with an error, whatever its types say.
        if (err || asked.has(connection)) {
          callback(err, connection);
          return;
        }
        connection.query('select @@session.sql_mode as mode', (failed, rows) => {
          const mode = Array.isArray(rows) ? (rows[0] as { mode?: unknown } | undefined)?.mode : '';
          const refusal = failed ?? refusalOf(mode);
          if (refusal) {
            // Out of the pool, which then opens another when asked: never handed out.
            connection.destroy();
            callback(refusal, connection);
            return;
          }
          asked.add(connection);
          callback(null, connection);
        });
      });
    },
    end: (callback) => pool.end(callback),
  };
}

function refusalOf(mode: unknown): Error | undefined {
  const refusal = sqlModeRefusal(typeof mode === 'string' ? mode : '');
  return refusal === undefined ? undefined : new Error(refusal);
}

/**
 * BIGINT and DECIMAL values come back as strings (bigNumberStrings), so Discord
 * snowflakes stored in BIGINT columns keep full precision. `timezone: 'Z'` only tells the driver
 * how to turn a JavaScript `Date` into DATETIME text and back (as UTC, whatever zone the machine
 * is in); it does not set the session's `time_zone`, so `NOW()` and TIMESTAMP columns would still
 * be in the server's zone. The bot's own columns hold epoch milliseconds and need neither.
 *
 * The pool keeps up to ten connections open and hands them out again: a query does not make a
 * connection of its own. `log` hears of every statement Kysely sends, `begin` and `commit`
 * included (a test counts the round trips of a command with it). A server whose `sql_mode` has
 * `NO_BACKSLASH_ESCAPES` is refused at the first statement (`checkedPool`).
 */
export function createDb<Schema>(config: DbConfig, log?: LogConfig): Kysely<Schema> {
  return new Kysely<Schema>({
    ...(log === undefined ? {} : { log }),
    dialect: new MysqlDialect({
      pool: checkedPool(
        createPool({
          ...config,
          charset: 'utf8mb4',
          supportBigNumbers: true,
          bigNumberStrings: true,
          timezone: 'Z',
          connectionLimit: 10,
        }),
      ),
    }),
  });
}
