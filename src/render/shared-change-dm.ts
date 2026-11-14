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

/**
 * A server whose data was deleted (plan 19C-3), by a sweep or by its return since the last
 * sweep: its id, since when Pine had left it, whether the old bot's member index holds a folder
 * of it (`indexFolder`), and whether some of its kept screenshots could not be removed yet
 * (`screenshotsLeft`: its files' step did not succeed in the sweep that tells of it).
 */
export interface DeletedServer {
  id: string;
  leftAt: number | null;
  indexFolder: boolean;
  screenshotsLeft: boolean;
}

/** What a server's line says of kept screenshots not removed yet (fix round 2, R1-3). */
const SCREENSHOTS_LEFT = '(some kept screenshots are still being removed)';

/**
 * The DM to the bot's owner after a sweep that deleted servers' data (plan 19C-3,
 * `ServerDeletion`): how many, each by its id (its name is no longer known: Pine left it) and
 * when Pine left it, the first `ADOPTED_NAMED`, then how many more; what went and what stays.
 * The kept screenshots are said to be deleted only of the servers whose files went in that sweep;
 * another's line says some are still being removed (fix round 2, R1-3). The old bot's member
 * index (`LEGACY_INDEX_DIR`, which Pine only reads): the folders it holds of these servers, and
 * only those, are named as the owner's to remove, as `/operator forget` names a member's files
 * there (fix round 1, 7; fix round 2, R1-3).
 */
export function deletedServersDm(servers: readonly DeletedServer[]): V2Message {
  const count = servers.length;
  const shown = servers.slice(0, ADOPTED_NAMED);
  const lines = shown.map((server) => {
    const left =
      server.leftAt === null ? '' : ` · left <t:${String(Math.floor(server.leftAt / 1000))}:D>`;
    return `${server.id}${left}${server.screenshotsLeft ? ` ${SCREENSHOTS_LEFT}` : ''}`;
  });
  const more = count - lines.length;
  const moreLeft = servers.slice(ADOPTED_NAMED).filter((server) => server.screenshotsLeft).length;
  const moreLine =
    more === 0
      ? []
      : [
          `and ${String(more)} more` +
            (moreLeft === 0
              ? ''
              : ` (${String(moreLeft)} of them with some kept screenshots still being removed)`),
        ];
  const filesLeft = servers.filter((server) => server.screenshotsLeft).length;
  const screenshots =
    filesLeft === 0
      ? []
      : [
          (count === 1
            ? 'Some of its kept screenshots could not be removed yet'
            : filesLeft === count
              ? 'Some of their kept screenshots could not be removed yet'
              : 'Some kept screenshots of the servers marked so could not be removed yet') +
            ': Pine tries again at each daily sweep.',
        ];
  return textMessage(SHARED_ACCENT, [
    `### ${count === 1 ? 'A server’s data deleted' : `${String(count)} servers’ data deleted`}`,
    `Pine left ${count === 1 ? 'this server' : `these ${String(count)} servers`} more than 30 ` +
      'days ago, so everything it held of them is deleted: their settings, regions, Wayspots, ' +
      'parties, history, boards, wants, routes, moderation and meetup records, ' +
      (filesLeft === 0 ? 'kept screenshots, ' : '') +
      'and the gyms no other server has. Members’ own settings stay, and so does each server’s ' +
      'record with what an operator allowed or blocked; backups keep the data until they age out.',
    [...lines, ...moreLine].join('\n'),
    ...screenshots,
    ...indexFolders(servers),
    'If Pine is added back to one, it starts anew.',
  ]);
}

/**
 * The paragraph of `deletedServersDm` that names the old bot's member index folders of the
 * deleted servers that have one (the first `ADOPTED_NAMED`, then how many more); none where no
 * server has one.
 */
function indexFolders(servers: readonly DeletedServer[]): string[] {
  const withFolder = servers.filter((server) => server.indexFolder);
  if (withFolder.length === 0) return [];
  const folders = withFolder.slice(0, ADOPTED_NAMED).map((server) => `\`${server.id}/\``);
  const more = withFolder.length - folders.length;
  const whose =
    servers.length === 1
      ? 'its members'
      : withFolder.length === servers.length
        ? 'their members'
        : `the members of ${withFolder.length === 1 ? 'one of them' : `${String(withFolder.length)} of them`}`;
  return [
    `The old bot’s history of ${whose} is on the host, where I can only read it: delete ` +
      (folders.length === 1
        ? `the folder ${folders.join('')}`
        : `the folders ${folders.join(', ')}`) +
      ' in the member index folder (`LEGACY_INDEX_DIR`)' +
      (more > 0
        ? `, and those of the ${String(more)} more ${more === 1 ? 'server' : 'servers'}.`
        : '.'),
  ];
}

/**
 * The step of a server's deletion that failed (plan 19C-3, `ServerDeletion`), as the owner is
 * told it: its rows in the database, its kept screenshots, or the record of the deletion.
 */
export type DeletionStep = 'database' | 'screenshots' | 'record';

/** A server whose deletion keeps failing: its id, and the step that failed last. */
export interface FailingDeletion {
  id: string;
  step: DeletionStep;
}

/**
 * The DM to the bot's owner of the servers whose deletion failed `sweeps` sweeps running (plan
 * 19C-3, `ServerDeletion`): each by its id and what failed in a word, the first `ADOPTED_NAMED`,
 * then how many more; where the reason is (the log), and that it is tried again each day.
 */
export function failingDeletionsDm(servers: readonly FailingDeletion[], sweeps: number): V2Message {
  const count = servers.length;
  const lines = servers.slice(0, ADOPTED_NAMED).map((server) => `${server.id} · ${server.step}`);
  const more = count - lines.length;
  return textMessage(SHARED_ACCENT, [
    `### ${count === 1 ? 'A server’s data could not be deleted' : `${String(count)} servers’ data could not be deleted`}`,
    `Pine left ${count === 1 ? 'this server' : `these ${String(count)} servers`} more than 30 days ` +
      `ago, and could not delete what it held of ${count === 1 ? 'it' : 'them'} ` +
      `${String(sweeps)} days running. Each failed at the step named: the database, the kept ` +
      'screenshots, or the record of the deletion. The bot’s log says why: “could not delete the ' +
      'data of a server Pine left”, with the server’s id.',
    [...lines, ...(more > 0 ? [`and ${String(more)} more`] : [])].join('\n'),
    'Pine tries again each day, and tells you again only if it fails anew after it succeeds.',
  ]);
}

/** A name as the owner's DMs show it, plain and without links; `fallback` for none. */
function named(name: string | undefined, fallback: string): string {
  const shown = name === undefined ? '' : plainNoLinks(name).trim();
  return shown === '' ? fallback : shown;
}
