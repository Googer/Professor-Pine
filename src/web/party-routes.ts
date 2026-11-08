import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ACTION_THROTTLE,
  outcomeWords,
  partyOver,
  pressStatus,
  remoteWords,
  type PressAnswerer,
  type StatusPress,
} from '../commands/parties/reply.js';
import type { MemberStanding } from '../discord/member-directory.js';
import type { MemberAccess } from '../discord/party-gateway.js';
import type { Throttles } from '../discord/throttle.js';
import {
  attendeeOf,
  isGroupId,
  type GroupId,
  type MaxParty,
  type Party,
  type RaidParty,
} from '../domain/party/party.js';
import {
  MAP_ACTIONS,
  MAP_ANSWER,
  MAP_COUNTS,
  MAP_REMOTE,
  type MapAction,
  type MapCount,
  type MapRegroup,
  type PressAnswer,
} from '../domain/web/party-data.js';
import {
  mapParty,
  partyView,
  type MaxLook,
  type PartyViewInput,
  type RaidLook,
} from '../domain/web/party-view.js';
import { EGG_PICTURE_NAMES } from '../domain/pogo/raid-eggs.js';
import { allowedPicture } from '../domain/web/picture.js';
import { EGG_PATH } from '../services/egg-pictures.js';
import type { PartyProvider } from '../services/party-store.js';
import { isRaidAction, PARTY_KIND } from '../render/party-controls.js';
import { layoutThumbnails, type PostLayout } from '../render/party-post.js';
import type { PlacePictures } from '../services/post-pictures.js';
import { linkedPosts, postKey, postView, type PostViewOptions } from '../render/post-view.js';
import { regroupOnTheMap } from '../render/group-dialogs.js';
import { unplain } from '../render/text.js';
import { spawnShowsPlacePicture } from './spawn-seen.js';
import type {
  AttendanceOutcome,
  AttendanceService,
  Member,
} from '../services/attendance-service.js';
import {
  actingOnTheMap,
  countedOnTheMap,
  isMapBotStaff,
  isMapStaff,
  mayDeleteOnTheMap,
  throttledOnTheMap,
  UNREACHABLE,
} from './acting.js';
import { sendFailure } from './answers.js';
import { postGuard } from './csrf.js';
import { etagMatches, etagOf } from './geo-cache.js';
import type { GuildRequest } from './guild-routes.js';
import type { StopLookup } from '../render/train-stops.js';
import { pageWords } from './page-words.js';
import type { PartyViewers } from './party-viewers.js';
import { limitedPerAddress, RateLimiter } from './rate-limit.js';
import type { WebDeps } from './server.js';
import { aheadOnTheMap, movesOnTheMap, refusalOnTheMap } from './train-views.js';
import { shownAfter, type PostDraws } from './post-drawn.js';

/**
 * The requests for a server's parties one address may make in a minute: a page polls every 20
 * seconds, or at a live signal, at most 12 a minute, and every 2 minutes (`src/web/client/live.ts`),
 * and at once after a press; mobile carriers and venue Wi-Fi share an address among about 8 live
 * pages and 8 polling ones. Each may ask Discord, at most once a minute per member and forum.
 */
export const PARTIES_PER_MINUTE = 120;

/**
 * What the parties' addresses (and the reports at stops, plan 8R-3) answer while Discord cannot
 * say whether somebody is a member.
 */
export const UNCONFIRMED =
  'Discord cannot be reached just now, so I cannot tell whether you are a member.';

