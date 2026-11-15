/**
 * MySQL's duplicate-key error (ER_DUP_ENTRY, errno 1062); with `key`, only a duplicate of that
 * key (its name as the migration gave it: MySQL says `Table.key`, before 8.0.19 `key` alone), so
 * that a duplicate of another key (a primary key made twice) is not taken for the one expected.
 */
export function isDuplicateEntry(error: unknown, key?: string): boolean {
  if (typeof error !== 'object' || error === null || !('errno' in error)) return false;
  if (error.errno !== 1062) return false;
  if (key === undefined) return true;
  const message =
    'sqlMessage' in error && typeof error.sqlMessage === 'string' ? error.sqlMessage : '';
  return message.endsWith(`.${key}'`) || message.endsWith(` '${key}'`);
}

/**
 * MySQL's `ER_NO_REFERENCED_ROW_2` (errno 1452): a row was hung on a parent row that does not
 * exist (a server's `Guild` row gone, say).
 */
export function isMissingParentRow(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'errno' in error && error.errno === 1452;
}

/** MySQL's deadlock (ER_LOCK_DEADLOCK, errno 1213): the transaction was rolled back, all of it. */
export function isDeadlock(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'errno' in error && error.errno === 1213;
}
