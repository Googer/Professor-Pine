import {
  ButtonStyle,
  ComponentType,
  type APIButtonComponent,
  type APIComponentInContainer,
} from 'discord.js';
import { encodeCustomId } from '../discord/custom-id.js';
import type { V2Message } from '../discord/party-gateway.js';
import type { Place } from '../domain/geo/place.js';
import type {
  ApprovalFailure,
  MeetupAppeal,
  MeetupBlock,
  MeetupRequestRecord,
  RequestDecision,
} from '../domain/meetups/records.js';
import { wayspotPicture } from '../domain/wayspots/picture.js';
import { postsRefusedFailure } from './activity.js';
import { nearLine } from './spawn.js';
import { memberText, plain, plainLines, plainNoLinks, timestamp, truncate } from './text.js';
import {
  actionRow,
  container,
  linkButton,
  section,
  textDisplay,
  textMessage,
  thumbnail,
} from './v2.js';

/** The custom-id kind of the buttons of a moderators' post of a request (`msafety:<id>:<action>`). */
export const SAFETY_KIND = 'msafety';

/** The edge of a post that waits for a moderator: amber. */
export const PENDING_ACCENT = 0xf0b232;
/** The edge of a request that was approved: green. */
export const APPROVED_ACCENT = 0x57f287;
/** The edge of one that was refused or failed: red. */
export const REFUSED_ACCENT = 0xed4245;
/** The edge of one nobody decided in time: grey. */
export const EXPIRED_ACCENT = 0x99aab5;

/** As much of a place's title and address as the post shows: the information is never cut. */
const TITLE_ROOM = 100;
const ADDRESS_ROOM = 200;

/** The buttons of a request's post, with their labels and styles, in their order. */
type ActionStyle =
  ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success | ButtonStyle.Danger;

const BUTTONS: readonly [RequestDecision, string, ActionStyle][] = [
  ['approve', 'Approve', ButtonStyle.Success],
  ['approve-once', 'Approve once', ButtonStyle.Primary],
  ['refuse', 'Refuse', ButtonStyle.Secondary],
  ['refuse-forever', 'Refuse from now on', ButtonStyle.Danger],
  ['block', 'Block member', ButtonStyle.Danger],
];

/** The decisions a request of this place may get: a pin has no ruling, so neither for good. */
export function decisionsFor(place: Place): RequestDecision[] {
  return BUTTONS.map(([decision]) => decision).filter(
    (decision) => place.kind !== 'pin' || (decision !== 'approve' && decision !== 'refuse-forever'),
  );
}

/**
 * A place as the moderators' posts show it (a request's, a report's, an ask's): title and address
 * cut, the information never; a gym's official name beside its nickname when the two differ
 * (`officialName`, plan 8S-2: "(gym; officially **Frog Fountain**)"); a place without an address
 * says so where its picture stands beside the line (`pictured`, plan 8W-3).
 */
export function placeLine(
  place: Place,
  { officialName, pictured = false }: { officialName?: string | null; pictured?: boolean } = {},
): string {
  if (place.kind === 'pin') return nearLine(place);
  return nearLine(
    {
      ...place,
      title: truncate(place.title, TITLE_ROOM),
      address: place.address === null ? null : truncate(place.address, ADDRESS_ROOM),
    },
    {
      pictured,
      officially:
        officialName === undefined || officialName === null || officialName === place.title
          ? undefined
          : truncate(officialName, TITLE_ROOM),
    },
  );
}

/** Who decided, as a sentence names them. */
function decider(request: MeetupRequestRecord): string {
  if (request.decidedBy === null) return 'a moderator';
  return memberText({ id: request.decidedBy, name: request.decidedByName ?? undefined });
}

/**
 * What the maker of an approved meetup that could not be made can do (their DM): a name or
 * information that does not fit is theirs to shorten; anything else, try again later.
 */
function tryAgainWords(failure: ApprovalFailure | null): string {
  if (failure?.kind === 'bad-name') return 'Use `/meetup` again with a shorter name.';
  if (failure?.kind === 'bad-description') return 'Use `/meetup` again with shorter information.';
  return 'Use `/meetup` again later.';
}

