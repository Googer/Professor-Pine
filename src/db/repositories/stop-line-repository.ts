import type { Kysely } from 'kysely';
import type { DB } from '../types.js';
import { isDuplicateEntry } from '../errors.js';

/** Which line it is (plan 8R-9, B9): of a server's region channel, a local day and a key. */
export interface StopLineKey {
  serverId: string;
  regionChannelId: string;
  /** The local day, `yyyy-mm-dd` in the server's zone. */
  day: string;
  /** `research:<task key>`, `rocket:<leader:… | giovanni>`. */
  key: string;
}

/** A line of a region channel as kept: which, its message once sent, when it was claimed. */
export interface StopLineRecord extends StopLineKey {
  messageId: string | null;
  createdAt: number;
}

/**
 * Where the lines of the region channels are kept (table `StopLine` of migration 031, plan 8R-9):
 * a line is claimed by its row before it is sent, so two reports at once, or a restart, never send
 * it twice; its message is kept so the day's lines are deleted at midnight, after a restart too.
 * Twin `MemoryStopLines` (`test/support/stop-lines.ts`); both run `stopLineCases`.
 */
export interface StopLineStorage {
  /** Claims a line: true when it was not claimed before (this caller sends it), false else. */
  claim(line: StopLineKey & { createdAt: number }): Promise<boolean>;
  /**
   * Keeps the message a line was sent as; where its claim was forgotten meanwhile (a sweep at
   * midnight while it was on its way, review W1) the row is made anew, so that a line sent is
   * always deleted by a sweep.
   */
  sent(line: StopLineKey & { createdAt: number }, messageId: string): Promise<void>;
  /** Forgets a line (sent nowhere, or deleted); nothing happens for one not kept. */
  forget(line: StopLineKey): Promise<void>;
  /** The lines of the days before `day`, oldest first. */
  before(day: string): Promise<StopLineRecord[]>;
}

/** The `StopLine` table. */
export class StopLineRepository implements StopLineStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async claim(line: StopLineKey & { createdAt: number }): Promise<boolean> {
    try {
      await this.db
        .insertInto('StopLine')
        .values({
          serverId: line.serverId,
          regionChannelId: line.regionChannelId,
          day: line.day,
          lineKey: line.key,
          messageId: null,
          createdAt: String(line.createdAt),
        })
        .execute();
      return true;
    } catch (err) {
      if (isDuplicateEntry(err)) return false;
      throw err;
    }
  }

  async sent(line: StopLineKey & { createdAt: number }, messageId: string): Promise<void> {
    await this.db
      .insertInto('StopLine')
      .values({
        serverId: line.serverId,
        regionChannelId: line.regionChannelId,
        day: line.day,
        lineKey: line.key,
        messageId,
        createdAt: String(line.createdAt),
      })
      .onDuplicateKeyUpdate({ messageId })
      .execute();
  }

  async forget(line: StopLineKey): Promise<void> {
    await this.where(this.db.deleteFrom('StopLine'), line).execute();
  }

  async before(day: string): Promise<StopLineRecord[]> {
    const rows = await this.db
      .selectFrom('StopLine')
      .selectAll()
      .where('day', '<', day)
      .orderBy('day')
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    return rows.map((row) => ({
      serverId: row.serverId,
      regionChannelId: row.regionChannelId,
      day: row.day,
      key: row.lineKey,
      messageId: row.messageId,
      createdAt: Number(row.createdAt),
    }));
  }

  /** The row of a line, by its unique key. */
  private where<
    Q extends {
      where(column: 'serverId' | 'regionChannelId' | 'day' | 'lineKey', op: '=', value: string): Q;
    },
  >(query: Q, line: StopLineKey): Q {
    return query
      .where('serverId', '=', line.serverId)
      .where('regionChannelId', '=', line.regionChannelId)
      .where('day', '=', line.day)
      .where('lineKey', '=', line.key);
  }
}
