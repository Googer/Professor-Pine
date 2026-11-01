import { describe, expect, it } from 'vitest';
import {
  buildRoster,
  byRoleName,
  entriesCalled,
  findEntry,
  offerProblem,
  orderedGroups,
  planChange,
  roleProblem,
  sameName,
  suggestEntries,
  type BotStanding,
  type PlannedChange,
  type Roster,
  type SelfRoleGroup,
  type SelfRoleRow,
  type ServerRole,
} from './self-roles.js';

const BOT: BotStanding = { mayManageRoles: true, highestPosition: 50 };
const OWNER = '1000';

const changesAnything = (plan: PlannedChange): boolean =>
  plan.add.length > 0 || plan.remove.length > 0;

function role(id: string, name: string, more: Partial<ServerRole> = {}): ServerRole {
  return {
    id,
    name,
    position: 5,
    everyone: false,
    managed: false,
    moderation: [],
    channelModeration: [],
    staffName: false,
    ...more,
  };
}

function row(id: number, name: string, more: Partial<SelfRoleRow> = {}): SelfRoleRow {
  return { id, name, description: null, roleId: null, groupId: null, aliases: [], ...more };
}

const REGIONS: SelfRoleGroup = { id: 1, name: 'Regions', position: 1, pickOne: false };
const TEAMS: SelfRoleGroup = { id: 2, name: 'Teams', position: 2, pickOne: true };

describe('sameName', () => {
  it('takes case, accents and the spaces around a name as nothing', () => {
    expect(sameName('North Side', 'north side')).toBe(true);
    expect(sameName(' Café ', 'cafe')).toBe(true);
    expect(sameName('North', 'Northside')).toBe(false);
    expect(sameName('North Side', 'NorthSide')).toBe(false);
  });
});

describe('roleProblem', () => {
  it('lets a harmless role below the bot be handed out', () => {
    expect(roleProblem(role('1', 'North'), BOT)).toBeUndefined();
  });

  it('never hands out @everyone, a managed role or a role of moderation', () => {
    expect(roleProblem(role('1', '@everyone', { everyone: true, position: 0 }), BOT)).toBe(
      'everyone',
    );
    expect(roleProblem(role('1', 'Server Booster', { managed: true }), BOT)).toBe('managed');
    expect(roleProblem(role('1', 'Helper', { moderation: ['Kick Members'] }), BOT)).toBe(
      'moderation',
    );
  });

  it('counts a role whose name makes its holder staff, and one a channel allows moderation, as roles of moderation', () => {
    expect(roleProblem(role('1', 'admin', { staffName: true }), BOT)).toBe('moderation');
    expect(roleProblem(role('1', 'Helper', { channelModeration: ['Manage Messages'] }), BOT)).toBe(
      'moderation',
    );
  });

  it('refuses a role at or above the highest role of the bot', () => {
    expect(roleProblem(role('1', 'High', { position: 50 }), BOT)).toBe('above-bot');
    expect(roleProblem(role('1', 'Higher', { position: 51 }), BOT)).toBe('above-bot');
    expect(roleProblem(role('1', 'Just below', { position: 49 }), BOT)).toBeUndefined();
  });

  it('hands out nothing without Manage Roles, and names what lies in the role first', () => {
    const powerless = { ...BOT, mayManageRoles: false };
    expect(roleProblem(role('1', 'North'), powerless)).toBe('no-manage-roles');
    expect(roleProblem(role('1', 'Mod', { moderation: ['Ban Members'] }), powerless)).toBe(
      'moderation',
    );
  });
});

