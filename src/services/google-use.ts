import { googleMonth, type GoogleUsed } from '../domain/geo/google-line.js';

/**
 * What was asked of Google, per day and kind of question (plan 8W-6): the monthly budget is the
 * sum of the month's days (`googleMonth`, Pacific time), and the days serve the pacing of the
 * line. A question counts when it reached Google (a refused key or none asks nothing; a failure
 * counts). `GoogleUseRepository` keeps it in the database (`GoogleUseDay`, and the old
 * `GymLookupDay` read as places questions); `MemoryGoogleUse` is its twin (both run
 * `googleUseCases`).
 */

/** A Places search (Nearby Search Pro) or a Geocoding (reverse geocoding). */
export type GoogleQuestion = 'places' | 'geocode';

/**
 * What is counted: a question, or `hand`, a lookup by hand that reached Google (plan 8Z,
 * `/gym refresh`, a gym added or moved), on top of the questions it asked: the monthly cap of
 * those (`settings.googleByHandPerMonth`) is counted apart, and the budget still sees them all.
 */
export type GoogleCount = GoogleQuestion | 'hand' | 'map';

/** What one day used. */
export interface DayUse {
  places: number;
  geocodes: number;
  /** Lookups by hand, whose questions are counted in the two above as well. */
  byHand: number;
  /**
   * Maps of places downloaded for `/find-region` (plan 8Z-2; `MapBudget`): Google bills each, as
   * a question of another kind, so they have a count and a monthly cap of their own.
   */
  maps: number;
}

export interface GoogleUse {
  /**
   * Counts one question, or one lookup by hand, on a day (`YYYY-MM-DD`, Pacific time); with
   * `guildId` (a server's `Guild` row, plan 19B-5) as that server's too, in the same write: the
   * line's question of a server's row, a server's lookup by hand or map. A lookup by hand's own
   * questions are the instance's alone (its `hand` is the server's).
   */
  use(day: string, counted: GoogleCount, guildId?: number): Promise<void>;
  /**
   * What these days used; a day without questions is left out. The gyms the line before plan
   * 8W-6 counted on a day (`GymLookupDay`) count as places questions of that day.
   */
  usedOn(days: readonly string[]): Promise<Map<string, DayUse>>;
  /**
   * What each server used over these days, summed (plan 19B-5), by its `Guild` row; with
   * `guildId`, that server's alone. A server without questions on them is left out.
   */
  serversUsedOn(days: readonly string[], guildId?: number): Promise<Map<number, DayUse>>;
  /**
   * How many of one kind each server counted over these days (fix round 4, R4: the floors of
   * lookups by hand and of maps read their kind alone), by its `Guild` row; a server without any
   * is left out.
   */
  serversCountedOn(days: readonly string[], kind: GoogleCount): Promise<Map<number, number>>;
}

/** No question yet. */
const NOTHING: DayUse = { places: 0, geocodes: 0, byHand: 0, maps: 0 };

/** A count with one more of a kind. */
export function plusOne(kept: DayUse, counted: GoogleCount): DayUse {
  return counted === 'places'
    ? { ...kept, places: kept.places + 1 }
    : counted === 'geocode'
      ? { ...kept, geocodes: kept.geocodes + 1 }
      : counted === 'map'
        ? { ...kept, maps: kept.maps + 1 }
        : { ...kept, byHand: kept.byHand + 1 };
}

/** What a count holds of one kind. */
export function countOf(used: DayUse, kind: GoogleCount): number {
  return kind === 'places'
    ? used.places
    : kind === 'geocode'
      ? used.geocodes
      : kind === 'map'
        ? used.maps
        : used.byHand;
}

/** Two counts added. */
export function added(a: DayUse, b: DayUse): DayUse {
  return {
    places: a.places + b.places,
    geocodes: a.geocodes + b.geocodes,
    byHand: a.byHand + b.byHand,
    maps: a.maps + b.maps,
  };
}

/** The counts in memory: the database's twin. `legacy` is the old count of gyms per day. */
export class MemoryGoogleUse implements GoogleUse {
  readonly days = new Map<string, DayUse>();
  readonly legacy = new Map<string, number>();
  /** Each server's counts per day, by `<guildId>:<day>`. */
  readonly servers = new Map<string, DayUse>();

  use(day: string, counted: GoogleCount, guildId?: number): Promise<void> {
    this.days.set(day, plusOne(this.days.get(day) ?? NOTHING, counted));
    if (guildId !== undefined) {
      const key = `${String(guildId)}:${day}`;
      this.servers.set(key, plusOne(this.servers.get(key) ?? NOTHING, counted));
    }
    return Promise.resolve();
  }

  serversUsedOn(days: readonly string[], guildId?: number): Promise<Map<number, DayUse>> {
    const asked = new Set(days);
    const used = new Map<number, DayUse>();
    for (const [key, counts] of this.servers) {
      const [server = '', day = ''] = key.split(':');
      const id = Number(server);
      if (!asked.has(day) || (guildId !== undefined && id !== guildId)) continue;
      used.set(id, added(used.get(id) ?? NOTHING, counts));
    }
    return Promise.resolve(used);
  }

  async serversCountedOn(days: readonly string[], kind: GoogleCount): Promise<Map<number, number>> {
    const counted = new Map<number, number>();
    for (const [guildId, used] of await this.serversUsedOn(days)) {
      const n = countOf(used, kind);
      if (n > 0) counted.set(guildId, n);
    }
    return counted;
  }

  usedOn(days: readonly string[]): Promise<Map<string, DayUse>> {
    const used = new Map<string, DayUse>();
    for (const day of days) {
      const kept = this.days.get(day);
      const old = this.legacy.get(day) ?? 0;
      if (!kept && old === 0) continue;
      used.set(day, {
        places: (kept?.places ?? 0) + old,
        geocodes: kept?.geocodes ?? 0,
        byHand: kept?.byHand ?? 0,
        maps: kept?.maps ?? 0,
      });
    }
    return Promise.resolve(used);
  }

  /** Every question counted, over every day (for tests). */
  total(question: GoogleQuestion): number {
    let sum = 0;
    for (const day of this.days.values()) sum += question === 'places' ? day.places : day.geocodes;
    return sum;
  }
}

/** How many maps of places the month of a moment used so far (`MapBudget`). */
export async function mapsThisMonth(use: GoogleUse, now: number): Promise<number> {
  const days = await use.usedOn(googleMonth(now).days);
  let maps = 0;
  for (const day of days.values()) maps += day.maps;
  return maps;
}

/** What the month of a moment used so far, and of it the day (`lineAllowance` takes it). */
export async function usedThisMonth(use: GoogleUse, now: number): Promise<GoogleUsed> {
  const month = googleMonth(now);
  const days = await use.usedOn(month.days);
  let monthPlaces = 0;
  let monthGeocodes = 0;
  let monthByHand = 0;
  for (const day of days.values()) {
    monthPlaces += day.places;
    monthGeocodes += day.geocodes;
    monthByHand += day.byHand;
  }
  return {
    monthPlaces,
    monthGeocodes,
    monthByHand,
    todayPlaces: days.get(month.today)?.places ?? 0,
  };
}
