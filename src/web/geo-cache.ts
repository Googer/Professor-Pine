import { createHash } from 'node:crypto';
import { BoundedMap } from '../bounded-map.js';
import type { GymView } from '../services/gym-directory.js';
import type { Region } from '../db/repositories/region-repository.js';
import { regionGate } from '../domain/history/region-tally.js';
import type { GateLook } from '../domain/roles/region-roles.js';
import type { Roster } from '../domain/roles/self-roles.js';
import type { Logger } from '../log.js';
import { geoView, publicRegionName, publicRegions } from '../domain/web/geo-view.js';
import { REFUSED, type MayCost, type Refused } from '../services/costly.js';

/** How many servers' views are kept, of each kind. */
const SERVERS = 100;

/** Where the view of a server is built from. */
export interface GeoSources {
  /** The row of a server (`Guild.id`), by which its regions say whose they are. */
  guilds: { idFor(snowflake: string): Promise<number | undefined> };
  /** The regions; `generation` changes with every load. */
  regions: { all(): readonly Region[]; readonly generation: number };
  /**
   * The gyms per server (plan 19B-2): a server's map shows its own; `generation` changes with
   * every change.
   */
  gyms: {
    of(guildId: number | undefined): Pick<GymView, 'all' | 'regionsOf'>;
    readonly generation: number;
  };
  /** The channels of a server as the bot sees them, and who sees them (`PartyGateway`). */
  channels: {
    serverChannels(guildId: string): readonly { id: string; name: string }[] | undefined;
    /** How everybody in a gate's server stands to it, and with roles; a gate nothing is said of is left out. */
    everyoneGates(gateIds: readonly string[]): GateLook;
  };
  /**
   * The roles members give themselves (`SelfRoleService`); undefined where roles are off: the
   * public view is then what everybody views. `generation` changes with staff's every change.
   */
  roles?:
    | {
        roster(guildId: string, remember: 'aside'): Promise<Roster | undefined>;
        readonly generation: number;
        /**
         * Whether a server's members give themselves roles (its `features.roles`, plan 19A-1):
         * part of what its public regions were decided on (review F8), so that turning them off
         * or on is seen at the next build. Not said: yes.
         */
        usedIn?(guildId: string): boolean;
      }
    | undefined;
  /**
   * What a region's forum adds to its channel's name (the server's `regionForumSuffix`, plan
   * 19A-1), left off the forum's name in the public view (`publicRegionName`).
   */
  forumSuffix(guildId: string): string;
}

/**
 * How long the public regions of a server are kept before Discord and the roster are asked
 * again (F-B10): a gate opened or closed on Discord shows on the public map within a minute.
 */
export const PUBLIC_REGIONS_KEPT_MS = 60_000;

/**
 * Whose view of a server's map (plan 8Z-2, Matt's ruling 8): a member's holds every region; the
 * public one, for anybody else (a visitor who is not logged in, somebody logged in who is no
 * member of the server), only the regions everybody in the server can view (`publicRegions`).
 */
export type GeoAudience = 'members' | 'public';

/** A view as it is sent: its JSON and the strong ETag of that JSON. */
export interface SentView {
  body: string;
  etag: string;
}

/** The strong ETag of a JSON body: its SHA-256, cut to 27 characters (160 bits). */
export function etagOf(body: string): string {
  return `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`;
}

/**
 * Whether an `If-None-Match` names this ETag (RFC 9110, 13.1.2): a list of tags, compared weakly
 * (`W/` ignored), or `*` for any.
 */