describe('offerProblem', () => {
  const roles = [
    role('1', '@everyone', { everyone: true, position: 0 }),
    role('10', 'North'),
    role('20', 'Helper', { position: 20 }),
    role('30', 'Moderator', { position: 30 }),
  ];
  const server = { roles, bot: BOT, ownerId: OWNER };
  const north = roles[1] ?? role('10', 'North');
  const helper = roles[2] ?? role('20', 'Helper');

  it('lets the owner of the server offer any role, with or without roles of their own', () => {
    expect(
      offerProblem(helper, server, { id: OWNER, held: [], mayManageRoles: false }),
    ).toBeUndefined();
  });

  it('asks anybody else for Manage Roles first', () => {
    expect(offerProblem(north, server, { id: '7', held: ['30'], mayManageRoles: false })).toBe(
      'no-manage-roles',
    );
  });

  it('asks for a role of their own above the one they offer', () => {
    const staff = (...held: string[]) => ({ id: '7', held, mayManageRoles: true });
    expect(offerProblem(north, server, staff('30'))).toBeUndefined();
    expect(offerProblem(north, server, staff('1', '20', '10'))).toBeUndefined();
    // Level is not above; a role the server does not have counts for nothing; nor does @everyone.
    expect(offerProblem(helper, server, staff('20'))).toBe('not-below');
    expect(offerProblem(helper, server, staff('10', '999'))).toBe('not-below');
    expect(offerProblem(north, server, staff('1'))).toBe('not-below');
    expect(offerProblem(north, server, staff())).toBe('not-below');
  });
});

describe('buildRoster', () => {
  const server = (...roles: ServerRole[]) => ({ roles, bot: BOT, ownerId: OWNER });

  it('takes a row with an id for the role of that id, whatever it is called', () => {
    const { roster, writes } = buildRoster(
      [row(1, 'North', { roleId: '10', groupId: 1 })],
      [REGIONS],
      server(role('10', 'Northside'), role('11', 'North')),
    );
    expect(roster.entries).toHaveLength(1);
    expect(roster.entries[0]).toMatchObject({
      name: 'Northside',
      role: { id: '10' },
      group: REGIONS,
      problem: undefined,
    });
    // The legacy bot finds a role by `roleName`, so the row follows the new name.
    expect(writes).toEqual({ links: [], renames: [{ rowId: 1, name: 'Northside' }] });
  });

  it('does not let a row follow a name another row has, or one too long for the column', () => {
    const long = 'x'.repeat(51);
    const { roster, writes } = buildRoster(
      [
        row(1, 'North', { roleId: '10' }),
        row(2, 'South', { roleId: '11' }),
        row(3, 'West', { roleId: '12' }),
      ],
      [],
      server(role('10', 'SOUTH'), role('11', 'South'), role('12', long)),
    );
    expect(writes.renames).toEqual([]);
    expect(roster.entries.map((entry) => entry.name)).toEqual(['SOUTH', 'South', long]);
  });

  it('lets two rows swap names with their roles only as far as the names stay unique', () => {
    const { writes } = buildRoster(
      [row(1, 'North', { roleId: '10' }), row(2, 'South', { roleId: '11' })],
      [],
      server(role('10', 'South'), role('11', 'East')),
    );
    // Row 1 cannot be South while row 2 still is; row 2 becomes East, and the next look frees South.
    expect(writes.renames).toEqual([{ rowId: 2, name: 'East' }]);
  });

  it('says that the role of a row with an id is gone, and never looks for it by name', () => {
    const { roster, writes } = buildRoster(
      [row(1, 'North', { roleId: '10' })],
      [],
      server(role('99', 'North')),
    );
    expect(roster.entries[0]).toMatchObject({ role: undefined, name: 'North', problem: 'gone' });
    expect(writes).toEqual({ links: [], renames: [] });
  });

  it('finds a legacy row by its name, without case, and remembers the id', () => {
    const { roster, writes } = buildRoster(
      [row(1, 'north side')],
      [],
      server(role('10', 'North Side')),
    );
    expect(roster.entries[0]).toMatchObject({ name: 'North Side', role: { id: '10' } });
    expect(writes).toEqual({
      links: [{ rowId: 1, roleId: '10' }],
      renames: [{ rowId: 1, name: 'North Side' }],
    });
  });

  it('guesses nothing for a legacy row: no role, several roles, or a role another row has', () => {
    const { roster, writes } = buildRoster(
      [
        row(1, 'Gone'),
        row(2, 'Twice'),
        row(3, 'Renamed', { roleId: '30' }),
        row(4, 'Taken'),
        row(5, ''),
        row(6, '@everyone'),
      ],
      [],
      server(
        role('20', 'Twice'),
        role('21', 'twice'),
        role('30', 'Taken'),
        role('40', '', { position: 1 }),
        role('1', '@everyone', { everyone: true, position: 0 }),
      ),
    );
    const problems = Object.fromEntries(
      roster.entries.map((entry) => [entry.row.id, entry.problem]),
    );
    expect(problems).toEqual({
      1: 'gone',
      2: 'ambiguous',
      3: undefined,
      4: 'duplicate',
      5: 'gone',
      6: 'gone',
    });
    expect(roster.entries.filter((entry) => entry.role).map((entry) => entry.row.id)).toEqual([3]);
    expect(writes.links).toEqual([]);
    // Row 3 cannot take the name of row 4.
    expect(writes.renames).toEqual([]);
  });

  it('leaves the roles that rows with an id stand for out of what a legacy row may mean', () => {
    const { roster, writes } = buildRoster(
      [
        row(1, 'Old name', { roleId: '10' }),
        row(2, 'north'),
        row(3, 'Team', { roleId: '20' }),
        row(4, 'team'),
        row(5, 'South', { roleId: '30' }),
        row(6, 'south'),
      ],
      [],
      server(
        // Two roles are called North: one has its row, so the legacy row means the other.
        role('10', 'North'),
        role('11', 'NORTH'),
        // Three are called Team: one has its row, and nothing says which of the others is meant.
        role('20', 'Team'),
        role('21', 'team'),
        role('22', 'TEAM'),
        // The only South has its row.
        role('30', 'South'),
      ),
    );
    const found = Object.fromEntries(
      roster.entries.map((entry) => [entry.row.id, entry.problem ?? entry.role?.id]),
    );
    expect(found).toEqual({ 1: '10', 2: '11', 3: '20', 4: 'ambiguous', 5: '30', 6: 'duplicate' });
    expect(writes.links).toEqual([{ rowId: 2, roleId: '11' }]);
  });

  it('marks what may not be handed out, sorts by name and orders the groups', () => {
    const { roster } = buildRoster(
      [
        row(1, 'Valor', { roleId: '1', groupId: 2 }),
        row(2, 'Mod', { roleId: '2' }),
        row(3, 'alpha', { roleId: '3', groupId: 9 }),
      ],
      [TEAMS, REGIONS],
      server(
        role('1', 'Valor'),
        role('2', 'Mod', { moderation: ['Manage Messages'] }),
        role('3', 'alpha'),
      ),
    );
    expect(roster.groups).toEqual([REGIONS, TEAMS]);
    expect(roster.entries.map((entry) => [entry.name, entry.problem, entry.group?.name])).toEqual([
      ['alpha', undefined, undefined],
      ['Mod', 'moderation', undefined],
      ['Valor', undefined, 'Teams'],
    ]);
  });
});

