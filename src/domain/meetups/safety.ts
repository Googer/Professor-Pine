import type { Place } from '../geo/place.js';
import type { PlaceKind } from '../search/place-merge.js';

/**
 * Meetup safety (plan 8S-1; spec `2026-10-17-meetup-safety-design.md`, Matt's lighter rule): a
 * meetup at a place that might be a private home is held for a moderator. Pins always are; a
 * gym, PokéStop or power spot is when its title looks like a front-yard feature (Niantic refuses
 * private homes as Wayspots, so these leftovers are the risk); a moderator's ruling of a place
 * overrides its title; a blocked member makes no meetups; staff skip all of it.
 */

/**
 * The words and phrases of a title that send a meetup to the moderators first (the research
 * of 2026-10-17: what is left of private homes among Wayspots): little free libraries,
 * apartment and condominium buildings (and an apartment's number, "Apt 3"), townhomes,
 * residences, what calls itself private, and the businesses people run from home. Compared in
 * lower case, as whole words. Not "home of": public signs say it ("Home of the 1972 State
 * Champions"), and the moderators should see few requests.
 */
export const DEFAULT_FLAGGED_WORDS: readonly string[] = [
  'little free library',
  'apartment',
  'apartments',
  'apts',
  'condo',
  'condos',
  'condominium',
  'condominiums',
  'townhome',
  'townhomes',
  'townhouse',
  'townhouses',
  'residence',
  'private',
  'salon',
  'studio',
  'llc',
  'daycare',
  'apt',
];

/**
 * The words in effect: the default list and the server's own (`settings.meetupSafety.flaggedWords`),
 * trimmed, in lower case, each once.
 */
export function flaggedWordsOf(extra: readonly string[] | undefined): string[] {
  const words = [...DEFAULT_FLAGGED_WORDS, ...(extra ?? [])]
    .map((word) => word.trim().toLowerCase().replace(/\s+/gu, ' '))
    .filter((word) => word !== '');
  return [...new Set(words)];
}

/** A letter or a digit: what a word is made of, so that a word ends where none follows. */
const WORDISH = '[\\p{L}\\p{N}]';

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** The one expression of a list of words, made once per list (`flaggedWordsOf` gives one each). */
const matchers = new WeakMap<readonly string[], RegExp | null>();

function matcherOf(words: readonly string[]): RegExp | null {
  let matcher = matchers.get(words);
  if (matcher === undefined) {
    const bodies = words.map((word) => word.split(' ').map(escaped).join('\\s+'));
    matcher =
      bodies.length === 0
        ? null
        : new RegExp(`(?<!${WORDISH})(?:${bodies.join('|')})(?!${WORDISH})`, 'iu');
    matchers.set(words, matcher);
  }
  return matcher;
}

/**
 * A flagged word that stands in `title` as a whole word (no letter or digit right before or
 * after it; the words of a phrase across any white space), without regard to letter case, as
 * the list has it; undefined for none. The words are one expression, made once per list.
 */
export function flaggedWordIn(title: string, words: readonly string[]): string | undefined {
  const found = matcherOf(words)?.exec(title)?.[0];
  if (found === undefined) return undefined;
  const said = found.toLowerCase().replace(/\s+/gu, ' ');
  return words.find((word) => word === said) ?? said;
}

/** A moderator's ruling of a place, for good: allowed (Approve) or refused (Refuse from now on). */
export type PlaceRuling = 'allow' | 'refuse';

/** What a ruling is kept by: the place's kind and id (a gym's number, a Wayspot's Wayfarer id). */
export interface RulingKey {
  kind: PlaceKind;
  id: string;
}

/** The key of a place's ruling; a pin has none (an approval of a pin is for that meetup only). */
export function rulingKeyOf(place: Place): RulingKey | undefined {
  return place.kind === 'pin' ? undefined : { kind: place.kind, id: place.id };
}

/** What may be asked of the check; 8M-5 (meetups from the web map) asks the same. */
export interface PlaceCheck {
  /** Whether meetup safety is on in the server (the server's moderators' channel is set). */
  on: boolean;
  /** The place the meetup is to be at, as it was named. */
  place: Place;
  /** The maker is an admin, a moderator or the owner (`isStaff`). */
  staff: boolean;
  /** The maker is blocked from making meetups in the server. */
  blocked: boolean;
  /** The server's ruling of the place, if any (never asked for a pin, and ignored for one). */
  ruling: PlaceRuling | undefined;
  /** The flagged words in effect (`flaggedWordsOf`). */
  flaggedWords: readonly string[];
  /**
   * The place's other names, checked as its title is: a gym's official name and its nickname
   * (its title is the one its post shows, the nickname first).
   */
  otherTitles?: readonly string[];
}

/**
 * Whether a meetup may be posted at once (`allowed`), needs a moderator's approval (`review`),
 * may not be held there (`refused`) or may not be made by this member (`blocked`). In this
 * order: the safety off, or a member of staff, allows everything (staff are never blocked);
 * a block; a pin always needs approval (a pin has no ruling, and one given is ignored); a
 * refusal of the place; an allowed place; a flagged title (or other name); anything else is
 * allowed.
 */
export function meetupPlaceVerdict(
  check: PlaceCheck,
): 'allowed' | 'review' | 'refused' | 'blocked' {
  if (!check.on || check.staff) return 'allowed';
  if (check.blocked) return 'blocked';
  if (check.place.kind === 'pin') return 'review';
  if (check.ruling === 'refuse') return 'refused';
  if (check.ruling === 'allow') return 'allowed';
  const titles = [check.place.title, ...(check.otherTitles ?? [])];
  return titles.some((title) => flaggedWordIn(title, check.flaggedWords) !== undefined)
    ? 'review'
    : 'allowed';
}

export type MeetupVerdict = ReturnType<typeof meetupPlaceVerdict>;

const HOUR = 3_600_000;

/**
 * How long a place stays refused before members may ask the moderators about it (plan 8S-2;
 * Matt asked for "a week or two"): counted per place, from the refusal or the last Keep refused.
 */
export const PLACE_ASK_WAIT_DAYS = 14;

/** When members may first ask about a place refused at `ruledAt` and last kept at `keptAt`. */
export function askableAt(ruling: { ruledAt: number; keptAt: number | null }): number {
  return Math.max(ruling.ruledAt, ruling.keptAt ?? 0) + PLACE_ASK_WAIT_DAYS * 24 * HOUR;
}

/** How long a request waits at most for a moderator. */
export const REQUEST_HOURS = 48;

/** How long before the meetup's start a request expires: the members need time to come. */
export const REQUEST_LEAD_HOURS = 1;

/** How long the moderators have at least: a request that would expire sooner is not made. */
export const REVIEW_HOURS = 1;

/** When a request made at `createdAt` for a meetup that starts at `startTime` expires. */
export function requestExpiry(createdAt: number, startTime: number): number {
  return Math.min(createdAt + REQUEST_HOURS * HOUR, startTime - REQUEST_LEAD_HOURS * HOUR);
}

/**
 * Whether a request made now leaves the moderators `REVIEW_HOURS` before it expires: a start at
 * least two hours ahead.
 */
export function mayRequestReview(now: number, startTime: number): boolean {
  return requestExpiry(now, startTime) - now >= REVIEW_HOURS * HOUR;
}
