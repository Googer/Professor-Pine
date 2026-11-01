import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { failureWords, REQUEST_TIMEOUT_MS, requestError, timed } from './request-error.js';

describe('a request the server refused (plan 8M-10, C2)', () => {
  it("keeps the server's words of a refusal, with its status", () => {
    const refused = requestError(
      403,
      '{"error":"Only staff of this server may edit its regions."}',
    );
    expect(refused).toBeInstanceOf(Error);
    expect(refused.status).toBe(403);
    expect(refused.words).toBe('Only staff of this server may edit its regions.');
    // As before: the status as the message.
    expect(refused.message).toBe('403');
  });

  it('has no words where the answer says none it can read', () => {
    for (const body of ['', 'Not found.', '{"error":42}', '[]', 'null', '{"error":"  "}']) {
      expect(requestError(502, body).words, body).toBeUndefined();
    }
  });

  it("says the server's words, or the page's own when it said none or nothing came back", () => {
    const fallback = 'The regions could not be loaded. Try again in a moment.';
    expect(failureWords(requestError(503, '{"error":"Not available just now."}'), fallback)).toBe(
      'Not available just now.',
    );
    expect(failureWords(requestError(500, ''), fallback)).toBe(fallback);
    expect(failureWords(new TypeError('Failed to fetch'), fallback)).toBe(fallback);
  });
});

describe("a request of the region editor's (review 2, R2)", () => {
  /** A server that never answers: the request fails when its signal aborts, as `fetch` does. */
  function stalled(init: RequestInit): Promise<Response> {
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        reject(init.signal?.reason as Error);
      });
    });
  }

  it('fails as no answer once a minute has gone by without one', async () => {
    // The time limit, faked (as `fakeTimeoutSignals` of `test/support/timers.ts`, which the
    // page's own typecheck cannot read): it ends when the test says.
    const limit = new AbortController();
    const made = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(limit.signal);
    onTestFinished(() => {
      made.mockRestore();
    });
    const init = timed({ method: 'POST', body: '{}', cache: 'no-cache' });
    expect(init).toMatchObject({ method: 'POST', body: '{}', cache: 'no-cache' });
    const asked = stalled(init);
    expect(made.mock.calls).toEqual([[REQUEST_TIMEOUT_MS]]);
    expect(REQUEST_TIMEOUT_MS).toBe(60_000);
    limit.abort(new DOMException('The operation timed out.', 'TimeoutError'));
    const failed = await asked.catch((err: unknown) => err);
    // The page's own words, as for an answer that never came.
    expect(failureWords(failed, 'The preview could not be asked for.')).toBe(
      'The preview could not be asked for.',
    );
  });
});