/** What the live map's parties need (plan 8M-3). */
export interface PartyWebDeps {
  /** The row of a server (`Guild.id`), by which a party says whose it is. */
  guilds: { idFor(snowflake: string): Promise<number | undefined> };
  /** The active parties (`PartyStore`): an ended party is never read from the database. */
  store: Pick<PartyProvider, 'active' | 'get' | 'raidAt'>;
  /** How a raid's post looks (`raidLook` of the party service's view of it). */
  look(raid: RaidParty): RaidLook;
  /**
   * How a max battle's post looks (`maxLook` of the party service's view of it, plan 8X-5); left
   * out: no max battle is shown.
   */
  maxLook?: (party: MaxParty) => MaxLook;
  /**
   * A power spot Pine keeps, by its Wayfarer id, for a train's route on the map (plan 8X-4);
   * left out: none is known.
   */
  spotOf?: (id: string) => { name: string; lat: number; lon: number } | undefined;
  /**
   * The stops of trains' routes as they are now (`PartyService.stops`): a train's Move… on the map
   * names them as the post's dialog does (plan 8M-8C).
   */
  stops: StopLookup;
  /**
   * The layout a party's post was last shown with (plan 8M-8A, `PartyService.layoutOf`), which the
   * map draws as its popup; undefined while it has none.
   */
  layoutOf(partyId: string): PostLayout | undefined;
  /**
   * The draws of the parties' posts (plan 8M-11A, S1, `PartyService.drawTicket` and `shown`): a
   * change on the map answers once its post shows it (`shownAfter`), so that the page's poll right
   * after it gets the post with the change.
   */
  drawn: PostDraws;
  /** The title of a party's post (`PartyService.postTitle`): a split train names the other by it. */
  titleOf(party: Party): string;
  /**
   * The pictures of places beside a post's Where (plan 8M-8A, `PlacePictures`), named by their gym
   * or Wayspot and served from the image cache.
   */
  places: Pick<PlacePictures, 'keyOf' | 'urlOf' | 'read'>;
  /** How a member stands to a forum (`PartyGateway.memberAccess`). */
  forums: { memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined> };
  /** `settings.timezone`: the posts' times, which the page shows. */
  zone: string;
  /** What a press does: what the post's buttons call (`pressStatus`). */
  attendance: Pick<
    AttendanceService,
    | 'signUp'
    | 'joinInto'
    | 'joinChosen'
    | 'done'
    | 'leave'
    | 'setRemote'
    | 'changeNumber'
    | 'answer'
    | 'joinStamped'
    | 'setMeetingTime'
    | 'limits'
    | 'lobbyOf'
  >;
  /** Who presses, fetched fresh from Discord as a button carries them (`DiscordWebMembers`). */
  acting: ActingMembers;
  /**
   * Where the uses of the post's controls are counted (the router's): a press on the map counts
   * in the same window as a click on the post (`ACTION_THROTTLE`).
   */
  throttles: Throttles;
  /** `OWNER_ID`: the bot's owner is staff in every server, as the commands' guards have it. */
  ownerId: string;
  /**
   * What staff's Delete… shows (plan 8M-8B): whether the bot may delete a party's post
   * (`PartyService.mayDeletePost`, as `/delete`'s dialog asks it), and a channel's name as the bot
   * sees it (the forum, named where it may not).
   */
  closing: {
    mayDeletePost(partyId: string): boolean;
    channelName(channelId: string): string | undefined;
  };
}

/** A forum as the map names it in staff's Delete…: `#west-raids`, `its forum` where unknown. */
export function forumOnTheMap(deps: PartyWebDeps, forumId: string | null): string {
  const name = forumId === null ? undefined : deps.closing.channelName(forumId);
  return name === undefined ? 'its forum' : `#${name}`;
}

/**
 * The member who presses, as Discord has them now: their name and team as a button carries them,
 * with their roles and whether they are an administrator (`standing`, for the map's member
 * role); somebody not in the server; or a member who may not act now, timed out (`timed-out`) or
 * not through the server's membership screening yet (`pending`), unless they are an
 * administrator.
 */
export type ActingAnswer =
  | {
      kind: 'member';
      member: Member;
      standing: MemberStanding;
      /** The ids of the roles they hold, without the role every member has (plan 8M-20, R2). */
      roleIds: readonly string[];
      /** When Discord's answer came: what `roleIds` is of (`RoleMember.seenAt`). */
      fetchedAt: number;
    }
  | { kind: 'not-member' }
  | { kind: 'timed-out' }
  | { kind: 'pending' };

/** Who presses, as Discord has them now (`DiscordWebMembers`). */
export interface ActingMembers {
  /** Rejects when Discord cannot be asked. */
  acting(guildId: string, userId: string): Promise<ActingAnswer>;
}

/** The presses one address may send in a minute, whoever sends them. */
export const PRESSES_PER_ADDRESS_MINUTE = 60;

/**
 * The posts one address may ask for in a minute (plan 8M-8A): a page asks for a party's post when
 * its popup opens and its key changed, and keeps each by its key. Four times the list's limit, as
 * before live signals; a post refused is asked for again at the next draw.
 */
