import { describe, expect, it } from 'vitest';
import { textAnswer } from '../../test/support/responses.js';
import type { LimitedResponse } from './limited-json.js';
import { fetchOnItsHost } from './same-host-fetch.js';

const HOME = 'https://feeds.example/raids/page.html';
const init = { redirect: 'manual' } as const;

/** A fetch by these answers, an address that has none being a 404; and what it was asked. */
function answering(answers: Record<string, LimitedResponse>) {
  const asked: string[] = [];
  const fetch = (url: string) => {
    asked.push(url);
    return Promise.resolve(answers[url] ?? textAnswer(404));
  };
  return { fetch, asked };
}

const leadingTo = (location: string, status = 308) => textAnswer(status, '', { location });

describe('fetchOnItsHost', () => {
  it('gives an answer that leads nowhere as it is, any status', async () => {
    const answer = textAnswer(503);
    const { fetch, asked } = answering({ [HOME]: answer });
    await expect(fetchOnItsHost(fetch, HOME, init)).resolves.toBe(answer);
    expect(asked).toEqual([HOME]);
  });

  it.each([301, 302, 303, 307, 308])('follows a %i on the same host', async (status) => {
    const page = textAnswer(200, 'page');
    const { fetch, asked } = answering({
      [HOME]: leadingTo('https://feeds.example/raids/page', status),
      'https://feeds.example/raids/page': page,
    });
    await expect(fetchOnItsHost(fetch, HOME, init)).resolves.toBe(page);
    expect(asked).toEqual([HOME, 'https://feeds.example/raids/page']);
  });

  it('reads an address relative to the one that gave it', async () => {
    const page = textAnswer(200, 'page');
    const { fetch } = answering({
      [HOME]: leadingTo('/raids/page'),
      'https://feeds.example/raids/page': page,
    });
    await expect(fetchOnItsHost(fetch, HOME, init)).resolves.toBe(page);
  });

  it.each([
    'https://elsewhere.example/raids/page',
    'https://feeds.example.elsewhere.example/page',
    'https://feeds.example:8443/raids/page',
    'http://feeds.example/raids/page',
    'http://mysql:3306/',
    'http://192.168.1.1/',
  ])('goes nowhere near %s', async (location) => {
    const { fetch, asked } = answering({ [HOME]: leadingTo(location) });
    await expect(fetchOnItsHost(fetch, HOME, init)).rejects.toThrow('another host');
    expect(asked).toEqual([HOME]);
  });

  it('refuses a redirect that names no address', async () => {
    const { fetch } = answering({ [HOME]: textAnswer(308) });
    await expect(fetchOnItsHost(fetch, HOME, init)).rejects.toThrow('another host');
  });

  it('gives up on an address that keeps leading on', async () => {
    const { fetch, asked } = answering({ [HOME]: leadingTo(HOME) });
    await expect(fetchOnItsHost(fetch, HOME, init)).rejects.toThrow('too many');
    expect(asked).toHaveLength(4);
  });
});
