import { describe, expect, it, vi } from 'vitest';
import { fakeTimeoutSignals, watchEachTest } from '../../test/support/timers.js';
import { pokebattlerAnswer, recordedMaxTeam } from '../../test/support/pokebattler.js';
import { jsonResponse } from '../../test/support/responses.js';
import { Tally } from '../../test/support/tally.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import type { LimitedResponse } from './limited-json.js';
import {
  PokebattlerFight,
  type CounterRequest,
  type MaxTeamRequest,
  type PokebattlerFetch,
} from './pokebattler-gateway.js';

const BODY = pokebattlerAnswer({
  average: [
    { pokemonId: 'TYRANITAR', byMove: [{ move1: 'BITE_FAST', move2: 'CRUNCH', seconds: 120 }] },
  ],
});

const REQUEST: CounterRequest = {
  bosses: ['LANDORUS_INCARNATE_FORM', 'LANDORUS'],
  raidLevel: 'RAID_LEVEL_5',
  attackers: { kind: 'level', level: '40' },
  weather: 'NO_WEATHER',
  friendship: '4',
  shadow: false,
  mega: false,
};

function setup(
  answer: (url: string, signal: AbortSignal) => Promise<LimitedResponse>,
  options: {
    maxBytes?: number;
    timeoutMs?: number;
    maxConcurrent?: number;
    cacheMs?: number;
    pauseMs?: number;
  } = {},
) {
  const { log, entries } = createTestLogger();
  /** The requests made, as a count a test can wait for. */
  const asked = new Tally('the requests to Pokebattler');
  const fetch = vi.fn<PokebattlerFetch>((url, init) => {
    asked.add();
    return answer(url, init.signal);
  });
  const clock = { now: 1_000_000 };
  const fight = new PokebattlerFight({ fetch, log, now: () => clock.now, ...options });
  const urls = () => fetch.mock.calls.map(([url]) => url);
  return { fight, fetch, entries, clock, urls, asked };
}
const background = watchEachTest();

