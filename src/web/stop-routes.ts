import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app-context.js';
import {
  listedRewards,
  NO_STOPS_HERE,
  readTask,
  RESEARCH_REMOVE,
  RESEARCH_REPORT,
  researchThrottle,
  researchWindow,
  MAX_TYPED,
  STOP_OPTIONS,
} from '../commands/research/research-input.js';
import {
  NOT_YOUR_REPORT,
  NOTHING_LEFT,
  REPORT_CHANGED,
  REPORT_ENDED,
  reporterNamed,
  replaceQuestion,
  reportResearchAs,
  stopReportBarred,
  stopReportBarredWords,
  stopsByKey,
  takeBackAs,
  type ResearchReporting,
} from '../commands/research/research-report.js';
import {
  GIOVANNI_ONLY_WHEN_SURE,
  readWho,
  ROCKET_REMOVE,
  ROCKET_REPORT,
  rocketChoices,
  rocketThrottle,
  rocketWindow,
} from '../commands/rocket/rocket-input.js';
import {
  hideoutQuestion,
  reportRocketAs,
  type RocketAs,
  type RocketReporting,
} from '../commands/rocket/rocket-report.js';
import type { Region } from '../db/repositories/region-repository.js';
import { ListChanged, UserError } from '../discord/errors.js';
import { MEMBER_WRITE_THROTTLE } from '../discord/throttle.js';
import { isHideout, parseRocketKey, type RocketChoice } from '../domain/rocket/lineups.js';
import { inPeriod } from '../domain/time/research-periods.js';
import {
  isRocketReport,
  type ReportedStop,
  type RocketReport,
  type StopReport,
} from '../domain/stops/report.js';
import {
  stopsAtMost,
  type StopReportAnswer,
  type StopReportsView,
} from '../domain/web/stop-report-data.js';
import { stopReportView } from '../domain/web/stop-report-view.js';
import { postLink } from '../render/notify-dm.js';
import { researchWords, type ChannelNamer } from '../render/research.js';
import { alreadyReported, rocketLabel, rocketWords } from '../render/rocket.js';
import { plain } from '../render/text.js';
import type { GruntMessageService } from '../services/grunt-messages.js';
import { regionsAtPoints } from '../services/region-directory.js';
import type { StopPostService } from '../services/stop-posts.js';
import { isHideoutReport, type ResearchSubject } from '../services/stop-reports.js';
import {
  actingOnTheMap,
  countedOnTheMap,
  givenBackOnTheMap,
  isMapStaff,
  memberOrFailure,
  throttledOnTheMap,
  unreachableOnTheMap,
} from './acting.js';
import { sendFailure } from './answers.js';
import { postGuard } from './csrf.js';
import { pageWords } from './page-words.js';
import { requestZone } from './request-zone.js';
import { etagMatches, etagOf } from './geo-cache.js';
import type { GuildRequest } from './guild-routes.js';
import { UNCONFIRMED } from './party-routes.js';
import type { PartyViewer, PartyViewers } from './party-viewers.js';
import { limitedPerAddress, limitedRead, RateLimiter } from './rate-limit.js';
import type { WebDeps } from './server.js';
import { researchOptions, rocketOptions } from './stop-options.js';

/**
 * What the reports at stops of the live map read and call (plan 8R-3): exactly what `/research`
 * and `/rocket` use (the stop reports, `RocketService`, the regions and kept stops, the task list
 * and the lineups with what reads them, the place search's stop index, the settings), so that the
 * map shares their code paths.
 */
export type StopWebContext = ResearchReporting &
  RocketReporting &
  Pick<AppContext, 'researchTasks' | 'rocketLineups' | 'pokemon' | 'gameData' | 'placeFinder'>;

/** What the reports at stops of the live map need beyond the parties' own (`PartyWebDeps`). */
export interface StopWebDeps {
  ctx: StopWebContext;
  /** A channel's name as the bot sees it now: a region's, which an answer names. */
  channelName(channelId: string): string | undefined;
  /**
   * Which message of a region channel's post "Today’s Stops" holds a task or a hideout, in its
   * board post, as last drawn (`StopPostService.linkOf`: read only, never a draw); undefined in
   * rehearsal mode (no posts).
   */
  posts: Pick<StopPostService, 'linkOf'> | undefined;
  /** The grunts' messages, read for many reports at once; undefined in rehearsal mode. */
  grunts: Pick<GruntMessageService, 'messagesOfReports'> | undefined;
}

/**
 * The requests for a server's reports at stops one address may make in a minute: a page asks as
 * often as it asks for the parties (`PARTIES_PER_MINUTE`).
 */
export const STOP_REPORTS_PER_MINUTE = 120;

/** The requests for each pick list one address may make in a minute (a form asks once). */
const OPTIONS_PER_MINUTE = 30;