/** When it was decided, for the outcome's line. */
function decidedWhen(request: MeetupRequestRecord): string {
  return request.decidedAt === null ? '' : ` ${timestamp(request.decidedAt, 'R')}`;
}

const FAILURES: Readonly<Record<Exclude<ApprovalFailure['kind'], 'posts-refused'>, string>> = {
  'bad-name': 'its name is empty or too long',
  'bad-description': 'its information is too long',
  'no-region': 'its region is gone',
  'no-forum': 'its region has no forum',
  'no-post': 'its post could not be made',
  error: 'something went wrong',
};

/**
 * Why an approved meetup could not be made, as words after "but …: " (plan 8S-4): for the
 * moderator who pressed and the maker the forum is "its forum"; the moderators' post names it
 * (`named`).
 */
export function approvalFailureWords(failure: ApprovalFailure, named = false): string {
  if (failure.kind !== 'posts-refused') return FAILURES[failure.kind];
  return postsRefusedFailure(failure, named ? `<#${failure.forumId}>` : undefined);
}

/** What came of a request that is no longer pending, as the post's last line, and its edge. */
function outcomeOf(
  request: MeetupRequestRecord,
  postId: string | undefined,
): { line: string; accent: number } {
  const by = `by ${decider(request)}${decidedWhen(request)}`;
  const post = postId === undefined ? '' : ` Its post: <#${postId}>.`;
  switch (request.status) {
    case 'approved':
      return {
        accent: APPROVED_ACCENT,
        line:
          request.decision === 'approve'
            ? `**Approved** ${by}: the meetup is posted, and the place is allowed from now on.${post}`
            : `**Approved once** ${by}: the meetup is posted; the place is not allowed beyond it.${post}`,
      };
    case 'failed':
      return {
        accent: REFUSED_ACCENT,
        line:
          request.failure === null
            ? `**Approved** ${by}, but the meetup could not be made. Its maker was told.`
            : `**Approved** ${by}, but the meetup could not be made: ` +
              `${approvalFailureWords(request.failure, true)}. Its maker was told.`,
      };
    case 'refused':
      return {
        accent: REFUSED_ACCENT,
        line:
          request.decision === 'refuse-forever'
            ? `**Refused from now on** ${by}: no meetup can be held at this place.`
            : request.decision === 'block'
              ? `**Refused** ${by}, and its maker is blocked from making meetups here.`
              : `**Refused** ${by}.`,
      };
    case 'withdrawn':
      return {
        accent: REFUSED_ACCENT,
        line:
          request.decision === 'approve' || request.decision === 'approve-once'
            ? 'Not posted: its maker was blocked from making meetups here meanwhile.'
            : `**Refused** ${by}: its maker was blocked from making meetups here.`,
      };
    case 'expired':
      return {
        accent: EXPIRED_ACCENT,
        line: `**Expired** ${timestamp(request.expiresAt, 'R')}: no moderator decided in time. Its maker was told.`,
      };
    case 'pending':
      return { accent: PENDING_ACCENT, line: '' };
  }
}

/** A change of an approved meetup's text or times, as the moderators are told of it. */
export type MeetupChangeTold =
  | { kind: 'name'; name: string }
  /** `info`: what it says now; null when it was removed. */
  | { kind: 'info'; info: string | null }
  /** `at`: when it starts or ends now (plan 8Z-2); null when that time was removed. */
  | { kind: 'start' | 'end'; at: number | null };

/** One change as the moderators' notice says it: a line, and for new information its text. */
function changeLines(who: string, change: MeetupChangeTold): string[] {
  switch (change.kind) {
    case 'name':
      return [`${who} renamed it: **${plain(change.name)}**.`];
    case 'info':
      return change.info === null
        ? [`${who} removed its information.`]
        : [`${who} changed its information:`, plainLines(change.info)];
    case 'start':
    case 'end':
      return [
        change.at === null
          ? `${who} removed its ${change.kind} time.`
          : `${who} set its ${change.kind}: ${timestamp(change.at, 'F')} (${timestamp(change.at, 'R')}).`,
      ];
  }
}