describe('byRoleName', () => {
  it('orders without case, numbers by their value, and the same name by the id of the row', () => {
    const named = ['Region 10', 'region 2', 'Region 1', 'Zone', 'alpha'].map((name, index) => ({
      name,
      id: index,
    }));
    expect([...named].sort(byRoleName).map((entry) => entry.name)).toEqual([
      'alpha',
      'Region 1',
      'region 2',
      'Region 10',
      'Zone',
    ]);
    const twins = [
      { name: 'Twin', row: { id: 9 } },
      { name: 'twin', row: { id: 3 } },
      { name: 'Twin', row: { id: 4 } },
    ];
    for (const order of [twins, [...twins].reverse(), [twins[1], twins[2], twins[0]]]) {
      expect(
        (order as typeof twins)
          .sort(byRoleName)
          .map((entry) => `${entry.name} ${String(entry.row.id)}`),
      ).toEqual(['Twin 4', 'Twin 9', 'twin 3']);
    }
    expect(byRoleName(twins[0] ?? { name: '' }, twins[0] ?? { name: '' })).toBe(0);
  });
});

describe('orderedGroups', () => {
  it('orders by place, then by name', () => {
    const groups = [
      { id: 1, name: 'b', position: 2, pickOne: false },
      { id: 2, name: 'a', position: 2, pickOne: false },
      { id: 3, name: 'z', position: 1, pickOne: false },
    ];
    expect(orderedGroups(groups).map((group) => group.name)).toEqual(['z', 'a', 'b']);
  });
});

