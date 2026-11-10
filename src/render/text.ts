import { escapeMarkdown } from 'discord.js';
import { clockWords, sameDay, zoned } from '../domain/time/zoned.js';

/** Discord's limits for the parts of a message this bot fills. */
export const LIMITS = {
  /** A forum post's title (a thread name). */
  title: 100,
  embedTitle: 256,
  embedDescription: 4096,
  fieldName: 256,
  fieldValue: 1024,
  fields: 25,
  /** Title, description and all field names and values of one embed together. */
  embedTotal: 6000,
  content: 2000,
  /** Members one message may ping. */
  pings: 100,
} as const;

/**
 * A message of this text that pings these members: their mentions follow the text on a line of
 * their own, as many as fit into one message and as one message may ping. The text itself
 * always goes.
 */
export function withMentions(
  text: string,
  members: readonly string[],
): { content: string; mention: { users: string[] } } {
  let content = text;
  const users: string[] = [];
  for (const id of members.slice(0, LIMITS.pings)) {
    const mention = `${users.length === 0 ? '\n' : ' '}<@${id}>`;
    if (content.length + mention.length > LIMITS.content) break;
    content += mention;
    users.push(id);
  }
  return { content, mention: { users } };
}

/**
 * Messages that ping every one of these members, in order and each once: the text with as many
 * mentions as fit (`withMentions`), then as many messages of mentions alone as it takes, each
 * within what one message holds and may ping. For a ping that must reach a group of a hundred
 * (`/shout`; design `2026-10-20-max-battles-design.md`, section 5), where `withMentions` alone
 * reaches some sixty to ninety.
 */
export function inMessages(
  text: string,
  members: readonly string[],
): { content: string; mention: { users: string[] } }[] {
  const first = withMentions(text, members);
  const messages = [first];
  let left = members.slice(first.mention.users.length);
  while (left.length > 0) {
    const users: string[] = [];
    let content = '';
    for (const id of left.slice(0, LIMITS.pings)) {
      const mention = `${users.length === 0 ? '' : ' '}<@${id}>`;
      if (content.length + mention.length > LIMITS.content) break;
      content += mention;
      users.push(id);
    }
    messages.push({ content, mention: { users } });
    left = left.slice(users.length);
  }
  return messages;
}

/**
 * An address, which Discord links with what it holds: `https://…` up to white space or a `<`
 * (and not its last punctuation), or `<scheme:/…>`.
 */
