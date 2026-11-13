import type { Gym } from '../db/repositories/gym-repository.js';
import type { Region } from '../db/repositories/region-repository.js';
import { metresBetween } from '@pine/wayspot-core/distance';
import { addressLine, geodataParts } from '../domain/geo/google.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import {
  cutWhole,
  MAX_PLACE_TITLE,
  PIN_NEAR_METRES,
  type DroppedPin,
} from '../domain/geo/place.js';
import { ringContains } from '@pine/wayspot-core/region-membership';
import {
  clearPlace,
  extraWords,
  guessRank,
  mergePlaces,
  placeFit,
  placeFitBy,
  type PlaceFit,
  type PlaceHit,
  type PlaceKind,
} from '../domain/search/place-merge.js';
import { anchorMetres, nearestPlaces } from '../domain/search/nearest.js';
import { firstWords } from '../domain/search/text.js';
import { streetOf, WayspotIndex } from '../domain/search/wayspot-index.js';
import type { WayspotPlaces } from './wayspot-places.js';
import type { Wayspot } from '../domain/wayspots/kept.js';
import type { Logger } from '../log.js';
import type { GymDirectory } from './gym-directory.js';
import type { WayspotProvider } from './wayspot-directory.js';

/**
 * A gym, PokéStop or power spot a member may name (`/wild near:`; plan 8W-2), as a choice: its
 * kind and id (a gym's number as text, a Wayspot's Wayfarer id), its title, where it is (its
 * street, or "near <the nearest gym>"; undefined when neither is known), how well it fit what
 * was typed, whether it lies in the member's region, its place and its picture.
 */
export interface PlaceChoice {
  kind: PlaceKind;
  id: string;
  title: string;
  where: string | undefined;
  fit: PlaceFit;
  local: boolean;
  point: LatLon;
  image: string | null;
  /**
   * Its address as one line (a gym's `addressLine`, a Wayspot's `WayspotProvider.addressOf`); empty
   * for none.
   */
  address: string;
}

/** A choice's value in an autocomplete list: `<kind>:<id>` (at most 51 characters). */
export function placeValue(choice: Pick<PlaceChoice, 'kind' | 'id'>): string {
  return `${choice.kind}:${choice.id}`;
}

const KINDS: ReadonlySet<string> = new Set<PlaceKind>(['gym', 'stop', 'powerspot']);

/**
 * A choice's value read back; undefined for text that is none (what a member typed). The id is a
 * gym's number, a Wayfarer id, or a stop of Pine's own (`pine-<id>`, plan 8R-1).
 */
export function readPlaceValue(text: string): { kind: PlaceKind; id: string } | undefined {
  const match = /^(gym|stop|powerspot):([0-9a-f.]{1,40}|pine-[1-9]\d{0,9})$/u.exec(text);
  if (!match || !KINDS.has(match[1]!)) return undefined;
  return { kind: match[1] as PlaceKind, id: match[2]! };
}

export interface PlaceFinderOptions {
  /** The gyms (`GymDirectory`): a server's are searched, and named as what a Wayspot is near. */
  gyms: Pick<GymDirectory, 'of'>;
  /** The kept Wayspots: their indexes are built anew after every change of what they are. */
  wayspots: WayspotProvider;
  /**
   * The places Google gave around the stops and Power Spots (plan 8W-6, `WayspotPlaces`), found
   * as their gyms' places are; the indexes are built anew when it tells of new ones. Without it
   * a Wayspot has none.
   */
  places?: Pick<WayspotPlaces, 'placesOf' | 'generation' | 'whenChanged'>;
  regions: { all(): readonly Region[] };
  log: Logger;
}

/** How many choices are told where they are (an autocomplete list has 25). */
const DESCRIBED = 25;

/** A place without a street is "near" the server's nearest gym at most this far away. */
export const NEAR_GYM_METRES = 1_000;

/** Every kind of place a search or a pin may name. */
export const ALL_PLACE_KINDS: readonly PlaceKind[] = ['gym', 'stop', 'powerspot'];

/** The kinds a meetup may be near (Matt, 2026-10-17): power spots are poorly curated. */
export const MEETUP_PLACE_KINDS: readonly PlaceKind[] = ['gym', 'stop'];

