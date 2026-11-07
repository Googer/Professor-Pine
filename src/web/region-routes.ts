import type { FastifyInstance } from 'fastify';
import { roleText } from '../commands/roles/shared.js';
import { memberProblem } from '../commands/roles/words.js';
import type { Region } from '../db/repositories/region-repository.js';
import type { PartyGateway } from '../discord/party-gateway.js';
import { regionGate } from '../domain/history/region-tally.js';
import { hasOutline } from '../domain/web/geo-view.js';
import { regionChoices, type RegionGate } from '../domain/roles/region-roles.js';
import type { Roster } from '../domain/roles/self-roles.js';
import type { RegionMineView, RegionsMineView } from '../domain/web/region-data.js';
import type { SelfRoleService } from '../services/self-role-service.js';
import { sendFailure } from './answers.js';
import type { GuildRequest } from './guild-routes.js';
import { pageWords } from './page-words.js';
import { UNCONFIRMED } from './party-routes.js';
import type { PartyViewers } from './party-viewers.js';
import { limitedPerAddress, RateLimiter } from './rate-limit.js';
import type { WebDeps } from './server.js';

/** What "Your regions" on the live map reads and changes (plan 8M-20). */
export interface RegionWebDeps {
  /** The row of a server (`Guild.id`), whose regions are its own. */
  guilds: { idFor(snowflake: string): Promise<number | undefined> };
  /** The regions (`RegionDirectory`): those with an outline are the map's (`/api/geo`). */
  regions: { all(): readonly Region[] };
  /** The member and the regions' gates, looked at once (`PartyGateway.memberGates`). */
  gates: Pick<PartyGateway, 'memberGates'>;
  /**
   * Self-assigned roles (`ctx.selfRoles`), the service `/iam` and its menus go through; undefined
   * where `settings.features.roles` is off (R6: the view says access alone).
   */
  selfRoles: Pick<SelfRoleService, 'roster' | 'heldNow' | 'change'> | undefined;
}

/** The asks of "Your regions" one address may make in a minute: as many as the parties'. */
export const REGIONS_PER_MINUTE = 120;

/** The server's row and its regions on the map (with an outline) by their gates (`regionGate`). */
export async function mapRegionsOf(
  deps: RegionWebDeps,
  guild: string,
): Promise<{ row: number | undefined; regions: Array<RegionGate & { region: Region }> }> {
  const row = await deps.guilds.idFor(guild);
  if (row === undefined) return { row, regions: [] };
  return {
    row,
    regions: deps.regions
      .all()
      .filter((region) => region.guildId === row && hasOutline(region))
      .map((region) => ({ regionId: region.id, gateId: regionGate(region), region })),
  };
}

/** Said of a role that keeps a region open and is not self-assignable (A2). */
const STAFF_ROLE = 'a role staff gave you';

/**
 * The member's view of the server's regions (R1, R2, R12): the member looked at once (`fresh`:
 * afresh from Discord, else as the cache has them after the member directory's look), what they
 * hold with this service's later changes laid over (`heldNow`, as `/iam` plans), and per region
 * the choices of `regionChoices`, the roles named as Discord has them and a stuck join in
 * `/iam`'s words. Undefined for somebody who is not in the server; rejects when Discord cannot
 * say.
 */
export async function regionsView(
  deps: WebDeps,
  guild: string,
  userId: string,
  fresh: boolean,
): Promise<RegionsMineView | undefined> {
  const { regions: regionDeps } = deps;
  const { regions } = await mapRegionsOf(regionDeps, guild);
  const look = await regionDeps.gates.memberGates(
    guild,
    userId,
    regions.map((region) => region.gateId),
    fresh,
  );
  if (!look) return undefined;
  const { selfRoles } = regionDeps;
  let roster: Roster | undefined;
  if (selfRoles) {
    try {
      roster = await selfRoles.roster(guild);
    } catch (err) {
      // The view says how the member stands without what to join (the database being away).
      deps.log.warn({ err, guild }, 'could not read the self-assignable roles for the map');
    }
  }
  const held = new Set(
    selfRoles && roster
      ? selfRoles.heldNow(guild, { id: userId, held: look.held, seenAt: look.fetchedAt })
      : look.held,
  );
  const now = deps.now();
  const words = (text: string): string => pageWords(text, deps.parties.zone, now);
  return {
    readOnly: false,
    roles: selfRoles !== undefined,
    regions: regionChoices(regions, look, roster, held).map((choice): RegionMineView => ({
      id: choice.regionId,
      access: choice.access,
      join: choice.join.map((join) => ({
        roleId: join.entry.role?.id ?? '',
        name: join.entry.name,
        alsoOpens: join.alsoOpens,
        alsoLeaves: {
          roles: join.alsoLeaves.entries.map((entry) => entry.name),
          regions: join.alsoLeaves.regions,
        },
        stuck:
          join.stuck === undefined
            ? null
            : words(memberProblem(roleText(join.entry.name), join.stuck)),
      })),
      leave: choice.leave.map((leave) => ({
        roleId: leave.entry.role?.id ?? '',
        name: leave.entry.name,
        closes: leave.closes,
        alsoCloses: leave.alsoCloses,
        stillOpenBy: [
          ...leave.stillOpenBy.entries.map((entry) => entry.name),
          ...(leave.stillOpenBy.staffRole ? [STAFF_ROLE] : []),
        ],
      })),
    })),
  };
}

/**
 * "Your regions" on the live map (plan 8M-20): `GET /s/<guild>/api/regions/mine`, how the member
 * stands to each region of the map on Discord and the roles that would open or close it, for
 * members only (R7: `askedMembership`, as `/api/activity`: 401, 403, 503), its own limit per
 * address. While Discord cannot say, read-only and nothing of the regions (R8).
 */
export function regionRoutes(scope: FastifyInstance, deps: WebDeps, viewers: PartyViewers): void {
  const { sessions } = deps;
  const limiter = new RateLimiter({ uses: REGIONS_PER_MINUTE, perMs: 60_000 });
  scope.get(
    '/api/regions/mine',
    { onRequest: limitedPerAddress(limiter, { now: deps.now }) },
    async (request: GuildRequest, reply) => {
      void reply.header('cache-control', 'private, no-store');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 401);
      const { guild } = request.params;
      const member = await viewers.askedMembership(guild, session.userId);
      if (member.kind === 'not-member') return sendFailure(request, reply, 403);
      if (member.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
      const roles = deps.regions.selfRoles !== undefined;
      const readOnly: RegionsMineView = { readOnly: true, roles, regions: [] };
      if (member.readOnly) return readOnly;
      try {
        // As the member directory's look (paced, kept a minute) left the member in the cache (A1).
        const view = await regionsView(deps, guild, session.userId, false);
        return view ?? sendFailure(request, reply, 403);
      } catch (err) {
        deps.log.warn(
          { err, guild, user: session.userId },
          'could not ask Discord how a member on the web pages stands to the regions',
        );
        return readOnly;
      }
    },
  );
}