describe('PokebattlerFight', () => {
  it('asks the API as the legacy bot did, and reads the answer', async () => {
    const timeouts = fakeTimeoutSignals();
    const made = setup(() => Promise.resolve(jsonResponse(BODY)));
    const outcome = await made.fight.counters(REQUEST);
    expect(outcome.ok && outcome.answer.average?.counters[0]?.pokemonId).toBe('TYRANITAR');
    expect(outcome.ok && outcome.query.boss).toBe('LANDORUS_INCARNATE_FORM');
    const [url, init] = made.fetch.mock.calls[0] ?? [];
    expect(url).toBe(
      'https://fight.pokebattler.com/raids/defenders/LANDORUS_INCARNATE_FORM/levels/RAID_LEVEL_5/' +
        'attackers/levels/40/strategies/CINEMATIC_ATTACK_WHEN_POSSIBLE/DEFENSE_RANDOM_MC?' +
        'sort=TIME&weatherCondition=NO_WEATHER&dodgeStrategy=DODGE_REACTION_TIME&' +
        'aggregation=AVERAGE&randomAssistants=-1&friendLevel=FRIENDSHIP_LEVEL_4&' +
        'includeShadow=false&includeMegas=false',
    );
    expect(init?.method).toBe('GET');
    expect(init?.redirect).toBe('error');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    // Pokebattler's developer page asks for a User-Agent that says who asks, with a contact.
    expect(init?.headers['User-Agent']).toBe(
      'Professor-Pine (+https://github.com/Googer/Professor-Pine)',
    );
    // A query Pokebattler has not worked out lately takes it longer than ten seconds.
    expect(timeouts.lengths).toEqual([30_000]);
  });

  it('asks under the next name of the boss when Pokebattler does not know the first', async () => {
    const made = setup((url) =>
      Promise.resolve(
        url.includes('_INCARNATE_FORM') ? jsonResponse({}, { status: 404 }) : jsonResponse(BODY),
      ),
    );
    const outcome = await made.fight.counters(REQUEST);
    expect(outcome.ok && outcome.query.boss).toBe('LANDORUS');
    expect(made.urls()).toHaveLength(2);
  });

  it('says it is unknown when no name is known, and does not keep that', async () => {
    const made = setup(() => Promise.resolve(jsonResponse({}, { status: 404 })));
    expect(await made.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'unknown' });
    await made.fight.counters(REQUEST);
    expect(made.urls()).toHaveLength(4);
    expect(await made.fight.counters({ ...REQUEST, bosses: [] })).toEqual({
      ok: false,
      reason: 'unknown',
    });
    expect(made.urls()).toHaveLength(4);
  });

  it('makes one request for the same setting at a time, and keeps the answer six hours', async () => {
    let release: (() => void) | undefined;
    const made = setup(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve(jsonResponse(BODY));
          };
        }),
    );
    const first = made.fight.counters(REQUEST);
    const second = made.fight.counters({ ...REQUEST });
    await made.asked.reached(1);
    expect(release).toBeDefined();
    release?.();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(made.urls()).toHaveLength(1);
    made.clock.now += 6 * 3_600_000 - 1_000;
    expect(await made.fight.counters(REQUEST)).toBe(a);
    expect(made.urls()).toHaveLength(1);
    // Another setting is another request, also shadow Pokémon or megas listed or not.
    void made.fight.counters({ ...REQUEST, weather: 'WINDY' });
    await made.asked.reached(2);
    expect(made.urls()).toHaveLength(2);
    release?.();
    void made.fight.counters({ ...REQUEST, shadow: true });
    await made.asked.reached(3);
    release?.();
    void made.fight.counters({ ...REQUEST, mega: true });
    await made.asked.reached(4);
    expect(made.urls()).toHaveLength(4);
    release?.();
    made.clock.now += 1_000;
    const again = made.fight.counters(REQUEST);
    await made.asked.reached(5);
    expect(made.urls()).toHaveLength(5);
    release?.();
    expect((await again).ok).toBe(true);
  });

  it('fails into an answer: a refusal, an answer too large or of another shape, no answer', async () => {
    const refused = setup(() => Promise.resolve(jsonResponse({}, { status: 503 })));
    expect(await refused.fight.counters(REQUEST)).toEqual({
      ok: false,
      reason: 'refused',
      status: 503,
    });
    const large = setup(() => Promise.resolve(jsonResponse(BODY, { pieceBytes: 50 })), {
      maxBytes: 100,
    });
    expect(await large.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'too-large' });
    const odd = setup(() => Promise.resolve(jsonResponse({ attackers: [] })));
    expect(await odd.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'unreadable' });
    const html = setup(() => Promise.resolve(jsonResponse(null, { raw: '<html>' })));
    expect(await html.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'unreadable' });
    const down = setup(() => Promise.reject(new TypeError('fetch failed')));
    expect(await down.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'unreachable' });
    const slow = setup(() =>
      Promise.reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' })),
    );
    expect(await slow.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'timeout' });
    expect(slow.entries.some((entry) => entry.msg === 'could not ask Pokebattler')).toBe(true);
  });

  it('asks under the next name when an answer has no counters, and says so of none', async () => {
    const empty = pokebattlerAnswer({ average: [] });
    const made = setup((url) =>
      Promise.resolve(jsonResponse(url.includes('_INCARNATE_FORM') ? empty : BODY)),
    );
    const outcome = await made.fight.counters(REQUEST);
    expect(outcome.ok && outcome.query.boss).toBe('LANDORUS');
    const none = setup(() => Promise.resolve(jsonResponse(empty)));
    expect(await none.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'empty' });
    expect(none.urls()).toHaveLength(2);
    // An empty answer is not kept either.
    await none.fight.counters(REQUEST);
    expect(none.urls()).toHaveLength(4);
  });

  it('does not keep the answer for a Pokébox, which its owner may change at any time', async () => {
    const made = setup(() => Promise.resolve(jsonResponse(BODY)));
    const box: CounterRequest = { ...REQUEST, attackers: { kind: 'box', userId: 4242 } };
    await made.fight.counters(box);
    await made.fight.counters(box);
    expect(made.urls()).toHaveLength(2);
  });

  it('makes three requests at once at most; the others wait for their turn', async () => {
    const releases: (() => void)[] = [];
    const made = setup(
      () =>
        new Promise((resolve) => {
          releases.push(() => {
            resolve(jsonResponse(BODY));
          });
        }),
    );
    const asked = ['WINDY', 'RAINY', 'FOG', 'SNOW'].map((weather) =>
      made.fight.counters({ ...REQUEST, weather: weather as CounterRequest['weather'] }),
    );
    await made.asked.reached(3);
    expect(made.urls()).toHaveLength(3);
    await background.settle();
    expect(made.urls()).toHaveLength(3);
    releases[0]?.();
    await made.asked.reached(4);
    expect(made.urls()).toHaveLength(4);
    for (const release of releases.slice(1)) release();
    expect((await Promise.all(asked)).every((outcome) => outcome.ok)).toBe(true);
  });

  it('gives up a body that stops coming at the time limit', async () => {
    const stalled = (signal: AbortSignal): LimitedResponse => ({
      status: 200,
      headers: { get: () => null },
      body: {
        getReader: () => ({
          read: () =>
            new Promise((_resolve, reject) => {
              if (signal.aborted) reject(signal.reason as Error);
              signal.addEventListener('abort', () => {
                reject(signal.reason as Error);
              });
            }),
          cancel: () => Promise.resolve(),
        }),
      },
    });
    const timeouts = fakeTimeoutSignals();
    const made = setup((_url, signal) => Promise.resolve(stalled(signal)), { timeoutMs: 30 });
    const asking = made.fight.counters(REQUEST);
    await made.asked.reached(1);
    timeouts.expire();
    expect(await asking).toEqual({ ok: false, reason: 'timeout' });
  });

  it('says it is busy when ten requests wait for their turn already', async () => {
    const releases: (() => void)[] = [];
    const made = setup(
      () =>
        new Promise((resolve) => {
          releases.push(() => {
            resolve(jsonResponse(BODY));
          });
        }),
      { maxConcurrent: 2 },
    );
    // Two on their way, ten waiting.
    const asked = Array.from({ length: 12 }, (_unused, i) =>
      made.fight.counters({ ...REQUEST, bosses: [`BOSS_${String(i)}`] }),
    );
    await made.asked.reached(2);
    expect(made.urls()).toHaveLength(2);
    expect(await made.fight.counters({ ...REQUEST, bosses: ['ONE_MORE'] })).toEqual({
      ok: false,
      reason: 'busy',
    });
    // What is asked already is still answered from what is on its way.
    const again = made.fight.counters({ ...REQUEST, bosses: ['BOSS_0'] });
    // Twelve answers, one at a time: each frees the place of the next.
    for (let answered = 0; releases.length > 0 || made.urls().length < 12; answered++) {
      if (answered === 12) {
        throw new Error(
          `after 12 answers ${String(made.urls().length)} were asked, ` +
            `${String(releases.length)} still on their way`,
        );
      }
      releases.shift()?.();
      await background.settle();
    }
    expect((await Promise.all([...asked, again])).every((outcome) => outcome.ok)).toBe(true);
    expect(made.urls()).toHaveLength(12);
    // Once the line is short again, one more is asked.
    const late = made.fight.counters({ ...REQUEST, bosses: ['ONE_MORE'] });
    await made.asked.reached(13);
    expect(made.urls()).toHaveLength(13);
    releases.shift()?.();
    expect((await late).ok).toBe(true);
  });

  it('answers at once for a minute after Pokebattler could not be reached', async () => {
    let failing = true;
    const made = setup(() =>
      failing ? Promise.reject(new TypeError('fetch failed')) : Promise.resolve(jsonResponse(BODY)),
    );
    expect(await made.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'unreachable' });
    failing = false;
    made.clock.now += 59_999;
    expect(await made.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'unavailable' });
    expect(made.urls()).toHaveLength(1);
    made.clock.now += 1;
    expect((await made.fight.counters(REQUEST)).ok).toBe(true);
    expect(made.urls()).toHaveLength(2);
  });

  it('does not pause after a timeout: Pokebattler is working the query out, not down', async () => {
    let failing = true;
    const made = setup(() =>
      failing
        ? Promise.reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
        : Promise.resolve(jsonResponse(BODY)),
    );
    expect(await made.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'timeout' });
    expect(made.entries.find((entry) => entry.msg === 'could not ask Pokebattler')).toMatchObject({
      reason: 'timeout',
    });
    // The same query a moment later, and another, are asked at once.
    failing = false;
    expect((await made.fight.counters(REQUEST)).ok).toBe(true);
    expect((await made.fight.counters({ ...REQUEST, weather: 'WINDY' })).ok).toBe(true);
    expect(made.urls()).toHaveLength(3);
  });

  it('reads a raid answer up to 32 MB and keeps only what can be shown of it', async () => {
    // Pokebattler's answer for Mew in a T5 raid was 14.7 MB (2026-10-22).
    const counters = Array.from({ length: 30 }, (_unused, i) => ({
      pokemonId: i === 0 ? 'TYRANITAR_SHADOW_FORM' : `COUNTER_${String(i)}`,
      byMove: [
        { move1: 'BITE_FAST', move2: 'CRUNCH', seconds: 100 + i },
        { move1: 'BITE_FAST', move2: 'BRUTAL_SWING', seconds: 140 + i },
      ],
    }));
    const big = {
      ...(pokebattlerAnswer({ average: counters }) as object),
      padding: 'x'.repeat(6 * 1024 * 1024),
    };
    const made = setup(() => Promise.resolve(jsonResponse(big, { pieceBytes: 1024 * 1024 })));
    const outcome = await made.fight.counters(REQUEST);
    if (!outcome.ok) throw new Error(`no answer: ${outcome.reason}`);
    const kept = outcome.answer.average?.counters ?? [];
    // The twelve fastest that are no shadow, with their best moveset only (and those of the
    // twelve fastest movesets, all of them best movesets here).
    expect(kept.map((counter) => counter.pokemonId)).toEqual(
      Array.from({ length: 12 }, (_unused, i) => `COUNTER_${String(i + 1)}`),
    );
    expect(kept.every((counter) => counter.results.length === 1)).toBe(true);
    // Past 32 MB it is too large, as its length says before a byte is read.
    const huge = setup(() =>
      Promise.resolve(jsonResponse(BODY, { contentLength: 32 * 1024 * 1024 + 1 })),
    );
    expect(await huge.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'too-large' });
  });

  it('keeps 200 answers of each kind, the oldest going first', async () => {
    const made = setup(() => Promise.resolve(jsonResponse(BODY)));
    for (let i = 0; i < 200; i += 1) {
      await made.fight.counters({ ...REQUEST, bosses: [`BOSS_${String(i)}`] });
    }
    await made.fight.counters({ ...REQUEST, bosses: ['BOSS_0'] });
    expect(made.urls()).toHaveLength(200);
    await made.fight.counters({ ...REQUEST, bosses: ['BOSS_200'] });
    await made.fight.counters({ ...REQUEST, bosses: ['BOSS_1'] });
    expect(made.urls()).toHaveLength(201);
    await made.fight.counters({ ...REQUEST, bosses: ['BOSS_0'] });
    expect(made.urls()).toHaveLength(202);
  });

  it('keeps an answer no longer than its Cache-Control allows, and never when it says no-store', async () => {
    const made = setup((url) =>
      Promise.resolve(
        jsonResponse(BODY, {
          headers: {
            'cache-control': url.includes('WINDY') ? 'no-store' : 'public, max-age=60',
          },
        }),
      ),
    );
    await made.fight.counters(REQUEST);
    made.clock.now += 59_000;
    await made.fight.counters(REQUEST);
    expect(made.urls()).toHaveLength(1);
    made.clock.now += 1_000;
    await made.fight.counters(REQUEST);
    expect(made.urls()).toHaveLength(2);
    await made.fight.counters({ ...REQUEST, weather: 'WINDY' });
    await made.fight.counters({ ...REQUEST, weather: 'WINDY' });
    expect(made.urls()).toHaveLength(4);
    // A longer max-age than six hours does not keep it longer.
    const long = setup(() =>
      Promise.resolve(jsonResponse(BODY, { headers: { 'cache-control': 'max-age=86400' } })),
    );
    await long.fight.counters(REQUEST);
    long.clock.now += 6 * 3_600_000;
    await long.fight.counters(REQUEST);
    expect(long.urls()).toHaveLength(2);
  });

  // Review r0 A1: Pokebattler sends `cache-control: max-age=3600` and a weak ETag (probed by
  // the controller, 2026-10-22).
  it('asks again after max-age with If-None-Match, and a 304 renews the kept answer', async () => {
    let answer: () => LimitedResponse = () =>
      jsonResponse(BODY, { headers: { 'cache-control': 'max-age=3600', etag: 'W/"abc"' } });
    const made = setup(() => Promise.resolve(answer()));
    const first = await made.fight.counters(REQUEST);
    const sentWith = (n: number) => made.fetch.mock.calls[n]?.[1].headers['If-None-Match'];
    expect(sentWith(0)).toBeUndefined();
    made.clock.now += 3_599_000;
    expect(await made.fight.counters(REQUEST)).toBe(first);
    expect(made.urls()).toHaveLength(1);
    // Past max-age: asked again, the ETag sent; Pokebattler says nothing changed.
    made.clock.now += 1_000;
    const notModified = jsonResponse(null, { status: 304, raw: '' });
    answer = () => notModified;
    expect(await made.fight.counters(REQUEST)).toBe(first);
    expect(made.urls()).toHaveLength(2);
    expect(made.urls()[1]).toBe(made.urls()[0]);
    expect(sentWith(1)).toBe('W/"abc"');
    expect(notModified.readBytes()).toBe(0);
    // At debug the log tells each answer, the 304 with the ETag it renewed (final review F5).
    const answered = made.entries.filter((entry) => entry.msg === 'Pokebattler answered');
    expect(answered).toMatchObject([
      { level: 20, boss: 'LANDORUS_INCARNATE_FORM', status: 200 },
      { level: 20, boss: 'LANDORUS_INCARNATE_FORM', status: 304, etag: 'W/"abc"' },
    ]);
    // Renewed: kept another hour, past the first six hours too.
    made.clock.now += 3_599_000;
    expect(await made.fight.counters(REQUEST)).toBe(first);
    expect(made.urls()).toHaveLength(2);
    // A new answer at the next look replaces it.
    made.clock.now += 1_000;
    const changed = pokebattlerAnswer({
      average: [
        {
          pokemonId: 'MACHAMP',
          byMove: [{ move1: 'COUNTER_FAST', move2: 'CROSS_CHOP', seconds: 99 }],
        },
      ],
    });
    answer = () =>
      jsonResponse(changed, { headers: { 'cache-control': 'max-age=3600', etag: 'W/"def"' } });
    const second = await made.fight.counters(REQUEST);
    expect(second.ok && second.answer.average?.counters[0]?.pokemonId).toBe('MACHAMP');
    expect(await made.fight.counters(REQUEST)).toBe(second);
    expect(made.urls()).toHaveLength(3);
  });

  // Review r1, R1-2: after a revalidation that found no answer, the next requests do not wait
  // the full time out again: the kept answer is fresh for a minute more.
  it('keeps the kept answer fresh a minute after a revalidation that found no answer', async () => {
    let failing = false;
    const made = setup(() =>
      failing
        ? Promise.reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
        : Promise.resolve(
            jsonResponse(BODY, { headers: { 'cache-control': 'max-age=60', etag: 'W/"abc"' } }),
          ),
    );
    const first = await made.fight.counters(REQUEST);
    made.clock.now += 61_000;
    failing = true;
    expect(await made.fight.counters(REQUEST)).toBe(first);
    made.clock.now += 59_000;
    expect(await made.fight.counters(REQUEST)).toBe(first);
    expect(made.urls()).toHaveLength(2);
    // A minute later it is asked again.
    made.clock.now += 1_000;
    expect(await made.fight.counters(REQUEST)).toBe(first);
    expect(made.urls()).toHaveLength(3);
  });

  // Review r1, R1-3: a name Pokebattler no longer knows sends the request through every name.
  it('asks under every name again when the kept answer’s name is no longer known', async () => {
    let incarnateKnown = false;
    const made = setup((url) => {
      const headers = { 'cache-control': 'max-age=60', etag: 'W/"abc"' };
      if (url.includes('_INCARNATE_FORM')) {
        return Promise.resolve(
          incarnateKnown ? jsonResponse(BODY, { headers }) : jsonResponse({}, { status: 404 }),
        );
      }
      return Promise.resolve(
        incarnateKnown ? jsonResponse({}, { status: 404 }) : jsonResponse(BODY, { headers }),
      );
    });
    const first = await made.fight.counters(REQUEST);
    expect(first.ok && first.query.boss).toBe('LANDORUS');
    made.clock.now += 61_000;
    incarnateKnown = true;
    const again = await made.fight.counters(REQUEST);
    expect(again.ok && again.query.boss).toBe('LANDORUS_INCARNATE_FORM');
    // LANDORUS, then INCARNATE and LANDORUS asked again (the second LANDORUS with its ETag).
    expect(made.urls()).toHaveLength(4);
    expect(await made.fight.counters(REQUEST)).toBe(again);
  });

  // Review r1, R1-4.
  it('renews a kept answer by 304s past the time answers are kept, without a download', async () => {
    const made = setup(
      () =>
        Promise.resolve(
          made.urls().length === 1
            ? jsonResponse(BODY, { headers: { 'cache-control': 'max-age=3600', etag: 'W/"abc"' } })
            : jsonResponse(null, { status: 304, raw: '' }),
        ),
      { cacheMs: 2 * 3_600_000 },
    );
    const first = await made.fight.counters(REQUEST);
    for (let round = 1; round <= 3; round++) {
      made.clock.now += 3_600_000;
      expect(await made.fight.counters(REQUEST)).toBe(first);
    }
    expect(made.urls()).toHaveLength(4);
  });

  it('makes one revalidation for two asking at once, and serves the kept answer while paused', async () => {
    let release: ((response: LimitedResponse) => void) | undefined;
    let down = false;
    const made = setup(
      (url) => {
        if (down) return Promise.reject(new TypeError('fetch failed'));
        if (made.urls().length === 1) {
          return Promise.resolve(
            jsonResponse(BODY, { headers: { 'cache-control': 'max-age=60', etag: 'W/"abc"' } }),
          );
        }
        return url.includes('WINDY')
          ? Promise.resolve(jsonResponse(BODY))
          : new Promise((resolve) => {
              release = resolve;
            });
      },
      { pauseMs: 120_000 },
    );
    const first = await made.fight.counters(REQUEST);
    made.clock.now += 61_000;
    const a = made.fight.counters(REQUEST);
    const b = made.fight.counters(REQUEST);
    await made.asked.reached(2);
    release?.(jsonResponse(null, { status: 304, raw: '' }));
    expect(await a).toBe(first);
    expect(await b).toBe(first);
    expect(made.urls()).toHaveLength(2);
    // Pokebattler out of reach pauses it; a stale kept answer is served meanwhile.
    down = true;
    await made.fight.counters({ ...REQUEST, weather: 'WINDY' });
    made.clock.now += 61_000;
    expect(await made.fight.counters(REQUEST)).toBe(first);
    expect(made.urls()).toHaveLength(3);
  });

  it('answers with the kept answer when its revalidation finds no answer', async () => {
    let failing = false;
    const made = setup(() =>
      failing
        ? Promise.reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
        : Promise.resolve(
            jsonResponse(BODY, { headers: { 'cache-control': 'max-age=60', etag: 'W/"abc"' } }),
          ),
    );
    const first = await made.fight.counters(REQUEST);
    made.clock.now += 61_000;
    failing = true;
    expect(await made.fight.counters(REQUEST)).toBe(first);
    expect(made.urls()).toHaveLength(2);
  });

  it('keeps an answer of no-cache but asks again each time, and keeps none of no-store, said once', async () => {
    const made = setup((url) =>
      Promise.resolve(
        url.includes('WINDY')
          ? jsonResponse(BODY, { headers: { 'cache-control': 'no-store', etag: 'W/"x"' } })
          : jsonResponse(BODY, { headers: { 'cache-control': 'no-cache', etag: 'W/"abc"' } }),
      ),
    );
    await made.fight.counters(REQUEST);
    await made.fight.counters(REQUEST);
    expect(made.fetch.mock.calls[1]?.[1].headers['If-None-Match']).toBe('W/"abc"');
    await made.fight.counters({ ...REQUEST, weather: 'WINDY' });
    await made.fight.counters({ ...REQUEST, weather: 'WINDY' });
    expect(made.fetch.mock.calls[3]?.[1].headers['If-None-Match']).toBeUndefined();
    expect(
      made.entries.filter(
        (entry) => entry.msg === 'Pokebattler asks for its answers not to be kept',
      ),
    ).toHaveLength(1);
  });

  it('does not send what waited for its turn once Pokebattler gave no answer', async () => {
    let fail: (() => void) | undefined;
    const made = setup(
      () =>
        new Promise((_resolve, reject) => {
          fail = () => {
            reject(new TypeError('fetch failed'));
          };
        }),
      { maxConcurrent: 1 },
    );
    const first = made.fight.counters(REQUEST);
    const waiting = made.fight.counters({ ...REQUEST, weather: 'WINDY' });
    await made.asked.reached(1);
    expect(made.urls()).toHaveLength(1);
    fail?.();
    expect(await first).toEqual({ ok: false, reason: 'unreachable' });
    expect(await waiting).toEqual({ ok: false, reason: 'unavailable' });
    expect(made.urls()).toHaveLength(1);
  });

  it('counts a Pokébox that Pokebattler will not show as unknown', async () => {
    const box: CounterRequest = { ...REQUEST, attackers: { kind: 'box', userId: 4242 } };
    for (const status of [401, 403]) {
      const made = setup(() => Promise.resolve(jsonResponse({}, { status })));
      expect(await made.fight.counters(box)).toEqual({ ok: false, reason: 'unknown' });
      // For counters at a level it is a refusal.
      expect(await made.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'refused', status });
    }
  });

  it('asks for a Pokébox by its user id', async () => {
    const made = setup(() => Promise.resolve(jsonResponse(BODY)));
    await made.fight.counters({ ...REQUEST, attackers: { kind: 'box', userId: 4242 } });
    expect(made.urls()[0]).toContain('/attackers/users/4242/strategies/');
  });
});

