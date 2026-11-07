import {
  ButtonStyle,
  ComponentType,
  type APIButtonComponent,
  type APIComponentInContainer,
  type APIModalInteractionResponseCallbackData,
  type ModalSubmitInteraction,
} from 'discord.js';
import { encodeCustomId } from '../discord/custom-id.js';
import { dialog, openToken, pickedOf, withoutOpenToken } from '../discord/dialog.js';
import type { V2Message } from '../discord/party-gateway.js';
import type {
  MessageSubject,
  ModerationReport,
  PartySubject,
  PostRemoval,
  ReportRemoval,
  ReportReason,
} from '../domain/moderation/reports.js';
import { UNLISTED_SPOT } from '../domain/party/max.js';
import { partyWord } from '../domain/party/party.js';
import type { ListTierSighting } from '../domain/ocr/list-tier-doubt.js';
import { maxStars, type MaxTier } from '../domain/pogo/max-tier.js';
import type { RaidTier } from '../domain/pogo/raid-tier.js';
import { bossTierLabel } from '../domain/pogo/tier-words.js';
import { APPROVED_ACCENT, EXPIRED_ACCENT, PENDING_ACCENT, placeLine } from './meetup-safety.js';
import { NEWS_COLOUR, postLink } from './notify-dm.js';
import { TEXT_BUDGET } from './party-post.js';
import { mapMarkdown } from './raid-post.js';
import {
  count,
  fitItems,
  memberText,
  type NamedMember,
  plain,
  plainLines,
  plainNoLinks,
  timestamp,
  truncate,
} from './text.js';
import { actionRow, container, linkButton, textDisplay } from './v2.js';
import { archiveOnlyText, REMOVAL_CHOICES, REMOVAL_LABEL } from './removal-words.js';

/**
 * The custom-id kind of the buttons of a report's post (plan 8S-2): `mreport:<report id>:<action>`
 * (`ReportAction`); an action that ends a party asks in a dialog (plan 8Q)
 * `mreport:<report id>:<action>` (its radio group `REMOVAL_INPUT`), or
 * `mreport:<report id>:<action>:archive` where the bot may not delete the post, and the private
 * answer to a deletion refused at Submit has the button Archive post
 * `mreport:<report id>:<action>:archive`.
 */
export const REPORT_KIND = 'mreport';

/**
 * What a moderator may do on a report's post: end the party (`close`), and for a meetup also
 * refuse its place for good (`refuse`, a gym or PokéStop only) or block its maker (`block`); delete
 * a reported message (`delete`); or do nothing (`dismiss`).
 */
export type ReportAction = 'close' | 'refuse' | 'block' | 'delete' | 'dismiss';

export const REPORT_ACTIONS: readonly ReportAction[] = [
  'close',
  'refuse',
  'block',
  'delete',
  'dismiss',
];

/** The actions that end a party, and ask first whether to archive its post or delete it. */
export const ENDING_ACTIONS: readonly ReportAction[] = ['close', 'refuse', 'block'];

const LABELS: Record<ReportAction, string> = {
  close: 'Close…',
  refuse: 'Refuse place…',
  block: 'Block maker…',
  delete: 'Delete message',
  dismiss: 'Dismiss',
};

/** The actions a report's post offers while it is open. */
export function reportActions(report: Pick<ModerationReport, 'subject'>): ReportAction[] {
  const { subject } = report;
  if (subject.kind === 'message') return ['delete', 'dismiss'];
  if (subject.partyType !== 'meetup') return ['close', 'dismiss'];
  // A pin has no ruling (8S-1): its place cannot be refused for good.
  const ruled = subject.place !== null && subject.place.kind !== 'pin';
  return ruled ? ['close', 'refuse', 'block', 'dismiss'] : ['close', 'block', 'dismiss'];
}

/** Who decided, in a sentence. */
function decider(report: ModerationReport): string {
  const who =
    report.decidedBy === null
      ? 'a moderator'
      : memberText({ id: report.decidedBy, name: report.decidedByName ?? undefined });
  const when = report.decidedAt === null ? '' : ` ${timestamp(report.decidedAt, 'R')}`;
  return `${who}${when}`;
}

