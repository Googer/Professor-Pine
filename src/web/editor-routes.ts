import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { BoundedMap } from '../bounded-map.js';
import { Throttles, type Throttle } from '../discord/throttle.js';
import type { SaveAnswer } from '../domain/web/editor-data.js';
import { linkPage, sendFailure, shortPage } from './answers.js';
import { SaveChecks } from './save-check.js';
import { postGuard } from './csrf.js';
import type { EditorCache } from './editor-cache.js';
import {
  carryOutSave,
  CLOSING,
  previewSave,
  SAVE_BODY_LIMIT,
  saveRequestSchema,
  type RegionEditing,
} from './editor-save.js';
import { etagMatches } from './geo-cache.js';
import type { GuildRequest } from './guild-routes.js';
import { editingMapPath } from '../domain/web/editor-address.js';
import { limitedPerAddress, limitedRead, RateLimiter } from './rate-limit.js';
import type { RegionStaffSource, StaffAnswer } from './region-staff.js';
import type { WebDeps } from './server.js';

/** The requests for the editor's data one address may make in a minute: each asks Discord. */
const EDIT_DATA_PER_MINUTE = 20;
/** The previews and saves one address may send in a minute, whoever sends them. */
const SAVES_PER_ADDRESS_MINUTE = 30;
/**
 * How often one member may preview or save: each may have the overlaps and gaps of a city's
 * regions worked out (seconds of a thread), and asks Discord who is staff.
 */
export const REGION_CHECK_THROTTLE: Throttle = { uses: 6, perSeconds: 60 };

/** What the region editor's addresses need (plan 8M-2). */
export interface EditorDeps {
  /** Who may edit a server's regions, asked of Discord per request. */
  staff: RegionStaffSource;
  /** The editor's view of each server. */
  view: EditorCache;
  /** Preview and save: the region administration `/region` uses. */
  editing: RegionEditing;
  /**
   * Whether the web server is closing (the bot is shutting down): no preview or save is
   * looked at any more, and no save that is being checked is started.
   */
  closing: () => boolean;
}

/** The status of each answer of a preview or a save. */
const SAVE_STATUS: Readonly<Record<SaveAnswer['kind'], number>> = {
  preview: 200,
  saved: 200,
  conflicts: 409,
  stale: 409,
  refused: 422,
};

/** Why the last login did not happen (`?login=`, as a login sends back): said on the page. */
const LOGIN_NOTICES: ReadonlyMap<string, string> = new Map([
  ['failed', 'Login failed. '],
  ['expired', 'This login link has expired. '],
]);

/**
 * What a preview or a save answers while Discord cannot say who asks, to staff it confirmed
 * lately (`StaffSeen`); anybody else is told `UNCONFIRMED`, which promises no save.
 */
const UNREACHABLE =
  'Discord cannot be reached just now, so nothing can be saved. Try again in a moment.';

/** What the page and the data answer while Discord cannot say whether somebody is staff. */
const UNCONFIRMED = 'Discord cannot be reached just now, so I cannot tell whether you are staff.';

/** What the page and the data answer somebody who is not staff of the server (or no member). */
const STAFF_ONLY = 'Only staff of this server may edit its regions.';

/** What the page and the data answer while the server has no row yet. */
const UNKNOWN_SERVER = 'I do not know this server yet. Try again in a moment.';

/**
 * How long after Discord last said somebody is staff of a server they are still shown the
 * editor, read-only, while Discord cannot be asked.
 */
export const STAFF_SEEN_MS = 30 * 60_000;
/** How many of those are remembered (oldest out). */
const STAFF_SEEN = 1_000;

/**
 * Who Discord said lately is staff of which server (`<guild>:<user>`, when): while Discord
 * cannot be asked, only they see the editor (read-only), nobody else learns anything of it.
 */
export class StaffSeen {
  private readonly seen = new BoundedMap<string, number>(STAFF_SEEN);

  constructor(private readonly now: () => number) {}

  /** What Discord said of somebody now: staff is remembered, anything else forgets them. */
  said(guildId: string, userId: string, answer: StaffAnswer): void {
    const key = `${guildId}:${userId}`;
    if (answer.kind === 'staff') this.seen.set(key, this.now());
    else if (answer.kind !== 'unreachable') this.seen.delete(key);
  }

  /** Whether Discord said they are staff of the server within `STAFF_SEEN_MS`. */
  lately(guildId: string, userId: string): boolean {
    const at = this.seen.get(`${guildId}:${userId}`);
    return at !== undefined && this.now() - at < STAFF_SEEN_MS;
  }
}

