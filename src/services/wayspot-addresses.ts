import { BoundedMap } from '../bounded-map.js';
import { geodataJson } from '../domain/geo/google.js';
import { googleMonth, lineAllowance, type GoogleBudget } from '../domain/geo/google-line.js';
import {
  spotAddressWanted,
  wayspotAddress,
  type AddressedWayspot,
  type LookedUpAddress,
} from '../domain/geo/spot-address.js';
import type { Logger } from '../log.js';
import type { GeoGateway } from './geo-gateway.js';
import { usedThisMonth, type GoogleUse } from './google-use.js';

/**
 * The addresses of Power Spots, looked up when the map opens a spot's popup and there is budget
 * left (design `2026-11-04-power-spot-address-design.md`): Wayfarer gives Power Spots none. The
 * answers are kept (`WayspotAddressStorage`: `WayspotAddressRepository`, table `WayspotAddress`
 * of migration 035; twin `MemoryWayspotAddresses`; both run `wayspotAddressCases`), read into
 * memory at start so that every reader stays synchronous (`WayspotDirectory.addressOf`, through
 * `wayspotAddress`), and written through on each answer.
 */

/** A kept answer: the Power Spot's Wayfarer id, and where, what and when Google answered. */
export interface StoredAddress extends LookedUpAddress {
  wayspotId: string;
}

export interface WayspotAddressStorage {
  /** Every kept answer, in no particular order. */
  all(): Promise<StoredAddress[]>;
  /** Keeps an answer, over the one kept for that spot before. */
  save(row: StoredAddress): Promise<void>;
}

/** The kept answers in memory: the database's twin. `failing` makes `save` reject. */
export class MemoryWayspotAddresses implements WayspotAddressStorage {
  readonly rows = new Map<string, StoredAddress>();
  failing = false;

  all(): Promise<StoredAddress[]> {
    return Promise.resolve([...this.rows.values()].map((row) => ({ ...row })));
  }

  save(row: StoredAddress): Promise<void> {
    if (this.failing) return Promise.reject(new Error('the addresses cannot be written'));
    this.rows.set(row.wayspotId, { ...row });
    return Promise.resolve();
  }
}

/** New lookups one member may set off in a server per Pacific day (Matt, 2026-11-04). */
export const MEMBER_LOOKUPS_PER_DAY = 100;

/** The members whose lookups of the day are counted at once; the oldest forgotten first. */
const MEMBERS_COUNTED = 10_000;

/** A Power Spot as the service needs it: its id, kind, point and Wayfarer's address. */
export type AskedSpot = AddressedWayspot & { id: string };

/** Who asks: the member, in the server whose map asks. */
export interface AddressAsker {
  guildId: string;
  userId: string;
}

export interface WayspotAddressesOptions {
  storage: WayspotAddressStorage;
  geo: Pick<GeoGateway, 'reverseGeocode'>;
  /** The questions asked of Google this month (`GoogleUse`), shared with the gyms and the line. */
  use: GoogleUse;
  budget: GoogleBudget;
  log: Logger;
  /** Default `Date.now`. */
  now?: () => number;
}

export class WayspotAddresses {
  private rows = new Map<string, LookedUpAddress>();
  /** The questions on their way, by spot: a second ask waits for the same answer. */
  private readonly asking = new Map<string, Promise<string | null>>();
  /** Spots whose question failed, with the Pacific day they wait out (as the line's `asideGyms`). */
  private readonly aside = new Map<string, string>();
  /** Each member's lookups of a day, by server and member. */
  private readonly members = new BoundedMap<string, { day: string; count: number }>(
    MEMBERS_COUNTED,
  );
  /** Geocodes the budget let through that are not counted yet. */
  private onTheirWay = 0;
  private readonly now: () => number;

  constructor(private readonly options: WayspotAddressesOptions) {
    this.now = options.now ?? Date.now;
  }

