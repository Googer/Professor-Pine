import { sql, type Kysely } from 'kysely';
import type { Place } from '../../domain/geo/place.js';
import { placeDocument } from '../../domain/party/party-state.js';
import type { DB } from '../types.js';

/** A spawn report that stands in a channel and is to be deleted. */
export interface StoredSpawnReport {
  channelId: string;
  messageId: string;
  /** When it is due, epoch milliseconds. */
  deleteAt: number;
}

/**
 * What the live map shows of a spawn report (migration 044): what its region message says, as it
 * was made (a snapshot, never drawn anew).
 */
export interface ShownSpawn {
  /** Snowflake of the server. */
  guildId: string;
  /** The catalogue entry reported. */
  pokemon: { key: string; name: string };
  /** An event on listed it costumed (plan 8R-4). */
  costumed: boolean;
  /** The IVs the reporter checked; null where they did not. */
  iv: 'perfect' | 'zero' | null;
  /** Where it is, as typed; null for nothing. */
  details: string | null;
  /** The reporter's name as it was then; null where none was known. */
  reporterName: string | null;
  /** The address of the picture the message shows; null for none. */
  image: string | null;
  /** The place it is near (`/wild near:`) or the pin it was reported at; null for none. */
  near: Place | null;
  /** When it was reported, epoch milliseconds. */
  madeAt: number;
}

/** A report that stands, with what the map shows of it. */
export type StandingSpawn = StoredSpawnReport & ShownSpawn;

/**
 * A report as the sweep reads it: with its server's snowflake where it was recorded with what the
 * map shows of it (`ShownSpawn.guildId`), null for one recorded without (plan 19C-1: the sweep
 * passes over the reports of a server Pine left).
 */
export type SweptSpawnReport = StoredSpawnReport & { guildId: string | null };

/**
 * The spawn reports that still stand (see `SpawnService`), kept so that a restart does not
 * leave them standing, and what the map shows of each; lets tests keep them in memory.
 */
export interface SpawnReportStorage {
  /**
   * Records a report, with what the map shows of it (`shown`; none: the map does not list it);
   * one that is recorded already stays as it is.
   */
  add(report: StoredSpawnReport & { shown?: ShownSpawn }): Promise<void>;
  /** Forgets a report; nothing happens for one that is not recorded. */
  remove(messageId: string): Promise<void>;
  /** Every recorded report, the one due first at the head, with its server where known. */
  all(): Promise<SweptSpawnReport[]>;
  /**
   * The reports of a server that stand at `now` (due later) with what the map shows of them, the
   * one due first at the head; those recorded without it are left out.
   */
  standing(guildId: string, now: number): Promise<StandingSpawn[]>;
}

/** The IVs as a column keeps them; anything else is none. */
function ivOf(value: string | null): ShownSpawn['iv'] {
  return value === 'perfect' || value === 'zero' ? value : null;
}

/** The place of a row: none for none, or for one that does not read. */
function placeOf(value: unknown): Place | null {
  if (value === null || value === undefined) return null;
  const read = placeDocument.safeParse(typeof value === 'string' ? JSON.parse(value) : value);
  return read.success ? read.data : null;
}

/** The `SpawnReport` table. */
export class SpawnReportRepository implements SpawnReportStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async add(report: StoredSpawnReport & { shown?: ShownSpawn }): Promise<void> {
    const { shown } = report;
    if (shown === undefined) {
      await sql`
        insert into SpawnReport (messageId, channelId, deleteAt)
        values (${report.messageId}, ${report.channelId}, ${String(report.deleteAt)})
        on duplicate key update messageId = SpawnReport.messageId`.execute(this.db);
      return;
    }
    await sql`
      insert into SpawnReport (messageId, channelId, deleteAt, guildId, pokemonKey, pokemonName,
        costumed, iv, details, reporterName, image, near, madeAt)
      values (${report.messageId}, ${report.channelId}, ${String(report.deleteAt)},
        ${shown.guildId}, ${shown.pokemon.key}, ${shown.pokemon.name}, ${shown.costumed ? 1 : 0},
        ${shown.iv}, ${shown.details}, ${shown.reporterName}, ${shown.image},
        ${shown.near === null ? null : JSON.stringify(shown.near)}, ${String(shown.madeAt)})
      on duplicate key update messageId = SpawnReport.messageId`.execute(this.db);
  }

  async remove(messageId: string): Promise<void> {
    await this.db.deleteFrom('SpawnReport').where('messageId', '=', messageId).execute();
  }

  async all(): Promise<SweptSpawnReport[]> {
    const rows = await this.db
      .selectFrom('SpawnReport')
      .select(['channelId', 'messageId', 'deleteAt', 'guildId'])
      .orderBy('deleteAt')
      .orderBy('messageId')
      .execute();
    return rows.map((row) => ({ ...row, deleteAt: Number(row.deleteAt) }));
  }

  async standing(guildId: string, now: number): Promise<StandingSpawn[]> {
    const rows = await this.db
      .selectFrom('SpawnReport')
      .selectAll()
      .where('guildId', '=', guildId)
      .where('deleteAt', '>', String(now))
      .where('pokemonKey', 'is not', null)
      .where('pokemonName', 'is not', null)
      .where('madeAt', 'is not', null)
      .orderBy('deleteAt')
      .orderBy('messageId')
      .execute();
    return rows.flatMap((row): StandingSpawn[] =>
      row.guildId === null ||
      row.pokemonKey === null ||
      row.pokemonName === null ||
      row.madeAt === null
        ? []
        : [
            {
              channelId: row.channelId,
              messageId: row.messageId,
              deleteAt: Number(row.deleteAt),
              guildId: row.guildId,
              pokemon: { key: row.pokemonKey, name: row.pokemonName },
              costumed: row.costumed !== 0,
              iv: ivOf(row.iv),
              details: row.details,
              reporterName: row.reporterName,
              image: row.image,
              near: placeOf(row.near),
              madeAt: Number(row.madeAt),
            },
          ],
    );
  }
}