const REMOVED: Record<ReportRemoval, string> = {
  archive: 'archived',
  delete: 'deleted',
  denied: 'archived: Discord refused to delete it',
};

/** What came of a report that is no longer open, as the post's last line. */
function outcomeLine(report: ModerationReport): string {
  const by = `by ${decider(report)}`;
  const post = REMOVED[report.removal ?? 'archive'];
  const word =
    report.subject.kind === 'party' ? partyWord({ type: report.subject.partyType }) : 'message';
  switch (report.status) {
    case 'closed':
      return `**Closed** ${by}: its post is ${post}.`;
    case 'refused':
      return (
        `**Place refused** ${by}: no meetup can be held there from now on. The meetup is ` +
        `closed and its post ${post}.`
      );
    case 'blocked':
      return (
        `**Maker blocked** ${by} from creating meetups here. The meetup is closed and its ` +
        `post ${post}.`
      );
    case 'dismissed':
      return `**Dismissed** ${by}.`;
    case 'ended':
      return `**Ended**: the ${word} was over before a moderator decided.`;
    case 'deleted':
      return `**Message deleted** ${by}.`;
    case 'gone':
      return `**Gone**: the message was deleted before a moderator did (found ${by}).`;
    case 'open':
      return '';
  }
}

/** The edge of a report's post: amber while open, green once acted on, grey otherwise. */
function accentOf(report: ModerationReport): number {
  switch (report.status) {
    case 'open':
      return PENDING_ACCENT;
    case 'closed':
    case 'refused':
    case 'blocked':
    case 'deleted':
      return APPROVED_ACCENT;
    default:
      return EXPIRED_ACCENT;
  }
}

/** As much of a reported message's text as its post shows, once escaped. */
const COPY_ROOM = 1_500;
/** As much of its attachments' names as it shows, each and all of them. */
const NAME_ROOM = 100;
const ATTACHMENTS_ROOM = 600;

/** What a report's post says of a message a later report found changed (it shows the first copy). */
export const EDITED_SINCE = 'It was edited after the first report: this is what it said then.';

/** One reason: who gave it, when, and what they said (`plain`, one line). */
function reasonLine(reason: ReportReason): string {
  const who = memberText({ id: reason.reporterId, name: reason.reporterName ?? undefined });
  return `${who} ${timestamp(reason.at, 'R')}: ${plain(reason.text)}`;
}

/**
 * The reasons, as many whole ones as fit in `room` (the oldest first), then how many were left
 * out; the first is cut when even it alone does not fit.
 */
function reasonsText(reasons: readonly ReportReason[], room: number): string {
  const head = `**Reasons** (${String(reasons.length)})`;
  const lines = reasons.map(reasonLine);
  let kept = lines.length;
  const text = (n: number) =>
    [
      head,
      ...lines.slice(0, n),
      ...(n < lines.length ? [`…and ${String(lines.length - n)} more reasons`] : []),
    ].join('\n');
  while (kept > 1 && text(kept).length > room) kept--;
  const shown = text(kept);
  return truncate(shown, room);
}

/** The head of a party's report: what it is, its lines, who made it and in which region. */
function partyHead(subject: PartySubject): string {
  const maker = memberText({ id: subject.makerId, name: subject.makerName ?? undefined });
  // A battle is reported (a raid, a max battle: plan 8X-3); a meetup or a train is made.
  const madeBy =
    subject.partyType === 'raid' || subject.partyType === 'max' ? 'Reported by' : 'Created by';
  const region = subject.regionChannelId === null ? '' : ` in <#${subject.regionChannelId}>`;
  return [
    `### Reported ${partyWord({ type: subject.partyType })}`,
    ...subject.lines,
    `${madeBy} ${maker}${region}`,
  ].join('\n');
}

/**
 * The head of a message's report: who wrote it, where (in a party's post, the post's title as it
 * was when reported, once: its mention would name the post a second time, and says nothing once
 * the post is deleted; Go to message leads there), and when.
 */
function messageHead(subject: MessageSubject): string {
  const author = memberText({ id: subject.authorId, name: subject.authorName ?? undefined });
  const where =
    subject.partyTitle === null
      ? `<#${subject.channelId}>`
      : `the post of **${plain(subject.partyTitle)}**`;
  return `### Reported message\nWritten by ${author} in ${where} ` + timestamp(subject.sentAt, 'F');
}

