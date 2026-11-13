import type { PokemonCatalogue } from '../pogo/catalogue.js';
import { feedLookupOf } from '../pogo/feed-lookup.js';
import { identifyBoss, wornBy } from '../pogo/raid-boss-feed.js';
import { momentIn, readFeedTime, type FeedTime } from '../time/zoned.js';
import { itemKey, MAX_TASK_TEXT, taskKeyOf, type ResearchTask, type TaskReward } from './task.js';
import { rewardKey } from './versions.js';

/*
 * Leek Duck's research page (`https://leekduck.com/research/`; plan 8R-1, design 4.1, decision 5)
 * read as the task list. The page is HTML of a stable shape: a `task-category` per heading
 * (`<h2>Catching Tasks</h2>`), a `task-item` per task with its `task-text`, and a `reward` per
 * reward with its `data-reward-type` (`encounter`, `item`, `resource` for Mega Energy). The
 * research breakthrough after the tasks is no task. Read with a few small scans, never a regular
 * expression over the whole page: what is not of that shape is skipped and counted. An event's
 * section says when it ends (`data-event-end`).
 */

/** What the page gave: the tasks, and how many tasks and rewards could not be read. */
export interface ParsedResearchPage {
  tasks: ResearchTask[];
  /** Tasks without a text, and rewards of a type or shape this version does not read. */
  skipped: number;
  /** The names of encounter rewards the game data does not know (shown by name, wanted by none). */
  unknown: string[];
  /** Sections the page names that were not read (`categoryWords`): their tasks are missing. */
  unreadSections: number;
  /** Events' ends that could not be read (`sectionEnd`): their tasks stay offered past them. */
  unreadEnds: number;
}

/** The longest name of a reward that is kept. */
const MAX_REWARD_NAME = 100;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  eacute: 'é',
  times: '×',
  rsquo: '’',
  lsquo: '‘',
  ndash: '–',
  mdash: '—',
};

