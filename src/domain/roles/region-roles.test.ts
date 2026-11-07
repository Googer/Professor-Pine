import { describe, expect, it } from 'vitest';
import { regionChoices, type GateLook, type RegionGate } from './region-roles.js';
import { buildRoster, type SelfRoleGroup, type ServerRole } from './self-roles.js';

/*
 * Which roles open which region for a member (plan 8M-20, R1, R12): over a server of three
 * regions, West and East with gates their roles open (Metro opens both) and a plaza everybody
 * sees, the roles West and East of a pick-one group, Metro of none, Mod a role of moderation.
 */

const GUILD = '400000000000000001';
const WEST = '511000000000000001';
const EAST = '511000000000000002';
const METRO = '511000000000000003';
const MOD = '511000000000000004';
const STAFF_ONLY = '511000000000000005';

const role = (id: string, name: string, more: Partial<ServerRole> = {}): ServerRole => ({
  id,
  name,
  position: 5,
  everyone: false,
  managed: false,
  moderation: [],
  channelModeration: [],
  staffName: false,
  ...more,
});

const home: SelfRoleGroup = { id: 1, name: 'Home', position: 1, pickOne: true };

function rosterWith(pickOne = true) {
  const roles = [
    role(GUILD, '@everyone', { everyone: true, position: 0 }),
    role(WEST, 'West'),
    role(EAST, 'East'),
    role(METRO, 'Metro'),
    role(MOD, 'Mod', { moderation: ['Kick Members'] }),
    role(STAFF_ONLY, 'Patrol'),
  ];
  const row = (id: number, roleId: string, name: string, groupId: number | null) => ({
    id,
    name,
    description: null,
    roleId,
    groupId,
    aliases: [],
  });
  return buildRoster(
    [
      row(1, WEST, 'West', 1),
      row(2, EAST, 'East', 1),
      row(3, METRO, 'Metro', null),
      row(4, MOD, 'Mod', 1),
    ],
    [{ ...home, pickOne }],
    { roles, bot: { mayManageRoles: true, highestPosition: 50 }, ownerId: '300000000000000009' },
  ).roster;
}

/** The regions: West (1), East (2) and the plaza (3), each by its gate. */
const REGIONS: RegionGate[] = [
  { regionId: 1, gateId: 'west-forum' },
  { regionId: 2, gateId: 'east-forum' },
  { regionId: 3, gateId: 'plaza-forum' },
];

/**
 * A member's look: West's gate opens to West, Metro and Patrol (a role staff give), East's to
 * East and Metro, the plaza to everybody; `barred` gates keep them out by an overwrite of their
 * own whatever they hold; `denies` names the roles whose overwrites deny a gate the view (an
 * allowance of another role beats it, as on Discord).
 */
function lookOf(
  held: readonly string[],
  barred: readonly string[] = [],
  denies: Record<string, string[]> = {},
): GateLook {
  const opens: Record<string, string[] | 'all'> = {
    'west-forum': [WEST, METRO, STAFF_ONLY],
    'east-forum': [EAST, METRO],
    'plaza-forum': 'all',
  };
  const seesWith = (gateId: string, roles: ReadonlySet<string>): boolean => {
    if (barred.includes(gateId)) return false;
    const openers = opens[gateId];
    if (openers !== 'all') return (openers ?? []).some((id) => roles.has(id));
    return !(denies[gateId] ?? []).some((id) => roles.has(id));
  };
  const now = new Set(held);
  const denials = (gateId: string) => ({
    own: barred.includes(gateId),
    roles: (denies[gateId] ?? []).filter((id) => now.has(id)),
  });
  return {
    access: new Map(
      REGIONS.map(({ gateId }) => {
        const kept = denials(gateId);
        return [
          gateId,
          seesWith(gateId, now)
            ? 'visible'
            : kept.own || kept.roles.length > 0
              ? 'barred'
              : 'hidden',
        ];
      }),
    ),
    seesWith,
    denials,
  };
}

const choicesOf = (
  held: string[],
  barred: string[] = [],
  pickOne = true,
  denies: Record<string, string[]> = {},
) => regionChoices(REGIONS, lookOf(held, barred, denies), rosterWith(pickOne), new Set(held));

