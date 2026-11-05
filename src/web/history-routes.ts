import type { FastifyInstance, FastifyReply } from 'fastify';
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
import { TALLY_PERIODS, tallyTitle } from '../domain/history/tally-periods.js';
import { keptOut, regionGate } from '../domain/history/region-tally.js';
import { ACTIVITY_MODES, type ActivityView } from '../domain/web/activity-data.js';
import type { RegionTallyView } from '../domain/web/region-tally-data.js';
import type { BoardsView, BoardView, MemberStatsView } from '../domain/web/board-data.js';
import {
  BOARDS,
  boardCountWords,
  boardTitle,
  emptyBoardText,
  wantedDayText,
} from '../domain/history/board-words.js';
import { viewerText } from '../render/boards.js';
import { memberStatsTitle, NOT_OPTED_IN, nothingInYear } from '../render/member-stats.js';
import type { Boards, ShownBoard } from '../services/boards.js';
import type { MemberStatsService } from '../services/member-stats.js';
import { pageWords } from './page-words.js';
import type { RegionTallies } from '../services/region-tallies.js';
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
  /** The region tally (plan 8H-5): `/stats regions`' own path (`RegionTallies.tally`). */
  tallies: Pick<RegionTallies, 'tally'>;
  /** A region's channel by name, as the bot sees it; undefined for one it does not. */
  channelName: (channelId: string) => string | undefined;
  /** The boards (plan 8H-6): `/stats boards`' own path (`Boards.board`). */
  boards: Pick<Boards, 'board'>;
  /** A member's own stats (plan 8H-6): `/stats me`'s own path (`MemberStatsService.stats`). */
  memberStats: Pick<MemberStatsService, 'stats'>;
  /** The catalogue's name of a boss by its key, for "Your Pine"'s bosses. */
  bossName: (bossKey: string) => string | undefined;
}

/**
 * The requests for a server's boards, or a member's own stats, one address may make in a
 * minute: as many as the region tally's, a page of tabs needing no more.
 */
export const BOARDS_PER_MINUTE = 60;

/** `?year=2026`, all time without. */
const meQuery = z
  .object({
    year: z
      .string()
      .regex(/^\d{4}$/u)
      .transform(Number)
      .optional(),
  })
  .strict();

/** A board as the web shows it, in the words of `/stats boards` (`render/boards.ts`'s rules). */
function boardView(shown: ShownBoard, words: (text: string) => string): BoardView {
  const rows =
    shown.kind === 'people'
      ? shown.rows.map((row) => ({
          rank: row.rank,
          name: row.name,
          count: boardCountWords(shown.board, row.count, row.confirmations),
        }))
      : shown.rows.map((row) => ({
          rank: row.rank,
          name: row.name,
          count: boardCountWords(shown.board, row.count),
        }));
  const day = shown.kind === 'things' ? shown.day : undefined;
  return {
    board: shown.board,
    title: boardTitle(shown.board, shown.period),
    rows,
    empty: rows.length > 0 ? null : emptyBoardText(shown.board, shown.period, day !== undefined),
    note: day === undefined ? null : wantedDayText(day),
    viewer:
      shown.kind === 'people' && shown.viewer !== undefined
        ? words(viewerText(shown.board, shown.viewer))
        : null,
  };
}

/** A JSON answer with its ETag, `private, no-cache` set before: 304 where the page has it. */
function sendJson(request: GuildRequest, reply: FastifyReply, view: unknown) {
  const body = JSON.stringify(view);
  const etag = etagOf(body);
  void reply.header('etag', etag);
  if (etagMatches(request.headers['if-none-match'], etag)) return reply.code(304).send();
  return reply.type('application/json; charset=utf-8').send(body);
}

/**
 * The requests for a server's region tally one address may make in a minute: the page asks once
 * per period a member picks (review of the brief: 60, as a page of tabs needs no more).
 */
export const TALLY_PER_MINUTE = 60;

/**
 * Whether a member's forum keeps a region's activity and tally lines from them: the domain's
 * `keptOut` (barred only, as the party layer), of how `PartyViewers` found them to stand to it.
 */
