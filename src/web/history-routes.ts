import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ActivityReader } from '../db/repositories/activity-repository.js';
import type { Region } from '../db/repositories/region-repository.js';
import {
  activityMonths,
  activityWeights,
  activityWhen,
  activityWindow,
  nextActivityHour,
  type ActivityMode,
} from '../domain/history/activity.js';
import { BOARD_PERIODS, boardTitle } from '../domain/history/board-periods.js';
import { keptOut } from '../domain/history/region-board.js';
import { ACTIVITY_MODES, type ActivityView } from '../domain/web/activity-data.js';
import type { RegionBoardView } from '../domain/web/region-board-data.js';
import type { RegionBoards } from '../services/region-boards.js';
import { sendFailure } from './answers.js';
import { etagMatches, etagOf } from './geo-cache.js';
import type { GuildRequest } from './guild-routes.js';
import { UNCONFIRMED } from './party-routes.js';
import type { PartyViewers } from './party-viewers.js';
import { limitedPerAddress, RateLimiter } from './rate-limit.js';
import type { WebDeps } from './server.js';

/** What the activity heatmap of the live map reads (plan 8H-4). */
export interface ActivityWebDeps {
  /** The buckets (`ActivityRepository`). */
  reader: ActivityReader;
  /** The regions, whose forums say who may see their parties (`RegionDirectory`). */
  regions: { all(): readonly Region[] };
  /** The gyms as the map has them (`GymDirectory`): a gym no longer listed is left out. */
  gyms: { get(id: number): { lat: number; lon: number } | undefined };
  /** The kept Wayspots (`WayspotDirectory`): a Power Spot no longer kept is left out. */
  wayspots: { byId(id: string): { lat: number; lon: number } | undefined };
  /** `settings.timezone`: the buckets' months, weekdays and hours. */
  zone: string;
  /** The region board (plan 8H-5): `/stats regions`' own path (`RegionBoards.board`). */
  boards: Pick<RegionBoards, 'board'>;
  /** A region's channel by name, as the bot sees it; undefined for one it does not. */
  channelName: (channelId: string) => string | undefined;
}

/**
 * The requests for a server's region board one address may make in a minute: the page asks once
 * per period a member picks (review of the brief: 60, as a page of tabs needs no more).
 */
export const BOARD_PER_MINUTE = 60;

/**
 * Whether a member's forum keeps a region's activity and board lines from them: the domain's
 * `keptOut` (Matt, 2026-11-05, R-B), of how `PartyViewers` found them to stand to it.
 */
function keptOutOf(viewer: { barred: Set<string>; hidden: Set<string> }, forum: string): boolean {
  return keptOut(
    viewer.barred.has(forum) ? 'barred' : viewer.hidden.has(forum) ? 'hidden' : 'visible',
  );
}

/** `?period=month|year|all`, this month by default. */
const boardQuery = z.object({ period: z.enum(BOARD_PERIODS).default('month') }).strict();

/**
 * The requests for a server's activity one address may make in a minute: the page asks once a
 * mode, a slider's step or an hour, and History's Play at most a step a second (the next asked a
 * second after the last answer was drawn), so that Play through every month since 2018 fits with
 * room for the rest (review P1). No cache on the server: each answer is one indexed read.
 */
export const ACTIVITY_PER_MINUTE = 180;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/u;

/** `?mode=now|evenings|weekend|history&year=|month=`: History with one year or one month, else neither. */
const activityQuery = z
  .object({
    mode: z.enum(ACTIVITY_MODES).default('now'),
    year: z
      .string()
      .regex(/^\d{4}$/u)
      .optional(),
    month: z.string().regex(MONTH).optional(),
  })
  .strict()
  .transform((query, context): ActivityMode => {
    const { mode, year, month } = query;
    if (mode !== 'history') {
      if (year === undefined && month === undefined) return { kind: mode };
    } else if (year !== undefined && month === undefined) {
      return { kind: 'history', year: Number(year) };
    } else if (month !== undefined && year === undefined) {
      return { kind: 'history', month };
    }
    context.addIssue({ code: 'custom', message: 'History takes one year or one month' });
    return z.NEVER;
  });

/**
 * The party history on the live map (plan 8H-4, design Part B): the activity heatmap, `GET
 * /s/<guild>/api/activity`. For members only, as every layer but the gyms and the outlines:
 * membership is asked before anything of the server is read (`askedMembership`), the forums of
 * the buckets' regions after (`PartyViewers`, shared with the parties: a region whose forum keeps
 * the member out, or that their roles do not show them, is left out; R-B, `keptOutOf`). The weights are the
 * domain's (`activityWeights`); a gym or Power Spot is placed where the map has it now, and one
 * it no longer has counts among those left out. An ETag of the member's JSON, `private, no-cache`.
 */