/** HTML text as the words it shows: tags out, entities read, white space one space. */
export function htmlText(html: string): string {
  return html
    .replace(/<[^<>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (all, name: string) => {
      if (name.startsWith('#x') || name.startsWith('#X')) {
        return safeCodePoint(Number.parseInt(name.slice(2), 16)) ?? all;
      }
      if (name.startsWith('#')) return safeCodePoint(Number(name.slice(1))) ?? all;
      // By a name the page chose: only the table's own names (never `constructor`, plan 8Z-2).
      const known = name.toLowerCase();
      return Object.hasOwn(NAMED_ENTITIES, known) ? (NAMED_ENTITIES[known] ?? all) : all;
    })
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeCodePoint(code: number): string | undefined {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
    ? String.fromCodePoint(code)
    : undefined;
}

/** The parts of `html` that begin with `marker`, each up to the next (the first part, before any, left out). */
export function partsFrom(html: string, marker: string): string[] {
  const parts: string[] = [];
  let at = html.indexOf(marker);
  while (at >= 0) {
    const next = html.indexOf(marker, at + marker.length);
    parts.push(html.slice(at, next < 0 ? undefined : next));
    at = next;
  }
  return parts;
}

/** The inner HTML of the first element that opens with `open` (up to `close`), or undefined. */
export function between(html: string, open: string, close: string): string | undefined {
  const start = html.indexOf(open);
  if (start < 0) return undefined;
  const from = start + open.length;
  const end = html.indexOf(close, from);
  return end < 0 ? undefined : html.slice(from, end);
}

/** The addresses of the pictures in a piece of HTML, in order. */
function pictures(html: string): string[] {
  const found: string[] = [];
  for (const piece of partsFrom(html, '<img')) {
    const src = between(piece, 'src="', '"');
    if (src !== undefined) found.push(src);
  }
  return found;
}

/**
 * Only https addresses of Leek Duck's CDN are kept as a reward's picture (also a Rocket catch's:
 * ScrapedDuck's lineups name Leek Duck's pictures).
 */
export function leekDuckPicture(src: string | undefined): string | null {
  if (src === undefined) return null;
  // The page names its item pictures with spaces (`items/Rare Candy.png`).
  const address = htmlText(src).replace(/ /g, '%20');
  return /^https:\/\/cdn\.leekduck\.com\/[^\s"<>]{1,240}$/.test(address) ? address : null;
}

/** `×10` read as 10; 1 where the page gives none. */
function quantityOf(text: string): number {
  const match = /×\s*([\d,]{1,9})/.exec(text);
  const n = match?.[1] === undefined ? 1 : Number(match[1].replace(/,/g, ''));
  return Number.isSafeInteger(n) && n > 0 ? n : 1;
}

/** The number a `Max CP` or `Min CP` part gives, if any. */
function cpOf(html: string, marker: string): number | undefined {
  const part = between(html, marker, '</span>');
  const match = part === undefined ? null : /(\d{1,5})\s*$/.exec(htmlText(part));
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

/** The Pokédex number a picture's file names (`pm254.icon.png`). */
function dexOfPicture(src: string | undefined): number | null {
  const match = src === undefined ? null : /\/pm(\d{1,4})[.]/.exec(src);
  return match?.[1] === undefined ? null : Number(match[1]);
}

interface Reading {
  catalogue: PokemonCatalogue;
  unknown: Set<string>;
}

/** One reward of the page; undefined for one of another type or that says no name. */
function readReward(html: string, reading: Reading): TaskReward | undefined {
  const type = between(html, 'data-reward-type="', '"');
  const label = between(html, 'class="reward-label">', '</span></span>') ?? '';
  const srcs = pictures(html);
  if (type === 'encounter') {
    const name = htmlText(label).slice(0, MAX_REWARD_NAME);
    if (name === '') return undefined;
    const image = srcs[0];
    const ids = identifyBoss(name, image, feedLookupOf(reading.catalogue))?.resolved;
    const key = ids && feedLookupOf(reading.catalogue).keyOf(ids.pokemonId, ids.form);
    const entry = key === undefined ? undefined : reading.catalogue.byKey(key);
    if (!entry) reading.unknown.add(name);
    const max = cpOf(html, 'class="max-cp">');
    const min = cpOf(html, 'class="min-cp">');
    return {
      kind: 'encounter',
      name,
      key: entry?.key ?? null,
      dex: entry?.dex ?? null,
      shiny: html.includes('class="shiny-badge"'),
      cp: min !== undefined && max !== undefined ? { min, max } : null,
      image: leekDuckPicture(image),
    };
  }
  if (type === 'item' || type === 'resource') {
    // `Golden Razz Berry <span>×2</span>`: the name, then how many.
    const cut = label.indexOf('<span');
    const name = htmlText(cut < 0 ? label : label.slice(0, cut)).slice(0, MAX_REWARD_NAME);
    if (name === '') return undefined;
    const quantity = quantityOf(htmlText(label));
    if (type === 'resource') {
      return {
        kind: 'energy',
        dex: dexOfPicture(srcs[1]),
        name,
        quantity,
        image: leekDuckPicture(srcs[0]),
      };
    }
    const item = itemKey(name);
    if (item === '') return undefined;
    return { kind: 'item', item, name, quantity, image: leekDuckPicture(srcs[0]) };
  }
  return undefined;
}

/**
 * The Pokémon of the Spawns section of a Leek Duck event page (plan 8R-4, design 5): each list
 * item's name and picture (`<li class="pkmn-list-item">`, `<div class="pkmn-name">`), between the
 * section's heading (`<h2 id="spawns">`) and the next heading; then the rarer costumed ones its
 * sentences name in bold ("you might also encounter **Drifblim wearing a Halloween Mischief
 * costume**!", B-D2), without a picture, only those whose name says what they wear (`wornBy`), in
 * a sentence of a wild encounter (`isWildEncounterSentence`), not listed already. None for a page
 * without the section.
 */
export function parseEventSpawns(html: string): { name: string; image?: string }[] {
  const start = html.indexOf('<h2 id="spawns"');
  if (start < 0) return [];
  const next = html.indexOf('<h2', start + 3);
  const section = html.slice(start, next < 0 ? undefined : next);
  const listed = partsFrom(section, '<li class="pkmn-list-item"').flatMap((item) => {
    const name = htmlText(between(item, '<div class="pkmn-name">', '</div>') ?? '').slice(
      0,
      MAX_REWARD_NAME,
    );
    if (name === '') return [];
    const image = leekDuckPicture(pictures(item)[0]);
    return [{ name, ...(image === null ? {} : { image }) }];
  });
  const names = new Set(listed.map((spawn) => spawn.name));
  const named: { name: string }[] = [];
  for (const paragraph of paragraphsOf(section)) {
    if (!isWildEncounterSentence(htmlText(paragraph))) continue;
    for (const bold of boldParts(paragraph)) {
      const name = htmlText(bold).slice(0, MAX_REWARD_NAME);
      if (wornBy(name) === undefined || names.has(name)) continue;
      names.add(name);
      named.push({ name });
    }
  }
  return [...listed, ...named].slice(0, MAX_EVENT_SPAWNS);
}

/**
 * The inner HTML of each bold part of a paragraph (`<b …>` or `<strong …>`, a tag of at most 200
 * characters, up to the first close of that tag), in order, in one pass (fix round of 8Z-2: one
 * pattern with a lazy body was quadratic on opening tags never closed): a part goes on after the
 * close of the one before, and once a tag is never closed from some point on, none of its later
 * openings is looked at again.
 */
function boldParts(paragraph: string): string[] {
  const opening = /<(strong|b)\b[^>]{0,200}>/g;
  const parts: string[] = [];
  const unclosed = new Set<string>();
  for (let found = opening.exec(paragraph); found !== null; found = opening.exec(paragraph)) {
    const tag = found[1] ?? '';
    if (unclosed.has(tag)) continue;
    const from = found.index + found[0].length;
    const close = paragraph.indexOf(`</${tag}>`, from);
    if (close < 0) {
      unclosed.add(tag);
      continue;
    }
    parts.push(paragraph.slice(from, close));
    opening.lastIndex = close + tag.length + 3;
  }
  return parts;
}

/**
 * The most paragraphs of a section read (review C3): of a Spawns section for the names in its
 * sentences, of a Raids or Max Battles section for the time of its hours. The kept pages have
 * one or two a section.
 */
const MAX_SECTION_PARAGRAPHS = 50;
/** The most characters of one paragraph read (review C3): a sentence is far shorter. */
const MAX_PARAGRAPH_LENGTH = 4_000;
const CLOSE_P = '</p>';

/**
 * The inner HTML of a section's paragraphs, with bounded work (review C3): each from its `<p` to
 * its `</p>`, or to the next `<p` where it is not closed (as a browser reads it), at most
 * `MAX_PARAGRAPH_LENGTH` characters of it and `MAX_SECTION_PARAGRAPHS` of them. `cut` says that
 * the section has more than was read: a paragraph after the last, or the rest of a long one.
 */
function readParagraphs(section: string): { paragraphs: string[]; cut: boolean } {
  const paragraphs: string[] = [];
  let cut = false;
  let at = nextParagraph(section, 0);
  while (at >= 0 && paragraphs.length < MAX_SECTION_PARAGRAPHS) {
    const open = section.indexOf('>', at);
    if (open < 0) break;
    const following = nextParagraph(section, open + 1);
    // Its close looked for only as far as it is read (fix round of 8Z-2): never to the section's
    // end for each of fifty paragraphs that are not closed.
    const room = Math.min(
      following < 0 ? section.length : following,
      open + 1 + MAX_PARAGRAPH_LENGTH + CLOSE_P.length,
    );
    const inRoom = section.slice(open + 1, room).indexOf(CLOSE_P);
    const close = inRoom < 0 ? -1 : open + 1 + inRoom;
    const ends = Math.min(...[close, following].filter((end) => end >= 0), section.length);
    if (ends > open + 1 + MAX_PARAGRAPH_LENGTH) cut = true;
    paragraphs.push(section.slice(open + 1, Math.min(ends, open + 1 + MAX_PARAGRAPH_LENGTH)));
    at = following;
  }
  return { paragraphs, cut: cut || at >= 0 };
}

/** The paragraphs of a section as far as they are read (`readParagraphs`). */
function paragraphsOf(section: string): string[] {
  return readParagraphs(section).paragraphs;
}

/** Where the next `<p>` or `<p …>` opens from `from`, or -1 (never `<pre`, `<picture`). */
function nextParagraph(html: string, from: number): number {
  let at = html.indexOf('<p', from);
  while (at >= 0 && !/[\s>]/.test(html.charAt(at + 2))) at = html.indexOf('<p', at + 2);
  return at;
}

/**
 * Whether a sentence of the Spawns section tells of a wild encounter (review C2): it says
 * encounter, appear or in the wild, and not eggs, raids, research or what no longer appears.
 */
function isWildEncounterSentence(text: string): boolean {
  return (
    /encounter|appear|in the wild/i.test(text) &&
    !/\b(?:eggs?|hatch\w*|raids?|research|no longer|not appear)\b/i.test(text)
  );
}

/** The most Pokémon read of an event page's Spawns section (B4): no event lists more. */
const MAX_EVENT_SPAWNS = 100;

/** A Raid Hour an event page names: the day of the month, and the bosses listed under it. */
export interface PageRaidHour {
  /** 1 to 12. */
  month: number;
  day: number;
  bosses: string[];
}

/** The most Raid Hours read of one page: an event of a month has at most a few. */
const MAX_PAGE_RAID_HOURS = 20;
/** The most bosses read of one Raid Hour. */
const MAX_RAID_HOUR_BOSSES = 10;

/** The months' names: a heading may give a month's first letters (`Nov.`, `Sept`), three or more. */
const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
/** The most days of each month, February's in a leap year (the year is chosen later). */
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * `Raid Hour: Monday, November 9` (also `Raid Hours:`, without the weekday, with a month's short
 * name, `Nov. 9`, or a year after the day): the month and the day.
 */
const RAID_HOUR_HEADING =
  /^raid hours?\s*:\s*(?:[a-z]{3,9}\.?,?\s+)??(?<month>[a-z]{3,9})\.?\s+(?<day>\d{1,2})(?:st|nd|rd|th)?(?:,?\s+\d{4})?$/i;

/**
 * `Five-Star Max Battles: Wednesday, November 11` (any words before `Max Battles`, `Gigantamax`
 * among them for Gigantamax battles; also `Max Battle Hour:`, `Max Battle Weekend:`, and the date's shapes of
 * `RAID_HOUR_HEADING`): the words before, the month and the day.
 */
const MAX_HOUR_HEADING =
  /^(?<lead>[^:]{0,60}?)\s*max battles?(?:\s+(?:hours?|days?|weekends?))?\s*:\s*(?:[a-z]{3,9}\.?,?\s+)??(?<month>[a-z]{3,9})\.?\s+(?<day>\d{1,2})(?:st|nd|rd|th)?(?:,?\s+\d{4})?$/i;

/** The month and the day a dated heading names by `pattern` (groups `month` and `day`). */
function headingDate(
  pattern: RegExp,
  heading: string,
): { month: number; day: number; lead: string } | undefined {
  const groups = pattern.exec(heading)?.groups;
  if (groups?.month === undefined || groups.day === undefined) return undefined;
  const month = monthOf(groups.month);
  if (month === 0) return undefined;
  const day = Number(groups.day);
  return day >= 1 && day <= (MONTH_DAYS[month - 1] ?? 0)
    ? { month, day, lead: groups.lead ?? '' }
    : undefined;
}

/**
 * Each `<h3>` of a section whose text `pattern` reads as dated (`headingDate`), with the names of
 * the Pokémon listed after it up to the next heading or rule (at most 10), in order; at most 20.
 */
function datedLists(
  section: string,
  pattern: RegExp,
): { month: number; day: number; lead: string; bosses: string[] }[] {
  const found: { month: number; day: number; lead: string; bosses: string[] }[] = [];
  for (const part of partsFrom(section, '<h3')) {
    const close = part.indexOf('</h3>');
    if (close < 0) continue;
    const date = headingDate(pattern, htmlText(part.slice(part.indexOf('>') + 1, close)));
    if (date === undefined) continue;
    const after = part.slice(close);
    const rule = after.indexOf('<hr');
    const list = rule < 0 ? after : after.slice(0, rule);
    const bosses = partsFrom(list, '<li class="pkmn-list-item"')
      .map((item) =>
        htmlText(between(item, '<div class="pkmn-name">', '</div>') ?? '').slice(
          0,
          MAX_REWARD_NAME,
        ),
      )
      .filter((name) => name !== '')
      .slice(0, MAX_RAID_HOUR_BOSSES);
    found.push({ ...date, bosses });
    if (found.length === MAX_PAGE_RAID_HOURS) break;
  }
  return found;
}

/**
 * The Raid Hours of a Leek Duck event page (Matt, 2026-11-07: "Into the Wild" has its Raid Hours
 * only on its page): in the Raids section (`<h2 id="raids">` up to the next `<h2`), each `<h3>`
 * whose text is `Raid Hour: <weekday>, <month> <day>` (`RAID_HOUR_HEADING`), with the names of
 * the Pokémon listed after it up to the next heading or rule. Their time is the paragraphs'
 * (`eventPageTime`), else the weekly one's (`eventPageRaidHours`). At most 20; none for a page
 * without the section.
 */
export function parseEventRaidHours(html: string): PageRaidHour[] {
  return datedLists(raidsSection(html), RAID_HOUR_HEADING).map(({ month, day, bosses }) => ({
    month,
    day,
    bosses,
  }));
}

/** A Max Battle hour an event page names: its day, its bosses, and whether it is Gigantamax. */
export interface PageMaxHour {
  /** 1 to 12. */
  month: number;
  day: number;
  bosses: string[];
  gigantamax: boolean;
}

/**
 * The Max Battle hours of a Leek Duck event page (Matt's decision of 2026-10-25: "Into the Wild"
 * features a five-star boss in Max Battles from 6 to 7 p.m. on each of three days, on its page
 * only): in the Max Battles section (`<h2 id="max-battles">` up to the next `<h2`), each `<h3>`
 * whose text is `<words> Max Battles: <weekday>, <month> <day>` (`MAX_HOUR_HEADING`; the words
 * say `Gigantamax` for Gigantamax battles, as does every boss listed under it being named
 * `Gigantamax …`), with the names of the Pokémon listed after it up to
 * the next heading or rule; a heading without a date (`One-Star Max Battles`) is none. Their
 * time is the section's paragraphs' (`eventPageTime`). At most 20; none for a page without the
 * section.
 */
export function parseEventMaxHours(html: string): PageMaxHour[] {
  return datedLists(sectionOf(html, 'max-battles'), MAX_HOUR_HEADING).map(
    ({ month, day, bosses, lead }) => ({
      month,
      day,
      bosses,
      // Said by the heading, or by every boss listed (review).
      gigantamax:
        /\bgigantamax\b/i.test(lead) ||
        (bosses.length > 0 && bosses.every((name) => /^gigantamax\s/i.test(name))),
    }),
  );
}

/**
 * How many headings of the Max Battles section are dated by their id
 * (`<h3 id="five-star-max-battles-wednesday-november-11">`; review: `-<month>-<day>` anywhere in
 * the id, so that a heading with a time of its own, `…-november-11-6-pm`, which
 * `parseEventMaxHours` does not read, is counted): fewer read means the page's shape changed.
 */
export function maxHourHeadings(html: string): number {
  return partsFrom(sectionOf(html, 'max-battles'), '<h3').filter((part) => {
    const id = /^<h3\s[^>]*\bid="([^"]*)"/.exec(part)?.[1];
    if (id === undefined) return false;
    return [...id.matchAll(/-([a-z]{3,9})-(\d{1,2})(?=-|$)/g)].some(
      (match) => monthOf(match[1] ?? '') > 0,
    );
  }).length;
}

/** An event page's Raids section, `<h2 id="raids"` up to the next `<h2`; empty without one. */
function raidsSection(html: string): string {
  return sectionOf(html, 'raids');
}

/** An event page's section of that id, `<h2 id="<id>"` up to the next `<h2`; empty without one. */
function sectionOf(html: string, id: string): string {
  const start = html.indexOf(`<h2 id="${id}"`);
  if (start < 0) return '';
  const next = html.indexOf('<h2', start + 3);
  return html.slice(start, next < 0 ? undefined : next);
}

/** A time of day an event page gives for its hours: from `hour`:`minute`, lasting `minutes`. */
export interface PageHoursTime {
  hour: number;
  minute: number;
  minutes: number;
}

/**
 * What a section of an event page says of the time of its dated hours (`eventPageTime`): one
 * time for all of them; none at all; or `unclear` (several ranges, one that cannot be read, a
 * time that is no range, or dates that leave a heading out).
 */
export type PageTimeRead =
  { kind: 'time'; time: PageHoursTime } | { kind: 'none' } | { kind: 'unclear' };

/** `from 6:00 p.m. to 7:00 p.m.` (also `from 6 to 7 p.m.`, `until`, a dash): one time range. */
const TIME_RANGE =
  /\bfrom\s+(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?\s?m\b\.?)?\s*(?:to|until|–|-)\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\b/gi;
/** Any time of day a sentence may say, a range or not. */
const ANY_TIME = /\b\d{1,2}(?::\d{2})?\s*[ap]\.?\s?m\b|\bnoon\b|\bmidnight\b/i;
/** `November 9`, `Nov. 9th`: a date a sentence names (a month's first letters, three or more). */
const NAMED_DATE = /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;
/**
 * The longest time a section's range may give its hours (review of `event-pages-more`): a Raid
 * Hour of over three hours is no Raid Hour; Max Battle hours are short events (`SHORT_EVENT_MS`).
 */
const MAX_PAGE_HOURS_MINUTES = { raids: 3 * 60, 'max-battles': 6 * 60 } as const;
/**
 * The paragraphs whose ranges are the hours' (review): a Raids section's that names Raid Hours,
 * a Max Battles section's that says "featured" or names Max Battles. Another paragraph's range
 * ("Shadow raids … from 10 a.m. to 1 p.m.") is of something else.
 */
const NAMES_THE_HOURS = {
  raids: /\braid hours?\b/i,
  'max-battles': /\bfeatured\b|\bmax battles?\b/i,
};
/**
 * A time zone named after a range ("6 p.m. to 7 p.m. PT", "UTC", "(PDT)", "GMT+1"): such a time is
 * not the local time Pine places the hours at ("local time" is). Read after the range's end.
 */
const NAMED_ZONE =
  /^\.?\s*\(?\s*(?:UTC|GMT|[ECMP][SD]?T|AK[SD]?T|H[SD]?T|BST|CES?T|JST|KST|AE[SD]T|NZ[SD]T)\b/;

/** The month of a word, by its first letters (three or more); 0 for none. */
function monthOf(word: string): number {
  const name = word.toLowerCase();
  return name.length < 3 ? 0 : MONTH_NAMES.findIndex((full) => full.startsWith(name)) + 1;
}

/** Minutes after midnight of a clock time with its `a`/`p`: 12 a.m. is midnight, 12 p.m. noon. */
function minutesOfDay(hour: number, minute: number, half: string): number | undefined {
  if (hour < 1 || hour > 12 || minute > 59) return undefined;
  return ((hour % 12) + (half.toLowerCase() === 'p' ? 12 : 0)) * 60 + minute;
}

/**
 * The time a section of an event page (`raids`, `max-battles`) gives its dated hours, read from
 * its paragraphs that name the hours (`NAMES_THE_HOURS`; Into the Wild's Raids section: "…
 * featured in Raid Hours from 6:00 p.m. to 7:00 p.m. local time on Monday, November 9, and
 * Tuesday, November 10, respectively"): the one time range they name (the same range said twice
 * is one), when every heading's day (`days`) is among the dates they name, or they name none ("…
 * for one day each on the following schedule"). A range without its first `a.m.`/`p.m.` takes
 * the second's. `none` where those paragraphs name no time; `unclear` for several ranges, a range
 * that ends before it starts or lasts too long (`MAX_PAGE_HOURS_MINUTES`: over three hours for
 * Raid Hours), one followed by a zone's name (`NAMED_ZONE`: "PT", "UTC"), a time that is no
 * range ("at 6 p.m.", "from noon"), or dates that leave a day out; also for a section with more
 * paragraphs, or a longer one, than are read (`readParagraphs`: 50 of 4,000 characters; the kept
 * pages' sections have one or two, of some 230).
 */
export function eventPageTime(
  html: string,
  section: 'raids' | 'max-battles',
  days: readonly { month: number; day: number }[],
): PageTimeRead {
  // Paragraph by paragraph, with bounded work (plan 8Z-2: one pattern over the whole section was
  // quadratic on paragraphs that are not closed).
  const read = readParagraphs(sectionOf(html, section));
  // What was not read may name another time: no time is taken from a part of the section.
  if (read.cut) return { kind: 'unclear' };
  const paragraphs = read.paragraphs
    .map((paragraph) => htmlText(paragraph))
    .filter((text) => NAMES_THE_HOURS[section].test(text))
    .join(' ');
  const ranges = new Map<string, PageHoursTime>();
  let unreadable = false;
  for (const match of paragraphs.matchAll(TIME_RANGE)) {
    const [, fromHour, fromMinute, fromHalf, toHour, toMinute, toHalf] = match;
    if (fromHour === undefined || toHour === undefined || toHalf === undefined) continue;
    const end = minutesOfDay(Number(toHour), Number(toMinute ?? 0), toHalf);
    let start = minutesOfDay(Number(fromHour), Number(fromMinute ?? 0), fromHalf ?? toHalf);
    // "from 11 to 1 p.m.": the first half of the day.
    if (fromHalf === undefined && start !== undefined && end !== undefined && start >= end) {
      start -= 12 * 60;
    }
    const minutes = start === undefined || end === undefined ? 0 : end - start;
    const zoneAfter = NAMED_ZONE.test(paragraphs.slice(match.index + match[0].length));
    if (
      start === undefined ||
      start < 0 ||
      minutes <= 0 ||
      minutes > MAX_PAGE_HOURS_MINUTES[section] ||
      zoneAfter
    ) {
      unreadable = true;
      continue;
    }
    ranges.set(`${String(start)}+${String(minutes)}`, {
      hour: Math.floor(start / 60),
      minute: start % 60,
      minutes,
    });
  }
  const [only, ...more] = [...ranges.values()];
  if (only === undefined && !unreadable) {
    return ANY_TIME.test(paragraphs) ? { kind: 'unclear' } : { kind: 'none' };
  }
  if (only === undefined || unreadable || more.length > 0) return { kind: 'unclear' };
  const named = [...paragraphs.matchAll(NAMED_DATE)].flatMap((match) => {
    const month = monthOf(match[1] ?? '');
    return month === 0 ? [] : [`${String(month)}-${String(Number(match[2]))}`];
  });
  const covered =
    named.length === 0 ||
    days.every(({ month, day }) => named.includes(`${String(month)}-${String(day)}`));
  return covered ? { kind: 'time', time: only } : { kind: 'unclear' };
}

/**
 * How many headings of the Raids section are a Raid Hour's by their id
 * (`<h3 id="raid-hour-monday-november-9">`; review ER-3): fewer read by `parseEventRaidHours`
 * means the page's shape changed. An id `raid-hour` without the dash (a Raid Hour's own page)
 * is none.
 */
export function raidHourHeadings(html: string): number {
  return partsFrom(raidsSection(html), '<h3').filter((part) =>
    /^<h3\s[^>]*\bid="raid-hour-/.test(part),
  ).length;
}

/**
 * The page's sections, each up to the next: the `<div>`s with the word `task-category` in their
 * class. An event's section has more words (`task-category event-field-research`, the page of
 * 2026-10-30) and attributes, so neither the whole attribute nor its first letters tell it.
 */
function categoriesOf(page: string): string[] {
  const open = '<div class="';
  const starts: number[] = [];
  for (let at = page.indexOf(open); at >= 0; at = page.indexOf(open, at + open.length)) {
    const from = at + open.length;
    const words = page.slice(from, Math.max(from, page.indexOf('"', from))).split(/\s+/);
    if (words.includes('task-category')) starts.push(at);
  }
  return starts.map((start, i) => page.slice(start, starts[i + 1]));
}

/**
 * How many times the page says the word `task-category`, not as a part of another word or a
 * stylesheet's selector: more than `categoriesOf` read means sections of a shape it does not read
 * (the class not the tag's first attribute, or not in double quotes), which would go unnoticed.
 */
function categoryWords(page: string): number {
  const word = 'task-category';
  let count = 0;
  for (let at = page.indexOf(word); at >= 0; at = page.indexOf(word, at + word.length)) {
    const around = `${page[at - 1] ?? ' '}${page[at + word.length] ?? ' '}`;
    if (!/^[\w.-]/.test(around) && !/[\w-]$/.test(around)) count += 1;
  }
  return count;
}

/**
 * The end a section's tag gives, epoch milliseconds: `undefined` for none, `null` for one that
 * cannot be read. The page writes the wall clock of the event's local time with its own zone's
 * offset (`2026-11-01T10:00:00-0800`; the events feed has the same event end
 * `2026-11-01T10:00:00.000`, a local time), so the offset is dropped and the time read in `zone`;
 * `Z` is no zone of Leek Duck's: that moment. The attribute in a shape not read is one not read.
 * Kept as the feed time it is (plan 19A-2: wall-clock time, a moment in each server's zone).
 */
function sectionEnd(category: string): FeedTime | null | undefined {
  const tag = category.slice(0, category.indexOf('>') + 1);
  const end = between(tag, 'data-event-end="', '"');
  if (end === undefined) return tag.includes('data-event-end') ? null : undefined;
  return readFeedTime(end.replace(/[+-]\d{2}:?\d{2}$/, '')) ?? null;
}

/** A section's end: its moment in the zone read in, and as the page gave it. */
interface SectionEnd {
  at: number;
  time: FeedTime;
}

/**
 * Reads Leek Duck's research page. Throws when it holds no task at all (another page, a page of
 * another shape), so that a broken read never replaces a good list. A task listed twice (the
 * same folded text) is one task with the rewards of both, and ends only with the last section
 * that lists it (never, where one has no end). `zone` is the server's (`settings.timezone`).
 */
export function parseResearchPage(
  html: string,
  catalogue: PokemonCatalogue,
  zone: string,
): ParsedResearchPage {
  const end = html.indexOf('research-breakthrough-section');
  const page = end < 0 ? html : html.slice(0, end);
  const reading: Reading = { catalogue, unknown: new Set() };
  const byKey = new Map<string, ResearchTask>();
  /** Each task's end so far: null for a task that has none, as a section without one says. */
  const ends = new Map<string, SectionEnd | null>();
  let skipped = 0;
  let unreadEnds = 0;
  const categories = categoriesOf(page);
  for (const category of categories) {
    const read = sectionEnd(category);
    if (read === null) unreadEnds += 1;
    const end: SectionEnd | null =
      read == null ? null : { at: momentIn(read, zone).epochMilliseconds, time: read };
    const heading = htmlText(between(category, '<h2>', '</h2>') ?? '')
      .replace(/\s+tasks$/i, '')
      .slice(0, 60);
    for (const item of partsFrom(category, '<li class="task-item"')) {
      const text = htmlText(between(item, 'class="task-text">', '</span></span>') ?? '').slice(
        0,
        MAX_TASK_TEXT,
      );
      if (text === '') {
        skipped += 1;
        continue;
      }
      const rewards: TaskReward[] = [];
      for (const piece of partsFrom(item, '<li class="reward"')) {
        const reward = readReward(piece, reading);
        if (reward) rewards.push(reward);
        else skipped += 1;
      }
      const key = taskKeyOf(text);
      const before = ends.get(key);
      ends.set(
        key,
        before === undefined
          ? end
          : before === null || end === null
            ? null
            : end.at > before.at
              ? end
              : before,
      );
      const known = byKey.get(key);
      if (known) {
        const keyOf = (reward: TaskReward): string => rewardKey(reward, catalogue);
        const have = new Set(known.rewards.map(keyOf));
        known.rewards.push(...rewards.filter((reward) => !have.has(keyOf(reward))));
        continue;
      }
      byKey.set(key, { key, text, category: heading === '' ? 'Other' : heading, rewards });
    }
  }
  if (byKey.size === 0) throw new Error('The research page lists no task');
  return {
    tasks: [...byKey.values()].map((task) => {
      const ending = ends.get(task.key) ?? null;
      if (ending === null) return task;
      const local = 'local' in ending.time ? { endsLocal: ending.time.local } : {};
      return { ...task, endsAt: ending.at, ...local };
    }),
    skipped,
    unknown: [...reading.unknown],
    unreadSections: Math.max(0, categoryWords(page) - categories.length),
    unreadEnds,
  };
}