/**
 * The reports at stops of the live map (plan 8R-3; design 8, 9.16): today's reports of the server
 * as the member may see them (`GET /s/<guild>/api/stop-reports`). Who sees what is the parties'
 * rule (`PartyViewers`, shared with `/api/parties`): a report shows in a region unless the member
 * is barred from that region's forum, and a report lies in the regions whose outlines hold its
 * stop's snapshot.
 */
export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: PartyViewers): void {
  const { sessions, stops } = deps;
  const { ctx } = stops;

  /**
   * Where each report object was placed, against the regions it was placed among (plan
   * map-speed): the list hands the same report objects to every ask until a report changes
   * (`standingListed`), and the directory gives a new array at every load of the regions (a
   * region edited, added or removed), so a place kept is never stale.
   */
  const placed = new WeakMap<
    StopReport,
    { regions: readonly Region[]; row: number; at: readonly Region[] }
  >();

  /**
   * The regions of the server (`row`) whose outlines hold each report's stop as it was reported,
   * by report: placed once per report and load of the regions (`placed`; `regionsAtPoints`: each
   * outline's box first), for who may see them and for the view alike.
   */
  const placesOf = (row: number, reports: readonly StopReport[]): Places => {
    const regions = ctx.regions.all();
    let at: ((point: StopReport['stop']) => readonly Region[]) | undefined;
    return new Map(
      reports.map((report) => {
        const kept = placed.get(report);
        if (kept?.regions === regions && kept.row === row) return [report.id, kept.at];
        at ??= regionsAtPoints(regions, row);
        const found = at(report.stop);
        placed.set(report, { regions, row, at: found });
        return [report.id, found];
      }),
    );
  };

  /**
   * The regions of a report the member may see: a region without a forum, or one whose forum
   * does not keep them out.
   */
  const seenIn = (regions: readonly Region[], viewer: { barred: Set<string> }): Region[] =>
    regions.filter(
      (region) => region.forumChannelId === null || !viewer.barred.has(region.forumChannelId),
    );

  /**
   * The view of a member (`stopReportView`): each report in the regions the member sees, with
   * its link there (the message of the post of the stops that holds a task or a hideout; a grunt's own
   * message, every grunt's read in one go).
   */
  const viewFor = async (
    guild: string,
    places: Places,
    reports: readonly StopReport[],
    viewer: Extract<PartyViewer, { kind: 'member' }>,
    userId: string,
    /** The request whose server's zone the view is in (`requestZone`). */
    request: FastifyRequest,
  ): Promise<StopReportsView> => {
    const seen = new Map(
      reports.map((report) => [report.id, seenIn(places.get(report.id) ?? [], viewer)]),
    );
    const grunts = reports.filter(
      (report) =>
        isRocketReport(report) &&
        !isHideoutReport(report) &&
        (seen.get(report.id) ?? []).length > 0,
    );
    const messages =
      grunts.length === 0 || stops.grunts === undefined
        ? new Map<number, { channelId: string; messageId: string }[]>()
        : await stops.grunts.messagesOfReports(grunts.map((report) => report.id));
    const link = (report: StopReport): string | undefined => {
      const channels = (seen.get(report.id) ?? []).map((region) => region.channelId);
      if (isRocketReport(report) && !isHideoutReport(report)) {
        const message = messages.get(report.id)?.find((one) => channels.includes(one.channelId));
        return message && postLink(guild, message.channelId, message.messageId);
      }
      for (const channelId of channels) {
        const held = stops.posts?.linkOf(channelId, report.subjectKey);
        if (held !== undefined) return postLink(guild, held.channelId, held.messageId);
      }
      return undefined;
    };
    const now = deps.now();
    return stopReportView({
      reports,
      period: ctx.stopReports.period(guild, now),
      now,
      zone: requestZone(request),
      shown: (report) => (seen.get(report.id) ?? []).length > 0,
      memberId: userId,
      staff: isMapStaff(viewer.standing, userId, deps.parties.ownerId),
      readOnly: viewer.readOnly,
      link,
      pictureOrigins: deps.pictureOrigins,
      picture: (source) => deps.pictures.url(source),
      // Find (plan 8M-12): a grunt type is "not sure which" only where it has two lineups today.
      search: { lineupsOf: (typeKey) => ctx.rocketLineups.byKey(typeKey)?.lineups?.length ?? 0 },
    });
  };

  /** The forums of the regions the reports lie in, which say who may see them. */
  const forumsOf = (places: Places): string[] =>
    [...places.values()].flatMap((regions) =>
      regions.flatMap((region) => (region.forumChannelId === null ? [] : [region.forumChannelId])),
    );

  /**
   * Reports as the member sees them on the map (`/api/stop-reports`'s view of just these), for an
   * answer (R13: never one the list would hide from them); none while Discord cannot say, nor
   * where they cannot be read just now (a warning: the report stands and was counted, so the
   * answer says it was made, and the page's next poll shows it).
   */
  const shownTo = async (
    guild: string,
    userId: string,
    reports: readonly StopReport[],
    /** The request whose server's zone the view is in (`requestZone`). */
    request: FastifyRequest,
  ): Promise<StopReportsView | undefined> => {
    try {
      const row = await ctx.guilds.idFor(guild);
      if (row === undefined) return undefined;
      const places = placesOf(row, reports);
      const viewer = await viewers.viewer(guild, userId, forumsOf(places));
      return viewer.kind === 'member'
        ? await viewFor(guild, places, reports, viewer, userId, request)
        : undefined;
    } catch (err) {
      deps.log.warn(
        { err, guild, user: userId, reports: reports.map((report) => report.id) },
        'could not show reports at stops made on the map',
      );
      return undefined;
    }
  };

  // Today's reports at the stops of the server (design 9.16): read once and kept until a report
  // changes (`standingListed`; the page polls it), each request filtering by its clock and
  // placing each report once per load of the regions; for members only, as the parties, asked
  // before anything of the server is read (`membership`; the forums after the read); an ETag of
  // the member's JSON, `private, no-cache`, 304 when the page has it.
  scope.get(
    '/api/stop-reports',
    { onRequest: limitedRead(STOP_REPORTS_PER_MINUTE, deps) },
    async (request: GuildRequest, reply) => {
      void reply.header('cache-control', 'private, no-cache');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 401);
      const { guild } = request.params;
      // Nothing of the server is read for somebody who is no member of it (review F2).
      const member = await viewers.askedMembership(guild, session.userId);
      if (member.kind === 'not-member') return sendFailure(request, reply, 403);
      if (member.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
      const row = await ctx.guilds.idFor(guild);
      const reports = row === undefined ? [] : await ctx.stopReports.standingListed(guild);
      const places: Places = row === undefined ? new Map() : placesOf(row, reports);
      const viewer = await viewers.viewer(guild, session.userId, forumsOf(places), member);
      if (viewer.kind !== 'member') return sendFailure(request, reply, 403);
      const body = JSON.stringify(
        await viewFor(guild, places, reports, viewer, session.userId, request),
      );
      const etag = etagOf(body);
      void reply.header('etag', etag);
      if (etagMatches(request.headers['if-none-match'], etag)) return reply.code(304).send();
      return reply.type('application/json; charset=utf-8').send(body);
    },
  );

  /** A pick list's JSON for members: an ETag of it, `private, no-cache`, 304 when the page has it. */
  const optionsRoute = (url: string, body: (request: GuildRequest) => unknown) => {
    scope.get(
      url,
      { onRequest: limitedRead(OPTIONS_PER_MINUTE, deps) },
      async (request: GuildRequest, reply) => {
        void reply.header('cache-control', 'private, no-cache');
        const session = await sessions.of(request, reply);
        if (!session) return sendFailure(request, reply, 401);
        const refused = await memberOrFailure(
          deps,
          request,
          reply,
          request.params.guild,
          session.userId,
        );
        if (refused) return refused;
        const json = JSON.stringify(body(request));
        const etag = etagOf(json);
        void reply.header('etag', etag);
        if (etagMatches(request.headers['if-none-match'], etag)) return reply.code(304).send();
        return reply.type('application/json; charset=utf-8').send(json);
      },
    );
  };

  // The pick lists of a research report (plan 8R-3): `/research`'s task list whole, whether it is
  // out of date, and the rewards a typed task may name.
  optionsRoute('/api/research-options', (request) =>
    researchOptions({
      // Offered as on the server's clock (fix round 1, M7).
      tasks: ctx.researchTasks.tasks(requestZone(request)),
      versions: (task) => ctx.researchTasks.versions(task),
      readAt: ctx.researchTasks.readAt(),
      stale: ctx.researchTasks.stale(deps.now()),
      listed: listedRewards(ctx),
      origins: deps.pictureOrigins,
      picture: (source) => deps.pictures.url(source),
    }),
  );

  // The pick list of a Rocket report (plan 8R-3): `/rocket`'s choices, Giovanni's with its note.
  optionsRoute('/api/rocket-options', () =>
    rocketOptions({
      choices: rocketChoices(ctx),
      readAt: ctx.rocketLineups.readAt(),
      stale: ctx.rocketLineups.stale(deps.now()),
      giovanniNote: GIOVANNI_ONLY_WHEN_SURE,
      origins: deps.pictureOrigins,
      picture: (source) => deps.pictures.url(source),
    }),
  );

  /** The words of a command as text of the page, in the zone of the request's server. */
  const words = (text: string, request: FastifyRequest): string =>
    pageWords(text, requestZone(request), deps.now());

  /**
   * An answer's words on the map: the command's, without the heading of its answer
   * ("### Field research reported": the page says what was done its own way), as page text.
   */
  const answerWords = (
    { head, where }: { head: string; where: string },
    request: FastifyRequest,
  ): string =>
    words(`${head.replace(/^### [^\n]*\n/u, '')}${where === '' ? '' : `\n${where}`}`, request);

  /** A region channel as the map's answers name it: `#west`, else `Region 5`. */
  const channel: ChannelNamer = (channelId) => {
    const name = stops.channelName(channelId);
    if (name !== undefined) return `#${name}`;
    const region = ctx.regions.byChannel(channelId);
    return region ? `Region ${String(region.id)}` : '#unknown';
  };

  /** A refusal in the command's words, as text of the page, and what else the page needs. */
  const refuse = (
    reply: FastifyReply,
    status: number,
    text: string,
    more: Omit<StopReportAnswer, 'ok' | 'text'> = {},
  ) => {
    const answer: StopReportAnswer = { ok: false, text: words(text, reply.request), ...more };
    return reply.code(status).send(answer);
  };

  /** The reports at stops one address may send in a minute, whoever sends them. */
  const writeLimiter = new RateLimiter({ uses: STOP_WRITES_PER_ADDRESS_MINUTE, perMs: 60_000 });
  const writeGuards = [
    limitedPerAddress(writeLimiter, { now: deps.now }),
    postGuard(sessions, deps.settings.publicUrl),
  ];

  /**
   * The stops a report names by their keys, of this server (`stopsByKey`), or the refusal sent:
   * none known in the server's regions at all, `/research`'s `NO_STOPS_HERE` (422); a key that is
   * no PokéStop of this server, 404 (nobody learns of other servers' stops).
   */
  const stopsNamed = async (
    request: GuildRequest,
    reply: FastifyReply,
    guild: string,
    keys: readonly string[],
  ): Promise<{ stops: ReportedStop[] } | { sent: FastifyReply; outcome: string }> => {
    const row = await ctx.guilds.idFor(guild);
    if (row === undefined || !ctx.placeFinder.hasStops(row)) {
      return { sent: refuse(reply, 422, NO_STOPS_HERE), outcome: 'no-stops' };
    }
    const stopsFound = await stopsByKey(ctx, guild, keys);
    if (stopsFound.length !== new Set(keys).size) {
      return { sent: sendFailure(request, reply, 404), outcome: 'no-stop' };
    }
    return { stops: stopsFound };
  };

  /**
   * The refusal of a report at stops of a region the member is kept out of (plan 8Z-2, the
   * audit's W7; `stopReportBarred`, the question `/research report` and `/rocket report` ask in
   * their guards): 403 in their words, naming the stop; 503 while Discord cannot say. Undefined
   * where they may report. Nothing of it counts.
   */
  const keptFrom = async (
    reply: FastifyReply,
    guild: string,
    userId: string,
    administrator: boolean,
    stopsNamedSo: readonly ReportedStop[],
    doing: string,
  ): Promise<{ sent: FastifyReply; outcome: string } | undefined> => {
    try {
      const kept = await stopReportBarred(
        ctx,
        (gate, memberId) => deps.parties.forums.memberAccess(gate, memberId),
        guild,
        stopsNamedSo,
        { id: userId, administrator },
      );
      return kept === undefined
        ? undefined
        : { sent: refuse(reply, 403, stopReportBarredWords(kept)), outcome: 'barred' };
    } catch (err) {
      return {
        sent: unreachableOnTheMap(deps, reply, err, guild, userId, doing),
        outcome: 'unreachable',
      };
    }
  };

  // A research report (plan 8R-3), as `/research report` makes it: before the body is read, the
  // per-address limit and the guard of every POST. Then the session (403) and the body (400), who
  // reports (`actingOnTheMap`), the stops (`NO_STOPS_HERE` 422; a key of no stop of this server
  // 404; a stop of a region the member is kept out of 403, Discord away 503: `keptFrom`), the
  // task and its reward (`readTask`: 422 in its words, `TASK_LIST_CHANGED` among them;
  // a typed task's key `typed:…` 422 `TYPED_TASK_KEY`) or instead `sameAs`, the report whose task
  // it is ("Same task at more stops…": research of this server and of the period on now, else 409
  // `REPORT_ENDED`; a `task` with `more` is "Same task at more stops…" too: asked in its words,
  // with `also`; read by `readTask`, no period check; review F3), none counted; without
  // `replacing`, other members' reports it contradicts
  // (plan 8R-5, R7) are the question `/research` asks in its dialog, a 422 with those reports
  // (`asks.reports`; those the member may not be shown by id and stop, `asks.hidden`: review R5),
  // uncounted unless the window is full (429); only then `/research report`'s
  // throttle in its window (`researchWindow`: the map shares the command's, design 9.12); then
  // `reportResearchAs` as the member, `replacing` the reports ticked. The stops reported already
  // (R8) come back as `already`; where every stop was, a 409, given back as on Discord (8R-6).
  scope.post('/api/research', { onRequest: writeGuards }, async (request: GuildRequest, reply) => {
    void reply.header('cache-control', 'no-store');
    const session = await sessions.of(request, reply);
    if (!session) return sendFailure(request, reply, 403);
    // More stops than `/research report` takes, said in words before any other fault of the body
    // (re-review X3: stops tapped before the page had the lists are not capped there).
    if (tooManyStops(request.body)) {
      return refuse(reply, 400, stopsAtMost(STOP_OPTIONS.length));
    }
    const body = researchBodySchema.safeParse(request.body ?? {});
    if (!body.success) return sendFailure(request, reply, 400);
    const { guild } = request.params;
    const { userId } = session;
    const doing = 'reported field research';
    const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
    if ('sent' in acting) return acting.sent;
    const keys = body.data.stops;
    /** The stops as the log names them: the keys found, else how many were sent (never a text). */
    let logged: readonly string[] | number = keys.length;
    /** What came of the report, logged as a command is, a refusal too; never a text. */
    const noted = <T>(outcome: string, sent: T): T => {
      deps.log.info(
        { user: userId, guild, stops: logged, outcome },
        'field research was reported on the map',
      );
      return sent;
    };
    const named = await stopsNamed(request, reply, guild, keys);
    if ('sent' in named) return noted(named.outcome, named.sent);
    logged = named.stops.map((stop) => stop.key);
    const { administrator } = acting.standing;
    const kept = await keptFrom(reply, guild, userId, administrator, named.stops, doing);
    if (kept) return noted(kept.outcome, kept.sent);
    let subject: ResearchSubject;
    // "Same task at more stops…": by `sameAs`, or by a listed report's `task` with `more`
    // (review F3), asked about and answered in its words (`picked`, "Also reported").
    const more = 'sameAs' in body.data || body.data.more === true;
    if ('sameAs' in body.data) {
      // "Same task at more stops…" (`researchControls`): the task of a research report of this
      // server and of the period on now, as it was reported (a typed one with its reward, a
      // listed one gone from the list since).
      const base = await ctx.stopReports.get(guild, body.data.sameAs);
      // Of the period by the one rule (fix round 2, P4: `inPeriod`).
      if (base?.kind !== 'research' || !inPeriod(base, ctx.stopReports.period(guild, deps.now()))) {
        return noted('ended', refuse(reply, 409, REPORT_ENDED, { reason: 'ended' }));
      }
      subject = { subjectKey: base.subjectKey, research: base.research };
    } else {
      // A typed task's key (`typed:…`, the view's `task`) is no task: never stored as its text.
      if (/^typed:/iu.test(body.data.task.trim())) {
        return noted('refused', refuse(reply, 422, TYPED_TASK_KEY));
      }
      try {
        subject = readTask(ctx, body.data.task, body.data.reward ?? null, requestZone(request));
      } catch (err) {
        if (!(err instanceof UserError)) throw err;
        return noted('refused', refuse(reply, 422, err.message, listChanged(err)));
      }
    }
    const { settings } = ctx.config;
    const throttle = researchThrottle(settings);
    const key = { command: RESEARCH_REPORT, varies: true };
    const { replacing } = body.data;
    if (replacing === undefined) {
      // Other members' reports it contradicts are asked about first, uncounted (plan 8R-5, R7),
      // as `/research` asks in its dialog: send it again with `replacing`.
      const contested = await ctx.stopReports.contested(guild, named.stops, subject, userId);
      if (contested.length > 0) {
        // Discord refuses `/research report` for a full window before its dialog opens.
        const full = throttledOnTheMap(deps, reply, key, userId, throttle, { count: false });
        if (full) return noted('throttled', full);
        const shown = await shownTo(guild, userId, contested, request);
        const reports = shown?.research ?? [];
        // Those the map does not show the member by their ids and stops, so that the page can
        // still overrule them (review R5): since plan 8Z-2 only where the view could not be read,
        // since a stop of a region the member is kept out of was refused above (`keptFrom`).
        const hidden = contested
          .filter((report) => !reports.some((one) => one.id === report.id))
          .map((report) => ({ id: report.id, stop: report.stop.name }));
        return noted(
          'asks',
          refuse(
            reply,
            422,
            replaceQuestion(subject.research, contested.length > 1, more ? 'picked' : 'named'),
            {
              asks: { reports, ...(hidden.length === 0 ? {} : { hidden }) },
            },
          ),
        );
      }
    }
    const throttled = throttledOnTheMap(deps, reply, key, userId, throttle);
    if (throttled) return noted('throttled', throttled);
    const reporter = reporterNamed(userId, acting.member.name, session.userName);
    const countedAt = deps.now();
    const reported = await countedOnTheMap(deps, key, userId, throttle, () =>
      reportResearchAs(
        ctx,
        guild,
        {
          stops: named.stops,
          subject,
          reporter,
          ...(replacing === undefined ? {} : { replacing }),
        },
        more,
      ),
    );
    const { outcome } = reported;
    const made = outcome.saved.map(({ report }) => report);
    // Standing already (R8), or contradicted since and not to be replaced: kept, said as such.
    const standing = [...outcome.already, ...outcome.asks];
    const shown = await shownTo(guild, userId, [...made, ...standing], request);
    const among = (reports: readonly StopReport[]) =>
      (shown?.research ?? []).filter((one) => reports.some((report) => report.id === one.id));
    // The reporters by name, never an id; no link to Discord in the page's words.
    const view = {
      ...reported.view,
      already: (reported.view.already ?? []).map(({ report }) => {
        const by = report.reporter.name.trim();
        return { report, link: undefined, by: by === '' ? 'a member' : `**${plain(by)}**` };
      }),
    };
    const answer: StopReportAnswer = {
      ok: made.length > 0,
      text: answerWords(researchWords(view, channel), request),
      research: among(made),
      already: among(standing),
      ...(made.length === 0 ? { reason: 'already' as const } : {}),
    };
    // Every stop reported already: given back, as `/research` gives it back (plan 8R-6, Matt);
    // a use that reports at any stop counts.
    if (made.length === 0) {
      givenBackOnTheMap(deps, researchWindow(settings), userId, throttle, countedAt);
      return noted('already', reply.code(409).send(answer));
    }
    return noted('reported', reply.send(answer));
  });

  /** A Rocket report as the member sees it on the map: a grunt or a hideout, where shown. */
  const rocketShown = async (
    guild: string,
    userId: string,
    report: RocketReport,
    request: FastifyRequest,
  ): Promise<Pick<StopReportAnswer, 'grunt' | 'hideout'>> => {
    const shown = await shownTo(guild, userId, [report], request);
    const [grunt] = shown?.grunts ?? [];
    const [hideout] = shown?.hideouts ?? [];
    return { ...(grunt ? { grunt } : {}), ...(hideout ? { hideout } : {}) };
  };

  /** The question before a grunt replaces a hideout, with the hideout to say Replace to. */
  const askReplace = async (
    reply: FastifyReply,
    guild: string,
    userId: string,
    hideout: RocketReport,
    grunt: RocketChoice,
  ) =>
    refuse(reply, 422, hideoutQuestion(hideout.rocket.name, rocketLabel(grunt)), {
      asks: { replacing: hideout.id },
      ...(await rocketShown(guild, userId, hideout, reply.request)),
    });

  // A Rocket report (plan 8R-3), as `/rocket report` makes it: before the body is read, the
  // per-address limit and the guard of every POST. Then the session (403) and the body (400), who
  // reports, the stop (as for research), who was met (`readWho`: 422 in its words,
  // `LINEUPS_CHANGED` among them), none counted; a grunt where a hideout stands that the member
  // did not say Replace to (`replacing`) is the question `/rocket` asks in its dialog, as a 422
  // with the hideout's id, uncounted, unless `/rocket report`'s window is full (429, as Discord
  // opens no dialog then); only then the command's throttle in its window (`rocketWindow`); then
  // `reportRocketAs` as the member. What is none of the member's doing gives the use back (a
  // hideout reported meanwhile, asked about; a grunt posted nowhere; one overtaken), and so does
  // the same grunt standing already, "Already reported" (plan 8R-6, Matt: it does not count).
  scope.post('/api/rocket', { onRequest: writeGuards }, async (request: GuildRequest, reply) => {
    void reply.header('cache-control', 'no-store');
    const session = await sessions.of(request, reply);
    if (!session) return sendFailure(request, reply, 403);
    const body = rocketBodySchema.safeParse(request.body ?? {});
    if (!body.success) return sendFailure(request, reply, 400);
    const { guild } = request.params;
    const { userId } = session;
    const doing = 'reported Team GO Rocket';
    const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
    if ('sent' in acting) return acting.sent;
    /** The stop as the log names it: its key once found, else none (never a text). */
    let logged: { stop?: string } = {};
    const noted = <T>(outcome: string, sent: T): T => {
      deps.log.info(
        { user: userId, guild, ...logged, outcome },
        'Team GO Rocket was reported on the map',
      );
      return sent;
    };
    const named = await stopsNamed(request, reply, guild, [body.data.stop]);
    if ('sent' in named) return noted(named.outcome, named.sent);
    const [stop] = named.stops;
    if (stop === undefined) return noted('no-stop', sendFailure(request, reply, 404));
    logged = { stop: stop.key };
    // A stop of a region the member is kept out of, as for research (plan 8Z-2).
    const { administrator } = acting.standing;
    const kept = await keptFrom(reply, guild, userId, administrator, [stop], doing);
    if (kept) return noted(kept.outcome, kept.sent);
    let choice: RocketChoice;
    try {
      choice = readWho(ctx, body.data.who);
    } catch (err) {
      if (!(err instanceof UserError)) throw err;
      return noted('refused', refuse(reply, 422, err.message, listChanged(err)));
    }
    const { settings } = ctx.config;
    const throttle = rocketThrottle(settings);
    const key = { command: ROCKET_REPORT, varies: true };
    const { replacing } = body.data;
    const who = parseRocketKey(choice.key);
    const standing = await ctx.stopReports.rocketAt(guild, stop.key);
    if (
      who !== undefined &&
      !isHideout(who) &&
      standing !== undefined &&
      isHideoutReport(standing) &&
      standing.id !== replacing
    ) {
      // Discord refuses `/rocket report` for a full window before its dialog opens.
      const full = throttledOnTheMap(deps, reply, key, userId, throttle, { count: false });
      if (full) return noted('throttled', full);
      return noted('asks', await askReplace(reply, guild, userId, standing, choice));
    }
    const throttled = throttledOnTheMap(deps, reply, key, userId, throttle);
    if (throttled) return noted('throttled', throttled);
    const countedAt = deps.now();
    const reporter = reporterNamed(userId, acting.member.name, session.userName);
    let outcome: RocketAs;
    try {
      outcome = await reportRocketAs(
        ctx,
        guild,
        { choice, stop, reporter, ...(replacing === undefined ? {} : { replacing }) },
        channel,
      );
    } catch (err) {
      // No fault of the member's (the store failed): the use is given back, as on Discord.
      givenBackOnTheMap(deps, rocketWindow(settings), userId, throttle, countedAt);
      throw err;
    }
    switch (outcome.kind) {
      case 'reported': {
        const answer: StopReportAnswer = {
          ok: true,
          text: answerWords(rocketWords(outcome.view, channel), request),
          ...(await rocketShown(guild, userId, outcome.report, request)),
        };
        return noted('reported', reply.send(answer));
      }
      case 'already': {
        // Given back, as `/rocket` gives it back (plan 8R-6). The reporter by name, never an id.
        givenBackOnTheMap(deps, rocketWindow(settings), userId, throttle, countedAt);
        const by = outcome.standing.reporter.name.trim();
        const text = alreadyReported(
          outcome.standing,
          undefined,
          by === '' ? 'a member' : `**${plain(by)}**`,
        );
        const shown = await rocketShown(guild, userId, outcome.standing, request);
        return noted('already', refuse(reply, 409, text, { ...shown, reason: 'already' }));
      }
      case 'asks':
        // A hideout reported since the check above (or another than the one said): asked anew.
        givenBackOnTheMap(deps, rocketWindow(settings), userId, throttle, countedAt);
        return noted('asks', await askReplace(reply, guild, userId, outcome.standing, choice));
      case 'unposted':
      case 'overtaken':
        givenBackOnTheMap(deps, rocketWindow(settings), userId, throttle, countedAt);
        return noted(
          outcome.kind,
          refuse(reply, outcome.kind === 'unposted' ? 503 : 409, outcome.text),
        );
    }
  });

  // Taking a report back (plan 8R-3), as `/research remove` and `/rocket remove` do: before the
  // body is read, the per-address limit, the guard of every POST and an id that can be one (404).
  // Then the session (403), the body (nothing, 400), who takes it back; the report, of this server
  // and standing (409 `NOTHING_LEFT` otherwise, alike for an id of another server or none), the
  // member's own or any for staff (`isMapStaff` of the member fetched fresh; 403
  // `NOT_YOUR_REPORT`), none counted; only then the remove subcommand's throttle of its kind
  // (`MEMBER_WRITE_THROTTLE` under `research remove` or `rocket remove`); then `takeBackAs`.
  const knownId = async (request: RemoveRequest, reply: FastifyReply) => {
    if (!/^\d{1,10}$/u.test(request.params.id)) return sendFailure(request, reply, 404);
  };
  scope.post(
    '/api/stop-reports/:id/remove',
    { onRequest: [...writeGuards, knownId] },
    async (request: RemoveRequest, reply) => {
      void reply.header('cache-control', 'no-store');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 403);
      const body = removeBodySchema.safeParse(request.body ?? {});
      if (!body.success) return sendFailure(request, reply, 400);
      const { guild } = request.params;
      const id = Number(request.params.id);
      const { userId } = session;
      const doing = 'took back a report at a stop';
      const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
      if ('sent' in acting) return acting.sent;
      const noted = <T>(outcome: string, sent: T): T => {
        deps.log.info(
          { user: userId, guild, report: id, outcome },
          'a report at a stop was taken back on the map',
        );
        return sent;
      };
      const report = await ctx.stopReports.get(guild, id);
      if (!report) return noted('gone', refuse(reply, 409, NOTHING_LEFT));
      // The version the list showed (review L1): a grunt refined in place since keeps its id.
      const { madeAt } = body.data;
      if (madeAt !== undefined && report.madeAt !== madeAt) {
        return noted('changed', refuse(reply, 409, REPORT_CHANGED));
      }
      const staff = isMapStaff(acting.standing, userId, deps.parties.ownerId);
      if (!staff && report.reporter.id !== userId) {
        return noted('not-yours', refuse(reply, 403, NOT_YOUR_REPORT));
      }
      const key = { command: report.kind === 'research' ? RESEARCH_REMOVE : ROCKET_REMOVE };
      const throttled = throttledOnTheMap(deps, reply, key, userId, MEMBER_WRITE_THROTTLE);
      if (throttled) return noted('throttled', throttled);
      const taken = await countedOnTheMap(deps, key, userId, MEMBER_WRITE_THROTTLE, () =>
        takeBackAs(ctx, guild, madeAt === undefined ? id : { id, madeAt }, userId, staff),
      );
      switch (taken.kind) {
        case 'removed': {
          const answer: StopReportAnswer = { ok: true, text: words(taken.text, request) };
          return noted('removed', reply.send(answer));
        }
        case 'not-yours':
          return noted('not-yours', refuse(reply, 403, NOT_YOUR_REPORT));
        case 'changed':
          return noted('changed', refuse(reply, 409, REPORT_CHANGED));
        case 'gone':
          return noted('gone', refuse(reply, 409, NOTHING_LEFT));
      }
    },
  );
}

