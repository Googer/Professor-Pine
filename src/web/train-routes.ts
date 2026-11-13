import { readStopKey, type StopRef } from '../domain/party/stops.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app-context.js';
import {
  newPartyTimes,
  noForumWords,
  readTimes,
  typedTimedTime,
  type TimesRead,
} from '../commands/parties/timed.js';
import { ACTION_THROTTLE, partyOver } from '../commands/parties/reply.js';
import { CHANGE_THROTTLE } from '../commands/raids/change.js';
import type { ReportNames } from '../commands/raids/report.js';
import {
  ROUTE_STOP_THROTTLE,
  addStopAs,
  clearConductorAs,
  clearRouteAs,
  forgetRouteAs,
  GROUPS_CHANGED,
  loadRouteAs,
  manageRefusal,
  manageTrainAs,
  movedOnWords,
  moveStopAs,
  moveTrainAs,
  notSignedUpWords,
  removeStopAs,
  saveRouteAs,
  setConductorAs,
  SPLIT_FAILED,
  splitGroupAs,
  splitRefusal,
  splitRefusalFor,
  startTrainAs,
  trainPlaces,
  trainRefusal,
  type ConductorNamer,
  type SplitAnswer,
  type TrainAnswer as TrainChangeAnswer,
  type TrainManaging,
  type TrainStarting,
} from '../commands/trains/train-changes.js';
import { manageForm, ROUTE_CHOICES } from '../render/train-dialogs.js';
import { splitForm } from '../render/train-split.js';
import { RaidPrivacy } from '../domain/party/status.js';
import { aheadOnTheMap, formChoice, movesOnTheMap, refusalOnTheMap } from './train-views.js';
import { NO_START_TO_REMOVE, TRAIN_COMMAND, TRAIN_THROTTLE } from '../commands/trains/train.js';
import { OPEN_PARTIES_FULL, openPartiesFull } from '../commands/parties/open-parties.js';
import type { Region } from '../db/repositories/region-repository.js';
import { UserError } from '../discord/errors.js';
import type { MemberStanding } from '../discord/member-directory.js';
import type { MemberAccess } from '../discord/party-gateway.js';
import {
  attendeeOf,
  isGroupId,
  isTrain,
  mayArrange,
  MAX_PARTY_NAME,
  MAX_ROUTE_STOPS,
  TRAIN_AT_END,
  TRAIN_KINDS,
  type PartyProblem,
  type TrainParty,
} from '../domain/party/party.js';
import { tidyName } from '../domain/party/timed.js';
import {
  conductorDrawn,
  mayNotArrange,
  mayNotClear,
  mayNotLoad,
  mayNotMove,
  mayNotSplit,
  groupMark,
  splittableGroups,
} from '../domain/party/train.js';
import type { MapTrain } from '../domain/web/party-data.js';
import { mapParty } from '../domain/web/party-view.js';
import {
  CONDUCTOR_CHANGES,
  CONDUCTOR_SEEN,
  PANEL_PRESSES,
  ROUTE_EDITS,
  type ConductorChange,
  type MapManage,
  type MapSplit,
  type PanelPress,
  type RouteEdit,
  type SavedRoutesView,
  type TrainAnswer,
} from '../domain/web/train-data.js';
import { problemText } from '../render/activity.js';
import { PARTY_KIND } from '../render/party-controls.js';
import { plain, timestamp } from '../render/text.js';
import type { Member } from '../services/attendance-service.js';
import { forumBarred } from '../services/forum-access.js';
import {
  actingOnTheMap,
  countedOnTheMap,
  givenBackOnTheMap,
  isMapBotStaff,
  isMapStaff,
  memberOrFailure,
  throttledOnTheMap,
  unreachableOnTheMap,
} from './acting.js';
import { sendFailure } from './answers.js';
import { shownAfter } from './post-drawn.js';
import { timesCountedOnTheMap } from './times-on-map.js';
import { postGuard } from './csrf.js';
import type { GuildRequest } from './guild-routes.js';
import { pageWords } from './page-words.js';
import { limitedPerAddress, limitedRead, RateLimiter } from './rate-limit.js';
import type { WebDeps } from './server.js';

/**
 * What the trains of the live map read and call (plan 8M-5): exactly what `/train`, `/route`,
 * `/next` and the others, `/conductor` and `/meet`'s reader use (the members' settings, the party
 * and train services, the gyms and regions, the settings), so that the map shares their code
 * paths.
 */
export type TrainWebContext = TrainStarting &
  TrainManaging &
  Pick<AppContext, 'config' | 'regions' | 'meetupSafety' | 'servers'>;

/** What the trains of the live map need beyond the parties' own (`PartyWebDeps`). */
export interface TrainWebDeps {
  ctx: TrainWebContext;
  /** A channel's name as the bot sees it now: a region's, which an answer names. */
  channelName(channelId: string): string | undefined;
}

/**
 * The writes of trains one address may send in a minute, whoever sends them: a route is laid a
 * click a stop, and a household shares an address. Twice a member's own limit
 * (`MAP_WRITES_PER_MINUTE`), so that a member at full speed hears that limit's words.
 */
export const TRAIN_WRITES_PER_ADDRESS_MINUTE = 120;

/** The requests for a member's saved routes one address may make in a minute. */
const ROUTES_PER_MINUTE = 30;

/**
 * The openings of a train's forms that ask the server first (Manage…, Split…; plan 8M-8C) one
 * address may make in a minute, whoever makes them; their Submits are writes of trains.
 */
export const TRAIN_FORMS_PER_ADDRESS_MINUTE = 30;

/**
 * The body of a new train: the region (by id, as `/api/geo` lists it), the name as `/train` takes
 * it (up to its option's length; a blank one is refused in its words), the start as `/meet` takes
 * it, the mode as `/train`'s `at-end` offers it, and the kind as its `kind` does (plan 8X-5; a raid
 * train without one). Anything else is malformed.
 */
