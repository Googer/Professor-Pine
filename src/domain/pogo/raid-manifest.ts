import { z } from 'zod';
import { between, htmlText, partsFrom } from '../research/leekduck.js';
import { isForEveryone } from '../time/event-reach.js';
import { localsOf } from '../time/feed-times.js';
import { momentIn, readFeedTime } from '../time/zoned.js';
import { readHeading } from './raid-boss-feed.js';

/*
 * Leek Duck's raid rotations (plan 8B-L, finding B1 of the 8R-9F staging): its Raid Bosses page
 * picks the rotation in the browser from `raids/manifest.json` and loads the chosen rotation's
 * boss cards from `raids/<slug>.html`, so the page as served (and ScrapedDuck's `raids.json`,
 * which scrapes it) can lag a rotation behind the game. Pine reads the manifest, the rotations in
 * force at a moment, and their pages, into the entries ScrapedDuck's feed has, so that
 * `parseRaidBossFeed` and every rule after it stay the one path. Pure.
 */

/** A rotation of the regular raids, or of the shadow raids, which run beside them. */
export type RotationKind = 'regular' | 'shadow';

/** A rotation everyone plays, at its times in the zone the manifest was read in. */
export interface RaidRotation {
  /** Lower-case letters, digits and `-` only: its page's address is made of it. */
  slug: string;
  title: string;
  kind: RotationKind;
  /** Epoch ms; the rotation is in force from `start` until before `end`. */
  start: number;
  end: number;
  /** The start as wall-clock time, where it is one (`FeedTimed`, plan 19A-2: `local_time`). */
  startLocal?: string;
  /** The end as wall-clock time, where it is one. */
  endLocal?: string;
}

export interface ParsedManifest {
  /** In the manifest's order: the regular rotations, then the shadow ones. */
  rotations: RaidRotation[];
  /** Rotations left out because they could not be read: a bad slug, a bad time, listed twice. */
  skipped: number;
  /** Rotations left out because they are an in-person event's, at a city's own times. */
  elsewhere: number;
}

/** A boss of a rotation's page in the shape of an entry of ScrapedDuck's `raids.json`. */
export interface RotationEntry {
  name: string;
  /** The tier's heading as the page labels it (`1-Star Raids`, `Super Mega Raids`). */
  tier: string;
  canBeShiny: boolean;
  /** The picture's address as the page gives it; `parseRaidBossFeed` decides whether it is usable. */
  image?: string;
}

/** The manifest of 2026-10-27 lists 8 rotations; far more is no manifest Pine should follow. */
const MAX_ROTATIONS = 100;
const MAX_SLUG_LENGTH = 120;
const MAX_TITLE_LENGTH = 200;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** `2026-10-27 10:00:00 -0800`: a date, a time of day and, perhaps, an offset. */
const TIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)(?:\s*([+-]\d{2}):?(\d{2}))?$/;
/** The events feed's type of a raid rotation, for the rule of everyone's events. */
const ROTATION_EVENT_TYPE = 'raid-battles';

const rotationSchema = z.object({
  slug: z.string().max(MAX_SLUG_LENGTH).regex(SLUG),
  title: z.unknown(),
  start_date: z.string().max(40),
  end_date: z.string().max(40),
  local_time: z.boolean().optional(),
});

function manifestError(message: string): Error {
  return new Error(`The raid manifest is not in the expected format: ${message}`);
}

/**
 * A time of the manifest as Leek Duck means it, in ISO form: with `local_time` the wall-clock
 * time wherever the player is (the offset is Leek Duck's Pacific placeholder and is dropped, as the
 * page's own script drops it); without it, the time at the offset it gives (an in-person event's,
 * in its city), or a wall-clock time when it gives none. Undefined for a text of another shape.
 */
function meantTime(text: string, local: boolean): string | undefined {
  const match = TIME.exec(text.trim());
  if (!match) return undefined;
  const [, date, clock, hours, minutes] = match;
  const offset = local || hours === undefined ? '' : `${hours}:${minutes ?? '00'}`;
  return `${date ?? ''}T${clock ?? ''}${offset}`;
}

function titleOf(title: unknown, slug: string): string {
  if (typeof title !== 'string') return slug;
  const text = title
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE_LENGTH);
  return text === '' ? slug : text;
}

/**
 * Reads Leek Duck's `raids/manifest.json`: `regular_raids` and `shadow_raids`, each a list of
 * rotations with a `slug`, a `title`, a `start_date` and `end_date`, and `local_time`. A rotation
 * at local times is read in `zone` (`settings.timezone`); one at a city's own times is an
 * in-person event's and is left out by the rule of everyone's events (`isForEveryone`, plan
 * 8R-7: a time with a zone of its own), counted as `elsewhere`. A rotation that cannot be read is
 * skipped and counted; only a document that is no manifest (no list of regular raids) throws.
 */