interface Indexes {
  /** The Wayspots' `contentGeneration` they were built at. */
  generation: number;
  /** The places' `generation` they were built at. */
  placesGeneration: number;
  stop: WayspotIndex<Wayspot>;
  powerspot: WayspotIndex<Wayspot>;
}

/** What is searched before the first build: no stop or power spot. */
const NO_INDEXES: Indexes = {
  generation: -1,
  placesGeneration: -1,
  stop: new WayspotIndex<Wayspot>([]),
  powerspot: new WayspotIndex<Wayspot>([]),
};

/**
 * Gyms, PokéStops and power spots of a server by what a member types (Matt, 2026-10-15, "Search
 * over stops and power spots"): the server's gyms through the gym search, the stops and power
 * spots each through an index of their own, merged by `mergePlaces`. Only what lies in a region
 * of the server is offered. The indexes are built from `WayspotDirectory` after every change of
 * what the Wayspots are (`contentGeneration`: a load), in a turn of their own (about a second
 * for a city), never inside a search: until then a search answers from what was built (at first
 * nothing: the gyms alone). A Wayspot forgotten (it became a gym) is passed over at once: a
 * search takes only what the directory's regions hold now.
 */
export class PlaceFinder {
  private indexes: Indexes = NO_INDEXES;
  private building: Promise<void> | undefined;

  constructor(private readonly options: PlaceFinderOptions) {
    options.wayspots.whenChanged(() => {
      this.schedule();
    });
    options.places?.whenChanged(() => {
      this.schedule();
    });
    this.schedule();
  }

  /** Resolves once the build that waits, if any, is done. */
  built(): Promise<void> {
    return this.building ?? Promise.resolve();
  }

  /**
   * Every place of the server that fits the text, in the merged order; of the `kinds` given only
   * (a meetup is never at a power spot: Matt, 2026-10-17), every kind without. `kindsFirst`
   * offers those kinds first among places that fit as well (`mergePlaces`; plan 8X-4). `anchors`,
   * the places named before (the other stops of `/research`, a train's last stop), offer the
   * nearer of places that fit alike first (`PlaceHit.distance`; Matt, 2026-10-27). A long text
   * goes by its first words (`firstWords`), for how each hit fits it too.
   */
  find(
    guildId: number,
    regionChannelId: string | undefined,
    typed: string,
    kinds: readonly PlaceKind[] = ALL_PLACE_KINDS,
    order: { kindsFirst?: readonly PlaceKind[]; anchors?: readonly LatLon[] } = {},
  ): PlaceChoice[] {
    const text = firstWords(typed);
    const { kindsFirst, anchors = [] } = order;
    const channels = this.channelsOf(guildId);
    if (channels.size === 0) return [];
    const { wayspots } = this.options;
    // The server's gyms (plan 19B-2): another server's gym is never found, offered or named.
    const gyms = this.options.gyms.of(guildId);
    const local = (regions: readonly string[]): boolean =>
      regionChannelId !== undefined && regions.includes(regionChannelId);
    const ours = (regions: readonly string[]): boolean =>
      regions.some((channelId) => channels.has(channelId));
    const serverGyms = this.gymsOf(guildId, channels);
    const hits: PlaceHit<PlaceChoice>[] = [];
    // Only the server's gyms: a gym elsewhere with every word would leave no room for guesses.
    const gymHits = kinds.includes('gym')
      ? gyms.search(null, text, { within: new Set(serverGyms.keys()) })
      : [];
    for (const hit of gymHits) {
      const regions = gyms.regionsOf(hit.gym.id);
      if (!ours(regions)) continue;
      const { fit, name } = placeFitBy(text, [hit.gym.name, hit.gym.nickname], hit);
      hits.push({
        item: gymChoice(hit.gym, fit, local(regions)),
        kind: 'gym',
        title: hit.gym.name,
        fit,
        local: local(regions),
        score: hit.score,
        extra: extraWords(text, name ?? hit.gym.name),
        guess: guessRank(hit),
        distance: anchorMetres(hit.gym, anchors),
      });
    }
    const { indexes } = this;
    for (const kind of ['stop', 'powerspot'] as const) {
      if (!kinds.includes(kind)) continue;
      const within = new Set<string>();
      for (const channelId of channels) {
        for (const wayspot of wayspots.inRegion(channelId)) {
          // A Wayspot called nothing is no place to name (its street alone would find it).
          if (wayspot.kind === kind && wayspot.title.trim() !== '') within.add(wayspot.id);
        }
      }
      for (const match of indexes[kind].search(text, { within })) {
        const regions = wayspots.regionsOf(match.wayspot.id);
        const fit = placeFit(text, [match.wayspot.title], match);
        hits.push({
          item: wayspotChoice(this.options.wayspots, match.wayspot, fit, local(regions)),
          kind,
          title: match.wayspot.title,
          fit,
          local: local(regions),
          score: match.score,
          extra: extraWords(text, match.wayspot.title),
          guess: guessRank(match),
          distance: anchorMetres(match.wayspot, anchors),
        });
      }
    }
    return mergePlaces(hits, kindsFirst).map((hit, index) =>
      index < DESCRIBED ? described(hit.item, serverGyms) : hit.item,
    );
  }

