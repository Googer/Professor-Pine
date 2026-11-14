import type { V2Message } from '../discord/party-gateway.js';
import { listTierNote, type ListTierNotice } from './moderation.js';
import { serverNameShown } from './server-admission.js';
import { plainNoLinks } from './text.js';
import { textMessage } from './v2.js';

/** The edge of the owner's DM about shared data: Discord's blue, as the tool request's. */
const SHARED_ACCENT = 0x5865f2;

/** What the owner is told of a change of data every server shares. */
export interface SharedChangeView {
  /** Who did it: their name in the server where they did it, and their id. */
  by: { id: string; name: string | undefined };
  /**
   * The server they did it in: its name, where the bot knows it, and its id; undefined for a
   * direct message with the bot (`/operator` there, plan 19B-1).
   */
  server: { id: string; name: string | undefined } | undefined;
  /** What changed, as a sentence ("Set the event window, for every server: …"). */
  change: string;
  /** The heading; "Shared data changed" unless given (a removal of a member's data, plan 19B-1). */
  title?: string;
}

/**
 * The DM to the bot's owner about a change of data all servers share (Matt's ruling 5 of
 * 2026-11-10: the event window and the boss overrides stay trust between the servers, and the
 * owner is told): who did it (their name through `plainNoLinks` and their id as plain text: no
 * mention, as the tool request's DM), in which server (its name through `plainNoLinks`, and its
 * id), and what changed. Nothing on it to press.
 */
export function sharedChangeDm(view: SharedChangeView): V2Message {
  return textMessage(SHARED_ACCENT, [
    `### ${view.title ?? 'Shared data changed'}`,
    `**${named(view.by.name, 'A member')}** · ${view.by.id}\n` +
      (view.server === undefined
        ? 'from a direct message'
        : `from **${named(view.server.name, 'a server')}** · ${view.server.id}`),
    view.change,
  ]);
}

/**
 * The DM to the bot's owner about screenshots that keep disagreeing with the boss list in a server
 * whose staff may not change it (plan 19B-1; `ModerationReports.listTier`): the server (its name
 * through `plainNoLinks`, and its id), and the note the staff would have had, the command
 * included (`listTierNote`): the boss, its tiers, what the screenshots showed. No member.
 */
export function listTierOwnerDm(notice: ListTierNotice, serverName: string | undefined): V2Message {
  return textMessage(SHARED_ACCENT, [
    '### Screenshots disagree with the boss list',
    `from **${named(serverName, 'a server')}** · ${notice.serverId}`,
    listTierNote(notice),
  ]);
}

/** How many servers the owner's DM about a new install's servers names; the rest are counted. */
export const ADOPTED_NAMED = 20;

/** A server as the owner's DMs about a new install's servers name it. */
export interface NamedServer {
  id: string;
  name: string | undefined;
}

/**
 * The servers of such a DM, one a line: each by its name cut and made plain
 * (`serverNameShown`) and its id, the first `ADOPTED_NAMED`, then how many more.
 */
function serverList(servers: readonly NamedServer[]): string {
  const lines = servers.slice(0, ADOPTED_NAMED).map((server) => {
    const shown = server.name === undefined ? '' : serverNameShown(server.name);
    return `**${shown === '' ? 'A server' : shown}** · ${server.id}`;
  });
  const more = servers.length - lines.length;
  return [...lines, ...(more > 0 ? [`and ${String(more)} more`] : [])].join('\n');
}

/**
 * The DM to the bot's owner about the servers a new install kept (plan 19C-1, `ServerAdoption`):
 * nothing was ever recorded, so the servers it was in at its first start (or the first that added
 * it) may have it from now on (`serverList`). How to take one back.
 */
export function adoptedServersDm(servers: readonly NamedServer[]): V2Message {
  return textMessage(SHARED_ACCENT, [
    '### Servers kept by a new install',
    'This Pine had recorded no server yet, so it keeps the servers it is in now: they may have ' +
      'it from now on, and a server added later needs your allowance (`/operator servers allow`).',
    serverList(servers),
    'A server that should not have it: `/operator servers block`.',
  ]);
}

/**
 * The DM to the bot's owner about the servers a new install neither kept nor left (plan 19C-1,
 * `ServerAdoption`): whether the application is public could not be read at its first start, so a
 * server that neither the owner nor an operator owns waits, unserved, for the owner's word
 * (`serverList`). How to keep one, and how to have Pine leave it.
 */
export function waitingServersDm(servers: readonly NamedServer[]): V2Message {
  return textMessage(SHARED_ACCENT, [
    '### Servers waiting for your word',
    'This Pine had recorded no server yet and could not read whether its application is public ' +
      '(Public Bot), so it neither keeps nor leaves these servers, which neither you nor an ' +
      'operator own: they wait, and Pine does nothing in them.',
    serverList(servers),
    'To keep one: `/operator servers allow`. To have Pine leave it: `/operator servers remove`, ' +
      'or `/operator servers block` to keep it out. At its next start Pine decides a server still ' +
      'waiting by its usual rules, which leave a server nothing allows.',
  ]);
}

/** A name as the owner's DMs show it, plain and without links; `fallback` for none. */
function named(name: string | undefined, fallback: string): string {
  const shown = name === undefined ? '' : plainNoLinks(name).trim();
  return shown === '' ? fallback : shown;
}