const startBodySchema = z
  .object({
    region: z.number().int().positive(),
    name: z.string().max(MAX_PARTY_NAME),
    time: z.string().max(40).optional(),
    atEnd: z.enum(TRAIN_AT_END).optional(),
    kind: z.enum(TRAIN_KINDS).optional(),
  })
  .strict();

/**
 * The route an edit was drawn from: its stops' keys in order (`stopKey`), as the train's view
 * gave them.
 */
const drawn = z.array(z.string().min(1).max(40)).max(MAX_ROUTE_STOPS);
/** A stop's number, from 1, as `/route remove` and `/route move` take it. */
const stopNumber = z.number().int().min(1).max(MAX_ROUTE_STOPS);
/** A saved route, by the id the list gave it. */
const savedRoute = z.number().int().positive();

/** The body of each edit of a route, as its subcommand's options are: anything else is malformed. */
const EDIT_BODIES = {
  // A stop by its key (`stopKey`, plan 8X-4): a gym's id, or `w` and a power spot's Wayfarer id.
  add: z
    .object({ drawn, stop: z.string().refine((key) => readStopKey(key) !== undefined) })
    .strict(),
  remove: z.object({ drawn, stop: stopNumber }).strict(),
  move: z.object({ drawn, from: stopNumber, to: stopNumber }).strict(),
  clear: z.object({ drawn }).strict(),
  save: z.object({ drawn, name: z.string().max(MAX_PARTY_NAME) }).strict(),
  load: z.object({ drawn, route: savedRoute }).strict(),
  forget: z.object({ route: savedRoute }).strict(),
} as const;

/** An edit of a route with what it names, as its subcommand's options give it. */
type EditInput =
  | ({ edit: 'add' } & z.infer<typeof EDIT_BODIES.add>)
  | ({ edit: 'remove' } & z.infer<typeof EDIT_BODIES.remove>)
  | ({ edit: 'move' } & z.infer<typeof EDIT_BODIES.move>)
  | ({ edit: 'clear' } & z.infer<typeof EDIT_BODIES.clear>)
  | ({ edit: 'save' } & z.infer<typeof EDIT_BODIES.save>)
  | ({ edit: 'load' } & z.infer<typeof EDIT_BODIES.load>)
  | ({ edit: 'forget' } & z.infer<typeof EDIT_BODIES.forget>);

/** The edit a body asks for; undefined for a malformed body. */
function editInput(edit: RouteEdit, body: unknown): EditInput | undefined {
  switch (edit) {
    case 'add': {
      const parsed = EDIT_BODIES.add.safeParse(body);
      return parsed.success ? { edit, ...parsed.data } : undefined;
    }
    case 'remove': {
      const parsed = EDIT_BODIES.remove.safeParse(body);
      return parsed.success ? { edit, ...parsed.data } : undefined;
    }
    case 'move': {
      const parsed = EDIT_BODIES.move.safeParse(body);
      return parsed.success ? { edit, ...parsed.data } : undefined;
    }
    case 'clear': {
      const parsed = EDIT_BODIES.clear.safeParse(body);
      return parsed.success ? { edit, ...parsed.data } : undefined;
    }
    case 'save': {
      const parsed = EDIT_BODIES.save.safeParse(body);
      return parsed.success ? { edit, ...parsed.data } : undefined;
    }
    case 'load': {
      const parsed = EDIT_BODIES.load.safeParse(body);
      return parsed.success ? { edit, ...parsed.data } : undefined;
    }
    case 'forget': {
      const parsed = EDIT_BODIES.forget.safeParse(body);
      return parsed.success ? { edit, ...parsed.data } : undefined;
    }
  }
}

function isRouteEdit(value: string): value is RouteEdit {
  return (ROUTE_EDITS as readonly string[]).includes(value);
}

/** What anything done to a train that has ended answers, as the commands do. */
const TRAIN_OVER = partyOver({ type: 'train' });

/** What the map's answer adds after a train is made: its route is laid on the map. */
export const ADD_STOPS = 'Tap gyms or Power Spots on the map to add stops to its route.';

/**
 * The refusals of a press made on a train that is no longer as the page drew it: answered 409
 * with the train as it is now, which the page draws.
 */
const STALE: ReadonlySet<PartyProblem> = new Set([
  'route-edited',
  'route-changed',
  'train-moved-on',
  'conductor-changed',
  'group-changed',
]);

/** The address of a train's route edit, saved routes, move or conductor. */
type TrainRequest = FastifyRequest<{
  Params: { guild: string; party: string; action?: string };
}>;

/**
 * The trains of the live map (spec 3.7): starting one (`POST /s/<guild>/api/trains`), which is
 * `/train` as the member in the region picked, with its start read as `/meet` reads it; the
 * edits of a train's route (`POST /s/<guild>/api/trains/<id>/route/<edit>`), each as its `/route`
 * subcommand, and the member's saved routes of its region (`GET …/routes`).
 */
