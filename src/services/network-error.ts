import { HTTPError } from 'discord.js';

/**
 * The codes of Node's resolver and sockets, and of undici, that a network gone away gives: no
 * name (DNS away: `ENOTFOUND` on Windows, `EAI_AGAIN` in Docker), no route, no answer, a
 * connection cut.
 */
const NETWORK_CODES = [
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'ENETUNREACH',
  'ENETDOWN',
  'EHOSTUNREACH',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_ABORTED',
] as const;

/**
 * The names of the errors a request's time limit gives (`AbortSignal.timeout`, undici's, and the
 * abort with which @discordjs/rest ends a request after its 15 s).
 */
const TIMEOUT_NAMES = new Set([
  'TimeoutError',
  'AbortError',
  'ConnectTimeoutError',
  'HeadersTimeoutError',
  'BodyTimeoutError',
]);

/** A code of `NETWORK_CODES` as a word of a message (`getaddrinfo ENOTFOUND discord.com`). */
const NETWORK_WORDS = new RegExp(`\\b(?:${NETWORK_CODES.join('|')})\\b`);

/**
 * Whether an error is mysql2's: the database gone away is an outage of its own, for a person to look
 * at, even when its code is a socket's (`ECONNREFUSED` with `fatal`, a `PROTOCOL_*` code).
 */
function isDatabaseError(err: Error): boolean {
  const { code, fatal, sqlState } = err as { code?: unknown; fatal?: unknown; sqlState?: unknown };
  return (
    typeof fatal === 'boolean' ||
    typeof sqlState === 'string' ||
    (typeof code === 'string' && code.startsWith('PROTOCOL_'))
  );
}

/** How deep a chain of causes is followed. */
const MAX_CAUSES = 8;

/**
 * Whether an error is the network's, not something a person must look at (plan 8X-H): a request
 * that could not reach its host or whose connection went away, or that ran out of time, by its
 * code, its name or the code in its message, on the error or any cause of it (undici's `fetch
 * failed` keeps the reason in `cause`); also Discord's 5xx (`HTTPError`, its edge's bad gateway). A
 * refusal of Discord's (`DiscordAPIError`, a 4xx), the database gone away (a mysql2 error, also with
 * a socket's code) and an error of the code are not. Such failures are logged at `warn`; the rest
 * stays `error`.
 */
export function isNetworkError(err: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = err;
  for (let depth = 0; depth < MAX_CAUSES && current instanceof Error; depth++) {
    if (seen.has(current)) return false;
    seen.add(current);
    if (isDatabaseError(current)) return false;
    // Discord's 5xx (Cloudflare's bad gateway and the like), without Discord's error body.
    if (current instanceof HTTPError) return current.status >= 500;
    const code: unknown = (current as { code?: unknown }).code;
    if (typeof code === 'string' && (NETWORK_CODES as readonly string[]).includes(code)) {
      return true;
    }
    if (TIMEOUT_NAMES.has(current.name)) return true;
    if (NETWORK_WORDS.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}
