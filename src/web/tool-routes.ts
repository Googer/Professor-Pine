import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ACCESS_KEY, SCRIPT_ACCESS_STATES, type Decision } from '../domain/script-access/access.js';
import {
  META_FILE,
  servedMeta,
  servedScript,
  TOOL_FILE,
  type ToolUrls,
} from '../domain/script-access/tool-file.js';
import type { ScriptAccessService } from '../services/script-access-service.js';
import type { ServedTool, ToolSource } from '../services/wayspot-tool.js';
import { linkPage, sendFailure, shortPage } from './answers.js';
import { postGuard } from './csrf.js';
import { limitedPerAddress, RateLimiter } from './rate-limit.js';
import type { WebDeps } from './server.js';
import type { WebSession } from './session-model.js';
import { ownAccess, TOOL_LOGIN, TOOL_WORDS, toolPage } from './tool-page.js';

/** The Wayfarer export tool on the owner's instance (plan 8W-P): its file, and who may have it. */
export interface ToolWebDeps {
  /** The tool file of `wayspot-tool/`, undefined while there is none that reads. */
  files: ToolSource;
  /** Who may have it: requests, decisions, keys and their fetches. */
  access: ScriptAccessService;
  /** The posts' zone (`settings.timezone`), for the times of the owner's list. */
  zone: string;
}

/** The page of the tool, and the folder of its addresses: not under `/s/<guild>/`. */
export const TOOL_PATH = '/userscript';
/** Requests of the tool's two addresses one client may make in a minute, together. */
export const TOOL_FETCHES_PER_MINUTE = 30;
/** Loads of the page one client may make in a minute. */
export const TOOL_PAGE_PER_MINUTE = 30;
/** The page's POSTs one client may make in a minute. */
export const TOOL_POSTS_PER_MINUTE = 20;
/**
 * How recent the owner's login must be for the page's owner actions (spec "The owner's
 * session"): twelve hours, from the session's start (`WebSession.createdAt`, made at a login and
 * never renewed). The DM's buttons are Discord's own check and need nothing more.
 */
export const OWNER_LOGIN_MS = 12 * 3_600_000;
/** What the tool's addresses answer with, the 404s included. */
const SCRIPT_TYPE = 'text/javascript; charset=utf-8';
/** What every address of the tool that is not one answers: the same for all. */
const NOT_FOUND = '// Not found.\n';

/** The two addresses of a key under `publicUrl`: what every copy of the tool names. */
export function toolUrls(publicUrl: string, key: string): ToolUrls {
  return {
    meta: `${publicUrl}${TOOL_PATH}/${key}/${META_FILE}`,
    script: `${publicUrl}${TOOL_PATH}/${key}/${TOOL_FILE}`,
  };
}

/**
 * The tool when this instance hands it out: the web pages are on (they are, to be asked), the
 * login with Discord is offered (`DISCORD_CLIENT_SECRET`: the page needs it), and the tool file
 * reads. Undefined otherwise: every address of the tool is then 404.
 */
export function toolOffered(
  deps: Pick<WebDeps, 'oauth' | 'tool'>,
): Promise<ServedTool | undefined> {
  return deps.oauth ? deps.tool.files.read() : Promise.resolve(undefined);
}

type KeyParams = { key: string };

/**
 * The tool and its header block at the addresses of a key (spec "Keys and links"):
 * `GET /userscript/<key>/pine-wayfarer-export.user.js` and `….meta.js`, the placeholders of the
 * header filled with that key's two addresses. A key that is not an approved member's (unknown,
 * replaced, revoked, refused, asked), or anything else under `/userscript/`, answers the same
 * plain 404, so that nothing says a key once worked. Every answer is `text/javascript` and
 * `no-store` (Cloudflare keeps `.js` by its extension), 30 a minute per client for both
 * addresses together. A GET records the fetch (at most once a minute per key); a fetch is
 * logged by the route and the row's id, never the key.
 */
