import { sql, type Kysely } from 'kysely';
import type { DB } from '../types.js';

/** A grunt report's message in a region channel, until it is deleted (plan 8R-2). */
export interface GruntMessageRow {
  messageId: string;
  channelId: string;
  /** Snowflake of the server. */
  serverId: string;
  /** The `StopReport` row of the grunt it shows. */
  reportId: number;
  /** When it is due, epoch milliseconds. */
  deleteAt: number;
}

/**
 * The grunts' messages that still stand (plan 8R-2; table `GruntMessage` of migration 028), kept
 * so that a restart does not leave them standing, as `SpawnReportStorage` keeps spawns'; twin
 * `MemoryGruntMessages` (`test/support/rocket-store.ts`), both running `gruntMessageCases`.
 */
export interface GruntMessageStorage {
  /** Records a message; one recorded already stays as it is. */
  add(row: GruntMessageRow): Promise<void>;
  /** Forgets a message; nothing happens for one that is not recorded. */
  remove(messageId: string): Promise<void>;
  /**
   * Moves when a message is due (plan 8R-4L: a grunt refined in place ends anew); nothing happens
   * for one that is not recorded.
   */
  retime(messageId: string, deleteAt: number): Promise<void>;
  /** Every recorded message, the one due first at the head. */
  all(): Promise<GruntMessageRow[]>;
  /** The messages of a report (one per region channel it was posted in), in their order. */
  ofReport(reportId: number): Promise<GruntMessageRow[]>;
  /**
   * The messages of several reports in one read (plan 8R-3: the map's grunts, polled), by report
   * and then in their order; none for no report.
   */
  ofReports(reportIds: readonly number[]): Promise<GruntMessageRow[]>;
}

/** The `GruntMessage` table. */
export class GruntMessageRepository implements GruntMessageStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async add(row: GruntMessageRow): Promise<void> {
    await sql`
      insert into GruntMessage (messageId, channelId, serverId, reportId, deleteAt)
      values (${row.messageId}, ${row.channelId}, ${row.serverId}, ${row.reportId},
        ${String(row.deleteAt)})
      on duplicate key update messageId = GruntMessage.messageId`.execute(this.db);
  }

  async remove(messageId: string): Promise<void> {
    await this.db.deleteFrom('GruntMessage').where('messageId', '=', messageId).execute();
  }

  async retime(messageId: string, deleteAt: number): Promise<void> {
    await this.db
      .updateTable('GruntMessage')
      .set({ deleteAt: String(deleteAt) })
      .where('messageId', '=', messageId)
      .execute();
  }

  async all(): Promise<GruntMessageRow[]> {
    const rows = await this.db
      .selectFrom('GruntMessage')
      .selectAll()
      .orderBy('deleteAt')
      .orderBy('messageId')
      .execute();
    return rows.map((row) => ({ ...row, deleteAt: Number(row.deleteAt) }));
  }

  async ofReport(reportId: number): Promise<GruntMessageRow[]> {
    const rows = await this.db
      .selectFrom('GruntMessage')
      .selectAll()
      .where('reportId', '=', reportId)
      .orderBy('messageId')
      .execute();
    return rows.map((row) => ({ ...row, deleteAt: Number(row.deleteAt) }));
  }

  async ofReports(reportIds: readonly number[]): Promise<GruntMessageRow[]> {
    if (reportIds.length === 0) return [];
    const rows = await this.db
      .selectFrom('GruntMessage')
      .selectAll()
      .where('reportId', 'in', [...reportIds])
      .orderBy('reportId')
      .orderBy('messageId')
      .execute();
    return rows.map((row) => ({ ...row, deleteAt: Number(row.deleteAt) }));
  }
}
