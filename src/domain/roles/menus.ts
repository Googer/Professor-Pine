import {
  byRoleName,
  type ChangeRequest,
  type Roster,
  type RosterEntry,
  type SelfRoleGroup,
} from './self-roles.js';

/**
 * The menus of `/iam` without a role: one per group, in the groups' order, the roles without a
 * group last under "Other". Pure: which menus there are, what each holds and how they are
 * spread over pages; `src/commands/roles/menus.ts` turns that into Discord's controls.
 */

/** Discord shows at most this many options in one menu. */
const MENU_OPTIONS = 25;
/** A message has five rows of controls: as many menus fit when no row is needed for paging. */
const MENUS_WITHOUT_PAGING = 5;
/** Menus on a page when a row is needed for the Previous and Next buttons. */
const MENUS_PER_PAGE = 4;

/** The value of the choice "None" in the menu of a group of which only one role may be held. */
export const NONE_VALUE = 'none';

/** One menu: a group, or a part of a group that has more roles than a menu holds. */
export interface RoleMenu {
  /** The group; undefined for the roles without one ("Other"). */
  group: SelfRoleGroup | undefined;
  /** Which part of the group this is, from 0; a group that fits one menu has only part 0. */
  part: number;
  /** "Regions", and for a part of a group "Regions: A – Fo". */
  title: string;
  /** Only one of the group's roles may be held: a single choice, with "None" before the roles. */
  pickOne: boolean;
  /** The roles it offers, by name: 25 at most, 24 when "None" needs a place. */
  entries: RosterEntry[];
}

/** The title of the roles without a group. */
const OTHER_TITLE = 'Other';

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** A text as what a reader sees as its letters: an emoji, a flag or a letter with its accents is one. */
function letters(text: string): string[] {
  return [...segmenter.segment(text)].map((part) => part.segment);
}

const isDigit = (letter: string | undefined): boolean =>
  letter !== undefined && /^\p{Nd}$/u.test(letter);

/**
 * The beginning of a name that is `length` letters long, or longer: a beginning never ends
 * inside a number ("Region 1" would read as the first region where "Region 10" is meant), so
 * one that would is extended to the end of that number.
 */
function beginning(name: readonly string[], length: number): string[] {
  let end = Math.min(length, name.length);
  while (end < name.length && isDigit(name[end - 1]) && isDigit(name[end])) end += 1;
  return name.slice(0, end);
}

/**
 * Whether `name` begins with `start`: letter for letter without case, and a number at the end
 * of `start` must be the whole number ("Region 1" is not the beginning of "Region 15").
 */
function beginsWith(name: readonly string[], start: readonly string[]): boolean {
  if (start.length > name.length) return false;
  if (isDigit(start.at(-1)) && isDigit(name[start.length])) return false;
  return start.every((letter, index) => letter.toLowerCase() === name[index]?.toLowerCase());
}

/** The shortest beginning of `name` that none of the `others` begins with; all of it at most. */
function distinctStart(name: string, others: ReadonlyArray<string | undefined>): string {
  const whole = letters(name.trim());
  const rest = others.flatMap((other) =>
    other === undefined || other === name ? [] : [letters(other.trim())],
  );
  for (let length = 1; length <= whole.length; length++) {
    const start = beginning(whole, length);
    if (!rest.some((other) => beginsWith(other, start))) return start.join('').trimEnd();
    length = start.length;
  }
  return whole.join('');
}

/** About this much of a name stands in a range; a number at the cut is kept whole. */
const RANGE_NAME = 12;
function shortened(text: string): string {
  const whole = letters(text);
  if (whole.length <= RANGE_NAME) return text;
  const kept = beginning(whole, RANGE_NAME);
  return kept.length === whole.length ? text : `${kept.join('')}…`;
}

/**
 * Splits the roles of one group into as many menus as they need, by alphabetical ranges of
 * about the same size, each named by where it begins and ends: one letter where that tells
 * the two ends apart and from the menu beside it, more where two menus meet inside a letter
 * ("A – Fo", "Fr – Z") or a menu begins and ends in one ("Sa – Sp").
 */
function splitGroup(group: SelfRoleGroup | undefined, entries: readonly RosterEntry[]): RoleMenu[] {
  const name = group?.name ?? OTHER_TITLE;
  const pickOne = group?.pickOne ?? false;
  const capacity = pickOne ? MENU_OPTIONS - 1 : MENU_OPTIONS;
  const sorted = [...entries].sort(byRoleName);
  const parts = Math.ceil(sorted.length / capacity);
  if (parts <= 1) return [{ group, part: 0, title: name, pickOne, entries: sorted }];
  const chunks: RosterEntry[][] = [];
  let taken = 0;
  for (let part = 0; part < parts; part++) {
    // The sizes differ by one at most; the earlier parts take what is left over.
    const size = Math.floor(sorted.length / parts) + (part < sorted.length % parts ? 1 : 0);
    chunks.push(sorted.slice(taken, taken + size));
    taken += size;
  }
  const ranges = chunks.map((chunk, part) => {
    const first = chunk[0]?.name ?? '';
    const last = chunk.at(-1)?.name ?? '';
    const before = chunks[part - 1]?.at(-1)?.name;
    const after = chunks[part + 1]?.[0]?.name;
    const from = shortened(distinctStart(first, [before, last]));
    const to = shortened(distinctStart(last, [after, first]));
    return from === to ? from : `${from} – ${to}`;
  });
  // Names that only differ far behind their beginning make ranges that say nothing.
  const telling = new Set(ranges).size === ranges.length;
  return chunks.map((chunk, part) => ({
    group,
    part,
    title: telling
      ? `${name}: ${ranges[part] ?? ''}`
      : `${name}: part ${String(part + 1)} of ${String(parts)}`,
    pickOne,
    entries: chunk,
  }));
}