/**
 * What the moderators are told when an approved meetup's name, information, start or end changes
 * (plan 8Z; the times since plan 8Z-2; also staff's own changes): who changed it, each change as
 * it is now (the text by `plain`, never cut: not old and new side by side, a meetup's post and
 * the moderators' request show those; changes made together, both times of Manage… and of the
 * map's editor, in one notice), Go to post and the request. A member's name reaches them by
 * `memberText`; nobody is pinged.
 */
export function meetupChangeNotice(
  meetupName: string,
  by: { id: string; name?: string | undefined },
  changes: readonly MeetupChangeTold[],
  links: { post: string | undefined; request: string },
): V2Message {
  const who = memberText(by);
  const lines = changes.flatMap((change) => changeLines(who, change));
  return textMessage(
    PENDING_ACCENT,
    [`### An approved meetup changed: ${plain(meetupName)}`, ...lines],
    [
      actionRow([
        ...(links.post === undefined ? [] : [linkButton('Go to post', undefined, links.post)]),
        linkButton('Go to request', undefined, links.request),
      ]),
    ],
  );
}

/**
 * The custom-id kind of appeals (`mappeal`): `mappeal:<server>:open` (the Appeal button of
 * `/meetup`'s refusal of a blocked member) and `mappeal:<server>:form` (its form), with the
 * server's snowflake; `mappeal:<appeal id>:lift|keep` on the moderators' post of an appeal.
 */
export const APPEAL_KIND = 'mappeal';

/**
 * What a blocked member is told who uses `/meetup` (the design's words), with Appeal, which
 * opens the form of an appeal to the moderators of `serverId`.
 */
export function blockedAnswer(text: string, serverId: string): V2Message {
  return textMessage(
    REFUSED_ACCENT,
    [text],
    [
      actionRow([
        {
          type: ComponentType.Button,
          style: ButtonStyle.Secondary,
          label: 'Appeal…',
          custom_id: encodeCustomId({ kind: APPEAL_KIND, id: serverId, action: 'open' }),
        },
      ]),
    ],
  );
}

/**
 * The one direct message of a member a moderator blocked (from a request's post): they can no
 * longer make meetups on the server (`serverName`, when known), and may appeal with `/meetup`.
 */
export function blockedDm(serverName: string | undefined): V2Message {
  const server = serverName === undefined ? 'this server' : `**${plainNoLinks(serverName)}**`;
  return textMessage(REFUSED_ACCENT, [
    `A moderator blocked you from creating meetups on ${server}. If you think that is wrong, ` +
      'use `/meetup` there and press "Appeal…".',
  ]);
}

/**
 * The direct message of a member whose block a moderator lifted from `/places` (plan 8S-2), the
 * server named when known.
 */
export function blockLiftedDm(serverName: string | undefined): V2Message {
  const on = serverName === undefined ? '' : ` on **${plainNoLinks(serverName)}**`;
  return textMessage(APPROVED_ACCENT, [
    `A moderator lifted your block${on}: you can create meetups ${on === '' ? 'again' : 'there again'}.`,
  ]);
}

/**
 * The moderators' post of an appeal: the member (`memberText`), who blocked them and when
 * (`block`, while it stands), their words (`plainLines`, never cut), with Lift block and Keep
 * block while it is open, and who decided what afterwards (`APPEAL_WAIT_DAYS` after a kept one
 * the member may appeal again).
 */
