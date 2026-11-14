import { BoundedMap } from '../bounded-map.js';
import { googleMonth } from '../domain/geo/google-line.js';
import { DEFAULT_BY_HAND_FLOOR, serverFloor, withinFloors } from '../domain/geo/google-shares.js';
import type { Logger } from '../log.js';
import { mapsThisMonth, type GoogleUse } from './google-use.js';

/**
 * How many maps one member may have downloaded in a (Pacific) day (fix round of 8Z-2): with
 * `/find-region`'s five uses a minute, one member typing place after place used the month's maps
 * in under two hours, for everyone.
 */
export const MAX_MAPS_PER_MEMBER_DAY = 20;
/** How many members' maps of the day are kept: far more than ask for maps in a day. */
const MEMBERS_KEPT = 10_000;

export interface MapBudgetOptions {
  /** The counts of what was asked of Google (`GoogleUseRepository`). */
  use: GoogleUse;
  /** How many maps of places a Pacific month may download. */
  perMonth: number;
  /**
   * Each server's floor of them (plan 19B-5, `googleByHandPerServer`; fix round 3, T3,
   * `withinFloors`): a server's members under it may always have one within the month's cap,
   * the floors of every server (`servers`) kept out of the cap, scaled down where they add up to
   * more; above it they take only of what the others' unused floors leave. Default
   * `DEFAULT_BY_HAND_FLOOR`; a Pine of one server has the whole cap.
   */
  perServer?: number;
  /** The servers Pine is in (`Guild` rows), each with its floor; default none but the asker. */
  servers?: () => readonly number[];
  log: Logger;
  now?: () => number;
}

/**
 * The month's maps of places (plan 8Z-2): `/find-region` shows a map of whatever place a member
 * types, and Google bills each one that is downloaded (Static Maps), so they count against a
 * monthly cap as the lookups by hand do, in a count of their own (`GoogleUseDay`, kind `map`):
 * members' maps and staff's lookups do not use each other's up. The month is Google's (Pacific
 * time, `googleMonth`). Past the cap no map is downloaded: the answer goes without one. A member
 * has at most `MAX_MAPS_PER_MEMBER_DAY` a Pacific day of them (kept in memory: a restart forgets
 * them), and past that their answers go without a map too.
 *
 * Shared between servers by floors (plan 19B-5; fix round 3, T3): each server's members always
 * have their floor of the month (`perServer`), and one server's members never use the others'
 * floors; each map is counted as its server's too (`GoogleUseServerDay`, every server's maps of
 * the month read by the day and the kind, `googleuseserverday_day_kind_index`).
 */
export class MapBudget {
  private readonly now: () => number;
  /** One at a time: a map is counted before the next is asked about. */
  private line: Promise<unknown> = Promise.resolve();
  /** The month (its first day) whose cap was said to be reached: once a month. */
  private toldFor: string | undefined;
  /** The maps each member had downloaded on a Pacific day, and whether that was said. */
  private readonly members = new BoundedMap<string, { day: string; maps: number; told: boolean }>(
    MEMBERS_KEPT,
  );

  constructor(private readonly options: MapBudgetOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Takes one of the month's maps for a download that `member` is about to have begin, and counts
   * it (a download that fails afterwards counts, as every question that reached Google does).
   * False when the member had their day's maps, when the month has none left, or while the count
   * cannot be read or written: nothing is downloaded that would not be counted. Never rejects.
   */
  spend(member: string, guildId?: number): Promise<boolean> {
    const taken = this.line.then(() => this.take(member, guildId));
    this.line = taken;
    return taken;
  }

  /**
   * How many maps this month has used, or with a server (its `Guild` row) that server's members;
   * undefined while the count cannot be read.
   */
  async used(guildId?: number): Promise<number | undefined> {
    try {
      if (guildId === undefined) return await mapsThisMonth(this.options.use, this.now());
      return await this.serverMaps(guildId);
    } catch {
      return undefined;
    }
  }

  /** How many a month may use. */
  get perMonth(): number {
    return this.options.perMonth;
  }

  /**
   * Each server's floor of a month (`perServer`, scaled down by the servers Pine is in, the one
   * asked about with them).
   */
  floorOf(guildId?: number): number {
    const servers = new Set(this.servers());
    if (guildId !== undefined) servers.add(guildId);
    return serverFloor(this.options.perMonth, this.perServer, servers.size);
  }

  private get perServer(): number {
    return this.options.perServer ?? DEFAULT_BY_HAND_FLOOR;
  }

  private servers(): readonly number[] {
    return this.options.servers?.() ?? [];
  }

  private async serverMaps(guildId: number): Promise<number> {
    const days = googleMonth(this.now()).days;
    return (await this.options.use.serversUsedOn(days, guildId)).get(guildId)?.maps ?? 0;
  }

  private async take(member: string, guildId?: number): Promise<boolean> {
    const { use, perMonth, log } = this.options;
    const now = this.now();
    const month = googleMonth(now);
    const kept = this.members.get(member);
    const today = kept?.day === month.today ? kept : { day: month.today, maps: 0, told: false };
    if (today.maps >= MAX_MAPS_PER_MEMBER_DAY) {
      if (!today.told) {
        today.told = true;
        log.info(
          { user: member, maps: today.maps },
          'a member has had their maps of places for the day: /find-region answers them without a map',
        );
      }
      return false;
    }
    try {
      const maps = await mapsThisMonth(use, now);
      if (maps >= perMonth) {
        if (this.toldFor !== month.days[0]) {
          this.toldFor = month.days[0];
          log.warn(
            { maps, perMonth, nextReset: month.nextReset },
            'this month’s maps of places are used: /find-region answers without a map until the month starts again',
          );
        }
        return false;
      }
      // Within the floors (one at a time: `line`): a server's members under theirs, or of what
      // the other servers' unused floors leave.
      const servers = await use.serversCountedOn(month.days, 'map');
      if (
        !withinFloors({
          cap: perMonth,
          floor: this.perServer,
          servers: this.servers(),
          usedOf: (server) => (servers.get(server) ?? 0) + (server === guildId ? 1 : 0),
          total: maps + 1,
          guildId,
        })
      ) {
        log.debug(
          { guild: guildId, perServer: this.perServer },
          'a server’s members have had their maps of places this month, and the rest is kept for the other servers',
        );
        return false;
      }
      await use.use(month.today, 'map', guildId);
      this.members.set(member, { ...today, maps: today.maps + 1 });
      return true;
    } catch (err) {
      log.warn({ err }, 'could not count a map of a place: none is made');
      return false;
    }
  }
}