/**
 * The menus a server's roster makes: only roles that can be given at present, a menu per group
 * that has any (in the groups' order), the roles without a group last.
 */
export function roleMenus(roster: Roster): RoleMenu[] {
  const offered = roster.entries.filter((entry) => entry.problem === undefined && entry.role);
  const menus: RoleMenu[] = [];
  for (const group of roster.groups) {
    const members = offered.filter((entry) => entry.group?.id === group.id);
    if (members.length > 0) menus.push(...splitGroup(group, members));
  }
  const others = offered.filter((entry) => entry.group === undefined);
  if (others.length > 0) menus.push(...splitGroup(undefined, others));
  return menus;
}

/**
 * The menus spread over pages: all on one page while they fit a message's five rows, otherwise
 * four to a page, which leaves a row for the buttons that turn the pages.
 */
export function menuPages(menus: readonly RoleMenu[]): RoleMenu[][] {
  if (menus.length <= MENUS_WITHOUT_PAGING) return [[...menus]];
  const pages: RoleMenu[][] = [];
  for (let start = 0; start < menus.length; start += MENUS_PER_PAGE) {
    pages.push(menus.slice(start, start + MENUS_PER_PAGE));
  }
  return pages;
}

/** The page with this number, from 0, or the nearest there is; 0 for anything that is no number. */
export function nearestPage(page: number, pages: number): number {
  if (!Number.isInteger(page)) return 0;
  return Math.min(Math.max(page, 0), Math.max(pages - 1, 0));
}

/** A choice of a menu as its message showed it: its value, and whether it stood ticked. */
export interface ShownChoice {
  value: string;
  ticked: boolean;
}

/**
 * Whether "None" was really picked: the menu offered it, showed it unticked, and it is ticked
 * now. "None" that stood ticked already is no change (the member held no role of the group
 * when the message was made, and may have got one elsewhere since), and a menu that did not
 * offer it cannot have it picked, whatever values arrive.
 */
export function pickedNone(shown: readonly ShownChoice[], chosen: readonly string[]): boolean {
  return (
    chosen.includes(NONE_VALUE) &&
    shown.some((choice) => choice.value === NONE_VALUE && !choice.ticked)
  );
}

/**
 * What changing a menu asks for: exactly that menu's difference (Matt, 2026-10-13, for the
 * giving as it was for the taking). `shown` are the options the menu had when it was pressed,
 * `chosen` the values that are ticked now: the roles the menu showed unticked that are ticked
 * now are to be given, and the roles it showed ticked that are ticked no longer are to be
 * taken away. A role the menu showed unticked is never taken away (the member may have got it
 * elsewhere since the message was made, and did not untick it here), and a role it showed
 * ticked is never given: the member may have given it up elsewhere since, and did not tick it
 * here. A value the menu did not show is ignored, and "None" names no role. (`planChange` then
 * does nothing for a role the member has already, or does not have.)
 *
 * A menu that showed "None" is a single choice, and picking another role in it unticks the old
 * one whether the member means to lose it or not: such a menu asks for a take only when "None"
 * itself was picked (`pickedNone`: a real change of what it showed). A swap is left to
 * `planChange`, which takes the old role of a pick-one group away only when the new one is
 * really given; a picked role that can no longer be given (the message may be old) must not
 * cost the member the role they had.
 */
export function menuRequest(
  shown: readonly ShownChoice[],
  chosen: readonly string[],
): ChangeRequest {
  const offered = shown.filter((choice) => choice.value !== NONE_VALUE);
  const showedNone = offered.length < shown.length;
  const give = offered.filter((choice) => !choice.ticked && chosen.includes(choice.value));
  const take =
    showedNone && !pickedNone(shown, chosen)
      ? []
      : offered.filter((choice) => choice.ticked && !chosen.includes(choice.value));
  return { give: give.map((choice) => choice.value), take: take.map((choice) => choice.value) };
}

/** The roles of a group that can be held, by id: what "None" in a pick-one group takes away. */
export function groupRoleIds(roster: Roster, groupId: number): string[] {
  return roster.entries.flatMap((entry) =>
    entry.group?.id === groupId && entry.role ? [entry.role.id] : [],
  );
}
