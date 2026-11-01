import type { Region } from '../db/repositories/region-repository.js';

/** A server with a map, as the top page names it: its snowflake and its name as the bot sees it. */
export interface MapServer {
  id: string;
  name: string;
}

/**
 * Servers the bot is in, as the top page counts them: those Discord has made available, with
 * their names, and those it has not (yet) by id alone, never to be named (review BR-1, F1).
 */
export interface MapServers {
  servers: MapServer[];
  unavailable: string[];
}

/** What the servers with a map are found from. */
export interface MapServerSources {
  /** The servers the bot is in (`joinedServers`): named where available, else by id. */
  joined(): MapServers;
  /**
   * The snowflake of a server's row (`Guild.id`), by which its regions say whose they are
   * (`GuildRepository.snowflakeOf`, kept in the process's memory once seen).
   */
  guilds: { snowflakeOf(id: number): Promise<string | undefined> };
  /** The regions as loaded. */
  regions: { all(): readonly Pick<Region, 'guildId' | 'bounds'>[] };
}

/** A server in the client's cache, as `joinedServers` reads it. */
export interface CachedServer {
  id: string;
  available: boolean;
  name: string | null | undefined;
}

/**
 * The servers the bot is in: those Discord has made available with their names, the others by
 * id alone. A server is unavailable from a `READY` until its `GUILD_CREATE` (after a reconnect
 * with a new session discord.js marks every cached server so, keeping its name) and during an
 * outage; one first sent unavailable has no name at all. Either way it is not named, but it is
 * still a server of the bot's (review BR-1, F1: its map at `/s/<id>/map` works meanwhile).
 */
export function joinedServers(guilds: Iterable<CachedServer>): MapServers {
  const servers: MapServer[] = [];
  const unavailable: string[] = [];
  for (const guild of guilds) {
    if (guild.available && typeof guild.name === 'string') {
      servers.push({ id: guild.id, name: guild.name });
    } else {
      unavailable.push(guild.id);
    }
  }
  return { servers, unavailable };
}

/**
 * The servers with a map (plan 8M-14, the top page): the servers the bot is in that have at
 * least one region with an outline, which `/s/<guild>/api/geo` would draw (`geoView`); a region
 * counts whatever its channel, as the map draws one whose channel is gone. Those Discord has
 * not made available are given apart, by id (review BR-1, F1). It starts from the regions with
 * an outline: their rows are turned into snowflakes (`guilds.snowflakeOf`, once per row), which
 * are then kept to the servers joined; a server joined without a row or without such a region
 * costs nothing. The view itself is never built for this.
 */
export function mapServers(sources: MapServerSources): () => Promise<MapServers> {
  return async () => {
    const rows = new Set<number>();
    for (const region of sources.regions.all()) {
      if (region.bounds !== null && region.guildId !== null) rows.add(region.guildId);
    }
    const snowflakes = new Set(
      await Promise.all([...rows].map((row) => sources.guilds.snowflakeOf(row))),
    );
    const joined = sources.joined();
    return {
      servers: joined.servers
        .filter((server) => snowflakes.has(server.id))
        .map(({ id, name }) => ({ id, name })),
      unavailable: joined.unavailable.filter((id) => snowflakes.has(id)),
    };
  };
}