function keptOutOf(viewer: { barred: Set<string>; hidden: Set<string> }, forum: string): boolean {
  return keptOut(
    viewer.barred.has(forum) ? 'barred' : viewer.hidden.has(forum) ? 'hidden' : 'visible',
  );
}

/** `?period=month|year|all`, this month by default. */
const tallyQuery = z.object({ period: z.enum(TALLY_PERIODS).default('month') }).strict();

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
 * the buckets' regions after, or their text channels where they have none (`PartyViewers`,
 * shared with the parties, and `regionGate`: a region whose forum keeps the member out is left
 * out, one only their roles hide is shown, as on the party layer; `keptOutOf`). The
 * weights are the domain's (`activityWeights`); a gym or Power Spot is placed where the map has
 * it now, and one it no longer has counts among those left out. An ETag of the member's JSON,
 * `private, no-cache`.
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
      // Each region by the channel that decides who sees it: its forum, or its text channel
      // where it has none (`regionGate`, 8H5-2).
      const gateOf = new Map(
        activity.regions.all().map((region) => [region.id, regionGate(region)]),
      );
      const gates = [
        ...new Set(
          buckets.flatMap((bucket) => {
            const gate = gateOf.get(bucket.regionId);
            return gate === undefined ? [] : [gate];
          }),
        ),
      ];
      const viewer = await viewers.viewer(guild, session.userId, gates, member);
      if (viewer.kind === 'not-member') return sendFailure(request, reply, 403);
      if (viewer.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
      // Only an existing channel keeps out (`PartyGateway.memberAccess`): a region of 0 (a record
      // without one) and a region no longer in the directory (deleted since, its forum with it)
      // are seen by every member and counted normally (the controller's ruling, 8H4-1). A
      // region's forum, or its text channel where it has none, that keeps the member out leaves
      // the region out; one only their roles hide does not (the party layer's rule and the
      // region tally's, `keptOutOf`; spec 2.5).
      const seen = buckets.filter((bucket) => {
        const gate = gateOf.get(bucket.regionId);
        return gate === undefined || !keptOutOf(viewer, gate);
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

  // The region tally (plan 8H-5, design Part C): `/stats regions`' tally as the member may see
  // it, for the history page. Shaped as /api/activity: membership first, then the forums of the
  // server's regions, or their text channels where they have none (`PartyViewers`,
  // `regionGate`: one that keeps the member out leaves its region out of every line and the
  // total, one only their roles hide does not); regions gone and records without one are
  // "No longer a region", seen by everyone.
  const tallyLimiter = new RateLimiter({ uses: TALLY_PER_MINUTE, perMs: 60_000 });
  scope.get(
    '/api/stats/regions',
    { onRequest: limitedPerAddress(tallyLimiter, { now: deps.now }) },
    async (request: GuildRequest, reply) => {
      void reply.header('cache-control', 'private, no-cache');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 401);
      const query = tallyQuery.safeParse(request.query ?? {});
      if (!query.success) return sendFailure(request, reply, 400);
      const { guild } = request.params;
      const member = await viewers.askedMembership(guild, session.userId);
      if (member.kind === 'not-member') return sendFailure(request, reply, 403);
      if (member.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
      // What the forums say of the member, asked once the server's regions are known.
      let refused: 'not-member' | 'unconfirmed' | undefined;
      const shown = await activity.tallies.tally(
        guild,
        query.data.period,
        deps.now(),
        async (regions) => {
          const gates = regions.map(regionGate);
          const viewer = await viewers.viewer(guild, session.userId, gates, member);
          if (viewer.kind !== 'member') {
            refused = viewer.kind;
            return new Set(regions.map((region) => region.id));
          }
          return new Set(
            regions
              .filter((region) => keptOutOf(viewer, regionGate(region)))
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
      const view: RegionTallyView = {
        period: shown.period,
        title: tallyTitle(shown.period),
        rows: shown.tally.rows.map((row) => ({
          name: nameOf(row.regionId),
          raids: row.raids,
          maxes: row.maxes,
        })),
        quiet: shown.tally.quiet.map(nameOf),
        gone: shown.tally.gone,
        total: shown.tally.total,
      };
      return sendJson(request, reply, view);
    },
  );

  // The boards (plan 8H-6, design Part D): every board of a period as `/stats boards` ranks
  // them (`Boards.board`), with where the member stands. Membership first, as the tally's; the
  // boards place nobody, so no forum is asked.
  const boardsLimiter = new RateLimiter({ uses: BOARDS_PER_MINUTE, perMs: 60_000 });
  scope.get(
    '/api/stats/boards',
    { onRequest: limitedPerAddress(boardsLimiter, { now: deps.now }) },
    async (request: GuildRequest, reply) => {
      void reply.header('cache-control', 'private, no-cache');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 401);
      const query = tallyQuery.safeParse(request.query ?? {});
      if (!query.success) return sendFailure(request, reply, 400);
      const { guild } = request.params;
      const member = await viewers.askedMembership(guild, session.userId);
      if (member.kind === 'not-member') return sendFailure(request, reply, 403);
      if (member.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
      const { period } = query.data;
      const now = deps.now();
      let shown: ShownBoard[];
      try {
        shown = await Promise.all(
          BOARDS.map((board) =>
            activity.boards.board(guild, board, period, now, { id: session.userId }),
          ),
        );
      } catch (err) {
        // The names are Discord's (`MemberNames`): while it cannot say, as for membership (B5).
        request.log.warn({ err }, 'could not name the members of the boards');
        return reply.code(503).send({ error: UNCONFIRMED });
      }
      const words = (text: string) => pageWords(text, activity.zone, now);
      const view: BoardsView = { period, boards: shown.map((one) => boardView(one, words)) };
      return sendJson(request, reply, view);
    },
  );

  // A member's own stats, "Your Pine" (plan 8H-6, design Part E): `/stats me`'s own path, all
  // time or of a year, the busiest region by its channel (rule 2: a region, never a place).
  const meLimiter = new RateLimiter({ uses: BOARDS_PER_MINUTE, perMs: 60_000 });
  scope.get(
    '/api/stats/me',
    { onRequest: limitedPerAddress(meLimiter, { now: deps.now }) },
    async (request: GuildRequest, reply) => {
      void reply.header('cache-control', 'private, no-cache');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 401);
      const query = meQuery.safeParse(request.query ?? {});
      if (!query.success) return sendFailure(request, reply, 400);
      const { guild } = request.params;
      const member = await viewers.askedMembership(guild, session.userId);
      if (member.kind === 'not-member') return sendFailure(request, reply, 403);
      if (member.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
      const { year } = query.data;
      const shown = await activity.memberStats.stats(
        guild,
        session.userId,
        year === undefined ? {} : { year },
      );
      if (!shown.optedIn) {
        const text = pageWords(NOT_OPTED_IN, activity.zone, deps.now());
        return sendJson(request, reply, { optedIn: false, text });
      }
      // A year without anything of theirs: what /stats me says of it (B3).
      if (year !== undefined && !shown.years.includes(year)) {
        const empty: MemberStatsView = {
          optedIn: true,
          empty: nothingInYear(year),
          title: memberStatsTitle(year),
          year,
          years: shown.years,
        };
        return sendJson(request, reply, empty);
      }
      const { stats } = shown;
      const regionId = stats.busiestRegion?.regionId;
      const region =
        regionId === undefined
          ? undefined
          : activity.regions.all().find((one) => one.id === regionId);
      const channel = region === undefined ? undefined : activity.channelName(region.channelId);
      const view: MemberStatsView = {
        optedIn: true,
        year: stats.year,
        years: shown.years,
        title: memberStatsTitle(stats.year),
        raids: stats.raids,
        trains: stats.trains,
        meetups: stats.meetups,
        reports: stats.reports,
        completed: stats.completed,
        trainsCame: stats.trainsCame,
        meetupsCame: stats.meetupsCame,
        busiestRegion:
          region === undefined
            ? null
            : channel === undefined
              ? `Region ${region.id}`
              : `#${channel}`,
        bosses: stats.bosses.flatMap((boss) => {
          const name = activity.bossName(boss.bossKey);
          return name === undefined ? [] : [{ name, count: boss.count }];
        }),
        sent: stats.sent,
        months: stats.months,
      };
      return sendJson(request, reply, view);
    },
  );
}
