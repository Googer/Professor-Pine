import { createHash } from 'node:crypto';
import { BoundedMap } from '../bounded-map.js';
import type { Gym } from '../db/repositories/gym-repository.js';
import type { Region } from '../db/repositories/region-repository.js';
import { geoView } from '../domain/web/geo-view.js';
import { REFUSED, type MayCost, type Refused } from '../services/costly.js';

/** How many servers' views are kept. */
const SERVERS = 100;

/** Where the view of a server is built from. */
export interface GeoSources {
  /** The row of a server (`Guild.id`), by which its regions say whose they are. */
  guilds: { idFor(snowflake: string): Promise<number | undefined> };
  /** The regions; `generation` changes with every load. */
  regions: { all(): readonly Region[]; readonly generation: number };
  /** The gyms; `generation` changes with every change. */
  gyms: { all(): Gym[]; regionsOf(gymId: number): string[]; readonly generation: number };
  /** The channels of a server as the bot sees them (`PartyGateway.serverChannels`). */
  channels: {
    serverChannels(guildId: string): readonly { id: string; name: string }[] | undefined;
  };
}

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
 * The public view of each server (`geoView`), built once and kept (spec 3.1): built anew when
 * the gyms or the regions changed (their generations) or a region's channel was renamed (the
 * names are read at each request, which costs a pass over the server's channels). The ETag is
 * the SHA-256 of the JSON, cut to 27 characters (160 bits). Building is the work that costs
 * (plan 8Z-2): `mayBuild` is asked right before it, never for a view that is kept, and
 * `REFUSED` is the answer where it says no.
 */
export class GeoCache {
  private readonly views = new BoundedMap<string, SentView & { key: string }>(SERVERS);

  constructor(private readonly sources: GeoSources) {}

  async view(guildId: string, mayBuild?: MayCost): Promise<SentView | Refused> {
    const { guilds, regions, gyms, channels } = this.sources;
    const row = await guilds.idFor(guildId);
    const own = row === undefined ? [] : regions.all().filter((region) => region.guildId === row);
    const known = new Map((channels.serverChannels(guildId) ?? []).map((c) => [c.id, c.name]));
    const channelNames = new Map(
      own.flatMap((region) => {
        const name = known.get(region.channelId);
        return name === undefined ? [] : [[region.channelId, name] as const];
      }),
    );
    const key = JSON.stringify([gyms.generation, regions.generation, row, [...channelNames]]);
    const kept = this.views.get(guildId);
    if (kept?.key === key) return kept;
    if (mayBuild !== undefined && !(await mayBuild())) return REFUSED;
    const body = JSON.stringify(
      geoView({
        regions: own,
        channelNames,
        gyms: own.length === 0 ? [] : gyms.all(),
        regionsOf: (id) => gyms.regionsOf(id),
      }),
    );
    const view = { key, body, etag: etagOf(body) };
    this.views.set(guildId, view);
    return view;
  }
}