/** The texts of a report's subject besides its head and its reasons. */
function subjectTexts(subject: PartySubject | MessageSubject): string[] {
  if (subject.kind === 'message') {
    // Cut after escaping: an escaped text may be twice as long as it was.
    const said =
      subject.text.trim() === '' ? '(no text)' : truncate(plainLines(subject.text), COPY_ROOM);
    const attachments =
      subject.attachments.length === 0
        ? []
        : [
            `**Attachments**: ${fitItems(
              subject.attachments.map((name) => truncate(plainNoLinks(name), NAME_ROOM)),
              ATTACHMENTS_ROOM,
            )}`,
          ];
    const edited = subject.edited === true ? [EDITED_SINCE] : [];
    const heading =
      subject.forwarded === true ? '**What it said** (forwarded)' : '**What it said**';
    return [`${heading}\n${said}`, ...attachments, ...edited];
  }
  return [
    ...(subject.place === null
      ? []
      : [`**Where**\n${placeLine(subject.place, { officialName: subject.officialName })}`]),
    ...(subject.information === null
      ? []
      : [`**Information**\n${plainLines(subject.information)}`]),
  ];
}

/** The address a report leads to: the party's post, or the reported message. */
function targetLink(report: ModerationReport): APIButtonComponent | undefined {
  const { subject } = report;
  if (subject.kind === 'message') {
    // A message deleted is gone, and so is the way to it.
    if (report.status === 'deleted' || report.status === 'gone') return undefined;
    return linkButton(
      'Go to message',
      undefined,
      postLink(report.serverId, subject.channelId, subject.messageId),
    );
  }
  if (subject.postId === null || report.removal === 'delete') return undefined;
  return linkButton('Go to post', undefined, postLink(report.serverId, subject.postId));
}

/**
 * The moderators' post of a report (plan 8S-2): what is reported (a party: what it is and when,
 * who made it, in which region, where, a meetup's information; a message: who wrote it, where,
 * when, a copy of its text and the names of its attachments), every reason with its reporter
 * (`memberText`; the words through `plain`), and while it is open the buttons of
 * `reportActions`, else what came of it; a link to the post or message while it is there. Text
 * members wrote goes through `plain` and `plainLines`, names through `plainNoLinks`.
 */
export function reportMessage(report: ModerationReport): V2Message {
  const { subject } = report;
  const head = subject.kind === 'party' ? partyHead(subject) : messageHead(subject);
  const texts = [head, ...subjectTexts(subject)];
  const outcome = report.status === 'open' ? undefined : outcomeLine(report);
  const used = texts.reduce((sum, text) => sum + text.length, 0) + (outcome?.length ?? 0);
  const components: APIComponentInContainer[] = [
    ...texts.map((text) => textDisplay(text)),
    textDisplay(reasonsText(report.reasons, Math.max(200, TEXT_BUDGET - used))),
  ];
  const link = targetLink(report);
  if (report.status === 'open') {
    const buttons: APIButtonComponent[] = reportActions(report).map((action) => ({
      type: ComponentType.Button,
      style: action === 'dismiss' ? ButtonStyle.Secondary : ButtonStyle.Danger,
      label: LABELS[action],
      custom_id: encodeCustomId({ kind: REPORT_KIND, id: report.id, action }),
    }));
    components.push(actionRow(link === undefined ? buttons : [...buttons, link]));
  } else {
    components.push(textDisplay(outcome ?? ''));
    if (link !== undefined) components.push(actionRow([link]));
  }
  return { v2: true, components: [container(accentOf(report), components)] };
}

/** The custom id of the radio group of a removal's dialog: `archive` or `delete`. */
export const REMOVAL_INPUT = 'removal';