export function parseRaidManifest(json: unknown, zone: string): ParsedManifest {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw manifestError('the document is not an object');
  }
  const document = json as Record<string, unknown>;
  const regular = document['regular_raids'];
  const shadow = document['shadow_raids'] ?? [];
  if (!Array.isArray(regular)) throw manifestError('regular_raids is not a list');
  if (!Array.isArray(shadow)) throw manifestError('shadow_raids is not a list');

  const rotations: RaidRotation[] = [];
  const slugs = new Set<string>();
  let skipped = 0;
  let elsewhere = 0;
  const lists: [RotationKind, unknown[]][] = [
    ['regular', regular as unknown[]],
    ['shadow', shadow as unknown[]],
  ];
  for (const [kind, list] of lists) {
    skipped += Math.max(0, list.length - MAX_ROTATIONS);
    for (const value of list.slice(0, MAX_ROTATIONS)) {
      const parsed = rotationSchema.safeParse(value);
      if (!parsed.success || slugs.has(parsed.data.slug)) {
        skipped += 1;
        continue;
      }
      const { slug, start_date: startText, end_date: endText } = parsed.data;
      const local = parsed.data.local_time === true;
      const title = titleOf(parsed.data.title, slug);
      const start = meantTime(startText, local);
      const end = meantTime(endText, local);
      if (start === undefined || end === undefined) {
        skipped += 1;
        continue;
      }
      if (
        !isForEveryone({ eventID: slug, eventType: ROTATION_EVENT_TYPE, name: title, start, end })
      ) {
        elsewhere += 1;
        continue;
      }
      const fromTime = readFeedTime(start);
      const toTime = readFeedTime(end);
      if (fromTime === undefined || toTime === undefined) {
        skipped += 1;
        continue;
      }
      const from = momentIn(fromTime, zone).epochMilliseconds;
      const to = momentIn(toTime, zone).epochMilliseconds;
      if (to <= from) {
        skipped += 1;
        continue;
      }
      slugs.add(slug);
      rotations.push({ slug, title, kind, start: from, end: to, ...localsOf(fromTime, toTime) });
    }
  }
  return { rotations, skipped, elsewhere };
}

/**
 * How long a rotation that ended stays in force while no rotation of its kind follows it (review
 * R1 of 8B-L): Leek Duck leaves gaps between rotations (Halloween Part I ended at 20:00, the
 * Giratina week began at 06:00 the next day), in which the game keeps the bosses it had.
 */
export const KEPT_AFTER_END_MS = 24 * 60 * 60_000;

/**
 * The rotations in force at `now`, in the manifest's order: those running (from `start` until
 * before `end`); and, of a kind (regular, shadow) of which none is running, the ones of that kind
 * that ended last, while that end is less than `KEPT_AFTER_END_MS` ago (until the next of the kind
 * starts, which ends the gap).
 */
export function rotationsAt(rotations: readonly RaidRotation[], now: number): RaidRotation[] {
  const kept = new Set<RaidRotation>();
  for (const kind of ['regular', 'shadow'] as const) {
    const ofKind = rotations.filter((rotation) => rotation.kind === kind);
    const running = ofKind.filter((rotation) => rotation.start <= now && now < rotation.end);
    if (running.length > 0) {
      for (const rotation of running) kept.add(rotation);
      continue;
    }
    const ended = ofKind.filter((rotation) => rotation.end <= now);
    const last = Math.max(...ended.map((rotation) => rotation.end));
    if (ended.length === 0 || now >= last + KEPT_AFTER_END_MS) continue;
    for (const rotation of ended) if (rotation.end === last) kept.add(rotation);
  }
  return rotations.filter((rotation) => kept.has(rotation));
}

/**
 * The first moment after `now` at which the rotations in force (`rotationsAt`) change: a start, an
 * end that no gap keeps, or the end of a gap's 24 hours. Undefined when nothing later changes them.
 */
export function nextRotationChange(
  rotations: readonly RaidRotation[],
  now: number,
): number | undefined {
  const times = [
    ...new Set(rotations.flatMap(({ start, end }) => [start, end, end + KEPT_AFTER_END_MS])),
  ]
    .filter((time) => time > now)
    .sort((a, b) => a - b);
  const slugs = (time: number): string =>
    rotationsAt(rotations, time)
      .map((rotation) => rotation.slug)
      .join(' ');
  const current = slugs(now);
  return times.find((time) => slugs(time) !== current);
}

/** A rotation's page, beside the manifest, as Leek Duck's own script asks for it (`<slug>.html`). */
export function rotationAddress(manifestUrl: string, slug: string): string {
  return new URL(`${slug}.html`, manifestUrl).href;
}

/** No rotation's page has anywhere near this many tiers or cards; the rest is not read. */
const MAX_TIERS = 20;
const MAX_CARDS = 300;