  /**
   * The places of the server of the `kinds` given nearest the anchors (`nearestPlaces`; Matt,
   * 2026-10-27: an empty `/research` stop option and `/route add stop:` list them), each with its
   * distance to the nearest anchor: nearest first, within `within` meters, `count` at most, those
   * whose value (`placeValue`) is in `except` left out (the places named already). Only one
   * called something; each told where it is. Nothing without an anchor. The places are measured
   * as they are kept, and only those listed are made choices (a city's thousands of gyms and
   * Wayspots would hold up the bot for every list).
   */
  nearest(
    guildId: number,
    kinds: readonly PlaceKind[],
    anchors: readonly LatLon[],
    options: { within?: number; count?: number; except?: ReadonlySet<string> },
  ): { choice: PlaceChoice; metres: number }[] {
    if (anchors.length === 0) return [];
    const channels = this.channelsOf(guildId);
    const serverGyms = this.gymsOf(guildId, channels);
    type Raw = { gym: Gym; wayspot?: never } | { wayspot: Wayspot; gym?: never };
    const places = new Map<string, Raw>();
    const add = (value: string, raw: Raw): void => {
      if (!options.except?.has(value)) places.set(value, raw);
    };
    if (kinds.includes('gym')) {
      for (const gym of serverGyms.values()) {
        add(placeValue({ kind: 'gym', id: String(gym.id) }), { gym });
      }
    }
    for (const channelId of channels) {
      for (const wayspot of this.options.wayspots.inRegion(channelId)) {
        // A Wayspot called nothing is no place to name (`find`).
        if (kinds.includes(wayspot.kind) && wayspot.title.trim() !== '') {
          add(placeValue(wayspot), { wayspot });
        }
      }
    }
    return nearestPlaces(places.values(), anchors, {
      pointOf: (raw) => raw.gym ?? raw.wayspot,
      nameOf: (raw) => (raw.gym ? raw.gym.name : raw.wayspot.title),
      ...(options.within === undefined ? {} : { within: options.within }),
      ...(options.count === undefined ? {} : { count: options.count }),
    }).map(({ item, metres }) => ({
      choice: described(
        item.gym
          ? gymChoice(item.gym, 'exact', false)
          : wayspotChoice(this.options.wayspots, item.wayspot, 'exact', false),
        serverGyms,
      ),
      metres,
    }));
  }

  /** The place a choice's value names, if it lies in a region of the server. */
  chosen(guildId: number, value: string): PlaceChoice | undefined {
    const read = readPlaceValue(value);
    if (!read) return undefined;
    const channels = this.channelsOf(guildId);
    const ours = (regions: readonly string[]): boolean =>
      regions.some((channelId) => channels.has(channelId));
    if (read.kind === 'gym') {
      const gym = /^\d+$/u.test(read.id)
        ? this.options.gyms.of(guildId).get(Number(read.id))
        : undefined;
      if (!gym || !ours(this.options.gyms.of(guildId).regionsOf(gym.id))) return undefined;
      return described(gymChoice(gym, 'exact', false), this.gymsOf(guildId, channels));
    }
    const wayspot = this.options.wayspots.byId(read.id);
    if (
      wayspot?.kind !== read.kind ||
      wayspot.title.trim() === '' ||
      !ours(this.options.wayspots.regionsOf(wayspot.id))
    ) {
      return undefined;
    }
    return described(
      wayspotChoice(this.options.wayspots, wayspot, 'exact', false),
      this.gymsOf(guildId, channels),
    );
  }