  /** Reads every kept answer. */
  async load(): Promise<void> {
    const rows = await this.options.storage.all();
    this.rows = new Map(rows.map(({ wayspotId, ...looked }) => [wayspotId, looked]));
  }

  /** The answer kept for a Power Spot, wherever it was asked (`wayspotAddress` decides). */
  lookedUp(id: string): LookedUpAddress | undefined {
    return this.rows.get(id);
  }

  /**
   * A Power Spot's address line for the map, asked of Google when none is known and it may be:
   * not found nothing lately (`spotAddressWanted`), not set aside today, within the month's
   * geocodes above the reserve kept for gyms (`lineAllowance`, those on their way counted), and
   * within the member's lookups of the day (counted as soon as one is on its way, given back
   * when nothing reached Google). Null for none. Never rejects; the address is never logged.
   */
  ask(spot: AskedSpot, who: AddressAsker): Promise<string | null> {
    const now = this.now();
    const looked = this.rows.get(spot.id);
    const known = wayspotAddress(spot, looked);
    if (known !== '') return Promise.resolve(known);
    if (!spotAddressWanted(spot, looked, now)) return Promise.resolve(null);
    const on = this.asking.get(spot.id);
    if (on) return on;
    const today = googleMonth(now).today;
    if (this.aside.get(spot.id) === today) return Promise.resolve(null);
    this.aside.delete(spot.id);
    const member = `${who.guildId}:${who.userId}`;
    const counted = this.members.get(member);
    const used = counted?.day === today ? counted.count : 0;
    if (used >= MEMBER_LOOKUPS_PER_DAY) return Promise.resolve(null);
    this.members.set(member, { day: today, count: used + 1 });
    const answer = this.lookUp(spot, () => {
      const now = this.members.get(member);
      if (now?.day === today) this.members.set(member, { day: today, count: now.count - 1 });
    }).finally(() => {
      this.asking.delete(spot.id);
    });
    this.asking.set(spot.id, answer);
    return answer;
  }

  private async lookUp(spot: AskedSpot, giveBack: () => void): Promise<string | null> {
    const { geo, log } = this.options;
    const now = this.now();
    let reached = false;
    let onItsWay = false;
    try {
      // The questions on their way and not counted yet count as asked.
      const used = await usedThisMonth(this.options.use, now);
      const allowance = lineAllowance(
        now,
        { ...used, monthGeocodes: used.monthGeocodes + this.onTheirWay },
        this.options.budget,
      );
      if (!allowance.spotAddress) return null;
      this.onTheirWay += 1;
      onItsWay = true;
      const answer = await geo.reverseGeocode({ lat: spot.lat, lon: spot.lon });
      reached = answer.ok || answer.reason === 'failed';
      if (reached) await this.count();
      this.onTheirWay -= 1;
      onItsWay = false;
      if (!answer.ok) {
        if (answer.reason === 'failed') this.aside.set(spot.id, googleMonth(this.now()).today);
        return null;
      }
      const row: StoredAddress = {
        wayspotId: spot.id,
        lat: spot.lat,
        lon: spot.lon,
        geodata: geodataJson(answer.value),
        askedAt: now,
      };
      this.rows.set(spot.id, row);
      await this.options.storage.save(row).catch((err: unknown) => {
        log.warn({ err, wayspot: spot.id }, 'could not keep a Power Spot’s address');
      });
      return wayspotAddress(spot, row) || null;
    } catch (err) {
      log.warn({ err, wayspot: spot.id }, 'could not look up a Power Spot’s address');
      return null;
    } finally {
      if (onItsWay) this.onTheirWay -= 1;
      if (!reached) giveBack();
    }
  }

  /** Counts a geocode that reached Google on its Pacific day. Never rejects. */
  private async count(): Promise<void> {
    try {
      await this.options.use.use(googleMonth(this.now()).today, 'geocode');
    } catch (err) {
      this.options.log.warn({ err }, 'could not count a question asked of Google');
    }
  }
}
