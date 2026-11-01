import { describe, expect, it } from 'vitest';
import { isNoGroupWord, parseAliases, planSaveGroup, planSaveRole } from './self-role-edits.js';
import { MAX_GROUPS, type SelfRoleGroup, type SelfRoleRow } from './self-roles.js';

function row(id: number, name: string, more: Partial<SelfRoleRow> = {}): SelfRoleRow {
  return { id, name, description: null, roleId: null, groupId: null, aliases: [], ...more };
}

const group = (id: number, name: string, position: number, pickOne = false): SelfRoleGroup => ({
  id,
  name,
  position,
  pickOne,
});

describe('parseAliases', () => {
  it('reads a comma-separated list: lower case, each once, no empty ones', () => {
    expect(parseAliases(' N,  North  Side ,n,, NORTH side')).toEqual({
      ok: true,
      aliases: ['n', 'north side'],
    });
    expect(parseAliases('  ')).toEqual({ ok: true, aliases: [] });
  });

  it('refuses an alias longer than the column and more aliases than a role may have', () => {
    const long = 'a'.repeat(51);
    expect(parseAliases(`ok, ${long}`)).toEqual({
      ok: false,
      reason: 'alias-too-long',
      alias: long,
    });
    const many = Array.from({ length: 11 }, (_unused, n) => `alias${String(n)}`).join(',');
    expect(parseAliases(many)).toEqual({ ok: false, reason: 'too-many-aliases', count: 11 });
  });
});

describe('planSaveRole', () => {
  const rows = [
    row(1, 'North', { roleId: '101', description: 'The north', aliases: ['n'], groupId: 1 }),
    row(2, 'South', { roleId: '102', aliases: ['s', 'downtown'] }),
    row(3, 'Legacy'),
  ];
  const groups = [group(1, 'Regions', 1)];

  it('makes a new row with what was said, and nothing else', () => {
    expect(planSaveRole(rows, groups, { role: { id: '103', name: 'West' } })).toEqual({
      ok: true,
      rowId: undefined,
      values: { roleId: '103', name: 'West', description: null, aliases: [], groupId: null },
    });
    expect(
      planSaveRole(rows, groups, {
        role: { id: '103', name: 'West' },
        description: '  The   west side ',
        aliases: ['w', 'west'],
        groupId: 1,
      }),
    ).toEqual({
      ok: true,
      rowId: undefined,
      // An alias that is the role's own name says nothing.
      values: {
        roleId: '103',
        name: 'West',
        description: 'The west side',
        aliases: ['w'],
        groupId: 1,
      },
    });
  });

  it('changes only the parts that were said of a row that exists', () => {
    expect(planSaveRole(rows, groups, { role: { id: '101', name: 'North' } })).toEqual({
      ok: true,
      rowId: 1,
      values: {
        roleId: '101',
        name: 'North',
        description: 'The north',
        aliases: ['n'],
        groupId: 1,
      },
    });
    expect(
      planSaveRole(rows, groups, {
        role: { id: '101', name: 'Northside' },
        description: null,
        aliases: [],
        groupId: null,
      }),
    ).toEqual({
      ok: true,
      rowId: 1,
      values: { roleId: '101', name: 'Northside', description: null, aliases: [], groupId: null },
    });
  });

  it('takes over a legacy row of the same name, which gets the id', () => {
    const plan = planSaveRole(rows, groups, { role: { id: '300', name: 'legacy' } });
    expect(plan).toMatchObject({ ok: true, rowId: 3, values: { roleId: '300', name: 'legacy' } });
  });

  it('takes over the row of the same name whose own role the server no longer has', () => {
    // The role 101 was deleted and made anew as 400.
    const live = ['102', '400'];
    const plan = planSaveRole(rows, groups, {
      role: { id: '400', name: 'north' },
      live,
      aliases: ['up'],
    });
    expect(plan).toEqual({
      ok: true,
      rowId: 1,
      values: {
        roleId: '400',
        name: 'north',
        description: 'The north',
        aliases: ['up'],
        groupId: 1,
      },
    });
    // A row whose role is still there keeps it, and without the server's roles nothing is known.
    expect(
      planSaveRole(rows, groups, { role: { id: '400', name: 'north' }, live: ['101', '400'] }),
    ).toMatchObject({ ok: false, reason: 'name-taken' });
    expect(planSaveRole(rows, groups, { role: { id: '400', name: 'north' } })).toMatchObject({
      ok: false,
      reason: 'name-taken',
    });
    // Only the name of the row counts, not an alias of it.
    expect(planSaveRole(rows, groups, { role: { id: '400', name: 'N' }, live })).toMatchObject({
      ok: false,
      reason: 'name-is-alias',
    });
  });

  it('holds only a new row to the length of the name: a listed role with a longer name can still be edited', () => {
    const long = 'N'.repeat(51);
    const plan = planSaveRole(rows, groups, {
      role: { id: '101', name: long },
      description: 'Renamed since',
      aliases: ['n', 'up'],
      groupId: null,
    });
    expect(plan).toEqual({
      ok: true,
      rowId: 1,
      // The row keeps the name it has: the column does not hold the role's.
      values: {
        roleId: '101',
        name: 'North',
        description: 'Renamed since',
        aliases: ['n', 'up'],
        groupId: null,
      },
    });
    expect(planSaveRole(rows, groups, { role: { id: '9', name: long } })).toEqual({
      ok: false,
      reason: 'name-too-long',
    });
  });

  it('refuses a name another row has, as its name or as an alias', () => {
    expect(planSaveRole(rows, groups, { role: { id: '104', name: 'south' } })).toEqual({
      ok: false,
      reason: 'name-taken',
      other: 'South',
    });
    expect(planSaveRole(rows, groups, { role: { id: '104', name: 'Downtown' } })).toEqual({
      ok: false,
      reason: 'name-is-alias',
      other: 'South',
    });
    // A row that has the id keeps its own name.
    expect(planSaveRole(rows, groups, { role: { id: '102', name: 'SOUTH' } })).toMatchObject({
      ok: true,
      rowId: 2,
    });
  });

  it('refuses an alias that is the name or an alias of another row, not its own', () => {
    const save = (aliases: string[]) =>
      planSaveRole(rows, groups, { role: { id: '101', name: 'North' }, aliases });
    expect(save(['up', 'south'])).toEqual({
      ok: false,
      reason: 'alias-taken',
      alias: 'south',
      other: 'South',
    });
    expect(save(['S'])).toEqual({ ok: false, reason: 'alias-taken', alias: 'S', other: 'South' });
    expect(save(['n', 'up'])).toMatchObject({ ok: true, values: { aliases: ['n', 'up'] } });
  });

  it('refuses a name or a description that does not fit the columns, and an unknown group', () => {
    expect(planSaveRole(rows, groups, { role: { id: '9', name: 'x'.repeat(51) } })).toEqual({
      ok: false,
      reason: 'name-too-long',
    });
    expect(
      planSaveRole(rows, groups, { role: { id: '9', name: 'New' }, description: 'd'.repeat(151) }),
    ).toEqual({ ok: false, reason: 'description-too-long' });
    expect(planSaveRole(rows, groups, { role: { id: '9', name: 'New' }, groupId: 7 })).toEqual({
      ok: false,
      reason: 'no-group',
    });
  });
});

