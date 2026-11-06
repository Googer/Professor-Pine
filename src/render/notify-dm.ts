import {
  ButtonStyle,
  ComponentType,
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
  type APIComponentInContainer,
  type APIComponentInMessageActionRow,
  type APIMessageTopLevelComponent,
} from 'discord.js';
import { encodeCustomId, encodeCustomIdIfFits } from '../discord/custom-id.js';
import type { V2Message } from '../discord/party-gateway.js';
import { stopArgs, type NotifyReason } from '../domain/notify/reasons.js';
import type { BoxSubject } from '../domain/pogo/want-boxes.js';
import type { TrainKind } from '../domain/party/party.js';
import { raidTierLabel, type RaidTier } from '../domain/pogo/raid-tier.js';
import { TRAIN_KIND_WORDS } from './train-words.js';
import { cutText, MAX_COMPONENTS, type PartyBrief } from './party-post.js';
import { endSentence, memberName, plain, plainNoLinks, type NamedMember } from './text.js';
import {
  actionRow,
  container,
  countComponents,
  linkButton,
  section,
  separator,
  textDisplay,
  thumbnail,
} from './v2.js';

/** The custom-id kind of the buttons under a direct message. */
export const DM_KIND = 'dm';
/** The action of a button that stops one reason a direct message came for. */
export const STOP_ACTION = 'stop';
/**
 * The action of Manage… (plan 8R-4): it opens `/want`'s dialog of a species, a form beyond the
 * Which field or a tier for the server of the button (`changeButtonId`).
 */
export const CHANGE_ACTION = 'change';
const CHANGE_LABEL = 'Manage…';
const CHANGED_LABEL = 'Changed';
const REMOVED_LABEL = 'Removed';
/** The label of a stop button, and of one that was pressed (it stays, disabled). */
const STOP_LABEL = 'Stop';
const STOPPED_LABEL = 'Stopped';
/** The components a reason with a button takes: the section, its text and the button. */
const STOP_SECTION = 3;

/**
 * As many reasons of one message as get a section with a button: a message holds
 * `MAX_COMPONENTS`, and each such reason takes `STOP_SECTION`, beside what the rest of the
 * message takes (`used`: the container, the news, its picture, the row of links and its
 * buttons, the line and the heading of the reasons) and the one text that lists the reasons
 * left without a button.
 */
export function stopButtonRoom(used: number): number {
  return Math.max(0, Math.floor((MAX_COMPONENTS - used - 1) / STOP_SECTION));
}
/** As much of a reason's label as a message shows. */
const LABEL_ROOM = 150;

/**
 * The custom id of the button that stops a reason in a server; undefined when it would not fit
 * into a custom id (a form with a very long key): the message then has no button for that
 * reason and names the command instead.
 */
export function stopButtonId(guildId: string, reason: NotifyReason): string | undefined {
  return encodeCustomIdIfFits({
    kind: DM_KIND,
    id: guildId,
    action: STOP_ACTION,
    args: stopArgs(reason),
  });
}

/**
 * The custom id of Manage… of a subject in a server (plan 8R-4): `dm:<server>:change:sp:<dex>`
 * for a species, `…:sp:<dex>:<form>` for a form beyond the Which field (an Unown letter),
 * `…:st:<level>` for a tier (`stopArgs`' spelling of a subject); undefined where it would not
 * fit (a form with a very long key: the message names the command then).
 */
export function changeButtonId(guildId: string, subject: BoxSubject): string | undefined {
  return encodeCustomIdIfFits({
    kind: DM_KIND,
    id: guildId,
    action: CHANGE_ACTION,
    args: stopArgs({ kind: 'subject', subject }),
  });
}

/**
 * The custom id of Manage… of Team GO Rocket in a server (plan 8R-4, design 4b):
 * `dm:<server>:change:rocket`, which opens the one Rocket dialog for that server.
 */
