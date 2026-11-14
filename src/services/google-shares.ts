import { googleMonth, OUT_OF_SHARE_RANK, type GoogleBudget } from '../domain/geo/google-line.js';
import {
  monthShares,
  monthToShare,
  type MonthShare,
  type ShareNeed,
} from '../domain/geo/google-shares.js';
import type { Logger } from '../log.js';
import { budgetUsedAlert, shareUsedNotice } from '../render/google-shares.js';
import type { GoogleQuestion, GoogleUse } from './google-use.js';
import type { OutOfShare } from './gym-lookups.js';

/**
 * What instance operators added to servers' shares of a month (`/operator google share`, plan
 * 19B-5): `GoogleShareRaiseRepository` (table `GoogleShareRaise`, migration 060), its twin
 * `MemoryGoogleShareRaises`. A raise is of one month (its first day, `YYYY-MM-01` Pacific).
 */
export interface GoogleShareRaises {
  /** The raises of a month, by server (`Guild` row). */
  of(month: string): Promise<Map<number, number>>;
  /** Sets a server's raise of a month, replacing one set before; 0 takes it back. */
  set(month: string, guildId: number, extra: number, at: number): Promise<void>;
}

export class MemoryGoogleShareRaises implements GoogleShareRaises {
  /** By `<month>:<guildId>`. */
  readonly rows = new Map<string, number>();

  of(month: string): Promise<Map<number, number>> {
    const raises = new Map<number, number>();
    for (const [key, extra] of this.rows) {
      const [of = '', guildId = ''] = key.split(':');
      if (of === month) raises.set(Number(guildId), extra);
    }
    return Promise.resolve(raises);
  }

  set(month: string, guildId: number, extra: number): Promise<void> {
    this.rows.set(`${month}:${String(guildId)}`, extra);
    return Promise.resolve();
  }
}

/** A server's part of the month, as `/gym google` and `/operator google share` say it. */
export interface ServerMonthShare {
  share: MonthShare;
  used: MonthShare;
  /** What an operator added this month (in `share` already). */
  raise: number;
}

export interface GoogleSharesOptions {
  budget: GoogleBudget;
  /** The most of one server, of each kind (`googleServerShareMax`); unset: none. */
  max?: number;
  /** The counts, the servers' (`GoogleUse.serversUsedOn`). */
  use: GoogleUse;
  raises: GoogleShareRaises;
  /** Tells a server's staff (`ServerNotices`, the server by its `Guild` row). */
  tellServer?: (guildId: number, key: string, text: string) => void;
  /** Tells the owner what is the instance's (a DM through the queue). */
  tellOwner?: (text: string) => void;
  log: Logger;
  /** Default `Date.now`. */
  now?: () => number;
}

/**
 * Google's month shared between servers by need (plan 19B-5; spec "Fairness and limits";
 * `monthShares`, `src/domain/geo/google-shares.ts`): each server's share of places questions and
 * of addresses this month, what of it the line used (`GoogleUseServerDay`, the line's questions
 * of the server's rows), and which servers are out of it. `GymUpkeep` works it out at start, at
 * the line's first turn of each Pacific day (so on the 1st, when the month starts again), after
 * each write of rows of a server it does not know, and before it serves such a row, from the need
 * of every server (its rows of the line) and what the line asked of each this month, and counts
 * each question the line asks against the server whose row was served. A server out of its share
 * has its rows ranked `OUT_OF_SHARE_RANK` and waits (its rows stay): for the 1st, or a day whose
 * shares give it more, or an operator's raise. Its staff are told once a month and start
 * (`ServerNotices`), unless its share was the whole month (it alone waited: fix round 4, R2); the
 * owner is told once a month and start when the line used the whole month above the reserve, for
 * every server.
 *
 * A server is known for a kind only for as much of it as waited at the reading (fix round 3, T1):
 * one with nothing of a kind waiting, or whose rows of it the line has asked about since, is out
 * of nothing of that kind and told nothing, and a row of it that comes is one to work the shares
 * out for (`knows`).
 *
 * Kept in memory between the readings (the line asks one question at a time, so the counts stay
 * right); the counts themselves are the database's. Without a reading yet (a start whose reading
 * failed) nothing is held back.
 */
