import { addressLine } from '../geo/google.js';
import { regionGate } from '../history/region-tally.js';
import { regionChoices, type GateLook } from '../roles/region-roles.js';
import type { Roster } from '../roles/self-roles.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { GeoView, Point } from './geo-data.js';

export type { GeoView, Point } from './geo-data.js';

/**
 * What the public map of a server shows (spec 3.1, `GET /s/<guild>/api/geo`): its regions,
 * named by their channels, and the gyms that lie in them. Pure: the caller gives the server's
 * regions, the names of their channels as the bot sees them, every gym and where each lies.
 * Gym text is as members wrote it (decoded); the page writes it as text, never as HTML.
 */

/** What is needed of a region. */
export interface GeoRegion {
  id: number;
  channelId: string;
  bounds: readonly LatLon[] | null;
}

/** What is needed of a gym. */
export interface GeoGym {
  id: number;
  name: string;
  nickname: string | null;
  lat: number;
  lon: number;
  description: string | null;
  notice: string | null;
  taggedEx: boolean;
  confirmedEx: boolean;
  geodata: string | null;
}

export interface GeoInput {
  /** The regions of the server (`Region.guildId` its row), whether or not they have an outline. */
  regions: readonly GeoRegion[];
  /** The names of channels by id, as the bot sees them now. */
  channelNames: ReadonlyMap<string, string>;
  /** Every gym the bot knows. */
  gyms: readonly GeoGym[];
  /** The channels of the regions a gym lies in (`GymProvider.regionsOf`). */
  regionsOf(gymId: number): readonly string[];
}

/** No role but everybody's. */
const NO_ROLES: ReadonlySet<string> = new Set();

/**
 * The regions somebody who is no member of the server may see on its map (Matt's ruling 8, plan
 * 8Z-2; F-B10, Matt 2026-11-10): those whose gate (`regionGate`, the one channel that decides
 * who sees a region: its forum, or its text channel where it has none) everybody in the server
 * can view, or a member who holds one role members may give themselves can: what "Your regions"
 * offers a member who holds none (`regionChoices` with nothing held: the region `visible`, or a
 * join of the roster, whose entries with a `problem` are offered to nobody). `everyone` is what
 * Discord says of somebody of no role and no overwrite of their own (`PartyGateway
 * .everyoneGates`); a gate it says nothing of (the bot's cache lacks the channel) hides its
 * region, as a gate it denies. Without a roster (roles off, or it could not be read) only what
 * everybody views. `geoView` of these regions alone leaves out the gyms that lie only in the
 * others, and names none of them on a gym that lies in both.
 */
export function publicRegions<
  R extends { id: number; forumChannelId: string | null; channelId: string },
>(regions: readonly R[], everyone: GateLook, roster: Roster | undefined): R[] {
  const gates = regions.map((region) => ({ regionId: region.id, gateId: regionGate(region) }));
  const open = new Set(
    regionChoices(gates, everyone, roster, NO_ROLES)
      .filter((choice) => choice.access === 'visible' || choice.join.length > 0)
      .map((choice) => choice.regionId),
  );
  return regions.filter((region) => open.has(region.id));
}

/**
 * The name the public view gives a region (v2.0.2), from the name of its gate (`regionGate`,
 * the channel that let it in, F-B1): a forum is named after its region's channel with
 * `settings.regionForumSuffix` added (`north` and `north-board`; `/admin setup-forums`,
 * `/region import`), so a forum's name that ends with the suffix is shown without it. Nothing
 * else is read: the text channel's name may be one the public cannot view. A forum named
 * otherwise, or only the suffix, and a region whose gate is its text channel keep the name.
 */
export function publicRegionName(
  region: { forumChannelId: string | null; channelId: string },
  gateName: string,
  forumSuffix: string,
): string {
  if (regionGate(region) === region.channelId || !gateName.endsWith(forumSuffix)) return gateName;
  const shortened = gateName.slice(0, gateName.length - forumSuffix.length);
  return shortened === '' ? gateName : shortened;
}

const round = (value: number): number => Math.round(value * 1e6) / 1e6;

/**
 * The map of a server: its regions that have an outline (a region whose channel the bot does not
 * see is named by its number), and the gyms that lie in at least one of them. Gyms that lie in
 * no region of any server are left out: which server's they are is not cheap to say (8M-1).
 */
/**
 * Whether a region is on the map: it has an outline (`/api/geo` shows it; "Your regions" lists
 * it, plan 8M-20).
 */
export function hasOutline<R extends Pick<GeoRegion, 'bounds'>>(
  region: R,
): region is R & { bounds: readonly LatLon[] } {
  return region.bounds !== null;
}

export function geoView(input: GeoInput): GeoView {
  const shown = input.regions.filter(hasOutline);
  const byChannel = new Map(shown.map((region) => [region.channelId, region.id]));
  const regions = shown
    .map((region) => ({
      id: region.id,
      name: input.channelNames.get(region.channelId) ?? `Region ${region.id}`,
      outline: region.bounds.map((point): Point => [round(point.lat), round(point.lon)]),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  const gyms = input.gyms
    .flatMap((gym) => {
      const regionIds = [
        ...new Set(
          input.regionsOf(gym.id).flatMap((channelId) => {
            const id = byChannel.get(channelId);
            return id === undefined ? [] : [id];
          }),
        ),
      ].sort((a, b) => a - b);
      if (regionIds.length === 0) return [];
      return [
        {
          id: gym.id,
          name: gym.name,
          nickname: gym.nickname,
          lat: round(gym.lat),
          lon: round(gym.lon),
          regionIds,
          address: addressLine(gym.geodata) || null,
          description: gym.description,
          notice: gym.notice,
        },
      ];
    })
    .sort((a, b) => a.id - b.id);
  return { regions, gyms };
}
