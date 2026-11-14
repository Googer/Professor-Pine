import type { APIButtonComponent } from 'discord.js';
import type { RemovalStep } from '../db/repositories/member-data-repository.js';
import type { UserHoldings } from '../db/repositories/user-repository.js';
import type { V2Message } from '../discord/party-gateway.js';
import {
  removable,
  type MemberLook,
  type MemberRemovalOutcome,
} from '../services/member-removal.js';
import { AUDIT_KEEP_MS } from '../services/party-audit.js';
import { APPROVED_ACCENT, EXPIRED_ACCENT, REFUSED_ACCENT } from './meetup-safety.js';
import { TEXT_BUDGET } from './party-post.js';
import { count, memberText, type NamedMember } from './text.js';
import { actionRow, LIST_COLOUR, textMessage } from './v2.js';

/*
 * What the owner is told of a member's data (plan 8G, `/operator forget`): the look before a
 * removal, and what a removal did. Both say, in the same lines, what goes, what stays and why,
 * and what is left for the owner to do by hand. Private answers: the member is named with
 * `memberText`, and nothing here pings.
 */

/** How long the staff's log keeps an entry (`AUDIT_KEEP_MS`), in days, for the answer's words. */
const AUDIT_DAYS = Math.round(AUDIT_KEEP_MS / (24 * 3_600_000));

/**
 * As many of a member's old-bot history files as are named by their paths; in further servers'
 * folders the file has the same name, which the line then says (the answer stays a message
 * Discord takes however many servers the index has).
 */
const FILES_NAMED = 6;

/**
 * The characters the text of the look or of a removal's answer takes at most: well under
 * Discord's `TEXT_BUDGET`, which a send that fails after a committed removal must never cross
 * (final review). What is taken is said whole; what stays and the hand-work share what is left
 * (`restOf`), their lines that do not fit folded into one (`folded`).
 */
export const FORGET_TEXT_BUDGET = TEXT_BUDGET - 500;

/** The room kept for the line that folds the rest of a list (`foldedLine`). */
const FOLD_ROOM = 70;

/** What a removal takes, or took: the look's counts and the removal's own, in one shape. */
interface Taken {
  user: UserHoldings | undefined;
  newTrains: number;
  unownGifts: number;
  optIns: number;
  boards: number;
  fillIns: number;
  named: number;
  /** Trains and meetups of the history whose name or description they wrote. */
  words: number;
  sessions: number;
  toolAccess: boolean;
  dmContact: boolean;
  reportReasons: number;
  meetupRecords: number;
  screenshots: number;
  feedback: number;
}

function takenBy(look: MemberLook): Taken {
  const { held, screenshots } = look;
  return {
    user: held.user,
    newTrains: held.newTrains,
    unownGifts: held.unownGifts,
    ...held.history,
    sessions: held.sessions,
    toolAccess: held.toolAccess,
    dmContact: held.dmContact,
    reportReasons: held.reports.reasons,
    meetupRecords: held.meetups.over,
    screenshots: screenshots.sent,
    feedback: screenshots.feedback,
  };
}

function tookAway(outcome: MemberRemovalOutcome): Taken {
  const { removed, screenshots } = outcome;
  return {
    user: removed.user,
    newTrains: removed.newTrains,
    unownGifts: removed.unownGifts,
    ...removed.history,
    sessions: removed.sessions.length,
    toolAccess: removed.toolAccess,
    dmContact: removed.dmContact,
    reportReasons: removed.reportReasons,
    meetupRecords: removed.meetupRecords,
    screenshots: screenshots.removed,
    feedback: screenshots.feedback,
  };
}

