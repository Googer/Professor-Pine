import { createHash } from 'node:crypto';
import { BoundedMap } from '../bounded-map.js';
import type { Gym } from '../db/repositories/gym-repository.js';
import type { Region } from '../db/repositories/region-repository.js';
import { regionGate } from '../domain/history/region-tally.js';
import { geoView, publicRegions } from '../domain/web/geo-view.js';
import { REFUSED, type MayCost, type Refused } from '../services/costly.js';

/** How many servers' views are kept, of each kind. */
const SERVERS = 100;

/** Where the view of a server is built from. */
export interface GeoSources {
  /** The row of a server (`Guild.id`), by which its regions say whose they are. */
  guilds: { idFor(snowflake: string): Promise<number | undefined> };
  /** The regions; `generation` changes with every load. */
  regions: { all(): readonly Region[]; readonly generation: number };
  /** The gyms; `generation` changes with every change. */
  gyms: { all(): Gym[]; regionsOf(gymId: number): string[]; readonly generation: number };
  /** The channels of a server as the bot sees them, and who sees them (`PartyGateway`). */
  channels: {
    serverChannels(guildId: string): readonly { id: string; name: string }[] | undefined;
    /** Whether everybody in a gate's server can view it; a gate nothing is said of is left out. */
    everyoneViews(gateIds: readonly string[]): ReadonlyMap<string, boolean>;
  };
}

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
 * server can view (`publicRegions` over the gates as Discord has them now) and the gyms that lie
 * in those. Each is kept under its audience and never answers the other's question. A view is
 * built anew when the gyms or the regions changed (their generations), a region's channel was
 * renamed (the names are read at each request, which costs a pass over the server's channels)
 * or, the public one, when who views a region's gate changed (asked at each request, from the
 * cache). The ETag is the SHA-256 of the JSON, cut to 27 characters (160 bits). Building is the
 * work that costs (plan 8Z-2): `mayBuild` is asked right before it, never for a view that is
 * kept, and `REFUSED` is the answer where it says no.
 */
export class GeoCache {
  private readonly views = new BoundedMap<string, SentView & { key: string }>(2 * SERVERS);

  constructor(private readonly sources: GeoSources) {}

  async view(
    guildId: string,
    audience: GeoAudience,
    mayBuild?: MayCost,
  ): Promise<SentView | Refused> {
    const { guilds, regions, gyms, channels } = this.sources;
    const row = await guilds.idFor(guildId);
    const own = row === undefined ? [] : regions.all().filter((region) => region.guildId === row);
    const shown =
      audience === 'members'
        ? own
        : publicRegions(own, channels.everyoneViews(own.map(regionGate)));
    const known = new Map((channels.serverChannels(guildId) ?? []).map((c) => [c.id, c.name]));
    const channelNames = new Map(
      shown.flatMap((region) => {
        const name = known.get(region.channelId);
        return name === undefined ? [] : [[region.channelId, name] as const];
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
    if (mayBuild !== undefined && !(await mayBuild())) return REFUSED;
    const body = JSON.stringify(
      geoView({
        regions: shown,
        channelNames,
        gyms: shown.length === 0 ? [] : gyms.all(),
        regionsOf: (id) => gyms.regionsOf(id),
      }),
    );
    const view = { key, body, etag: etagOf(body) };
    this.views.set(slot, view);
    return view;
  }
}