export function toolFileRoutes(app: FastifyInstance, deps: WebDeps): void {
  const { tool, settings, now, log } = deps;
  const limited = limitedPerAddress(
    new RateLimiter({ uses: TOOL_FETCHES_PER_MINUTE, perMs: 60_000 }),
    { now },
  );
  void app.register(
    (scope, _options, done) => {
      scope.addHook('onRequest', limited);
      scope.addHook('onSend', async (_request, reply, payload) => {
        void reply.header('content-type', SCRIPT_TYPE).header('cache-control', 'no-store');
        return payload;
      });
      const notFound = (reply: FastifyReply) => reply.code(404).send(NOT_FOUND);
      const served =
        (kind: 'script' | 'meta') =>
        async (request: FastifyRequest<{ Params: KeyParams }>, reply: FastifyReply) => {
          const { key } = request.params;
          const offered = await toolOffered(deps);
          if (!offered || !ACCESS_KEY.test(key)) return notFound(reply);
          const access = await tool.access.byKey(key);
          if (access?.state !== 'approved') return notFound(reply);
          if (request.method === 'GET') {
            await tool.access.recordFetch(access.id, offered.version, now());
          }
          log.info(
            {
              route: request.routeOptions.url,
              method: request.method,
              access: access.id,
              version: offered.version,
            },
            'the Wayfarer export tool was fetched',
          );
          const urls = toolUrls(settings.publicUrl, key);
          return reply
            .code(200)
            .send(kind === 'script' ? servedScript(offered, urls) : servedMeta(offered, urls));
        };
      scope.get(`/:key/${TOOL_FILE}`, served('script'));
      scope.get(`/:key/${META_FILE}`, served('meta'));
      scope.get('/*', (_request, reply) => notFound(reply));
      done();
    },
    { prefix: TOOL_PATH },
  );
}

/**
 * What a decision of the owner's list sends: the row, and the state and asking (`askedAt`) its
 * button was drawn with: a request asked again since is another one.
 */
const decisionBody = z
  .object({
    action: z.enum(['approve', 'refuse', 'revoke']),
    id: z.number().int().positive(),
    from: z.enum(SCRIPT_ACCESS_STATES),
    askedAt: z.number().int().nonnegative(),
  })
  .strict();
/** The page's POSTs: a request, a new link, the owner's link, a decision. */
const toolBody = z.union([
  z.object({ action: z.literal('ask'), community: z.string().max(1_000) }).strict(),
  z.object({ action: z.literal('new-link') }).strict(),
  z.object({ action: z.literal('my-link') }).strict(),
  decisionBody,
]);

/** What a POST of the page answers: whether it was done, and the words to say. */
interface ToolAnswer {
  ok: boolean;
  text: string;
}

/** What the page says a request stands at, when asking changed nothing. */
const STANDING_WORDS: Readonly<Record<string, string>> = {
  asked: TOOL_WORDS.asked,
  approved: 'You have access already: reload the page.',
  refused: TOOL_WORDS.refused,
  revoked: TOOL_WORDS.revoked,
};

/** What the owner's decisions answer. */
const DECIDED_WORDS: Readonly<Record<Decision, string>> = {
  approve: 'Approved.',
  refuse: 'Refused.',
  revoke: 'Revoked: their link stops now.',
};
const CHANGED = 'This request changed meanwhile: reload the page to see it as it is now.';
const NO_SUCH_REQUEST = 'There is no such request: reload the page.';
const NO_LINK = 'You have no link to replace: reload the page.';
const NOT_BUILT = "The tool's page has not been built yet: run npm run web:build.";
const LOGIN_NOTICES: ReadonlyMap<string, string> = new Map([['failed', 'Login failed. ']]);

/** Whether a session is the owner's and its login recent enough for the owner's actions. */
function freshLogin(session: WebSession, now: number): boolean {
  return now - session.createdAt <= OWNER_LOGIN_MS;
}

/**
 * The page `/userscript` (spec "The admin's way in", "The owner's side"; not under
 * `/s/<guild>/`, since the tool is not per server): `GET` (30 a minute per client) shows a
 * visitor what it is and the login, a member their access by its state, and the owner their own
 * link and every request; the owner's part needs a login of the last `OWNER_LOGIN_MS`. Its
 * POSTs (20 a minute, `postGuard` before the body is read, a body of `toolBody`) ask, make a new
 * link, make the owner's link, or decide (the owner, with a fresh login, on the row as it is).
 * Where the tool is not offered (`toolOffered`) the page says "Not available on this Pine." and
 * its POSTs are 404. Answers `{ ok, text }`; nothing is cached.
 */