export function etagMatches(header: string | string[] | undefined, etag: string): boolean {
  if (header === undefined) return false;
  const opaque = (tag: string): string => tag.trim().replace(/^W\//, '');
  const wanted = opaque(etag);
  return [header]
    .flat()
    .flatMap((value) => value.split(','))
    .some((tag) => tag.trim() === '*' || opaque(tag) === wanted);
}

/**
 * The views of each server (`geoView`), built once and kept (spec 3.1), two per server (plan
 * 8Z-2): the members', of every region, and the public one, of the regions everybody in the
 * server can view or can open with one role they give themselves (`publicRegions`) and the gyms that lie
 * in those, each named by its gate (F-B1: the text channel of a region whose forum is public may
 * not be). Each is kept under its audience and never answers the other's question. A view is
 * built anew when the gyms or the regions changed (their generations), a region's channel was
 * renamed (the names are read at each request, which costs a pass over the server's channels)
 * or, the public one, when the regions it holds changed. Which those are (`publicRegions`: those
 * everybody views, or one self-assignable role opens, F-B10) is decided once a minute per server
 * (`PUBLIC_REGIONS_KEPT_MS`: `regionChoices` over the roster weighs every role against every
 * gate, too much for each request), and at once after the regions load or staff change the
 * roster (their generations); a roster that cannot be read counts as none for that minute (only
 * what everybody views), and lookers that arrive while it is read share the one read. The ETag
 * is the SHA-256 of the JSON, cut to 27 characters (160 bits). Building is the work that costs
 * (plan 8Z-2): `mayBuild` is asked right before it, never for a view that is kept, and
 * `REFUSED` is the answer where it says no.
 */
export class GeoCache {
  private readonly views = new BoundedMap<string, SentView & { key: string }>(2 * SERVERS);
  /** Per server, the ids of its public regions, when they were decided and of what. */
  private readonly opened = new BoundedMap<
    string,
    { at: number; key: string; ids: ReadonlySet<number> }
  >(SERVERS);
  /** Per audience and server, the view being built, and of what. */
  private readonly building = new Map<string, { key: string; view: Promise<SentView | Refused> }>();
  /** Per server, the decision on its way. */
  private readonly deciding = new Map<string, Promise<ReadonlySet<number>>>();
  private readonly now: () => number;
  private readonly log: Logger | undefined;

  constructor(
    private readonly sources: GeoSources,
    options: { now?: () => number; log?: Logger } = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.log = options.log;
  }

  async view(
    guildId: string,
    audience: GeoAudience,
    mayBuild?: MayCost,
  ): Promise<SentView | Refused> {
    const { guilds, regions, gyms, channels } = this.sources;
    const row = await guilds.idFor(guildId);
    const own = row === undefined ? [] : regions.all().filter((region) => region.guildId === row);
    let shown = own;
    if (audience === 'public') {
      const open = own.length === 0 ? new Set<number>() : await this.publicIds(guildId, own);
      shown = own.filter((region) => open.has(region.id));
    }
    const known = new Map((channels.serverChannels(guildId) ?? []).map((c) => [c.id, c.name]));
    // Named, for the public, by the gate that let the region in (F-B1): its text channel may be
    // one the public cannot view; a forum without its ending (`publicRegionName`). Kept under the
    // text channel, by which the view finds names.
    const channelNames = new Map(
      shown.flatMap((region) => {
        if (audience === 'members') {
          const name = known.get(region.channelId);
          return name === undefined ? [] : [[region.channelId, name] as const];
        }
        const name = known.get(regionGate(region));
        return name === undefined
          ? []
          : [
              [
                region.channelId,
                publicRegionName(region, name, this.sources.forumSuffix(guildId)),
              ] as const,
            ];
      }),
    );
    const key = JSON.stringify([
      gyms.generation,
      regions.generation,
      row,
      [...channelNames],
      // Which regions the audience is shown: all for members, so nothing to tell them apart by.
      audience === 'members' ? null : shown.map((region) => region.id),
    ]);
    const slot = `${audience}:${guildId}`;
    const kept = this.views.get(slot);
    if (kept?.key === key) return kept;
    // Asked again while it is built (F-B3): the same build, counted once, its answer (a refusal
    // too) shared; forgotten once it settled.
    const running = this.building.get(slot);
    if (running?.key === key) return running.view;
    const building = (async (): Promise<SentView | Refused> => {
      if (mayBuild !== undefined && !(await mayBuild())) return REFUSED;
      const body = JSON.stringify(
        geoView({
          regions: shown,
          channelNames,
          gyms: shown.length === 0 ? [] : gyms.of(row).all(),
          regionsOf: (id) => gyms.of(row).regionsOf(id),
        }),
      );
      const view = { key, body, etag: etagOf(body) };
      this.views.set(slot, view);
      return view;
    })().finally(() => {
      if (this.building.get(slot)?.view === building) this.building.delete(slot);
    });
    this.building.set(slot, { key, view: building });
    return building;
  }

  /** The ids of a server's public regions, as decided within the minute (`publicRegions`). */
  private publicIds(guildId: string, own: readonly Region[]): Promise<ReadonlySet<number>> {
    const { regions, channels, roles } = this.sources;
    const key = JSON.stringify([
      regions.generation,
      roles?.generation ?? null,
      roles?.usedIn?.(guildId) ?? roles !== undefined,
    ]);
    const kept = this.opened.get(guildId);
    if (kept?.key === key && this.now() - kept.at < PUBLIC_REGIONS_KEPT_MS) {
      return Promise.resolve(kept.ids);
    }
    const running = this.deciding.get(guildId);
    if (running) return running;
    const deciding = (async (): Promise<ReadonlySet<number>> => {
      let roster: Roster | undefined;
      try {
        roster = await roles?.roster(guildId, 'aside');
      } catch (err) {
        // Only what everybody views, until the minute is over.
        this.log?.warn(
          { err, guild: guildId },
          'could not read the self-assignable roles for the map',
        );
      }
      const ids = new Set(
        publicRegions(own, channels.everyoneGates(own.map(regionGate)), roster).map(
          (region) => region.id,
        ),
      );
      this.opened.set(guildId, { at: this.now(), key, ids });
      return ids;
    })().finally(() => this.deciding.delete(guildId));
    this.deciding.set(guildId, deciding);
    return deciding;
  }
}