export class GoogleShares {
  private readonly now: () => number;
  /** The month of the shares (its first day); '' before the first reading. */
  private month = '';
  private shares = new Map<number, MonthShare>();
  /** Every server's need at the last reading. */
  private needs = new Map<number, ShareNeed>();
  private raises = new Map<number, number>();
  /** What of the month was shared out at the last reading, of each kind (`monthToShare`). */
  private months: MonthShare = { places: 0, geocodes: 0 };
  private readonly used = new Map<number, MonthShare>();
  /** What the line had asked of each server this month at the last reading. */
  private usedAtReading = new Map<number, MonthShare>();
  private readonly placesOut = new Set<number>();
  private readonly geocodesOut = new Set<number>();
  /** The servers told this month that they are out of a kind (`<guildId>:<kind>`). */
  private readonly told = new Set<string>();
  /** The month the owner was told of the budget used. */
  private ownerToldFor = '';

  constructor(private readonly options: GoogleSharesOptions) {
    this.now = options.now ?? Date.now;
  }

  /**
   * Works the shares out anew from every server's need (its rows of the line), this month's
   * raises and counts. Gives the servers whose being out of a kind changed: their rows are to be
   * ranked anew. Rejects when a reading fails (the shares stay as they were).
   */
  async refresh(needs: ReadonlyMap<number, ShareNeed>): Promise<Set<number>> {
    const month = googleMonth(this.now());
    const first = month.days[0] ?? '';
    const raises = await this.options.raises.of(first);
    const used = await this.options.use.serversUsedOn(month.days);
    if (first !== this.month) this.told.clear();
    this.month = first;
    this.needs = new Map(needs);
    this.raises = raises;
    this.used.clear();
    for (const [guildId, counts] of used) {
      this.used.set(guildId, { places: counts.places, geocodes: counts.geocodes });
    }
    this.usedAtReading = new Map(this.used);
    this.months = monthToShare({ needs, used: this.used, budget: this.options.budget });
    this.shares = monthShares({
      needs,
      used: this.used,
      budget: this.options.budget,
      ...(this.options.max === undefined ? {} : { max: this.options.max }),
      raises,
    });
    const changed = new Set<number>();
    const before = { places: new Set(this.placesOut), geocodes: new Set(this.geocodesOut) };
    this.placesOut.clear();
    this.geocodesOut.clear();
    for (const guildId of this.shares.keys()) this.judge(guildId, month.nextReset);
    for (const kind of ['places', 'geocodes'] as const) {
      const now = kind === 'places' ? this.placesOut : this.geocodesOut;
      for (const guildId of new Set([...before[kind], ...now])) {
        if (before[kind].has(guildId) !== now.has(guildId)) changed.add(guildId);
      }
    }
    return changed;
  }

  /**
   * Whether a server's share was worked out for a row of it (`address`: one that waits for its
   * address): only while some of what waited of it at the last reading (of places; of addresses
   * too) is still to be asked. A server that had nothing waiting, no gym waiting for its address,
   * or whose rows the line has asked about since, is to have it worked out as soon as such a row
   * of it waits. Before the first reading every server is known: nothing is held back.
   */
  knows(guildId: number, address: boolean): boolean {
    if (this.month === '') return true;
    return this.known(guildId, 'places') && (!address || this.known(guildId, 'geocodes'));
  }

  /** Whether a row of a server would be held now (`address`: one that waits for its address). */
  holds(guildId: number, address: boolean): boolean {
    return this.placesOut.has(guildId) || (address && this.geocodesOut.has(guildId));
  }

  /**
   * Whether a server's share of a kind was the whole month shared out (`monthToShare`): it alone
   * waited for that kind at the last reading.
   */
  private wholeMonth(guildId: number, kind: keyof MonthShare): boolean {
    const share = this.shares.get(guildId)?.[kind] ?? 0;
    let waiting = 0;
    for (const need of this.needs.values()) if (need[kind] > 0) waiting++;
    return waiting <= 1 && share >= this.months[kind];
  }

  /** Whether some of what waited of a server's kind at the last reading is still to be asked. */
  private known(guildId: number, kind: keyof MonthShare): boolean {
    const need = this.needs.get(guildId)?.[kind] ?? 0;
    const asked =
      (this.used.get(guildId)?.[kind] ?? 0) - (this.usedAtReading.get(guildId)?.[kind] ?? 0);
    return need - asked > 0;
  }

