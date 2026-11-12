import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { COULD_NOT_CHANGE } from '../commands/roles/menus.js';
import { roleText, ROLES_UNAVAILABLE, STILL_WORKING } from '../commands/roles/shared.js';
import { gaveWords, memberProblem, tookWords } from '../commands/roles/words.js';
import type { Region } from '../db/repositories/region-repository.js';
import { isSnowflake } from '../db/snowflake.js';
import type { PartyGateway } from '../discord/party-gateway.js';
import { MEMBER_WRITE_THROTTLE } from '../discord/throttle.js';
import { regionGate } from '../domain/history/region-tally.js';
import { hasOutline } from '../domain/web/geo-view.js';
import { regionChoices, type RegionChoice, type RegionGate } from '../domain/roles/region-roles.js';
import type { Roster } from '../domain/roles/self-roles.js';
import type {
  RegionChangeAnswer,
  RegionMineView,
  RegionsMineView,
} from '../domain/web/region-data.js';
import { ROLES_KIND } from '../render/role-menus.js';
import type { SelfRoleService } from '../services/self-role-service.js';
import {
  actingOnTheMap,
  countedOnTheMap,
  throttledOnTheMap,
  unreachableOnTheMap,
} from './acting.js';
import { sendFailure } from './answers.js';
import { postGuard } from './csrf.js';
import type { GuildRequest } from './guild-routes.js';
import { pageWords } from './page-words.js';
import { UNCONFIRMED } from './party-routes.js';
import type { PartyViewers } from './party-viewers.js';
import { limitedPerAddress, limitedRead, RateLimiter } from './rate-limit.js';
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
   * without them. A server whose `features.roles` is off (plan 19A-1) is as without them (R6: the
   * view says access alone, the writes are 404).
   */
  selfRoles: Pick<SelfRoleService, 'roster' | 'heldNow' | 'change'> | undefined;
}

/** The asks of "Your regions" one address may make in a minute: as many as the parties'. */
export const REGIONS_PER_MINUTE = 120;

/** The joins and leaves one address may send in a minute, whoever sends them. */
export const REGION_WRITES_PER_ADDRESS_MINUTE = 30;

/** What a join answers where the member sees the region on Discord already. */
export const SEEN_ALREADY = 'You see this region on Discord already.';
/** What a join or leave answers for a role that does not open the region (any more). */
export const NOT_AN_OPENER = 'That role no longer opens this region.';
/** What a join answers where somebody keeps the member out of the region (R4). */
export const KEPT_OUT = 'Somebody keeps you out of this region on Discord: ask staff.';

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

/** How a member stands to the regions now, as `regionsNow` found it. */
interface RegionsNow {
  /** The regions' gates, every one of the map's. */
  gates: string[];
  /** Per region whose gate the bot sees (`regionChoices`). */
  choices: RegionChoice[];
  /** The roster read, or undefined (roles off, or the server's roles unknown). */
  roster: Roster | undefined;
  view: RegionsMineView;
}

/** Said of a role that keeps a region open and is not self-assignable (A2). */
const STAFF_ROLE = 'a role staff gave you';

/**
 * The member's view of the server's regions (R1, R2, R12): the member looked at once (`fresh`:
 * afresh from Discord, else as the cache has them: after the member directory's look, or after
 * the forced fetch of a write), what they hold with this service's later changes laid over
 * (`heldNow`, as `/iam` plans; `member`: the roles of the write's own fetch, A3, so that the plan
 * checked is the plan carried out), and per region the choices of `regionChoices`, the roles
 * named as Discord has them and a stuck join in `/iam`'s words. Undefined for somebody who is not
 * in the server; rejects when Discord cannot say.
 */
