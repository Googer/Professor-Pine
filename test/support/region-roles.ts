import { OverwriteType, PermissionFlagsBits } from 'discord.js';
import type { Region } from '../../src/db/repositories/region-repository.js';
import type { RegionWebDeps } from '../../src/web/region-routes.js';
import { FAKE_GUILD_ID } from './fake-interactions.js';
import { EAST_FORUM, testRegions, WEST_FORUM } from './gyms.js';
import { partyServiceWith } from './party-service.js';
import { selfRolesWith } from './roles.js';

/*
 * The regions of the map and the roles that open them (plan 8M-20), over the fakes: the invented
 * regions West (1, `WEST_FORUM`) and East (2, `EAST_FORUM`), the one without an outline (3), and
 * the Plaza (4, `PLAZA_FORUM`), which everybody sees. West's forum opens to the roles West and
 * Metro, East's to East and Metro, both hidden from everybody else; West and East are of the
 * pick-one group Home, Metro of no group. The fake gateway reads what a member holds from the
 * role server (`rolesOf`, and its cache by `memberFetched`), so that a role given through the
 * service opens a forum at once. The party services are `partyServiceWith`'s (or a test's own,
 * `made`: `reportedRaid`'s), whose gateway, store and access service these are.
 */

/** A forum everybody sees, of the Plaza (region 4). */
export const PLAZA_FORUM = '100000000000000019';

/** The roles that open the regions, and one staff give that nobody can give themselves. */
export const REGION_ROLE = {
  west: '511000000000000001',
  east: '511000000000000002',
  metro: '511000000000000003',
  patrol: '511000000000000004',
} as const;

/** The Plaza: a square north of West and East, its forum seen by everybody. */
function plaza(): Region {
  return {
    id: 4,
    guildId: 1,
    channelId: '100000000000000009',
    description: null,
    bounds: [
      { lat: 40.1, lon: -80.1 },
      { lat: 40.2, lon: -80.1 },
      { lat: 40.2, lon: -79.9 },
      { lat: 40.1, lon: -79.9 },
      { lat: 40.1, lon: -80.1 },
    ],
    forumChannelId: PLAZA_FORUM,
    summaryMessageId: null,
  };
}

/** The view overwrite of a role (or everybody) in a forum: allowing or denying it. */
export function viewOverwrite(id: string, allows: boolean) {
  const view = String(PermissionFlagsBits.ViewChannel);
  return {
    id,
    type: OverwriteType.Role,
    allow: allows ? view : '0',
    deny: allows ? '0' : view,
  };
}

/**
 * The fakes of a server whose regions open by role, and the web deps over them (`deps`, pass as
 * `regions`); `offer` false leaves West, East and Metro unoffered (Patrol never is).
 */
export async function regionRolesWith(
  options: { offer?: boolean; made?: Awaited<ReturnType<typeof partyServiceWith>> } = {},
) {
  const made = options.made ?? (await partyServiceWith());
  const roles = selfRolesWith();
  const { server, storage, selfRoles, owner } = roles;
  server
    .role(REGION_ROLE.west, 'West')
    .role(REGION_ROLE.east, 'East')
    .role(REGION_ROLE.metro, 'Metro')
    .role(REGION_ROLE.patrol, 'Patrol');
  const { gateway } = made;
  gateway.addForum(PLAZA_FORUM, [], 'plaza-raids');
  const hidden = viewOverwrite(FAKE_GUILD_ID, false);
  gateway.forumOverwrites.set(WEST_FORUM, [
    hidden,
    viewOverwrite(REGION_ROLE.west, true),
    viewOverwrite(REGION_ROLE.metro, true),
  ]);
  gateway.forumOverwrites.set(EAST_FORUM, [
    hidden,
    viewOverwrite(REGION_ROLE.east, true),
    viewOverwrite(REGION_ROLE.metro, true),
  ]);
  gateway.rolesOf = (memberId) => server.held(memberId);
  const regions = [...testRegions(), plaza()];
  if (options.offer !== false) {
    const home = await storage.saveGroup(FAKE_GUILD_ID, { name: 'Home', pickOne: true });
    if (home.kind === 'refused') throw new Error(`group Home: ${home.reason}`);
    for (const [roleId, groupId] of [
      [REGION_ROLE.west, home.group.id],
      [REGION_ROLE.east, home.group.id],
      [REGION_ROLE.metro, undefined],
    ] as const) {
      const added = await selfRoles.addRole(
        FAKE_GUILD_ID,
        { roleId, ...(groupId === undefined ? {} : { groupId }) },
        owner(),
      );
      if (added.kind !== 'added') throw new Error(`role ${roleId}: ${added.kind}`);
    }
  }
  const deps: RegionWebDeps = {
    guilds: {
      idFor: (snowflake) => Promise.resolve(snowflake === FAKE_GUILD_ID ? 1 : undefined),
    },
    regions: { all: () => regions },
    gates: gateway,
    selfRoles,
  };
  return { ...roles, roleGateway: roles.gateway, made, gateway, regions, deps };
}
