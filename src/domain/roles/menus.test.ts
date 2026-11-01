import { describe, expect, it } from 'vitest';
import {
  groupRoleIds,
  menuPages,
  menuRequest,
  pickedNone,
  nearestPage,
  NONE_VALUE,
  roleMenus,
} from './menus.js';
import {
  buildRoster,
  type Roster,
  type SelfRoleGroup,
  type SelfRoleRow,
  type ServerRole,
} from './self-roles.js';

const REGIONS: SelfRoleGroup = { id: 1, name: 'Regions', position: 1, pickOne: false };
const TEAMS: SelfRoleGroup = { id: 2, name: 'Teams', position: 2, pickOne: true };
const HOBBIES: SelfRoleGroup = { id: 3, name: 'Hobbies', position: 3, pickOne: false };

/** A roster of roles by name, each in the group named. */
function rosterOf(
  named: ReadonlyArray<readonly [name: string, groupId: number | null]>,
  groups: readonly SelfRoleGroup[] = [REGIONS, TEAMS, HOBBIES],
  change: (role: ServerRole) => ServerRole = (role) => role,
): Roster {
  const rows: SelfRoleRow[] = named.map(([name, groupId], index) => ({
    id: index + 1,
    name,
    description: null,
    roleId: String(1000 + index),
    groupId,
    aliases: [],
  }));
  const roles = rows.map((row) =>
    change({
      id: row.roleId ?? '',
      name: row.name,
      position: 5,
      everyone: false,
      managed: false,
      moderation: [],
      channelModeration: [],
      staffName: false,
    }),
  );
  return buildRoster(rows, groups, {
    roles,
    bot: { mayManageRoles: true, highestPosition: 50 },
    ownerId: '1',
  }).roster;
}

const titles = (roster: Roster) => roleMenus(roster).map((menu) => menu.title);
const names = (menu: { entries: readonly { name: string }[] }) =>
  menu.entries.map((entry) => entry.name);