/** A server with regions (any number), teams (one) and a role without a group. */
function sample(change: (roles: ServerRole[]) => ServerRole[] = (roles) => roles, bot = BOT) {
  const rows = [
    row(1, 'North', { roleId: '101', groupId: 1, aliases: ['n', 'north side'] }),
    row(2, 'South', { roleId: '102', groupId: 1 }),
    row(3, 'Instinct', { roleId: '201', groupId: 2 }),
    row(4, 'Mystic', { roleId: '202', groupId: 2 }),
    row(5, 'Valor', { roleId: '203', groupId: 2 }),
    row(6, 'Trader', { roleId: '301' }),
    row(7, 'Lost', { roleId: '999' }),
  ];
  const roles = change([
    role('101', 'North'),
    role('102', 'South'),
    role('201', 'Instinct'),
    role('202', 'Mystic'),
    role('203', 'Valor'),
    role('301', 'Trader'),
    role('900', 'Moderator', { moderation: ['Ban Members'], position: 40 }),
    role('901', 'Admin', { moderation: ['Administrator'], position: 60 }),
  ]);
  return buildRoster(rows, [REGIONS, TEAMS], { roles, bot, ownerId: OWNER }).roster;
}

const names = (entries: readonly { name: string }[]) => entries.map((entry) => entry.name);

describe('findEntry and suggestEntries', () => {
  const roster = sample();

  it('finds a role by its name or an alias, without case', () => {
    expect(findEntry(roster.entries, 'north')?.row.id).toBe(1);
    expect(findEntry(roster.entries, ' N ')?.row.id).toBe(1);
    expect(findEntry(roster.entries, 'NORTH SIDE')?.row.id).toBe(1);
  });

  it('knows the entries whose roles are called alike at present', () => {
    const { roster: twins } = buildRoster(
      [
        row(1, 'North', { roleId: '1' }),
        row(2, 'Bee', { roleId: '2' }),
        row(3, 'Gone', { roleId: '9' }),
        row(4, 'South', { roleId: '4', aliases: ['north'] }),
      ],
      [],
      // The role of the second row was renamed to the name the first row has.
      {
        roles: [role('1', 'North'), role('2', 'north'), role('4', 'South')],
        bot: BOT,
        ownerId: OWNER,
      },
    );
    expect(entriesCalled(twins.entries, ' NORTH ').map((entry) => entry.row.id)).toEqual([1, 2]);
    // An alias is no name, and a row without a role is called nothing.
    expect(entriesCalled(twins.entries, 'south').map((entry) => entry.row.id)).toEqual([4]);
    expect(entriesCalled(twins.entries, 'Gone')).toEqual([]);
    expect(entriesCalled(twins.entries, '')).toEqual([]);
  });

  it('prefers a name to an alias', () => {
    const { roster: both } = buildRoster(
      [row(1, 'North', { roleId: '1', aliases: ['south'] }), row(2, 'South', { roleId: '2' })],
      [],
      { roles: [role('1', 'North'), role('2', 'South')], bot: BOT, ownerId: OWNER },
    );
    expect(findEntry(both.entries, 'south')?.row.id).toBe(2);
  });

  it('prefers an entry that leads to a role, for a name and for an alias', () => {
    const { roster: twins } = buildRoster(
      [
        row(1, 'North', { roleId: '99' }),
        row(2, 'north', { roleId: '1' }),
        row(3, 'Lost', { roleId: '98', aliases: ['s'] }),
        row(4, 'South', { roleId: '2', aliases: ['s'] }),
      ],
      [],
      { roles: [role('1', 'north'), role('2', 'South')], bot: BOT, ownerId: OWNER },
    );
    expect(findEntry(twins.entries, 'North')?.row.id).toBe(2);
    expect(findEntry(twins.entries, 'S')?.row.id).toBe(4);
    // One that leads to none is still found when it is the only one.
    expect(findEntry(twins.entries, 'lost')?.row.id).toBe(3);
  });

  it('finds nothing for a part of a name, and suggests what was probably meant', () => {
    expect(findEntry(roster.entries, 'nor')).toBeUndefined();
    expect(findEntry(roster.entries, '')).toBeUndefined();
    expect(names(suggestEntries(roster.entries, 'nor'))).toEqual(['North']);
    expect(names(suggestEntries(roster.entries, 'mistic'))).toEqual(['Mystic']);
    expect(suggestEntries(roster.entries, 'zzz')).toEqual([]);
  });
});

