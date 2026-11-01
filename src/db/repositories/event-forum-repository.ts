import type { Kysely } from 'kysely';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';

/** A server's events forum (`EventForum`). Snowflakes are strings. */
export interface EventForumRecord {
  serverId: string;
  forumId: string;
  /** The listing post "Events"; null until made, and after the forum changed. */
  listingPostId: string | null;
}

/** An event's post in a server's events forum (`EventPost`). Times are epoch milliseconds. */
export interface EventPostRecord {
  serverId: string;
  /** The feed's id of its event (a moved event's row takes the new id). */
  eventId: string;
  postId: string;
  /** The name and times it was last drawn with. */
  name: string;
  start: number;
  end: number;
  /** When its auto-archive was set to a day after the event's end; null before. */
  endedAt: number | null;
  /** When Pine archived it (the upkeep after the end, or a drop); null before. */
  archivedAt: number | null;
  /** Whether its event was dropped before its start (the post says so). */
  dropped: boolean;
  /** Whether a moderator deleted the post: it is never made again. */
  gone: boolean;
}

/** What may change of a post's row. */
export type EventPostChange = Partial<
  Pick<EventPostRecord, 'name' | 'start' | 'end' | 'endedAt' | 'archivedAt' | 'dropped' | 'gone'>
>;

/**
 * The events forums and their posts (plan 8V-1; tables `EventForum` and `EventPost` of migration
 * 033). Twin `MemoryEventForums` (`test/support/event-forum-store.ts`), both running
 * `eventForumCases`.
 */
export interface EventForumStorage {
  /** Every server's forum, by server id. */
  forums(): Promise<EventForumRecord[]>;
  forum(serverId: string): Promise<EventForumRecord | undefined>;
  /**
   * Records the server's forum (`/admin setup-forums`). Another forum than the one recorded
   * forgets the listing post, which was in the old one, and retires the server's live post rows
   * in the same transaction (review V2: posts of the old forum are none of the new one, which
   * gets its own); a row marked `gone` stays (a moderator's deletion is not undone). The same
   * forum changes nothing.
   */
  setForum(serverId: string, forumId: string): Promise<void>;
  /**
   * Records the listing post of the server's forum; false (and nothing written) when the forum
   * recorded is no longer `forumId`.
   */
  setListing(serverId: string, forumId: string, postId: string | null): Promise<boolean>;
  /** The server's event posts, by event id. */
  posts(serverId: string): Promise<EventPostRecord[]>;
  /** Records a post; false (nothing written) when the event has one already. */
  addPost(record: EventPostRecord): Promise<boolean>;
  updatePost(serverId: string, eventId: string, change: EventPostChange): Promise<void>;
  /**
   * Gives an event's post row to the id its event moved to (R12); false (nothing written) when
   * that id has a row already or `from` has none.
   */
  movePost(serverId: string, from: string, to: string): Promise<boolean>;
}

/** The `EventForum` and `EventPost` tables. */
export class EventForumRepository implements EventForumStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async forums(): Promise<EventForumRecord[]> {
    return this.db.selectFrom('EventForum').selectAll().orderBy('serverId').execute();
  }

  async forum(serverId: string): Promise<EventForumRecord | undefined> {
    return this.db
      .selectFrom('EventForum')
      .selectAll()
      .where('serverId', '=', serverId)
      .executeTakeFirst();
  }

  setForum(serverId: string, forumId: string): Promise<void> {
    return inTransaction(this.db, async (trx) => {
      const row = await trx
        .selectFrom('EventForum')
        .select('forumId')
        .where('serverId', '=', serverId)
        .forUpdate()
        .executeTakeFirst();
      if (!row) {
        await trx
          .insertInto('EventForum')
          .values({ serverId, forumId, listingPostId: null })
          .execute();
        return;
      }
      // The listing goes with another forum, and stays with the same one.
      if (row.forumId === forumId) return;
      await trx
        .updateTable('EventForum')
        .set({ forumId, listingPostId: null })
        .where('serverId', '=', serverId)
        .execute();
      await trx
        .deleteFrom('EventPost')
        .where('serverId', '=', serverId)
        .where('gone', '=', 0)
        .execute();
    });
  }

  async setListing(serverId: string, forumId: string, postId: string | null): Promise<boolean> {
    // Found first: an update that changes nothing counts no row (as `setSummaryMessage`).
    const row = await this.db
      .selectFrom('EventForum')
      .select('serverId')
      .where('serverId', '=', serverId)
      .where('forumId', '=', forumId)
      .executeTakeFirst();
    if (!row) return false;
    await this.db
      .updateTable('EventForum')
      .set({ listingPostId: postId })
      .where('serverId', '=', serverId)
      .where('forumId', '=', forumId)
      .execute();
    return true;
  }

  async posts(serverId: string): Promise<EventPostRecord[]> {
    const rows = await this.db
      .selectFrom('EventPost')
      .selectAll()
      .where('serverId', '=', serverId)
      .orderBy('eventId')
      .execute();
    return rows.map((row) => ({
      serverId: row.serverId,
      eventId: row.eventId,
      postId: row.postId,
      name: row.name,
      start: Number(row.startsAt),
      end: Number(row.endsAt),
      endedAt: row.endedAt === null ? null : Number(row.endedAt),
      archivedAt: row.archivedAt === null ? null : Number(row.archivedAt),
      dropped: row.dropped === 1,
      gone: row.gone === 1,
    }));
  }

  async addPost(record: EventPostRecord): Promise<boolean> {
    const result = await this.db
      .insertInto('EventPost')
      .ignore()
      .values({
        serverId: record.serverId,
        eventId: record.eventId,
        postId: record.postId,
        name: record.name,
        startsAt: String(record.start),
        endsAt: String(record.end),
        endedAt: record.endedAt === null ? null : String(record.endedAt),
        archivedAt: record.archivedAt === null ? null : String(record.archivedAt),
        dropped: record.dropped ? 1 : 0,
        gone: record.gone ? 1 : 0,
      })
      .executeTakeFirst();
    return Number(result.numInsertedOrUpdatedRows ?? 0) > 0;
  }

  async updatePost(serverId: string, eventId: string, change: EventPostChange): Promise<void> {
    const set = {
      ...(change.name === undefined ? {} : { name: change.name }),
      ...(change.start === undefined ? {} : { startsAt: String(change.start) }),
      ...(change.end === undefined ? {} : { endsAt: String(change.end) }),
      ...(change.endedAt === undefined
        ? {}
        : { endedAt: change.endedAt === null ? null : String(change.endedAt) }),
      ...(change.archivedAt === undefined
        ? {}
        : { archivedAt: change.archivedAt === null ? null : String(change.archivedAt) }),
      ...(change.dropped === undefined ? {} : { dropped: change.dropped ? 1 : 0 }),
      ...(change.gone === undefined ? {} : { gone: change.gone ? 1 : 0 }),
    };
    if (Object.keys(set).length === 0) return;
    await this.db
      .updateTable('EventPost')
      .set(set)
      .where('serverId', '=', serverId)
      .where('eventId', '=', eventId)
      .execute();
  }

  async movePost(serverId: string, from: string, to: string): Promise<boolean> {
    try {
      const result = await this.db
        .updateTable('EventPost')
        .set({ eventId: to })
        .where('serverId', '=', serverId)
        .where('eventId', '=', from)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    } catch (err) {
      // The new id has a row of its own (the unique key): left as it is.
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') return false;
      throw err;
    }
  }
}