export function appealMessage(appeal: MeetupAppeal, block: MeetupBlock | undefined): V2Message {
  const member = memberText({ id: appeal.memberId, name: appeal.memberName ?? undefined });
  const blockedBy =
    block === undefined
      ? undefined
      : `Blocked by ${memberText({ id: block.blockedBy, name: block.blockedByName ?? undefined })} ` +
        `${timestamp(block.blockedAt, 'F')}`;
  const head = [
    '### Appeal of a meetup block',
    `${member} asks for their block to be lifted.`,
    ...(blockedBy === undefined ? [] : [blockedBy]),
  ].join('\n');
  const components: APIComponentInContainer[] = [
    textDisplay(head),
    textDisplay(`**Their words**\n${plainLines(appeal.text)}`),
  ];
  let accent = PENDING_ACCENT;
  if (appeal.status === 'open') {
    components.push(
      actionRow(
        (
          [
            ['lift', 'Lift block', ButtonStyle.Success],
            ['keep', 'Keep block', ButtonStyle.Danger],
          ] as const
        ).map(([action, label, style]): APIButtonComponent => ({
          type: ComponentType.Button,
          style,
          label,
          custom_id: encodeCustomId({ kind: APPEAL_KIND, id: appeal.id, action }),
        })),
      ),
    );
  } else {
    const by =
      appeal.decidedBy === null
        ? 'a moderator'
        : memberText({ id: appeal.decidedBy, name: appeal.decidedByName ?? undefined });
    const when = appeal.decidedAt === null ? '' : ` ${timestamp(appeal.decidedAt, 'R')}`;
    accent =
      appeal.status === 'lifted'
        ? APPROVED_ACCENT
        : appeal.status === 'expired'
          ? EXPIRED_ACCENT
          : REFUSED_ACCENT;
    const again = timestamp(appealAgainAt(appeal), 'R');
    components.push(
      textDisplay(
        appeal.status === 'lifted'
          ? `**Lifted** by ${by}${when}: they can create meetups again.`
          : appeal.status === 'expired'
            ? '**Expired**: no moderator decided in time. They can appeal again.'
            : `**Kept** by ${by}${when}: they can appeal again ${again}.`,
      ),
    );
  }
  return { v2: true, components: [container(accent, components)] };
}

/** When a member may appeal again after a moderator kept their block on this appeal. */
function appealAgainAt(appeal: MeetupAppeal): number {
  return (appeal.decidedAt ?? appeal.createdAt) + APPEAL_WAIT_DAYS * 86_400_000;
}

/**
 * What a member is told of their appeal, naming the server (`serverName`, when known): lifted,
 * kept (and when they may appeal again), or expired (nobody decided in time).
 */
export function appealOutcomeDm(appeal: MeetupAppeal, serverName?: string): V2Message {
  const on = serverName === undefined ? '' : ` on **${plainNoLinks(serverName)}**`;
  if (appeal.status === 'lifted') {
    return textMessage(APPROVED_ACCENT, [
      `A moderator lifted your block${on}: you can create meetups ${on === '' ? 'again' : 'there again'}.`,
    ]);
  }
  if (appeal.status === 'expired') {
    return textMessage(EXPIRED_ACCENT, [
      on === ''
        ? 'No moderator decided on your appeal of your meetup block in time. You can appeal ' +
          'again: use `/meetup` on that server and press "Appeal…".'
        : `No moderator decided on your appeal of your meetup block${on} in time. You can ` +
          'appeal again: use `/meetup` there and press "Appeal…".',
    ]);
  }
  return textMessage(REFUSED_ACCENT, [
    `A moderator kept your block on creating meetups${on}. You can appeal again ` +
      `${timestamp(appealAgainAt(appeal), 'R')}.`,
  ]);
}

/** After a moderator kept a block, the member may appeal again this many days later. */
export const APPEAL_WAIT_DAYS = 7;

/**
 * The direct message that tells a request's maker what came of it (the design: approved with a
 * link to the post, refused, expired; never why). `postUrl` is the address of the meetup's post
 * (`postLink`); a failed request says why (`MeetupRequestRecord.failure`). The name goes through
 * `plainNoLinks`, as all text of members in DMs.
 */
export function requestOutcomeDm(
  request: MeetupRequestRecord,
  more: { postUrl?: string } = {},
): V2Message {
  const name = `**${plainNoLinks(request.name)}**`;
  switch (request.status) {
    case 'approved':
      return textMessage(
        APPROVED_ACCENT,
        [`A moderator approved your meetup ${name}: it is posted.`],
        more.postUrl === undefined
          ? []
          : [actionRow([linkButton('Go to post', undefined, more.postUrl)])],
      );
    case 'failed':
      return textMessage(REFUSED_ACCENT, [
        `A moderator approved your meetup ${name}, but I could not make it: ` +
          `${approvalFailureWords(request.failure ?? { kind: 'error' })}. ` +
          tryAgainWords(request.failure),
      ]);
    case 'expired':
      return textMessage(EXPIRED_ACCENT, [
        `No moderator decided on your meetup ${name} in time, so it is not posted. Use ` +
          '`/meetup` again with a later start.',
      ]);
    default:
      return textMessage(REFUSED_ACCENT, [
        `A moderator did not approve your meetup ${name}, so it is not posted.`,
      ]);
  }
}

