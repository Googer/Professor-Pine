import { sql, type Kysely } from 'kysely';
import type { DayUse, GoogleCount, GoogleUse } from '../../services/google-use.js';
import type { DB } from '../types.js';

/**
 * The questions that reached Google per Pacific day and kind (`GoogleUseDay`, migration 032;
 * `places`, `geocode`, `hand` and, since plan 8Z-2, `map`: the column takes any kind of eight
 * characters, so no migration),
 * with the gyms the line counted per day before (`GymLookupDay`, migration 014, no longer
 * written) read as places questions. Its twin is `MemoryGoogleUse`; both run `googleUseCases`.
 */
export class GoogleUseRepository implements GoogleUse {
  constructor(private readonly db: Kysely<DB>) {}

  async use(day: string, counted: GoogleCount): Promise<void> {
    await this.db
      .insertInto('GoogleUseDay')
      .values({ day, kind: counted, questions: 1 })
      .onDuplicateKeyUpdate({ questions: sql`questions + 1` })
      .execute();
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
