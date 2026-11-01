import { ComponentType, type APIButtonComponent, type APIComponentInContainer } from 'discord.js';
import type { MessageFile, V2Message } from '../discord/party-gateway.js';
import {
  headCount,
  lobbyCount,
  membersWhere,
  type Attendee,
  type GroupId,
  type Party,
  type PartyGroup,
  type Team,
} from '../domain/party/party.js';
import { DEFAULT_LOBBIES } from '../domain/party/lobby.js';
import { PartyStatus } from '../domain/party/status.js';
import { meetIcon, statusIcon, type ShownStatus } from './party-controls.js';
import { count, memberName, plain, timestamp } from './text.js';
import {
  actionRow,
  container,
  countComponents,
  section,
  separator,
  textDisplay,
  thumbnail,
} from './v2.js';

/** The names of the forum tags a post can carry (spec 5.1). At most five are applied. */
export const FORUM_TAGS = [
  'Egg',
  'Hatched',
  'Ended',
  'T1',
  'T3',
  'T5',
  'Mega',
  'Elite',
  'Shadow',
  'Train',
  'Meetup',
  'Max battle',
] as const;
export type ForumTag = (typeof FORUM_TAGS)[number];

/**
 * Tags the bot once gave its forums and no longer uses: `/admin setup-forums` takes them off a
 * forum. Only these: a tag the server made itself is never removed.
 */
export const RETIRED_TAGS = ['EX'] as const;

/** The colour of the post of a party that is over, whatever its kind. */
export const ENDED_COLOUR = 0xe74c3c;

/** Said in the post of a party that a moderator keeps (`/admin save-party`). */
export const KEPT_OPEN = 'Kept open by a moderator: this post is not archived by itself.';

/**
 * Emoji as message text (`<:pineshiny:123>`): the bot's application's of that name, else the
 * server's, else plain characters.
 */
export interface PostEmoji {
  shiny: string;
  remote: string;
  teams: Readonly<Record<Team, string>>;
  /** Before the members without a team; nothing where no emoji of that name exists. */
  teamless?: string;
  /**
   * The emoji of one of the game's icons by its name (`GAME_ICON_NAMES`), as message text,
   * undefined where there is none: the text then names it in words.
   */
  icon?: (name: string) => string | undefined;
  /**
   * The application's own emoji of that name, as message text, for the controls
   * (`controlEmoji`, plan 8D-G): never a server's, whose cache may be stale and which the bot
   * may not be allowed to use, since a button with an emoji Discord refuses has the whole
   * message refused. Undefined where the application has none: the button shows a plain emoji.
   */
  controlIcon?: (name: string) => string | undefined;
}

/** What the lists of trainers in a post are made from. */
export interface TrainersView {
  party: Party;
  emoji: PostEmoji;
  /**
   * How many trainers one group holds (`lobbySize`), where the party has a size: each group's
   * heading then counts its lobby, `3/4 coming · 1 interested`. Undefined for every party of
   * today, whose post is as it was.
   */
  lobbySize?: number | undefined;
  /**
   * Above how many heads a group is told to split up (`splitLobby`: `settings.lobbies.raid` for a
   * raid and a train); null where the kind of party never is. The settings' default
   * (`DEFAULT_LOBBIES.raid`) when unset.
   */
  splitLobby?: number | null | undefined;
}

/** What a forum post of a party shows. */
export interface RenderedPost {
  /** The post's title. */
  title: string;
  /** Names of the tags to apply. */
  tags: ForumTag[];
  /**
   * The post laid out: what its other forms are made of (`postMessage`): without its picture,
   * without its controls, a copy in another channel.
   */
  layout: PostLayout;
  /**
   * The whole first message, the one that is sent and edited: `postMessage(layout)`, a
   * components-v2 message. This is the only place that builds it.
   */
  message: V2Message;
  /**
   * The party as a direct message shows it under its sentence (`notifyDm`): what is needed to
   * decide whether to go, in lines the post itself shows, without its lists of trainers.
   */
  brief: PartyBrief;
}