/** What a removal's dialog is drawn from. */
export interface RemovalDialog {
  /**
   * The custom id of the dialog of these arguments: none for the dialog with the choice,
   * `archive` for the one that only archives (the bot may not delete there); `removalDialog`
   * adds the per-open token.
   */
  customId: (args: string[]) => string;
  /** When it opens: the per-open token of its id (`openToken`). */
  opened: number;
  /** The act: `Close this raid`, `Refuse this place`. */
  title: string;
  /** Today's question: `Close this raid?`. */
  question: string;
  /** Whether the bot may delete the post (`PartyService.mayDeletePost`). */
  mayDelete: boolean;
  /** The post's forum as a dialog names it (`channelInDialog`). */
  forum: string;
}

/**
 * The dialog before a party is ended by a moderator (plan 8Q; a report's Close…, Refuse place…
 * and Block maker…, and staff's `/delete`): the question, and the required radio group `The
 * post` with nothing picked: Archive post (it stays readable and locked) or Delete post (with
 * everything in it). Where the bot may not delete the post there is no choice: the text says
 * the post will be archived and why deleting it is not offered, and its custom id has the
 * argument `archive`. Each id ends in a per-open token (`openToken`): Discord's client shows what
 * was last submitted under an id, and the harsher way must never start picked.
 */
export function removalDialog(asked: RemovalDialog): APIModalInteractionResponseCallbackData {
  const token = openToken(asked.opened);
  if (!asked.mayDelete) {
    return dialog({
      customId: asked.customId(['archive', token]),
      title: asked.title,
      text: archiveOnlyText(asked.question, asked.forum),
    });
  }
  return dialog({
    customId: asked.customId([token]),
    title: asked.title,
    text: asked.question,
    choice: {
      id: REMOVAL_INPUT,
      label: REMOVAL_LABEL,
      // The words staff's Delete… on the map shows too (plan 8M-8B).
      options: REMOVAL_CHOICES.map((choice) => ({ ...choice })),
    },
  });
}

/**
 * The choice of a removal's dialog: its fixed `archive` (`args[0]`, after the per-open token is
 * left out), or the one picked.
 */
export function removalOf(
  interaction: ModalSubmitInteraction,
  args: readonly string[],
): PostRemoval | undefined {
  const [fixed] = withoutOpenToken(args);
  if (fixed !== undefined) return fixed === 'archive' ? 'archive' : undefined;
  return pickedOf(interaction, REMOVAL_INPUT, ['archive', 'delete'] as const);
}

/**
 * The custom-id kind of the Delete button of a pin battle's notice (Matt, 2026-10-21, final
 * review G1): `maxpin:<party id>:delete`, which opens the dialog of `/delete` (`pclose`).
 */
export const MAX_PIN_KIND = 'maxpin';

/**
 * The moderators' note of a Power Spot a screenshot showed and Pine does not know (plan 8X-S,
 * design 3): plain text, for their information only; the name as read, plain and cut short
 * (review R13), the channel as a mention.
 */
export function missingSpotNote(channelId: string, name: string): string {
  return (
    `A screenshot in <#${channelId}> showed the Power Spot "${plain(truncate(name, 80))}", ` +
    'which Pine does not know. A new Wayspot export may be due (`/gym import`).'
  );
}

/**
 * What the moderators are told of screenshots that keep disagreeing with the boss list (plan
 * 8X-J, `ModerationReports.listTier`): the boss as the list has it, its tier there and the tier
 * the heads say, how many screenshots, and the add in force that puts it at the list's tier.
 */
export interface ListTierNotice extends ListTierSighting {
  /** The server's snowflake. */
  serverId: string;
  /** The channel the screenshot that tipped it was posted in: the moderators' is found near it. */
  channelId: string;
  /** The boss's name as the list has it. */
  name: string;
  /** How `/admin boss` names it: its catalogue key, or `ids:<id>[:<form>]` (review M3). */
  pokemon: string;
  /** How many screenshots (`listTierDoubt`'s `count`). */
  count: number;
  /** The add in force whose tier the list has (review M7); none for the feed's. */
  overrideId?: number;
}

/** The heads a tier shows: a raid tier's number (`T1` 1, `T3` 3, `T5` 5), a Dynamax tier's stars. */
function headsOf(tier: RaidTier | MaxTier): number {
  if (typeof tier === 'string') return maxStars(tier) ?? 6;
  return Number(tier.level.slice(1));
}

