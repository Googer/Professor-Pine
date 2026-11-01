import { sql, type Kysely } from 'kysely';
import type { DB } from '../types.js';

/** A spawn report that stands in a channel and is to be deleted. */
export interface StoredSpawnReport {
  channelId: string;
  messageId: string;
  /** When it is due, epoch milliseconds. */
  deleteAt: number;
}

/**
 * The spawn reports that still stand (see `SpawnService`), kept so that a restart does not
 * leave them standing; lets tests keep them in memory.
 */
export interface SpawnReportStorage {
  /** Records a report; one that is recorded already stays as it is. */
  add(report: StoredSpawnReport): Promise<void>;
  /** Forgets a report; nothing happens for one that is not recorded. */
  remove(messageId: string): Promise<void>;
  /** Every recorded report, the one due first at the head. */
  all(): Promise<StoredSpawnReport[]>;
}

/** The `SpawnReport` table. */
export class SpawnReportRepository implements SpawnReportStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async add(report: StoredSpawnReport): Promise<void> {
    await sql`
      insert into SpawnReport (messageId, channelId, deleteAt)
      values (${report.messageId}, ${report.channelId}, ${String(report.deleteAt)})
      on duplicate key update messageId = SpawnReport.messageId`.execute(this.db);
  }

  async remove(messageId: string): Promise<void> {
    await this.db.deleteFrom('SpawnReport').where('messageId', '=', messageId).execute();
  }

  async all(): Promise<StoredSpawnReport[]> {
    const rows = await this.db
      .selectFrom('SpawnReport')
      .select(['channelId', 'messageId', 'deleteAt'])
      .orderBy('deleteAt')
      .orderBy('messageId')
      .execute();
    return rows.map((row) => ({ ...row, deleteAt: Number(row.deleteAt) }));
  }
}
