import { sql, type Kysely } from 'kysely';
import type { WayspotKind } from '@pine/wayspot-core/export-file';
import type { GoneWayspot, Wayspot, WayspotWrites } from '../../domain/wayspots/kept.js';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';

/**
 * The kept Wayspots (`Wayspot`, migration 017): what the Wayfarer import writes and
 * `WayspotDirectory` holds in memory. Its twin in memory is `MemoryWayspots`
 * (`test/support/wayspots.ts`); both run `wayspotCases`.
 */
export interface WayspotStorage {
  /** Every kept Wayspot, by id (not those found gone). */
  all(): Promise<Wayspot[]>;
  /** The Wayspots an import found gone, by id: when the scan that found them gone was made, the kind they had. */
  gone(): Promise<Map<string, GoneWayspot>>;
  /**
   * Writes what an import decided (`WayspotWrites`), in one transaction: each row to insert or
   * update by id, the rows to delete, and the rows found gone. A new row was first seen
   * `importedAt` (a row that exists keeps its `firstSeen`); every row written was last seen
   * `scannedAt`, when the file's scan was made (`importedAt` when not given). The guards of
   * `planKept` hold here too, whatever the caller planned: a row (kept or gone) last seen after
   * `scannedAt` is not overwritten, and a row last seen after `startedAt` (when the file's scan
   * started; `scannedAt` when not given), but at `scannedAt`, is not marked gone.
   */
  saveFromImport(
    writes: WayspotWrites,
    importedAt: number,
    scannedAt?: number,
    startedAt?: number,
  ): Promise<void>;
  /**
   * Deletes these Wayspots (a Wayfarer gym that became a Pine gym), gone ones too; answers how
   * many kept ones there were.
   */
  remove(ids: readonly string[]): Promise<number>;
}

/**
 * Rows written in one statement at most: an import of a city writes about 43,000 (a few hundred
 * at a time keeps each statement small and the transaction's locks short).
 */
const CHUNK = 500;

function chunks<T>(list: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

/**
 * The `kind` of a Wayspot an import found gone from a covered cell: its row stays, unread by
 * `all` (whose kinds it is not), so that its `lastSeen`, when the scan that found it gone was
 * made, keeps an older file from bringing it back (plan 8W-3; no column was needed).
 */
const GONE = 'gone';

/**
 * The kind a Wayspot found gone is read as when its kind before is not known: a stop, the kind
 * most Wayspots are (it decides only what the row is called if it comes back).
 */
export const UNKNOWN_GONE_KIND: WayspotKind = 'stop';

const KINDS: ReadonlySet<string> = new Set<WayspotKind>(['gym', 'stop', 'powerspot']);
const isKind = (value: string | null): value is WayspotKind => value !== null && KINDS.has(value);

export class WayspotRepository implements WayspotStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async all(): Promise<Wayspot[]> {
    const rows = await this.db.selectFrom('Wayspot').selectAll().orderBy('id').execute();
    // A kind this version does not know (a later one's) is left out, and left alone.
    return rows.flatMap((row): Wayspot[] =>
      isKind(row.kind)
        ? [
            {
              id: row.id,
              kind: row.kind,
              formerKind: isKind(row.formerKind) ? row.formerKind : null,
              lat: row.lat,
              lon: row.lon,
              title: row.title,
              address: row.address,
              image: row.image,
              firstSeen: Number(row.firstSeen),
              lastSeen: Number(row.lastSeen),
            },
          ]
        : [],
    );
  }

  async gone(): Promise<Map<string, GoneWayspot>> {
    const rows = await this.db
      .selectFrom('Wayspot')
      .select(['id', 'lastSeen', 'formerKind'])
      .where('kind', '=', GONE)
      .orderBy('id')
      .execute();
    // The kind it had is kept in `formerKind`; one this version does not know (or none) is read
    // as a stop, so that the row still keeps an older file from bringing it back.
    return new Map(
      rows.map((row): [string, GoneWayspot] => [
        row.id,
        {
          goneAt: Number(row.lastSeen),
          kind: isKind(row.formerKind) ? row.formerKind : UNKNOWN_GONE_KIND,
        },
      ]),
    );
  }

  async saveFromImport(
    writes: WayspotWrites,
    importedAt: number,
    scannedAt: number = importedAt,
    startedAt: number = scannedAt,
  ): Promise<void> {
    const gone = writes.gone ?? [];
    if (writes.upsert.length === 0 && writes.remove.length === 0 && gone.length === 0) return;
    await inTransaction(this.db, async (trx) => {
      for (const part of chunks(writes.upsert)) {
        // A row a newer scan wrote, kept or gone, keeps every column (MySQL assigns from left to
        // right, so `lastSeen` is compared before it is changed, last).
        await trx
          .insertInto('Wayspot')
          .values(
            part.map((row) => ({
              id: row.id,
              kind: row.kind,
              formerKind: row.formerKind,
              lat: row.lat,
              lon: row.lon,
              title: row.title,
              address: row.address,
              image: row.image,
              firstSeen: String(importedAt),
              lastSeen: String(scannedAt),
            })),
          )
          .modifyEnd(
            sql`as new on duplicate key update
              kind = if(Wayspot.lastSeen > new.lastSeen, Wayspot.kind, new.kind),
              formerKind = if(Wayspot.lastSeen > new.lastSeen, Wayspot.formerKind, new.formerKind),
              lat = if(Wayspot.lastSeen > new.lastSeen, Wayspot.lat, new.lat),
              lon = if(Wayspot.lastSeen > new.lastSeen, Wayspot.lon, new.lon),
              title = if(Wayspot.lastSeen > new.lastSeen, Wayspot.title, new.title),
              address = if(Wayspot.lastSeen > new.lastSeen, Wayspot.address, new.address),
              image = if(Wayspot.lastSeen > new.lastSeen, Wayspot.image, new.image),
              lastSeen = greatest(Wayspot.lastSeen, new.lastSeen)`,
          )
          .execute();
      }
      for (const part of chunks(writes.remove)) {
        await trx.deleteFrom('Wayspot').where('id', 'in', part).execute();
      }
      // Found gone: kept as gone with the time of the scan that found it so (its kind before in
      // `formerKind`, assigned first), unless another scan saw it after this one started.
      for (const part of chunks(gone)) {
        await trx
          .updateTable('Wayspot')
          .set({
            formerKind: sql<string>`kind`,
            kind: GONE,
            lastSeen: String(scannedAt),
          })
          .where('id', 'in', part)
          .where('kind', '!=', GONE)
          .where((eb) =>
            eb.or([
              eb('lastSeen', '<=', String(startedAt)),
              eb('lastSeen', '=', String(scannedAt)),
            ]),
          )
          .execute();
      }
    });
  }

  async remove(ids: readonly string[]): Promise<number> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return 0;
    return inTransaction(this.db, async (trx) => {
      let removed = 0;
      for (const part of chunks(unique)) {
        const result = await trx
          .deleteFrom('Wayspot')
          .where('id', 'in', part)
          .where('kind', '!=', GONE)
          .executeTakeFirst();
        removed += Number(result.numDeletedRows);
        await trx.deleteFrom('Wayspot').where('id', 'in', part).execute();
      }
      return removed;
    });
  }
}
