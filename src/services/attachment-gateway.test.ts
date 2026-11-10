import { describe, expect, it } from 'vitest';
import { fakeTimeoutSignals } from '../../test/support/timers.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import {
  FetchAttachments,
  type AttachmentFetch,
  type AttachmentResponse,
} from './attachment-gateway.js';

const URL_OK = 'https://cdn.discordapp.com/attachments/1/2/regions.kml?ex=abc&is=def&hm=secret';
const LIMITS = { maxBytes: 10, timeoutMs: 50 };

/** An answer whose body comes in these pieces; `cancelled` counts how often it was given up. */
function answer(
  pieces: (Uint8Array | Error)[],
  more: { status?: number; length?: string } = {},
): AttachmentResponse & { cancelled: number; read: number } {
  const left = [...pieces];
  const response = {
    status: more.status ?? 200,
    headers: {
      get: (name: string) => (name === 'content-length' ? (more.length ?? null) : null),
    },
    cancelled: 0,
    read: 0,
    body: {
      getReader: () => ({
        read: () => {
          const next = left.shift();
          if (next instanceof Error) return Promise.reject(next);
          if (next) response.read += 1;
          return Promise.resolve(next ? { done: false, value: next } : { done: true });
        },
        cancel: () => {
          response.cancelled += 1;
          return Promise.resolve();
        },
      }),
    },
  };
  return response;
}

/** A `fetch` that gives this answer and records what it was asked. Nothing leaves the test. */
function gatewayWith(response: AttachmentResponse | Error | 'hang') {
  const calls: { url: string; init: Parameters<AttachmentFetch>[1] }[] = [];
  const fetch: AttachmentFetch = (url, init) => {
    calls.push({ url, init });
    if (response instanceof Error) return Promise.reject(response);
    if (response === 'hang') {
      return new Promise((_resolve, reject) => {
        if (init.signal.aborted) reject(new Error('The operation was aborted'));
        init.signal.addEventListener('abort', () => {
          reject(new Error('The operation was aborted'));
        });
      });
    }
    return Promise.resolve(response);
  };
  const { log, entries } = createTestLogger();
  return { gateway: new FetchAttachments({ fetch, log }), calls, entries };
}

const bytes = (...values: number[]) => new Uint8Array(values);

describe('FetchAttachments', () => {
  it('downloads an attachment in pieces and gives its bytes', async () => {
    const { gateway, calls } = gatewayWith(answer([bytes(1, 2, 3), bytes(), bytes(4, 5)]));
    await expect(gateway.download(URL_OK, LIMITS)).resolves.toEqual({
      ok: true,
      bytes: bytes(1, 2, 3, 4, 5),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(URL_OK);
    expect(calls[0]?.init).toMatchObject({ method: 'GET', redirect: 'manual' });
  });

  it('accepts Discord’s other attachment host', async () => {
    const { gateway } = gatewayWith(answer([bytes(1)]));
    const outcome = await gateway.download(
      'https://media.discordapp.net/attachments/1/2/regions.kml',
      LIMITS,
    );
    expect(outcome.ok).toBe(true);
  });

  it.each([
    ['plain http', 'http://cdn.discordapp.com/attachments/1/2/a.kml'],
    ['another host', 'https://example.com/attachments/1/2/a.kml'],
    ['a host that only ends like Discord’s', 'https://evilcdn.discordapp.com.example/a.kml'],
    ['a subdomain', 'https://x.cdn.discordapp.com/a.kml'],
    ['a port', 'https://cdn.discordapp.com:8443/a.kml'],
    ['a user in the address', 'https://user@cdn.discordapp.com/a.kml'],
    ['a password in the address', 'https://user:pw@cdn.discordapp.com/a.kml'],
    ['an address inside the machine', 'https://127.0.0.1/a.kml'],
    ['a file address', 'file:///etc/passwd'],
    ['no address at all', 'regions.kml'],
  ])('asks nothing of %s', async (_what, url) => {
    const { gateway, calls } = gatewayWith(answer([bytes(1)]));
    await expect(gateway.download(url, LIMITS)).resolves.toEqual({
      ok: false,
      reason: 'refused-address',
    });
    expect(calls).toEqual([]);
  });

  it('gives up before reading when the answer says it is too long', async () => {
    const response = answer([bytes(1)], { length: '11' });
    const { gateway } = gatewayWith(response);
    await expect(gateway.download(URL_OK, LIMITS)).resolves.toEqual({
      ok: false,
      reason: 'too-large',
    });
    expect(response.read).toBe(0);
    expect(response.cancelled).toBe(1);
  });

  it('gives up the moment the body passes the limit, whatever its length was said to be', async () => {
    const response = answer([bytes(1, 2, 3, 4, 5, 6), bytes(7, 8, 9, 10, 11), bytes(12)], {
      length: '3',
    });
    const { gateway } = gatewayWith(response);
    await expect(gateway.download(URL_OK, LIMITS)).resolves.toEqual({
      ok: false,
      reason: 'too-large',
    });
    // The third piece was never asked for.
    expect(response.read).toBe(2);
    expect(response.cancelled).toBe(1);
  });

  it('takes a body of exactly the limit', async () => {
    const { gateway } = gatewayWith(answer([bytes(1, 2, 3, 4, 5), bytes(6, 7, 8, 9, 10)]));
    const outcome = await gateway.download(URL_OK, LIMITS);
    expect(outcome.ok && outcome.bytes.byteLength).toBe(10);
  });

  it('follows no redirect and takes no status but 200', async () => {
    for (const status of [301, 302, 204, 403, 404, 500]) {
      const response = answer([bytes(1)], { status });
      const { gateway, calls } = gatewayWith(response);
      await expect(gateway.download(URL_OK, LIMITS)).resolves.toEqual({
        ok: false,
        reason: 'failed',
      });
      expect(calls).toHaveLength(1);
      expect(response.read).toBe(0);
    }
  });

  it('answers a failure for a connection that breaks, before or during the body', async () => {
    const refused = gatewayWith(new TypeError('fetch failed', { cause: new Error('ECONNRESET') }));
    await expect(refused.gateway.download(URL_OK, LIMITS)).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
    const broken = gatewayWith(answer([bytes(1), new Error('socket hang up')]));
    await expect(broken.gateway.download(URL_OK, LIMITS)).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
    const empty = gatewayWith({ status: 200, headers: { get: () => null }, body: null });
    await expect(empty.gateway.download(URL_OK, LIMITS)).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
  });

  it('gives up after its time', async () => {
    const timeouts = fakeTimeoutSignals();
    const { gateway, calls } = gatewayWith('hang');
    const downloading = gateway.download(URL_OK, LIMITS);
    await timeouts.made.reached(1);
    expect(timeouts.lengths).toEqual([LIMITS.timeoutMs]);
    timeouts.expire();
    await expect(downloading).resolves.toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(calls[0]?.init.signal.aborted).toBe(true);
  });

  it('never logs the address, which carries a signature', async () => {
    const { gateway, entries } = gatewayWith(answer([], { status: 404 }));
    await gateway.download(URL_OK, LIMITS);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ host: 'cdn.discordapp.com', reason: 'status 404' });
    expect(JSON.stringify(entries)).not.toMatch(/secret|hm=|attachments/u);
  });
});
