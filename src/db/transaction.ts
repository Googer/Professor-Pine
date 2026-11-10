import type { IsolationLevel, Kysely } from 'kysely';
import { isDeadlock } from './errors.js';

/**
 * Runs `fn` in a transaction. When `db` already is one (the caller opened it), `fn` joins it
 * instead of starting a nested one, so the caller decides whether everything commits.
 * `isolation` sets the level of a transaction started here (`read committed` takes no gap
 * locks, so two writers of a row that is not there yet do not deadlock); a method that asks for
 * one cannot join a caller's transaction, whose level is set already: that throws.
 */
export async function inTransaction<DB, T>(
  db: Kysely<DB>,
  fn: (trx: Kysely<DB>) => Promise<T>,
  options: { isolation?: IsolationLevel; readOnly?: boolean } = {},
): Promise<T> {
  if (db.isTransaction) {
    if (options.isolation !== undefined) {
      throw new Error(
        `a transaction at isolation level ${options.isolation} cannot join a caller's transaction`,
      );
    }
    return fn(db);
  }
  const builder = db.transaction();
  const leveled =
    options.isolation === undefined ? builder : builder.setIsolationLevel(options.isolation);
  // A transaction that only reads (plan 8H-8, R3: several reads of one snapshot) says so.
  return (options.readOnly === true ? leveled.setAccessMode('read only') : leveled).execute(fn);
}

/** How often `retryOnDeadlock` runs its work before it lets a deadlock through. */
export const DEADLOCK_TRIES = 3;

/**
 * Runs `fn` again when MySQL chose it as a deadlock's victim, up to `DEADLOCK_TRIES` times in
 * all: the deadlock rolled back its transaction, all of it, so `fn` must start its own (or write
 * in statements of their own) and find on each try whether its work is still to do. Inside a
 * caller's transaction `fn` runs once: the caller's transaction is gone with the deadlock, and
 * only the caller can run it again.
 */
export async function retryOnDeadlock<DB, T>(db: Kysely<DB>, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (db.isTransaction || attempt >= DEADLOCK_TRIES || !isDeadlock(err)) throw err;
    }
  }
}
