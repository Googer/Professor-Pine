import type { Kysely } from 'kysely';
import type { EventWindow } from '../../domain/time/event-window.js';
import type { DB } from '../types.js';

/**
 * The event window staff set (`/admin event-window`; table `EventWindow` of migration 049): one
 * per installation, kept so that it survives a restart. Twin `MemoryEventWindows`
 * (`test/support/event-window-store.ts`), both running `eventWindowCases`.
 */
export interface EventWindowStorage {
  /** The window kept, ended or not; undefined when none was ever set. */
  current(): Promise<EventWindow | undefined>;
  /** Keeps `window` in the place of the one kept before (an end is a window kept with it). */
  keep(window: EventWindow): Promise<void>;
}

/** The one row's id. */
const ROW = 1;

/** The `EventWindow` table. */
export class EventWindowRepository implements EventWindowStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async current(): Promise<EventWindow | undefined> {
    const row = await this.db
      .selectFrom('EventWindow')
      .selectAll()
      .where('id', '=', ROW)
      .executeTakeFirst();
    if (!row) return undefined;
    return {
      start: Number(row.startsAt),
      end: Number(row.endsAt),
      setBy: row.setBy,
      setAt: Number(row.setAt),
    };
  }

  async keep(window: EventWindow): Promise<void> {
    const values = {
      startsAt: String(window.start),
      endsAt: String(window.end),
      setBy: window.setBy,
      setAt: String(window.setAt),
    };
    await this.db
      .insertInto('EventWindow')
      .values({ id: ROW, ...values })
      .onDuplicateKeyUpdate(values)
      .execute();
  }
}