export const POSTS_PER_MINUTE = 480;

/**
 * The places' pictures one address may ask for in a minute (plan 8M-8A): a popup shows one, the
 * browser keeps each for a day.
 */
export const PLACE_PICTURES_PER_MINUTE = 240;

/**
 * An egg's picture a post carries as a file (`attachment://<name>.png`: posts made before the web
 * server listened, or on an address Discord cannot reach) as the web server's own `/eggs/`, which
 * serves every egg the posts name (review 8A-15); undefined for any other address.
 */
export function eggServed(url: string): string | undefined {
  const name = /^attachment:\/\/([\w-]+\.png)$/u.exec(url)?.[1];
  return name !== undefined && EGG_PICTURE_NAMES.includes(name.slice(0, -4))
    ? `${EGG_PATH}${name}`
    : undefined;
}

/** How a post links another post the member may not see on the map (a split train's). */
export const OTHER_POST = 'another post';

/**
 * Whether a post's address may be a link on the map (plan 8M-8A): Google Maps (a Where's Map),
 * a post or message of this server on Discord, and Pine's own pages; https only (Pine's own
 * address as `publicUrl` has it), no user or password. Anything else is shown as its text.
 */
export function linkableOnTheMap(url: string, guildId: string, publicUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.username !== '' || parsed.password !== '') return false;
  if (parsed.origin === new URL(publicUrl).origin) return true;
  if (parsed.protocol !== 'https:' || parsed.port !== '') return false;
  if (parsed.hostname === 'www.google.com') return /^\/maps(?:\/|$)/u.test(parsed.pathname);
  if (parsed.hostname === 'discord.com') return parsed.pathname.startsWith(`/channels/${guildId}/`);
  return false;
}

/**
 * The body of a press: the group a newcomer chose in the popup (plan 8X-1B), only with `join`,
 * `interested` and `here`. Anything else is malformed.
 */
const pressBodySchema = z
  .object({
    group: z
      .string()
      .regex(/^[A-E]$/u)
      .optional(),
  })
  .strict();

/** What a press says: whether it was done, and the words. */
type Said = { ok: boolean; text: string };

/** The status of each outcome of a press. */
const PRESS_STATUS: Readonly<Record<AttendanceOutcome['kind'], number>> = {
  ok: 200,
  refused: 422,
  gone: 409,
};

/** The post's button a press on the map is (`StatusPress`). */
function statusPress(action: MapAction, group: GroupId | undefined): StatusPress {
  switch (action) {
    case 'interested':
      return group === undefined
        ? { action: 'maybe' }
        : { action: 'chosen', status: 'maybe', group };
    case 'join':
      return group === undefined ? { action: 'join' } : { action: 'chosen', status: 'join', group };
    case 'here':
      return group === undefined ? { action } : { action: 'chosen', status: 'here', group };
    case 'leave':
    case 'done':
      return { action };
  }
}

function isMapAction(value: string): value is MapAction {
  return (MAP_ACTIONS as readonly string[]).includes(value);
}

function isMapCount(value: string): value is MapCount {
  return (MAP_COUNTS as readonly string[]).includes(value);
}

/** Every press the map takes: the statuses, Remote, +1 and −1, an answer to the question. */
function isPress(value: string): boolean {
  return isMapAction(value) || isMapCount(value) || value === MAP_REMOTE || value === MAP_ANSWER;
}

/** The body of an answer to the completion question (plan 8M-8B): "Yes, done" or "Not yet". */
const answerBodySchema = z.object({ yes: z.boolean() }).strict();

/**
 * The post's button a press of the map is, by its action and body (`StatusPress`); undefined for
 * Remote (`MAP_REMOTE`, toggled apart), and `malformed` for a body the action does not take: a
 * group only with Interested, Join and Here, `{ yes }` only and always with an answer.
 */