/** A tier as the note says it: `2★` for a Dynamax tier, the raid tier's label otherwise. */
function noteTier(tier: RaidTier | MaxTier): string {
  return typeof tier === 'string' ? `${String(maxStars(tier) ?? '')}★` : bossTierLabel(tier);
}

/**
 * The moderators' note of screenshots that keep disagreeing with the boss list (plan 8X-J,
 * design section 2): plain text, for staff to judge; the command it names is a guide (review
 * M3), every add with `days:7` (I6), the tier by its choice's name as Discord shows it (`Dynamax
 * 2★`, `Shadow T5`; review J4: Discord finds a choice by its name), and where
 * an add puts the boss at the list's tier, its removal instead (M7). Member ids are never in it.
 */
export function listTierNote(notice: ListTierNotice): string {
  const name = plain(truncate(notice.name, 80));
  const boss = notice.family === 'max' ? `Dynamax ${name}` : name;
  const heads = headsOf(notice.headsTier);
  const shown =
    `Screenshots show **${boss}** with ${count(heads, 'head')} (${noteTier(notice.headsTier)}) ` +
    `${count(notice.count, 'time')} since yesterday, but the boss list has it at ` +
    noteTier(notice.listTier);
  const then = `If the game has it at ${noteTier(notice.headsTier)}`;
  if (notice.overrideId !== undefined) {
    const id = String(notice.overrideId);
    return (
      `${shown}, by override #${id}. ${then}, that override may be wrong: ` +
      `\`/admin boss remove override:${id}\``
    );
  }
  return (
    `${shown}. ${then}, this would move it there: ` +
    `\`/admin boss add pokemon:${notice.pokemon} tier:${bossTierLabel(notice.headsTier)} days:7\``
  );
}

/** What the moderators' channel is told of a max battle reported at a pin (`maxPinNotice`). */
export interface MaxPinNotice {
  /** The server's snowflake. */
  serverId: string;
  partyId: string;
  postId: string;
  /** The battle as the reporter named it: `Dynamax Machop (2★)`. */
  boss: string;
  reporter: NamedMember;
  regionChannelId: string;
  pin: { lat: number; lon: number };
}

/** How a pin battle went, once it is over: by itself (`ended`), or closed by staff. */
export type MaxPinOutcome = { kind: 'ended' } | { kind: 'closed'; by: NamedMember };

/**
 * The moderators' notice of a max battle at an unlisted power spot (Matt, 2026-10-21, final
 * review G1): for their information only (the battle is posted already, and nothing waits on
 * it, so in a neutral colour, `NEWS_COLOUR`): what, who reported it (`memberText`) and where,
 * the pin with its Map, and Delete (the dialog of `/delete`, staff only) and Go to post. Once the
 * battle is over (`outcome`, fix review (a)) its last line says how, in grey, without Delete.
 */
export function maxPinNotice(notice: MaxPinNotice, outcome?: MaxPinOutcome): V2Message {
  const last =
    outcome === undefined
      ? '-# It is posted already, at a Power Spot Pine does not know and nobody has checked. ' +
        'Delete… closes it as `/delete` does.'
      : outcome.kind === 'ended'
        ? 'This max battle has ended.'
        : `Closed by ${memberText(outcome.by)}.`;
  const text = [
    '### Max battle at an unlisted power spot',
    `${plainNoLinks(notice.boss)}, reported by ${memberText(notice.reporter)} in ` +
      `<#${notice.regionChannelId}>.`,
    `📍 **${UNLISTED_SPOT}** · ${mapMarkdown(notice.pin)}`,
    last,
  ].join('\n');
  const remove: APIButtonComponent = {
    type: ComponentType.Button,
    style: ButtonStyle.Danger,
    label: 'Delete…',
    custom_id: encodeCustomId({ kind: MAX_PIN_KIND, id: notice.partyId, action: 'delete' }),
  };
  const go = linkButton('Go to post', undefined, postLink(notice.serverId, notice.postId));
  const buttons = outcome === undefined ? [remove, go] : [go];
  const accent = outcome === undefined ? NEWS_COLOUR : EXPIRED_ACCENT;
  return {
    v2: true,
    components: [container(accent, [textDisplay(text), actionRow(buttons)])],
  };
}
