import { sql, type Kysely } from 'kysely';
import type { DB } from '../../src/db/types.js';

/** A warning of MySQL (`show warnings`). */
export interface MysqlWarning {
  Level: string;
  Code: number;
  Message: string;
}

/** MySQL's code for a deprecated syntax ("'VALUES function' is deprecated …", 8.0.20 on). */
export const DEPRECATED_SYNTAX = 1287;

/**
 * The warnings MySQL gave for the last statement `work` ran, in a transaction of its own on one
 * connection (so a repository method joins it, and `show warnings` follows its last statement
 * rather than the commit's).
 */
export function lastWarnings(
  db: Kysely<DB>,
  work: (trx: Kysely<DB>) => Promise<unknown>,
): Promise<MysqlWarning[]> {
  return db.transaction().execute(async (trx) => {
    await work(trx);
    const { rows } = await sql<MysqlWarning>`show warnings`.execute(trx);
    return rows.map((row) => ({ Level: row.Level, Code: Number(row.Code), Message: row.Message }));
  });
}