const ADDRESSES = /<[^\s:]+:\/[^\s>]*|https?:\/\/[^\s<]*[^\s<.,:;"')\]]/g;

/**
 * A typed backslash doubled, and every character that formats escaped one by one (`*`, `_`,
 * `~`, `|`, a backtick); in an address only those that format in pairs (`~`, `|`, a backtick),
 * as discord.js did, so that the `_` and `*` of a link stay part of it. discord.js escapes them
 * in pairs and runs, and left some of a long run bare (`*****bold*****`).
 */
function escapeMarkers(text: string): string {
  const escaped = (part: string, markers: RegExp): string =>
    part.replace(/\\/g, '\\\\').replace(markers, '\\$&');
  let result = '';
  let last = 0;
  for (const address of text.matchAll(ADDRESSES)) {
    result += escaped(text.slice(last, address.index), /[*_~|`]/g) + escaped(address[0], /[~|`]/g);
    last = address.index + address[0].length;
  }
  return result + escaped(text.slice(last), /[*_~|`]/g);
}

/**
 * Text that members or a feed wrote, made safe to show: Markdown is escaped, and a mention or
 * channel link typed as text stays text (`@everyone` would not ping, since the client sends no
 * mentions by default, but it should not look like one either).
 */
export function plain(text: string): string {
  return (
    escapeMarkdown(escapeMarkers(text.replace(/\s+/g, ' ').trim()), {
      // The backslashes and the markers are escaped already (`escapeMarkers`).
      escape: false,
      codeBlock: false,
      inlineCode: false,
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      spoiler: false,
      maskedLink: true,
      heading: true,
      bulletedList: true,
      numberedList: true,
    })
      // discord.js escapes only the first bracket of a line, and greedily: of `[ [a](url)` and of
      // two links in one line a masked link survived. Every `](` is broken, wherever it stands;
      // where a member typed a backslash between the two there is nothing to break.
      .replace(/\]\(/g, ']\\(')
      // A block quote or subtext only counts at the start of a line, and this is one line.
      .replace(/^(>|-#)/, '\\$1')
      // An underscore right after the start of an emoji is escaped, whatever it stands next to.
      .replace(/<a?:[^\s:>]*/g, (start) => start.replace(/\\.|_/gs, (m) => (m === '_' ? '\\_' : m)))
      // The zero-width character goes only where it is needed: after the @ of a mass mention,
      // and after a < (which would start a mention, channel link, emoji, timestamp or the like).
      .replace(/@(?=everyone|here)/g, '@\u200b')
      .replace(/<(?=\S)/g, '<\u200b')
  );
}

/**
 * The text `plain` was given, from what it made: for a page that sets a sentence of the bot as
 * text (the live map), where an escape would show. Every backslash `plain` wrote escapes the
 * character after it (it escapes a typed backslash too), and the zero-width spaces it put after
 * `<` and after the `@` of a mass mention are taken out, one each. Only `plain`'s white space is
 * lost (runs of it are one space); a zero-width space a member typed after such an `@` cannot be
 * told from `plain`'s.
 */
export function unplain(text: string): string {
  return text.replace(
    /\\(.)|<\u200b|@\u200b(?=everyone|here)/gsu,
    (match, escaped?: string) => escaped ?? match.charAt(0),
  );
}

/**
 * What a client makes a link of without any Markdown: the colon of a scheme (`https://`, also
 * with a backslash a member typed before a slash, which the client takes away again), the dot
 * of `www.`, and the dot before the last part of a host that a path follows (`discord.gg/…`,
 * `discord.com/invite/…`: invitations are linked without a scheme).
 */
const LINK_STARTS = /:(?=[\\/])|\bwww\.|\.(?=[a-z0-9-]{2,}\/)/gi;

/**
 * `plain`, and no address in it is a link: for text of one member that the bot carries to
 * others who did not ask for that member's words (the details of a spawn report, a display
 * name in a direct message). A zero-width space after the colon or dot keeps a client from
 * linking it; the text reads the same. Broken before the Markdown is escaped: discord.js leaves
 * the underscores of an address alone, and this is none any more. `plain` itself lets an
 * address be one: the information of a meetup may link.
 */
export function plainNoLinks(text: string): string {
  return plain(text.replace(LINK_STARTS, '$&\u200B'));
}

/** A member to be named: the snowflake, and the display name when the bot has seen one. */
export interface NamedMember {
  id: string;
  name?: string | undefined;
}

/**
 * A member in a sentence that pings nobody: the display name in bold with the mention after it,
 * `**Tester** (<@id>)`. A mention alone reads "@unknown-user" in a client that has not loaded
 * that member, and a message without pings brings no member data with it; the mention still
 * opens the profile where it does show. A member the bot has no name for is the mention alone.
 */
export function memberText(member: NamedMember): string {
  const name = shownName(member);
  return name === '' ? `<@${member.id}>` : `**${name}** (<@${member.id}>)`;
}

/**
 * A member named in the small print of a post, which pings nobody: the display name in bold,
 * and the mention only for a member the bot has no name for. A mention that pings nobody brings
 * no member data and reads "@unknown-user" to whoever has not loaded that member (Matt,
 * 2026-10-15, staging of 8A).
 */
export function memberByName(member: NamedMember): string {
  const name = shownName(member);
  return name === '' ? `<@${member.id}>` : `**${name}**`;
}

/**
 * A member where there is room for one of the two only (the lists of a post's embed): the
 * display name, and the mention for a member the bot has no name for.
 */
export function memberName(member: NamedMember): string {
  return shownName(member) || `<@${member.id}>`;
}

/**
 * The one place a member's name is made text: plain, and without a working link (a display
 * name is the member's own text, and goes into direct messages to others).
 */
function shownName(member: NamedMember): string {
  // A backslash at the end would escape what follows the name.
  return member.name === undefined ? '' : plainNoLinks(member.name).replace(/\\+$/, '');
}

/**
 * Whether a name shows as something: `memberName` and the others put the mention in the place
 * of one that does not (blank, or only backslashes), which a board must never show (W4).
 */
export function hasShownName(name: string): boolean {
  return shownName({ id: '', name }).trim() !== '';
}

/**
 * Text of several lines that a member wrote (the information about a meetup), made safe like
 * `plain`, line by line: the lines stay lines, with one empty line between them at most.
 */
export function plainLines(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map(plain)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * A text as a fenced code block (plan 8Z-2), for where what somebody wrote is rendered as
 * Markdown and must stay text (the body of a GitHub issue): the fence is three backticks, or
 * one more than the longest run of backticks in the text, so that no line of the text can close
 * the block, whatever it holds. `info` is the fence's word (`text`); it holds no backtick.
 */
export function fencedBlock(text: string, info = ''): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${info.replace(/`/g, '')}\n${text}\n${fence}`;
}

/** `text`, cut to `limit` characters with an ellipsis when it is longer. Never splits a pair. */
export function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  let kept = '';
  for (const character of text) {
    if (kept.length + character.length > limit - 1) break;
    kept += character;
  }
  kept = kept.trimEnd();
  // A backslash that escaped the character after the cut would now escape the ellipsis, or
  // stand there by itself: an odd run of them at the end loses its last.
  const backslashes = /\\*$/.exec(kept)?.[0].length ?? 0;
  if (backslashes % 2 === 1) kept = kept.slice(0, -1).trimEnd();
  return `${kept}…`;
}

/** A closing mark of markdown at the end of a text: bold, italics, underline, strike, spoiler. */
const CLOSING_MARKS = /(?:\*\*|\*|__|_|~~|\|\|)$/u;
/** The address part of a masked link at the end of a text: `](<https://…>)` or `](https://…)`. */
const LINK_ADDRESS = /\]\(<?[^\s()<>]*>?\)$/u;

/**
 * A sentence that ends with `text`, with its period (plan 8X-F): none added where what a reader
 * sees already ends in one (`.`, `!` or `?`: "at **Fire Company Inc.**", not "Inc.."), looking
 * through closing bold and the like, a masked link's address, and the backslash `plain` puts
 * before a period (`1\.`). A cut name's `…` (`truncate`) is no end of a sentence: the period
 * follows it.
 */
export function endSentence(text: string): string {
  let shown = text;
  for (;;) {
    const bare = shown.replace(LINK_ADDRESS, '').replace(CLOSING_MARKS, '');
    if (bare === shown) break;
    shown = bare;
  }
  return /[.!?]$/u.test(shown) ? text : `${text}.`;
}

/**
 * What Discord reads in angle brackets: a member, role, channel, emoji, time, command or an
 * address. `plain` puts a zero-width space after every `<` a member typed, so none of theirs is
 * one.
 */
const ANGLED =
  /^<(?:@!?\d+|@&\d+|#\d+|a?:\w+:\d+|t:-?\d+(?::[tTdDfFR])?|\/[\w -]+:\d+|https?:\/\/[^\s<>]+)>/u;

/**
 * Where the markdown construct that starts at `at` of `text` ends (the index after it): a code
 * span, anything in angle brackets Discord reads (`ANGLED`), or a link `[…](…)` whose own `]` is
 * followed by `(`; undefined where none starts (a `<` or `[` of a member's text is a character).
 */
function constructEnd(text: string, at: number): number | undefined {
  const character = text[at];
  if (character === '`') {
    const closing = text.indexOf('`', at + 1);
    return closing < 0 ? undefined : closing + 1;
  }
  if (character === '<') {
    const angled = ANGLED.exec(text.slice(at));
    return angled ? at + angled[0].length : undefined;
  }
  if (character !== '[') return undefined;
  let close = at + 1;
  while (close < text.length && text[close] !== ']' && text[close] !== '[') {
    close += text[close] === '\\' ? 2 : 1;
  }
  if (text[close] !== ']' || text[close + 1] !== '(') return undefined;
  const closing = text.indexOf(')', close + 2);
  return closing < 0 ? undefined : closing + 1;
}

/** The markers of emphasis, longest first: `**` is bold, not two `*`. */
const EMPHASIS = ['**', '__', '~~', '*', '_'] as const;

/**
 * A finished markdown text (made of `plain` texts and markdown of the bot's own) cut to `limit`
 * as `truncate` cuts, but never inside a construct: a code span, a link `[…](…)` or anything in
 * angle brackets (a mention, a channel, a time, an emoji, an address) that the cut would leave
 * open is cut away whole, and a marker of bold, italics, underline or strike left open is taken
 * out (its text stays, plain). An escape is never split (`truncate`). Text cut before it was made
 * plain (`plain(truncate(…))`) needs none of this; this is for what is cut once it is finished.
 */
export function cutMarkdown(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const body = truncate(text, limit).slice(0, -1);
  const open: { marker: string; at: number }[] = [];
  let end = body.length;
  // The constructs are found in the whole text, so that one the cut runs into is known as one.
  for (let i = 0; i < body.length;) {
    if (body[i] === '\\') {
      i += 2;
      continue;
    }
    const after = constructEnd(text, i);
    if (after !== undefined) {
      if (after > body.length) {
        end = i;
        break;
      }
      i = after;
      continue;
    }
    const marker = EMPHASIS.find((one) => body.startsWith(one, i));
    if (marker === undefined) {
      i++;
      continue;
    }
    const opened = open.findLastIndex((one) => one.marker === marker);
    if (opened >= 0) open.splice(opened, 1);
    else open.push({ marker, at: i });
    i += marker.length;
  }
  let kept = body.slice(0, end);
  for (const { marker, at } of open.filter((one) => one.at < end).reverse()) {
    kept = kept.slice(0, at) + kept.slice(at + marker.length);
  }
  return `${kept.trimEnd()}…`;
}

/**
 * A clock time as plain text in the settings' zone, `7:37 PM`: for what shows no markdown and so
 * no Discord timestamp (the labels and descriptions of a dialog's choices, plan 8X-1B).
 */
export function clockText(ms: number, zone: string): string {
  return clockWords(zoned(ms, zone));
}

/**
 * A moment as Discord shows it in each reader's own time zone: `<t:1760000000:t>`. `t` is the
 * clock time, `f` the date with it, `F` the weekday too, `R` how long until or since.
 */
export function timestamp(ms: number, style: 't' | 'R' | 'f' | 'F' | 'd' | 'D' = 't'): string {
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

const HALF_A_DAY = 12 * 3_600_000;

/** Whether a time lies more than half a day from now: its clock time alone would not say which day. */
export function isFarOff(time: number, now: number): boolean {
  return Math.abs(time - now) > HALF_A_DAY;
}

/**
 * A time as a sentence names it: the clock time, with the date when it is far off (an
 * elite raid, a meetup planned for another day, a clock time that was read as another day than
 * the member meant).
 */
export function clockOrDate(time: number, now: number): string {
  return timestamp(time, isFarOff(time, now) ? 'f' : 't');
}

/**
 * A time of a train or meetup as a sentence names it: the clock time when it is today in `zone`
 * (`settings.timezone`), and with its date on any other day, however near. Such a party is
 * planned for other days than the one a time is typed on, and a time read as tomorrow morning
 * must say so. A raid's sentences keep `clockOrDate`: a raid is over within hours.
 */
export function clockOrDay(time: number, now: number, zone: string): string {
  return timestamp(time, sameDay(zoned(now, zone), zoned(time, zone)) ? 't' : 'f');
}

/**
 * As many of `items` as fit into `limit` characters when joined with `separator`; when some do
 * not, the text ends with how many were left out. When not even the first item fits with that
 * ending, the text only says how many there are: a cut mention is worse than none.
 */
export function fitItems(items: readonly string[], limit: number, separator = ', '): string {
  const all = items.join(separator);
  if (all.length <= limit) return all;
  for (let kept = items.length - 1; kept > 0; kept--) {
    const text = `${items.slice(0, kept).join(separator)}${separator}…and ${items.length - kept} more`;
    if (text.length <= limit) return text;
  }
  return `…and ${items.length} more`;
}

/** `1 trainer`, `3 trainers`. */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** `fairy` → `Fairy`, `partly_cloudy` → `Partly Cloudy`. */
export function titleCase(id: string): string {
  return id
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Lines joined into as few messages as hold them in their order, none longer than Discord
 * allows and none cut inside a line (a single line that is too long by itself is cut).
 */
export function fitMessages(lines: readonly string[]): string[] {
  const messages: string[] = [];
  let current = '';
  for (const text of lines) {
    const line = text.length > LIMITS.content ? `${text.slice(0, LIMITS.content - 1)}…` : text;
    if (current !== '' && current.length + 1 + line.length > LIMITS.content) {
      messages.push(current);
      current = line;
    } else {
      current = current === '' ? line : `${current}\n${line}`;
    }
  }
  if (current !== '') messages.push(current);
  return messages;
}