/**
 * The parts of `html` that begin with an element `tag` whose class list starts with `name`
 * (`<div class="card -shadow">` for `card`, never `<div class="cards">`), each up to the next.
 */
function classParts(html: string, tag: string, name: string): string[] {
  const marker = `<${tag} class="${name}`;
  return partsFrom(html, marker).filter((part) => {
    const next = part.charAt(marker.length);
    return next === '"' || next === ' ';
  });
}

/** The inner HTML of the first element `tag` of the class `name` in `html`. */
function innerOf(html: string, tag: string, name: string): string | undefined {
  const part = classParts(html, tag, name)[0];
  if (part === undefined) return undefined;
  const open = part.indexOf('>');
  const close = part.indexOf(`</${tag}>`);
  return open < 0 || close < open ? undefined : part.slice(open + 1, close);
}

/** The heading of a tier: its label, or `data-tier` when it has none (`Super Mega`). */
function tierHeading(tier: string): string {
  const label = htmlText(innerOf(tier, 'span', 'tier-label') ?? '');
  if (label !== '') return label;
  const header = classParts(tier, 'h2', 'header')[0] ?? '';
  return htmlText(between(header.slice(0, header.indexOf('>') + 1), 'data-tier="', '"') ?? '');
}

/**
 * Reads a rotation's page (`raids/<slug>.html`, an HTML fragment): a `tier` per heading, with its
 * `tier-label` (`1-Star Raids`, as ScrapedDuck's `tier`), and a `card` per boss with its picture
 * (`boss-img`), the shiny mark (`shiny-icon`) and its `name` (a shadow boss is named `Shadow …`
 * under the star headings). With small scans, as the research page is read: a card without a
 * name is skipped and counted. A page without tiers gives no entry, which the caller judges.
 */
export function parseRotationFragment(html: string): {
  entries: RotationEntry[];
  skipped: number;
} {
  const entries: RotationEntry[] = [];
  let skipped = 0;
  for (const tier of classParts(html, 'div', 'tier').slice(0, MAX_TIERS)) {
    const heading = tierHeading(tier);
    for (const card of classParts(tier, 'div', 'card')) {
      const name = htmlText(innerOf(card, 'p', 'name') ?? '');
      if (name === '' || heading === '' || entries.length >= MAX_CARDS) {
        skipped += 1;
        continue;
      }
      // The picture's element only (it holds no other div): the shiny mark is on the picture.
      const part = classParts(card, 'div', 'boss-img')[0] ?? '';
      const close = part.indexOf('</div>');
      const picture = close < 0 ? part : part.slice(0, close);
      const img = between(picture, '<img', '>');
      const src = img === undefined ? undefined : between(img, 'src="', '"');
      const image = src === undefined ? '' : htmlText(src);
      entries.push({
        name,
        tier: heading,
        canBeShiny: picture.includes('class="shiny-icon"'),
        ...(image === '' ? {} : { image }),
      });
    }
  }
  return { entries, skipped };
}

/** What makes two headings one tier: the level `readHeading` reads, else the text itself. */
function headingKey(heading: string): string {
  const read = readHeading(heading);
  return read ? `${read.level}|${String(read.shadow)}` : `?${htmlText(heading).toLowerCase()}`;
}

/**
 * The entries of the rotations in force as one list. Rotations overlap (a Raid Day inside the
 * week's rotation, a Wild Area's weekend): each tier heading is given by the rotation that started
 * last (of two that started together, the one that ends first), the others keeping the headings
 * it lacks; so a Super Mega Raid Day adds its tier to the week's tiers, and a Raid Day that lists
 * 5-Star Raids replaces the week's for its hours (the week's boss of that tier is out of the
 * list meanwhile). The shadow rotations are merged among themselves and added after the regular
 * ones, whose headings they never take; their headings say `Shadow` (`Shadow 1-Star Raids`, review
 * R4 of 8B-L), so a boss of theirs is a shadow boss whether or not its name says `Shadow `.
 */
export function mergeRotations(
  read: readonly { rotation: RaidRotation; entries: readonly RotationEntry[] }[],
): RotationEntry[] {
  const merged: RotationEntry[] = [];
  for (const kind of ['regular', 'shadow'] as const) {
    const group = read
      .filter((item) => item.rotation.kind === kind)
      .sort((a, b) => b.rotation.start - a.rotation.start || a.rotation.end - b.rotation.end);
    const given = new Set<string>();
    for (const { entries } of group) {
      const keys = new Set<string>();
      for (const item of entries) {
        const shadowHeading = kind === 'shadow' && readHeading(item.tier)?.shadow !== true;
        const entry = shadowHeading ? { ...item, tier: `Shadow ${item.tier}` } : item;
        const key = headingKey(entry.tier);
        keys.add(key);
        if (!given.has(key)) merged.push(entry);
      }
      for (const key of keys) given.add(key);
    }
  }
  return merged;
}