describe('planChange', () => {
  it('gives roles the member lacks and takes away roles they have', () => {
    const plan = planChange(sample(), new Set(['102']), { give: ['101', '301'], take: ['102'] });
    expect(names(plan.add)).toEqual(['North', 'Trader']);
    expect(names(plan.remove)).toEqual(['South']);
    expect(plan.displaced).toEqual([]);
    expect(plan.skipped).toEqual([]);
    expect(changesAnything(plan)).toBe(true);
  });

  it('says what was held already and what was not held, and changes nothing for those', () => {
    const plan = planChange(sample(), new Set(['101']), { give: ['101'], take: ['102'] });
    expect(names(plan.already)).toEqual(['North']);
    expect(names(plan.lacking)).toEqual(['South']);
    expect(changesAnything(plan)).toBe(false);
  });

  it('takes the other roles of a pick-one group away with the one that is given', () => {
    const plan = planChange(sample(), new Set(['203', '201', '101']), { give: ['202'], take: [] });
    expect(names(plan.add)).toEqual(['Mystic']);
    expect(names(plan.remove)).toEqual(['Instinct', 'Valor']);
    expect(names(plan.displaced)).toEqual(['Instinct', 'Valor']);
  });

  it('does not take a displaced role away twice when that was asked for as well', () => {
    const plan = planChange(sample(), new Set(['203']), { give: ['202'], take: ['203'] });
    expect(names(plan.remove)).toEqual(['Valor']);
  });

  it('gives none of several roles of a pick-one group that were asked for at once', () => {
    const plan = planChange(sample(), new Set(['203']), { give: ['201', '202', '101'], take: [] });
    expect(names(plan.add)).toEqual(['North']);
    expect(plan.remove).toEqual([]);
    expect(plan.skipped.map((skip) => [skip.entry?.name, skip.reason])).toEqual([
      ['Instinct', 'pick-one'],
      ['Mystic', 'pick-one'],
    ]);
  });

  it('keeps the one that is held when it is asked for together with another of its group', () => {
    const plan = planChange(sample(), new Set(['203']), { give: ['203', '202'], take: [] });
    expect(names(plan.already)).toEqual(['Valor']);
    expect(plan.add).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.skipped.map((skip) => skip.reason)).toEqual(['pick-one']);
  });

  it('gives a role with a problem to nobody', () => {
    const dangerous = sample((roles) =>
      roles.map((r) => (r.id === '101' ? { ...r, moderation: ['Manage Roles'] } : r)),
    );
    const plan = planChange(dangerous, new Set(), { give: ['101'], take: [] });
    expect(plan.add).toEqual([]);
    expect(plan.skipped.map((skip) => [skip.entry?.name, skip.reason])).toEqual([
      ['North', 'moderation'],
    ]);
  });

  it('still takes away a role that was given a moderation permission since', () => {
    const dangerous = sample((roles) =>
      roles.map((r) => (r.id === '101' ? { ...r, moderation: ['Manage Roles'] } : r)),
    );
    const plan = planChange(dangerous, new Set(['101']), { give: [], take: ['101'] });
    expect(names(plan.remove)).toEqual(['North']);
  });

  it('takes away nothing the bot cannot change', () => {
    const above = sample((roles) =>
      roles.map((r) => (r.id === '101' ? { ...r, position: 70 } : r)),
    );
    const plan = planChange(above, new Set(['101']), { give: [], take: ['101'] });
    expect(plan.remove).toEqual([]);
    expect(plan.skipped.map((skip) => skip.reason)).toEqual(['above-bot']);

    const powerless = sample(undefined, { ...BOT, mayManageRoles: false });
    const none = planChange(powerless, new Set(['101']), { give: ['102'], take: ['101'] });
    expect(changesAnything(none)).toBe(false);
    expect(none.skipped.map((skip) => skip.reason)).toEqual(['no-manage-roles', 'no-manage-roles']);
  });

  it('does not give a role of a pick-one group while another of it cannot be taken away', () => {
    const stuck = sample((roles) =>
      roles.map((r) => (r.id === '203' ? { ...r, position: 70 } : r)),
    );
    const plan = planChange(stuck, new Set(['203']), { give: ['202'], take: [] });
    expect(changesAnything(plan)).toBe(false);
    expect(plan.skipped.map((skip) => [skip.entry?.name, skip.reason, skip.blocker?.name])).toEqual(
      [['Mystic', 'stuck', 'Valor']],
    );
    expect(plan.skipped[0]?.blocker?.problem).toBe('above-bot');
  });

  it.each([
    ['a permission', { moderation: ['Kick Members'] }],
    ['a permission in a channel', { channelModeration: ['Manage Messages'] }],
    ['a name of staff', { staffName: true }],
  ] as const)(
    'does not take away unasked a role of a pick-one group that has %s by now, and still takes it when asked',
    (_what, more) => {
      const promoted = sample((roles) =>
        roles.map((r) => (r.id === '203' ? { ...r, ...more } : r)),
      );
      const plan = planChange(promoted, new Set(['203']), { give: ['202'], take: [] });
      expect(changesAnything(plan)).toBe(false);
      expect(
        plan.skipped.map((skip) => [skip.entry?.name, skip.reason, skip.blocker?.name]),
      ).toEqual([['Mystic', 'stuck', 'Valor']]);
      expect(plan.skipped[0]?.blocker?.problem).toBe('moderation');
      // Asked for outright, it goes; and with it out of the way the other one is given.
      const asked = planChange(promoted, new Set(['203']), { give: ['202'], take: ['203'] });
      expect(names(asked.remove)).toEqual(['Valor']);
      expect(names(asked.add)).toEqual([]);
      expect(names(planChange(promoted, new Set(), { give: ['202'], take: [] }).add)).toEqual([
        'Mystic',
      ]);
    },
  );

  it('never touches a role no row leads to, whatever is asked for', () => {
    const roster = sample();
    // A moderator role, an admin role, the role of a row whose role is gone, and nonsense.
    const foreign = ['900', '901', '999', 'everything'];
    const plan = planChange(roster, new Set(['900', '901']), { give: foreign, take: foreign });
    expect(changesAnything(plan)).toBe(false);
    expect(plan.skipped.map((skip) => skip.reason)).toEqual(foreign.map(() => 'not-offered'));
  });
});

describe('planChange, for any request at all', () => {
  it('plans only roles a row of the server leads to', () => {
    const roster: Roster = sample();
    const offered = roster.entries.flatMap((entry) => (entry.role ? [entry.role.id] : []));
    const staff = ['900', '901', '555555', '999'];
    const everything = [...offered, ...staff, 'nonsense'];
    // Many subsets of a small universe as what is held, given and taken (deterministic).
    let seed = 7;
    const pick = (): string[] =>
      everything.filter(() => {
        seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
        return seed % 3 === 0;
      });
    let planned = 0;
    for (let round = 0; round < 500; round++) {
      const held = [...new Set([...pick(), ...staff.filter((_id, index) => (round >> index) & 1)])];
      const plan = planChange(roster, new Set(held), { give: pick(), take: pick() });
      // What is planned is all that is ever named to Discord, one role at a time.
      for (const entry of [...plan.add, ...plan.remove]) {
        planned += 1;
        expect(offered, `round ${String(round)}`).toContain(entry.role?.id);
      }
      for (const entry of plan.add) expect(held).not.toContain(entry.role?.id);
      for (const entry of plan.remove) expect(held).toContain(entry.role?.id);
    }
    expect(planned).toBeGreaterThan(500);
  });
});