export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
  const { sessions, parties, trains } = deps;
  const { ctx } = trains;
  /** What the cap of open trains and meetups reads (plan 8Z). */
  const openParties = () => ({
    parties: parties.store,
    guilds: parties.guilds,
    meetupSafety: ctx.meetupSafety,
  });

  /** The words of a command as text of the page, in the posts' zone. */
  const words = (text: string): string => pageWords(text, parties.zone, deps.now());

  /** A region in a sentence: `#west` as its channel reads, else `Region 5`. */
  const regionInWords = (region: Pick<Region, 'id' | 'channelId'>): string => {
    const name = trains.channelName(region.channelId);
    return name === undefined ? `Region ${region.id}` : `#${name}`;
  };

  /** How the map's answers name a post (not at all: the page shows the train) and a region. */
  const names: ReportNames = {
    post: () => undefined,
    channel: (channelId) => {
      const region = ctx.regions.byChannel(channelId);
      return region ? regionInWords(region) : `#${trains.channelName(channelId) ?? 'unknown'}`;
    },
  };

  /** How the member stands to a forum; rejects while Discord cannot say. */
  const accessTo = (forumId: string | null, userId: string): Promise<MemberAccess | undefined> =>
    forumId === null ? Promise.resolve(undefined) : parties.forums.memberAccess(forumId, userId);

  /** A train as the member sees it on the map now (`mapParty`): none without its post yet. */
  const viewOf = (
    guildId: string,
    guildRow: number,
    party: TrainParty,
    userId: string,
    standing: MemberStanding,
  ): MapTrain | undefined => {
    const shown = mapParty(party, {
      guildId,
      guildRow,
      parties: [],
      memberId: userId,
      barred: new Set(),
      now: deps.now(),
      zone: parties.zone,
      readOnly: false,
      staff: isMapStaff(standing, userId, parties.ownerId),
      botStaff: isMapBotStaff(standing, userId, parties.ownerId),
      look: (raid) => parties.look(raid),
      ...(parties.maxLook === undefined ? {} : { maxLook: parties.maxLook }),
      ...(parties.spotOf === undefined ? {} : { spotOf: parties.spotOf }),
      pictureOrigins: deps.pictureOrigins,
      // Why Move… and Manage… do not open, in Discord's words (review C1).
      trainRefusal: (reason) => refusalOnTheMap(parties, reason, words),
      // Move… as the post's dialog draws it (plan 8M-8C).
      trainMoves: (train) => movesOnTheMap(parties.stops, train, words),
      trainAhead: (train) => aheadOnTheMap(parties.stops, train, words),
    });
    return shown?.kind === 'train' ? shown : undefined;
  };

  /**
   * A refusal in the command's words, as text of the page; with the train as the member sees it
   * when they may see it (a refusal of who may: the page draws it again without the controls).
   */
  const refuse = (reply: FastifyReply, status: number, text: string, train?: MapTrain) => {
    const answer: TrainAnswer = { ok: false, text: words(text), ...(train ? { train } : {}) };
    return reply.code(status).send(answer);
  };

  /** The active train of this server by id, as the store has it (an ended one is not there). */
  const activeTrain = async (guild: string, partyId: string) => {
    const row = await parties.guilds.idFor(guild);
    const party = parties.store.get(partyId);
    return row !== undefined &&
      party?.guildId === row &&
      party.status === 'active' &&
      isTrain(party)
      ? { row, party }
      : undefined;
  };

  /** What a write to a train answers when it is over (or no train of this server). */
  const over = (reply: FastifyReply) => {
    const answer: TrainAnswer = { ok: false, text: TRAIN_OVER };
    return reply.code(409).send(answer);
  };

  /**
   * The checks every write to a train makes after the session and the body (the caller's, in
   * that order: 403, 400), in this order: who writes (`actingOnTheMap`), the train (an active
   * train of this server as the store has it; anything else 409 as the commands answer it), and
   * its forum (barred 403, as `AccessService` would not let them in; Discord unreachable 503).
   * None of them counts against a throttle.
   */
  const trainWrite = async (
    request: TrainRequest,
    reply: FastifyReply,
    userId: string,
    doing: string,
  ): Promise<
    | { sent: FastifyReply }
    | { userId: string; member: Member; standing: MemberStanding; row: number; party: TrainParty }
  > => {
    const { guild, party: partyId } = request.params;
    const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
    if ('sent' in acting) return acting;
    const found = await activeTrain(guild, partyId);
    if (!found) return { sent: over(reply) };
    try {
      if (await forumBarred(accessTo, found.party.forumChannelId, userId)) {
        return { sent: sendFailure(request, reply, 403) };
      }
    } catch (err) {
      return { sent: unreachableOnTheMap(deps, reply, err, guild, userId, doing) };
    }
    return { userId, member: acting.member, standing: acting.standing, ...found };
  };

  /**
   * What a change of a train answers: 200 when it was made; 409 when the train has ended, or the
   * press no longer fits the train (it moved on, its route changed); 422 for any other refusal;
   * the words as text, and the train as the member sees it now (not once it has ended).
   */
  const answered = (
    reply: FastifyReply,
    guild: string,
    row: number,
    partyId: string,
    userId: string,
    standing: MemberStanding,
    answer: TrainChangeAnswer,
  ) => {
    const status =
      answer.kind === 'ok'
        ? 200
        : answer.kind === 'gone' || (answer.reason !== undefined && STALE.has(answer.reason))
          ? 409
          : 422;
    const party = answer.kind === 'gone' ? undefined : parties.store.get(partyId);
    const train =
      party?.status === 'active' && isTrain(party)
        ? viewOf(guild, row, party, userId, standing)
        : undefined;
    const sent: TrainAnswer = {
      ok: answer.kind === 'ok',
      text: words(answer.text),
      ...(train ? { train } : {}),
    };
    return reply.code(status).send(sent);
  };

  const writeLimiter = new RateLimiter({ uses: TRAIN_WRITES_PER_ADDRESS_MINUTE, perMs: 60_000 });
  const writeGuards = [
    limitedPerAddress(writeLimiter, { now: deps.now }),
    postGuard(sessions, deps.settings.publicUrl),
  ];

  // A new train (spec 3.7): before the body is read (`onRequest`), the per-address limit and the
  // guard of every POST. Then the session (403) and the body (400), who starts it
  // (`actingOnTheMap`), the region (one of this server, else 404, so that nobody learns of other
  // servers' regions), its forum (none: `/train`'s words; barred 403, as the post would be one
  // the member cannot open; Discord unreachable 503), what `/train`'s guard and `/meet`'s reader
  // refuse (a blank name, a time that is none), and only then `/train`'s throttle in its window;
  // then `/train`'s code path as the member (`startTrainAs`), with the start.
  scope.post('/api/trains', { onRequest: writeGuards }, async (request: GuildRequest, reply) => {
    void reply.header('cache-control', 'no-store');
    const session = await sessions.of(request, reply);
    if (!session) return sendFailure(request, reply, 403);
    const body = startBodySchema.safeParse(request.body ?? {});
    if (!body.success) return sendFailure(request, reply, 400);
    const { guild } = request.params;
    const { userId } = session;
    const doing = 'started a train';
    const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
    if ('sent' in acting) return acting.sent;
    const row = await parties.guilds.idFor(guild);
    const region = ctx.regions.byId(body.data.region);
    if (row === undefined || region === undefined || region.guildId !== row) {
      return sendFailure(request, reply, 404);
    }
    if (region.forumChannelId === null) {
      return refuse(reply, 422, noForumWords(regionInWords(region)));
    }
    try {
      if (await forumBarred(accessTo, region.forumChannelId, userId)) {
        return sendFailure(request, reply, 403);
      }
    } catch (err) {
      return unreachableOnTheMap(deps, reply, err, guild, userId, doing);
    }
    if (tidyName(body.data.name) === undefined) {
      return refuse(reply, 422, problemText('bad-name', ctx.attendance.limits(), 'train'));
    }
    let start: number | undefined;
    const typed = body.data.time?.trim() ?? '';
    if (typed !== '') {
      try {
        // One clock for the reading, as `/train`'s guard reads it (`typedStart`).
        const now = deps.now();
        const read = typedTimedTime(
          ctx,
          newPartyTimes('train', now),
          'meet',
          typed,
          now,
          ctx.servers.zoneOf(guild),
        );
        // A word that removes a time, of a train that has none yet: refused as `/train` does.
        if (read === 'unset') return refuse(reply, 422, NO_START_TO_REMOVE);
        start = read.at;
      } catch (err) {
        if (!(err instanceof UserError)) throw err;
        return refuse(reply, 422, err.message);
      }
    }
    const staff = isMapStaff(acting.standing, userId, parties.ownerId);
    if (await openPartiesFull(openParties(), guild, userId, staff)) {
      return refuse(reply, 422, OPEN_PARTIES_FULL);
    }
    const throttled = throttledOnTheMap(
      deps,
      reply,
      { command: TRAIN_COMMAND },
      userId,
      TRAIN_THROTTLE,
    );
    if (throttled) return throttled;
    const countedAt = deps.now();
    let made: Awaited<ReturnType<typeof startTrainAs>>;
    try {
      made = await startTrainAs(
        ctx,
        acting.member,
        {
          name: body.data.name,
          regionChannelId: region.channelId,
          ...(body.data.atEnd === undefined ? {} : { atEnd: body.data.atEnd }),
          ...(body.data.kind === undefined ? {} : { kind: body.data.kind }),
          ...(start === undefined ? {} : { start }),
        },
        names,
      );
    } catch (err) {
      // No fault of the member's (a post Discord refused): the use is given back, as on Discord.
      givenBackOnTheMap(deps, TRAIN_COMMAND, userId, TRAIN_THROTTLE, countedAt);
      throw err;
    }
    deps.log.info(
      { user: userId, guild, region: region.id, outcome: made.kind },
      'a train was started on the map',
    );
    if (made.kind === 'refused') {
      // None of the member's doing (the post could not be made): given back, as on Discord.
      if (made.givesBack === true) {
        givenBackOnTheMap(deps, TRAIN_COMMAND, userId, TRAIN_THROTTLE, countedAt);
      }
      return refuse(reply, 422, made.text);
    }
    const party = parties.store.get(made.party.id);
    const train =
      party?.type === 'train' ? viewOf(guild, row, party, userId, acting.standing) : undefined;
    const { startTime } = made.party.timed;
    const when = startTime === null ? '' : ` It starts at ${timestamp(startTime)}.`;
    // Who made it may lay its route without being signed up, as after `/train`.
    const signUp =
      attendeeOf(made.party, userId) === undefined
        ? ` ${notSignedUpWords('in its popup or its post', true)}`
        : '';
    const answer: TrainAnswer = {
      ok: true,
      text: words(`${made.text}${when} ${ADD_STOPS}${signUp}`),
      ...(train ? { train } : {}),
    };
    return reply.send(answer);
  });

  // The member's saved routes of the region of a train, for the route editor's list (as the
  // autocomplete of `/route load` offers them): members only, an active train of this server
  // (409 otherwise) in a forum the member is not kept out of (403; 503 while Discord cannot say).
  scope.get(
    '/api/trains/:party/routes',
    { onRequest: limitedRead(ROUTES_PER_MINUTE, deps) },
    async (request: TrainRequest, reply) => {
      void reply.header('cache-control', 'private, no-store');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 401);
      const { guild, party: partyId } = request.params;
      const refused = await memberOrFailure(deps, request, reply, guild, session.userId);
      if (refused) return refused;
      const found = await activeTrain(guild, partyId);
      if (!found) return reply.code(409).send({ error: TRAIN_OVER });
      try {
        if (await forumBarred(accessTo, found.party.forumChannelId, session.userId)) {
          return sendFailure(request, reply, 403);
        }
      } catch (err) {
        deps.log.warn(
          { err, guild, user: session.userId },
          "could not ask Discord about a train's forum on the web pages",
        );
        return sendFailure(request, reply, 503);
      }
      const mine = await ctx.trains.savedRoutes(found.party.id, session.userId);
      const view: SavedRoutesView = {
        routes: mine.map((route) => ({
          id: route.id,
          name: route.name,
          stops: route.stops.length,
          atEnd: route.atEnd,
        })),
      };
      return view;
    },
  );

  // An edit of a train's route (spec 3.7), as its `/route` subcommand makes it: before the body is
  // read, the per-address limit, the guard of every POST and an edit the map knows (404
  // otherwise). Then the session (403) and the body (400), the checks of every write to a train
  // (`trainWrite`), whether the member may make the edit, as the service decides it
  // (`mayNotArrange`, `mayNotClear`, `mayNotLoad`: 403 in the command's words), a gym of this
  // server's regions (`reaches`; 404 otherwise, so that nobody learns of other servers' gyms),
  // and only then the subcommand's throttle in its window; then its code path, with the route the
  // edit was drawn from: one made on a route that changed meanwhile is refused (409, the train as
  // it is now).
  const knownEdit = async (request: TrainRequest, reply: FastifyReply) => {
    if (!isRouteEdit(request.params.action ?? '')) return sendFailure(request, reply, 404);
  };
  scope.post(
    '/api/trains/:party/route/:action',
    { onRequest: [...writeGuards, knownEdit] },
    async (request: TrainRequest, reply) => {
      void reply.header('cache-control', 'no-store');
      const edit = request.params.action ?? '';
      if (!isRouteEdit(edit)) return sendFailure(request, reply, 404);
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 403);
      const input = editInput(edit, request.body ?? {});
      if (!input) return sendFailure(request, reply, 400);
      const writing = await trainWrite(request, reply, session.userId, "changed a train's route");
      if ('sent' in writing) return writing.sent;
      const { userId, member, standing, row, party } = writing;
      const { guild } = request.params;
      const staff = isMapStaff(standing, userId, parties.ownerId);
      const forbidden =
        edit === 'add' || edit === 'remove' || edit === 'move'
          ? mayNotArrange(party, userId, staff)
          : edit === 'clear'
            ? mayNotClear(party, userId, isMapBotStaff(standing, userId, parties.ownerId))
            : edit === 'load'
              ? mayNotLoad(party, userId, staff)
              : undefined;
      if (forbidden) {
        const train = viewOf(guild, row, party, userId, standing);
        return refuse(reply, 403, trainRefusal(ctx, forbidden), train);
      }
      // A stop of no region of this server is none here, as for the list of `/route add`.
      const added = input.edit === 'add' ? readStopKey(input.stop) : undefined;
      if (input.edit === 'add' && (added === undefined || !ctx.trains.reaches(party, added))) {
        return sendFailure(request, reply, 404);
      }
      const counted = { command: `route ${edit}` };
      const throttle =
        edit === 'add' || edit === 'remove' || edit === 'move'
          ? ROUTE_STOP_THROTTLE
          : CHANGE_THROTTLE;
      const throttled = throttledOnTheMap(deps, reply, counted, userId, throttle);
      if (throttled) return throttled;
      const botStaff = isMapBotStaff(standing, userId, parties.ownerId);
      const answer = await countedOnTheMap(deps, counted, userId, throttle, () =>
        routeEdit(input, party, member, staff, botStaff),
      );
      deps.log.info(
        { user: userId, guild, party: party.id, edit, outcome: answer.kind },
        "a train's route was changed on the map",
      );
      await shownAfter(parties.drawn, party.id, answer.kind === 'ok');
      return answered(reply, guild, row, party.id, userId, standing, answer);
    },
  );

  /** The edit's code path, as its subcommand calls it. */
  const routeEdit = (
    input: EditInput,
    party: TrainParty,
    member: Member,
    staff: boolean,
    botStaff: boolean,
  ): Promise<TrainChangeAnswer> => {
    switch (input.edit) {
      case 'add':
        return addStopAs(ctx, party, member, readStopKeyOrThrow(input.stop), staff, input.drawn);
      case 'remove':
        return removeStopAs(ctx, party, member, input.stop, staff, input.drawn);
      case 'move':
        return moveStopAs(ctx, party, member, input.from, input.to, staff, input.drawn);
      case 'clear':
        return clearRouteAs(ctx, party, member, botStaff, input.drawn);
      case 'save':
        return saveRouteAs(ctx, party, member, input.name, input.drawn);
      case 'load':
        return loadRouteAs(ctx, party, member, input.route, staff, input.drawn);
      case 'forget':
        return forgetRouteAs(ctx, party, member.id, input.route);
    }
  };

  // A move on the map (spec 3.7): before the body is read, the per-address limit, the guard of
  // every POST and a move the map makes (404 otherwise: the old panel's `finish`, `reverse`,
  // `at-end` and `kind` are Manage…'s since plan 8M-8C, R1). Then the session (403) and the body
  // (400), the checks of every write to a train (`trainWrite`), whether the member may
  // (`mayNotMove`: 403 in the command's words), and only then the window of the post's controls
  // (`ACTION_THROTTLE`), as a press of the panel counts; then the service with where the panel was
  // drawn (`from`) and where the press leads (`target`): a press that no longer fits the train is
  // refused (409, the train as it is now). The movement is announced in the post as for any
  // move, with its ping.
  const knownPress = async (request: TrainRequest, reply: FastifyReply) => {
    if (!isPanelPress(request.params.action ?? '')) return sendFailure(request, reply, 404);
  };
  scope.post(
    '/api/trains/:party/move/:action',
    { onRequest: [...writeGuards, knownPress] },
    async (request: TrainRequest, reply) => {
      void reply.header('cache-control', 'no-store');
      const press = request.params.action ?? '';
      if (!isPanelPress(press)) return sendFailure(request, reply, 404);
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 403);
      const body = PRESS_BODY.safeParse(request.body ?? {});
      if (!body.success) return sendFailure(request, reply, 400);
      const writing = await trainWrite(request, reply, session.userId, 'moved a train');
      if ('sent' in writing) return writing.sent;
      const { userId, member, standing, row, party } = writing;
      const { guild } = request.params;
      const staff = isMapStaff(standing, userId, parties.ownerId);
      const forbidden = mayNotMove(party, userId, staff);
      if (forbidden) {
        const train = viewOf(guild, row, party, userId, standing);
        return refuse(reply, 403, trainRefusal(ctx, forbidden), train);
      }
      const counted = { control: PARTY_KIND };
      const throttled = throttledOnTheMap(deps, reply, counted, userId, ACTION_THROTTLE);
      if (throttled) return throttled;
      // Move…'s Submit (plan 8M-8C, R1): the post's dialog's words, Move… named as what takes a
      // finished route back, and a move drawn elsewhere refused with where the train is now.
      const moved = await countedOnTheMap(deps, counted, userId, ACTION_THROTTLE, () =>
        moveTrainAs(ctx, party, member, press, staff, 'post', body.data.from, body.data.target),
      );
      const answer =
        moved.kind === 'refused'
          ? { ...moved, text: movedOnWords(ctx, party.id, moved.reason, moved.text, 'post') }
          : moved;
      deps.log.info(
        { user: userId, guild, party: party.id, move: press, outcome: answer.kind },
        'a train was moved on the map',
      );
      await shownAfter(parties.drawn, party.id, answer.kind === 'ok');
      return answered(reply, guild, row, party.id, userId, standing, answer);
    },
  );

  /**
   * What every form of a train that asks the server before it opens checks (plan 8M-8C, as
   * Discord checks before its dialog): who opens it (`actingOnTheMap`, as a write: whether they
   * are staff is asked of the member fetched fresh), the train (`trainWrite`'s), and that the
   * window of the post's controls has a use left (429 in the router's words), counting nothing.
   */
  const opening = async (
    request: TrainRequest,
    reply: FastifyReply,
    doing: string,
  ): Promise<
    | { sent: FastifyReply }
    | { userId: string; standing: MemberStanding; staff: boolean; party: TrainParty }
  > => {
    void reply.header('cache-control', 'private, no-store');
    const session = await sessions.of(request, reply);
    if (!session) return { sent: sendFailure(request, reply, 401) };
    const writing = await trainWrite(request, reply, session.userId, doing);
    if ('sent' in writing) return writing;
    const { userId, standing, party } = writing;
    const full = throttledOnTheMap(deps, reply, { control: PARTY_KIND }, userId, ACTION_THROTTLE, {
      count: false,
    });
    if (full) return { sent: full };
    return { userId, standing, staff: isMapStaff(standing, userId, parties.ownerId), party };
  };

  const formRead = limitedRead(TRAIN_FORMS_PER_ADDRESS_MINUTE, deps);

  // Manage… on the map (plan 8M-8C): the form opens with what the post's dialog shows now
  // (`manageForm`), for who may move the train and staff, refused before it opens as the dialog is
  // (`manageRefusal`, 422 in its words) and while the window of the post's controls is full,
  // counting nothing (`opening`). Its Submit sends back what it showed with what is picked, and
  // goes the dialog's way (`manageTrainAs`): one use in the window of the post's controls.
  scope.get(
    '/api/trains/:party/manage',
    { onRequest: formRead },
    async (request: TrainRequest, reply) => {
      const opened = await opening(request, reply, 'opened Manage…');
      if ('sent' in opened) return opened.sent;
      const { userId, staff, party } = opened;
      const refused = manageRefusal(ctx, party, userId, staff);
      if (refused !== undefined) return reply.code(422).send({ error: words(refused) });
      // The times are the page's lines (`times`), not the dialog's sentence and field.
      const form = manageForm(trainPlaces(ctx, party));
      const view: MapManage = {
        title: form.title,
        text: words(form.text),
        ...(form.route === undefined ? {} : { route: formChoice(form.route) }),
        ...(form.atEnd === undefined ? {} : { atEnd: formChoice(form.atEnd) }),
        kind: formChoice(form.kind),
        ...(mayArrange(party, userId)
          ? {
              times: {
                zone: ctx.config.settings.timezone,
                startTime: party.timed.startTime,
                endTime: party.endTime,
              },
            }
          : {}),
        shown: form.shown,
      };
      return view;
    },
  );
  scope.post(
    '/api/trains/:party/manage',
    { onRequest: writeGuards },
    async (request: TrainRequest, reply) => {
      void reply.header('cache-control', 'no-store');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 403);
      const body = MANAGE_BODY.safeParse(request.body ?? {});
      if (!body.success) return sendFailure(request, reply, 400);
      const writing = await trainWrite(request, reply, session.userId, 'managed a train');
      if ('sent' in writing) return writing.sent;
      const { userId, member, standing, row, party } = writing;
      const { guild } = request.params;
      const staff = isMapStaff(standing, userId, parties.ownerId);
      const refused = manageRefusal(ctx, party, userId, staff);
      if (refused !== undefined) {
        return refuse(reply, 403, refused, viewOf(guild, row, party, userId, standing));
      }
      const { shown, picked: chosen } = body.data;
      const { start: typed, end: typedEnd, ...picked } = chosen;
      // The start as `/meet` reads it and the end as `/end` does, before anything counts, each in
      // its command's window: telling of a start pings everybody.
      const now = deps.now();
      let times: TimesRead = {};
      const asksStart = typed !== undefined && typed.trim() !== '';
      const asksEnd = typedEnd !== undefined && typedEnd.trim() !== '';
      if (asksStart || asksEnd) {
        if (!mayArrange(party, userId)) {
          const train = viewOf(guild, row, party, userId, standing);
          return refuse(reply, 403, trainRefusal(ctx, 'not-attending'), train);
        }
        try {
          times = readTimes(
            ctx,
            party,
            {
              ...(asksStart ? { start: typed.trim() } : {}),
              ...(asksEnd ? { end: typedEnd.trim() } : {}),
            },
            now,
          );
        } catch (err) {
          if (!(err instanceof UserError)) throw err;
          // What was typed alone is refused: the form stays, with what was picked.
          const kept: TrainAnswer = { ok: false, text: words(err.message), keepsForm: true };
          return reply.code(422).send(kept);
        }
      }
      const counting = timesCountedOnTheMap(deps, reply, userId, times);
      if ('full' in counting) return counting.full;
      const counted = { control: PARTY_KIND };
      const throttled = throttledOnTheMap(deps, reply, counted, userId, ACTION_THROTTLE);
      if (throttled) {
        counting.givenBack();
        return throttled;
      }
      const answer = await counting.run(() =>
        countedOnTheMap(deps, counted, userId, ACTION_THROTTLE, () =>
          manageTrainAs(ctx, party, member, staff, shown, { ...picked, ...times }, 'post', now),
        ),
      );
      // Times that came to nothing do not count towards their commands' windows.
      if (answer.kind === 'refused') counting.givenBack(answer.went);
      deps.log.info(
        { user: userId, guild, party: party.id, outcome: answer.kind },
        'a train was managed on the map',
      );
      const wrote = answer.kind === 'ok' || (answer.kind === 'refused' && answer.applied === true);
      await shownAfter(parties.drawn, party.id, wrote);
      return answered(reply, guild, row, party.id, userId, standing, answer);
    },
  );

  /**
   * How a split's answer names the new train (plan 8M-8C): by the name of the train in that post
   * (`Split off: Saturday legendaries (Fast)`), as the dialog names its post.
   */
  const splitNames: ReportNames = {
    ...names,
    post: (postId) => {
      const made = parties.store.active().find((one) => one.forumPostId === postId);
      return made && isTrain(made) ? `**${plain(made.timed.name)}**` : undefined;
    },
  };

  // Split… on the map (plan 8M-8C): the form opens with the dialog the member would be shown now
  // (`splitForm`: one group, the one they may split, or the choice of those they may split, for
  // the conductor and staff, `splittableGroups`), the member's privacy read as the dialog reads it;
  // refused before it opens as the dialog is (`splitRefusalFor`, 422 in its words) and while the
  // window of the post's controls is full, counting nothing. Its Submit sends the group and the
  // mark it was drawn with and goes the dialog's way (`splitGroupAs`): one use in the window of
  // the post's controls; a group called otherwise or gone since 409 (`GROUPS_CHANGED`), a split
  // that fails `SPLIT_FAILED` (500) with its use given back, a post the bot could not make 422
  // with its use given back.
  scope.get(
    '/api/trains/:party/split',
    { onRequest: formRead },
    async (request: TrainRequest, reply) => {
      const opened = await opening(request, reply, 'opened Split…');
      if ('sent' in opened) return opened.sent;
      const { userId, staff, party } = opened;
      const [first, ...rest] = splittableGroups(party, userId, staff);
      if (first === undefined) {
        return reply.code(422).send({ error: words(splitRefusalFor(ctx, party, userId, staff)) });
      }
      // A split counts in `/train`'s window and against the cap of open parties (plan 8Z): asked
      // here, counted at the Submit.
      const windowFull = throttledOnTheMap(
        deps,
        reply,
        { command: TRAIN_COMMAND },
        userId,
        TRAIN_THROTTLE,
        { count: false },
      );
      if (windowFull) return windowFull;
      if (await openPartiesFull(openParties(), request.params.guild, userId, staff)) {
        return reply.code(422).send({ error: words(OPEN_PARTIES_FULL) });
      }
      const settings = await ctx.users.get(userId);
      const form = splitForm(
        {
          ...trainPlaces(ctx, party),
          memberId: userId,
          staff,
          anonymous: settings.raidPrivacy === RaidPrivacy.Anonymous,
          now: deps.now(),
        },
        [first, ...rest],
      );
      const view: MapSplit = {
        title: form.title,
        text: words(form.text),
        ...(form.only === undefined ? {} : { only: form.only }),
        ...(form.choice === undefined
          ? {}
          : { choice: { label: form.choice.label, options: form.choice.options } }),
      };
      return view;
    },
  );
  scope.post(
    '/api/trains/:party/split',
    { onRequest: writeGuards },
    async (request: TrainRequest, reply) => {
      void reply.header('cache-control', 'no-store');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 403);
      const body = SPLIT_BODY.safeParse(request.body ?? {});
      if (!body.success || !isGroupId(body.data.group)) return sendFailure(request, reply, 400);
      const { group, mark } = body.data;
      const writing = await trainWrite(request, reply, session.userId, 'split a train');
      if ('sent' in writing) return writing.sent;
      const { userId, member, standing, row, party } = writing;
      const { guild } = request.params;
      const staff = isMapStaff(standing, userId, parties.ownerId);
      // Who may not split the group as the form drew it (`mayNotSplit`'s `not-in-group` and
      // `conductor-in-group`) is refused before anything is counted, 403 with the train (review C3,
      // as Manage…'s Submit refuses who may not move the train). What the train is now refuses by
      // the dialog's counted way (`splitGroupAs`, 422; re-review N2: Discord's Submit counts it),
      // as does a group drawn otherwise, which says where a group that went since went.
      if (groupMark(party, group) === mark) {
        const problem = mayNotSplit(party, userId, staff, group);
        if (problem === 'not-in-group' || problem === 'conductor-in-group') {
          const train = viewOf(guild, row, party, userId, standing);
          return refuse(reply, 403, splitRefusal(ctx, party, problem, group), train);
        }
      }
      if (await openPartiesFull(openParties(), guild, userId, staff)) {
        const train = viewOf(guild, row, party, userId, standing);
        return refuse(reply, 422, OPEN_PARTIES_FULL, train);
      }
      const counted = { control: PARTY_KIND };
      const throttled = throttledOnTheMap(deps, reply, counted, userId, ACTION_THROTTLE);
      if (throttled) return throttled;
      const countedAt = deps.now();
      // A split makes a train: `/train`'s window as well, its use given back for anything but a
      // train made (plan 8Z), as on Discord.
      const trainWindow = { command: TRAIN_COMMAND };
      const windowFull = throttledOnTheMap(deps, reply, trainWindow, userId, TRAIN_THROTTLE);
      if (windowFull) return windowFull;
      const noTrain = () => {
        givenBackOnTheMap(deps, trainWindow, userId, TRAIN_THROTTLE, countedAt);
      };
      let split: SplitAnswer;
      try {
        split = await countedOnTheMap(deps, counted, userId, ACTION_THROTTLE, () =>
          splitGroupAs(ctx, { party, member, group, staff, drawn: mark }, splitNames),
        );
      } catch (err) {
        noTrain();
        // The use went back (`countedOnTheMap`); the member is told nothing was split off.
        deps.log.error({ err, guild, party: party.id }, 'a split on the map failed');
        const failed: TrainAnswer = { ok: false, text: SPLIT_FAILED };
        return reply.code(500).send(failed);
      }
      if (split.kind !== 'split') noTrain();
      deps.log.info(
        { user: userId, guild, party: party.id, outcome: split.kind },
        'a train was split on the map',
      );
      // The post of the train the group leaves; the new train's is new, and the list fetches it.
      await shownAfter(parties.drawn, party.id, split.kind === 'split');
      if (split.kind === 'refused' && split.givesBack === true) {
        givenBackOnTheMap(deps, counted, userId, ACTION_THROTTLE, countedAt);
      }
      const answer: TrainChangeAnswer =
        split.kind === 'split' || split.kind === 'already'
          ? { kind: 'ok', text: split.text }
          : split.kind === 'gone'
            ? split
            : split.reason === 'group-changed'
              ? { kind: 'refused', text: GROUPS_CHANGED, reason: 'group-changed' }
              : { kind: 'refused', text: split.text };
      return answered(reply, guild, row, party.id, userId, standing, answer);
    },
  );

  // Taking the conductor role or giving it up (spec 3.7), as `/conductor set` and `/conductor
  // clear` do: the per-address limit, the guard of every POST and a change the map knows (404),
  // the session (403), the body (whose the role was when the page drew the button; 400), the
  // checks of every write to a train, a button drawn when the role was another's than it is now
  // (409, the train as it is now), whether the member may (signed up to take it; the conductor or
  // staff to give it up or take it off another: 403 in the command's words), and only then the
  // command's throttle in its window.
  const knownConductor = async (request: TrainRequest, reply: FastifyReply) => {
    if (!isConductorChange(request.params.action ?? '')) return sendFailure(request, reply, 404);
  };
  scope.post(
    '/api/trains/:party/conductor/:action',
    { onRequest: [...writeGuards, knownConductor] },
    async (request: TrainRequest, reply) => {
      void reply.header('cache-control', 'no-store');
      const change = request.params.action ?? '';
      if (!isConductorChange(change)) return sendFailure(request, reply, 404);
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 403);
      const body = conductorBodySchema.safeParse(request.body ?? {});
      if (!body.success) return sendFailure(request, reply, 400);
      const writing = await trainWrite(
        request,
        reply,
        session.userId,
        "changed a train's conductor",
      );
      if ('sent' in writing) return writing.sent;
      const { userId, member, standing, row, party } = writing;
      const { guild } = request.params;
      // Checked here, uncounted, and again inside the store, for a change on its way meanwhile.
      const changed = conductorDrawn(party, userId, body.data.who);
      if (changed) {
        const train = viewOf(guild, row, party, userId, standing);
        const stale: TrainAnswer = {
          ok: false,
          text: trainRefusal(ctx, changed),
          ...(train ? { train } : {}),
        };
        return reply.code(409).send(stale);
      }
      const staff = isMapStaff(standing, userId, parties.ownerId);
      const forbidden =
        change === 'take'
          ? attendeeOf(party, userId) === undefined
            ? 'not-attending'
            : undefined
          : party.train.conductorId === null
            ? undefined
            : mayNotClear(party, userId, staff);
      if (forbidden) {
        const train = viewOf(guild, row, party, userId, standing);
        return refuse(reply, 403, trainRefusal(ctx, forbidden), train);
      }
      const counted = { command: change === 'take' ? 'conductor set' : 'conductor clear' };
      const throttled = throttledOnTheMap(deps, reply, counted, userId, CHANGE_THROTTLE);
      if (throttled) return throttled;
      const answer = await countedOnTheMap(deps, counted, userId, CHANGE_THROTTLE, () =>
        change === 'take'
          ? setConductorAs(ctx, party, member, CONDUCTOR_BEFORE, body.data.who)
          : clearConductorAs(ctx, party, member, staff, body.data.who),
      );
      deps.log.info(
        { user: userId, guild, party: party.id, conductor: change, outcome: answer.kind },
        "a train's conductor was changed on the map",
      );
      await shownAfter(parties.drawn, party.id, answer.kind === 'ok');
      return answered(reply, guild, row, party.id, userId, standing, answer);
    },
  );
}