export function toolPageRoutes(app: FastifyInstance, deps: WebDeps): void {
  const { sessions, settings, now, tool } = deps;
  const pageLimited = limitedPerAddress(
    new RateLimiter({ uses: TOOL_PAGE_PER_MINUTE, perMs: 60_000 }),
    { now },
  );
  const postGuards = [
    limitedPerAddress(new RateLimiter({ uses: TOOL_POSTS_PER_MINUTE, perMs: 60_000 }), { now }),
    postGuard(sessions, settings.publicUrl),
  ];
  const urls = (key: string) => toolUrls(settings.publicUrl, key);

  app.get<{ Querystring: { login?: unknown } }>(
    TOOL_PATH,
    { onRequest: pageLimited },
    async (request, reply) => {
      void reply.type('text/html; charset=utf-8').header('cache-control', 'no-store');
      const offered = await toolOffered(deps);
      if (!offered) return reply.code(404).send(shortPage(TOOL_WORDS.notAvailable));
      const session = await sessions.of(request, reply);
      if (!session) {
        const { login } = request.query;
        const why = (typeof login === 'string' ? LOGIN_NOTICES.get(login) : undefined) ?? '';
        return reply.send(
          linkPage(
            `${why}${TOOL_WORDS.lead}`,
            { href: TOOL_LOGIN, text: 'Log in with Discord' },
            'Log in to ask for it, or to see where your request stands.',
          ),
        );
      }
      const { manifest } = deps.assets;
      if (!manifest) return reply.code(503).send(shortPage(NOT_BUILT));
      const owner = tool.access.isOwner(session.userId);
      const stale = owner && !freshLogin(session, now());
      const row = await tool.access.byUser(session.userId);
      return reply.send(
        toolPage(
          {
            name: session.userName,
            csrf: sessions.csrfToken(session),
            own: ownAccess(row, { owner, now: now(), tool: offered, urls }),
            // The owner's own row is not listed: their link part above covers it.
            requests:
              owner && !stale
                ? (await tool.access.all()).filter((one) => one.userId !== session.userId)
                : undefined,
            staleOwner: stale,
            zone: tool.zone,
          },
          manifest.userscript,
        ),
      );
    },
  );

  app.post(TOOL_PATH, { onRequest: postGuards }, async (request, reply) => {
    void reply.header('cache-control', 'no-store');
    if (!(await toolOffered(deps))) return sendFailure(request, reply, 404);
    const session = await sessions.of(request, reply);
    if (!session) return sendFailure(request, reply, 403);
    const parsed = toolBody.safeParse(request.body ?? {});
    if (!parsed.success) return sendFailure(request, reply, 400);
    const body = parsed.data;
    const answer = (status: number, done: ToolAnswer) => reply.code(status).send(done);
    const member = { id: session.userId, name: session.userName };
    const owner = tool.access.isOwner(session.userId);
    // The owner's every action on the page needs a recent login (spec "The owner's session").
    if (owner && !freshLogin(session, now())) {
      return answer(403, { ok: false, text: TOOL_WORDS.staleLogin });
    }
    switch (body.action) {
      case 'ask': {
        if (owner) return sendFailure(request, reply, 403);
        const asked = await tool.access.ask(member, body.community);
        if (asked.kind === 'no-community') {
          return answer(422, { ok: false, text: 'Say which community you run Pine for.' });
        }
        if (asked.kind === 'asked') return answer(200, { ok: true, text: TOOL_WORDS.asked });
        return answer(409, { ok: false, text: STANDING_WORDS[asked.access.state] ?? CHANGED });
      }
      case 'new-link': {
        const renewed = await tool.access.newLink(session.userId);
        return renewed
          ? answer(200, {
              ok: true,
              text: 'Your new link is made: install the tool from it again.',
            })
          : answer(409, { ok: false, text: NO_LINK });
      }
      case 'my-link': {
        if (!owner) return sendFailure(request, reply, 403);
        await tool.access.ownerLink(member);
        return answer(200, { ok: true, text: 'Your link is made.' });
      }
      default: {
        if (!owner) return sendFailure(request, reply, 403);
        const decided = await tool.access.decide(body.id, body.action, body.from, body.askedAt);
        if (decided.kind === 'decided') {
          return answer(200, { ok: true, text: DECIDED_WORDS[body.action] });
        }
        return answer(409, {
          ok: false,
          text: decided.kind === 'gone' ? NO_SUCH_REQUEST : CHANGED,
        });
      }
    }
  });
}