function pressOf(action: string, body: unknown): StatusPress | undefined | 'malformed' {
  if (action === MAP_ANSWER) {
    const answer = answerBodySchema.safeParse(body ?? {});
    return answer.success ? { action: 'answer', yes: answer.data.yes } : 'malformed';
  }
  const parsed = pressBodySchema.safeParse(body ?? {});
  if (!parsed.success) return 'malformed';
  const { group } = parsed.data;
  const takesGroup = action === 'join' || action === 'interested' || action === 'here';
  if (group !== undefined && (!takesGroup || !isGroupId(group))) return 'malformed';
  if (isMapAction(action)) return statusPress(action, group);
  if (isMapCount(action)) return { action };
  return action === MAP_REMOTE ? undefined : 'malformed';
}

/** A post's address: `/api/parties/<party id>/post?k=<its key>`. */
type PostRequest = FastifyRequest<{
  Params: { guild: string; party: string };
  Querystring: { k?: string };
}>;

/** A place's picture's address: `/pictures/gym/<id>` or `/pictures/wayspot/<Wayfarer id>`. */
type PlaceRequest = FastifyRequest<{ Params: { guild: string; kind: string; id: string } }>;

/** A press's address: `/api/parties/<party id>/<action>`. */
type PressRequest = FastifyRequest<{
  Params: { guild: string; party: string; action: string };
}>;

/**
 * The live map's parties (`/s/<guild>/api/parties`, spec 3.2 to 3.4): the active parties of the
 * server as the member who asks sees them (`partyView`), for members only (`PartyViewers`: 401
 * without a session, 403 for anybody who is not a member, 503 while Discord cannot say and has
 * not said lately), read-only while Discord cannot be asked. The view is the member's own: an
 * ETag of its JSON, `private, no-cache`, 304 when the page has it already. `viewers` is shared
 * with the reports at stops (plan 8R-3), so that what Discord said of a forum serves both.
 */