/** A key the body's schema took as a stop's (`readStopKey`). */
function readStopKeyOrThrow(key: string): StopRef {
  const stop = readStopKey(key);
  if (stop === undefined) throw new Error(`not a stop: ${key}`);
  return stop;
}

/** The map names nobody: a takeover's answer says "the conductor before". */
const CONDUCTOR_BEFORE: ConductorNamer = () => 'the conductor before';

/** Where the train was when the panel was drawn (`placeOf`), and where a press leads. */
const place = z.string().min(1).max(20);

/** The body of a move, as its button carries it: anything else is malformed. */
const PRESS_BODY = z.object({ from: place, target: place }).strict();

/**
 * The body of Manage…'s Submit (plan 8M-8C): what the form showed, as the dialog's custom id
 * carries it, and what is picked, with the start as it was typed; anything else is malformed.
 */
const MANAGE_BODY = z
  .object({
    shown: z
      .object({
        from: place,
        first: place,
        atEnd: z.enum(TRAIN_AT_END),
        kind: z.enum(TRAIN_KINDS),
      })
      .strict(),
    picked: z
      .object({
        kind: z.enum(TRAIN_KINDS),
        route: z.enum(ROUTE_CHOICES).optional(),
        atEnd: z.enum(TRAIN_AT_END).optional(),
        start: z.string().max(40).optional(),
        end: z.string().max(40).optional(),
      })
      .strict(),
  })
  .strict();

/** A conductor's change carries whose the role was when the page drew its button. */
const conductorBodySchema = z.object({ who: z.enum(CONDUCTOR_SEEN) }).strict();

/**
 * The body of Split…'s Submit (plan 8M-8C): the group by its letter and the mark the form was
 * drawn with (`groupMark`, `<stamp>.<hash>`); anything else is malformed.
 */
const SPLIT_BODY = z
  .object({
    group: z.string().regex(/^[A-E]$/u),
    mark: z.string().min(1).max(40),
  })
  .strict();

function isPanelPress(value: string): value is PanelPress {
  return (PANEL_PRESSES as readonly string[]).includes(value);
}

function isConductorChange(value: string): value is ConductorChange {
  return (CONDUCTOR_CHANGES as readonly string[]).includes(value);
}
