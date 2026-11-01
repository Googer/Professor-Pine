import { Kysely, MysqlDialect, type LogConfig } from 'kysely';
import { createPool } from 'mysql2';
import type { DbConfig } from './db-config.js';

/**
 * BIGINT and DECIMAL values come back as strings (bigNumberStrings), so Discord
 * snowflakes stored in BIGINT columns keep full precision. `timezone: 'Z'` only tells the driver
 * how to turn a JavaScript `Date` into DATETIME text and back (as UTC, whatever zone the machine
 * is in); it does not set the session's `time_zone`, so `NOW()` and TIMESTAMP columns would still
 * be in the server's zone. The bot's own columns hold epoch milliseconds and need neither.
 *
 * The pool keeps up to ten connections open and hands them out again: a query does not make a
 * connection of its own. `log` hears of every statement Kysely sends, `begin` and `commit`
 * included (a test counts the round trips of a command with it).
 */
export function createDb<Schema>(config: DbConfig, log?: LogConfig): Kysely<Schema> {
  return new Kysely<Schema>({
    ...(log === undefined ? {} : { log }),
    dialect: new MysqlDialect({
      pool: createPool({
        ...config,
        charset: 'utf8mb4',
        supportBigNumbers: true,
        bigNumberStrings: true,
        timezone: 'Z',
        connectionLimit: 10,
      }),
    }),
  });
}
