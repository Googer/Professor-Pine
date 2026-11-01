import { localPath } from './local-path.js';
import type { MapServer } from './map-servers.js';

/** What the member directory said of the visitor in a server: in it, not, or nothing (it failed). */
export type Membership = 'member' | 'not' | 'unknown';

/** What the answer of `/` is decided from. */
export interface TopFacts {
  /** The servers with a map Discord has made available (`WebDeps.serversWithMap`). */
  servers: readonly MapServer[];
  /**
   * The servers with a map Discord has not made available (review BR-1, F1): never named nor
   * asked of, each counted as a server whose lookup failed.
   */
  unavailable: readonly string[];
  /** Who is logged in, or undefined. */
  visitor: { name: string } | undefined;
  /** Whether "Log in with Discord" is offered here (`DISCORD_CLIENT_SECRET`). */
  discordLogin: boolean;
  /** The directory's answer per server with a map; a server without one counts as `unknown`. */
  memberships: ReadonlyMap<string, Membership>;
  /** `settings.web.invites`. */
  invites: Readonly<Record<string, string>> | undefined;
  /** Whether the address carries `?login=failed`. */
  loginFailed: boolean;
}

/** A server the visitor could join, with its admin's invite. */
export type JoinableServer = MapServer & { invite: string };

export type TopAnswer =
  | { kind: 'no-map' }
  | { kind: 'login'; discord: boolean; failed: boolean }
  | { kind: 'redirect'; to: string }
  | {
      kind: 'servers';
      visitor: string;
      yours: MapServer[];
      toJoin: JoinableServer[];
      notIn: boolean;
      partial: boolean;
    };

/** Servers by name, as a reader expects whatever the letters' case or accents. */
const byName = (a: MapServer, b: MapServer): number =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);

/**
 * The answer of `/` (plan 8M-14, the design's "Behavior"): with no server with a map, "no map
 * here yet" (a server with one that Discord has not made available counts); logged out, the login page whatever the number of servers, so that nobody logged
 * out learns any server's name or their count; logged in, the servers they are a member of and
 * those they could join by an invite of the settings, a server Discord has not made available
 * counting as a lookup that failed (never named). One server of theirs, none to join and
 * every lookup answered leads straight to its map. Pure: the lookups are the caller's.
 */
export function topAnswer(facts: TopFacts): TopAnswer {
  if (facts.servers.length === 0 && facts.unavailable.length === 0) return { kind: 'no-map' };
  if (facts.visitor === undefined) {
    // Without the client secret no login with Discord was tried, so none failed.
    const failed = facts.discordLogin && facts.loginFailed;
    return { kind: 'login', discord: facts.discordLogin, failed };
  }
  const said = (server: MapServer): Membership => facts.memberships.get(server.id) ?? 'unknown';
  const invites = facts.invites ?? {};
  const yours = facts.servers.filter((server) => said(server) === 'member').sort(byName);
  const toJoin = facts.servers
    .filter((server) => said(server) === 'not' && Object.hasOwn(invites, server.id))
    .map((server) => ({ ...server, invite: invites[server.id] ?? '' }))
    .filter((server) => server.invite !== '')
    .sort(byName);
  const partial =
    facts.unavailable.length > 0 || facts.servers.some((server) => said(server) === 'unknown');
  // Only ever to a page of a server here (`localPath`): an open redirect is a finding.
  const to = yours.length === 1 ? localPath(`/s/${yours[0]?.id ?? ''}/map`) : undefined;
  if (to !== undefined && toJoin.length === 0 && !partial) return { kind: 'redirect', to };
  return {
    kind: 'servers',
    visitor: facts.visitor.name,
    yours,
    toJoin,
    notIn: yours.length === 0 && !partial,
    partial,
  };
}
