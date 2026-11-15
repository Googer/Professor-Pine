import { sql, type Kysely } from 'kysely';
import { added, type DayUse, type GoogleCount, type GoogleUse } from '../../services/google-use.js';
import { isMissingParentRow } from '../errors.js';
import { inTransaction, retryOnDeadlock } from '../transaction.js';
import type { DB } from '../types.js';

/**
 * The questions that reached Google per Pacific day and kind (`GoogleUseDay`, migration 032;
 * `places`, `geocode`, `hand` and, since plan 8Z-2, `map`: the column takes any kind of eight
 * characters, so no migration),
 * with the gyms the line counted per day before (`GymLookupDay`, migration 014, no longer
 * written) read as places questions; and each server's beside them (plan 19B-5:
 * `GoogleUseServerDay`, migration 060, written in the same transaction as the instance's count).
 * Its twin is `MemoryGoogleUse`; both run `googleUseCases`.
 */
export class GoogleUseRepository implements GoogleUse {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Both counts in one transaction at `read committed` (no gap locks: two first counts of a day
   * do not deadlock), run again when MySQL chose it as a deadlock's victim (fix round 3, T7). A
   * server whose `Guild` row is gone (it left meanwhile) fails the foreign key: the instance's
   * count is written alone, as for a question of no server.
   */
  async use(day: string, counted: GoogleCount, guildId?: number): Promise<void> {
    try {
      await this.count(day, counted, guildId);
    } catch (err) {
      if (guildId === undefined || !isMissingParentRow(err)) throw err;
      await this.count(day, counted, undefined);
    }
  }

  private count(day: string, counted: GoogleCount, guildId: number | undefined): Promise<void> {
    return retryOnDeadlock(this.db, () =>
      inTransaction(
        this.db,
        async (trx) => {
          await trx
            .insertInto('GoogleUseDay')
            .values({ day, kind: counted, questions: 1 })
            .onDuplicateKeyUpdate({ questions: sql`questions + 1` })
            .execute();
          if (guildId === undefined) return;
          await trx
            .insertInto('GoogleUseServerDay')
            .values({ guildId, day, kind: counted, questions: 1 })
            .onDuplicateKeyUpdate({ questions: sql`questions + 1` })
            .execute();
        },
        { isolation: 'read committed' },
      ),
    );
  }

  /**
   * A server's counts by the primary key `(guildId, day, kind)`; every server's by
   * `googleuseserverday_day_kind_index` (`day`, `kind`; its first part): the days of a month,
   * never the whole table.
   */
  async serversUsedOn(days: readonly string[], guildId?: number): Promise<Map<number, DayUse>> {
    const used = new Map<number, DayUse>();
    if (days.length === 0) return used;
    const rows = await this.db
      .selectFrom('GoogleUseServerDay')
      .select(['guildId', 'kind', 'questions'])
      .$if(guildId !== undefined, (query) => query.where('guildId', '=', guildId ?? 0))
      .where('day', 'in', days)
      .execute();
    for (const row of rows) {
      const kept = used.get(row.guildId) ?? { places: 0, geocodes: 0, byHand: 0, maps: 0 };
      used.set(
        row.guildId,
        added(kept, {
          places: row.kind === 'places' ? row.questions : 0,
          geocodes: row.kind === 'geocode' ? row.questions : 0,
          byHand: row.kind === 'hand' ? row.questions : 0,
          maps: row.kind === 'map' ? row.questions : 0,
        }),
      );
    }
    return used;
  }

  /**
   * One kind of every server's counts over the days (the floors' read, fix round 4, R4): a range
   * of `googleuseserverday_day_kind_index` (`day`, `kind`) per day, never another kind's rows.
   */
  async serversCountedOn(days: readonly string[], kind: GoogleCount): Promise<Map<number, number>> {
    const counted = new Map<number, number>();
    if (days.length === 0) return counted;
    const rows = await this.db
      .selectFrom('GoogleUseServerDay')
      .select(['guildId', 'questions'])
      .where('day', 'in', days)
      .where('kind', '=', kind)
      .execute();
    for (const row of rows) {
      if (row.questions > 0) {
        counted.set(row.guildId, (counted.get(row.guildId) ?? 0) + row.questions);
      }
    }
    return counted;
  }

  async usedOn(days: readonly string[]): Promise<Map<string, DayUse>> {
    const used = new Map<string, DayUse>();
    if (days.length === 0) return used;
    const add = (day: string, places: number, geocodes: number, byHand = 0, maps = 0): void => {
      const kept = used.get(day) ?? { places: 0, geocodes: 0, byHand: 0, maps: 0 };
      used.set(day, {
        places: kept.places + places,
        geocodes: kept.geocodes + geocodes,
        byHand: kept.byHand + byHand,
        maps: kept.maps + maps,
      });
    };
    const rows = await this.db
      .selectFrom('GoogleUseDay')
      .select(['day', 'kind', 'questions'])
      .where('day', 'in', days)
      .execute();
    for (const row of rows) {
      if (row.kind === 'geocode') add(row.day, 0, row.questions);
      else if (row.kind === 'hand') add(row.day, 0, 0, row.questions);
      else if (row.kind === 'map') add(row.day, 0, 0, 0, row.questions);
      else add(row.day, row.questions, 0);
    }
    const old = await this.db
      .selectFrom('GymLookupDay')
      .select(['day', 'gyms'])
      .where('day', 'in', days)
      .execute();
    for (const row of old) if (row.gyms > 0) add(row.day, row.gyms, 0);
    return used;
  }
}
