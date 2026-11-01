import { describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import {
  assertSendable,
  buttonsOf,
  controlsOf,
  menusOf,
  textOfMenus,
  ROLE,
  selfRolesWith,
} from '../../test/support/roles.js';
import { decodeCustomId } from '../discord/custom-id.js';
import type { Roster } from '../domain/roles/self-roles.js';
import { NO_MANAGE_ROLES, NO_ROLES, NONE_AVAILABLE, renderRoleMenus } from './role-menus.js';

async function sample(): Promise<ReturnType<typeof selfRolesWith> & { roster: Roster }> {
  const made = selfRolesWith();
  await made.offerSample();
  const roster = await made.selfRoles.roster(FAKE_GUILD_ID);
  if (!roster) throw new Error('no roster');
  return { ...made, roster };
}

/** A server with `count` roles in each of these groups (a name, and whether it is pick-one). */
async function large(groups: ReadonlyArray<readonly [string, boolean, number]>) {
  const made = selfRolesWith();
  let next = 0;
  const ids: string[] = [];
  for (const [name, pickOne, count] of groups) {
    const saved = await made.storage.saveGroup(FAKE_GUILD_ID, { name, pickOne });
    if (saved.kind === 'refused') throw new Error(saved.reason);
    for (let n = 0; n < count; n++) {
      const id = `56${String(next++).padStart(16, '0')}`;
      const letter = String.fromCharCode(65 + (n % 26));
      made.server.role(id, `${letter}${name} ${String(n).padStart(3, '0')}`);
      await made.selfRoles.addRole(
        FAKE_GUILD_ID,
        { roleId: id, groupId: saved.group.id },
        made.owner(),
      );
      ids.push(id);
    }
  }
  const roster = await made.selfRoles.roster(FAKE_GUILD_ID);
  if (!roster) throw new Error('no roster');
  return { ...made, roster, ids };
}

const chosen = (menu: { options: { label: string; default?: boolean }[] }) =>
  menu.options.filter((option) => option.default === true).map((option) => option.label);

describe('renderRoleMenus', () => {
  it('shows a menu per group in their order, with names and descriptions', async () => {
    const { roster } = await sample();
    const message = renderRoleMenus(roster, new Set(), 0);
    assertSendable(message);
    expect(textOfMenus(message).split('\n')).toEqual([
      '### Your roles on this server',
      'Tick and untick them in the menus; a menu takes effect as soon as you close it.',
      '**Regions** · pick any number',
      '**Teams** · pick one',
      '**Other** · pick any number',
    ]);
    const [regions, teams, other] = controlsOf(message).filter((one) => one.type === 3);
    expect(regions).toMatchObject({
      placeholder: 'Regions (any number)',
      min_values: 0,
      max_values: 3,
      options: [
        { label: 'East', value: ROLE.east, default: false },
        { label: 'North', value: ROLE.north, description: 'North of the river', default: false },
        { label: 'South', value: ROLE.south, default: false },
      ],
    });
    expect(teams).toMatchObject({
      placeholder: 'Teams (pick one)',
      min_values: 1,
      max_values: 1,
      options: [
        { label: 'None', value: 'none', description: 'No role of Teams', default: true },
        { label: 'Instinct', value: ROLE.instinct, default: false },
        { label: 'Mystic', value: ROLE.mystic, default: false },
        { label: 'Valor', value: ROLE.valor, default: false },
      ],
    });
    expect(other).toMatchObject({
      placeholder: 'Other (any number)',
      options: [{ label: 'Trader', description: 'Open to trades' }],
    });
    expect(buttonsOf(message)).toEqual([]);
  });

  it('ticks the roles the member holds, and no others', async () => {
    const { roster } = await sample();
    const message = renderRoleMenus(
      roster,
      new Set([ROLE.north, ROLE.south, ROLE.mystic, ROLE.moderator]),
      0,
    );
    assertSendable(message);
    expect(menusOf(message).map(chosen)).toEqual([['North', 'South'], ['Mystic'], []]);
  });

  it('shows one role of a pick-one group as chosen for a member who holds several', async () => {
    const { roster } = await sample();
    const message = renderRoleMenus(roster, new Set([ROLE.valor, ROLE.instinct]), 0);
    assertSendable(message);
    expect(chosen(menusOf(message)[1] ?? { options: [] })).toEqual(['Instinct']);
  });

  it('carries the group, the part and the page in the custom ids', async () => {
    const { roster } = await sample();
    const ids = menusOf(renderRoleMenus(roster, new Set(), 0)).map((menu) =>
      decodeCustomId(menu.custom_id),
    );
    const [regions, teams] = roster.groups;
    expect(ids).toEqual([
      { kind: 'roles', id: String(regions?.id), action: 'pick', args: ['0', '0'] },
      { kind: 'roles', id: String(teams?.id), action: 'pick', args: ['0', '0'] },
      { kind: 'roles', id: 'other', action: 'pick', args: ['0', '0'] },
    ]);
  });

  it('leaves out what cannot be given, and says so when nothing can', async () => {
    const { roster, server, selfRoles } = await sample();
    const none = renderRoleMenus({ ...roster, entries: [] }, new Set(), 0);
    expect(textOfMenus(none)).toBe(NO_ROLES);
    expect(menusOf(none)).toEqual([]);
    assertSendable(none);
    // Roles are offered, but the bot cannot give any: the member reads what a moderator has to mend.
    server.bot.mayManageRoles = false;
    const powerless = await selfRoles.roster(FAKE_GUILD_ID);
    if (!powerless) throw new Error('no roster');
    expect(textOfMenus(renderRoleMenus(powerless, new Set([ROLE.north]), 0))).toBe(NO_MANAGE_ROLES);
    // A change that led here and said so already is not followed by the same sentence.
    const said = `${NO_MANAGE_ROLES} Nothing was changed.`;
    expect(textOfMenus(renderRoleMenus(powerless, new Set(), 0, said))).toBe(said);
    // Roles are offered, and each has a problem of its own.
    server.bot.mayManageRoles = true;
    for (const entry of roster.entries) server.edit(entry.role?.id ?? '', { position: 60 });
    const stuck = await selfRoles.roster(FAKE_GUILD_ID);
    if (!stuck) throw new Error('no roster');
    expect(textOfMenus(renderRoleMenus(stuck, new Set(), 0, 'Nothing was changed.'))).toBe(
      `Nothing was changed.\n${NONE_AVAILABLE}`,
    );
    expect(NONE_AVAILABLE).toBe(
      "None of this server's self-assignable roles can be given at the moment. A moderator " +
        'can see why with `/admin self-roles list`.',
    );
  });

  it('puts what a change did last, and cuts it to what the message has room for', async () => {
    const { roster } = await sample();
    const message = renderRoleMenus(roster, new Set(), 0, 'Added **North**.');
    // In small print, last.
    expect(textOfMenus(message).split('\n').at(-1)).toBe('-# Added **North**.');
    const long = renderRoleMenus(roster, new Set(), 0, 'x'.repeat(5000));
    assertSendable(long);
    expect(textOfMenus(long).split('\n').at(-1)).toHaveLength('-# '.length + 1_500);
    // Cut where it is bold, the bold goes and its text stays: no marker is left open.
    const bold = renderRoleMenus(roster, new Set(), 0, `Added **${'n'.repeat(3000)}**.`);
    const note = textOfMenus(bold).split('\n').at(-1) ?? '';
    expect(note.startsWith(`-# Added ${'n'.repeat(100)}`)).toBe(true);
    expect(note).not.toContain('**');
  });

  it('shows text staff wrote as text in the message; a menu takes any text as it is', async () => {
    const made = selfRolesWith();
    await made.storage.saveGroup(FAKE_GUILD_ID, { name: '**Loud** @everyone' });
    const [group] = (await made.selfRoles.stored(FAKE_GUILD_ID)).groups;
    await made.selfRoles.addRole(
      FAKE_GUILD_ID,
      { roleId: ROLE.north, groupId: group?.id ?? 0 },
      made.owner(),
    );
    const roster = await made.selfRoles.roster(FAKE_GUILD_ID);
    if (!roster) throw new Error('no roster');
    const message = renderRoleMenus(roster, new Set(), 0);
    expect(textOfMenus(message)).not.toContain('**Loud** ');
    expect(textOfMenus(message)).toContain('**\\*\\*Loud\\*\\* @\u200beveryone**');
    expect(controlsOf(message).find((one) => one.type === 3)).toMatchObject({
      placeholder: '**Loud** @everyone (any number)',
    });
  });

  it('splits a group of more than 25 roles into menus by ranges, all within Discord’s limits', async () => {
    const { roster, ids } = await large([['Regions', false, 60]]);
    const message = renderRoleMenus(roster, new Set(ids.slice(0, 30)), 0);
    assertSendable(message);
    const menus = menusOf(message);
    expect(menus.map((menu) => menu.options.length)).toEqual([20, 20, 20]);
    expect(textOfMenus(message).split('\n').slice(2)).toEqual([
      '**Regions: A – GRegions 032** · pick any number',
      '**Regions: GRegions 058 – P** · pick any number',
      '**Regions: Q – Z** · pick any number',
    ]);
    // Every role is in one menu, and the 30 the member holds are ticked.
    expect(menus.flatMap((menu) => menu.options.map((option) => option.value)).sort()).toEqual(
      [...ids].sort(),
    );
    expect(menus.flatMap(chosen)).toHaveLength(30);
    expect(buttonsOf(message)).toEqual([]);
  });

  it('gives "None" a place in every part of a large pick-one group', async () => {
    const { roster, ids } = await large([['Teams', true, 30]]);
    const held = ids[29] ?? '';
    const message = renderRoleMenus(roster, new Set([held]), 0);
    assertSendable(message);
    const menus = menusOf(message);
    expect(menus.map((menu) => menu.options.length)).toEqual([16, 16]);
    expect(menus.map((menu) => menu.options[0]?.value)).toEqual(['none', 'none']);
    // The role is held in one part: "None" is chosen in neither.
    expect(menus.flatMap(chosen)).toHaveLength(1);
    const nothing = menusOf(renderRoleMenus(roster, new Set(), 0));
    expect(nothing.map(chosen)).toEqual([['None'], ['None']]);
  });

  it('shows five menus without paging, and four to a page with Previous and Next beyond that', async () => {
    const five = await large([
      ['A', false, 2],
      ['B', false, 2],
      ['C', false, 2],
      ['D', false, 2],
      ['E', false, 2],
    ]);
    const all = renderRoleMenus(five.roster, new Set(), 0);
    assertSendable(all);
    expect(menusOf(all)).toHaveLength(5);
    expect(buttonsOf(all)).toEqual([]);

    const nine = await large([
      ['A', false, 30],
      ['B', true, 3],
      ['C', false, 51],
      ['D', false, 2],
      ['E', false, 26],
    ]);
    // 2 + 1 + 3 + 1 + 2 menus.
    const pages = [0, 1, 2].map((page) => renderRoleMenus(nine.roster, new Set(nine.ids), page));
    for (const page of pages) assertSendable(page);
    expect(pages.map((page) => menusOf(page).length)).toEqual([4, 4, 1]);
    expect(pages.map((page) => textOfMenus(page).split('\n').at(-1))).toEqual([
      'Page 1 of 3',
      'Page 2 of 3',
      'Page 3 of 3',
    ]);
    expect(pages.map((page) => buttonsOf(page).map((b) => [b.label, b.disabled]))).toEqual([
      [
        ['Previous', true],
        ['Next', false],
      ],
      [
        ['Previous', false],
        ['Next', false],
      ],
      [
        ['Previous', false],
        ['Next', true],
      ],
    ]);
    expect(buttonsOf(pages[1] ?? {}).map((b) => decodeCustomId(b.custom_id ?? ''))).toEqual([
      { kind: 'roles', id: 'page', action: 'prev', args: ['1'] },
      { kind: 'roles', id: 'page', action: 'next', args: ['1'] },
    ]);
    // The menus of a page carry that page.
    expect(menusOf(pages[1] ?? {}).map((menu) => decodeCustomId(menu.custom_id)?.args[1])).toEqual([
      '1',
      '1',
      '1',
      '1',
    ]);
    // Every role is on exactly one page.
    const values = pages.flatMap((page) =>
      menusOf(page).flatMap((menu) => menu.options.map((option) => option.value)),
    );
    expect(values.filter((value) => value !== 'none').sort()).toEqual([...nine.ids].sort());
  });

  it('shows the nearest page for one that does not exist', async () => {
    const { roster } = await sample();
    expect(renderRoleMenus(roster, new Set(), 7)).toEqual(renderRoleMenus(roster, new Set(), 0));
    expect(renderRoleMenus(roster, new Set(), Number.NaN)).toEqual(
      renderRoleMenus(roster, new Set(), 0),
    );
  });

  it('stays within Discord’s limits with the longest names and descriptions', async () => {
    const made = selfRolesWith();
    const group = await made.storage.saveGroup(FAKE_GUILD_ID, { name: 'G'.repeat(50) });
    if (group.kind === 'refused') throw new Error(group.reason);
    for (let n = 0; n < 60; n++) {
      const id = `57${String(n).padStart(16, '0')}`;
      made.server.role(id, `${'*'.repeat(47)}${String(n).padStart(3, '0')}`);
      await made.selfRoles.addRole(
        FAKE_GUILD_ID,
        { roleId: id, description: 'd'.repeat(150), groupId: group.group.id },
        made.owner(),
      );
    }
    const roster = await made.selfRoles.roster(FAKE_GUILD_ID);
    if (!roster) throw new Error('no roster');
    assertSendable(renderRoleMenus(roster, new Set(), 0, 'n'.repeat(3000)));
  });
});