export function historyRoutes(scope: FastifyInstance, deps: WebDeps, viewers: PartyViewers): void {
  const { sessions, activity } = deps;
  const limiter = new RateLimiter({ uses: ACTIVITY_PER_MINUTE, perMs: 60_000 });
  scope.get(
    '/api/activity',
    { onRequest: limitedPerAddress(limiter, { now: deps.now }) },
    async (request: GuildRequest, reply) => {
      void reply.header('cache-control', 'private, no-cache');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 401);
      const query = activityQuery.safeParse(request.query ?? {});
      if (!query.success) return sendFailure(request, reply, 400);
      const { guild } = request.params;
      // Nothing of the server is read for somebody who is no member of it.
      const member = await viewers.askedMembership(guild, session.userId);
      if (member.kind === 'not-member') return sendFailure(request, reply, 403);
      if (member.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
      const mode = query.data;
      const now = deps.now();
      const { zone } = activity;
      const [buckets, months] = await Promise.all([
        activity.reader.buckets(guild, activityWindow(mode, now, zone)),
        activity.reader.months(guild),
      ]);
      const forumOf = new Map(
        activity.regions.all().map((region) => [region.id, region.forumChannelId]),
      );
      const forums = [
        ...new Set(
          buckets.flatMap((bucket) => {
            const forum = forumOf.get(bucket.regionId);
            return forum === undefined || forum === null ? [] : [forum];
          }),
        ),
      ];
      const viewer = await viewers.viewer(guild, session.userId, forums, member);
      if (viewer.kind === 'not-member') return sendFailure(request, reply, 403);
      if (viewer.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
      // Only an existing forum keeps out (`PartyGateway.memberAccess`): a region of 0 (a record
      // without one), a region no longer in the directory (deleted since, its forum with it) and
      // one without a forum are seen by every member and counted normally (the controller's
      // ruling, 8H4-1). A forum the member is kept out of or not shown by their roles keeps them
      // out alike (Matt, 2026-11-05, R-B: the region board's rule, `keptOutOf`).
      const seen = buckets.filter((bucket) => {
        const forum = forumOf.get(bucket.regionId);
        return forum === undefined || forum === null || !keptOutOf(viewer, forum);
      });
      const pointOf = (kind: 'gym' | 'spot', id: string) =>
        kind === 'gym' ? activity.gyms.get(Number(id)) : activity.wayspots.byId(id);
      const weights = activityWeights(
        seen,
        mode,
        now,
        zone,
        (kind, id) => pointOf(kind, id) !== undefined,
      );
      const view: ActivityView = {
        mode: mode.kind,
        weekday: mode.kind === 'now' ? activityWhen(now, zone).weekday : null,
        places: weights.places.flatMap((place) => {
          const point = pointOf(place.kind, place.id);
          return point === undefined ? [] : [{ ...place, lat: point.lat, lon: point.lon }];
        }),
        leftOut: weights.leftOut,
        // Bounded to the game's launch and this month: one bad time stretches no slider (8H4-3).
        months: activityMonths(months, now, zone),
        // How long until the window moves on, not when: a page whose clock runs fast would
        // otherwise ask again and again (review P5).
        changesInMs: mode.kind === 'now' ? nextActivityHour(now, zone) - now : null,
      };
      const body = JSON.stringify(view);
      const etag = etagOf(body);
      void reply.header('etag', etag);
      if (etagMatches(request.headers['if-none-match'], etag)) return reply.code(304).send();
      return reply.type('application/json; charset=utf-8').send(body);
    },
  );

  // The region board (plan 8H-5, design Part C): `/stats regions`' board as the member may see
  // it, for the history page. Shaped as /api/activity: membership first, then the forums of the
  // server's regions (`PartyViewers`: an existing forum that keeps the member out, or that their
  // roles do not show them, leaves its region out of every line and the total; R-B); regions gone and records without one are "No
  // longer a region", seen by everyone.
  const boardLimiter = new RateLimiter({ uses: BOARD_PER_MINUTE, perMs: 60_000 });
  scope.get(
    '/api/stats/regions',
    { onRequest: limitedPerAddress(boardLimiter, { now: deps.now }) },
    async (request: GuildRequest, reply) => {
      void reply.header('cache-control', 'private, no-cache');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 401);
      const query = boardQuery.safeParse(request.query ?? {});
      if (!query.success) return sendFailure(request, reply, 400);
      const { guild } = request.params;
      const member = await viewers.askedMembership(guild, session.userId);
      if (member.kind === 'not-member') return sendFailure(request, reply, 403);
      if (member.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
      // What the forums say of the member, asked once the server's regions are known.
      let refused: 'not-member' | 'unconfirmed' | undefined;
      const shown = await activity.boards.board(
        guild,
        query.data.period,
        deps.now(),
        async (regions) => {
          const forums = regions.flatMap((region) =>
            region.forumChannelId === null ? [] : [region.forumChannelId],
          );
          const viewer = await viewers.viewer(guild, session.userId, forums, member);
          if (viewer.kind !== 'member') {
            refused = viewer.kind;
            return new Set(regions.map((region) => region.id));
          }
          return new Set(
            regions
              .filter(
                (region) =>
                  region.forumChannelId !== null && keptOutOf(viewer, region.forumChannelId),
              )
              .map((region) => region.id),
          );
        },
      );
      if (refused === 'not-member') return sendFailure(request, reply, 403);
      if (refused === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
      const nameOf = (regionId: number): string => {
        const region = shown.regions.get(regionId);
        const name = region === undefined ? undefined : activity.channelName(region.channelId);
        return name === undefined ? `Region ${regionId}` : `#${name}`;
      };
      const view: RegionBoardView = {
        period: shown.period,
        title: boardTitle(shown.period),
        rows: shown.board.rows.map((row) => ({
          name: nameOf(row.regionId),
          raids: row.raids,
          maxes: row.maxes,
        })),
        gone: shown.board.gone,
        total: shown.board.total,
      };
      const body = JSON.stringify(view);
      const etag = etagOf(body);
      void reply.header('etag', etag);
      if (etagMatches(request.headers['if-none-match'], etag)) return reply.code(304).send();
      return reply.type('application/json; charset=utf-8').send(body);
    },
  );
}