/**
 * The moderators' post of a request (plan 8S-1): who asked (by `memberText`, so that a
 * moderator can open their profile), whether on the live map (`source`, plan 8M-5M), in which
 * region, the meetup's name and start, where it is
 * (the place's kind, title, address and Map, a pin as `pinLine` shows it; the Wayspot's picture
 * beside it), its information (never cut), and when the request expires; with the buttons of
 * `decisionsFor` while it waits, and what came of it afterwards (who decided, and `postId`, the
 * meetup's post, when one was made). Text members wrote is shown through `plain` (the name),
 * `plainLines` (the information) and `plainNoLinks` (names and the place).
 */
export function requestMessage(
  request: MeetupRequestRecord,
  more: {
    postId?: string;
    /** A gym's official name, shown beside the nickname its title has (plan 8S-2). */
    officialName?: string | null;
    /**
     * Of a request refused or expired without a block: its maker's block, if one stands (who
     * blocked them is said); none, Block member stays on the post (8S-1 review W7).
     */
    makerBlock?: MeetupBlock | null;
  } = {},
): V2Message {
  const waiting = request.status === 'pending';
  const outcome = outcomeOf(request, more.postId);
  const maker = memberText({ id: request.makerId, name: request.makerName ?? undefined });
  const head = [
    waiting ? '### Meetup waiting for approval' : '### Meetup request',
    `**${plain(request.name)}**`,
    `Starts ${timestamp(request.startTime, 'F')} (${timestamp(request.startTime, 'R')})`,
    ...(request.endTime === null ? [] : [`Ends ${timestamp(request.endTime, 'F')}`]),
    `Asked by ${maker}${request.source === 'map' ? ' on the map' : ''} in <#${request.regionChannelId}>`,
  ].join('\n');
  const picture = request.place.kind === 'pin' ? undefined : wayspotPicture(request.place.image);
  const where = `**Where**\n${placeLine(request.place, {
    officialName: more.officialName,
    pictured: picture !== undefined,
  })}`;
  const components: APIComponentInContainer[] = [
    textDisplay(head),
    picture === undefined ? textDisplay(where) : section(where, thumbnail(picture)),
    textDisplay(`**Information**\n${plainLines(request.description)}`),
  ];
  if (waiting) {
    const pinNote = request.place.kind === 'pin' ? ' A pin is approved for this meetup alone.' : '';
    components.push(
      textDisplay(
        `-# Expires ${timestamp(request.expiresAt, 'R')} unless a moderator decides first.${pinNote}`,
      ),
      actionRow(
        decisionsFor(request.place).map((decision): APIButtonComponent => {
          const [, label, style] = BUTTONS.find(([one]) => one === decision) ?? BUTTONS[0]!;
          return {
            type: ComponentType.Button,
            style,
            label,
            custom_id: encodeCustomId({ kind: SAFETY_KIND, id: request.id, action: decision }),
          };
        }),
      ),
    );
  } else {
    components.push(textDisplay(outcome.line));
    if (blockableLater(request) && more.makerBlock !== undefined) {
      const block = more.makerBlock;
      if (block === null) {
        components.push(
          actionRow([
            {
              type: ComponentType.Button,
              style: ButtonStyle.Danger,
              label: 'Block member',
              custom_id: encodeCustomId({ kind: SAFETY_KIND, id: request.id, action: 'block' }),
            },
          ]),
        );
      } else {
        const by = memberText({ id: block.blockedBy, name: block.blockedByName ?? undefined });
        components.push(
          textDisplay(`Its maker was blocked by ${by} ${timestamp(block.blockedAt, 'R')}.`),
        );
      }
    }
  }
  return { v2: true, components: [container(outcome.accent, components)] };
}

/**
 * Whether a decided request may still block its maker (8S-1 review W7): one refused (not by a
 * block) or expired.
 */
export function blockableLater(request: Pick<MeetupRequestRecord, 'status' | 'decision'>): boolean {
  return (
    (request.status === 'refused' && request.decision !== 'block') || request.status === 'expired'
  );
}
