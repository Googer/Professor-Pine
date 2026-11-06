import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ActivityReader } from '../db/repositories/activity-repository.js';
import type {
  RaidsAlongReader,
  TrainCardRows,
  TrainHistoryReader,
} from '../db/repositories/history-repository.js';
import { raidsAlongQuery, stopWindows, type RaidAlongRow } from '../domain/history/train-card.js';
import { trainMonth, trainMonthRange } from '../domain/history/trains-on-web.js';
import type { TrainMonthView, TrainRouteView } from '../domain/web/train-history-data.js';
import {
  trainCardLines,
  trainItem,
  trainLine,
  trainListed,
  trainRegionIds,
  type TrainPlaces,
} from './history-trains.js';
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
import { memberStatsTitle, notOptedIn, nothingInYear } from '../render/member-stats.js';
import { IN_SETTINGS_ON_DISCORD } from '../render/settings-words.js';
import type { Boards, ShownBoard } from '../services/boards.js';
import type { MemberStatsService } from '../services/member-stats.js';
import type { HistoryDays } from '../services/history-days.js';
import { HISTORY_FIRST_YEAR } from '../domain/web/history-days-data.js';
import { bigDaysView, bossListView, bossTrendView, historyDaysView } from './history-days.js';
import { pageWords } from './page-words.js';
import type { RegionTallies } from '../services/region-tallies.js';
import { sendFailure } from './answers.js';
import { etagMatches, etagOf } from './geo-cache.js';
import type { GuildRequest } from './guild-routes.js';
import { UNCONFIRMED } from './party-routes.js';
import type { PartyViewers } from './party-viewers.js';
import { limitedPerAddress, RateLimiter } from './rate-limit.js';
import type { WebDeps } from './server.js';
import type { RaidStandSettings } from '../domain/time/raid-durations.js';

/** What the activity heatmap of the live map reads (plan 8H-4). */
export interface ActivityWebDeps {
  /** The buckets (`ActivityRepository`). */
  reader: ActivityReader;
  /** The regions, whose forums say who may see their parties (`RegionDirectory`). */
  regions: { all(): readonly Region[] };
  /**
   * The gyms as the map has them (`GymDirectory`): a gym no longer listed is left out; the
   * channels of the regions a gym lies in now (plan 8H-7B: a legacy train's stops, review A1).
   */
  gyms: {
    get(id: number): { lat: number; lon: number } | undefined;
    regionsOf(gymId: number): string[];
  };
  /** The row of a server (`Guild.id`), whose regions are its own (plan 8H-7B, review A2). */
  guilds: { idFor(snowflake: string): Promise<number | undefined> };
  /** The kept Wayspots (`WayspotDirectory`): a Power Spot no longer kept is left out. */
  wayspots: { byId(id: string): { lat: number; lon: number } | undefined };
  /** `settings.timezone`: the buckets' months, weekdays and hours. */
  zone: string;
  /** The settings' raid times: how long a raid without an end time stood, on a train's card (W5). */
  durations: RaidStandSettings;
  /** The region tally (plan 8H-5): `/stats regions`' own path (`RegionTallies.tally`). */
  tallies: Pick<RegionTallies, 'tally'>;
  /** A region's channel by name, as the bot sees it; undefined for one it does not. */
  channelName: (channelId: string) => string | undefined;
  /** The boards (plan 8H-6): `/stats boards`' own path (`Boards.board`). */
  boards: Pick<Boards, 'boards'>;
  /** A member's own stats (plan 8H-6): `/stats me`'s own path (`MemberStatsService.stats`). */
  memberStats: Pick<MemberStatsService, 'stats'>;
  /** The catalogue's name of a boss by its key, for "Your history"'s bosses. */
  bossName: (bossKey: string) => string | undefined;
  /**
   * The ended trains of the map's History (plan 8H-7B): a month's trains, their rows and the
   * raids along their way, as the post's card reads them (`HistoryRepository`).
   */
  trains: TrainHistoryReader & RaidsAlongReader;
  /**
   * Raids per day, big days and a boss's trend (plan 8H-8): the events forum's own path
   * (`HistoryDays`).
   */
  days: Pick<HistoryDays, 'year' | 'everyYear' | 'bosses' | 'boss'>;
}

/**
 * The requests for a server's ended trains one address may make in a minute, a month's list and a
 * train's route together (review G8: their own limiter): a member picks a month, then a train or
 * two of it.
 */
export const TRAINS_PER_MINUTE = 60;

/** The most trains a month's list gives; the rest are counted (`more`). */
export const TRAINS_LISTED = 50;

/** `?month=yyyy-mm`, required. */
const trainsQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u) }).strict();

