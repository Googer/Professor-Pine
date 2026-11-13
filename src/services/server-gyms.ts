import { gymsByRegion } from '@pine/wayspot-core/region-membership';
import { BoundedMap } from '../bounded-map.js';
import type { Gym } from '../db/repositories/gym-repository.js';
import type { GymLink } from '../domain/gyms/gym-server.js';
import {
  GymLookup,
  type GymHit,
  type GymLookupOptions,
  type RegionOutline,
} from '../domain/search/gym-lookup.js';

/**
 * As many servers' indexes as are kept built: far more than one installation serves; one that
 * went is built again when its server asks.
 */
export const MAX_SERVER_VIEWS = 200;

/**
 * A server's gyms (plan 19B-2): exactly the gyms linked to the server (`GymServer`), placed in
 * the server's regions only, searched with the words the server's search ignores. A gym of
 * another server is not there, wherever it lies. Every gym id a member gives (an option, a typed
 * number, a custom id's argument, a web route) is read through the view of the server it came
 * from.
 *
 * A view is what the server's gyms were when it was asked for: ask for it again (`of`) after an
 * await, never keep one. A gym changed, linked or unlinked meanwhile is followed in the views
 * kept, but a view can be dropped (at most `MAX_SERVER_VIEWS` are kept) or replaced (a load of
 * the regions, a change of the server's words), and one kept from before is then out of date.
 */
export interface GymView {
  /** The server's gym with this id; undefined for none, and for another server's. */
  get(id: number): Gym | undefined;
  /** The server's gyms, in no particular order (a new list). */
  all(): Gym[];
  /** Whether the channel is a region of the server with an outline. */
  isRegion(channelId: string): boolean;
  /** Channel ids of the server's regions the gym lies in; none for a gym not the server's. */
  regionsOf(gymId: number): string[];
  /** The server's gyms in the server's region of this channel, in no particular order. */
  inRegion(channelId: string): Gym[];
  /**
   * The server's gyms matching the text, best first (`GymLookup.search`): from a region channel
   * of the server, that region's own gyms then those just outside it; from any other channel,
   * or with null, all of the server's gyms.
   */
  search(channelId: string | null, text: string, options?: GymLookupOptions): GymHit<Gym>[];
}

/** A region as a server's view needs it: its outline and the server it belongs to. */
export interface ServerRegion extends RegionOutline {
  guildId: number | null;
}

/** The view of a server that has no row, or no gyms: nothing. */
const NO_GYMS: GymView = new GymLookup<Gym>([], []);

interface BuiltView {
  lookup: GymLookup<Gym>;
  /** The ignored words it was built with, as the server's settings gave them. */
  words: readonly string[];
}

function sameWords(a: readonly string[], b: readonly string[]): boolean {
  return a === b || (a.length === b.length && a.every((word, index) => word === b[index]));
}

/**
 * Every gym and every link, held in memory, giving a view per server (`of`): its own index,
 * built when the server first asks and built anew when its ignored words change (`wordsOf`, read
 * at every ask); a gym changed or linked anew is put in or taken out of every view built
 * (`put`, `remove`). A change of the regions is a new `ServerGyms` (`GymDirectory.load`). At most
 * `maxViews` views are kept, the one asked for longest ago going first.
 *
 * `stored(id)` reads a gym by its id whoever it belongs to: for a reference a server stored when
 * the gym was its own (a party's gym, a history row, a saved route's stop), never for an id a
 * member gives.
 */
export class ServerGyms {
  private readonly gyms = new Map<number, Gym>();
  /** The servers of each gym, by gym. */
  private readonly links = new Map<number, Set<number>>();
  /** The gyms of each server, by server: a view is built from its server's gyms alone. */
  private readonly linked = new Map<number, Set<number>>();
  private readonly regionsOf = new Map<number, ServerRegion[]>();
  private readonly views: BoundedMap<number, BuiltView>;
  /** How many views were built: for tests. */
  built = 0;

