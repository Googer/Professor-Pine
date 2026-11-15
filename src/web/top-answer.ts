import { localPath } from './local-path.js';
import type { MapServer } from './map-servers.js';

/**
 * Whether the visitor is in a server: in it, not, nothing known (the member directory's question
 * failed), or not asked (final review R4-1: past the questions a load may ask).
 */
export type Membership = 'member' | 'not' | 'unknown' | 'unasked';

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
  /**
   * Whether they are in each server with a map: from their session's servers where its login
   * read them (`listed`), else the member directory's answer; a server without one counts as
   * `unknown`.
   */
  memberships: ReadonlyMap<string, Membership>;
  /**
   * Whether the visitor's session read their servers at its login (final review R4-1): a server
   * they joined since shows after their next login.
   */
  listed: boolean;
  /** Each server's invite (its values' `invite`, plan 19A-1), by its id. */
  invites: Readonly<Record<string, string>> | undefined;
  /** Whether the address carries `?login=failed`. */
  loginFailed: boolean;
  /**
   * Whether the instance is open to every server (`servers: "open"`): then no server is offered
   * to join here (final review R4-2), its invite staying on its own map for visitors there.
   */
  openInstance: boolean;
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
      /** Discord did not answer for every server (a question failed, a server unavailable). */
      partial: boolean;
      /**
       * Some servers were not asked of (final review R4-1: a session that did not read its servers
       * at the login, past `TOP_LOOKUPS_PER_LOAD`): how to see the rest, by logging in with
       * Discord again, or by `/maps` without the client secret.
       */
      unchecked?: 'discord' | 'maps';
      /** Their servers were read at their login (`TopFacts.listed`): a server joined since is not. */
      listed?: true;
    };

/** Servers by name, as a reader expects whatever the letters' case or accents. */
const byName = (a: MapServer, b: MapServer): number =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);

/**
 * The answer of `/` (plan 8M-14, the design's "Behavior"): with no server with a map, "no map
 * here yet" (a server with one that Discord has not made available counts); logged out, the login page whatever the number of servers, so that nobody logged
 * out learns any server's name or their count; logged in, the servers they are a member of and
 * those they could join by an invite of the settings (none on an open instance, final review
 * R4-2), a server Discord has not made available
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
  // On an open instance any server may have Pine, and staff who set an invite for their map's
  // visitors did not ask to be listed to every account (final review R4-2).
  const invites = facts.openInstance ? {} : (facts.invites ?? {});
  const yours = facts.servers.filter((server) => said(server) === 'member').sort(byName);
  const toJoin = facts.servers
    .filter((server) => said(server) === 'not' && Object.hasOwn(invites, server.id))
    .map((server) => ({ ...server, invite: invites[server.id] ?? '' }))
    .filter((server) => server.invite !== '')
    .sort(byName);
  const partial =
    facts.unavailable.length > 0 || facts.servers.some((server) => said(server) === 'unknown');
  // Servers the load did not ask of (final review R4-1): not every server is known either.
  const unchecked = facts.servers.some((server) => said(server) === 'unasked');
  const complete = !partial && !unchecked;
  // Only ever to a page of a server here (`localPath`): an open redirect is a finding.
  const to = yours.length === 1 ? localPath(`/s/${yours[0]?.id ?? ''}/map`) : undefined;
  if (to !== undefined && toJoin.length === 0 && complete) return { kind: 'redirect', to };
  return {
    kind: 'servers',
    visitor: facts.visitor.name,
    yours,
    toJoin,
    notIn: yours.length === 0 && complete,
    partial,
    ...(unchecked ? { unchecked: facts.discordLogin ? 'discord' : 'maps' } : {}),
    ...(facts.listed ? { listed: true } : {}),
  };
}