describe('planSaveGroup', () => {
  const groups = [group(1, 'Regions', 1), group(2, 'Teams', 2, true), group(3, 'Hobbies', 3)];

  it('puts a new group at the end, or where it was asked to be', () => {
    expect(planSaveGroup(groups, { name: ' Play  styles ' })).toEqual({
      ok: true,
      id: undefined,
      name: 'Play styles',
      pickOne: false,
      order: [1, 2, 3, null],
    });
    expect(planSaveGroup(groups, { name: 'First', pickOne: true, position: 1 })).toMatchObject({
      pickOne: true,
      order: [null, 1, 2, 3],
    });
    expect(planSaveGroup(groups, { name: 'Far', position: 99 })).toMatchObject({
      order: [1, 2, 3, null],
    });
    expect(planSaveGroup([], { name: 'Only', position: 0 })).toMatchObject({ order: [null] });
  });

  it('changes a group that exists, found without case, and leaves alone what was not said', () => {
    expect(planSaveGroup(groups, { name: 'teams' })).toEqual({
      ok: true,
      id: 2,
      name: 'Teams',
      pickOne: true,
      order: [1, 2, 3],
    });
    expect(planSaveGroup(groups, { name: 'Teams', pickOne: false, position: 3 })).toEqual({
      ok: true,
      id: 2,
      name: 'Teams',
      pickOne: false,
      order: [1, 3, 2],
    });
    expect(planSaveGroup(groups, { name: 'hobbies', position: 1 })).toMatchObject({
      order: [3, 1, 2],
    });
  });

  it('renames a group, unless the name is taken', () => {
    expect(planSaveGroup(groups, { name: 'teams', newName: 'Team' })).toMatchObject({
      ok: true,
      id: 2,
      name: 'Team',
    });
    // Its own name in another spelling is a rename, not a clash.
    expect(planSaveGroup(groups, { name: 'teams', newName: 'TEAMS' })).toMatchObject({
      ok: true,
      name: 'TEAMS',
    });
    expect(planSaveGroup(groups, { name: 'teams', newName: 'regions' })).toEqual({
      ok: false,
      reason: 'name-taken',
    });
    expect(planSaveGroup(groups, { name: 'Nothing', newName: 'Something' })).toEqual({
      ok: false,
      reason: 'no-group',
    });
  });

  it('refuses names that say nothing, are too long or mean "no group"', () => {
    expect(planSaveGroup(groups, { name: '  ' })).toEqual({ ok: false, reason: 'name-empty' });
    expect(planSaveGroup(groups, { name: 'x'.repeat(51) })).toEqual({
      ok: false,
      reason: 'name-too-long',
    });
    for (const name of ['Other', 'none']) {
      expect(planSaveGroup(groups, { name })).toEqual({ ok: false, reason: 'reserved-name' });
      expect(planSaveGroup(groups, { name: 'Teams', newName: name })).toEqual({
        ok: false,
        reason: 'reserved-name',
      });
    }
    expect(isNoGroupWord(' OTHER ')).toBe(true);
    expect(isNoGroupWord('others')).toBe(false);
  });

  it('refuses more groups than a server may have, but still changes one of them', () => {
    const full = Array.from({ length: MAX_GROUPS }, (_unused, n) =>
      group(n + 1, `Group ${String(n + 1)}`, n + 1),
    );
    expect(planSaveGroup(full, { name: 'One more' })).toEqual({ ok: false, reason: 'too-many' });
    expect(planSaveGroup(full, { name: 'Group 3', pickOne: true })).toMatchObject({ ok: true });
  });
});