/**
 * Who asks for an address of the editor: nobody logged in, or what Discord says of them now
 * (`RegionStaffSource`, fresh each time; the session says only who they are). While Discord
 * cannot be asked: `unreachable` for those it said lately are staff (`StaffSeen`), `unconfirmed`
 * for anybody else.
 */
export async function editorViewer(
  request: FastifyRequest & { params: { guild: string } },
  reply: FastifyReply,
  deps: WebDeps,
  seen: StaffSeen,
): Promise<
  | { kind: 'logged-out' }
  | (StaffAnswer & { userId: string })
  | { kind: 'unconfirmed'; userId: string }
> {
  const session = await deps.sessions.of(request, reply);
  if (!session) return { kind: 'logged-out' };
  const { guild } = request.params;
  const { userId } = session;
  let answer: StaffAnswer;
  try {
    // The directory first (plan 8Z): somebody who is not in the server costs no forced fetch.
    answer = (await deps.members.find(guild, userId))
      ? await deps.editor.staff.check(guild, userId)
      : { kind: 'not-member' };
  } catch (err) {
    deps.log.warn(
      { err, guild, user: userId },
      'could not ask Discord who edits regions on the web pages',
    );
    answer = { kind: 'unreachable' };
  }
  seen.said(guild, userId, answer);
  if (answer.kind === 'unreachable' && !seen.lately(guild, userId)) {
    return { kind: 'unconfirmed', userId };
  }
  return { ...answer, userId };
}

/**
 * The region editor's addresses of a server (`/s/<guild>/…`, plan 8M-2). `GET api/regions/edit`
 * is the editor's data for the server's staff (`editorView`), with an ETag: 401 without a
 * session, 403 for somebody who is not staff of the server (or no member), 503 while the server
 * has no row; when Discord cannot be asked, the view read-only, without the channels a new
 * region could take, for those Discord said within `STAFF_SEEN_MS` are staff, and 503 for anybody
 * else (the page likewise). `POST api/regions/preview` and `…/save` take the staged changes
 * (`saveRequestSchema`) and answer a `SaveAnswer`: 200 a preview or what was saved, 409 the
 * regions changed meanwhile, 422 why nothing is done; while Discord cannot be asked, 503; 429
 * past `SAVES_PER_ADDRESS_MINUTE` of an address or `REGION_CHECK_THROTTLE` of a member.
 */
