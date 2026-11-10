import type { PostLine, PostNode, PostTimeStyle } from '../domain/web/party-data.js';

/** What reading a post's text needs to know of where it is shown (plan 8M-8A). */
export interface PostTextOptions {
  /** Pine's address of a custom emoji's picture, undefined where Pine serves none. */
  emoji(id: string, name: string): string | undefined;
  /** A post linked as `<#id>` (a split train's other post): its address and its name to show. */
  channel(id: string): { href: string; name: string };
  /** Whether an address may be a link on the page. */
  linkable(url: string): boolean;
}

/** What a member without a name is called (`memberName` falls back to their mention). */
export const UNKNOWN_MEMBER = 'unknown member';

/** A character a backslash escapes, as Discord (CommonMark) takes it: ASCII punctuation. */
const ESCAPABLE = /[!-/:-@[-`{-~]/u;

/**
 * The markers of emphasis, longest first: `**` is bold, not two `*`; `__` underlines, as on
 * Discord.
 */
const MARKERS = ['**', '__', '~~', '*', '_'] as const;
type Marker = (typeof MARKERS)[number];
const MARKED: Readonly<Record<Marker, 'strong' | 'underline' | 'strike' | 'em'>> = {
  '**': 'strong',
  __: 'underline',
  '~~': 'strike',
  '*': 'em',
  _: 'em',
};

/**
 * What Discord reads in angle brackets, as `text.ts`'s `ANGLED`: a member, a role, a channel or
 * post, a custom emoji, a time, a command, an address.
 */
const ANGLED =
  /^<(?:(@!?)(\d+)|@&\d+|#(\d+)|(a?):(\w+):(\d+)|t:(-?\d+)(?::([tTdDfFR]))?|\/([\w -]+):\d+|(https?:\/\/[^\s<>]+))>/u;

/**
 * A bare address, up to white space, angle brackets, a backslash (an escape `plain` wrote after
 * it) or a backtick; where it ends is decided by `bareEnd`.
 */
const BARE = /^https?:\/\/[^\s<>\\`\u200b]+/u;

/** How deep emphasis nests before a marker is taken as text: more than any post needs. */
const MAX_DEPTH = 4;

/**
 * The text of a post (one of its text displays) as lines of nodes, as Discord shows it (plan
 * 8M-8A): headings (`#` to `###`), small print (`-#`), bold, italics, strike, inline code, masked
 * links (with and without angle brackets) and bare ones, posts linked as `<#id>`, members as
 * `<@id>`, custom emoji, timestamps; plain emoji are text. A link only where `linkable` allows
 * its address (else its text); a member never by id (`UNKNOWN_MEMBER`: a post names a member by
 * name, and by mention only one the bot has no name for). What `plain` and `plainNoLinks` did to
 * members' text is undone: its escapes, and the zero-width spaces after `<`, after the `@` of a
 * mass mention, and after the `:` and `.` that would make an address a link (the address stays
 * text). Anything else is shown as its text. Pure.
 */
export function postText(text: string, options: PostTextOptions): PostLine[] {
  return text.split('\n').map((line) => {
    const heading = /^#{1,3} (.*)$/u.exec(line);
    if (heading) return { style: 'heading', nodes: inline(heading[1] ?? '', options, 0) };
    const small = /^-# (.*)$/u.exec(line);
    if (small) return { style: 'small', nodes: inline(small[1] ?? '', options, 0) };
    return { style: 'plain', nodes: inline(line, options, 0) };
  });
}

/**
 * A zero-width space where `plain` or `plainNoLinks` put one, and nowhere else: after a `<` that
 * something follows, after the `@` of a mass mention, after the `:` of a scheme before a slash or
 * backslash, after `www.`, after the dot before a host's last part that a path follows (one a
 * member typed there cannot be told from theirs, as `unplain` says).
 */
const ADDED_SPACE =
  /(?<=<)\u200b(?=\S|$)|(?<=@)\u200b(?=everyone|here)|(?<=:)\u200b(?=[\\/])|(?<=\bwww\.)\u200b|(?<=\.)\u200b(?=[a-z0-9-]{2,}\/)/giu;

/** Text as a reader sees it: the zero-width spaces `plain` and `plainNoLinks` added taken out. */
function readable(text: string): string {
  return text.replace(ADDED_SPACE, '');
}

/**
 * Whether the character at `at` is a zero-width space `plain` or `plainNoLinks` added, after
 * `before` (the text before it, which went into another node).
 */
function addedSpace(text: string, at: number, before: string): boolean {
  if (text[at] !== '\u200b') return false;
  const around = `${before}${text.slice(at, at + 40)}`;
  ADDED_SPACE.lastIndex = 0;
  for (let found = ADDED_SPACE.exec(around); found; found = ADDED_SPACE.exec(around)) {
    if (found.index === before.length) return true;
    if (found.index > before.length) return false;
  }
  return false;
}

/** Adds text to nodes, joined to the text before it. */
function addText(nodes: PostNode[], value: string): void {
  if (value === '') return;
  const last = nodes.at(-1);
  if (last?.kind === 'text') last.text += value;
  else nodes.push({ kind: 'text', text: value });
}

/** Adds nodes, a text joined to the text before it. */
function addAll(nodes: PostNode[], more: readonly PostNode[]): void {
  for (const node of more) {
    if (node.kind === 'text') addText(nodes, node.text);
    else nodes.push(node);
  }
}

/** A masked link `[text](<url>)` or `[text](url)` starting at `at`: its parts and its end. */
function maskedLink(
  text: string,
  at: number,
): { label: string; url: string; end: number } | undefined {
  let close = at + 1;
  while (close < text.length && text[close] !== ']' && text[close] !== '[') {
    close += text[close] === '\\' ? 2 : 1;
  }
  if (text[close] !== ']' || text[close + 1] !== '(') return undefined;
  const address = /^\((?:<([^\s<>]+)>|([^\s()<>]+))\)/u.exec(text.slice(close + 1));
  if (!address) return undefined;
  return {
    label: text.slice(at + 1, close),
    url: address[1] ?? address[2] ?? '',
    end: close + 1 + address[0].length,
  };
}

/** Where a bare address ends: before trailing punctuation, and a `)` it does not open. */
function bareEnd(url: string): string {
  let kept = url;
  for (;;) {
    const before = kept;
    kept = kept.replace(/[.,:;!?'"]+$/u, '');
    const opens = (kept.match(/\(/gu) ?? []).length;
    const closes = (kept.match(/\)/gu) ?? []).length;
    if (kept.endsWith(')') && closes > opens) kept = kept.slice(0, -1);
    if (kept === before) return kept;
  }
}

/** A construct that cannot hold emphasis (a code span, angle brackets, a masked link): its end. */
function constructEnd(text: string, at: number): number | undefined {
  const character = text[at];
  if (character === '`') {
    const close = text.indexOf('`', at + 1);
    return close > at + 1 ? close + 1 : undefined;
  }
  if (character === '<') {
    const angled = ANGLED.exec(text.slice(at));
    return angled ? at + angled[0].length : undefined;
  }
  if (character === '[') return maskedLink(text, at)?.end;
  return undefined;
}

const WORD = /\w/u;

/**
 * Where a marker is none in what `plain` made: an underscore inside a word (Discord's own rule),
 * and the markers discord.js leaves unescaped, as its lookbehinds say (`escapeItalic`,
 * `escapeUnderline`: after an address in the same run, after the start of an emoji; `plain` puts a
 * zero-width space after the `<`).
 */
function markerTaken(text: string, at: number, marker: Marker): boolean {
  const before = text.slice(0, at);
  const address = /(?<!<\u200b?)https?:\/\/\S*$/u.test(before);
  switch (marker) {
    case '*':
      return address || /<\u200b?[^\s:]+:\/[^\s>]*$/u.test(before);
    case '_':
      return (
        WORD.test(before.at(-1) ?? '') ||
        address ||
        /<\u200b?a?:./u.test(before) ||
        /<\u200b?[^\s:]:\/[^\s>]*$/u.test(before)
      );
    case '__':
      return address || /<\u200b?a?:./u.test(before);
    default:
      return false;
  }
}

/**
 * The marker that opens emphasis at `at`, one followed by something other than white space; two
 * underscores underline, also inside a word, as on Discord. A marker discord.js leaves unescaped
 * (after an address in the same run, after an emoji's start: `escapeItalic`, `escapeUnderline`)
 * is text, so that what a member wrote reads as written.
 */
function openerAt(text: string, at: number): Marker | undefined {
  const marker = MARKERS.find((one) => text.startsWith(one, at));
  if (marker === undefined) return undefined;
  if (markerTaken(text, at, marker)) return undefined;
  const next = text[at + marker.length];
  return next === undefined || /\s/u.test(next) ? undefined : marker;
}

/**
 * Where the emphasis `marker` opened before `from` closes: the next `marker` after something other
 * than white space, past escapes, constructs and emphasis nested inside it; undefined for none.
 */
function closing(text: string, from: number, marker: Marker, depth: number): number | undefined {
  for (let at = from; at < text.length;) {
    if (text[at] === '\\') {
      at += 2;
      continue;
    }
    const end = constructEnd(text, at);
    if (end !== undefined) {
      at = end;
      continue;
    }
    const before = text[at - 1];
    const after = text[at + marker.length] ?? '';
    if (
      text.startsWith(marker, at) &&
      at > from &&
      before !== undefined &&
      !/\s/u.test(before) &&
      !(marker === '_' && WORD.test(after))
    ) {
      return at;
    }
    const nested = depth < MAX_DEPTH ? openerAt(text, at) : undefined;
    if (nested !== undefined && nested !== marker) {
      const inner = closing(text, at + nested.length, nested, depth + 1);
      if (inner !== undefined) {
        at = inner + nested.length;
        continue;
      }
    }
    at += 1;
  }
  return undefined;
}

/** What angle brackets Discord reads stand for, as nodes. */
function angledNodes(match: RegExpExecArray, options: PostTextOptions): PostNode[] {
  const [whole, member, , channel, animated, emojiName, emojiId, seconds, style, command, url] =
    match;
  if (member !== undefined) return [{ kind: 'text', text: UNKNOWN_MEMBER }];
  if (channel !== undefined) {
    const post = options.channel(channel);
    return [{ kind: 'link', href: post.href, children: [{ kind: 'text', text: post.name }] }];
  }
  if (emojiName !== undefined && emojiId !== undefined && animated !== undefined) {
    const src = options.emoji(emojiId, emojiName);
    return [{ kind: 'emoji', name: emojiName, ...(src === undefined ? {} : { src }) }];
  }
  if (seconds !== undefined) {
    const at = Number(seconds) * 1000;
    // A moment no date can be (Discord shows it as written): `Date` holds ±8.64e15 ms.
    if (!Number.isSafeInteger(at) || Math.abs(at) > 8.64e15) return [{ kind: 'text', text: whole }];
    const shown = (style ?? 'f') as PostTimeStyle;
    return [{ kind: 'time', at, style: shown }];
  }
  if (command !== undefined) return [{ kind: 'text', text: `/${command}` }];
  if (url !== undefined) {
    const text: PostNode = { kind: 'text', text: url };
    return options.linkable(url) ? [{ kind: 'link', href: url, children: [text] }] : [text];
  }
  // A role's mention: no post names one; shown as it is.
  return [{ kind: 'text', text: whole }];
}

/** The nodes of a line, or of what emphasis or a link holds. */
function inline(text: string, options: PostTextOptions, depth: number): PostNode[] {
  const nodes: PostNode[] = [];
  let pending = '';
  const flush = (): void => {
    addText(nodes, readable(pending));
    pending = '';
  };
  for (let at = 0; at < text.length;) {
    const character = text[at] ?? '';
    const next = text[at + 1];
    if (character === '\\' && next !== undefined && ESCAPABLE.test(next)) {
      pending += next;
      at += 2;
      continue;
    }
    if (character === '`') {
      const close = text.indexOf('`', at + 1);
      if (close > at + 1) {
        flush();
        nodes.push({ kind: 'code', text: text.slice(at + 1, close) });
        at = close + 1;
        continue;
      }
    }
    if (character === '<') {
      const angled = ANGLED.exec(text.slice(at));
      if (angled) {
        flush();
        addAll(nodes, angledNodes(angled, options));
        at += angled[0].length;
        continue;
      }
    }
    if (character === '[') {
      const link = maskedLink(text, at);
      if (link) {
        flush();
        const children = inline(link.label, options, depth + 1);
        if (options.linkable(link.url)) nodes.push({ kind: 'link', href: link.url, children });
        else addAll(nodes, children);
        at = link.end;
        continue;
      }
    }
    if (character === 'h') {
      const bare = BARE.exec(text.slice(at));
      const url = bare ? bareEnd(bare[0]) : '';
      if (url.length > 'https://'.length) {
        flush();
        const shown: PostNode = { kind: 'text', text: url };
        if (options.linkable(url)) nodes.push({ kind: 'link', href: url, children: [shown] });
        else addText(nodes, url);
        at += url.length;
        // A zero-width space `plain` put after the address's last character (`@everyone`).
        if (addedSpace(text, at, url)) at += 1;
        continue;
      }
    }
    const marker = depth < MAX_DEPTH ? openerAt(text, at) : undefined;
    if (marker !== undefined) {
      const close = closing(text, at + marker.length, marker, depth);
      if (close !== undefined) {
        flush();
        const children = inline(text.slice(at + marker.length, close), options, depth + 1);
        nodes.push({ kind: MARKED[marker], children });
        at = close + marker.length;
        continue;
      }
    }
    pending += character;
    at += 1;
  }
  flush();
  return nodes;
}
