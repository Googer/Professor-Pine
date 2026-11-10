/**
 * What the live map's max battles read and send (plan 8X-5; design 7), as a page reads it. Types
 * and lists alone, with no import of the server's code: a page's bundle (`src/web/client/`) may
 * take them.
 */

import type { MapMax, MapMaxTier } from './party-data.js';

export type { MapMaxTier };

/**
 * The power spots of a server in a box of the map (`GET /s/<guild>/api/powerspots`), as
 * `/api/stops` gives the PokéStops: `[id, lat, lon, title, address]`, the nearest to the box's middle
 * first, at most `MAX_MAP_SPOTS`; `more` when the box holds more (the page asks to zoom in).
 */
export interface PowerSpotsView {
  spots: Array<[string, number, number, string, (string | null)?]>;
  more: boolean;
}

/**
 * A Power Spot's address (`GET /s/<guild>/api/powerspots/<id>/address`; design
 * `2026-11-04-power-spot-address-design.md`): its line as every reader words it, looked up of
 * Google when none was known and the budget allowed; null for none.
 */
export interface SpotAddressView {
  address: string | null;
}

/** As many power spots as one answer of `/api/powerspots` gives (as `MAX_MAP_STOPS`). */
export const MAX_MAP_SPOTS = 300;

/**
 * A max boss as `/max` lists it (`GET /s/<guild>/api/max-options`): the value its choice has
 * (`m:D2:machamp`, which a report sends back), the boss's name, the tier (`level`: `D1` to `G`)
 * and the tier in the posts' words (`tier`: `Dynamax 2★`), whether it is the featured boss of an
 * event that is on, and its picture where the page may load it.
 */
export interface MaxBossOption {
  value: string;
  name: string;
  level: MapMaxTier;
  tier: string;
  featured: boolean;
  image?: string;
}

/** A tier as `/max`'s `tier:` offers it, for a boss on no list: its value and its words. */
export interface MaxTierOption {
  value: MapMaxTier;
  tier: string;
}

/**
 * The pick lists of a report of a max battle (`GET /s/<guild>/api/max-options`), in `/max`'s
 * order: the current bosses (the featured ones first; the Gigantamax ones first during a big
 * event's hours), the tiers for a boss typed that is on no list, and the posts' zone, in which
 * typed clock times are read.
 */
export interface MaxOptionsView {
  zone: string;
  bosses: MaxBossOption[];
  tiers: MaxTierOption[];
}

/**
 * The choices of the ending-soon question (a 422 of `POST /s/<guild>/api/maxes`, `soon`): its
 * value (`next` for the next rotation, `soon` for the end about to pass), its words, and the end
 * it reports, which the report sent again carries back with the value.
 */
export interface MaxEndChoice {
  value: 'next' | 'soon';
  label: string;
  end: number;
}

/**
 * What a refused report needs before it can be made, for a page to act on rather than read words
 * (plan 8X-5): `tier`, a tier for a boss typed that is on no list (`/max` asks for `tier:`);
 * `listed-spot`, a power spot Pine keeps, not a pin (a member blocked from meetups); `boss`, a
 * boss of the list for one typed that names no Pokémon.
 */
export type MaxNeed = 'tier' | 'listed-spot' | 'boss';

/**
 * What a report of a max battle answers (`POST /s/<guild>/api/maxes`): whether it was done, the
 * command's words as plain text, and the battle as the member now sees it on the map (also the
 * battle the report joined), when there is one to show. A point in several regions is answered
 * with those regions (`regions`, to pick one); a battle about to end with the question `/max`
 * asks in its dialog (`soon`: the report is sent again with the choice).
 */
export interface MaxAnswer {
  ok: boolean;
  text: string;
  /** What a refusal needs of the page, for it to act on (`MaxNeed`); absent otherwise. */
  needs?: MaxNeed;
  max?: MapMax;
  regions?: Array<{ id: number; name: string }>;
  soon?: { choices: MaxEndChoice[] };
}
