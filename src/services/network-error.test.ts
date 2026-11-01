import { HTTPError } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { missingPermissions } from '../../test/support/fake-gateway.js';
import { isNetworkError } from './network-error.js';

/** An error of Node's resolver or sockets, with its code, as undici puts it in `cause`. */
function systemError(code: string, message = `connect ${code} 162.159.135.232:443`): Error {
  return Object.assign(new Error(message), { code });
}

describe('isNetworkError (plan 8X-H)', () => {
  it('takes what a lost network gives: no name, no route, no answer', () => {
    for (const code of ['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT']) {
      expect(
        isNetworkError(new TypeError('fetch failed', { cause: systemError(code) })),
        code,
      ).toBe(true);
      expect(isNetworkError(systemError(code)), code).toBe(true);
    }
    // undici's own timeouts, and a time limit of `AbortSignal.timeout`.
    const connect = Object.assign(new Error('Connect Timeout Error'), {
      name: 'ConnectTimeoutError',
      code: 'UND_ERR_CONNECT_TIMEOUT',
    });
    expect(isNetworkError(new TypeError('fetch failed', { cause: connect }))).toBe(true);
    expect(isNetworkError(new DOMException('The operation timed out.', 'TimeoutError'))).toBe(true);
    // A download's failure that names the address and keeps the cause (the game data's).
    expect(
      isNetworkError(
        new Error('https://x.test: getaddrinfo ENOTFOUND x.test', {
          cause: new TypeError('fetch failed', { cause: systemError('ENOTFOUND') }),
        }),
      ),
    ).toBe(true);
    // Only the words, as some wrappers leave them.
    expect(isNetworkError(new Error('getaddrinfo ENOTFOUND discord.com'))).toBe(true);
  });

  it('leaves out what a person must look at: Discord’s refusals and the code’s own errors', () => {
    expect(isNetworkError(missingPermissions('PATCH'))).toBe(false);
    expect(
      isNetworkError(new TypeError("Cannot read properties of undefined (reading 'id')")),
    ).toBe(false);
    expect(isNetworkError(new Error('500'))).toBe(false);
    expect(isNetworkError('ENOTFOUND')).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });

  it('takes the abort of a request that ran out of time, and Discord’s 5xx through its edge', () => {
    // @discordjs/rest aborts a request after 15 s: a DOMException named AbortError, or undici's
    // RequestAbortedError.
    expect(isNetworkError(new DOMException('This operation was aborted', 'AbortError'))).toBe(true);
    const undiciAbort = Object.assign(new Error('Request aborted'), {
      name: 'AbortError',
      code: 'UND_ERR_ABORTED',
    });
    expect(isNetworkError(undiciAbort)).toBe(true);
    expect(isNetworkError(Object.assign(new Error('aborted'), { code: 'UND_ERR_ABORTED' }))).toBe(
      true,
    );
    // Discord's 5xx (a bad gateway of Cloudflare's) as @discordjs/rest throws it.
    expect(isNetworkError(new HTTPError(502, 'Bad Gateway', 'PATCH', '/x', {}))).toBe(true);
    expect(isNetworkError(new HTTPError(503, 'Service Unavailable', 'GET', '/x', {}))).toBe(true);
    // A 4xx without Discord's error body is not the network's.
    expect(isNetworkError(new HTTPError(413, 'Payload Too Large', 'POST', '/x', {}))).toBe(false);
  });

  it('leaves out the database going away: a mysql2 error is not the network’s', () => {
    expect(
      isNetworkError(
        Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3306'), {
          code: 'ECONNREFUSED',
          fatal: true,
        }),
      ),
    ).toBe(false);
    expect(
      isNetworkError(
        Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET', sqlState: 'HY000' }),
      ),
    ).toBe(false);
    expect(
      isNetworkError(
        Object.assign(new Error('Connection lost: The server closed the connection.'), {
          code: 'PROTOCOL_CONNECTION_LOST',
          fatal: true,
        }),
      ),
    ).toBe(false);
    // Also when the query's error wraps it.
    expect(
      isNetworkError(
        new Error('query failed', {
          cause: Object.assign(new Error('connect ETIMEDOUT'), {
            code: 'ETIMEDOUT',
            fatal: true,
          }),
        }),
      ),
    ).toBe(false);
  });

  it('stops at a cause that refers back to itself', () => {
    const looped = new Error('loop');
    (looped as { cause?: unknown }).cause = looped;
    expect(isNetworkError(looped)).toBe(false);
  });
});