async function regionsNow(
  deps: WebDeps,
  guild: string,
  userId: string,
  fresh: boolean,
  member?: { held: readonly string[]; seenAt: number },
): Promise<RegionsNow | undefined> {
  const { regions: regionDeps } = deps;
  const { regions } = await mapRegionsOf(regionDeps, guild);
  const gates = regions.map((region) => region.gateId);
  const look = await regionDeps.gates.memberGates(guild, userId, gates, fresh);
  if (!look) return undefined;
  // Only where the server's members give themselves roles (plan 19A-1, its `features.roles`).
  const selfRoles = deps.serverSettings.of(guild).features.roles ? regionDeps.selfRoles : undefined;
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
      ? selfRoles.heldNow(guild, {
          id: userId,
          held: member?.held ?? look.held,
          seenAt: member?.seenAt ?? look.fetchedAt,
        })
      : (member?.held ?? look.held),
  );
  const now = deps.now();
  const words = (text: string): string => pageWords(text, deps.parties.zone, now);
  const choices = regionChoices(regions, look, roster, held);
  const view: RegionsMineView = {
    readOnly: false,
    roles: selfRoles !== undefined,
    regions: choices.map((choice): RegionMineView => ({
      id: choice.regionId,
      access: choice.access,
      listed: choice.listed,
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
  return { gates, choices, roster, view };
}

/** The body of a join or leave: the role, by its id. */
const changeBody = z.object({ role: z.string().refine(isSnowflake) }).strict();

type ChangeRequest = FastifyRequest<{
  Params: { guild: string; region: string; action: string };
  Body: unknown;
}>;

/**
 * "Your regions" on the live map (plan 8M-20).
 *
 * `GET /s/<guild>/api/regions/mine`: how the member stands to each region of the map on Discord
 * and the roles that would open or close it, for members only (R7: `askedMembership`, as
 * `/api/activity`: 401, 403, 503), its own limit per address. While Discord cannot say, read-only
 * and nothing of the regions (R8).
 *
 * `POST /s/<guild>/api/regions/<region id>/join|leave`, body `{ role }`, only where
 * `settings.features.roles` is on (R6): the per-address limit and `postGuard` before the body is
 * read; who writes as every write on the map (`actingOnTheMap`: a member who counts, not timed
 * out, through the screening, fetched afresh); the member and the gates from that fetch
 * (`memberGates`, cached): a region kept out of 403 (R4), a join where it is seen 409, a role that
 * is not among the region's joins or leaves now 409; only then the role menus' window (R7:
 * `ROLES_KIND`, `MEMBER_WRITE_THROTTLE`); then `selfRoles.change`, `/iam`'s one path, answered in
 * `/iam`'s words (R5). After a change that gave or took something, what the map's viewers said of
 * the member and the gates is forgotten and the view comes from the member fetched afresh (R3).
 */
export function regionRoutes(scope: FastifyInstance, deps: WebDeps, viewers: PartyViewers): void {
  const { sessions } = deps;
  scope.get(
    '/api/regions/mine',
    { onRequest: limitedRead(REGIONS_PER_MINUTE, deps) },
    async (request: GuildRequest, reply) => {
      void reply.header('cache-control', 'private, no-store');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 401);
      const { guild } = request.params;
      const member = await viewers.askedMembership(guild, session.userId);
      if (member.kind === 'not-member') return sendFailure(request, reply, 403);
      if (member.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
      const roles =
        deps.regions.selfRoles !== undefined && deps.serverSettings.of(guild).features.roles;
      const readOnly: RegionsMineView = { readOnly: true, roles, regions: [] };
      if (member.readOnly) return readOnly;
      try {
        // As the member directory's look (paced, kept a minute) left the member in the cache (A1).
        const now = await regionsNow(deps, guild, session.userId, false);
        return now?.view ?? sendFailure(request, reply, 403);
      } catch (err) {
        deps.log.warn(
          { err, guild, user: session.userId },
          'could not ask Discord how a member on the web pages stands to the regions',
        );
        return readOnly;
      }
    },
  );

  const { selfRoles } = deps.regions;
  // Joining and leaving are self-assigned roles: without them there is nothing here (R6).
  if (!selfRoles) return;
  const writeLimiter = new RateLimiter({ uses: REGION_WRITES_PER_ADDRESS_MINUTE, perMs: 60_000 });
  const known = async (request: ChangeRequest, reply: FastifyReply) => {
    const { region, action } = request.params;
    if (!/^\d{1,10}$/u.test(region) || (action !== 'join' && action !== 'leave')) {
      return sendFailure(request, reply, 404);
    }
    // A server whose members give themselves no roles has nothing here (R6, plan 19A-1).
    if (!deps.serverSettings.of(request.params.guild).features.roles) {
      return sendFailure(request, reply, 404);
    }
  };
  const refuse = (reply: FastifyReply, status: number, error: string) =>
    reply.code(status).send({ error });
  scope.post(
    '/api/regions/:region/:action',
    {
      onRequest: [
        limitedPerAddress(writeLimiter, { now: deps.now }),
        postGuard(sessions, deps.settings.publicUrl),
        known,
      ],
    },
    async (request: ChangeRequest, reply) => {
      void reply.header('cache-control', 'no-store');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 403);
      const body = changeBody.safeParse(request.body ?? {});
      if (!body.success) return sendFailure(request, reply, 400);
      const { guild } = request.params;
      const regionId = Number(request.params.region);
      const joining = request.params.action === 'join';
      const { role } = body.data;
      const { userId } = session;
      const noted = <T>(outcome: string, sent: T): T => {
        deps.log.info(
          { user: userId, guild, region: regionId, action: request.params.action, outcome },
          'a region role was changed on the map',
        );
        return sent;
      };
      const doing = joining ? 'joins a region' : 'leaves a region';
      const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
      if ('sent' in acting) return acting.sent;
      let before: RegionsNow | undefined;
      try {
        // As the forced fetch of `actingOnTheMap` left the member in the cache, planned over
        // the roles of that fetch, as the change is (A3).
        before = await regionsNow(deps, guild, userId, false, {
          held: acting.roleIds,
          seenAt: acting.fetchedAt,
        });
      } catch (err) {
        return unreachableOnTheMap(deps, reply, err, guild, userId, doing);
      }
      if (!before) return sendFailure(request, reply, 403);
      const choice = before.choices.find((one) => one.regionId === regionId);
      if (!choice) return sendFailure(request, reply, 404);
      if (!before.roster) return noted('unavailable', refuse(reply, 503, ROLES_UNAVAILABLE));
      if (joining && choice.access === 'barred')
        return noted('barred', refuse(reply, 403, KEPT_OUT));
      if (joining && choice.access === 'visible') {
        return noted('seen', refuse(reply, 409, SEEN_ALREADY));
      }
      const entry = (joining ? choice.join : choice.leave).find(
        (one) => one.entry.role?.id === role,
      )?.entry;
      if (!entry) return noted('not-an-opener', refuse(reply, 409, NOT_AN_OPENER));
      const key = { control: ROLES_KIND };
      const throttled = throttledOnTheMap(deps, reply, key, userId, MEMBER_WRITE_THROTTLE);
      if (throttled) return noted('throttled', throttled);
      let outcome;
      try {
        outcome = await countedOnTheMap(deps, key, userId, MEMBER_WRITE_THROTTLE, () =>
          selfRoles.change(
            guild,
            { id: userId, held: acting.roleIds, seenAt: acting.fetchedAt },
            joining ? { give: [role], take: [] } : { give: [], take: [role] },
          ),
        );
      } catch (err) {
        // The service throws only while nothing is known to be done; the use was given back.
        deps.log.warn({ err, guild, user: userId }, 'could not change a region role on the map');
        return noted('failed', refuse(reply, 503, COULD_NOT_CHANGE));
      }
      if (outcome.kind === 'unavailable') {
        return noted('unavailable', refuse(reply, 503, ROLES_UNAVAILABLE));
      }
      if (outcome.kind === 'refused') {
        // A change that waited past its time was dropped unseen: nothing was done (A5).
        return outcome.reason === 'busy'
          ? noted('busy', refuse(reply, 409, STILL_WORKING))
          : noted('expired', refuse(reply, 503, COULD_NOT_CHANGE));
      }
      const name = roleText(entry.name);
      const said = joining ? gaveWords(name, entry.group?.name, outcome) : tookWords(name, outcome);
      const text = pageWords(said.text, deps.parties.zone, deps.now());
      if (said.refused) {
        const answer: RegionChangeAnswer = { ok: false, outcome: 'refused', text };
        return noted('skipped', reply.code(422).send(answer));
      }
      const changed = outcome.given.length + outcome.taken.length > 0;
      let view: RegionsMineView | undefined;
      try {
        view = changed ? (await regionsNow(deps, guild, userId, true))?.view : before.view;
      } catch (err) {
        deps.log.warn(
          { err, guild, user: userId },
          'could not ask Discord how a member on the web pages stands to the regions',
        );
      }
      if (changed) {
        // What the map said of the member and the gates no longer stands (R3), forgotten after
        // the fresh fetch (A4), which put the member as they are now into the cache the viewers'
        // next look reads. The member directory's minute is left alone: a staff role is never
        // self-assignable (`roleProblem`), and a member who gives up the map's member role is
        // refused at their next write, which judges the member fetched afresh.
        // A party they are in keeps its forum in their sight (B5, W2): the service's own path
        // (`onRolesTaken`) has the access service settle it, as for `/iamnot` and the menus.
        viewers.forget(userId, before.gates);
      }
      const answer: RegionChangeAnswer = {
        ok: outcome.kind === 'done',
        outcome: outcome.kind,
        text,
        ...(view === undefined ? {} : { view }),
      };
      return noted(outcome.kind, reply.send(answer));
    },
  );
}
