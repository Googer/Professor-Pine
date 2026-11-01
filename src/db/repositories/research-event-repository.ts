import { sql, type Kysely } from 'kysely';
import type { ResearchEvent } from '../../domain/time/research-events.js';
import type { DB } from '../types.js';

/**
 * The events with field research of their own, as last seen in the events feed (plan 8R-1;
 * design 9.2; table `ResearchEvent` of migration 027): a restart, or an event dropped from the
 * feed once it ended, cannot lose a period. Twin `MemoryResearchEvents`
 * (`test/support/research-events.ts`), both running `researchEventCases`.
 */
export interface ResearchEventStorage {
  /** Every event kept, in order of their start. */
  all(): Promise<ResearchEvent[]>;
  /**
   * Keeps what a read of the feed saw, each event as the feed has it now (it may move one), in
   * one statement; `at` is when it was read. An event kept before and not seen now stays.
   */
  saveSeen(events: readonly ResearchEvent[], at: number): Promise<void>;
  /** Forgets the events that ended before `before`; gives how many. */
  removeEnded(before: number): Promise<number>;
  /**
   * Forgets the events not begun at `now` that a read no longer lists (`seen`: the ids it
   * lists): moved or cancelled, as the raid events' (review A4). Gives how many.
   */
  removeNotSeen(seen: readonly string[], now: number): Promise<number>;
}

/** The `ResearchEvent` table. */
export class ResearchEventRepository implements ResearchEventStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async all(): Promise<ResearchEvent[]> {
    const rows = await this.db
      .selectFrom('ResearchEvent')
      .selectAll()
      .orderBy('startsAt')
      .orderBy('eventId')
      .execute();
    return rows.map((row) => ({
      id: row.eventId,
      name: row.name,
      eventType: row.eventType,
      start: Number(row.startsAt),
      end: Number(row.endsAt),
    }));
  }

  async saveSeen(events: readonly ResearchEvent[], at: number): Promise<void> {
    if (events.length === 0) return;
    const values = sql.join(
      events.map(
        (event) =>
          sql`(${event.id}, ${event.name}, ${event.eventType}, ${String(event.start)},
            ${String(event.end)}, ${String(at)}, ${String(at)})`,
      ),
    );
    // MySQL's row alias (`AS new`), never `VALUES()`, deprecated since 8.0.20.
    await sql`
      insert into ResearchEvent (eventId, name, eventType, startsAt, endsAt, firstSeen, lastSeen)
      values ${values} as new
      on duplicate key update name = new.name, eventType = new.eventType,
        startsAt = new.startsAt, endsAt = new.endsAt, lastSeen = new.lastSeen`.execute(this.db);
  }

  async removeEnded(before: number): Promise<number> {
    const gone = await this.db
      .deleteFrom('ResearchEvent')
      .where('endsAt', '<', String(before))
      .executeTakeFirst();
    return Number(gone.numDeletedRows);
  }

  async removeNotSeen(seen: readonly string[], now: number): Promise<number> {
    let query = this.db.deleteFrom('ResearchEvent').where('startsAt', '>', String(now));
    if (seen.length > 0) query = query.where('eventId', 'not in', [...seen]);
    const gone = await query.executeTakeFirst();
    return Number(gone.numDeletedRows);
  }
}