/**
 * A party in brief, for a direct message: the colour and the picture of its post, a few of its
 * lines (what it is, when, how many come), and for a raid at a known gym the gym's address in
 * Google Maps (the DM's Map button).
 */
export interface PartyBrief {
  accent: number;
  picture?: string;
  /** The file `picture` names when it is one of the message (an egg's), which the DM carries. */
  pictureFile?: MessageFile;
  lines: string[];
  /**
   * The one of `lines` that says where the party is (a meetup's place, a train's stop), which a
   * report to the moderators leaves out: its own Where says it with more (plan 8S-2).
   */
  whereLine?: string;
  map?: string;
}

/** The post of a party, its message made of its layout. */
export function renderedPost(post: Omit<RenderedPost, 'message'>): RenderedPost {
  return { ...post, message: postMessage(post.layout) };
}

/** Runs of white space become one space and the ends are trimmed: Discord keeps titles so. */
export function tidyTitle(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** What a post adds to an attendee's name for those they bring: ` +2`, or nothing. */
export function guestsOf(attendee: Attendee): string {
  return attendee.number > 1 ? ` +${attendee.number - 1}` : '';
}

function attendeeText(memberId: string, attendee: Attendee, emoji: PostEmoji): string {
  const name = memberName({ id: memberId, name: attendee.name });
  return `${name}${guestsOf(attendee)}${attendee.remote ? ` ${emoji.remote}` : ''}`;
}

/**
 * The texts of a list of members that is in shown order: each member by the name the bot last
 * saw (a mention would double every entry, and reads "@unknown-user" where the reader's client
 * has not loaded the member; only one the bot has no name for is a mention), and the emoji of a team
 * once, before the first of its members (a server's own emoji is some thirty characters, which
 * for every trainer would halve what fits into a field). Members without a team have the
 * `teamless` emoji where there is one, and nothing otherwise.
 */
export function attendeeTexts(
  party: Party,
  memberIds: readonly string[],
  emoji: PostEmoji,
): string[] {
  let before: Team | 'none' | undefined;
  return memberIds.map((id) => {
    const attendee = party.attendees[id];
    if (!attendee) return `<@${id}>`;
    const text = attendeeText(id, attendee, emoji);
    const team = attendee.team ?? 'none';
    const first = team !== before;
    before = team;
    const mark = attendee.team ? emoji.teams[attendee.team] : emoji.teamless;
    return first && mark !== undefined ? `${mark} ${text}` : text;
  });
}

const byName = new Intl.Collator('en', { sensitivity: 'base' });

/** Members without a team first, then the teams in this order (as the legacy bot listed them). */
const TEAM_ORDER: readonly (Team | undefined)[] = [undefined, 'instinct', 'mystic', 'valor'];

/**
 * The members of a list in the order they are shown: by team, then by the name the bot last saw
 * (members it has no name for come last), and for the rest the order they signed up in.
 */
export function inShownOrder(party: Party, memberIds: readonly string[]): string[] {
  const rank = (id: string): number => TEAM_ORDER.indexOf(party.attendees[id]?.team);
  const name = (id: string): string | undefined => party.attendees[id]?.name;
  return memberIds
    .map((id, index) => ({ id, index }))
    .sort((a, b) => {
      const byTeam = rank(a.id) - rank(b.id);
      if (byTeam !== 0) return byTeam;
      const [left, right] = [name(a.id), name(b.id)];
      if (left === undefined || right === undefined) {
        if (left !== right) return left === undefined ? 1 : -1;
        return a.index - b.index;
      }
      return byName.compare(left, right) || a.index - b.index;
    })
    .map(({ id }) => id);
}

/** Discord takes at most this many components in one message, every nested one counted. */
export const MAX_COMPONENTS = 40;

/**
 * The characters the text of a post may take in all. Discord documents no total for the text
 * displays of a message; 4,000 (what one text display holds) is assumed, and this is the one
 * place to change it. The room of a copy's leading line (`LEAD_ROOM`) is kept free.
 */
export const TEXT_BUDGET = 4_000;

/** What a copy of a post in another channel adds above it (`renderMirror`), at most. */
export const LEAD_ROOM = 200;

/**
 * A button of a post. `moves` marks those of a train that are for its own post ("Move…",
 * "Manage…", "Split…"), which a copy for the members of another region leaves out. `plain` is the
 * emoji a button with a custom one shows instead where Discord refuses that (`customEmoji:
 * false`, plan 8D-G).
 */
export interface PostButton {
  button: APIButtonComponent;
  moves?: true;
  plain?: string;
}

/**
 * A picture of its own beside a part of a post (the gym's picture from Wayfarer beside what the
 * post says about the gym, plan 8W-2): an https address `wayspotPicture` allows. Left out with
 * the post's picture (`picture: false`) and where it would make the message too large; the part
 * is then `withoutPicture`: its text unchanged when undefined, this text, or no part (null).
 */
export interface PostThumbnail {
  thumbnail: string;
  withoutPicture?: string | null;
}

/**
 * A part of a post, before it is made a message (`postMessage`): text, a thin line, a text with
 * the post's picture, a picture of its own or a button beside it, or rows of buttons. A section's
 * `details` stand in a text of their own under it (plan 8D-F: the Discord app on a phone puts a
 * button under a text of more than one line, so the text beside a button is one line, a status's
 * heading, and its names are its details); `postMessage` puts them back into the section where
 * the message would otherwise hold too many components, and into its text where nothing stands
 * beside it.
 */
export type PostBlock =
  | {
      type: 'text';
      content: string;
      role?: BlockRole;
    }
  | { type: 'separator' }
  | {
      type: 'section';
      content: string;
      accessory: 'picture' | PostButton | PostThumbnail;
      details?: string;
      role?: BlockRole;
    }
  | { type: 'controls'; rows: PostButton[][] };

/**
 * What a text of a post is about (plan 8M-8A), for the live map's phone card, which shows the
 * heading block (what the party is, its times, its boss) and the main buttons and leaves the rest
 * to the whole post: `head`, `where` (its place, and a train's stops ahead), `trainers` (who
 * comes, a group's text each, and the meeting-time hint), `note` (the small print of who
 * reported or made it). Set by the renderers; Discord's message never shows it (`postMessage`
 * ignores it). A text without one (a meetup's information) is only in the whole post.
 */
export type BlockRole = 'head' | 'where' | 'trainers' | 'note';

/** A text of a post marked with its role; any other block as it is. */
export function inRole(role: BlockRole, block: PostBlock): PostBlock {
  return block.type === 'text' || block.type === 'section' ? { ...block, role } : block;
}

/** A post as its renderer lays it out: the colour of its edge, its picture and its parts. */
export interface PostLayout {
  accent: number;
  /** The address of the picture beside its first lines (a boss, an egg). */
  picture?: string;
  /**
   * The file `picture` names when it is one of the message (`attachment://<name>`: an egg's
   * picture where the bot serves no web pages, plan 8D-F), carried wherever the picture is shown.
   */
  pictureFile?: MessageFile;
  blocks: PostBlock[];
}

/**
 * The first picture a post shows: its own (a boss, an egg), else the first of its parts' (the
 * gym's); undefined for a post without any. A post with one is sent again without its pictures
 * (`picture: false`) when Discord refuses it.
 */
export function layoutPicture(layout: PostLayout): string | undefined {
  if (layout.picture !== undefined) return layout.picture;
  for (const block of layout.blocks) {
    if (block.type !== 'section' || block.accessory === 'picture') continue;
    if ('thumbnail' in block.accessory) return block.accessory.thumbnail;
  }
  return undefined;
}

/**
 * The pictures of its own beside a post's parts (a gym's or Wayspot's from Wayfarer): what the
 * live map may serve of a post (plan 8M-8A, the places' pictures).
 */
export function layoutThumbnails(layout: PostLayout): string[] {
  return layout.blocks.flatMap((block) =>
    block.type === 'section' &&
    typeof block.accessory === 'object' &&
    'thumbnail' in block.accessory
      ? [block.accessory.thumbnail]
      : [],
  );
}

/**
 * How a post is made a message: with or without its pictures (`picture: false`, for when
 * Discord refuses one: the post's and the gym's go together), with or without its controls
 * (`controls: false`, the last showing of an ended party: a status keeps its line without its
 * button, the rows go), without the button that moves a train (`move: false`, a copy for another
 * region), with plain emoji on its buttons instead of the application's (`customEmoji: false`,
 * for when Discord refuses one: an emoji deleted or not known yet; plan 8D-G), and with a line at
 * the top (`lead`, a copy in another channel: the first line of the post's first text, whose
 * characters `LEAD_ROOM` keeps free).
 */
export interface PostVariant {
  picture?: boolean;
  customEmoji?: boolean;
  /**
   * `false`: without the post's picture where it is a file of the message (`pictureFile`), for a
   * channel that refuses files; a picture by address stays, as do the gym's.
   */
  files?: boolean;
  controls?: boolean;
  move?: boolean;
  lead?: string;
}

/**
 * The post as a components-v2 message: one container with the post's colour, the parts in their
 * order. A text whose picture or button is left out is a text display by itself; a thin line is
 * never first, last or doubled, whatever was left out around it. A section's details are a text
 * display of their own under it, one component each. A post that would hold more than
 * `MAX_COMPONENTS` (no post since plan 8X-1B: the worst hold 32) puts the details of its sections
 * back into them, the last first and as few as make it fit; when even that is too many it goes
 * without the gym's picture as well (a `PostThumbnail` makes its text a section, two components
 * more), again with as few details put back as make it fit. Losing the picture comes last: a
 * section with its details inside is only how every post looked before plan 8D-F.
 */
export function postMessage(layout: PostLayout, variant: PostVariant = {}): V2Message {
  const detailed = layout.blocks.filter(
    (block) => block.type === 'section' && block.details !== undefined,
  ).length;
  for (const thumbnails of [true, false]) {
    for (let apart = detailed; apart >= 0; apart--) {
      const message = laidOut(layout, variant, thumbnails, apart);
      if (countComponents(message.components) <= MAX_COMPONENTS) return message;
    }
  }
  return laidOut(layout, variant, false, 0);
}

/**
 * `postMessage`, with or without the pictures of its own of the post's parts, with the details
 * of the first `apart` sections that have them under them and those of the rest inside.
 */
function laidOut(
  layout: PostLayout,
  variant: PostVariant,
  thumbnails: boolean,
  apart: number,
): V2Message {
  let detailed = 0;
  let pictured = false;
  const shows = (control: PostButton): boolean =>
    variant.controls !== false && !(control.moves && variant.move === false);
  /** The button as this variant shows it: with its plain emoji in place of a custom one. */
  const buttonOf = ({ button, plain }: PostButton): APIButtonComponent =>
    variant.customEmoji === false && plain !== undefined && 'emoji' in button
      ? { ...button, emoji: { name: plain } }
      : button;
  const parts: APIComponentInContainer[] = [];
  // The line of a copy opens its first text: a text display of its own would be one component
  // more than the post, which can have all that a message may.
  let lead = variant.lead;
  const withLead = (content: string): string => {
    if (lead === undefined) return content;
    const text = `${lead}\n${content}`;
    lead = undefined;
    return text;
  };
  for (const block of layout.blocks) {
    switch (block.type) {
      case 'text':
        if (block.content !== '') parts.push(textDisplay(withLead(block.content)));
        break;
      case 'separator':
        parts.push(separator());
        break;
      case 'section': {
        const { accessory } = block;
        let { content } = block;
        if (
          typeof accessory === 'object' &&
          'thumbnail' in accessory &&
          (variant.picture === false || !thumbnails) &&
          accessory.withoutPicture !== undefined
        ) {
          // The part as it is without its picture: another text, or none.
          if (accessory.withoutPicture === null) break;
          content = accessory.withoutPicture;
        }
        const beside =
          accessory === 'picture'
            ? variant.picture !== false &&
              layout.picture !== undefined &&
              !(variant.files === false && layout.pictureFile !== undefined)
              ? thumbnail(layout.picture)
              : undefined
            : 'thumbnail' in accessory
              ? variant.picture !== false && thumbnails
                ? thumbnail(accessory.thumbnail)
                : undefined
              : shows(accessory)
                ? buttonOf(accessory)
                : undefined;
        if (accessory === 'picture' && beside) pictured = true;
        content = withLead(content);
        const { details } = block;
        if (details === undefined) {
          parts.push(beside ? section(content, beside) : textDisplay(content));
        } else if (beside && detailed++ < apart) {
          parts.push(section(content, beside), textDisplay(details));
        } else {
          const whole = `${content}\n${details}`;
          parts.push(beside ? section(whole, beside) : textDisplay(whole));
        }
        break;
      }
      case 'controls':
        for (const row of block.rows) {
          const buttons = row.filter(shows).map(buttonOf);
          if (buttons.length > 0) parts.push(actionRow(buttons));
        }
        break;
    }
  }
  return {
    v2: true,
    components: [container(layout.accent, withoutStrayLines(parts))],
    // Always said, none too: an edit replaces the files the message had (`editAs`), so that a
    // hatched egg's file goes with its picture.
    files: pictured && layout.pictureFile !== undefined ? [layout.pictureFile] : [],
  };
}

function withoutStrayLines(parts: APIComponentInContainer[]): APIComponentInContainer[] {
  const kept: APIComponentInContainer[] = [];
  for (const part of parts) {
    const line = part.type === ComponentType.Separator;
    if (line && (kept.length === 0 || kept.at(-1)?.type === ComponentType.Separator)) continue;
    kept.push(part);
  }
  while (kept.at(-1)?.type === ComponentType.Separator) kept.pop();
  return kept;
}

/** The characters of a post's text: what Discord counts of its text displays. */
export function layoutTextLength(layout: PostLayout): number {
  let length = 0;
  for (const block of layout.blocks) {
    if (block.type === 'text') length += block.content.length;
    if (block.type === 'section') {
      // Details inside their section take a line break more.
      length += block.content.length + (block.details === undefined ? 0 : block.details.length + 1);
    }
  }
  return length;
}

/** How a renderer is given each list of members it shows: the list as text. */
export type ListText = (items: readonly string[]) => string;

const LIST_SEPARATOR = ', ';

function listText(items: readonly string[], shown: number): string {
  const left = items.length - shown;
  const kept = items.slice(0, shown);
  if (left > 0) kept.push(`…and ${left} more`);
  return kept.join(LIST_SEPARATOR);
}

/**
 * The lists as texts of at most `room` characters together: while they are too long, the
 * longest is shortened by one member from its end, and says how many it left out. A list is
 * never emptied ("…and 12 more" is the shortest it gets), so when even that is too long the
 * texts are as short as they can be.
 */
export function fitLists(lists: readonly (readonly string[])[], room: number): string[] {
  const shown = lists.map((items) => items.length);
  const texts = lists.map((items) => listText(items, items.length));
  let total = texts.reduce((sum, text) => sum + text.length, 0);
  while (total > room) {
    let longest = -1;
    for (let i = 0; i < lists.length; i++) {
      if (
        (shown[i] ?? 0) > 0 &&
        (longest < 0 || (texts[i]?.length ?? 0) > (texts[longest]?.length ?? 0))
      ) {
        longest = i;
      }
    }
    const items = lists[longest];
    if (items === undefined) break;
    const before = texts[longest]?.length ?? 0;
    shown[longest] = (shown[longest] ?? 1) - 1;
    const text = listText(items, shown[longest] ?? 0);
    texts[longest] = text;
    total += text.length - before;
  }
  return texts;
}

/**
 * How a renderer gives the texts that may be shortened when its post is too long: each list of
 * members (`list`, cut down together with the others), and as a last resort other texts that can
 * be long (`part`: a gym's notice, a group's label, a route; `make(room)` is that text in at most
 * `room` characters, or as short as it gets, and `make(Infinity)` the text as it is).
 */
export interface Fit {
  list: ListText;
  part: (make: (room: number) => string) => string;
}

/**
 * A text in at most `room` characters: cut at the end, which `…` marks, never after a lone
 * backslash (it would escape the mark, or what follows the text), never inside a character of
 * two code units (an emoji: half of it is no character). At least the mark.
 */
export function cutText(text: string, room: number): string {
  if (text.length <= room) return text;
  const kept = text.slice(0, Math.max(0, room - 1)).replace(/[\uD800-\uDBFF]$/, '');
  return `${kept.replace(/\\+$/, '')}…`;
}

/**
 * A layout whose text keeps within `budget`: `build` lays the post out with its lists of members
 * and other texts as `fit` gives them, all of every one first; when that is too long, once more
 * with the lists cut down together (`fitLists`) by as much as the text is over; and when even
 * that is too long, the longest of the other texts are cut (each down to the next longest, then
 * together) until it fits. `build` must be pure and ask for the same lists and texts in the same
 * order each time.
 */
export function fittedLayout(
  build: (fit: Fit) => PostLayout,
  budget: number = TEXT_BUDGET - LEAD_ROOM,
): PostLayout {
  const lists: (readonly string[])[] = [];
  const parts: ((room: number) => string)[] = [];
  const whole = build({
    list: (items) => {
      lists.push(items);
      return items.join(LIST_SEPARATOR);
    },
    part: (make) => {
      parts.push(make);
      return make(Infinity);
    },
  });
  let over = layoutTextLength(whole) - budget;
  if (over <= 0) return whole;
  const listed = lists.reduce((sum, items) => sum + items.join(LIST_SEPARATOR).length, 0);
  const texts = fitLists(lists, listed - over);
  const rooms = parts.map(() => Infinity);
  const laid = (): PostLayout => {
    let nextList = 0;
    let nextPart = 0;
    return build({
      list: () => texts[nextList++] ?? '',
      part: (make) => make(rooms[nextPart++] ?? Infinity),
    });
  };
  const cutLists = laid();
  over = layoutTextLength(cutLists) - budget;
  if (over <= 0) return cutLists;
  const lengths = parts.map((make) => make(Infinity).length);
  const exhausted = new Set<number>();
  while (over > 0) {
    let longest = -1;
    let second = 0;
    for (let i = 0; i < lengths.length; i++) {
      if (exhausted.has(i)) continue;
      const length = lengths[i] ?? 0;
      if (longest < 0 || length > (lengths[longest] ?? 0)) {
        if (longest >= 0) second = Math.max(second, lengths[longest] ?? 0);
        longest = i;
      } else {
        second = Math.max(second, length);
      }
    }
    const make = parts[longest];
    const length = lengths[longest];
    if (make === undefined || length === undefined) break;
    const room = Math.max(0, Math.min(length - 1, Math.max(second, length - over)));
    const shorter = make(room).length;
    if (shorter >= length) {
      exhausted.add(longest);
      continue;
    }
    over -= length - shorter;
    lengths[longest] = shorter;
    rooms[longest] = room;
  }
  return laid();
}

/** The statuses a post lists in a group, in its order (who completed a raid comes after). */
const GROUP_STATUSES: readonly ShownStatus[] = ['interested', 'coming', 'present'];

/** A status as the post's lines name it: the words of the buttons (plan 8X-1B, the mockup). */
export const STATUS_WORDS: Readonly<Record<ShownStatus, string>> = {
  interested: 'Interested',
  coming: 'Coming',
  present: 'Here',
  complete: 'Done',
};

/** Under which status a post lists an attendee: one asked whether they completed is present. */
function shownStatus(attendee: Attendee): ShownStatus | undefined {
  switch (attendee.status) {
    case PartyStatus.Interested:
      return 'interested';
    case PartyStatus.Coming:
      return 'coming';
    case PartyStatus.Present:
    case PartyStatus.CompletePending:
      return 'present';
    case PartyStatus.Complete:
      return 'complete';
    default:
      return undefined;
  }
}

/** The members of a status, of one group or of all, as texts in shown order, and their heads. */
function statusMembers(
  view: TrainersView,
  status: ShownStatus,
  groupId?: string,
): { heads: number; items: string[] } {
  const { party, emoji } = view;
  const ids = inShownOrder(
    party,
    membersWhere(
      party,
      (attendee) =>
        shownStatus(attendee) === status && (groupId === undefined || attendee.group === groupId),
    ),
  );
  const heads = ids.reduce((sum, id) => sum + (party.attendees[id]?.number ?? 1), 0);
  return { heads, items: attendeeTexts(party, ids, emoji) };
}

/**
 * The members of a group in the order the group's block of a post lists them: status by status
 * (Interested, Coming, Present), each in shown order (`inShownOrder`).
 */
export function groupInPostOrder(party: Party, groupId: string): string[] {
  return GROUP_STATUSES.flatMap((status) =>
    inShownOrder(
      party,
      membersWhere(
        party,
        (attendee) => shownStatus(attendee) === status && attendee.group === groupId,
      ),
    ),
  );
}

export interface TrainerOptions {
  /** Whether the party is completed (a raid): the status Done. */
  complete: boolean;
  /** Tell a group that is bigger than a lobby to split up (a raid, a train). */
  lobby: boolean;
  /**
   * Say how a group gets a meeting time while one has none (a raid that is not over and has
   * times, so that its post has Meet…; plan 8D-F, reworded in 8X-1B to name Meet… by its icon).
   * A train or meetup says how to set its start in its heading block instead.
   */
  meetHint: boolean;
}

/** The last line of the one group of a raid while it has no meeting time: Meet…'s icon sets one. */
export function noMeetingTime(icon: string): string {
  return `-# No meeting time yet: ${icon} sets one.`;
}

/**
 * After the groups of a raid while some that somebody is in have no meeting time, naming them:
 * `-# Group B has no meeting time yet: ⏰ sets your group's.` (the mockup of plan 8X-1B).
 */
export function groupMeetingHint(groups: readonly GroupId[], icon: string): string {
  const named =
    groups.length === 1
      ? `Group ${groups[0] ?? ''} has`
      : `Groups ${groups.slice(0, -1).join(', ')} and ${groups.at(-1) ?? ''} have`;
  return `-# ${named} no meeting time yet: ${icon} sets your group's.`;
}

/**
 * `Group B: park side`, the label as the member wrote it, made plain; a label is one of the texts
 * a post too long for its text cuts (`Fit.part`).
 */
function groupName(group: PartyGroup, fit: Fit): string {
  const { label } = group;
  return `Group ${group.id}${label ? `: ${fit.part((room) => cutText(plain(label), room))}` : ''}`;
}

/** Under the heading of a group that holds more than its lobby size (a member's +1s, a choice). */
export const LOBBY_OVER = 'Over the lobby size: somebody should consider moving to another group.';

function lobbyNote(view: TrainersView, group: PartyGroup, options: TrainerOptions): string[] {
  // A party with a lobby size has its own note, in the place of the raid's.
  if (view.lobbySize !== undefined) {
    return lobbyCount(view.party, group.id) > view.lobbySize ? [LOBBY_OVER] : [];
  }
  const split = view.splitLobby === undefined ? DEFAULT_LOBBIES.raid : view.splitLobby;
  return options.lobby && split !== null && headCount(view.party, group.id) > split
    ? [`More than ${split} trainers: a lobby holds ${split}, so split up.`]
    : [];
}

/**
 * A group's lobby, where the party has a size: `3/4 coming · 1 interested`, its committed heads
 * (`lobbyCount`: here and asked count as coming) over the size, then the heads of who is
 * interested, only when there are any. Undefined without a size.
 */
function lobbyLine(view: TrainersView, group: PartyGroup): string | undefined {
  const size = view.lobbySize;
  if (size === undefined) return undefined;
  const interested = Object.values(view.party.attendees)
    .filter((attendee) => attendee.group === group.id && attendee.status === PartyStatus.Interested)
    .reduce((sum, attendee) => sum + attendee.number, 0);
  const coming = `${lobbyCount(view.party, group.id)}/${size} coming`;
  return interested > 0 ? `${coming} · ${interested} interested` : coming;
}

/**
 * The lines of a group (of all groups when `groupId` is undefined) for these statuses, each
 * starting with its button's icon (`statusIcon`): `🏃 Coming (3): Ash +1, Misty`; a status nobody
 * is in has none.
 */
function statusLines(
  view: TrainersView,
  statuses: readonly ShownStatus[],
  fit: Fit,
  groupId?: string,
): string[] {
  return statuses.flatMap((status) => {
    const { heads, items } = statusMembers(view, status, groupId);
    if (items.length === 0) return [];
    const icon = statusIcon(view.emoji, status);
    return [`${icon} ${STATUS_WORDS[status]} (${heads}): ${fit.list(items)}`];
  });
}

/**
 * Who comes, as the post lists them (plan 8X-1B, decision 1; Matt, 2026-10-20: one layout for one
 * group and several, the buttons all in the rows at the bottom): a text per group, its heading
 * line (with several groups `**Group B: label**`; with one only where it has a label), its head
 * count (`N trainers`, or its lobby where the party has a size: `lobbyLine`) and meeting time,
 * the lobby note, then a line per status somebody is in, Interested, Coming, Here (the asked
 * among them), and with one group Done, or `Nobody yet`. With several groups who is done stands
 * in a text of its own after them, for a raid. A raid that is not over and has times says how to
 * set a meeting time by Meet…'s icon while one is missing (`noMeetingTime`, `groupMeetingHint`).
 * Members are listed by `attendeeTexts`; every list and label is asked of `fit`.
 */
export function trainerBlocks(view: TrainersView, options: TrainerOptions, fit: Fit): PostBlock[] {
  const { party } = view;
  const meet = meetIcon(view.emoji);
  const [only] = party.groups;
  const several = party.groups.length > 1;
  const heading = (group: PartyGroup): string[] => {
    const someone = Object.values(party.attendees).some((attendee) => attendee.group === group.id);
    const trainers =
      lobbyLine(view, group) ??
      (someone || several ? count(headCount(party, group.id), 'trainer') : undefined);
    const parts = [
      ...(several || group.label ? [`**${groupName(group, fit)}**`] : []),
      ...(trainers === undefined ? [] : [trainers]),
      ...(group.startTime === undefined ? [] : [`meeting at ${timestamp(group.startTime)}`]),
    ];
    return parts.length === 0 ? [] : [parts.join(' · ')];
  };
  if (only && !several) {
    const lines = statusLines(
      view,
      options.complete ? [...GROUP_STATUSES, 'complete'] : GROUP_STATUSES,
      fit,
    );
    const content = [
      ...heading(only),
      ...lobbyNote(view, only, options),
      ...(lines.length > 0 ? lines : ['Nobody yet']),
      ...(options.meetHint && only.startTime === undefined && headCount(party, only.id) > 0
        ? [noMeetingTime(meet)]
        : []),
    ];
    return [{ type: 'text', content: content.join('\n'), role: 'trainers' }];
  }
  const blocks: PostBlock[] = party.groups.map((group) => {
    const lines = statusLines(view, GROUP_STATUSES, fit, group.id);
    return {
      type: 'text',
      role: 'trainers',
      content: [
        ...heading(group),
        ...lobbyNote(view, group, options),
        ...(lines.length > 0 ? lines : ['Nobody yet']),
      ].join('\n'),
    };
  });
  if (options.complete) {
    const done = statusLines(view, ['complete'], fit);
    if (done.length > 0) {
      blocks.push({ type: 'text', content: done.join('\n'), role: 'trainers' });
    }
  }
  // Only of a group somebody is in: nobody else could set one for it.
  const timeless = party.groups
    .filter((group) => group.startTime === undefined && headCount(party, group.id) > 0)
    .map((group) => group.id);
  if (options.meetHint && timeless.length > 0) {
    blocks.push({ type: 'text', content: groupMeetingHint(timeless, meet), role: 'trainers' });
  }
  return blocks;
}

/** How many trainers are expected in all, for lists of parties. */
export function trainerCount(party: Party): string {
  return count(headCount(party), 'trainer');
}