describe('regionChoices', () => {
  it('offers the roles that open a hidden region, and nothing where everybody sees it', () => {
    const [west, east, plaza] = choicesOf([]);
    expect(west).toMatchObject({ regionId: 1, access: 'hidden', leave: [] });
    // Patrol opens West but is no role to give oneself; Mod is one of moderation.
    expect(west?.join.map((join) => join.entry.name)).toEqual(['Metro', 'West']);
    expect(west?.join.find((join) => join.entry.name === 'Metro')?.alsoOpens).toEqual([2]);
    expect(west?.join.find((join) => join.entry.name === 'West')?.alsoOpens).toEqual([]);
    expect(east?.join.map((join) => join.entry.name)).toEqual(['East', 'Metro']);
    expect(plaza).toEqual({ regionId: 3, access: 'visible', join: [], leave: [] });
  });

  it('says what a pick-one group takes with a join: the other role and the regions it alone opened', () => {
    const [west, east] = choicesOf([WEST]);
    expect(west).toMatchObject({ access: 'visible', join: [] });
    expect(west?.leave.map((leave) => [leave.entry.name, leave.closes, leave.alsoCloses])).toEqual([
      ['West', true, []],
    ]);
    const joinEast = east?.join.find((join) => join.entry.name === 'East');
    expect(joinEast?.alsoLeaves.entries.map((entry) => entry.name)).toEqual(['West']);
    expect(joinEast?.alsoLeaves.regions).toEqual([1]);
    expect(joinEast?.stuck).toBeUndefined();
    // Metro is in no group: it takes nothing.
    const joinMetro = east?.join.find((join) => join.entry.name === 'Metro');
    expect(joinMetro?.alsoLeaves).toEqual({ entries: [], regions: [] });
    // Without the pick-one rule East takes nothing either.
    const [, loose] = choicesOf([WEST], [], false);
    expect(loose?.join.find((join) => join.entry.name === 'East')?.alsoLeaves.entries).toEqual([]);
  });

  it('says which other regions a leave closes, and what keeps a region open where it does not (A2)', () => {
    const [west, east] = choicesOf([METRO]);
    const leaves = (choice: typeof west) =>
      choice?.leave.map((leave) => [
        leave.entry.name,
        leave.closes,
        leave.alsoCloses,
        leave.stillOpenBy.entries.map((entry) => entry.name),
        leave.stillOpenBy.staffRole,
      ]);
    expect(leaves(west)).toEqual([['Metro', true, [2], [], false]]);
    expect(leaves(east)).toEqual([['Metro', true, [1], [], false]]);
    // Metro and West both open West: each is offered, and leaving it keeps West through the other;
    // leaving Metro still closes East, which only Metro opens (W1).
    const [both] = choicesOf([METRO, WEST]);
    expect(leaves(both)).toEqual([
      ['Metro', false, [2], ['West'], false],
      ['West', false, [], ['Metro'], false],
    ]);
    // Patrol is a role staff gave: Metro's leave keeps West open through it, and closes East.
    const [staff] = choicesOf([METRO, STAFF_ONLY]);
    expect(leaves(staff)).toEqual([['Metro', false, [2], [], true]]);
  });

  it('offers no join past a denial, and a stuck join with what is in the way', () => {
    const [west] = choicesOf([], ['west-forum']);
    expect(west).toMatchObject({ access: 'barred', join: [], leave: [] });
    // Kept out by a role nobody can give themselves (Patrol): kept out, no join.
    const [, , patrolled] = choicesOf([STAFF_ONLY], [], true, { 'plaza-forum': [STAFF_ONLY] });
    expect(patrolled).toMatchObject({ access: 'barred', join: [] });
    // Mod (moderation by now) is held in Home: East cannot replace it unasked.
    const [, east] = choicesOf([MOD]);
    const stuck = east?.join.find((join) => join.entry.name === 'East');
    expect(stuck?.stuck?.reason).toBe('stuck');
    expect(stuck?.stuck?.blocker?.name).toBe('Mod');
  });

  it('takes a region denied by a self-assignable role as hidden, with the join that gives it up (A6)', () => {
    // West (of the pick-one Home) denies the plaza: joining East gives West back and opens it.
    const [, , plaza] = choicesOf([WEST], [], true, { 'plaza-forum': [WEST] });
    expect(plaza?.access).toBe('hidden');
    const joinEast = plaza?.join.find((join) => join.entry.name === 'East');
    expect(joinEast?.alsoLeaves.entries.map((entry) => entry.name)).toEqual(['West']);
    // Metro takes nothing along: West's denial stays, so it is no join here.
    expect(plaza?.join.map((join) => join.entry.name)).toEqual(['East']);
  });

  it('leaves out a region whose gate is gone, and offers nothing without a roster', () => {
    const look = lookOf([]);
    const gone: GateLook = {
      access: new Map([...look.access].filter(([gate]) => gate !== 'east-forum')),
      seesWith: (gateId, roles) => look.seesWith(gateId, roles),
      denials: (gateId) => look.denials(gateId),
    };
    expect(
      regionChoices(REGIONS, gone, rosterWith(), new Set()).map((one) => one.regionId),
    ).toEqual([1, 3]);
    expect(regionChoices(REGIONS, look, undefined, new Set())).toEqual([
      { regionId: 1, access: 'hidden', join: [], leave: [] },
      { regionId: 2, access: 'hidden', join: [], leave: [] },
      { regionId: 3, access: 'visible', join: [], leave: [] },
    ]);
  });
});