/** A record's id as the map's address gives it: digits, no leading zero, at most 15. */
const HISTORY_ID = /^[1-9]\d{0,14}$/u;

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
        ? words(viewerText(shown.board, shown.viewer, IN_SETTINGS_ON_DISCORD))
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
        // Every board in one call: who is on them read once, their names asked once (W1, W2).
        shown = await activity.boards.boards(guild, BOARDS, period, now, { id: session.userId });
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

  // A member's own stats, "Your history" (plan 8H-6, design Part E): `/stats me`'s own path, all
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
        const text = pageWords(notOptedIn(IN_SETTINGS_ON_DISCORD), activity.zone, deps.now());
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

  trainRoutes(scope, deps, viewers);
  dayRoutes(scope, deps, viewers);
}

type TrainRequest = FastifyRequest<{ Params: { guild: string; train: string } }>;

/**
 * The ended trains of the map's History (plan 8H-7B, design Part F's web half): `GET
 * /s/<guild>/api/history/trains?month=yyyy-mm`, the month's trains (by `createdAt` in the posts'
 * zone) the member may see, newest first, at most `TRAINS_LISTED`; and `GET
 * /s/<guild>/api/history/trains/<id>`, one train's line and card, by its record's id (review G1:
 * legacy records have no party id). Shaped as the other history routes: their own limiter
 * (`TRAINS_PER_MINUTE`, review G8), a session (401), membership asked before anything of the
 * server is read (403, 503), an ETag, `private, no-cache`. Shown only where three members or more
 * came (`trainShownOnWeb`, G2), a legacy train only with a stop the map can place (G3), and never
 * where a region of it, its own or any stop's, keeps the member out (`regionGate`, `keptOut`:
 * barred only; a region gone and none are seen, G5). Every train refused, whatever why (another
 * server's, no train, too few riders, barred, none at all), is the one 404 (G1).
 */
