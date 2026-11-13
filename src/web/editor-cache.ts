import { createHash } from 'node:crypto';
import { BoundedMap } from '../bounded-map.js';
import type { GymView } from '../services/gym-directory.js';
import type { Region } from '../db/repositories/region-repository.js';
import type { ServerChannel } from '../domain/regions/region-import.js';
import type { Wayspot } from '../domain/wayspots/kept.js';
import { editorView } from '../domain/web/editor-view.js';
import type { SentView } from './geo-cache.js';

/** How many servers' views are kept. */
const SERVERS = 20;

/** Where the editor's view of a server is built from. */
export interface EditorSources {
  /** The row of a server (`Guild.id`). */
  guilds: { idFor(snowflake: string): Promise<number | undefined> };
  /** The regions; `generation` changes with every load. */
  regions: { all(): readonly Region[]; readonly generation: number };
  /**
   * The gyms per server (plan 19B-2): a server's editor shows its own; `generation` changes with
   * every change.
   */
  gyms: {
    of(guildId: number | undefined): Pick<GymView, 'all' | 'regionsOf'>;
    readonly generation: number;
  };
  /**
   * The kept Wayspots per server (plan 19B-3): a server's editor shows its own, its stops of
   * Pine's own among them; `generation` changes with every load and forget.
   */
  wayspots: { of(guildId: number | undefined): { all(): Wayspot[] }; readonly generation: number };
  /** The server's channels and its name as the bot sees them. */
  servers: {
    serverChannels(guildId: string): ServerChannel[] | undefined;
    serverName(guildId: string): string | undefined;
  };
}

/** Who is asking, as far as the view tells it. */
export interface EditorViewer {
  userId: string;
  /** Discord could not say who is asking: the page saves nothing, and is offered no channel. */
  readOnly: boolean;
  mayManageChannels: boolean;
}

const hash = (text: string): string =>
  createHash('sha256').update(text).digest('base64url').slice(0, 27);

/**
 * The region editor's view of each server (`editorView`, plan 8M-2), built once and kept until
 * the gyms, the regions, the Wayspots or the server's channels change: the regions, gyms and
 * Wayspots are megabytes for a city. What depends on who asks (read-only, may create channels,
 * the channels offered) is put in front of it per request; the ETag is of both.
 */
export class EditorCache {
  private readonly views = new BoundedMap<
    string,
    { key: string; json: string; channels: string; etag: string }
  >(SERVERS);

  constructor(private readonly sources: EditorSources) {}

  async view(guildId: string, viewer: EditorViewer): Promise<SentView> {
    const { guilds, regions, gyms, wayspots, servers } = this.sources;
    const row = await guilds.idFor(guildId);
    const channels = servers.serverChannels(guildId);
    const key = JSON.stringify([
      gyms.generation,
      regions.generation,
      wayspots.generation,
      row,
      channels ?? null,
    ]);
    let kept = this.views.get(guildId);
    if (kept?.key !== key) {
      const view = editorView({
        guildRow: row,
        regions: regions.all(),
        channels,
        gyms: gyms.of(row).all(),
        regionsOf: (id) => gyms.of(row).regionsOf(id),
        // The server's own (plan 19B-3), its stops of Pine's own (plan 8R-1) among them.
        wayspots: wayspots.of(row).all(),
      });
      const { channels: offered, ...rest } = view;
      const json = JSON.stringify(rest);
      kept = { key, json, channels: JSON.stringify(offered), etag: hash(json) };
      this.views.set(guildId, kept);
    }
    const front = JSON.stringify({
      guild: { id: guildId, name: servers.serverName(guildId) ?? guildId },
      userId: viewer.userId,
      readOnly: viewer.readOnly,
      mayManageChannels: !viewer.readOnly && viewer.mayManageChannels,
    });
    const offered = viewer.readOnly ? '[]' : kept.channels;
    const body = `${front.slice(0, -1)},"channels":${offered},${kept.json.slice(1)}`;
    return { body, etag: `"${hash(`${kept.etag}${front}${offered}`)}"` };
  }
}