/** The regions each report lies in, by the report's id. */
type Places = ReadonlyMap<number, readonly Region[]>;

/**
 * The machine part of a reader's refusal (plan 8M-9B, B4): the task list or the lineups changed
 * under the choice (`ListChanged`, by its kind: review F8), `list-changed`, which a page acts on
 * by asking for its lists again.
 */
function listChanged(err: UserError): Pick<StopReportAnswer, 'reason'> {
  return err instanceof ListChanged ? { reason: 'list-changed' } : {};
}

/** A take-back's address: `/api/stop-reports/<id>/remove`. */
type RemoveRequest = FastifyRequest<{ Params: { guild: string; id: string } }>;

/**
 * Said where a research report's `task` is a typed task's key (`typed:…`): it names no task of
 * the list, and is no text to report.
 */
export const TYPED_TASK_KEY =
  'Pick the task from the list, or type it in full. To add stops to a task reported ' +
  'already, use "Same task at more stops…".';

/** The reports at stops one address may send in a minute (reports and taking back together). */
export const STOP_WRITES_PER_ADDRESS_MINUTE = 30;

/** A stop's key as a report sends it: a Wayfarer id, or `pine-<id>`. */
const stopKey = z.string().min(1).max(60);

/** The stops of a research report: one to five by key. */
const researchStops = z.array(stopKey).min(1).max(STOP_OPTIONS.length);