const MAX_REQUEST: MaxTeamRequest = {
  bosses: ['MACHAMP_GIGANTAMAX'],
  maxLevel: 'RAID_LEVEL_6_MAX',
  role: 'defensive',
  level: '40',
  weather: 'NO_WEATHER',
  friendship: '4',
};

describe('PokebattlerFight: max battle teams', () => {
  it('asks for the role’s team and reads the answer', async () => {
    const made = setup(() => Promise.resolve(jsonResponse(recordedMaxTeam('gmax-machamp-2-0-1'))));
    const outcome = await made.fight.maxTeam(MAX_REQUEST);
    expect(outcome.ok && outcome.answer.slots.map((slot) => slot.pick.pokemonId)).toEqual([
      'ZACIAN_CROWNED_SWORD_FORM',
      'GALLADE',
      'ZAMAZENTA_CROWNED_SHIELD_FORM',
    ]);
    expect(outcome.ok && outcome.query).toEqual({
      boss: 'MACHAMP_GIGANTAMAX',
      maxLevel: 'RAID_LEVEL_6_MAX',
      role: 'defensive',
      level: '40',
      weather: 'NO_WEATHER',
      friendship: '4',
    });
    const [url, init] = made.fetch.mock.calls[0] ?? [];
    expect(url).toBe(
      'https://fight.pokebattler.com/max/parties/suggested/defenders/MACHAMP_GIGANTAMAX/levels/' +
        'RAID_LEVEL_6_MAX?attack=1&heal=0&shield=0&charge=2&meterCharge=0&level=40&' +
        'weatherCondition=NO_WEATHER&' +
        'friendLevel=FRIENDSHIP_LEVEL_4',
    );
    expect(init?.headers['User-Agent']).toBe(
      'Professor-Pine (+https://github.com/Googer/Professor-Pine)',
    );
    expect(init?.redirect).toBe('error');
  });

  it('asks under the next name on 400 or 404 or an empty team, and says which', async () => {
    const made = setup((url) =>
      Promise.resolve(
        url.includes('/ZACIAN_HERO_FORM/')
          ? jsonResponse({ status: '400', error: 'Bad Request' }, { status: 400 })
          : jsonResponse(recordedMaxTeam('uxie-d5-3-0-0')),
      ),
    );
    const outcome = await made.fight.maxTeam({
      ...MAX_REQUEST,
      bosses: ['ZACIAN_HERO_FORM', 'ZACIAN'],
      maxLevel: 'RAID_LEVEL_5_MAX',
    });
    expect(outcome.ok && outcome.query.boss).toBe('ZACIAN');
    expect(made.urls()).toHaveLength(2);
    const unknown = setup(() => Promise.resolve(jsonResponse({}, { status: 404 })));
    expect(await unknown.fight.maxTeam(MAX_REQUEST)).toEqual({ ok: false, reason: 'unknown' });
    const empty = setup(() => Promise.resolve(jsonResponse({ slots: [] })));
    expect(await empty.fight.maxTeam(MAX_REQUEST)).toEqual({ ok: false, reason: 'empty' });
    const odd = setup(() => Promise.resolve(jsonResponse({ attackers: [] })));
    expect(await odd.fight.maxTeam(MAX_REQUEST)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('makes one request for the same team at a time, and keeps it six hours', async () => {
    const made = setup(() => Promise.resolve(jsonResponse(recordedMaxTeam('gmax-machamp-2-0-1'))));
    const [a, b] = await Promise.all([
      made.fight.maxTeam(MAX_REQUEST),
      made.fight.maxTeam({ ...MAX_REQUEST }),
    ]);
    expect(a).toBe(b);
    made.clock.now += 6 * 3_600_000 - 1_000;
    expect(await made.fight.maxTeam(MAX_REQUEST)).toBe(a);
    expect(made.urls()).toHaveLength(1);
    // Another role or level is another request.
    await made.fight.maxTeam({ ...MAX_REQUEST, role: 'shielder' });
    await made.fight.maxTeam({ ...MAX_REQUEST, level: '30' });
    await made.fight.maxTeam({ ...MAX_REQUEST, weather: 'RAINY' });
    await made.fight.maxTeam({ ...MAX_REQUEST, friendship: '0' });
    expect(made.urls()).toHaveLength(5);
    made.clock.now += 1_000;
    await made.fight.maxTeam(MAX_REQUEST);
    expect(made.urls()).toHaveLength(6);
  });

  it('shares the pause with the raid counters after Pokebattler gave no answer', async () => {
    let failing = true;
    const made = setup((url) =>
      failing
        ? Promise.reject(new TypeError('fetch failed'))
        : Promise.resolve(
            jsonResponse(url.includes('/max/') ? recordedMaxTeam('gmax-machamp-2-0-1') : BODY),
          ),
    );
    expect(await made.fight.maxTeam(MAX_REQUEST)).toEqual({ ok: false, reason: 'unreachable' });
    failing = false;
    expect(await made.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'unavailable' });
    expect(await made.fight.maxTeam(MAX_REQUEST)).toEqual({ ok: false, reason: 'unavailable' });
    expect(made.urls()).toHaveLength(1);
    made.clock.now += 60_000;
    expect((await made.fight.maxTeam(MAX_REQUEST)).ok).toBe(true);
    expect(
      made.entries.some(
        (entry) =>
          entry.msg === 'could not ask Pokebattler' && entry['maxLevel'] === 'RAID_LEVEL_6_MAX',
      ),
    ).toBe(true);
  });

  it('says an answer none of whose slots fit is unreadable, and warns of what it left out', async () => {
    const renamed = recordedMaxTeam('gmax-machamp-2-0-1') as { slots: Record<string, unknown>[] };
    for (const slot of renamed.slots) delete slot['quickMove'];
    const odd = setup(() => Promise.resolve(jsonResponse(renamed)));
    expect(await odd.fight.maxTeam(MAX_REQUEST)).toEqual({ ok: false, reason: 'unreadable' });
    expect(odd.entries.map((entry) => entry.msg)).toContain(
      'the answer of Pokebattler is not of the shape known',
    );
    const partly = recordedMaxTeam('gmax-machamp-2-0-1') as { slots: Record<string, unknown>[] };
    const [first] = partly.slots;
    if (!first) throw new Error('the recorded answer has no slots');
    delete first['quickMove'];
    const some = setup(() => Promise.resolve(jsonResponse(partly)));
    expect((await some.fight.maxTeam(MAX_REQUEST)).ok).toBe(true);
    const warned = some.entries.filter(
      (entry) => entry.msg === 'Pokebattler’s max battle team had parts not of the shape known',
    );
    expect(warned).toHaveLength(1);
    expect(warned[0]).toMatchObject({ slots: 1, alternatives: 0, boss: 'MACHAMP_GIGANTAMAX' });
  });

  it('reads a max battle team up to 5 MB only', async () => {
    const big = {
      ...(recordedMaxTeam('gmax-machamp-2-0-1') as object),
      padding: 'x'.repeat(5 * 1024 * 1024),
    };
    const made = setup(() => Promise.resolve(jsonResponse(big, { pieceBytes: 1024 * 1024 })));
    expect(await made.fight.maxTeam(MAX_REQUEST)).toEqual({ ok: false, reason: 'too-large' });
  });

  it('says of a boss by a name Pokebattler does not know that it has no team, not counters', async () => {
    const made = setup(() => Promise.resolve(jsonResponse({}, { status: 404 })));
    await made.fight.maxTeam(MAX_REQUEST);
    // Above debug, where each answer is told.
    const told = made.entries.filter((entry) => Number(entry.level) > 20);
    expect(told.map((entry) => entry.msg)).toEqual([
      'Pokebattler has no max battle team for this boss by this name',
    ]);
  });

  it('counts the raid counters and the max teams waiting for their turn together', async () => {
    const releases: (() => void)[] = [];
    const made = setup(
      (url) =>
        new Promise((resolve) => {
          releases.push(() => {
            resolve(
              jsonResponse(url.includes('/max/') ? recordedMaxTeam('gmax-machamp-2-0-1') : BODY),
            );
          });
        }),
      { maxConcurrent: 2 },
    );
    // Two on their way and ten waiting, raid counters and max teams mixed.
    const asked = Array.from({ length: 12 }, (_unused, i) =>
      i % 2 === 0
        ? made.fight.counters({ ...REQUEST, bosses: [`BOSS_${String(i)}`] })
        : made.fight.maxTeam({ ...MAX_REQUEST, bosses: [`BOSS_${String(i)}`] }),
    );
    await made.asked.reached(2);
    expect(await made.fight.maxTeam({ ...MAX_REQUEST, bosses: ['ONE_MORE'] })).toEqual({
      ok: false,
      reason: 'busy',
    });
    expect(await made.fight.counters({ ...REQUEST, bosses: ['ONE_MORE'] })).toEqual({
      ok: false,
      reason: 'busy',
    });
    for (let answered = 0; releases.length > 0 || made.urls().length < 12; answered++) {
      if (answered === 12) throw new Error('the requests waiting were not all asked');
      releases.shift()?.();
      await background.settle();
    }
    expect((await Promise.all(asked)).every((outcome) => outcome.ok)).toBe(true);
  });
});