/** `a`, `a and b`, `a, b and c`. */
function listed(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

const inServers = (n: number): string => `in ${count(n, 'server')}`;

/** What goes, a line each: only what there is. */
function takenLines(taken: Taken): string[] {
  const lines: string[] = [];
  const { user } = taken;
  if (user !== undefined) {
    const told = [
      ...(user.friendCode ? ['friend code'] : []),
      ...(user.inGameName ? ['in-game name'] : []),
      ...(user.pokebattlerId ? ['Pokebattler id'] : []),
    ];
    lines.push(`Their settings${told.length === 0 ? '' : `, with their ${listed(told)}`}`);
    const hanging = [
      ...(user.wants + user.targetWants > 0 ? [count(user.wants + user.targetWants, 'want')] : []),
      ...(user.gymTargets > 0 ? [count(user.gymTargets, 'gym notice')] : []),
      ...(user.savedRoutes > 0 ? [count(user.savedRoutes, 'saved route')] : []),
    ];
    if (hanging.length > 0) lines.push(listed(hanging));
  }
  if (taken.newTrains > 0) lines.push(`Their new-train notices ${inServers(taken.newTrains)}`);
  if (taken.unownGifts > 0) {
    lines.push(`The record of their one-time Unown want ${inServers(taken.unownGifts)}`);
  }
  if (taken.optIns > 0 && taken.boards > 0) {
    lines.push(
      `Their history switch ${inServers(taken.optIns)} and their place on the boards in ` +
        String(taken.boards),
    );
  } else if (taken.optIns > 0) {
    lines.push(`Their history switch ${inServers(taken.optIns)}`);
  } else if (taken.boards > 0) {
    // A board row that outlived its history switch: it ranks nobody, and goes all the same.
    lines.push(`Their place on the boards ${inServers(taken.boards)}`);
  }
  if (taken.named > 0) {
    lines.push(
      `Their Discord id on ${count(taken.named, 'history entry', 'history entries')} ` +
        `(the entries stay and count, without it)`,
    );
  }
  if (taken.words > 0) {
    lines.push(
      `The name and description of ${count(taken.words, 'train or meetup', 'trains and meetups')} ` +
        'they made, in the history',
    );
  }
  if (taken.fillIns > 0) {
    lines.push(`${count(taken.fillIns, 'request')} to add their old-bot history`);
  }
  if (taken.sessions > 0) lines.push(count(taken.sessions, 'web login'));
  if (taken.toolAccess) lines.push('Their access to the Wayfarer export tool');
  if (taken.dmContact) lines.push('The record that Pine has sent them direct messages');
  if (taken.reportReasons > 0) {
    lines.push(
      `Their Discord id and name on ${count(taken.reportReasons, 'report')} they made to the ` +
        'moderators',
    );
  }
  if (taken.meetupRecords > 0) {
    lines.push(
      `Their Discord id and name on ${count(taken.meetupRecords, 'meetup request, appeal or place ask', 'meetup requests, appeals and place asks')} ` +
        `that ${taken.meetupRecords === 1 ? 'is' : 'are'} decided and over`,
    );
  }
  if (taken.screenshots > 0 || taken.feedback > 0) {
    lines.push(
      [
        ...(taken.screenshots > 0
          ? [`${count(taken.screenshots, 'kept screenshot')} they sent`]
          : []),
        ...(taken.feedback > 0
          ? [
              `${taken.screenshots > 0 ? 'their' : 'Their'} feedback on ` +
                `${String(taken.feedback)} ${taken.feedback === 1 ? 'other' : 'others'}`,
            ]
          : []),
      ].join(', and '),
    );
  }
  return lines;
}

/**
 * What they wrote on the moderators' records that the removal clears of their id and name: the
 * reasons of reports, and their meetup requests, appeals and asks that are decided and over.
 * Counted before the ids go (the look's counts, or the removal's own): afterwards nothing finds
 * them by the member.
 */
interface Written {
  reasons: number;
  records: number;
}

/** "Their reasons on … and the words of … stay, without their name or Discord id." */
function writtenLine({ reasons, records }: Written): string | undefined {
  const parts = [
    ...(reasons > 0 ? [`their reasons on ${count(reasons, 'report')} to the moderators`] : []),
    ...(records > 0
      ? [
          `the words of ${count(records, 'meetup request, appeal or place ask', 'meetup requests, appeals and place asks')} ` +
            'of theirs (a meetup’s name, information and place; an appeal’s or ask’s text)',
        ]
      : []),
  ];
  if (parts.length === 0) return undefined;
  const said = listed(parts);
  return (
    `${said.charAt(0).toUpperCase()}${said.slice(1)} stay, without their name or Discord id: ` +
    'the moderators’ record.'
  );
}

/** What stays, and why, a line each: only what there is, and the counts without a name. */
function leftLines(look: MemberLook, written: Written): string[] {
  const { held } = look;
  const lines: string[] = [];
  if (held.meetups.blocks > 0) {
    lines.push(
      `${count(held.meetups.blocks, 'meetup block')}, lifted or not: the moderators need ` +
        `${held.meetups.blocks === 1 ? 'it' : 'them'} for the safety of others.`,
    );
  }
  if (held.reports.about > 0) {
    lines.push(
      `${count(held.reports.about, 'report')} to the moderators about them: the moderators’ record.`,
    );
  }
  const words = writtenLine(written);
  if (words !== undefined) lines.push(words);
  if (held.meetups.open > 0) {
    lines.push(
      `${count(held.meetups.open, 'meetup request, appeal or place ask', 'meetup requests, appeals and place asks')} ` +
        `of theirs ${held.meetups.open === 1 ? 'is still open and keeps' : 'are still open and keep'} ` +
        `their Discord id and name: have the moderators decide ` +
        `${held.meetups.open === 1 ? 'it' : 'them'}, then run this again.`,
    );
  }
  // Decided already: the bot makes the meetup within minutes, under their id and name.
  if (held.meetups.unmade > 0) {
    lines.push(
      `${count(held.meetups.unmade, 'meetup request')} of theirs approved and about to be made ` +
        `${held.meetups.unmade === 1 ? 'keeps' : 'keep'} their Discord id and name: run this ` +
        'again once the meetup is made.',
    );
  }
  // The moderators are told of a change of a meetup going on by its request's maker.
  if (held.meetups.live > 0) {
    const one = held.meetups.live === 1;
    lines.push(
      `${count(held.meetups.live, 'meetup request')} of theirs approved, whose ` +
        `${one ? 'meetup is' : 'meetups are'} still going on, ${one ? 'keeps' : 'keep'} their ` +
        `Discord id and name (the moderators are told of the ${one ? 'meetup’s' : 'meetups’'} ` +
        `changes): run this again once the ${one ? 'meetup has' : 'meetups have'} ended.`,
    );
  }
  if (held.audit > 0) {
    lines.push(
      `${count(held.audit, 'entry', 'entries')} of the staff’s log of who did what that ` +
        `${held.audit === 1 ? 'names them: it ages' : 'name them: they age'} out after ` +
        `${String(AUDIT_DAYS)} days.`,
    );
  }
  const live = [
    // Their row goes at once: the parties read the defaults (pings, DMs) of a member without one.
    ...(look.liveParties > 0
      ? [
          `${count(look.liveParties, 'party', 'parties')} they made or signed up for (their ` +
            `settings go at once: ${look.liveParties === 1 ? 'until it ends' : 'until those end'}, ` +
            `Pine treats them in ${look.liveParties === 1 ? 'it' : 'those'} as a new member)`,
        ]
      : []),
    ...(held.stopReports > 0 ? [`${count(held.stopReports, 'report')} at a stop`] : []),
    ...(held.stopConfirms > 0
      ? [`${count(held.stopConfirms, 'confirmation')} of others’ reports at stops`]
      : []),
    ...(held.accessGrants > 0
      ? [`${count(held.accessGrants, 'forum')} they were let into for a party`]
      : []),
  ];
  if (live.length > 0) lines.push(`What is live ends by itself: ${live.join(', ')}.`);
  // Kept from the clock by staff (`/admin save-party`): not live in the line's words.
  if (look.savedParties > 0) {
    lines.push(
      `${count(look.savedParties, 'party', 'parties')} they made or signed up for that staff ` +
        `saved (\`/admin save-party\`): ${look.savedParties === 1 ? 'it ends' : 'they end'} ` +
        `when staff let ${look.savedParties === 1 ? 'it' : 'them'} go.`,
    );
  }
  if (held.staffActs > 0) {
    lines.push(
      `${count(held.staffActs, 'record')} of what they did as staff (decisions, rulings, boss ` +
        `overrides, servers, gyms and stops): the servers’ record.`,
    );
  }
  return lines;
}

/** What the installation is set up with that leaves the owner something to do by hand. */
export interface ByHand {
  /**
   * The GitHub repository `/request` sends gym requests to (`GITHUB_REPO`), where the
   * installation has one: its issues are public and carry the name of who asked.
   */
  requestsRepo?: string | undefined;
  /**
   * Whether the installation has the old bot's own `parties/` folder (`LEGACY_PARTIES_DIR`),
   * whose files name members by id as that bot wrote them; the bot's mount is read-only.
   */
  legacyParties?: boolean;
}

/**
 * What only the owner can do, or what ages out by itself, a line each: the old-bot history
 * files, the old bot's own `parties/` folder, backups, the bot's logs, the gym requests on
 * GitHub, posts.
 */
function byHandLines(look: Pick<MemberLook, 'memberId' | 'legacyFiles'>, byHand: ByHand): string[] {
  const files = look.legacyFiles
    .slice(0, FILES_NAMED)
    .map((server) => `\`${server}/${look.memberId}.json\``);
  const more = look.legacyFiles.length - files.length;
  return [
    ...(files.length === 0
      ? []
      : [
          `Their old-bot history on the host, which I can only read: delete ${listed(files)} ` +
            'in the member index folder (`LEGACY_INDEX_DIR`)' +
            (more === 0
              ? '.'
              : `, and the file of that name in ${String(more)} more server ` +
                `${more === 1 ? 'folder' : 'folders'} there.`),
        ]),
    ...(byHand.legacyParties === true
      ? [
          'The old bot’s own `parties/` folder on the host (`LEGACY_PARTIES_DIR`) holds their ' +
            'Discord id in the files of the parties they made or joined, as that bot wrote ' +
            'them; I can only read it: edit those files there.',
        ]
      : []),
    'Backups made before the removal hold this data until they age out ' +
      '(`BACKUP_KEEP_DAYS`: 90 days unless you changed it).',
    'The bot’s logs can hold their Discord id (a command they used, an error); they roll over ' +
      'by themselves.',
    ...(byHand.requestsRepo === undefined
      ? []
      : [
          'Gym requests they sent with `/request` are public issues of ' +
            `\`${byHand.requestsRepo}\` on GitHub, under the name they had: edit or delete ` +
            'them there.',
        ]),
    'Posts on Discord that name them are not edited.',
  ];
}

const bullets = (lines: readonly string[]): string => lines.map((line) => `- ${line}`).join('\n');

/** The characters of `texts` as text displays: what counts against `FORGET_TEXT_BUDGET`. */
const lengthOf = (texts: readonly (string | undefined)[]): number =>
  texts.reduce((sum, text) => sum + (text?.length ?? 0), 0);

/** The line that stands for the `n` lines of a list there was no room for. */
const foldedLine = (n: number): string =>
  `…and ${count(n, 'more line')} that ${n === 1 ? 'does' : 'do'} not fit in this message.`;

/**
 * As many of `lines` as fit in `room` characters as bullets, in their order, the rest folded
 * into one line (`foldedLine`, whose room is kept while more follow).
 */
function folded(lines: readonly string[], room: number): string[] {
  const shown: string[] = [];
  let used = 0;
  for (const [n, line] of lines.entries()) {
    const cost = line.length + 3;
    const last = n === lines.length - 1;
    if (used + cost + (last ? 0 : FOLD_ROOM) > room)
      return [...shown, foldedLine(lines.length - n)];
    shown.push(line);
    used += cost;
  }
  return shown;
}

/**
 * What stays and what is the owner's to do, under their headings; `stays` heads the first. In
 * `room` characters: the hand-work first (what the owner must do), what stays in what is left
 * of it, each list's lines that do not fit folded (`folded`).
 */
function restOf(
  look: MemberLook,
  written: Written,
  stays: string,
  byHand: ByHand,
  room: number,
): string[] {
  const left = leftLines(look, written);
  // Counts carry no name; said only where there was something of the member to speak of.
  const leftAll =
    left.length === 0 && !removable(look)
      ? []
      : [
          ...left,
          'Counts without a name: the history’s entries and the activity.',
          // Kept by name alone, never by id: nothing finds them by the member to count.
          'Wild spawns they reported name them for about half an hour (the region’s message, ' +
            'the map), and the database holds no id of theirs; the direct messages others got ' +
            'of them keep the name they had.',
        ];
  const handHead = '**Left for you to do by hand:**\n';
  const hand = handHead + bullets(folded(byHandLines(look, byHand), room - handHead.length));
  const stayHead = `**${stays}**\n`;
  return [
    ...(leftAll.length === 0
      ? []
      : [stayHead + bullets(folded(leftAll, room - hand.length - stayHead.length))]),
    hand,
  ];
}

/** How long the look can be confirmed, in the words under it. */
export interface LookControls {
  /** The button "Remove…", which opens the question. */
  remove: APIButtonComponent;
  minutes: number;
}

/**
 * The look: what Pine holds of the member across every server, what a removal takes and what
 * it leaves, with "Remove…" where there is anything to take (`controls`), and without it that
 * there is nothing to remove.
 */
export function forgetLookMessage(
  member: NamedMember,
  look: MemberLook,
  controls: LookControls | undefined,
  byHand: ByHand = {},
): V2Message {
  const title = `### What Pine holds of ${memberText(member)}`;
  const written = { reasons: look.held.reports.reasons, records: look.held.meetups.over };
  if (!removable(look) || controls === undefined) {
    const head = [title, 'Nothing that a removal would take: there is nothing to remove.'];
    return textMessage(EXPIRED_ACCENT, [
      ...head,
      ...restOf(look, written, 'What stays:', byHand, FORGET_TEXT_BUDGET - lengthOf(head)),
    ]);
  }
  const head = [
    title,
    'Across every server.',
    `**Remove… takes away, for good:**\n${bullets(takenLines(takenBy(look)))}`,
  ];
  const foot =
    `-# Only you can press Remove…, within ${String(controls.minutes)} minutes. Nothing is ` +
    'sent to them.';
  return textMessage(
    LIST_COLOUR,
    [
      ...head,
      ...restOf(
        look,
        written,
        'It leaves:',
        byHand,
        FORGET_TEXT_BUDGET - lengthOf([...head, foot]),
      ),
      foot,
    ],
    [actionRow([controls.remove])],
  );
}

/** The question asked once more before anything goes: the text of its dialog. */
export function forgetQuestion(name: string): string {
  return (
    `Remove what Pine holds of **${name}** across every server?\n` +
    'This cannot be undone. Submit removes it.'
  );
}

/** What a removal did: what went, what is left and why, and what is the owner's to do. */
export function forgetOutcomeMessage(
  member: NamedMember,
  outcome: MemberRemovalOutcome,
  byHand: ByHand = {},
): V2Message {
  const taken = takenLines(tookAway(outcome));
  const { failed } = outcome.screenshots;
  const written = {
    reasons: outcome.removed.reportReasons,
    records: outcome.removed.meetupRecords,
  };
  const head = [
    `### Removed the data of ${memberText(member)}`,
    taken.length === 0
      ? 'There was nothing to remove.'
      : `**Removed, from every server:**\n${bullets(taken)}`,
    failed === 0
      ? undefined
      : `**${count(failed, 'kept screenshot')} could not be removed** (the log says why): ` +
        `run this again for ${failed === 1 ? 'it' : 'them'}.`,
  ];
  return textMessage(APPROVED_ACCENT, [
    ...head,
    ...(outcome.after === undefined
      ? unlooked(member, written, byHand)
      : restOf(outcome.after, written, 'Left:', byHand, FORGET_TEXT_BUDGET - lengthOf(head))),
  ]);
}

/**
 * The rest of a removal's answer where the look after it failed: what it knows without one,
 * that it could not look, and the hand-work it can name without the look (not the old-bot
 * history files, which the next look names).
 */
function unlooked(member: NamedMember, written: Written, byHand: ByHand): string[] {
  const words = writtenLine(written);
  return [
    ...(words === undefined ? [] : [`**Left:**\n${bullets([words])}`]),
    'I could not look at what is left of them just now: use the command again to see it.',
    `**Left for you to do by hand:**\n${bullets(
      byHandLines({ memberId: member.id, legacyFiles: [] }, byHand),
    )}`,
  ];
}

/** The database refused the removal at `step`: nothing changed. */
export function forgetFailedMessage(member: NamedMember, step: RemovalStep): V2Message {
  return textMessage(REFUSED_ACCENT, [
    `### Nothing was removed of ${memberText(member)}`,
    `The database refused the removal at **${step}**, so I undid all of it: everything is as ` +
      'it was. The log says why. Use the command again once that is solved.',
  ]);
}
