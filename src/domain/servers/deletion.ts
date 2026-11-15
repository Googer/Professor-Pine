/** What the deletion of a server's data reads of its record (plan 19C-3, `ServerRecord`). */
export interface DeletionRecord {
  /** Since when Pine is no longer in the server; null while it is. */
  leftAt: number | null;
  /** When the server's data was last deleted; null where it never was. */
  deletedAt: number | null;
}

/**
 * Whether the server's data was deleted since Pine last left it (plan 19C-3). A server's record
 * keeps when its data was deleted after it adds Pine back (so that it is new to this Pine's
 * settings, `ServerStandings.setUpOnRecord`); one that leaves again after that is left, not
 * deleted, until its data is deleted again 30 days later.
 */
export function deletedSinceLeft(record: DeletionRecord): boolean {
  return record.leftAt !== null && record.deletedAt !== null && record.deletedAt >= record.leftAt;
}
