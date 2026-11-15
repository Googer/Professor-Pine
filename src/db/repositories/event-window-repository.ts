import type { Kysely } from 'kysely';
import type { EventWindow } from '../../domain/time/event-window.js';
import { trustedLocals } from '../../domain/time/feed-times.js';
import type { DB } from '../types.js';

/**
 * The event window staff set (`/operator event-window`; table `EventWindow` of migration 049): one
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
  /**
   * `zone`: the instance's default, in which the moments are written; a wall-clock time that no
   * longer agrees with its moment there is left out on read (`trustedLocals`; fix round 1, M6).
   */
  constructor(
    private readonly db: Kysely<DB>,
    private readonly zone?: string,
  ) {}

  async current(): Promise<EventWindow | undefined> {
    const row = await this.db
      .selectFrom('EventWindow')
      .selectAll()
      .where('id', '=', ROW)
      .executeTakeFirst();
    if (!row) return undefined;
    const window: EventWindow = {
      start: Number(row.startsAt),
      end: Number(row.endsAt),
      // Plan 19A-2: the wall-clock times typed, the truth where kept (migration 054).
      ...(row.startsLocal === null ? {} : { startLocal: row.startsLocal }),
      ...(row.endsLocal === null ? {} : { endLocal: row.endsLocal }),
      setBy: row.setBy,
      setAt: Number(row.setAt),
    };
    return this.zone === undefined ? window : trustedLocals(window, this.zone);
  }

  async keep(window: EventWindow): Promise<void> {
    const values = {
      startsAt: String(window.start),
      endsAt: String(window.end),
      startsLocal: window.startLocal ?? null,
      endsLocal: window.endLocal ?? null,
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
