import { sql, type Kysely } from 'kysely';
import { z } from 'zod';
import type { DB } from '../types.js';

/**
 * The post "Today’s Stops" of a region channel and a local day (plan 8R-1; design 6, 9.5): its
 * messages in order (the first, and those it spilled into), the server, and the board post they
 * are in (plan 8R-9).
 */
export interface StopPostRecord {
  channelId: string;
  /** The local day, `yyyy-mm-dd` in `settings.timezone`. */
  day: string;
  serverId: string;
  /**
   * The region's board post (its summary's thread) the messages are in (plan 8R-9); null for a
   * post the bot before it pinned in the region's channel, which is removed and drawn anew.
   */
  threadId: string | null;
  messageIds: string[];
  /**
   * Messages in the region's channel still to unpin and delete (review P1): a post the bot before
   * plan 8R-9 pinned there, whose delete failed; none for most posts.
   */
  leftover: string[];
  updatedAt: number;
}

/**
 * Where the posts are kept (table `StopPost` of migration 027), so that a restart draws
 * the day's anew and deletes those of days that have ended; twin `MemoryStopPosts`
 * (`test/support/stop-posts.ts`), both running `stopPostCases`.
 */
export interface StopPostStorage {
  /** Every post kept, by channel and day. */
  all(): Promise<StopPostRecord[]>;
  /** Keeps a post, in the place of the one of its channel and day. */
  save(post: StopPostRecord): Promise<void>;
  /** Forgets the post of a channel and a day; nothing happens for one not kept. */
  remove(channelId: string, day: string): Promise<void>;
}

const ids = z.array(z.string());

/**
 * A JSON list of message ids as MySQL gives it (text or parsed); none for null, text that is no
 * JSON (review R4) or anything else.
 */
export function idsOf(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  let read: unknown = value;
  if (typeof value === 'string') {
    try {
      read = JSON.parse(value);
    } catch {
      return [];
    }
  }
  const parsed = ids.safeParse(read);
  return parsed.success ? parsed.data : [];
}

/** The `StopPost` table. */
export class StopPostRepository implements StopPostStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async all(): Promise<StopPostRecord[]> {
    const rows = await this.db
      .selectFrom('StopPost')
      .selectAll()
      .orderBy('day')
      .orderBy('channelId')
      .execute();
    return rows.map((row) => {
      const parsed = ids.safeParse(
        typeof row.messageIds === 'string' ? JSON.parse(row.messageIds) : row.messageIds,
      );
      return {
        channelId: row.channelId,
        day: row.day,
        serverId: row.serverId,
        threadId: row.threadId,
        messageIds: parsed.success ? parsed.data : [],
        leftover: idsOf(row.leftoverIds),
        updatedAt: Number(row.updatedAt),
      };
    });
  }

  async save(post: StopPostRecord): Promise<void> {
    // MySQL's row alias (`AS new`), never `VALUES()`, deprecated since 8.0.20.
    await sql`
      insert into StopPost (channelId, day, serverId, threadId, messageIds, leftoverIds, updatedAt)
      values (${post.channelId}, ${post.day}, ${post.serverId}, ${post.threadId},
        ${JSON.stringify(post.messageIds)},
        ${post.leftover.length === 0 ? null : JSON.stringify(post.leftover)},
        ${String(post.updatedAt)}) as new
      on duplicate key update serverId = new.serverId, threadId = new.threadId,
        messageIds = new.messageIds, leftoverIds = new.leftoverIds,
        updatedAt = new.updatedAt`.execute(this.db);
  }

  async remove(channelId: string, day: string): Promise<void> {
    await this.db
      .deleteFrom('StopPost')
      .where('channelId', '=', channelId)
      .where('day', '=', day)
      .execute();
  }
}
