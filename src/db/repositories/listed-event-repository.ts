import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { ListedEvent } from '../../domain/time/event-listing.js';
import { trustedLocals } from '../../domain/time/feed-times.js';
import type { Logger } from '../../log.js';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';

/**
 * The events forum's listed events as Pine last merged them (plan 8V-1; table `ListedEvent` of
 * migration 033), as the max events are kept (`MaxEventStorage`): the listing survives a restart
 * and a feed that fails. Twin `MemoryListedEvents` (`test/support/event-forum-store.ts`), both
 * running `listedEventCases` (`test/support/event-forum-store-cases.ts`).
 */
export interface ListedEventStorage {
  /** Every event kept, in order of its start, then its name. */
  all(): Promise<ListedEvent[]>;
  /** Keeps these events in the place of all kept before, in one transaction. */
  replace(events: readonly ListedEvent[]): Promise<void>;
}

const formerIdsDocument = z.array(z.string());

/** In order of the start, then the name (as `mergeListed` orders them). */
function inOrder(events: ListedEvent[]): ListedEvent[] {
  return events.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
}

/** The `ListedEvent` table. */
export class ListedEventRepository implements ListedEventStorage {
  /**
   * `log` hears of a row that cannot be read (left out). `zone`: the instance's default, in which
   * the moments are written; a wall-clock time that no longer agrees with its moment there is
   * left out on read (`trustedLocals`; fix round 1, L8).
   */
  constructor(
    private readonly db: Kysely<DB>,
    private readonly log?: Logger,
    private readonly zone?: string,
  ) {}

  async all(): Promise<ListedEvent[]> {
    const rows = await this.db.selectFrom('ListedEvent').selectAll().orderBy('id').execute();
    const events: ListedEvent[] = [];
    for (const row of rows) {
      const formerIds = this.formerIdsOf(row.formerIds);
      if (formerIds === undefined) {
        this.log?.warn({ event: row.eventId }, 'a kept listed event cannot be read; left out');
        continue;
      }
      const event: ListedEvent = {
        id: row.eventId,
        name: row.name,
        eventType: row.eventType,
        link: row.link,
        image: row.image,
        start: Number(row.startsAt),
        end: Number(row.endsAt),
        ...(row.startsLocal === null ? {} : { startLocal: row.startsLocal }),
        ...(row.endsLocal === null ? {} : { endLocal: row.endsLocal }),
        formerIds,
      };
      events.push(this.zone === undefined ? event : trustedLocals(event, this.zone));
    }
    return inOrder(events);
  }

  /** A row's `formerIds`: none for null, undefined for what cannot be read. */
  private formerIdsOf(value: unknown): string[] | undefined {
    if (value === null) return [];
    try {
      return formerIdsDocument.safeParse(typeof value === 'string' ? JSON.parse(value) : value)
        .data;
    } catch {
      return undefined;
    }
  }

  replace(events: readonly ListedEvent[]): Promise<void> {
    return inTransaction(this.db, async (trx) => {
      await trx.deleteFrom('ListedEvent').execute();
      if (events.length === 0) return;
      await trx
        .insertInto('ListedEvent')
        .values(
          events.map((event) => ({
            eventId: event.id,
            eventType: event.eventType,
            name: event.name,
            link: event.link,
            image: event.image,
            startsAt: String(event.start),
            endsAt: String(event.end),
            startsLocal: event.startLocal ?? null,
            endsLocal: event.endLocal ?? null,
            formerIds: event.formerIds.length === 0 ? null : JSON.stringify(event.formerIds),
          })),
        )
        .execute();
    });
  }
}
