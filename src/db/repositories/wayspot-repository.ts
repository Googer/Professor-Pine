import { sql, type Kysely } from 'kysely';
import type { WayspotKind } from '@pine/wayspot-core/export-file';
import type { GoneWayspot, Wayspot, WayspotWrites } from '../../domain/wayspots/kept.js';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';

/** A kept Wayspot with the server (its `Guild` row) it is kept for. */
export interface ServerKept {
  guildId: number;
  wayspot: Wayspot;
}

/**
 * The kept Wayspots of each server (`ServerWayspot`, migration 059; plan 19B-3): what a server's
 * Wayfarer import writes and `WayspotDirectory` holds in memory, keyed by server and Wayfarer id.
 * Every method but `everyServer` reads or writes one server's rows alone: another server's row of
 * the same Wayfarer id is neither seen nor changed. Its twin in memory is `MemoryWayspots`
 * (`test/support/wayspots.ts`); both run `wayspotCases`.
 */
export interface WayspotStorage {
  /**
   * Every server's kept Wayspots (not those found gone), each with its server, by server then id:
   * the directory's load at start only (`WayspotDirectory.load()`), which holds them all. A
   * server's import reads its own rows again (`all`), never every server's.
   */
  everyServer(): Promise<ServerKept[]>;
  /**
   * The server's kept Wayspots, by id (not those found gone): its import's plan, and the
   * directory's load of that server after its import.
   */
  all(guildId: number): Promise<Wayspot[]>;
  /**
   * The Wayspots the server's imports found gone, by id: when the scan that found them gone was
   * made, the kind they had.
   */
  gone(guildId: number): Promise<Map<string, GoneWayspot>>;
  /**
   * Writes what an import of the server decided (`WayspotWrites`), in one transaction: each row
   * to insert or update by id, the rows to delete, and the rows found gone. A new row was first
   * seen `importedAt` (a row that exists keeps its `firstSeen`); every row written was last seen
   * `scannedAt`, when the file's scan was made (`importedAt` when not given). The guards of
   * `planKept` hold here too, whatever the caller planned: a row (kept or gone) last seen after
   * `scannedAt` is not overwritten, and a row last seen after `startedAt` (when the file's scan
   * started; `scannedAt` when not given), but at `scannedAt`, is not marked gone.
   */
  saveFromImport(
    guildId: number,
    writes: WayspotWrites,
    importedAt: number,
    scannedAt?: number,
    startedAt?: number,
  ): Promise<void>;
  /**
   * Deletes these Wayspots of the server (a Wayfarer gym that became one of its gyms), gone ones
   * too; answers how many kept ones there were.
   */
  remove(guildId: number, ids: readonly string[]): Promise<number>;
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

/** A row as read; undefined for one of a kind this version does not know (a later one's). */
function keptOf(row: {
  id: string;
  kind: string;
  formerKind: string | null;
  lat: number;
  lon: number;
  title: string;
  address: string | null;
  image: string | null;
  firstSeen: string;
  lastSeen: string;
}): Wayspot | undefined {
  return isKind(row.kind)
    ? {
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
      }
    : undefined;
}

export class WayspotRepository implements WayspotStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async everyServer(): Promise<ServerKept[]> {
    // Every row, read once at a load (the directory holds them all): the table read in its key's
    // order; the tombstones, few, are passed over as they come.
    const rows = await this.db
      .selectFrom('ServerWayspot')
      .selectAll()
      .orderBy('guildId')
      .orderBy('id')
      .execute();
    // A kind this version does not know (a later one's) is left out, and left alone.
    return rows.flatMap((row): ServerKept[] => {
      const wayspot = keptOf(row);
      return wayspot ? [{ guildId: row.guildId, wayspot }] : [];
    });
  }

  async all(guildId: number): Promise<Wayspot[]> {
    // The server's rows by the primary key `(guildId, id)`.
    const rows = await this.db
      .selectFrom('ServerWayspot')
      .selectAll()
      .where('guildId', '=', guildId)
      .orderBy('id')
      .execute();
    return rows.flatMap((row) => keptOf(row) ?? []);
  }

  async gone(guildId: number): Promise<Map<string, GoneWayspot>> {
    // By `serverwayspot_guildid_kind_index (guildId, kind)`: the server's tombstones alone.
    const rows = await this.db
      .selectFrom('ServerWayspot')
      .select(['id', 'lastSeen', 'formerKind'])
      .where('guildId', '=', guildId)
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
    guildId: number,
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
          .insertInto('ServerWayspot')
          .values(
            part.map((row) => ({
              guildId,
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
              kind = if(ServerWayspot.lastSeen > new.lastSeen, ServerWayspot.kind, new.kind),
              formerKind = if(ServerWayspot.lastSeen > new.lastSeen, ServerWayspot.formerKind, new.formerKind),
              lat = if(ServerWayspot.lastSeen > new.lastSeen, ServerWayspot.lat, new.lat),
              lon = if(ServerWayspot.lastSeen > new.lastSeen, ServerWayspot.lon, new.lon),
              title = if(ServerWayspot.lastSeen > new.lastSeen, ServerWayspot.title, new.title),
              address = if(ServerWayspot.lastSeen > new.lastSeen, ServerWayspot.address, new.address),
              image = if(ServerWayspot.lastSeen > new.lastSeen, ServerWayspot.image, new.image),
              lastSeen = greatest(ServerWayspot.lastSeen, new.lastSeen)`,
          )
          .execute();
      }
      // By the primary key `(guildId, id)`, as every write below.
      for (const part of chunks(writes.remove)) {
        await trx
          .deleteFrom('ServerWayspot')
          .where('guildId', '=', guildId)
          .where('id', 'in', part)
          .execute();
      }
      // Found gone: kept as gone with the time of the scan that found it so (its kind before in
      // `formerKind`, assigned first), unless another scan saw it after this one started.
      for (const part of chunks(gone)) {
        await trx
          .updateTable('ServerWayspot')
          .set({
            formerKind: sql<string>`kind`,
            kind: GONE,
            lastSeen: String(scannedAt),
          })
          .where('guildId', '=', guildId)
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

  async remove(guildId: number, ids: readonly string[]): Promise<number> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return 0;
    return inTransaction(this.db, async (trx) => {
      let removed = 0;
      for (const part of chunks(unique)) {
        const result = await trx
          .deleteFrom('ServerWayspot')
          .where('guildId', '=', guildId)
          .where('id', 'in', part)
          .where('kind', '!=', GONE)
          .executeTakeFirst();
        removed += Number(result.numDeletedRows);
        await trx
          .deleteFrom('ServerWayspot')
          .where('guildId', '=', guildId)
          .where('id', 'in', part)
          .execute();
      }
      return removed;
    });
  }
}