  /**
   * A pin at `point` (a member's maps link or coordinates), named by the nearest of the server's
   * gyms and the kept PokéStops and power spots within `PIN_NEAR_METRES`, with the name its link
   * gave; undefined when the point lies in no region of the server. Named only by a place of the
   * `kinds` given (every kind without): a meetup's pin is never named by a power spot.
   */
  pin(
    guildId: number,
    point: LatLon,
    linkName: string | null,
    kinds: readonly PlaceKind[] = ALL_PLACE_KINDS,
  ): DroppedPin | undefined {
    const regions = this.options.regions
      .all()
      .filter((region) => region.guildId === guildId && region.bounds !== null);
    if (!regions.some((region) => region.bounds && ringContains(region.bounds, point))) {
      return undefined;
    }
    const channels = new Set(regions.map((region) => region.channelId));
    let near: { kind: PlaceKind; title: string; metres: number } | undefined;
    for (const gym of kinds.includes('gym') ? this.gymsOf(guildId, channels).values() : []) {
      // As a post names it: by its nickname, when it has one.
      const title = (gym.nickname || gym.name).trim();
      const metres = metresBetween(point, gym);
      if (title !== '' && metres <= PIN_NEAR_METRES && (!near || metres < near.metres)) {
        near = { kind: 'gym', title, metres };
      }
    }
    // Only the server's own, as `find` offers them, and only one that is called something.
    const { wayspots } = this.options;
    const spot = wayspots
      .near(
        point,
        PIN_NEAR_METRES,
        (['stop', 'powerspot'] as const).filter((kind) => kinds.includes(kind)),
      )
      .find(
        ({ wayspot }) =>
          wayspot.title.trim() !== '' &&
          wayspots.regionsOf(wayspot.id).some((channelId) => channels.has(channelId)),
      );
    if (spot && (!near || spot.metres < near.metres)) {
      near = {
        kind: spot.wayspot.kind,
        title: spot.wayspot.title,
        metres: spot.metres,
      };
    }
    return {
      kind: 'pin',
      lat: point.lat,
      lon: point.lon,
      // Kept to what its state takes, never half of an emoji.
      near: near ? { kind: near.kind, title: cutWhole(near.title, MAX_PLACE_TITLE) } : null,
      linkName,
    };
  }

  /**
   * The nearest kept power spot of the server's regions within `PIN_NEAR_METRES` of a point, as a
   * choice (plan 8X-3: a maps link or coordinates given to `/max` is the power spot there, else a
   * pin, "Unlisted power spot"); only one called something. Undefined when there is none.
   */
  nearestPowerSpot(guildId: number, point: LatLon): PlaceChoice | undefined {
    return this.nearestOf(guildId, point, 'powerspot');
  }

  /**
   * The nearest kept PokéStop (a stop of Pine's own among them) of the server's regions within
   * `PIN_NEAR_METRES` of a point, as a choice (plan 8R-1: a maps link or coordinates given to
   * `/research` is the stop there); only one called something. Undefined when there is none.
   */
  nearestStop(guildId: number, point: LatLon): PlaceChoice | undefined {
    return this.nearestOf(guildId, point, 'stop');
  }

  private nearestOf(
    guildId: number,
    point: LatLon,
    kind: 'stop' | 'powerspot',
  ): PlaceChoice | undefined {
    const channels = this.channelsOf(guildId);
    const { wayspots } = this.options;
    const spot = wayspots
      .near(point, PIN_NEAR_METRES, [kind])
      .find(
        ({ wayspot }) =>
          wayspot.title.trim() !== '' &&
          wayspots.regionsOf(wayspot.id).some((channelId) => channels.has(channelId)),
      );
    return (
      spot &&
      described(
        wayspotChoice(this.options.wayspots, spot.wayspot, 'exact', false),
        this.gymsOf(guildId, channels),
      )
    );
  }

  /**
   * Whether the server's regions hold a PokéStop called something (plan 8R-1: `/research` where
   * none is known says how staff add them).
   */
  hasStops(guildId: number): boolean {
    for (const channelId of this.channelsOf(guildId)) {
      if (
        this.options.wayspots
          .inRegion(channelId)
          .some((wayspot) => wayspot.kind === 'stop' && wayspot.title.trim() !== '')
      ) {
        return true;
      }
    }
    return false;
  }