export function editorRoutes(scope: FastifyInstance, deps: WebDeps): void {
  // The page (spec 4): for the server's staff (and while Discord cannot say: the data then says
  // read-only) a redirect to the map with the editor on (plan 8M-10); a page saying how to log
  // in, or that it is for staff.
  // It never sends anybody to Discord by itself: a login that failed would come back to it.
  // Every load asks Discord who is staff: at most `EDIT_DATA_PER_MINUTE` from one address.
  const seen = new StaffSeen(deps.now);
  scope.get<{ Params: { guild: string }; Querystring: { login?: unknown } }>(
    '/regions/edit',
    { onRequest: limitedRead(EDIT_DATA_PER_MINUTE, deps) },
    async (request, reply) => {
      void reply.type('text/html; charset=utf-8').header('cache-control', 'no-cache');
      const { guild } = request.params;
      const viewer = await editorViewer(request, reply, deps, seen);
      if (viewer.kind === 'logged-out') {
        const { login } = request.query;
        const why = (typeof login === 'string' ? LOGIN_NOTICES.get(login) : undefined) ?? '';
        const next = encodeURIComponent(`/s/${guild}/regions/edit`);
        return reply
          .code(401)
          .send(
            deps.oauth
              ? linkPage(
                  `${why}Log in to edit this server's regions.`,
                  { href: `/auth/login?next=${next}`, text: 'Log in with Discord' },
                  'Or use /region edit in Discord.',
                )
              : linkPage(
                  `${why}Log in to edit this server's regions.`,
                  undefined,
                  'Use /region edit in Discord to log in.',
                ),
          );
      }
      if (viewer.kind === 'not-member' || viewer.kind === 'not-staff') {
        return reply.code(403).send(shortPage(STAFF_ONLY));
      }
      if (viewer.kind === 'unknown-server') {
        return reply.code(503).send(shortPage(UNKNOWN_SERVER));
      }
      if (viewer.kind === 'unconfirmed') return reply.code(503).send(shortPage(UNCONFIRMED));
      // Staff (and while Discord cannot say, staff seen lately): the map with the editor on
      // (plan 8M-10), an address of our constants, never of the request but the guild checked.
      return reply.code(303).header('location', editingMapPath(guild)).send();
    },
  );

  scope.get(
    '/api/regions/edit',
    { onRequest: limitedRead(EDIT_DATA_PER_MINUTE, deps) },
    async (request: GuildRequest, reply) => {
      void reply.header('cache-control', 'private, no-cache');
      const viewer = await editorViewer(request, reply, deps, seen);
      // A refusal in the page's words (plan 8M-10, C2): the map says them as it turns the editor off.
      switch (viewer.kind) {
        case 'logged-out':
          return sendFailure(request, reply, 401);
        case 'not-member':
        case 'not-staff':
          return reply.code(403).send({ error: STAFF_ONLY });
        case 'unknown-server':
          return reply.code(503).send({ error: UNKNOWN_SERVER });
        case 'unconfirmed':
          return reply.code(503).send({ error: UNCONFIRMED });
        case 'unreachable':
        case 'staff':
          break;
      }
      const view = await deps.editor.view.view(request.params.guild, {
        userId: viewer.userId,
        readOnly: viewer.kind === 'unreachable',
        mayManageChannels: viewer.kind === 'staff' && viewer.staff.mayManageChannels,
        mayRemoveRegions: viewer.kind === 'staff' && viewer.staff.mayRemoveRegions === true,
      });
      void reply.header('etag', view.etag);
      if (etagMatches(request.headers['if-none-match'], view.etag)) return reply.code(304).send();
      return reply.type('application/json; charset=utf-8').send(view.body);
    },
  );

  // Preview and save (spec 4.5): POSTs of the editor's page, up to 2 MB, for the server's staff
  // as Discord has them now. Before the body is read (`onRequest`): at most
  // `SAVES_PER_ADDRESS_MINUTE` from one address, the guard of every POST (`postGuard`), and the
  // member's throttle (`REGION_CHECK_THROTTLE`: each may cut outlines for seconds), so that a
  // request refused never has its 2 MB read. Then Discord is asked who is staff.
  const addressLimiter = new RateLimiter({ uses: SAVES_PER_ADDRESS_MINUTE, perMs: 60_000 });
  const throttles = new Throttles();
  const memberThrottle = async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await deps.sessions.of(request, reply);
    if (!session) return sendFailure(request, reply, 403);
    const wait = throttles.use('region edit', session.userId, REGION_CHECK_THROTTLE, deps.now());
    if (wait === undefined) return;
    void reply.header('retry-after', String(wait));
    return sendFailure(request, reply, 429);
  };
  const checks = new SaveChecks(deps.editor.editing.checker, deps.now);
  const saving =
    (what: 'preview' | 'save') => async (request: GuildRequest, reply: FastifyReply) => {
      void reply.header('cache-control', 'no-store');
      const viewer = await editorViewer(request, reply, deps, seen);
      switch (viewer.kind) {
        case 'logged-out':
          return sendFailure(request, reply, 401);
        case 'not-member':
        case 'not-staff':
          return sendFailure(request, reply, 403);
        case 'unknown-server':
          return sendFailure(request, reply, 503);
        case 'unreachable':
          return reply.code(503).send({ error: UNREACHABLE });
        case 'unconfirmed':
          return reply.code(503).send({ error: UNCONFIRMED });
        case 'staff':
          break;
      }
      const body = saveRequestSchema.safeParse(request.body);
      if (!body.success) return sendFailure(request, reply, 400);
      const { editing, closing } = deps.editor;
      const answer = closing()
        ? ({ kind: 'later', error: CLOSING } as const)
        : what === 'preview'
          ? await previewSave(editing, viewer.staff, body.data, checks)
          : await carryOutSave(editing, viewer.staff, body.data, checks, closing);
      if (answer.kind === 'later') return reply.code(503).send({ error: answer.error });
      return reply.code(SAVE_STATUS[answer.kind]).send(answer);
    };
  const options = {
    bodyLimit: SAVE_BODY_LIMIT,
    onRequest: [
      limitedPerAddress(addressLimiter, { now: deps.now }),
      postGuard(deps.sessions, deps.settings.publicUrl),
      memberThrottle,
    ],
  };
  scope.post<{ Params: { guild: string } }>('/api/regions/preview', options, saving('preview'));
  scope.post<{ Params: { guild: string } }>('/api/regions/save', options, saving('save'));
}