function trainRoutes(scope: FastifyInstance, deps: WebDeps, viewers: PartyViewers): void {
  const { sessions, activity } = deps;
  const limiter = new RateLimiter({ uses: TRAINS_PER_MINUTE, perMs: 60_000 });
  const onRequest = limitedPerAddress(limiter, { now: deps.now });
  const regionOf = (id: number) => activity.regions.all().find((region) => region.id === id);

  /**
   * The member's view of the server's trains (review A2): the gates (`regionGate`) of every region
   * of the server asked at once, before any record is read, so that what is asked of Discord never
   * depends on the train asked for; the places with the server's regions of each gym (A1); and
   * whether the member sees a train, by its regions (`trainRegionIds`): a region no longer of the
   * server, or none, keeps nobody out.
   */
  const viewOf = async (
    guild: string,
    userId: string,
    member: Awaited<ReturnType<PartyViewers['askedMembership']>>,
  ): Promise<
    | { refused: 'not-member' | 'unconfirmed' }
    | { places: TrainPlaces; sees: (rows: TrainCardRows) => boolean }
  > => {
    const row = await activity.guilds.idFor(guild);
    const ofServer = activity.regions.all().filter((region) => region.guildId === row);
    const byId = new Map(ofServer.map((region) => [region.id, region]));
    const byChannel = new Map(ofServer.map((region) => [region.channelId, region.id]));
    const viewer = await viewers.viewer(guild, userId, ofServer.map(regionGate), member);
    if (viewer.kind !== 'member') return { refused: viewer.kind };
    const places: TrainPlaces = {
      gym: (id) => activity.gyms.get(id),
      spot: (id) => activity.wayspots.byId(id),
      gymRegions: (id) =>
        activity.gyms.regionsOf(id).flatMap((channel) => {
          const regionId = byChannel.get(channel);
          return regionId === undefined ? [] : [regionId];
        }),
    };
    return {
      places,
      sees: (rows) =>
        trainRegionIds(rows, places).every((id) => {
          const region = byId.get(id);
          return region === undefined || !keptOutOf(viewer, regionGate(region));
        }),
    };
  };

  scope.get('/api/history/trains', { onRequest }, async (request: GuildRequest, reply) => {
    void reply.header('cache-control', 'private, no-cache');
    const session = await sessions.of(request, reply);
    if (!session) return sendFailure(request, reply, 401);
    const query = trainsQuery.safeParse(request.query ?? {});
    if (!query.success) return sendFailure(request, reply, 400);
    const { guild } = request.params;
    const member = await viewers.askedMembership(guild, session.userId);
    if (member.kind === 'not-member') return sendFailure(request, reply, 403);
    if (member.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
    const { month } = query.data;
    const seen = await viewOf(guild, session.userId, member);
    if ('refused' in seen) {
      return seen.refused === 'not-member'
        ? sendFailure(request, reply, 403)
        : reply.code(503).send({ error: UNCONFIRMED });
    }
    const ids = await activity.trains.trainsMade(guild, trainMonthRange(month, activity.zone));
    const read = await activity.trains.trainCardRows(guild, ids);
    // Filtered before the cap, so that "more" counts only what the member may see (G5).
    const shown = ids.flatMap((id) => {
      const rows = read.get(id);
      return rows !== undefined && trainListed(rows, seen.places) && seen.sees(rows)
        ? [{ id, rows }]
        : [];
    });
    const view: TrainMonthView = {
      month,
      trains: shown
        .slice(0, TRAINS_LISTED)
        .map((one) => trainItem(one.id, one.rows, activity.zone)),
      more: Math.max(0, shown.length - TRAINS_LISTED),
    };
    return sendJson(request, reply, view);
  });

  scope.get('/api/history/trains/:train', { onRequest }, async (request: TrainRequest, reply) => {
    void reply.header('cache-control', 'private, no-cache');
    const session = await sessions.of(request, reply);
    if (!session) return sendFailure(request, reply, 401);
    const { guild, train } = request.params;
    const member = await viewers.askedMembership(guild, session.userId);
    if (member.kind === 'not-member') return sendFailure(request, reply, 403);
    if (member.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
    // Asked before the id is looked at (review A2): the same of Discord, whatever train is asked.
    const seen = await viewOf(guild, session.userId, member);
    if ('refused' in seen) {
      return seen.refused === 'not-member'
        ? sendFailure(request, reply, 403)
        : reply.code(503).send({ error: UNCONFIRMED });
    }
    const { places } = seen;
    // Every train it will not show, whatever why, answers the same (G1).
    const refused = () => sendFailure(request, reply, 404);
    if (!HISTORY_ID.test(train)) return refused();
    const id = Number(train);
    // Read of this server only (review W4): another server's record is read as one not there.
    const rows = (await activity.trains.trainCardRows(guild, [id])).get(id);
    if (rows === undefined || !trainListed(rows, places) || !seen.sees(rows)) return refused();
    const now = deps.now();
    const raids = rows.listing.source === 'live' ? await raidsOf(rows, guild) : undefined;
    // A region by its channel's name (`#west`), by its number where the bot sees no channel; a
    // region gone since is left out, as on the post (G7).
    const regionWords = (regionId: number): string | undefined => {
      const region = regionOf(regionId);
      if (region === undefined) return undefined;
      const name = activity.channelName(region.channelId);
      return name === undefined ? `Region ${String(regionId)}` : `#${name}`;
    };
    const view: TrainRouteView = {
      ...trainItem(id, rows, activity.zone),
      month: trainMonth(rows.listing.createdAt, activity.zone),
      ...trainLine(rows, places),
      card: trainCardLines(rows, raids, activity.durations, regionWords, activity.zone, now),
    };
    return sendJson(request, reply, view);

    /** The raids along its way, as the post read them; undefined where the read failed. */
    async function raidsOf(
      card: TrainCardRows,
      serverId: string,
    ): Promise<RaidAlongRow[] | undefined> {
      const asked = raidsAlongQuery(stopWindows(card.record, card.stops, card.attendees));
      if (asked === undefined) return [];
      try {
        return await activity.trains.raidsAlong(serverId, asked);
      } catch (err) {
        deps.log.warn(
          { err, guild: serverId },
          'could not read the raids along the way of an ended train',
        );
        return undefined;
      }
    }
  });
}

/**
 * The requests for a server's raids by day, big days and bosses one address may make in a minute,
 * the four routes together: a page asks three at once, then a year or a boss at a time.
 */
export const DAYS_PER_MINUTE = 60;

/** `?year=yyyy`, `HISTORY_FIRST_YEAR` (2016, B13) or later; the newest year the server has without. */
const daysQuery = z
  .object({
    year: z
      .string()
      .regex(/^\d{4}$/u)
      .transform(Number)
      .refine((year) => year >= HISTORY_FIRST_YEAR)
      .optional(),
  })
  .strict();

/** No query at all. */
const noQuery = z.object({}).strict();

/** A key as the catalogue makes them (`mewtwo`, `giratina_altered`; G15). */
const BOSS_KEY = /^[a-z0-9_]{1,64}$/u;

type BossRequest = FastifyRequest<{ Params: { guild: string; boss: string } }>;

/**
 * Raids per day, big days and a boss's trend on the history page (plan 8H-8, design Part G):
 * `GET /s/<guild>/api/history/days?year=yyyy` (the year's days, its big days, the years),
 * `…/big-days` (every year's top three), `…/bosses` and `…/bosses/<key>` (the list; one boss's
 * months). Shaped as the other history routes: their own limiter (`DAYS_PER_MINUTE`), a session
 * (401), what is asked checked (400), membership asked before anything of the server is read
 * (403, 503), an ETag, `private, no-cache`. Every route leaves out the regions whose forum, or
 * text channel where they have none, keeps the member out (G4: `regionGate`, `keptOutOf`, barred
 * only; region 0 and a region gone keep nobody out), the same function then judging what is left
 * (`HistoryDays`, which keeps a server's series per set of regions left out, never per member).
 */
function dayRoutes(scope: FastifyInstance, deps: WebDeps, viewers: PartyViewers): void {
  const { sessions, activity } = deps;
  const limiter = new RateLimiter({ uses: DAYS_PER_MINUTE, perMs: 60_000 });
  const onRequest = limitedPerAddress(limiter, { now: deps.now });

  /**
   * The regions a member's view leaves out, after the session, what was asked (`valid`) and
   * membership; or the answer already sent where there is none to say.
   */
  const leftOutOf = async (
    request: GuildRequest,
    reply: FastifyReply,
    valid: boolean,
  ): Promise<{ leftOut: ReadonlySet<number> } | { sent: FastifyReply }> => {
    void reply.header('cache-control', 'private, no-cache');
    const session = await sessions.of(request, reply);
    if (!session) return { sent: sendFailure(request, reply, 401) };
    if (!valid) return { sent: sendFailure(request, reply, 400) };
    const { guild } = request.params;
    const member = await viewers.askedMembership(guild, session.userId);
    if (member.kind === 'not-member') return { sent: sendFailure(request, reply, 403) };
    if (member.kind === 'unconfirmed') {
      return { sent: reply.code(503).send({ error: UNCONFIRMED }) };
    }
    // Every region of the server asked at once, whatever is read after.
    const row = await activity.guilds.idFor(guild);
    const ofServer = activity.regions.all().filter((region) => region.guildId === row);
    const viewer = await viewers.viewer(guild, session.userId, ofServer.map(regionGate), member);
    if (viewer.kind === 'not-member') return { sent: sendFailure(request, reply, 403) };
    if (viewer.kind === 'unconfirmed') {
      return { sent: reply.code(503).send({ error: UNCONFIRMED }) };
    }
    return {
      leftOut: new Set(
        ofServer
          .filter((region) => keptOutOf(viewer, regionGate(region)))
          .map((region) => region.id),
      ),
    };
  };

  scope.get('/api/history/days', { onRequest }, async (request: GuildRequest, reply) => {
    const query = daysQuery.safeParse(request.query ?? {});
    const seen = await leftOutOf(request, reply, query.success);
    if ('sent' in seen || !query.success) return 'sent' in seen ? seen.sent : undefined;
    // Without a year, the newest the server has (this local one where it has none, A6).
    const read = await activity.days.year(
      request.params.guild,
      seen.leftOut,
      query.data.year,
      deps.now(),
    );
    return sendJson(request, reply, historyDaysView(read.year, read));
  });

  scope.get('/api/history/big-days', { onRequest }, async (request: GuildRequest, reply) => {
    const seen = await leftOutOf(request, reply, noQuery.safeParse(request.query ?? {}).success);
    if ('sent' in seen) return seen.sent;
    const every = await activity.days.everyYear(request.params.guild, seen.leftOut, deps.now());
    return sendJson(request, reply, bigDaysView(every));
  });

  scope.get('/api/history/bosses', { onRequest }, async (request: GuildRequest, reply) => {
    const seen = await leftOutOf(request, reply, noQuery.safeParse(request.query ?? {}).success);
    if ('sent' in seen) return seen.sent;
    const view = bossListView(
      await activity.days.bosses(request.params.guild, seen.leftOut, deps.now()),
    );
    return sendJson(request, reply, view);
  });

  scope.get('/api/history/bosses/:boss', { onRequest }, async (request: BossRequest, reply) => {
    const { boss } = request.params;
    const valid = BOSS_KEY.test(boss) && noQuery.safeParse(request.query ?? {}).success;
    const seen = await leftOutOf(request, reply, valid);
    if ('sent' in seen) return seen.sent;
    const trend = await activity.days.boss(request.params.guild, boss, seen.leftOut, deps.now());
    // A key the catalogue does not know (G15).
    if (trend === undefined) return sendFailure(request, reply, 404);
    return sendJson(request, reply, bossTrendView(trend));
  });
}