  /** The channels of the server's regions with an outline. */
  private channelsOf(guildId: number): Set<string> {
    return new Set(
      this.options.regions
        .all()
        .filter((region) => region.guildId === guildId && region.bounds !== null)
        .map((region) => region.channelId),
    );
  }

  /** The server's gyms in these regions of it, by id. */
  private gymsOf(guildId: number, channels: ReadonlySet<string>): Map<number, Gym> {
    const gyms = this.options.gyms.of(guildId);
    const found = new Map<number, Gym>();
    for (const channelId of channels) {
      for (const gym of gyms.inRegion(channelId)) found.set(gym.id, gym);
    }
    return found;
  }

  /** Builds the indexes in a turn of their own, once for any number of changes before it. */
  private schedule(): void {
    if (this.building) return;
    this.building = new Promise((resolve) => {
      setImmediate(() => {
        this.building = undefined;
        try {
          this.build();
        } catch (err) {
          this.options.log.error({ err }, 'could not build the search of the Wayspots');
        }
        resolve();
      });
    });
  }

  /** The indexes of the stops and power spots, built anew when what the Wayspots are changed. */
  private build(): void {
    const { wayspots, places, log } = this.options;
    const generation = wayspots.contentGeneration;
    const placesGeneration = places?.generation ?? 0;
    if (
      this.indexes.generation === generation &&
      this.indexes.placesGeneration === placesGeneration
    ) {
      return;
    }
    const started = performance.now();
    const all = wayspots.all();
    const stops = all.filter((wayspot) => wayspot.kind === 'stop');
    const spots = all.filter((wayspot) => wayspot.kind === 'powerspot');
    const placesOf = (id: string): string | null => places?.placesOf(id) ?? null;
    this.indexes = {
      generation,
      placesGeneration,
      stop: new WayspotIndex(stops, placesOf),
      powerspot: new WayspotIndex(spots, placesOf),
    };
    log.info(
      {
        stops: stops.length,
        powerspots: spots.length,
        ms: Math.round(performance.now() - started),
      },
      'the search of the Wayspots was built',
    );
  }
}

/**
 * The place typed text means beyond doubt (`clearPlace`), of what `find` gave for it, or
 * undefined.
 */
export function clearOf(found: readonly PlaceChoice[]): PlaceChoice | undefined {
  return clearPlace(
    found.map((item) => ({
      item,
      kind: item.kind,
      title: item.title,
      fit: item.fit,
      local: item.local,
      score: 0,
    })),
  )?.item;
}

function gymChoice(gym: Gym, fit: PlaceFit, local: boolean): PlaceChoice {
  return {
    kind: 'gym',
    id: String(gym.id),
    title: gym.name,
    where: geodataParts(gym.geodata).find((part) => part.type === 'route')?.value,
    fit,
    local,
    point: { lat: gym.lat, lon: gym.lon },
    image: gym.imageUrl,
    address: addressLine(gym.geodata),
  };
}

/**
 * A choice told where it is: without a street, "near" the nearest of the server's gyms (but
 * itself) within `NEAR_GYM_METRES`; with none so near, nothing.
 */
function described(choice: PlaceChoice, gyms: ReadonlyMap<number, Gym>): PlaceChoice {
  if (choice.where !== undefined) return choice;
  let nearest: { gym: Gym; metres: number } | undefined;
  for (const gym of gyms.values()) {
    if (choice.kind === 'gym' && String(gym.id) === choice.id) continue;
    const metres = metresBetween(choice.point, gym);
    if (metres <= NEAR_GYM_METRES && (!nearest || metres < nearest.metres)) {
      nearest = { gym, metres };
    }
  }
  return nearest ? { ...choice, where: `near ${nearest.gym.name}` } : choice;
}

function wayspotChoice(
  wayspots: Pick<WayspotProvider, 'addressOf'>,
  wayspot: Wayspot,
  fit: PlaceFit,
  local: boolean,
): PlaceChoice {
  return {
    kind: wayspot.kind,
    id: wayspot.id,
    title: wayspot.title,
    where: streetOf(wayspot.address),
    fit,
    local,
    point: { lat: wayspot.lat, lon: wayspot.lon },
    image: wayspot.image,
    address: wayspots.addressOf(wayspot),
  };
}