export function partyRoutes(scope: FastifyInstance, deps: WebDeps, viewers: PartyViewers): void {
  const { parties, sessions } = deps;
  /**
   * Group… of a party for whoever is not signed up for it, once per party object (the map's view
   * cache): a changed party is a new object, and `regroupOnTheMap` reads nothing else that changes.
   */
  const newcomersRegroup = new WeakMap<Party, { regroup: MapRegroup | undefined }>();

  /**
   * The view input of a member: the server's active parties (`own`, of the server's row) and
   * what the member may see of them.
   */
  const inputFor = (
    guildId: string,
    own: { row: number; parties: readonly Party[] },
    memberId: string,
    viewer: {
      readOnly: boolean;
      barred: Set<string>;
      hidden?: Set<string>;
      standing: MemberStanding | undefined;
    },
  ): PartyViewInput => ({
    guildId,
    guildRow: own.row,
    parties: own.parties,
    memberId,
    barred: viewer.barred,
    // Report… only from a forum the member sees on Discord (review W-7).
    ...(viewer.hidden === undefined ? {} : { hidden: viewer.hidden }),
    now: deps.now(),
    zone: parties.zone,
    readOnly: viewer.readOnly,
    lobbySize: (party) => parties.attendance.lobbyOf(party),
    staff: isMapStaff(viewer.standing, memberId, parties.ownerId),
    botStaff: isMapBotStaff(viewer.standing, memberId, parties.ownerId),
    mayClose: mayDeleteOnTheMap(viewer.standing, memberId, parties.ownerId),
    look: (raid) => parties.look(raid),
    ...(parties.maxLook === undefined ? {} : { maxLook: parties.maxLook }),
    ...(parties.spotOf === undefined ? {} : { spotOf: parties.spotOf }),
    pictureOrigins: deps.pictureOrigins,
    // Staff's Delete… as `/delete`'s dialog asks it (plan 8M-8B).
    closing: (party) => ({
      mayDelete: parties.closing.mayDeletePost(party.id),
      forum: forumOnTheMap(parties, party.forumChannelId),
    }),
    // Group… as the post's dialog decides and words it (plan 8M-8B).
    regroup: (party) => {
      const build = (): MapRegroup | undefined =>
        regroupOnTheMap(
          {
            party,
            memberId,
            lobbySize: parties.attendance.lobbyOf(party),
            zone: parties.zone,
            now: deps.now(),
          },
          parties.attendance.limits(),
        );
      // A member signed up has a Group… of their own. For everybody else it is one and the same.
      if (attendeeOf(party, memberId) !== undefined) return build();
      const kept = newcomersRegroup.get(party);
      if (kept) return kept.regroup;
      const regroup = build();
      newcomersRegroup.set(party, { regroup });
      return regroup;
    },
    postKey: (party) => {
      const layout = parties.layoutOf(party.id);
      return layout === undefined ? undefined : postKey(layout);
    },
    // Why Move… and Manage… do not open, in Discord's words (review C1); Move… of a train as the
    // post's dialog draws it, and what lies ahead (plan 8M-8C).
    trainRefusal: (reason) => refusalOnTheMap(parties, reason, words),
    trainMoves: (train) => movesOnTheMap(parties.stops, train, words),
    trainAhead: (train) => aheadOnTheMap(parties.stops, train, words),
  });

  /** The bot's words as text of the page, in the posts' zone. */
  const words = (text: string): string => pageWords(text, parties.zone, deps.now());

  /**
   * How a post is drawn for a member (plan 8M-8A, `postView`): its picture only from the hosts the
   * page may load, links only to the addresses `linkableOnTheMap` allows, another post named by
   * its title where the member may see that party on the map, else `OTHER_POST`.
   */
  const viewOptions = (
    guildId: string,
    own: { parties: readonly Party[] },
    input: PartyViewInput,
  ): PostViewOptions => ({
    emoji: (id) => deps.emoji.address(id),
    thumbnail: (url) => {
      const key = parties.places.keyOf(url);
      return key === undefined ? undefined : `/s/${guildId}/pictures/${key}`;
    },
    picture: (url) => eggServed(url) ?? allowedPicture(url, deps.pictureOrigins),
    linkable: (url) => linkableOnTheMap(url, guildId, deps.settings.publicUrl),
    channel: (postId) => {
      const other = own.parties.find((party) => party.forumPostId === postId);
      const seen = other !== undefined && mapParty(other, input) !== null;
      return {
        href: `https://discord.com/channels/${guildId}/${postId}`,
        name: seen ? parties.titleOf(other) : OTHER_POST,
      };
    },
  });

  /** The active parties of a server; none for a server without its row yet. */
  const ownParties = async (guildId: string) => {
    const row = await parties.guilds.idFor(guildId);
    return {
      row: row ?? 0,
      parties:
        row === undefined ? [] : parties.store.active().filter((party) => party.guildId === row),
    };
  };

  const limiter = new RateLimiter({ uses: PARTIES_PER_MINUTE, perMs: 60_000 });
  scope.get(
    '/api/parties',
    { onRequest: limitedPerAddress(limiter, { now: deps.now }) },
    async (request: GuildRequest, reply) => {
      void reply.header('cache-control', 'private, no-cache');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 401);
      const { guild } = request.params;
      const member = await viewers.askedMembership(guild, session.userId);
      const own = await ownParties(guild);
      const forums = own.parties.flatMap((party) =>
        party.forumChannelId === null ? [] : [party.forumChannelId],
      );
      const viewer = await viewers.viewer(guild, session.userId, forums, member);
      if (viewer.kind === 'not-member') return sendFailure(request, reply, 403);
      if (viewer.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
      const body = JSON.stringify(partyView(inputFor(guild, own, session.userId, viewer)));
      const etag = etagOf(body);
      void reply.header('etag', etag);
      if (etagMatches(request.headers['if-none-match'], etag)) return reply.code(304).send();
      return reply.type('application/json; charset=utf-8').send(body);
    },
  );

  // A party's post (plan 8M-8A): for members only, as the list (`PartyViewers`: 401, 403, 503),
  // asked whether they are a member before anything of the party is read; then the party as the
  // list shows it (`mapParty`: of this server, active, not over by the clock, its forum not one
  // they are kept out of), else 404 as for a party that is not there; then the layout its post
  // was last shown with (404 while it has none), drawn for the page. Kept by the browser for a day
  // when asked by its key (`?k=`), which changes with anything of the post; asked anew otherwise.
  const postLimiter = new RateLimiter({ uses: POSTS_PER_MINUTE, perMs: 60_000 });
  scope.get(
    '/api/parties/:party/post',
    { onRequest: limitedPerAddress(postLimiter, { now: deps.now }) },
    async (request: PostRequest, reply) => {
      const session = await sessions.of(request, reply);
      if (!session) {
        void reply.header('cache-control', 'private, no-cache');
        return sendFailure(request, reply, 401);
      }
      const { guild, party: partyId } = request.params;
      // First: it may wait its turn, and what follows reads the party as it is then.
      const member = await viewers.askedMembership(guild, session.userId);
      const own = await ownParties(guild);
      const party = parties.store.get(partyId);
      const ours = party?.guildId === own.row ? party : undefined;
      const kept = ours === undefined ? undefined : parties.layoutOf(ours.id);
      // The forums of the party and of the posts its layout links (a split train's other one,
      // named only where the member may see it: review 8A-5), asked of Discord together.
      const linked = kept === undefined ? [] : linkedPosts(kept);
      const forums = [
        ours,
        ...own.parties.filter((one) => linked.includes(one.forumPostId ?? '')),
      ].flatMap((one) => (one?.forumChannelId ? [one.forumChannelId] : []));
      const viewer = await viewers.viewer(guild, session.userId, forums, member);
      void reply.header('cache-control', 'private, no-cache');
      if (viewer.kind === 'not-member') return sendFailure(request, reply, 403);
      if (viewer.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
      const input = inputFor(guild, own, session.userId, viewer);
      const shown = ours !== undefined && mapParty(ours, input) !== null;
      const layout = shown ? kept : undefined;
      if (layout === undefined) return sendFailure(request, reply, 404);
      const view = postView(layout, viewOptions(guild, own, input));
      // A post that names another is kept 5 minutes: whether the member may see that one changes.
      if (request.query.k === view.key) {
        void reply.header('cache-control', `private, max-age=${linked.length > 0 ? 300 : 86400}`);
      }
      return reply.type('application/json; charset=utf-8').send(JSON.stringify(view));
    },
  );

  // A place's picture beside a post's Where (plan 8M-8A): for members (401, 403, 503 as the
  // list), by its gym or Wayspot (`PlacePictures`), only while a post of this server that the
  // member sees on the map shows it, or a wild spawn they see there (`spawnShowsPlacePicture`)
  // (else 404, nothing fetched): no open proxy, and nothing of a party or spawn the member may
  // not see. A day in the browser.
  const placeLimiter = new RateLimiter({ uses: PLACE_PICTURES_PER_MINUTE, perMs: 60_000 });
  scope.get(
    '/pictures/:kind/:id',
    { onRequest: limitedPerAddress(placeLimiter, { now: deps.now }) },
    async (request: PlaceRequest, reply) => {
      void reply.header('cache-control', 'private, no-cache');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 401);
      const { guild, kind, id } = request.params;
      const own = await ownParties(guild);
      const forums = own.parties.flatMap((party) =>
        party.forumChannelId === null ? [] : [party.forumChannelId],
      );
      const member = await viewers.membership(guild, session.userId);
      const viewer = await viewers.viewer(guild, session.userId, forums, member);
      if (viewer.kind === 'not-member') return sendFailure(request, reply, 403);
      if (viewer.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
      if (kind !== 'gym' && kind !== 'wayspot') return sendFailure(request, reply, 404);
      const input = inputFor(guild, own, session.userId, viewer);
      const url = parties.places.urlOf(kind, id);
      // The posts that show the picture first, then whether the member sees one of them on the
      // map: `mapParty` makes a party's whole map line, and runs for those few only (review W-2).
      // A wild spawn's popup shows the picture of the place it is near too (staging of
      // 2026-11-07), asked only where no post shows it.
      const shown =
        url !== undefined &&
        (own.parties.some((party) => {
          const layout = parties.layoutOf(party.id);
          return (
            layout !== undefined &&
            layoutThumbnails(layout).includes(url) &&
            mapParty(party, input) !== null
          );
        }) ||
          (await spawnShowsPlacePicture(deps, viewers, guild, session.userId, url, member)));
      const picture = shown ? await parties.places.read(kind, id) : undefined;
      if (picture === undefined) return sendFailure(request, reply, 404);
      return reply
        .header('cache-control', 'private, max-age=86400')
        .type(picture.type)
        .send(picture.bytes);
    },
  );

  // A press of a party's button (spec 3.3): before the body is read (`onRequest`), at most
  // `PRESSES_PER_ADDRESS_MINUTE` from one address, the guard of every POST (Origin, session,
  // CSRF token) and an action the post has. Then, so that nobody but a member learns which party
  // ids exist and a press refused for who presses is not counted: whether they are a member (the
  // member directory, kept a minute; with the map's member role, when the settings name one,
  // `mapMembers`), the member as Discord has them now (also by that role), the party in the store
  // and of this server, how they stand to its forum, and only then
  // the member's `ACTION_THROTTLE` in the window of the post's controls; then the press as the
  // post's button makes it (`pressStatus`, also +1, −1 and the completion question's answers since
  // plan 8M-8B; the Remote switch, `MAP_REMOTE`, as the post's Remote button toggles it, plan
  // 8X-5).
  const addressLimiter = new RateLimiter({ uses: PRESSES_PER_ADDRESS_MINUTE, perMs: 60_000 });
  const knownAction = async (request: PressRequest, reply: FastifyReply) => {
    if (!isPress(request.params.action)) return sendFailure(request, reply, 404);
  };
  scope.post(
    '/api/parties/:party/:action',
    {
      onRequest: [
        limitedPerAddress(addressLimiter, { now: deps.now }),
        postGuard(sessions, deps.settings.publicUrl),
        knownAction,
      ],
    },
    async (request: PressRequest, reply) => {
      void reply.header('cache-control', 'no-store');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 403);
      const { guild, party: partyId, action } = request.params;
      // The Remote switch (plan 8X-5, undefined), or a button of the post as its `StatusPress`.
      const press = pressOf(action, request.body);
      if (press === 'malformed') return sendFailure(request, reply, 400);
      const raidAction = press !== undefined && isRaidAction(press.action);
      const { userId } = session;
      const doing = 'pressed a button of a party';
      // Whoever is no member, by the directory or fresh, learns nothing of the party.
      const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
      if ('sent' in acting) return acting.sent;
      const { member } = acting;
      // The party as the store has it: one that ended is not there (nor read from anywhere).
      const own = await ownParties(guild);
      const party = parties.store.get(partyId);
      if (party?.guildId !== own.row || party.status !== 'active') {
        const over = raidAction ? ({ type: 'raid' } as const) : undefined;
        const gone: PressAnswer = { ok: false, text: partyOver(over) };
        return reply.code(PRESS_STATUS.gone).send(gone);
      }
      let access: MemberAccess | undefined;
      try {
        access =
          party.forumChannelId === null
            ? undefined
            : await parties.forums.memberAccess(party.forumChannelId, userId);
      } catch (err) {
        deps.log.warn(
          { err, guild, user: userId },
          `could not ask Discord who ${doing} on the web pages`,
        );
        return reply.code(503).send({ error: UNREACHABLE });
      }
      // Kept out of the forum on purpose: `AccessService` would not let them in.
      if (access === 'barred') return sendFailure(request, reply, 403);
      const counted = { control: PARTY_KIND };
      const throttled = throttledOnTheMap(deps, reply, counted, userId, ACTION_THROTTLE);
      if (throttled) return throttled;
      const answered: PressAnswerer<{ kind: AttendanceOutcome['kind']; said: Said }> = (
        outcome,
        words,
      ) => {
        // As `answerClick` names the party: as the store has it now, or by the button.
        const now = parties.store.get(partyId);
        const named = now ?? (raidAction ? ({ type: 'raid' } as const) : undefined);
        return Promise.resolve({
          kind: outcome.kind,
          said: outcomeWords(parties.attendance.limits(), named, outcome, words),
        });
      };
      const { kind, said } = await countedOnTheMap(
        deps,
        counted,
        userId,
        ACTION_THROTTLE,
        async () =>
          press === undefined
            ? // The post's Remote button (`partyButtons`): toggled, "in person" said when off.
              answered(await parties.attendance.setRemote(partyId, member, 'toggle'), remoteWords)
            : pressStatus(parties.attendance, partyId, member, press, answered),
      );
      deps.log.info(
        { user: userId, guild, party: partyId, action, outcome: kind },
        'a party was pressed on the map',
      );
      await shownAfter(parties.drawn, partyId, kind === 'ok');
      const answer: PressAnswer = { ok: said.ok, text: unplain(said.text) };
      return reply.code(PRESS_STATUS[kind]).send(answer);
    },
  );
}