describe('roleMenus', () => {
  it('makes a menu per group in the order of the groups, and "Other" last', () => {
    const roster = rosterOf([
      ['Trader', null],
      ['Valor', 2],
      ['South', 1],
      ['Mystic', 2],
      ['North', 1],
    ]);
    const menus = roleMenus(roster);
    expect(menus.map((menu) => [menu.title, menu.pickOne, names(menu)])).toEqual([
      ['Regions', false, ['North', 'South']],
      ['Teams', true, ['Mystic', 'Valor']],
      ['Other', false, ['Trader']],
    ]);
    expect(menus.map((menu) => [menu.group?.id, menu.part])).toEqual([
      [1, 0],
      [2, 0],
      [undefined, 0],
    ]);
  });

  it('leaves out a group without roles, and has no menus for no roles', () => {
    expect(titles(rosterOf([['North', 1]]))).toEqual(['Regions']);
    expect(roleMenus(rosterOf([]))).toEqual([]);
  });

  it('offers only what can be given at present', () => {
    const roster = rosterOf(
      [
        ['North', 1],
        ['South', 1],
        ['Helper', null],
      ],
      undefined,
      (role) =>
        role.name === 'South'
          ? { ...role, position: 60 }
          : role.name === 'Helper'
            ? { ...role, moderation: ['Kick Members'] }
            : role,
    );
    expect(roleMenus(roster).map((menu) => [menu.title, names(menu)])).toEqual([
      ['Regions', ['North']],
    ]);
  });

  it('keeps 25 roles of a group in one menu, and 24 of a pick-one group', () => {
    const many = (count: number, groupId: number) =>
      Array.from(
        { length: count },
        (_unused, n) => [`Role ${String(n).padStart(2, '0')}`, groupId] as const,
      );
    expect(titles(rosterOf(many(25, 1)))).toEqual(['Regions']);
    expect(titles(rosterOf(many(26, 1)))).toHaveLength(2);
    expect(titles(rosterOf(many(24, 2)))).toEqual(['Teams']);
    expect(titles(rosterOf(many(25, 2)))).toHaveLength(2);
  });

  it('splits a larger group into alphabetical ranges of about the same size', () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    // 60 regions: Aa, Ab, Ac, Ba, … two or three to a letter.
    const regions = Array.from({ length: 60 }, (_unused, n) => {
      const letter = letters[Math.floor(n / 3)] ?? 'Z';
      return [`${letter}${'abc'[n % 3] ?? ''} Town`, 1] as const;
    });
    const menus = roleMenus(rosterOf(regions));
    expect(menus.map((menu) => menu.entries.length)).toEqual([20, 20, 20]);
    expect(menus.map((menu) => menu.title)).toEqual([
      'Regions: A – Gb',
      'Regions: Gc – Na',
      'Regions: Nb – T',
    ]);
    expect(menus.map((menu) => menu.part)).toEqual([0, 1, 2]);
    // Every role is in exactly one menu, in the order of their names.
    expect(menus.flatMap(names)).toEqual(regions.map(([name]) => name).sort());
  });

  it('names a range by single letters where the menus meet between two letters', () => {
    const regions = Array.from({ length: 26 }, (_unused, n) => {
      const letter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[n] ?? '';
      return [`${letter}town`, 1] as const;
    });
    expect(titles(rosterOf(regions))).toEqual(['Regions: A – M', 'Regions: N – Z']);
  });

  it('numbers the parts where the names only differ behind what a range has room for', () => {
    const same = Array.from(
      { length: 26 },
      (_unused, n) => [`Northern Heights ${String(n).padStart(2, '0')}`, 1] as const,
    );
    expect(titles(rosterOf(same))).toEqual([
      // Every end is cut to the same text, which would tell nothing.
      'Regions: part 1 of 2',
      'Regions: part 2 of 2',
    ]);
  });

  it.each([
    [
      'two digits with a zero in front',
      Array.from({ length: 30 }, (_unused, n) => `Region ${String(n + 1).padStart(2, '0')}`),
      ['Region 01 – Region 15', 'Region 16 – Region 30'],
    ],
    [
      'numbers without zeros in front',
      Array.from({ length: 30 }, (_unused, n) => `Region ${String(n + 1)}`),
      ['Region 1 – Region 15', 'Region 16 – Region 30'],
    ],
    [
      'bare numbers',
      Array.from({ length: 51 }, (_unused, n) => String(n + 1)),
      ['1 – 17', '18 – 34', '35 – 51'],
    ],
    [
      'a letter and three digits',
      Array.from({ length: 130 }, (_unused, n) => `R${String(n).padStart(3, '0')}`),
      ['R000 – R021', 'R022 – R043', 'R044 – R065', 'R066 – R087', 'R088 – R108', 'R109 – R129'],
    ],
  ])('names ranges by whole numbers and in their order: %s', (_what, roles, ranges) => {
    // Given in another order than theirs.
    const mixed = [...roles].reverse().map((name) => [name, 1] as const);
    const menus = roleMenus(rosterOf(mixed));
    expect(menus.map((menu) => menu.title)).toEqual(ranges.map((range) => `Regions: ${range}`));
    expect(menus.flatMap(names)).toEqual(roles);
  });

  it('keeps a number whole where a long name is cut', () => {
    const long = Array.from(
      { length: 26 },
      (_unused, n) => [`Outposts 1${String(n).padStart(2, '0')}7 North`, 1] as const,
    );
    // Twelve letters would end inside the number.
    expect(titles(rosterOf(long))).toEqual([
      'Regions: Outposts 1007 – Outposts 1127',
      'Regions: Outposts 1137 – Outposts 1257',
    ]);
  });

  it('never cuts a beginning inside a flag or another emoji', () => {
    // Twenty-six flags, each of two regional indicators that a reader sees as one sign.
    const indicator = (n: number): string => String.fromCodePoint(0x1f1e6 + n);
    const flags = Array.from(
      { length: 26 },
      (_unused, n) => [`${indicator(n)}${indicator((n * 7) % 26)} Land`, 1] as const,
    );
    const whole = /^Regions: \p{RI}{2} – \p{RI}{2}$/u;
    for (const title of titles(rosterOf(flags))) expect(title).toMatch(whole);
    // A family: three people joined by zero-width joiners, seven code units that are one sign.
    const family = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
    const families = Array.from(
      { length: 26 },
      (_unused, n) => [`${family}${String.fromCharCode(65 + n)}${family} Clan`, 1] as const,
    );
    expect(titles(rosterOf(families))).toEqual([
      `Regions: ${family}A – ${family}M`,
      `Regions: ${family}N – ${family}Z`,
    ]);
  });

  it('splits the roles without a group the same way', () => {
    const others = Array.from(
      { length: 30 },
      (_unused, n) => [`${String.fromCharCode(65 + (n % 26))}${String(n)}`, null] as const,
    );
    const menus = roleMenus(rosterOf(others));
    expect(menus.map((menu) => menu.title.startsWith('Other: '))).toEqual([true, true]);
    expect(menus.every((menu) => menu.group === undefined && !menu.pickOne)).toBe(true);
  });
});

describe('menuPages', () => {
  const menusOf = (count: number) =>
    roleMenus(
      rosterOf(
        Array.from({ length: count }, (_unused, n) => [`Role ${String(n)}`, n + 1] as const),
        Array.from({ length: count }, (_unused, n) => ({
          id: n + 1,
          name: `Group ${String(n + 1).padStart(2, '0')}`,
          position: n + 1,
          pickOne: false,
        })),
      ),
    );

  it('puts up to five menus on one page', () => {
    expect(menuPages(menusOf(1)).map((page) => page.length)).toEqual([1]);
    expect(menuPages(menusOf(5)).map((page) => page.length)).toEqual([5]);
    expect(menuPages([])).toEqual([[]]);
  });

  it('puts four on a page when there are more, in their order', () => {
    expect(menuPages(menusOf(6)).map((page) => page.length)).toEqual([4, 2]);
    const pages = menuPages(menusOf(13));
    expect(pages.map((page) => page.length)).toEqual([4, 4, 4, 1]);
    expect(pages.flat().map((menu) => menu.title)).toEqual(menusOf(13).map((menu) => menu.title));
  });
});

