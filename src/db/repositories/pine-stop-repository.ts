import type { Kysely, Selectable } from 'kysely';
import type { NewPineStop, PineStop, PineStopChange } from '../../domain/stops/pine-stop.js';
import { inTransaction } from '../transaction.js';
import type { DB, PineStop as PineStopRow } from '../types.js';

/**
 * The stops of Pine's own (plan 8R-1; table `PineStop` of migration 027): what `/pokestop`
 * writes and `PineStopDirectory` holds in memory. Its twin in memory is `MemoryPineStops`
 * (`test/support/pine-stops.ts`); both run `pineStopCases`.
 */
export interface PineStopStorage {
  /** Every stop of every server, by id. */
  all(): Promise<PineStop[]>;
  add(stop: NewPineStop): Promise<PineStop>;
  /** Changes a stop of a server; undefined when it has none of that id. */
  update(
    id: number,
    serverId: string,
    change: PineStopChange,
    by: string,
    at: number,
  ): Promise<PineStop | undefined>;
  /** Removes a stop of a server; gives it, or undefined when it has none of that id. */
  remove(id: number, serverId: string): Promise<PineStop | undefined>;
}

function toStop(row: Selectable<PineStopRow>): PineStop {
  return {
    id: row.id,
    serverId: row.serverId,
    name: row.name,
    lat: row.lat,
    lon: row.lon,
    address: row.address,
    createdBy: row.createdBy,
    createdAt: Number(row.createdAt),
    updatedBy: row.updatedBy,
    updatedAt: Number(row.updatedAt),
  };
}

/** The `PineStop` table. */
export class PineStopRepository implements PineStopStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async all(): Promise<PineStop[]> {
    const rows = await this.db.selectFrom('PineStop').selectAll().orderBy('id').execute();
    return rows.map(toStop);
  }

  async add(stop: NewPineStop): Promise<PineStop> {
    const made = await this.db
      .insertInto('PineStop')
      .values({
        serverId: stop.serverId,
        name: stop.name,
        lat: stop.lat,
        lon: stop.lon,
        address: stop.address,
        createdBy: stop.createdBy,
        createdAt: String(stop.createdAt),
        updatedBy: stop.createdBy,
        updatedAt: String(stop.createdAt),
      })
      .executeTakeFirstOrThrow();
    return {
      ...stop,
      id: Number(made.insertId),
      updatedBy: stop.createdBy,
      updatedAt: stop.createdAt,
    };
  }

  update(
    id: number,
    serverId: string,
    change: PineStopChange,
    by: string,
    at: number,
  ): Promise<PineStop | undefined> {
    return inTransaction(this.db, async (trx) => {
      const found = await trx
        .selectFrom('PineStop')
        .select('id')
        .where('id', '=', id)
        .where('serverId', '=', serverId)
        .forUpdate()
        .executeTakeFirst();
      if (!found) return undefined;
      await trx
        .updateTable('PineStop')
        .set({ ...change, updatedBy: by, updatedAt: String(at) })
        .where('id', '=', id)
        .execute();
      const row = await trx
        .selectFrom('PineStop')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      return toStop(row);
    });
  }

  remove(id: number, serverId: string): Promise<PineStop | undefined> {
    return inTransaction(this.db, async (trx) => {
      const row = await trx
        .selectFrom('PineStop')
        .selectAll()
        .where('id', '=', id)
        .where('serverId', '=', serverId)
        .forUpdate()
        .executeTakeFirst();
      if (!row) return undefined;
      await trx.deleteFrom('PineStop').where('id', '=', id).execute();
      return toStop(row);
    });
  }
}
