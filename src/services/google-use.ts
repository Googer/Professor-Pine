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
export type GoogleCount = GoogleQuestion | 'hand';

/** What one day used. */
export interface DayUse {
  places: number;
  geocodes: number;
  /** Lookups by hand, whose questions are counted in the two above as well. */
  byHand: number;
}

export interface GoogleUse {
  /** Counts one question, or one lookup by hand, on a day (`YYYY-MM-DD`, Pacific time). */
  use(day: string, counted: GoogleCount): Promise<void>;
  /**
   * What these days used; a day without questions is left out. The gyms the line before plan
   * 8W-6 counted on a day (`GymLookupDay`) count as places questions of that day.
   */
  usedOn(days: readonly string[]): Promise<Map<string, DayUse>>;
}

/** The counts in memory: the database's twin. `legacy` is the old count of gyms per day. */
export class MemoryGoogleUse implements GoogleUse {
  readonly days = new Map<string, DayUse>();
  readonly legacy = new Map<string, number>();

  use(day: string, counted: GoogleCount): Promise<void> {
    const kept = this.days.get(day) ?? { places: 0, geocodes: 0, byHand: 0 };
    this.days.set(
      day,
      counted === 'places'
        ? { ...kept, places: kept.places + 1 }
        : counted === 'geocode'
          ? { ...kept, geocodes: kept.geocodes + 1 }
          : { ...kept, byHand: kept.byHand + 1 },
    );
    return Promise.resolve();
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