describe('nearestPage', () => {
  it('keeps a page that exists and takes the nearest for one that does not', () => {
    expect(nearestPage(1, 3)).toBe(1);
    expect(nearestPage(7, 3)).toBe(2);
    expect(nearestPage(-1, 3)).toBe(0);
    expect(nearestPage(Number.NaN, 3)).toBe(0);
    expect(nearestPage(2, 0)).toBe(0);
  });
});

describe('menuRequest', () => {
  /** A menu that showed these values, the ones with a star ticked. */
  const shown = (...values: string[]) =>
    values.map((value) => ({ value: value.replace('*', ''), ticked: value.endsWith('*') }));

  it('gives what is newly ticked and takes away what the menu showed ticked and is ticked no longer', () => {
    expect(menuRequest(shown('1*', '2', '3*'), ['2'])).toEqual({ give: ['2'], take: ['1', '3'] });
    expect(menuRequest(shown('1*', '2*', '3*'), [])).toEqual({ give: [], take: ['1', '2', '3'] });
    expect(menuRequest(shown('1*', '2'), ['1', '2'])).toEqual({ give: ['2'], take: [] });
  });

  it('never gives a role the menu showed ticked', () => {
    // The member gave 1 up elsewhere after the message was made, and ticks 3 in it: the
    // client sends 1 along, because the old message still shows it ticked.
    expect(menuRequest(shown('1*', '2', '3'), ['1', '3'])).toEqual({ give: ['3'], take: [] });
    expect(menuRequest(shown('1*', '2*'), ['1', '2'])).toEqual({ give: [], take: [] });
    // In a single choice: the role it showed ticked, picked again.
    expect(menuRequest(shown(NONE_VALUE, '1*', '2'), ['1'])).toEqual({ give: [], take: [] });
  });

  it('never takes away a role the menu showed unticked', () => {
    // The member got 1 and 3 elsewhere after the message was made, and ticks 2 in it.
    expect(menuRequest(shown('1', '2', '3'), ['2'])).toEqual({ give: ['2'], take: [] });
    expect(menuRequest(shown('1', '2', '3'), [])).toEqual({ give: [], take: [] });
  });

  it('asks for nothing the menu did not show', () => {
    expect(menuRequest(shown('1*', '2'), ['2', '999'])).toEqual({ give: ['2'], take: ['1'] });
  });

  it('reads "None" as no role: what the menu showed ticked is taken away', () => {
    expect(menuRequest(shown(NONE_VALUE, '1*', '2'), [NONE_VALUE])).toEqual({
      give: [],
      take: ['1'],
    });
    expect(menuRequest(shown(`${NONE_VALUE}*`, '1', '2'), ['2'])).toEqual({
      give: ['2'],
      take: [],
    });
  });

  it('asks for no take from a menu with "None" unless "None" was chosen', () => {
    // Another role of a pick-one menu was picked: the old one goes only if the new one is
    // given, which is for `planChange` to say, not for the menu.
    expect(menuRequest(shown(NONE_VALUE, '1*', '2'), ['2'])).toEqual({ give: ['2'], take: [] });
    expect(menuRequest(shown(NONE_VALUE, '1*', '2'), ['999'])).toEqual({ give: [], take: [] });
    expect(menuRequest(shown(NONE_VALUE, '1*', '2'), [])).toEqual({ give: [], take: [] });
    // "None" beside a role (which Discord's single choice never sends) is still "None".
    expect(menuRequest(shown(NONE_VALUE, '1*', '2'), [NONE_VALUE, '2'])).toEqual({
      give: ['2'],
      take: ['1'],
    });
  });

  it('reads "None" that stood ticked already as no change', () => {
    // The member held no role of the group when the message was made.
    expect(menuRequest(shown(`${NONE_VALUE}*`, '1', '2'), [NONE_VALUE])).toEqual({
      give: [],
      take: [],
    });
    expect(pickedNone(shown(`${NONE_VALUE}*`, '1', '2'), [NONE_VALUE])).toBe(false);
    expect(pickedNone(shown(NONE_VALUE, '1*', '2'), [NONE_VALUE])).toBe(true);
    expect(pickedNone(shown(NONE_VALUE, '1*', '2'), ['2'])).toBe(false);
    // A menu that did not offer it cannot have it picked.
    expect(pickedNone(shown('1*', '2'), [NONE_VALUE])).toBe(false);
  });
});

describe('groupRoleIds', () => {
  it('lists the roles of one group', () => {
    const roster = rosterOf([
      ['North', 1],
      ['Valor', 2],
      ['Mystic', 2],
    ]);
    expect(groupRoleIds(roster, 2).sort()).toEqual(['1001', '1002']);
    expect(groupRoleIds(roster, 9)).toEqual([]);
  });
});
