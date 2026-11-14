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
    'I had no server on record yet, so I keep the servers I am in now: they may have me from ' +
      'now on. A server that adds me later needs your permission first: ' +
      '`/operator servers allow`.',
    serverList(servers),
    'If one of them should not have me: `/operator servers block`.',
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
    'I had no server on record yet, and I could not read whether my application is public ' +
      '(Public Bot in the Developer Portal). So I neither keep nor leave these servers, which ' +
      'neither you nor an operator owns: they wait, and I do nothing in them.',
    serverList(servers),
    'To keep one: `/operator servers allow`. To have me leave one: `/operator servers remove`, ' +
      'or `/operator servers block` to keep it out.',
    'At my next start, a server still waiting is treated as any other: I leave it unless ' +
      'something allows it.',
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
            ': I try again at each daily sweep.',
        ];
  const one = count === 1;
  return textMessage(SHARED_ACCENT, [
    `### ${one ? 'A server’s data deleted' : `${String(count)} servers’ data deleted`}`,
    `I left ${one ? 'this server' : `these ${String(count)} servers`} more than 30 days ago, ` +
      `so I deleted everything I held of ${one ? 'it: its' : 'them: their'} settings, ` +
      'regions, Wayspots, parties, history, boards, wants, routes, moderation and meetup ' +
      `records, ${filesLeft === 0 ? 'kept screenshots, ' : ''}and the gyms no other server ` +
      'has.\n\n' +
      `Members’ own settings stay, and so does ${one ? 'the server’s' : 'each server’s'} ` +
      'record of what an operator allowed or blocked. Backups keep the data until they age out.',
    [...lines, ...moreLine].join('\n'),
    ...screenshots,
    ...indexFolders(servers),
    `If ${one ? 'it adds me back, it starts' : 'one adds me back, it starts'} over ` +
      'with `/admin setup`.',
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
    `I left ${count === 1 ? 'this server' : `these ${String(count)} servers`} more than 30 days ` +
      `ago, and could not delete what I held of ${count === 1 ? 'it' : 'them'} ` +
      `${String(sweeps)} days running. ${count === 1 ? 'It' : 'Each'} failed at the step ` +
      'named: the database, the kept screenshots, or the record of the deletion.\n\n' +
      'My log says why: look for “could not delete the data of a server Pine left” with the ' +
      'server’s ID.',
    [...lines, ...(more > 0 ? [`and ${String(more)} more`] : [])].join('\n'),
    'I try again each day. Once a server’s deletion succeeds, I tell you again only if a ' +
      `later one fails ${String(sweeps)} days running.`,
  ]);
}

/** A name as the owner's DMs show it, plain and without links; `fallback` for none. */
function named(name: string | undefined, fallback: string): string {
  const shown = name === undefined ? '' : plainNoLinks(name).trim();
  return shown === '' ? fallback : shown;
}
