import { describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '../../test/support/responses.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import {
  GitHubIssues,
  MAX_ISSUE_TITLE,
  type IssueFetch,
  type IssueResponse,
} from './issue-gateway.js';

/** No half of a character in a text: no code point among the surrogates. */
const wellFormed = (text: string): boolean =>
  [...text].every((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < 0xd800 || code > 0xdfff;
  });

const TOKEN = 'ghp_secret-test-token';
const ISSUE = { title: 'Gym request: Old Stone Fountain (#2)', body: 'Text', labels: ['2'] };

function reply(status: number, body: unknown = {}): IssueResponse {
  return jsonResponse(body, { status });
}

function setup(
  answer: () => Promise<IssueResponse>,
  options: { token?: string; repo?: string } = {},
) {
  const { log, entries } = createTestLogger();
  const fetch = vi.fn<IssueFetch>(answer);
  const issues = new GitHubIssues({
    token: 'token' in options ? options.token : TOKEN,
    repo: 'repo' in options ? options.repo : 'pine-owner/pine-gyms',
    fetch,
    log,
  });
  /** Everything that was logged, as one text, to look for the token in. */
  const logged = () => JSON.stringify(entries);
  return { issues, fetch, entries, logged };
}

describe('GitHubIssues', () => {
  it('opens an issue in the repository with the token in the header', async () => {
    const made = setup(() =>
      Promise.resolve(reply(201, { number: 42, html_url: 'https://x.test/42' })),
    );
    expect(await made.issues.open(ISSUE)).toEqual({ ok: true, number: 42 });
    const [url, init] = made.fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://api.github.com/repos/pine-owner/pine-gyms/issues');
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('manual');
    expect(init?.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Professor-Pine',
    });
    expect(JSON.parse(init?.body ?? '')).toEqual(ISSUE);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(made.logged()).not.toContain(TOKEN);
  });

  it('cuts a title to what GitHub takes, never inside a character', async () => {
    const made = setup(() => Promise.resolve(reply(201, { number: 1 })));
    await made.issues.open({ ...ISSUE, title: 'x'.repeat(300) });
    await made.issues.open({ ...ISSUE, title: String.fromCodePoint(0x1f3db).repeat(300) });
    const titles = made.fetch.mock.calls.map(
      ([, init]) => (JSON.parse(init.body) as { title: string }).title,
    );
    for (const title of titles) {
      expect([...title]).toHaveLength(MAX_ISSUE_TITLE);
      expect(wellFormed(title)).toBe(true);
    }
  });

  it('counts an issue GitHub created as opened, also when its answer cannot be read', async () => {
    const made = setup(() =>
      Promise.resolve(jsonResponse(undefined, { status: 201, raw: 'not JSON' })),
    );
    expect(await made.issues.open(ISSUE)).toEqual({ ok: true, number: undefined });
  });

  it('answers a refusal with its status, and logs neither the token nor what GitHub said', async () => {
    const made = setup(() => Promise.resolve(reply(401, { message: `Bad credentials ${TOKEN}` })));
    expect(await made.issues.open(ISSUE)).toEqual({ ok: false, reason: 'refused', status: 401 });
    expect(made.logged()).toContain('401');
    expect(made.logged()).not.toContain(TOKEN);
    expect(made.logged()).not.toContain('Bad credentials');
  });

  it('logs what kind of refusal GitHub gave, by a word of its own, never its text', async () => {
    const archived = setup(() =>
      Promise.resolve(reply(403, { message: 'Repository was archived so is read-only.' })),
    );
    expect(await archived.issues.open(ISSUE)).toEqual({
      ok: false,
      reason: 'refused',
      status: 403,
    });
    expect(archived.entries.at(-1)).toMatchObject({ status: 403, refusal: 'archived' });
    expect(archived.logged()).not.toContain('read-only');
    const odd = setup(() => Promise.resolve(reply(422, { message: `Something ${TOKEN}` })));
    await odd.issues.open(ISSUE);
    expect(odd.entries.at(-1)).toMatchObject({ status: 422, refusal: 'other' });
    expect(odd.logged()).not.toContain(TOKEN);
  });

  it('reads no more of a refusal than a small limit', async () => {
    const huge = jsonResponse({ message: 'x'.repeat(100_000) }, { status: 403, pieceBytes: 1024 });
    const made = setup(() => Promise.resolve(huge));
    await made.issues.open(ISSUE);
    expect(made.entries.at(-1)).toMatchObject({ status: 403, refusal: 'unknown' });
    expect(huge.readBytes()).toBeLessThanOrEqual(17 * 1024);
    expect(huge.cancelled()).toBe(true);
  });

  it('follows no redirect: a moved repository is a refusal with its status in the log', async () => {
    const made = setup(() => Promise.resolve(reply(307)));
    expect(await made.issues.open(ISSUE)).toEqual({ ok: false, reason: 'refused', status: 307 });
    expect(made.fetch).toHaveBeenCalledTimes(1);
    expect(made.logged()).toContain('307');
  });

  it('answers a timeout and an unreachable GitHub without throwing', async () => {
    const timedOut = setup(() =>
      Promise.reject(new DOMException('The operation timed out.', 'TimeoutError')),
    );
    expect(await timedOut.issues.open(ISSUE)).toEqual({ ok: false, reason: 'timeout' });
    const unreachable = setup(() =>
      Promise.reject(new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND') })),
    );
    expect(await unreachable.issues.open(ISSUE)).toEqual({ ok: false, reason: 'unreachable' });
    expect(unreachable.logged()).toContain('ENOTFOUND');
  });

  it('asks nothing without a token or a repository', async () => {
    for (const options of [{ token: undefined }, { repo: undefined }, { token: '' }]) {
      const made = setup(() => Promise.resolve(reply(201)), options);
      expect(made.issues.enabled).toBe(false);
      expect(await made.issues.open(ISSUE)).toEqual({ ok: false, reason: 'disabled' });
      expect(made.fetch).not.toHaveBeenCalled();
    }
  });
});