  /** Whether the shares were worked out at all (the first reading is at start). */
  get read(): boolean {
    return this.month !== '';
  }

  /** The servers out of their share now (`GymLookups.next`). */
  outOfShare(): OutOfShare {
    return { places: this.placesOut, geocodes: this.geocodesOut };
  }

  /** Whether any server is out of its share of a kind. */
  anyOut(): boolean {
    return this.placesOut.size + this.geocodesOut.size > 0;
  }

  /**
   * A row's rank as the line keeps it: `OUT_OF_SHARE_RANK` while its server is out of places
   * questions, or (for a gym that waits for its address) of addresses; else its own.
   */
  rank(guildId: number, address: boolean, rank: number): number {
    return this.holds(guildId, address) ? OUT_OF_SHARE_RANK : rank;
  }

  /**
   * Counts a question the line asked about a server's row; true when the server is out of a
   * kind with it (its rows are to be ranked anew). Its staff are told then.
   */
  counted(guildId: number, question: GoogleQuestion): boolean {
    const kept = this.used.get(guildId) ?? { places: 0, geocodes: 0 };
    this.used.set(
      guildId,
      question === 'places'
        ? { ...kept, places: kept.places + 1 }
        : { ...kept, geocodes: kept.geocodes + 1 },
    );
    const places = this.placesOut.has(guildId);
    const geocodes = this.geocodesOut.has(guildId);
    this.judge(guildId, googleMonth(this.now()).nextReset);
    return places !== this.placesOut.has(guildId) || geocodes !== this.geocodesOut.has(guildId);
  }

  /** A server's part of this month; undefined for one without a share. */
  of(guildId: number): ServerMonthShare | undefined {
    const share = this.shares.get(guildId);
    if (!share) return undefined;
    return {
      share,
      used: this.used.get(guildId) ?? { places: 0, geocodes: 0 },
      raise: this.raises.get(guildId) ?? 0,
    };
  }

  /** Sets what an operator adds to a server's share this month; `refresh` then counts it. */
  async raise(guildId: number, extra: number): Promise<void> {
    const now = this.now();
    await this.options.raises.set(googleMonth(now).days[0] ?? '', guildId, extra, now);
  }

  /** The line used the month above the reserve: the owner is told, once a month and start. */
  budgetUsed(): void {
    const month = googleMonth(this.now());
    const first = month.days[0] ?? '';
    if (this.ownerToldFor === first) return;
    this.ownerToldFor = first;
    const { budget, log, tellOwner } = this.options;
    log.warn(
      { places: budget.places, reserve: budget.reserve, nextReset: month.nextReset },
      'the line used this month’s budget for Google: every server waits for the next month',
    );
    tellOwner?.(budgetUsedAlert(budget.places, budget.reserve, month.nextReset));
  }

  /**
   * Puts a server out of a kind it used its share of while rows of it it was known for still
   * wait, and tells its staff once a month; a server not known for a kind is out of none of it.
   */
  private judge(guildId: number, nextReset: number): void {
    const share = this.shares.get(guildId);
    if (!share) return;
    const used = this.used.get(guildId) ?? { places: 0, geocodes: 0 };
    for (const kind of ['places', 'geocodes'] as const) {
      const out = kind === 'places' ? this.placesOut : this.geocodesOut;
      if (used[kind] < share[kind] || !this.known(guildId, kind)) {
        out.delete(guildId);
        continue;
      }
      if (out.has(guildId)) continue;
      out.add(guildId);
      // A share of nothing (the month has none) is not told, nor one of the whole month (fix
      // round 4, R2): the server alone waited, the line stops with it, and the owner's alert
      // (`budgetUsed`) says the month is used; a later reading with others waiting tells it.
      const key = `${String(guildId)}:${kind}`;
      if (share[kind] === 0 || this.wholeMonth(guildId, kind) || this.told.has(key)) continue;
      this.told.add(key);
      this.options.log.info(
        { guild: guildId, kind, share: share[kind] },
        'a server used its share of Google this month: its part of the line waits',
      );
      this.options.tellServer?.(
        guildId,
        `google-share:${kind}:${this.month}`,
        shareUsedNotice(kind === 'places' ? 'places' : 'geocode', share[kind], nextReset),
      );
    }
  }
}
