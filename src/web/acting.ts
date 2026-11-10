import type { FastifyReply, FastifyRequest } from 'fastify';
import { isBotManagement, isManagement } from '../discord/guards.js';
import type { MemberStanding } from '../discord/member-directory.js';
import { UserError } from '../discord/errors.js';
import { controlThrottleKey, variedThrottleKey } from '../discord/router.js';
import { waitText, type Throttle } from '../discord/throttle.js';
import type { Member } from '../services/attendance-service.js';
import { sendFailure } from './answers.js';
import { countsOnTheMap } from './map-members.js';
import type { WebDeps } from './server.js';

/** What a write on the map answers while Discord cannot say who writes. */
export const UNREACHABLE =
  'Discord cannot be reached just now, so nothing can be changed. Try again in a moment.';

/** The writes one member may send the map in a minute, counted before the forced fetch (plan 8Z). */
export const MAP_WRITES_PER_MINUTE = 60;

/** What a write answers past `MAP_WRITES_PER_MINUTE`. */
export const MAP_WRITES_FULL = 'That was a lot of changes in a minute. Try again in a moment.';

/** What staff's Delete… on the map answers a member who may not press it (plan 8Z). */
export const DELETE_NEEDS_MANAGE_MESSAGES =
  'Only admins and moderators with the Manage Messages permission can do that.';

/** What a write answers a member who may not act in the server now. */
const HELD_BACK: Readonly<Record<'timed-out' | 'pending', string>> = {
  'timed-out': 'You are timed out in this server, so you cannot do that now.',
  pending: "Finish this server's membership screening first.",
};

/**
 * Who writes on the map, as Discord has them now (plans 8M-3, 8M-4): a member who may act, with
 * their roles; or the answer already sent.
 */
export type Acting =
  | {
      member: Member;
      standing: MemberStanding;
      /** The ids of the roles they hold, without everybody's (plan 8M-20, R2). */
      roleIds: readonly string[];
      /** When Discord's answer came: what `roleIds` is of. */
      fetchedAt: number;
    }
  | { sent: FastifyReply };

/**
 * The checks of every write of a member on the map, in this order (spec 2.5): whether they are
 * a member (the member directory, kept a minute, also "not a member", and with the map's member
 * role one without it: 403 without asking Discord anything more, so that a non-member's writes
 * cost no fetch); `MAP_WRITES_PER_MINUTE` of the member (429, plan 8Z: before the fetch, and a
 * form's opening counts as a write does); the member fetched fresh, the answer shared for 2
 * seconds (`ActingMembers`: not in the server, or without the
 * map's member role, 403 whatever they name, so that nobody but a member learns which ids
 * exist; timed out or not through the membership screening 403 in words of their own; Discord
 * unreachable 503, logged with `doing`). None of these counts against a throttle.
 */
export async function actingOnTheMap(
  deps: WebDeps,
  request: FastifyRequest,
  reply: FastifyReply,
  guild: string,
  userId: string,
  doing: string,
): Promise<Acting> {
  let acting;
  try {
    if (!(await deps.members.find(guild, userId))) {
      return { sent: sendFailure(request, reply, 403) };
    }
    const allowed = deps.mapWrites.take(userId, deps.now());
    if (!allowed.ok) {
      return {
        sent: reply
          .code(429)
          .header('retry-after', String(allowed.retryAfterSeconds))
          .header('cache-control', 'no-store')
          .send({ error: MAP_WRITES_FULL }),
      };
    }
    acting = await deps.parties.acting.acting(guild, userId);
  } catch (err) {
    deps.log.warn(
      { err, guild, user: userId },
      `could not ask Discord who ${doing} on the web pages`,
    );
    return { sent: reply.code(503).send({ error: UNREACHABLE }) };
  }
  if (acting.kind === 'not-member') return { sent: sendFailure(request, reply, 403) };
  if (acting.kind === 'member' && !countsOnTheMap(acting.standing, deps.settings.memberRole)) {
    return { sent: sendFailure(request, reply, 403) };
  }
  if (acting.kind !== 'member') {
    return { sent: reply.code(403).send({ error: HELD_BACK[acting.kind] }) };
  }
  return {
    member: acting.member,
    standing: acting.standing,
    roleIds: acting.roleIds,
    fetchedAt: acting.fetchedAt,
  };
}

/**
 * Whether somebody is a member who counts on the map, for a GET of a member's data (the pick
 * lists of the forms): the member directory, kept a minute (403 for none, 503 while Discord
 * cannot say); the answer already sent if not.
 */
export async function memberOrFailure(
  deps: WebDeps,
  request: FastifyRequest,
  reply: FastifyReply,
  guild: string,
  userId: string,
): Promise<FastifyReply | undefined> {
  try {
    if (!(await deps.members.find(guild, userId))) return sendFailure(request, reply, 403);
  } catch (err) {
    deps.log.warn(
      { err, guild, user: userId },
      'could not ask whether somebody on the web pages is a member',
    );
    return sendFailure(request, reply, 503);
  }
  return undefined;
}