export function rocketChangeButtonId(guildId: string): string {
  return encodeCustomId({ kind: DM_KIND, id: guildId, action: CHANGE_ACTION, args: ['rocket'] });
}

/** A message's rows of controls as Discord's API has them. */
export type ControlRows = APIActionRowComponent<APIComponentInMessageActionRow>[];

/**
 * The rows of a message without the button of this custom id; a row that has nothing left
 * goes too. What a press of a stop button leaves of the message's controls.
 */
export function withoutButton(rows: ControlRows, customId: string): ControlRows {
  return rows
    .map((row) => ({
      ...row,
      components: row.components.filter(
        (control) => !('custom_id' in control) || control.custom_id !== customId,
      ),
    }))
    .filter((row) => row.components.length > 0);
}

/**
 * A components-v2 direct message with the stop button of this custom id pressed: it stays where
 * it was (a section must keep its accessory), disabled and labelled `Stopped`, with the same
 * custom id (a disabled button cannot be pressed, and the id still says what it stopped); the
 * rest of the message is as it was.
 */
export function withStopped(
  components: readonly APIMessageTopLevelComponent[],
  customId: string,
): APIMessageTopLevelComponent[] {
  return withPressed(components, customId, STOPPED_LABEL);
}

/**
 * A components-v2 direct message after a Submit of the dialog its Manage… opened (plan 8R-4):
 * that button disabled and labelled `Changed`, or `Removed` where Remove was ticked, as a pressed
 * Stop is (`withStopped`).
 */
export function withChanged(
  components: readonly APIMessageTopLevelComponent[],
  customId: string,
  removed: boolean,
): APIMessageTopLevelComponent[] {
  return withPressed(components, customId, removed ? REMOVED_LABEL : CHANGED_LABEL);
}

/** The message with the button of this custom id disabled, under `label`; the rest as it was. */
function withPressed(
  components: readonly APIMessageTopLevelComponent[],
  customId: string,
  label: string,
): APIMessageTopLevelComponent[] {
  const visit = (component: object): object => {
    const button = component as { type?: unknown; custom_id?: unknown };
    if (button.type === ComponentType.Button && button.custom_id === customId) {
      return { ...component, style: ButtonStyle.Secondary, label, disabled: true };
    }
    const nested = component as { components?: object[]; accessory?: object };
    return {
      ...component,
      ...(Array.isArray(nested.components) ? { components: nested.components.map(visit) } : {}),
      ...(nested.accessory === undefined ? {} : { accessory: visit(nested.accessory) }),
    };
  };
  return components.map((component) => visit(component) as APIMessageTopLevelComponent);
}

/**
 * A link to a post, or to a message in a channel, that works in a direct message. A mention
 * (`<#id>`) of a forum post reads "#unknown" in a client that has not opened the forum, and
 * the reader of a DM has usually not; the address always opens the post.
 */
export function postLink(guildId: string, postId: string, messageId?: string): string {
  const message = messageId === undefined ? '' : `/${messageId}`;
  return `https://discord.com/channels/${guildId}/${postId}${message}`;
}