/** Whether a research report's body names more stops than `/research report` takes (X3). */
function tooManyStops(body: unknown): boolean {
  if (typeof body !== 'object' || body === null || !('stops' in body)) return false;
  return Array.isArray(body.stops) && body.stops.length > STOP_OPTIONS.length;
}

/**
 * The body of a research report: the task as `/research`'s `task:` takes it (a version or key of
 * the list, also a listed report's `task` for "Same task at more stops…" once that report is
 * gone, with `more: true`: review R4, F3; or typed in full), the reward of a typed task as its
 * `reward:` does; or instead of both `sameAs`, the id of a report whose task it is ("Same task at
 * more stops…" while that report stands); one to five stops by key. Anything else (both, or
 * neither) is malformed.
 */
const researchBodySchema = z.union([
  z
    .object({
      task: z.string().max(MAX_TYPED),
      reward: z.string().max(MAX_TYPED).optional(),
      more: z.literal(true).optional(),
      stops: researchStops,
      replacing: z.array(z.number().int().positive()).max(STOP_OPTIONS.length).optional(),
    })
    .strict(),
  z
    .object({
      sameAs: z.number().int().positive(),
      stops: researchStops,
      replacing: z.array(z.number().int().positive()).max(STOP_OPTIONS.length).optional(),
    })
    .strict(),
]);

/**
 * The body of a Rocket report: who as `/rocket`'s `who:` takes it (a key of the list, or a name
 * typed in full), the stop by key, and the hideout's id the member said Replace to.
 */
const rocketBodySchema = z
  .object({
    who: z.string().trim().min(1).max(100),
    stop: stopKey,
    replacing: z.number().int().positive().optional(),
  })
  .strict();

/** A take-back's body: nothing, or the version the list showed (`madeAt`, review L1). */
const removeBodySchema = z.object({ madeAt: z.number().int().nonnegative().optional() }).strict();