/**
 * Discord could not say how a member stands to a forum: nothing is written (503, logged with
 * `doing`).
 */
export function unreachableOnTheMap(
  deps: WebDeps,
  reply: FastifyReply,
  err: unknown,
  guild: string,
  userId: string,
  doing: string,
): FastifyReply {
  deps.log.warn(
    { err, guild, user: userId },
    `could not ask Discord who ${doing} on the web pages`,
  );
  return reply.code(503).send({ error: UNREACHABLE });
}

/**
 * Whether a member is staff of the server on the map, as the commands' guards decide it
 * (`isManagement`: an admin or a moderator by role, or the bot's owner): staff may change any
 * raid (plan 8M-4). A member whose roles are not known has none.
 */
export function isMapStaff(
  standing: MemberStanding | undefined,
  userId: string,
  ownerId: string,
): boolean {
  return isManagement(standing?.roleNames ?? [], userId, ownerId);
}

/**
 * Whether a member may press staff's Delete… on the map (plan 8Z): staff who also have Manage
 * Messages, the bot's owner by themselves as in the guards. Other staff writes ask `isMapStaff`.
 */
export function mayDeleteOnTheMap(
  standing: MemberStanding | undefined,
  userId: string,
  ownerId: string,
): boolean {
  return (
    userId === ownerId ||
    (isMapStaff(standing, userId, ownerId) && standing?.manageMessages === true)
  );
}

/**
 * Whether a member is staff of the server as `/route clear` has it (`isBotManagement`: also a
 * bot developer by role), for clearing a train's route on the map (plan 8M-5).
 */
export function isMapBotStaff(
  standing: MemberStanding | undefined,
  userId: string,
  ownerId: string,
): boolean {
  return isBotManagement(standing?.roleNames ?? [], userId, ownerId);
}

/**
 * Gives back a use `throttledOnTheMap` counted in a command's window, as the router gives back
 * the use of a command whose work failed unexpectedly (plan 8S-3: a meetup whose post Discord
 * refused), to the window open at `countedAt` (when it was counted) only. `window` is the window's
 * key, or what `throttledOnTheMap` counted in (`MapThrottleKey`, the router's key made of it).
 */
export function givenBackOnTheMap(
  deps: WebDeps,
  window: string | MapThrottleKey,
  userId: string,
  throttle: Throttle,
  countedAt: number,
): void {
  const key = typeof window === 'string' ? window : windowOf(window, throttle);
  deps.parties.throttles.giveBack(key, userId, throttle, deps.now(), countedAt);
}

/** The router's window a write on the map counts in: a command's (its name) or a control's. */
export type MapThrottleKey = { command: string; varies?: boolean } | { control: string };

/** The router's key of the window `key` names, for `throttle`. */
function windowOf(key: MapThrottleKey, throttle: Throttle): string {
  return 'command' in key
    ? key.varies === true
      ? variedThrottleKey(key.command, throttle)
      : key.command
    : controlThrottleKey(key.control);
}

/**
 * Runs the work of a write `throttledOnTheMap` has just counted, as the router runs a counted
 * use: an unexpected error, or a `UserError` with `givesBack`, gives the use back (to the window
 * open when it was counted) and is thrown on; a refusal is the member's and stays counted.
 */
export async function countedOnTheMap<T>(
  deps: WebDeps,
  key: MapThrottleKey,
  userId: string,
  throttle: Throttle,
  work: () => Promise<T>,
): Promise<T> {
  const countedAt = deps.now();
  try {
    return await work();
  } catch (err) {
    if (!(err instanceof UserError) || err.givesBack) {
      const window = windowOf(key, throttle);
      deps.parties.throttles.giveBack(window, userId, throttle, deps.now(), countedAt);
    }
    throw err;
  }
}

/**
 * Counts a write of the member in the router's window of a command (its name) or a control
 * (`controlThrottleKey`), as a use there counts: undefined when it may go on, or the answer sent
 * (429 with `Retry-After`, and no command named, as the member typed none: Matt, 2026-10-30).
 * `varies`: the command's
 * limit depends on where it is used (`/meet`), and the router counts this limit apart
 * (`variedThrottleKey`). Its work runs in `countedOnTheMap`, or gives the use back itself
 * (`givenBackOnTheMap`). With `count` false it only asks whether the window has a use left, as
 * the router refuses a command before its dialog opens (`/max`'s ending-soon question).
 */
export function throttledOnTheMap(
  deps: WebDeps,
  reply: FastifyReply,
  key: MapThrottleKey,
  userId: string,
  throttle: Throttle,
  { count = true }: { count?: boolean } = {},
): FastifyReply | undefined {
  const counted = windowOf(key, throttle);
  const { throttles } = deps.parties;
  const wait = count
    ? throttles.use(counted, userId, throttle, deps.now())
    : throttles.wait(counted, userId, throttle, deps.now());
  if (wait === undefined) return undefined;
  const error =
    'command' in key
      ? `You can do that again in ${waitText(wait)}.`
      : `That was a lot of clicks. Try again in ${waitText(wait)}.`;
  return reply.code(429).header('retry-after', String(wait)).send({ error });
}
