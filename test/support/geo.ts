import type { AddressComponents } from '../../src/domain/geo/google.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type {
  GeoAnswer,
  GeoFailure,
  GeoGateway,
  GeoRefusal,
} from '../../src/services/geo-gateway.js';

/** What a fake geocoding gives for a point unless a test says otherwise. */
export const FAKE_ADDRESS: AddressComponents = { route: 'Test Road', locality: 'Pinewood' };
/** The places the fake finds near a point unless a test says otherwise. */
export const FAKE_PLACES: readonly string[] = ['Corner Bakery', 'Maple Dental'];

const key = (point: LatLon): string => `${point.lat},${point.lon}`;

/**
 * Google and the short links as a test wants them: nothing leaves the process. Every point has
 * the address `FAKE_ADDRESS` and the places `FAKE_PLACES` unless `addresses` or `placesAt` say
 * otherwise for it (by `"lat,lon"`); `failing` makes a question answer that failure; `links`
 * says where a short link leads. Every question is recorded in `asked`, in order. Like the real
 * one it never throws and never answers in the same turn of the event loop, and its answer is
 * what the place had when the question was asked. `hold` makes every question from then on wait
 * for that promise; `holdPlaces` holds the next questions about places, one promise each (for
 * an older answer that arrives after a newer one). A denied API says when to ask again
 * (`retryInMs`).
 */
export class FakeGeoGateway implements GeoGateway {
  enabled = true;
  failing: { geocode?: GeoFailure; places?: GeoFailure } = {};
  hold: Promise<void> | undefined;
  readonly holdPlaces: Promise<void>[] = [];
  retryInMs = 3_600_000;
  readonly addresses = new Map<string, AddressComponents>();
  readonly placesAt = new Map<string, string[]>();
  readonly links = new Map<string, string>();
  readonly asked: Array<
    | { what: 'geocode'; point: LatLon }
    | { what: 'places'; point: LatLon; radius: number }
    | { what: 'link'; url: string }
  > = [];

  private async answer<T>(value: () => T, held?: Promise<void>): Promise<T> {
    // Decided when asked, as Google would: what changes while the answer is on its way is not in it.
    const decided = value();
    await this.hold;
    await held;
    return new Promise((resolve) => {
      setImmediate(() => {
        resolve(decided);
      });
    });
  }

  private refusal(reason: GeoFailure): GeoRefusal {
    return reason === 'denied'
      ? { ok: false, reason, retryInMs: this.retryInMs }
      : { ok: false, reason };
  }

  /** The questions of one kind, in order. */
  questions<W extends 'geocode' | 'places' | 'link'>(what: W) {
    return this.asked.filter(
      (question): question is Extract<(typeof this.asked)[number], { what: W }> =>
        question.what === what,
    );
  }

  reverseGeocode(point: LatLon): Promise<GeoAnswer<AddressComponents>> {
    return this.answer(() => {
      const reason = this.enabled ? this.failing.geocode : 'no-key';
      if (reason) return this.refusal(reason);
      this.asked.push({ what: 'geocode', point: { lat: point.lat, lon: point.lon } });
      return { ok: true, value: { ...(this.addresses.get(key(point)) ?? FAKE_ADDRESS) } };
    });
  }

  placesNear(point: LatLon, radiusMetres: number): Promise<GeoAnswer<string[]>> {
    return this.answer(() => {
      const reason = this.enabled ? this.failing.places : 'no-key';
      if (reason) return this.refusal(reason);
      this.asked.push({
        what: 'places',
        point: { lat: point.lat, lon: point.lon },
        radius: radiusMetres,
      });
      return { ok: true, value: [...(this.placesAt.get(key(point)) ?? FAKE_PLACES)] };
    }, this.holdPlaces.shift());
  }

  followShortLink(
    url: string,
    readable: (address: string) => boolean,
  ): Promise<string | undefined> {
    return this.answer(() => {
      this.asked.push({ what: 'link', url });
      const address = this.links.get(url);
      return address !== undefined && readable(address) ? address : undefined;
    });
  }
}
