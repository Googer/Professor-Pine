import { ButtonStyle, ComponentType, type APIButtonComponent } from 'discord.js';
import { encodeCustomId } from '../discord/custom-id.js';
import type { V2Message } from '../discord/party-gateway.js';
import { serverNameShown } from './server-admission.js';
import { timestamp } from './text.js';
import { actionRow, LIST_COLOUR, textMessage } from './v2.js';

/**
 * The words of neighbors (plan 19E): the request in a server's moderators' bot lab, what both
 * labs are told, and the answers of `/admin neighbors`. A server is named by its name as Discord
 * has it (`serverNameShown`: cut, plain, no links) with its id, never a member; nothing pings.
 */

/** The custom-id kind of the request's buttons: `neighbor:<asking server>:accept|decline`. */
export const NEIGHBOR_KIND = 'neighbor';

/** The edge of a request answered: green for neighbors, grey for a decline. */
const ACCEPTED_ACCENT = 0x57f287;
const DECLINED_ACCENT = 0x99aab5;

/** A server by its name as Discord has it, with its id; by its id alone where the bot has none. */
export function serverNamed(serverId: string, name: string | undefined): string {
  return name === undefined
    ? `The server \`${serverId}\``
    : `**${serverNameShown(name)}** (\`${serverId}\`)`;
}

/** What neighbors share, said in the request and in `/admin neighbors ask`'s help. */
export const NEIGHBORS_SHARE =
  'Neighbors see each other’s raids and max battles at the gyms and Power Spots both servers ' +
  'cover: a raid’s or max battle’s post gets a line for the other server’s raid or battle there, ' +
  'with the server’s name, the boss, its time, how many are coming and a link to its post. No ' +
  'member is named and nobody is pinged. Either server can end it at any time with ' +
  '`/admin neighbors end`.';

/**
 * The request in the asked server's moderators' bot lab: who asks, what neighbors share, when it
 * expires, and Accept and Decline.
 */
export function neighborRequestPost(
  askerId: string,
  askerName: string | undefined,
  expiresAt: number,
): V2Message {
  const buttons = (
    [
      ['accept', 'Accept', ButtonStyle.Success],
      ['decline', 'Decline', ButtonStyle.Secondary],
    ] as const
  ).map(([action, label, style]): APIButtonComponent => ({
    type: ComponentType.Button,
    style,
    label,
    custom_id: encodeCustomId({ kind: NEIGHBOR_KIND, id: askerId, action }),
  }));
  return textMessage(
    LIST_COLOUR,
    [
      `### A request to be neighbors\n${serverNamed(askerId, askerName)} asks this server to ` +
        'be its neighbor on Pine.',
      NEIGHBORS_SHARE,
      `-# The request expires ${timestamp(expiresAt, 'R')}. Only staff can answer it.`,
    ],
    [actionRow(buttons)],
  );
}

/** The request once this server's staff accepted it, in its place: no buttons. */
export function neighborAcceptedPost(askerId: string, askerName: string | undefined): V2Message {
  return textMessage(ACCEPTED_ACCENT, [
    `### Neighbors\n${serverNamed(askerId, askerName)} and this server are neighbors now. ` +
      'Either can end it with `/admin neighbors end`.',
  ]);
}

/** The request once this server's staff declined it, in its place. */
export function neighborDeclinedPost(
  askerId: string,
  askerName: string | undefined,
  askAgainAt: number,
): V2Message {
  return textMessage(DECLINED_ACCENT, [
    `### Request declined\nThis server declined the request of ${serverNamed(askerId, askerName)} ` +
      `to be neighbors. It may ask again ${timestamp(askAgainAt, 'R')}.`,
  ]);
}

/** The asker's lab, once the other accepted. */
export function acceptedNotice(otherId: string, otherName: string | undefined): V2Message {
  return textMessage(ACCEPTED_ACCENT, [
    `${serverNamed(otherId, otherName)} accepted this server’s request: the two servers are ` +
      'neighbors now. The posts of their raids and max battles show the other’s at the gyms and ' +
      'Power Spots both cover.',
  ]);
}

/** The asker's lab, once the other declined: only that it was declined, by the id it asked. */
export function declinedNotice(otherId: string): V2Message {
  return textMessage(DECLINED_ACCENT, [
    `The server \`${otherId}\` declined this server’s request to be neighbors.`,
  ]);
}

/** The lab of the server whose neighbor ended it. */
export function endedNotice(enderId: string, enderName: string | undefined): V2Message {
  return textMessage(DECLINED_ACCENT, [
    `${serverNamed(enderId, enderName)} ended being neighbors with this server: their raids and ` +
      'max battles no longer show in this server’s posts, nor this server’s in theirs.',
  ]);
}

/** The lab of the server whose staff ended it. */
export function endedByUsNotice(otherId: string, otherName: string | undefined): V2Message {
  return textMessage(DECLINED_ACCENT, [
    `This server’s staff ended being neighbors with ${serverNamed(otherId, otherName)}.`,
  ]);
}

/**
 * What the asker hears of a request, whatever came of it (a server Pine is not in, a left, blocked
 * or new one, a decline less than a week old): it learns nothing of the other server from it.
 */
export const ASKED = 'Asked. Their staff will be told; you will hear when they answer.';