  constructor(
    gyms: Iterable<Gym>,
    links: Iterable<GymLink>,
    regions: readonly ServerRegion[],
    private readonly wordsOf: (guildId: number) => readonly string[],
    options: { maxViews?: number } = {},
  ) {
    for (const gym of gyms) this.gyms.set(gym.id, gym);
    for (const { gymId, guildId } of links) {
      if (this.gyms.has(gymId)) this.link(gymId, guildId);
    }
    for (const region of regions) {
      if (region.guildId === null) continue;
      this.regionsOf.set(region.guildId, [...(this.regionsOf.get(region.guildId) ?? []), region]);
    }
    this.views = new BoundedMap(options.maxViews ?? MAX_SERVER_VIEWS);
  }

  get size(): number {
    return this.gyms.size;
  }

  /** The gyms of a server (its `Guild` row); a server without one has none. */
  of(guildId: number | undefined): GymView {
    if (guildId === undefined) return NO_GYMS;
    const words = this.wordsOf(guildId);
    const kept = this.views.get(guildId);
    if (kept && sameWords(kept.words, words)) {
      // Asked for again: the newest, so that the views of servers that ask go last.
      this.views.set(guildId, kept);
      return kept.lookup;
    }
    // The server's gyms alone: a view costs what the server has, not what the instance has.
    const linked = [...(this.linked.get(guildId) ?? [])].flatMap((id) => {
      const gym = this.gyms.get(id);
      return gym ? [gym] : [];
    });
    const lookup = new GymLookup(linked, this.regionsOf.get(guildId) ?? [], words);
    this.built += 1;
    this.views.set(guildId, { lookup, words });
    return lookup;
  }

  /** A gym by its id, whichever servers it belongs to: for a stored reference only. */
  stored(id: number): Gym | undefined {
    return this.gyms.get(id);
  }

  /** The servers a gym belongs to, in order; none for a gym there is not. */
  serversOf(gymId: number): number[] {
    return [...(this.links.get(gymId) ?? [])].sort((a, b) => a - b);
  }

  /**
   * Channel ids of a server's regions one of its gyms lies in, as its view's `regionsOf` gives
   * them (the one rule, `gymsByRegion`, asked of this gym alone), without building or touching a
   * view: for the instance's upkeep, which asks it of every gym of every server (the Google
   * line's ranks). None for a gym the server does not have.
   */
  regionsIn(guildId: number, gymId: number): string[] {
    const gym = this.gyms.get(gymId);
    if (!gym || !this.links.get(gymId)?.has(guildId)) return [];
    return [...gymsByRegion(this.regionsOf.get(guildId) ?? [], [gym])]
      .filter(([, membership]) => membership.local.has(gymId))
      .map(([channelId]) => channelId);
  }

  /** Every gym of every server, in no particular order (a new list): the instance's upkeep. */
  all(): Gym[] {
    return [...this.gyms.values()];
  }

  /** Adds or replaces a gym with the servers it belongs to now, in every view built. */
  put(gym: Gym, servers: Iterable<number>): void {
    const linked = new Set(servers);
    this.gyms.set(gym.id, gym);
    for (const guildId of this.links.get(gym.id) ?? []) {
      if (!linked.has(guildId)) this.linked.get(guildId)?.delete(gym.id);
    }
    this.links.delete(gym.id);
    for (const guildId of linked) this.link(gym.id, guildId);
    for (const guildId of this.views.keys()) {
      const view = this.views.get(guildId);
      if (linked.has(guildId)) view?.lookup.put(gym);
      else view?.lookup.remove(gym.id);
    }
  }

  /** Takes a gym out of every view. False when there was no such gym. */
  remove(id: number): boolean {
    const known = this.gyms.delete(id);
    for (const guildId of this.links.get(id) ?? []) this.linked.get(guildId)?.delete(id);
    this.links.delete(id);
    for (const guildId of this.views.keys()) this.views.get(guildId)?.lookup.remove(id);
    return known;
  }

  /** Records that a server has a gym, both ways. */
  private link(gymId: number, guildId: number): void {
    const servers = this.links.get(gymId) ?? new Set<number>();
    servers.add(guildId);
    this.links.set(gymId, servers);
    const gyms = this.linked.get(guildId) ?? new Set<number>();
    gyms.add(gymId);
    this.linked.set(guildId, gyms);
  }
}
