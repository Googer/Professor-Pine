import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { BoundedMap } from '../bounded-map.js';
import { answerPoint } from '../domain/geo/answer-point.js';
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
import type { GoogleAnswer, GoogleAnswers } from './google-answers.js';
import { usedThisMonth, type GoogleUse } from './google-use.js';

/**
 * The addresses of Power Spots, looked up when the map opens a spot's popup and there is budget
 * left (design `2026-11-04-power-spot-address-design.md`): Wayfarer gives Power Spots none. The
 * answers are the point's (`GoogleAnswers`, plan 19B-3), read in memory so that every reader
 * stays synchronous (`WayspotDirectory.addressOf`, through `wayspotAddress`): every server's copy
 * of one place, and a gym there, share one answer and one question.
 */

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
  /** Google's answers by the point, where the addresses are kept. */
  answers: Pick<GoogleAnswers, 'at' | 'ownAt' | 'save'>;
  geo: Pick<GeoGateway, 'reverseGeocode'>;
  /** The questions asked of Google this month (`GoogleUse`), shared with the gyms and the line. */
  use: GoogleUse;
  budget: GoogleBudget;
  log: Logger;
  /** Default `Date.now`. */
  now?: () => number;
}

/** A point as the questions on their way and those set aside are kept by: its rounded place. */
function pointKey(point: LatLon): string {
  const { lat, lon } = answerPoint(point);
  return `${String(lat)}:${String(lon)}`;
}

/** A kept answer as the address it gives a Power Spot. */
function looked(kept: GoogleAnswer | undefined): LookedUpAddress | undefined {
  return kept && { lat: kept.lat, lon: kept.lon, geodata: kept.answer, askedAt: kept.askedAt };
}

export class WayspotAddresses {
  /**
   * The questions on their way, by point: a second ask waits for the same answer, whichever
   * server's copy of the place asks.
   */
  private readonly asking = new Map<string, Promise<string | null>>();
  /** Points whose question failed, with the Pacific day they wait out (as the line's `asideGyms`). */
  private readonly aside = new Map<string, string>();
  /** Each member's lookups of a day, by server and member. */
  private readonly members = new BoundedMap<string, { day: string; count: number }>(
    MEMBERS_COUNTED,
  );
  /** The month's reads with their takes, and the counts with their releases, one at a time. */
  private gate: Promise<void> = Promise.resolve();
  /** Geocodes the budget let through that are not counted yet. */
  private onTheirWay = 0;
  private readonly now: () => number;

  constructor(private readonly options: WayspotAddressesOptions) {
    this.now = options.now ?? Date.now;
  }

  /**
   * The address shown for a place meanwhile: the nearest asked within ten meters of it
   * (`GoogleAnswers.at`), what every reader shows (`WayspotDirectory.addressOf`).
   */
  lookedUp(point: LatLon): LookedUpAddress | undefined {
    return looked(this.options.answers.at('address', point));
  }

  /**
   * A Power Spot's address line for the map, asked of Google when its own point's is not known
   * and it may be: its own point never asked or found nothing lately (`spotAddressWanted` of
   * `GoogleAnswers.ownAt`: a neighbor's answer a few meters off keeps no spot from being asked),
   * not set aside today, within the month's geocodes above the reserve kept for gyms
   * (`lineAllowance`, those on their way counted), and within the member's lookups of the day
   * (counted as soon as one is on its way, given back when nothing reached Google). Where it is
   * not asked, or Google gave nothing, what is shown meanwhile (`lookedUp`). Null for none. Never
   * rejects; the address is never logged.
   */
  ask(spot: AskedSpot, who: AddressAsker): Promise<string | null> {
    const now = this.now();
    const own = looked(this.options.answers.ownAt('address', spot));
    const known = wayspotAddress(spot, own);
    if (known !== '') return Promise.resolve(known);
    if (!spotAddressWanted(spot, own, now)) return Promise.resolve(this.shown(spot));
    const key = pointKey(spot);
    const on = this.asking.get(key);
    if (on) return on;
    const today = googleMonth(now).today;
    if (this.aside.get(key) === today) return Promise.resolve(this.shown(spot));
    this.aside.delete(key);
    const member = `${who.guildId}:${who.userId}`;
    const counted = this.members.get(member);
    const used = counted?.day === today ? counted.count : 0;
    if (used >= MEMBER_LOOKUPS_PER_DAY) return Promise.resolve(this.shown(spot));
    this.members.set(member, { day: today, count: used + 1 });
    const answer = this.lookUp(spot, () => {
      const now = this.members.get(member);
      if (now?.day === today) this.members.set(member, { day: today, count: now.count - 1 });
    })
      .then((found) => found ?? this.shown(spot))
      .finally(() => {
        this.asking.delete(key);
      });
    this.asking.set(key, answer);
    return answer;
  }

  /** What a spot shows meanwhile (`lookedUp`), as every reader words it; null for none. */
  private shown(spot: AskedSpot): string | null {
    return wayspotAddress(spot, this.lookedUp(spot)) || null;
  }

  private async lookUp(spot: AskedSpot, giveBack: () => void): Promise<string | null> {
    const { geo, log } = this.options;
    const now = this.now();
    let reached = false;
    let onItsWay = false;
    try {
      // The month read, the check and the take run in one line with the counts written and the
      // questions let go (`gated`): a read never begins before a count and ends after it. The
      // questions on their way and not counted yet count as asked.
      const taken = await this.gated(async () => {
        const used = await usedThisMonth(this.options.use, now);
        const allowance = lineAllowance(
          now,
          { ...used, monthGeocodes: used.monthGeocodes + this.onTheirWay },
          this.options.budget,
        );
        if (!allowance.spotAddress) return false;
        this.onTheirWay += 1;
        return true;
      });
      if (!taken) return null;
      onItsWay = true;
      const answer = await geo.reverseGeocode({ lat: spot.lat, lon: spot.lon });
      reached = answer.ok || answer.reason === 'failed';
      await this.gated(async () => {
        if (reached) await this.count();
        this.onTheirWay -= 1;
      });
      onItsWay = false;
      if (!answer.ok) {
        if (answer.reason === 'failed') {
          this.aside.set(pointKey(spot), googleMonth(this.now()).today);
        }
        return null;
      }
      const row: LookedUpAddress = {
        lat: spot.lat,
        lon: spot.lon,
        geodata: geodataJson(answer.value),
        askedAt: now,
      };
      // The point's answer, for every server (plan 19B-3); not kept when it cannot be written.
      await this.options.answers
        .save([{ kind: 'address', lat: row.lat, lon: row.lon, answer: row.geodata, askedAt: now }])
        .catch((err: unknown) => {
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

  /** Runs `work` after every work given before it has settled: one at a time. */
  private gated<T>(work: () => Promise<T>): Promise<T> {
    const run = this.gate.then(work);
    this.gate = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
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
