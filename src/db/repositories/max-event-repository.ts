import type { Kysely } from 'kysely';
import { z } from 'zod';
import { trustedLocals } from '../../domain/time/feed-times.js';
import type { BigEvent, FeaturedNames, MaxEvent } from '../../domain/time/max-events.js';
import type { Logger } from '../../log.js';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';

/** The max events and the big events Pine keeps, each kind in order of its start. */
export interface KeptMaxEvents {
  max: MaxEvent[];
  big: BigEvent[];
}

/**
 * The max events and the big events of the events feed as Pine last merged them (plan 8X-F;
 * table `MaxEvent` of migration 029): a restart in the week after ScrapedDuck dropped a Max
 * Monday keeps the week's featured boss, and a big event dropped while it is on keeps a max
 * battle's default end. Twin `MemoryMaxEvents` (`test/support/max-event-store.ts`), both running
 * `maxEventCases`.
 */
export interface MaxEventStorage {
  /** Every event kept, each kind in order of its start (then its name). */
  all(): Promise<KeptMaxEvents>;
  /**
   * Keeps these events in the place of all kept before, in one transaction: the lists the last
   * read merged (`RaidEventService`), which drop what is to be forgotten.
   */
  replace(events: KeptMaxEvents): Promise<void>;
}

/** The `kind` of a big event's row; a max event's is its `MaxEventKind`. */
const BIG = 'big';

/** What a row's `featured` holds: `FeaturedNames`. */
const featuredDocument = z.object({
  gigantamax: z.boolean(),
  names: z.array(z.string()),
});

/** Each kind in order of its start, then its name (as `RaidEventService` orders them). */
function inOrder<T extends { start: number; name: string }>(events: T[]): T[] {
  return events.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
}

/** The `MaxEvent` table. */
export class MaxEventRepository implements MaxEventStorage {
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

  async all(): Promise<KeptMaxEvents> {
    const rows = await this.db.selectFrom('MaxEvent').selectAll().orderBy('id').execute();
    const max: MaxEvent[] = [];
    const big: BigEvent[] = [];
    for (const row of rows) {
      const kept = {
        start: Number(row.startsAt),
        end: Number(row.endsAt),
        ...(row.startsLocal === null ? {} : { startLocal: row.startsLocal }),
        ...(row.endsLocal === null ? {} : { endLocal: row.endsLocal }),
      };
      const { start, end, ...locals } =
        this.zone === undefined ? kept : trustedLocals(kept, this.zone);
      if (row.kind === BIG && row.eventId !== null) {
        big.push({ id: row.eventId, name: row.name, start, end, ...locals });
        continue;
      }
      const featured = this.featuredOf(row.featured);
      if ((row.kind !== 'max-monday' && row.kind !== 'max-battle') || featured === null) {
        this.log?.warn(
          { event: row.eventId ?? row.name },
          'a kept max event cannot be read; left out',
        );
        continue;
      }
      max.push({
        kind: row.kind,
        name: row.name,
        start,
        end,
        ...locals,
        short: row.short === 1,
        hoursAssumed: row.hoursAssumed === 1,
        featured,
        id: row.eventId ?? undefined,
      });
    }
    return { max: inOrder(max), big: inOrder(big) };
  }

  /** A row's `featured`: undefined for none, null for what cannot be read. */
  private featuredOf(value: unknown): FeaturedNames | undefined | null {
    if (value === null) return undefined;
    try {
      const read = featuredDocument.safeParse(
        typeof value === 'string' ? JSON.parse(value) : value,
      );
      return read.success ? read.data : null;
    } catch {
      return null;
    }
  }

  replace(events: KeptMaxEvents): Promise<void> {
    return inTransaction(this.db, async (trx) => {
      await trx.deleteFrom('MaxEvent').execute();
      const rows = [
        ...events.max.map((event) => ({
          kind: event.kind,
          eventId: event.id ?? null,
          name: event.name,
          startsAt: String(event.start),
          endsAt: String(event.end),
          startsLocal: event.startLocal ?? null,
          endsLocal: event.endLocal ?? null,
          short: event.short ? 1 : 0,
          hoursAssumed: event.hoursAssumed ? 1 : 0,
          featured: event.featured === undefined ? null : JSON.stringify(event.featured),
        })),
        ...events.big.map((event) => ({
          kind: BIG,
          eventId: event.id,
          name: event.name,
          startsAt: String(event.start),
          endsAt: String(event.end),
          startsLocal: event.startLocal ?? null,
          endsLocal: event.endLocal ?? null,
          short: 0,
          hoursAssumed: 0,
          featured: null,
        })),
      ];
      if (rows.length > 0) await trx.insertInto('MaxEvent').values(rows).execute();
    });
  }
}
