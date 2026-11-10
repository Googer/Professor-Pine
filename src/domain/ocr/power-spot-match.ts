import { nameSimilarity } from './screenshot-report.js';

/**
 * Which Power Spot the name on a max battle's screen is (design
 * `2026-10-22-max-battle-screenshots-design.md`, sections 3 and 9): pure, over the titles it is
 * given. The game shows the name in capitals, and the reader may lose a space
 * (`JUNIPER'SSWING CORNER`) or get a name the screen cut short; the game's name may also have
 * words more than the Wayfarer title (plan 7P-H).
 */

/** A Power Spot the name may be: its Wayfarer id, its title, and whether it lies in the channel's region. */
export interface SpotTitle {
  id: string;
  title: string;
  /** In the region of the channel the screenshot was posted in (else elsewhere in the server). */
  local: boolean;
}

/**
 * `clear`: the one spot it is. `candidates`: the spots it may be, the region's first, then the
 * most alike (a menu asks which). `unknown`: no title is even 80% alike (`SPOT_ALIKE`) nor
 * within the name read (`wordsWithin`), or no name was read.
 */
export type SpotMatch =
  | { kind: 'clear'; spot: SpotTitle }
  | { kind: 'candidates'; spots: SpotTitle[] }
  | { kind: 'unknown' };

/** A title at least this alike to the name read (`nameSimilarity`) is offered (design 9). */
export const SPOT_ALIKE = 0.8;

/**
 * A name read is taken as the start of a longer title (cut short by the screen) only with at
 * least this many letters and digits: a word or two say nothing.
 */
const CUT_NAME_MIN = 6;

/**
 * A title whose words all stand, in order, in a longer name read (`wordsWithin`) is offered only
 * when it is at least this share of the name's letters and digits: one or two short words of a
 * long name say little.
 */
const WITHIN_SHARE = 0.5;

/**
 * Letters and digits only, without case or accents: `Juniper's Swing` → `juniperswing`; also the
 * key of the moderators' note of a Power Spot Pine may be missing (`ModerationReports.missingSpot`).
 */
export function spotNameKey(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Whether every word of `title` stands, in order, among the words of the name read, which has
 * words more (the game showed "BARTLETT STREET SHELTER" where Wayfarer has "Bartlett Shelter";
 * plan 7P-H): the title, letters and digits only, is some of the name's words joined, skipping
 * the others, so a space the reader lost between two of the title's words is no matter. The
 * title is at least `CUT_NAME_MIN` letters and digits and `WITHIN_SHARE` of the name's.
 */
function wordsWithin(read: string, title: string): boolean {
  const key = spotNameKey(title);
  const words = read
    .split(/\s+/)
    .map(spotNameKey)
    .filter((word) => word.length > 0);
  const letters = words.join('').length;
  if (key.length < CUT_NAME_MIN || key.length >= letters || key.length < letters * WITHIN_SHARE) {
    return false;
  }
  // Where in the title the words taken so far may end: each word read is taken or skipped.
  let ends = new Set([0]);
  for (const word of words) {
    const next = new Set(ends);
    for (const end of ends) if (key.startsWith(word, end)) next.add(end + word.length);
    ends = next;
  }
  return ends.has(key.length);
}

/**
 * The one spot of `found`: the only one in the channel's region, or failing any there, the only
 * one in the server; undefined otherwise.
 */
function onlyOne(found: readonly SpotTitle[]): SpotTitle | undefined {
  const local = found.filter((spot) => spot.local);
  if (local.length > 0) return local.length === 1 ? local[0] : undefined;
  return found.length === 1 ? found[0] : undefined;
}

/**
 * The Power Spot of a name read (design 9): a title equal to it, letters and digits only, or one
 * it is the start of (a name cut short), matches. Equal titles come first (review A4: "MAPLE
 * BENCH" is "Maple Bench", not "Maple Bench East"): exactly one in the channel's region, or
 * failing any there, exactly one in the server, is clear; only without an equal title are the
 * titles it is the start of looked at, and one of them is clear only when it is the only one in
 * the server (plan 8F-1: a cut name that fits a spot of the region and spots of other regions is
 * asked). Otherwise every match, every title whose words all stand in order in a longer name read
 * (`wordsWithin`, plan 7P-H: never clear), and every title at least 80% alike is a candidate, the
 * region's first; none: unknown.
 */
export function matchPowerSpot(read: string | null, spots: readonly SpotTitle[]): SpotMatch {
  const name = read === null ? '' : spotNameKey(read);
  if (name.length === 0) return { kind: 'unknown' };
  const equal = spots.filter((spot) => spotNameKey(spot.title) === name);
  const starts =
    name.length >= CUT_NAME_MIN
      ? spots.filter((spot) => !equal.includes(spot) && spotNameKey(spot.title).startsWith(name))
      : [];
  // A cut name is clear only when it fits one spot of the whole server (plan 8F-1, Matt
  // 2026-10-29): one of the region and others elsewhere is asked, a missed report being safer
  // than a wrong spot.
  const clear = equal.length > 0 ? onlyOne(equal) : starts.length === 1 ? starts[0] : undefined;
  if (clear) return { kind: 'clear', spot: clear };
  // A title within a longer name read is only ever asked about (plan 7P-H).
  const within = spots.filter(
    (spot) =>
      !equal.includes(spot) && !starts.includes(spot) && wordsWithin(read ?? '', spot.title),
  );
  const matches = [...equal, ...starts, ...within];
  const alike = spots
    .map((spot) => ({ spot, score: nameSimilarity(read ?? '', spot.title) }))
    .filter(({ spot, score }) => score >= SPOT_ALIKE || matches.includes(spot))
    .sort((a, b) => Number(b.spot.local) - Number(a.spot.local) || b.score - a.score)
    .map(({ spot }) => spot);
  return alike.length === 0 ? { kind: 'unknown' } : { kind: 'candidates', spots: alike };
}