/** A word with its article: `a T5`, `an Elite`. */
function withArticle(word: string): string {
  return `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;
}

/** `(#region)` after a gym, or nothing when the region is gone. */
function inRegion(regionChannelId: string | undefined): string {
  return regionChannelId === undefined ? '' : ` (<#${regionChannelId}>)`;
}

/** What a direct message about a raid says in its first line. */
export interface RaidDmView {
  /**
   * What happened: the raid was reported; it got a boss, another boss or another tier; it
   * moved to another gym.
   */
  event: 'reported' | 'boss' | 'gym';
  tier: RaidTier;
  /** The boss's name as the post shows it; undefined for an egg. */
  boss: string | undefined;
  /** For `boss`: the raid had another boss before, so this one is a correction. */
  corrected?: boolean;
  /** The gym's name (its nickname when it has one), as the post's title has it. */
  gym: string;
  /** The text channel of the raid's region; undefined when the region is gone. */
  regionChannelId: string | undefined;
  /** Who reported it, for a report that is not anonymous. Only a report names anybody. */
  reporter: NamedMember | undefined;
}

/**
 * The first line of a direct message about a raid: the legacy bot's sentence in today's terms,
 * without the address of the post, which is the message's "Go to post" button.
 * A member is named by their display name alone: a mention reads "@unknown-user" in a DM,
 * whose reader's client has rarely loaded that member. Nobody is named for a change of the
 * boss or the gym: the legacy bot said "by" whoever acted, as if they had reported the raid.
 * A raid at another gym is said as the correction it nearly always is (a raid does not move),
 * to a reader who hears of it for the first time: where it is, not where it went.
 */
export function raidDmSentence(view: RaidDmView): string {
  const where = `**${plain(view.gym)}**${inRegion(view.regionChannelId)}`;
  const egg = `${raidTierLabel(view.tier)} egg`;
  const what = view.boss === undefined ? egg : `raid for **${plain(view.boss)}**`;
  switch (view.event) {
    case 'reported': {
      const subject = view.boss === undefined ? withArticle(egg) : `A ${what}`;
      const by = view.reporter ? ` by **${memberName(view.reporter)}**` : '';
      const sentence = endSentence(`${subject} has been reported at ${where}${by}`);
      return sentence.charAt(0).toUpperCase() + sentence.slice(1);
    }
    case 'boss':
      if (view.boss === undefined) {
        return `The raid at ${where} is ${withArticle(egg)} now.`;
      }
      return view.corrected
        ? `The boss of the raid at ${where} is now **${plain(view.boss)}**.`
        : `The raid at ${where} now has its boss, **${plain(view.boss)}**.`;
    case 'gym':
      return `The ${what} is at ${where}, not where it was first reported.`;
  }
}

/** What a direct message about a max battle says (plan 8X-3; design 3.3, 3.4). */
export interface MaxDmView {
  /** A report, or a boss the battle has now (`/boss`, a rotation). */
  event: 'reported' | 'boss';
  /** `Dynamax Machamp (2★)` (`maxBossTitle`). */
  title: string;
  /** The spot by name (`maxSpotName`). */
  spot: string;
  /** A pin: in running text "an unlisted power spot", not its label (plan 8X-F). */
  pin: boolean;
  regionChannelId: string | undefined;
  /** Who reported it; undefined for one who asked not to be named. */
  reporter?: NamedMember | undefined;
}

/**
 * The first line of a DM about a max battle, the spot in the place of a raid's gym: `A **Dynamax
 * Machamp (2★)** battle has been reported at **Gazebo** (#west) by **Rita**.`, `The max battle
 * at **Gazebo** (#west) is now against **Dynamax Sneasel (1★)**.`; a pin `at an unlisted power
 * spot (#west)` (plan 8X-F). The sentence ends once after a name that ends in a period.
 */
export function maxDmSentence(view: MaxDmView): string {
  // The spot's and the boss's names reach other members' DMs: no address in them is a link.
  const spot = view.pin ? 'an unlisted power spot' : `**${plainNoLinks(view.spot)}**`;
  const where = `${spot}${inRegion(view.regionChannelId)}`;
  const title = `**${plainNoLinks(view.title)}**`;
  if (view.event === 'boss') return `The max battle at ${where} is now against ${title}.`;
  const by = view.reporter ? ` by **${memberName(view.reporter)}**` : '';
  return endSentence(`A ${title} battle has been reported at ${where}${by}`);
}

/** The note of a max battle's want DM (Q8): the hour in which no more of the boss is told. */
export function maxHourNote(title: string): string {
  return `You won't be told about more ${plainNoLinks(title.replace(/ \(\d★\)$/, ''))} battles for an hour.`;
}

/**
 * The first line for a member who is signed up for an egg that got its boss and asked to hear
 * that (the boss DMs of `/settings`): what it hatched into, or will, said for them rather than as news
 * of a raid they may want; and for a boss that took the place of another, that it is now this
 * one.
 */
export function bossSetSentence(view: {
  boss: string;
  gym: string;
  regionChannelId: string | undefined;
  /** Whether the egg has hatched by now; a boss can be named before. */
  hatched: boolean;
  /** The raid had another boss before: this one corrects it. */
  corrected?: boolean;
}): string {
  const where = `**${plain(view.gym)}**${inRegion(view.regionChannelId)}`;
  const boss = `**${plain(view.boss)}**`;
  if (view.corrected) return `The boss of the raid at ${where} is now ${boss}.`;
  return view.hatched
    ? `The egg at ${where} hatched into ${boss}.`
    : `The boss of the egg at ${where} is ${boss}.`;
}

/** The first line of a direct message about a new train: the legacy bot's sentence. */
export function trainDmSentence(view: {
  regionChannelId: string | undefined;
  /** Who made it; left out for a maker who chose not to be named. */
  maker?: NamedMember | undefined;
  /** Its kind (plan 8X-4): a train of max battles is named by it; a raid train is "a train". */
  kind?: TrainKind;
}): string {
  const where = view.regionChannelId === undefined ? '' : ` in <#${view.regionChannelId}>`;
  const by = view.maker ? ` by **${memberName(view.maker)}**` : '';
  const what =
    view.kind === undefined || view.kind === 'raid' ? 'train' : TRAIN_KIND_WORDS[view.kind];
  return `A new ${what} has been announced${where}${by}.`;
}

/** `3 trainers are attending`, `1 trainer is attending`. */
function attending(heads: number): string {
  return heads === 1 ? '1 trainer is attending' : `${String(heads)} trainers are attending`;
}

/**
 * The direct message about a time members meet at: the meeting time of a raid's group (`what`
 * is `meeting`) or the start of a train or meetup (`start`), set or, with `time` null, taken
 * away again. It exists for its notification, which a phone shows as raw text (Matt,
 * 2026-10-15): so no markdown, the time and what it is for first, and the address last.
 * `subject` is what the time is for (`the raid at The Stacks`, made plain by the caller);
 * `time` is the moment as the sentence shows it (a Discord timestamp); `heads` is the number of
 * trainers as the post counts them.
 */
export function meetingDmSentence(view: {
  what: 'meeting' | 'start';
  subject: string;
  /** Who set it; null for the maker of a train who asked not to be named. */
  by: NamedMember | null;
  time: string | null;
  heads: number;
  link: string;
  /** Where a meetup is (`placeSummary`, without links), said last on a line of its own. */
  place?: string | undefined;
}): string {
  const where = view.place === undefined ? '' : `\nWhere: ${view.place}`;
  const name = view.by === null ? undefined : memberName(view.by);
  if (view.time === null) {
    const done = view.what === 'meeting' ? 'canceled' : 'removed';
    const by = name === undefined ? '' : ` (${done} by ${name})`;
    return `No ${view.what} time any more for ${view.subject}${by}: ${view.link}${where}`;
  }
  const by = name === undefined ? '' : ` (set by ${name})`;
  const verb = view.what === 'meeting' ? 'Meet' : 'Start';
  return `${verb} at ${view.time} for ${view.subject}${by}. ${attending(view.heads)}: ${view.link}${where}`;
}

/** One reason a direct message came, as it is shown: its label, and the button that stops it. */
export interface ShownReason {
  /** What the member asked for, made plain: `Yveltal`, `T5 raids`, `raids at The Stacks`. */
  label: string;
  /**
   * The custom id of the button that stops it (`stopButtonId`). Left out for a message that
   * has no opt-out, and undefined for a reason whose id does not fit: `command` is named then.
   */
  stop?: string | undefined;
  /** The command that stops it in the server, as a member types it: `/unwant`. */
  command?: string;
  /**
   * A reason of a Pokémon or a tier (plan 8R-4): Manage… instead of Stop. Its custom id
   * (`changeButtonId`; undefined where it does not fit), the want's name (made plain:
   * `Costumed Pikachu`) and the box it fired by (`Raids`, `Research`). Reasons of one custom id
   * are one section, `Pikachu · Raids, Research`, with one button (F5), named by `group` (the
   * species') where their names differ (a form's want beside the species').
   */
  change?: { customId: string | undefined; name: string; box?: string; group?: string };
}

/** The reasons as the sections show them: those of one Manage… together, in their order. */
function grouped(reasons: readonly ShownReason[]): ShownReason[] {
  const shown: ShownReason[] = [];
  const boxes = new Map<string, string[]>();
  const names = new Map<string, Set<string>>();
  for (const reason of reasons) {
    const id = reason.change?.customId;
    const known = id === undefined ? undefined : boxes.get(id);
    const box = reason.change?.box;
    if (reason.change && known) {
      if (box !== undefined && !known.includes(box)) known.push(box);
      names.get(id ?? '')?.add(reason.change.name);
      continue;
    }
    if (reason.change && id !== undefined) {
      boxes.set(id, box === undefined ? [] : [box]);
      names.set(id, new Set([reason.change.name]));
    }
    shown.push(reason);
  }
  return shown.map((reason) => {
    if (!reason.change) return reason;
    const id = reason.change.customId;
    const own = reason.change.box === undefined ? [] : [reason.change.box];
    const said = id === undefined ? own : (boxes.get(id) ?? []);
    const all = id === undefined ? [reason.change.name] : [...(names.get(id) ?? [])];
    // Reasons without a box (Team GO Rocket's) are named as they are, together.
    if (said.length === 0) return { ...reason, label: all.join(', ') };
    const name = all.length > 1 ? (reason.change.group ?? reason.change.name) : reason.change.name;
    return { ...reason, label: `${name} · ${said.join(', ')}` };
  });
}

/** A button under the news of a direct message: the post, the report, the gym's place. */
export interface DmLink {
  label: string;
  emoji: string;
  url: string;
}

/** The button to the post a direct message is about (`postLink`). */
export function postButton(url: string): DmLink {
  return { label: 'Go to post', emoji: '↗️', url };
}

/** The button to a spawn report in its region's channel (`postLink` with the message). */
export function reportButton(url: string): DmLink {
  return { label: 'Go to report', emoji: '↗️', url };
}

/** The button to a gym's place in Google Maps, as the post's own. */
export function mapLink(url: string): DmLink {
  return { label: 'Map', emoji: '🗺️', url };
}

/**
 * What a direct message of the notifier says: its sentence (the news), what it is about in brief
 * (a party's `brief`, a spawn's), and the buttons that lead there.
 */
export interface DmNews {
  sentence: string;
  /** Undefined when the party could not be shown: the sentence stands alone then. */
  brief?: Pick<PartyBrief, 'accent' | 'picture' | 'pictureFile' | 'lines'> | undefined;
  links: readonly DmLink[];
  /**
   * Said in small print under the news and its links, above the reasons and their Stop buttons
   * (a max battle's want: no more of that boss for an hour, plan 8X-3, Q8), so that a quiet hour
   * does not look like broken notifications; beside Stop it read as what Stop does (plan 8X-F).
   */
  note?: string;
}

/** The colour of a direct message whose party could not be shown. */
export const NEWS_COLOUR = 0x3498db;

/** The button of a reason, as a section shows it beside the reason's label. */
function stopButton(customId: string, label = STOP_LABEL): APIButtonComponentWithCustomId {
  return {
    type: ComponentType.Button,
    style: ButtonStyle.Secondary,
    custom_id: customId,
    label,
  };
}

/**
 * The sentence for the reasons that could be stopped but got no button (their id does not fit,
 * or there are more than `stopButtonRoom` allows): which command stops them, and of a Manage…
 * (plan 8R-4) `/want` that changes it too. Empty when there is none.
 */
export function stopHint(reasons: readonly ShownReason[]): string {
  const changes = reasons.some((reason) => reason.change !== undefined);
  const commands = [
    ...new Set([
      ...(changes ? ['`/want`'] : []),
      ...reasons.flatMap((reason) =>
        reason.command === undefined ? [] : [`\`${reason.command}\``],
      ),
    ]),
  ];
  if (commands.length === 0) return '';
  const last = commands.pop() ?? '';
  const named = commands.length === 0 ? last : `${commands.join(', ')} or ${last}`;
  return `-# To ${changes ? 'change or stop' : 'stop'} what has no button here, use ${named} in the server.`;
}

/**
 * A direct message of the notifier, a components-v2 message in one container of the post's
 * colour: the sentence first (a phone's notification, if it reads anything, reads the news),
 * the brief's lines under it with the picture beside them; a row of links (the post, the gym's
 * place); the note (`-#`, the hour in which no more is told); and under a line `-# You asked to
 * be told about` the reasons that get no button (their custom id does not fit, or more than the
 * message has room for beside its links, picture and note: `stopButtonRoom`) listed together in
 * one text with the command that stops them, then, last of all, one section per reason with its
 * Stop button beside it (plan 8X-F: the buttons after all text). Nothing else of the post: who
 * comes and the boss's facts stay there. It pings nobody.
 */
export function notifyDm(news: DmNews, reasons: readonly ShownReason[]): V2Message {
  const { brief } = news;
  const parts: APIComponentInContainer[] = [];
  const first = [news.sentence, ...(brief?.lines ?? [])].join('\n');
  parts.push(
    brief?.picture === undefined ? textDisplay(first) : section(first, thumbnail(brief.picture)),
  );
  if (news.links.length > 0) {
    parts.push(actionRow(news.links.map((link) => linkButton(link.label, link.emoji, link.url))));
  }
  // The note belongs to the news, above the reasons: beside the Stop buttons it read as what
  // Stop does (plan 8X-F, Matt).
  if (news.note !== undefined) parts.push(textDisplay(`-# ${news.note}`));
  if (reasons.length > 0) {
    parts.push(separator(), textDisplay('-# You asked to be told about'));
    const label = (reason: ShownReason): string => cutText(reason.label, LABEL_ROOM);
    // The container and everything in it so far, the note too.
    const most = stopButtonRoom(1 + countComponents(parts));
    let buttons = 0;
    const stoppable: APIComponentInContainer[] = [];
    const rest: ShownReason[] = [];
    for (const reason of grouped(reasons)) {
      const change = reason.change?.customId;
      if (reason.change && change !== undefined && buttons < most) {
        buttons += 1;
        stoppable.push(section(label(reason), stopButton(change, CHANGE_LABEL)));
      } else if (!reason.change && reason.stop !== undefined && buttons < most) {
        buttons += 1;
        stoppable.push(section(label(reason), stopButton(reason.stop)));
      } else {
        rest.push(reason);
      }
    }
    if (rest.length > 0) {
      const hint = stopHint(rest);
      parts.push(textDisplay([...rest.map(label), ...(hint === '' ? [] : [hint])].join('\n')));
    }
    // The Stop and Manage… buttons last, after all text (plan 8X-F), in the reasons' order.
    parts.push(...stoppable);
  }
  return {
    v2: true,
    components: [container(brief?.accent ?? NEWS_COLOUR, parts)],
    // The picture of an egg where the bot serves no web pages is a file of the message.
    ...(brief?.pictureFile === undefined ? {} : { files: [brief.pictureFile] }),
  };
}
