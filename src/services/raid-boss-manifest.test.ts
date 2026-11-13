import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakePartyGateway } from '../../test/support/fake-gateway.js';
import { catalogueFixture } from '../../test/support/game-data.js';
import { MemoryRaidBossStore } from '../../test/support/raid-bosses.js';
import {
  readRaidManifestFixture,
  readRotationFixture,
  readScrapedDuckRaidsText,
} from '../../test/support/raid-manifest.js';
import { textAnswer } from '../../test/support/responses.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { raidTierLabel } from '../domain/pogo/raid-tier.js';
import { AFTER_CHANGE_MS } from './boss-feed-service.js';
import { RaidBossService, type FeedChange, type FetchFeed } from './raid-boss-service.js';
import { sameRotations } from './raid-rotations.js';
import { zonedAt } from '../../test/support/time.js';
import { TestServers, testServerValues } from '../../test/support/server-values.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { loadSettings } from '../config/settings.js';
import { RaidBossAnnouncer } from './raid-boss-announcer.js';

const ZONE = 'America/New_York';
const FEED = 'https://example.test/raids.min.json';
const MANIFEST = 'https://leekduck.example/raids/manifest.json';
const PAGES = 'https://leekduck.example/raids/';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const FROM_MANIFEST = "raid bosses read from Leek Duck's raid manifest";
const FROM_FALLBACK = 'raid bosses read from the fallback feed';

type Response = Awaited<ReturnType<FetchFeed>>;

function reply(status: number, body = '', headers: Record<string, string> = {}): Response {
  return textAnswer(status, body, headers);
}

/** A wall-clock time in New York as epoch milliseconds. */
function at(local: string): number {
  return zonedAt(local, ZONE);
}

const manifestText = JSON.stringify(readRaidManifestFixture());

/** The manifest of 2026-10-27 with `change` applied to a copy. */
function manifestWith(change: (manifest: Record<string, unknown[]>) => void): string {
  const manifest = readRaidManifestFixture() as Record<string, unknown[]>;
  change(manifest);
  return JSON.stringify(manifest);
}

describe('RaidBossService with Leek Duck’s raid manifest', () => {
  let now: number;
  let store: MemoryRaidBossStore;
  let requests: { url: string; headers: Record<string, string> }[];
  /** What each address answers; an address not listed answers 404. */
  let routes: Map<string, (init: Parameters<FetchFeed>[1]) => Promise<Response>>;

  function route(
    url: string,
    answer: Response | ((init: Parameters<FetchFeed>[1]) => Promise<Response>),
  ): void {
    routes.set(url, typeof answer === 'function' ? answer : () => Promise.resolve(answer));
  }

  function routeEveryPage(): void {
    for (const slug of [
      'palkia-mega-charizard-x-mega-charizard-y',
      'halloween-2026-part-1-palkia',
      'giratina-origin-mega-sableye',
      'chandelure-super-mega-raid-day-2026',
      'shadow-landorus-incarnate-october-november-2026',
    ]) {
      route(`${PAGES}${slug}.html`, reply(200, readRotationFixture(slug)));
    }
  }

  function service(
    extra: {
      now?: () => number;
      refreshMs?: number;
      retryMs?: number;
      zones?: () => readonly string[];
    } = { now: () => now },
  ) {
    const { log, entries } = createTestLogger();
    const changes: FeedChange[] = [];
    const raidBosses = new RaidBossService({
      url: FEED,
      manifest: { url: MANIFEST, zone: ZONE },
      refreshMs: HOUR,
      staleAfterMs: 48 * HOUR,
      store,
      gameData: { catalogue: catalogueFixture() },
      fetch: (url, init) => {
        requests.push({ url, headers: init.headers });
        return routes.get(url)?.(init) ?? Promise.resolve(reply(404));
      },
      log,
      ...extra,
    });
    raidBosses.onChange((change) => {
      changes.push(change);
    });
    return { raidBosses, entries, changes };
  }

  /** The list in effect, a line per tier: `1-Star: Axew, Goomy`. */
  function tiers(raidBosses: RaidBossService, zone: string = ZONE): string[] {
    const lines = new Map<string, string[]>();
    for (const boss of raidBosses.bosses(zone)) {
      const label = raidTierLabel(boss.tier);
      lines.set(label, [...(lines.get(label) ?? []), boss.name]);
    }
    return [...lines].map(([label, names]) => `${label}: ${names.join(', ')}`);
  }

  const sourceLines = (entries: Record<string, unknown>[]) =>
    entries.filter((e) => e['msg'] === FROM_MANIFEST || e['msg'] === FROM_FALLBACK);

  beforeEach(() => {
    now = at('2026-10-27T09:59');
    store = new MemoryRaidBossStore();
    requests = [];
    routes = new Map();
    route(MANIFEST, reply(200, manifestText));
    routeEveryPage();
    route(FEED, reply(200, readScrapedDuckRaidsText()));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('the rotations in force', () => {
    it('reads the Palkia week’s bosses at 09:59 local, the shadow rotation beside', async () => {
      const { raidBosses, entries } = service();
      await raidBosses.load();
      expect((await raidBosses.sync()).status).toBe('updated');
      expect(tiers(raidBosses)).toEqual([
        'T1: Axew, Frigibax, Goomy, Jangmo-o',
        'Shadow T1: Gastly, Gible, Shieldon, Totodile',
        'T3: Alolan Muk, Alolan Ninetales, Alolan Raichu',
        'Shadow T3: Drapion, Kirlia, Primeape',
        'T5: Palkia',
        'Shadow T5: Landorus (Incarnate Forme)',
        'Mega: Mega Charizard X, Mega Charizard Y',
      ]);
      expect(requests).toEqual([
        { url: MANIFEST, headers: { Accept: 'application/json' } },
        {
          url: `${PAGES}palkia-mega-charizard-x-mega-charizard-y.html`,
          headers: { Accept: 'text/html' },
        },
        {
          url: `${PAGES}shadow-landorus-incarnate-october-november-2026.html`,
          headers: { Accept: 'text/html' },
        },
      ]);
      expect(sourceLines(entries)).toMatchObject([
        {
          msg: FROM_MANIFEST,
          level: 30,
          rotations: [
            'Palkia, Mega Charizard X, and Mega Charizard Y in Raids',
            'Shadow Landorus (Incarnate Forme) October–November 2026',
          ],
        },
      ]);
    });

    it('reads Halloween Part I’s costumed 1-star bosses from 10:00 local', async () => {
      now = at('2026-10-27T10:00');
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      const t1 = raidBosses.bossesOf({ level: 'T1', shadow: false }, ZONE);
      expect(t1.map((b) => [b.key, b.form, b.costumed])).toEqual([
        ['pikachu', 'PIKACHU_HALLOWEEN_2026', true],
        ['sinistea', 'SINISTEA_P_HALLOWEEN_2026_01', true],
      ]);
      expect(tiers(raidBosses)).toContain('T3: Alolan Muk, Alolan Ninetales, Alolan Raichu');
    });

    it('adds the Raid Day’s Super Mega raids to the Giratina week on 2026-10-31', async () => {
      now = at('2026-10-31T15:00');
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      expect(tiers(raidBosses)).toEqual([
        'T1: Pikachu, Sinistea',
        'Shadow T1: Gastly, Gible, Shieldon, Totodile',
        'T3: Cofagrigus, Dhelmise, Trevenant',
        'Shadow T3: Drapion, Kirlia, Primeape',
        'T5: Giratina (Origin Forme)',
        'Shadow T5: Landorus (Incarnate Forme)',
        'Mega: Mega Sableye',
        'Super Mega: Mega Chandelure',
      ]);
    });

    it('reads a page where Leek Duck’s site moved it', async () => {
      const slug = 'palkia-mega-charizard-x-mega-charizard-y';
      route(`${PAGES}${slug}.html`, reply(308, '', { location: `${PAGES}${slug}` }));
      route(`${PAGES}${slug}`, reply(200, readRotationFixture(slug)));
      const { raidBosses, entries } = service();
      await raidBosses.load();
      await raidBosses.sync();
      expect(sourceLines(entries)).toMatchObject([{ msg: FROM_MANIFEST }]);
      expect(requests.map((r) => r.url)).not.toContain(FEED);
    });

    it('goes nowhere a page leads off Leek Duck’s site', async () => {
      const slug = 'palkia-mega-charizard-x-mega-charizard-y';
      route(`${PAGES}${slug}.html`, reply(302, '', { location: 'http://mysql:3306/' }));
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      expect(requests.map((r) => r.url)).toContain(`${PAGES}${slug}.html`);
      expect(requests.map((r) => r.url)).not.toContain('http://mysql:3306/');
    });

    it('has no shadow bosses when no shadow rotation is in force', async () => {
      route(
        MANIFEST,
        reply(
          200,
          manifestWith((manifest) => {
            delete manifest['shadow_raids'];
          }),
        ),
      );
      const { raidBosses, entries } = service();
      await raidBosses.load();
      await raidBosses.sync();
      expect(raidBosses.bosses(ZONE).some((b) => b.tier.shadow)).toBe(false);
      expect(requests.map((r) => r.url)).not.toContain(FEED);
      expect(sourceLines(entries)).toMatchObject([{ msg: FROM_MANIFEST }]);
    });

    it('skips and counts a rotation with a bad slug, and never asks for its page', async () => {
      route(
        MANIFEST,
        reply(
          200,
          manifestWith((manifest) => {
            (manifest['shadow_raids']?.[0] as Record<string, unknown>)['slug'] = '../manifest';
          }),
        ),
      );
      const { raidBosses, entries } = service();
      await raidBosses.load();
      await raidBosses.sync();
      expect(raidBosses.bosses(ZONE).some((b) => b.tier.shadow)).toBe(false);
      expect(requests.map((r) => r.url)).toEqual([
        MANIFEST,
        `${PAGES}palkia-mega-charizard-x-mega-charizard-y.html`,
      ]);
      expect(entries.filter((e) => e['msg'] === 'raid boss feed entries were left out')).toEqual([
        expect.objectContaining({ skipped: 1 }),
      ]);
    });
  });

  describe('the fallback', () => {
    const dragons = 'T1: Axew, Frigibax, Goomy, Jangmo-o';

    it.each<[string, () => void, RegExp]>([
      ['the manifest is not there', () => route(MANIFEST, reply(404)), /manifest.*404/],
      [
        'the manifest is out of reach',
        () => route(MANIFEST, () => Promise.reject(new TypeError('fetch failed'))),
        /manifest.*fetch failed/,
      ],
      ['the manifest is no JSON', () => route(MANIFEST, reply(200, '<html>')), /manifest.*JSON/],
      [
        'the manifest is far too long',
        () => route(MANIFEST, reply(200, ' '.repeat(300_000))),
        /manifest.*sent more than \d+ bytes/,
      ],
      [
        'the document is no manifest',
        () => route(MANIFEST, reply(200, '{"raids": []}')),
        /regular_raids/,
      ],
      [
        'a page in force is not there',
        () => route(`${PAGES}halloween-2026-part-1-palkia.html`, reply(503)),
        /halloween-2026-part-1-palkia.*503/,
      ],
      [
        'the shadow rotation’s page is not there',
        () => route(`${PAGES}shadow-landorus-incarnate-october-november-2026.html`, reply(404)),
        /shadow-landorus.*404/,
      ],
      [
        'a page in force lists no boss',
        () => route(`${PAGES}halloween-2026-part-1-palkia.html`, reply(200, '<p>Soon</p>')),
        /halloween-2026-part-1-palkia lists no boss/,
      ],
      [
        'the pages’ bosses are none Pine can read',
        () => {
          // Every heading renamed: each boss is under a heading Pine has no tier for.
          for (const slug of [
            'halloween-2026-part-1-palkia',
            'shadow-landorus-incarnate-october-november-2026',
          ]) {
            const page = readRotationFixture(slug)
              .replaceAll('-Star Raids', '-Star Battles')
              .replaceAll('Mega Raids', 'Mega Battles');
            route(`${PAGES}${slug}.html`, reply(200, page));
          }
        },
        /lists no bosses/,
      ],
    ])('reads ScrapedDuck’s feed when %s', async (_case, arrange, reason) => {
      now = at('2026-10-27T10:00');
      arrange();
      const { raidBosses, entries } = service();
      await raidBosses.load();
      expect((await raidBosses.sync()).status).toBe('updated');
      expect(tiers(raidBosses)[0]).toBe(dragons);
      expect(requests.at(-1)).toEqual({ url: FEED, headers: { Accept: 'application/json' } });
      const lines = sourceLines(entries);
      expect(lines).toMatchObject([{ msg: FROM_FALLBACK, level: 30 }]);
      expect(String(lines[0]?.['reason'])).toMatch(reason);
    });

    it('reads ScrapedDuck’s feed when no regular rotation is in force (2026-11-06)', async () => {
      now = at('2026-11-06T12:00');
      const { raidBosses, entries } = service();
      await raidBosses.load();
      await raidBosses.sync();
      expect(tiers(raidBosses)[0]).toBe(dragons);
      // Neither Sendai's nor Mexico City's page is asked for.
      expect(requests.map((r) => r.url)).toEqual([MANIFEST, FEED]);
      expect(sourceLines(entries)).toMatchObject([
        {
          msg: FROM_FALLBACK,
          reason: "no regular rotation is in force (2 at a city's own times left out)",
        },
      ]);
    });

    it('fails as before when the fallback cannot be read either', async () => {
      route(MANIFEST, reply(404));
      route(FEED, reply(503));
      const { raidBosses } = service();
      await raidBosses.load();
      expect(await raidBosses.sync()).toMatchObject({
        status: 'failed',
        kind: 'status',
        httpStatus: 503,
      });
      expect(raidBosses.bosses(ZONE)).toEqual([]);
    });

    it('logs the source once each time it changes, not at every read', async () => {
      now = at('2026-10-27T10:00');
      const { raidBosses, entries } = service();
      await raidBosses.load();
      await raidBosses.sync();
      now += HOUR;
      await raidBosses.sync();
      route(MANIFEST, reply(404));
      now += HOUR;
      await raidBosses.sync();
      now += HOUR;
      await raidBosses.sync();
      route(MANIFEST, reply(200, manifestText));
      now += HOUR;
      await raidBosses.sync();
      expect(sourceLines(entries).map((e) => e['msg'])).toEqual([
        FROM_MANIFEST,
        FROM_FALLBACK,
        FROM_MANIFEST,
      ]);
    });

    it('asks the fallback with its validators only while its list is the one stored', async () => {
      route(MANIFEST, reply(503));
      route(FEED, reply(200, readScrapedDuckRaidsText(), { etag: '"sd-1"' }));
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      now += HOUR;
      await raidBosses.sync();
      expect(requests.at(-1)?.headers).toEqual({
        Accept: 'application/json',
        'If-None-Match': '"sd-1"',
      });

      route(MANIFEST, reply(200, manifestText));
      now += HOUR;
      await raidBosses.sync();
      route(MANIFEST, reply(404));
      route(FEED, reply(304));
      now += HOUR;
      const result = await raidBosses.sync();
      // Unconditional: a 304 must not vouch for the list the manifest gave.
      expect(requests.at(-1)).toEqual({ url: FEED, headers: { Accept: 'application/json' } });
      expect(result).toMatchObject({ status: 'failed', httpStatus: 304 });
    });

    it('asks nothing more of anyone once stopped in the middle of the manifest', async () => {
      let asked!: () => void;
      const manifestAsked = new Promise<void>((resolve) => {
        asked = resolve;
      });
      route(
        MANIFEST,
        ({ signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason as Error), { once: true });
            asked();
          }),
      );
      const { raidBosses } = service();
      await raidBosses.load();
      const syncing = raidBosses.sync();
      await manifestAsked;
      raidBosses.stop();
      expect(await syncing).toEqual({ status: 'failed', kind: 'stopped', reason: 'stopped' });
      expect(requests.map((r) => r.url)).toEqual([MANIFEST]);
    });
  });

  describe('between rotations and through outages', () => {
    it('keeps Halloween Part I’s list after its end, until the Giratina week', async () => {
      now = at('2026-10-27T10:00');
      const { raidBosses, entries, changes } = service();
      await raidBosses.load();
      await raidBosses.sync();
      for (const time of ['2026-10-27T20:00:05', '2026-10-27T22:00']) {
        now = at(time);
        expect((await raidBosses.sync()).status, time).toBe('unchanged');
        expect(tiers(raidBosses)[0], time).toBe('T1: Pikachu, Sinistea');
      }
      expect(changes).toEqual([]);
      expect(requests.map((r) => r.url)).not.toContain(FEED);
      expect(requests.map((r) => r.url)).toContain(`${PAGES}halloween-2026-part-1-palkia.html`);
      expect(sourceLines(entries).map((e) => e['msg'])).toEqual([FROM_MANIFEST]);
    });

    it('keeps the manifest’s list through a page out of reach, retrying at retryMs', async () => {
      vi.useFakeTimers({ now: at('2026-10-27T09:58') });
      const { raidBosses, changes, entries } = service({ retryMs: 10 * MINUTE });
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      expect(tiers(raidBosses)[0]).toBe('T1: Axew, Frigibax, Goomy, Jangmo-o');
      const halloween = `${PAGES}halloween-2026-part-1-palkia.html`;
      route(halloween, reply(503));

      await vi.advanceTimersByTimeAsync(2 * MINUTE + AFTER_CHANGE_MS);
      expect(requests.slice(3).map((r) => r.url)).toEqual([MANIFEST, halloween]);
      expect(tiers(raidBosses)[0]).toBe('T1: Axew, Frigibax, Goomy, Jangmo-o');
      expect(changes).toEqual([]);
      expect(sourceLines(entries).map((e) => e['msg'])).toEqual([FROM_MANIFEST]);

      await vi.advanceTimersByTimeAsync(10 * MINUTE - 1);
      expect(requests).toHaveLength(5);
      route(halloween, reply(200, readRotationFixture('halloween-2026-part-1-palkia')));
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(8);
      expect(tiers(raidBosses)[0]).toBe('T1: Pikachu, Sinistea');
      expect(changes).toHaveLength(1);
      raidBosses.stop();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('falls back once the quick retries are spent', async () => {
      now = at('2026-10-27T10:00');
      const { raidBosses, entries } = service();
      await raidBosses.load();
      await raidBosses.sync();
      route(MANIFEST, () => Promise.reject(new TypeError('fetch failed')));
      for (let attempt = 1; attempt <= 3; attempt++) {
        now += 5 * MINUTE;
        expect(await raidBosses.sync(), `attempt ${attempt}`).toMatchObject({
          status: 'failed',
          kind: 'unreachable',
        });
        expect(tiers(raidBosses)[0]).toBe('T1: Pikachu, Sinistea');
      }
      now += 5 * MINUTE;
      expect((await raidBosses.sync()).status).toBe('updated');
      expect(tiers(raidBosses)[0]).toBe('T1: Axew, Frigibax, Goomy, Jangmo-o');
      expect(sourceLines(entries)).toMatchObject([
        { msg: FROM_MANIFEST },
        { msg: FROM_FALLBACK, reason: expect.stringMatching(/manifest.*fetch failed/) as unknown },
      ]);
    });
  });

  describe('restarts, syncs of its own and slow reads', () => {
    it('reads at once after a restart, so a rotation changing soon is not missed', async () => {
      vi.useFakeTimers({ now: at('2026-10-27T09:50') });
      const first = service({});
      await first.raidBosses.load();
      await first.raidBosses.sync();
      vi.setSystemTime(at('2026-10-27T09:55'));
      const { raidBosses } = service({});
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      expect(requests).toHaveLength(6);
      await vi.advanceTimersByTimeAsync(5 * MINUTE + AFTER_CHANGE_MS);
      expect(requests).toHaveLength(9);
      expect(tiers(raidBosses)[0]).toBe('T1: Pikachu, Sinistea');
      raidBosses.stop();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('moves the timer up when a sync of its own learns an earlier change', async () => {
      vi.useFakeTimers({ now: at('2026-10-27T08:00') });
      route(MANIFEST, reply(404));
      const { raidBosses } = service({ refreshMs: 3 * HOUR });
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      expect(requests.map((r) => r.url)).toEqual([MANIFEST, FEED]);

      // As /operator boss sync would, half an hour later, with the manifest back.
      await vi.advanceTimersByTimeAsync(30 * MINUTE);
      route(MANIFEST, reply(200, manifestText));
      await raidBosses.sync();
      expect(requests).toHaveLength(5);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(90 * MINUTE + AFTER_CHANGE_MS - 1);
      expect(requests).toHaveLength(5);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(8);
      expect(tiers(raidBosses)[0]).toBe('T1: Pikachu, Sinistea');
      raidBosses.stop();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('reads once more at once when the change passed during a slow read', async () => {
      vi.useFakeTimers({ now: at('2026-10-27T09:59:59') });
      let release!: () => void;
      let held = true;
      route(MANIFEST, () => {
        if (!held) return Promise.resolve(reply(200, manifestText));
        held = false;
        return new Promise((resolve) => {
          release = () => resolve(reply(200, manifestText));
        });
      });
      const { raidBosses } = service({});
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      expect(requests).toHaveLength(1);
      vi.setSystemTime(at('2026-10-27T10:00:10'));
      release();
      await raidBosses.whenIdle();
      expect(tiers(raidBosses)[0]).toBe('T1: Axew, Frigibax, Goomy, Jangmo-o');
      expect(vi.getTimerCount()).toBe(1);

      await vi.advanceTimersByTimeAsync(0);
      expect(requests).toHaveLength(6);
      expect(tiers(raidBosses)[0]).toBe('T1: Pikachu, Sinistea');
      // One read, not more: the next change is the Giratina week, beyond the refresh.
      await vi.advanceTimersByTimeAsync(HOUR - 1);
      expect(requests).toHaveLength(6);
      expect(vi.getTimerCount()).toBe(1);
      raidBosses.stop();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('in each zone in use (plan 19A-2)', () => {
    const BERLIN = 'Europe/Berlin';
    const zones = () => [ZONE, BERLIN];
    const halloweenOne = 'T1: Pikachu, Sinistea';
    const palkiaOne = 'T1: Axew, Frigibax, Goomy, Jangmo-o';

    it('gives each zone the rotations in force on its own clock, each page read once', async () => {
      // 10:00 in Berlin, 05:00 in New York.
      now = zonedAt('2026-10-27T10:00', BERLIN);
      const { raidBosses } = service({ now: () => now, zones });
      await raidBosses.load();
      await raidBosses.sync();
      expect(tiers(raidBosses, BERLIN)[0]).toBe(halloweenOne);
      expect(tiers(raidBosses, ZONE)[0]).toBe(palkiaOne);
      // The list stored, and that of a zone no read covered, is the instance's default zone's.
      expect(tiers(raidBosses)[0]).toBe(palkiaOne);
      expect(tiers(raidBosses, 'Asia/Tokyo')[0]).toBe(palkiaOne);
      expect(requests.map((request) => request.url)).toEqual([
        MANIFEST,
        `${PAGES}palkia-mega-charizard-x-mega-charizard-y.html`,
        `${PAGES}shadow-landorus-incarnate-october-november-2026.html`,
        `${PAGES}halloween-2026-part-1-palkia.html`,
      ]);
    });

    it('tells each zone of its own change, once, when its rotation turns', async () => {
      now = zonedAt('2026-10-27T09:59', BERLIN);
      const { raidBosses, changes } = service({ now: () => now, zones });
      await raidBosses.load();
      await raidBosses.sync();
      now = zonedAt('2026-10-27T10:00', BERLIN);
      await raidBosses.sync();
      expect(changes.map((change) => change.zone)).toEqual([BERLIN]);
      now = at('2026-10-27T10:00');
      await raidBosses.sync();
      expect(changes.map((change) => change.zone)).toEqual([BERLIN, ZONE]);
      expect(tiers(raidBosses, ZONE)[0]).toBe(halloweenOne);
    });

    it('reads again when the zones in use change, for a zone new to them', async () => {
      vi.useFakeTimers({ now: zonedAt('2026-10-27T10:00', BERLIN) });
      let inUse = [ZONE];
      const { raidBosses } = service({ zones: () => inUse });
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      expect(tiers(raidBosses, BERLIN)[0]).toBe(palkiaOne);
      inUse = [ZONE, BERLIN];
      raidBosses.zonesChanged();
      await raidBosses.whenIdle();
      expect(tiers(raidBosses, BERLIN)[0]).toBe(halloweenOne);
      raidBosses.stop();
    });

    it('tells no zone but the default’s of a change after a start, its list before unknown (fix round 1, L1)', async () => {
      // The default zone's list stored by a run before, at 09:59 in Berlin.
      now = zonedAt('2026-10-27T09:59', BERLIN);
      const before = service({ now: () => now, zones });
      await before.raidBosses.load();
      await before.raidBosses.sync();
      // A start at 10:00 in Berlin: what Berlin had before it is not known.
      now = zonedAt('2026-10-27T10:00', BERLIN);
      const { raidBosses, changes } = service({ now: () => now, zones });
      await raidBosses.load();
      await raidBosses.sync();
      expect(tiers(raidBosses, BERLIN)[0]).toBe(halloweenOne);
      expect(changes).toEqual([]);
      // From the first read on, Berlin's list before is known: its next change is told (Giratina
      // at 06:00 there), with New York's (Halloween since 10:00 there).
      now = zonedAt('2026-10-28T06:00', BERLIN);
      await raidBosses.sync();
      expect(changes.map((change) => change.zone)).toEqual([ZONE, BERLIN]);
    });

    it('keeps the default’s list when a page only another zone needs fails, and reads soon again (fix round 1, L2)', async () => {
      vi.useFakeTimers({ now: zonedAt('2026-10-27T10:00', BERLIN) });
      routes.delete(`${PAGES}halloween-2026-part-1-palkia.html`);
      const { raidBosses, entries } = service({ zones });
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      // The default zone's list from the manifest; Berlin has the default's.
      expect(sourceLines(entries).map((entry) => entry['msg'])).toEqual([FROM_MANIFEST]);
      expect(tiers(raidBosses, ZONE)[0]).toBe(palkiaOne);
      expect(tiers(raidBosses, BERLIN)[0]).toBe(palkiaOne);
      expect(entries).toContainEqual(
        expect.objectContaining({
          level: 40,
          zone: BERLIN,
          msg: "a zone's raid boss list could not be read",
        }),
      );
      // Read again at the feed's own retry (fix round 2, P5: `retryMs`, 5 minutes here), not at
      // the next change of rotation hours away.
      routeEveryPage();
      const asked = requests.length;
      await vi.advanceTimersByTimeAsync(5 * MINUTE - 1);
      expect(requests).toHaveLength(asked);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests.length).toBeGreaterThan(asked);
      expect(tiers(raidBosses, BERLIN)[0]).toBe(halloweenOne);
      raidBosses.stop();
    });

    it('keeps a zone’s own list through a page of its own failing once, telling no change (fix round 2, P2)', async () => {
      now = zonedAt('2026-10-27T10:00', BERLIN);
      const { raidBosses, changes, entries } = service({ now: () => now, zones });
      await raidBosses.load();
      await raidBosses.sync();
      expect(tiers(raidBosses, BERLIN)[0]).toBe(halloweenOne);
      // Halloween Part I's page, which only Berlin needs, fails once.
      const halloween = `${PAGES}halloween-2026-part-1-palkia.html`;
      routes.delete(halloween);
      now = zonedAt('2026-10-27T10:30', BERLIN);
      await raidBosses.sync();
      expect(entries).toContainEqual(
        expect.objectContaining({ zone: BERLIN, msg: "a zone's raid boss list could not be read" }),
      );
      expect(tiers(raidBosses, BERLIN)[0]).toBe(halloweenOne);
      expect(tiers(raidBosses, ZONE)[0]).toBe(palkiaOne);
      expect(changes).toEqual([]);
      // The retry that reads it tells nothing either: Berlin's list never changed.
      route(halloween, reply(200, readRotationFixture('halloween-2026-part-1-palkia')));
      now = zonedAt('2026-10-27T10:35', BERLIN);
      await raidBosses.sync();
      expect(tiers(raidBosses, BERLIN)[0]).toBe(halloweenOne);
      expect(changes).toEqual([]);
    });

    it('retries another zone’s failing page at retryMs three times, then at the refresh (fix round 2, P5)', async () => {
      vi.useFakeTimers({ now: zonedAt('2026-10-27T10:00', BERLIN) });
      routes.delete(`${PAGES}halloween-2026-part-1-palkia.html`);
      const { raidBosses } = service({ now: () => Date.now(), zones, retryMs: 10 * MINUTE });
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      // Each read asks the manifest and three pages, Berlin's failing.
      expect(requests).toHaveLength(4);
      for (const failure of [2, 3, 4]) {
        await vi.advanceTimersByTimeAsync(10 * MINUTE - 1);
        expect(requests, `before failure ${failure}`).toHaveLength(4 * (failure - 1));
        await vi.advanceTimersByTimeAsync(1);
        expect(requests, `failure ${failure}`).toHaveLength(4 * failure);
      }
      // The fourth failure in a row waits the refresh, as the feed's own failures do.
      await vi.advanceTimersByTimeAsync(HOUR - 1);
      expect(requests).toHaveLength(16);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(20);
      raidBosses.stop();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('lets the feed’s own backoff decide while its reads fail, another zone’s page unread before (fix round 3, Q1)', async () => {
      vi.useFakeTimers({ now: zonedAt('2026-10-27T10:00', BERLIN) });
      routes.delete(`${PAGES}halloween-2026-part-1-palkia.html`);
      const { raidBosses } = service({ now: () => Date.now(), zones, retryMs: 10 * MINUTE });
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      // One read: the manifest and three pages, Berlin's failing.
      expect(requests).toHaveLength(4);
      // Then the manifest and its fallback fail: each read asks both.
      route(MANIFEST, reply(404));
      route(FEED, reply(503));
      for (const failure of [1, 2, 3, 4]) {
        await vi.advanceTimersByTimeAsync(10 * MINUTE - 1);
        expect(requests, `before failure ${failure}`).toHaveLength(4 + 2 * (failure - 1));
        await vi.advanceTimersByTimeAsync(1);
        expect(requests, `failure ${failure}`).toHaveLength(4 + 2 * failure);
      }
      // The fifth failure waits the refresh: Berlin's page unread before does not hasten it.
      await vi.advanceTimersByTimeAsync(HOUR - 1);
      expect(requests).toHaveLength(12);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(14);
      raidBosses.stop();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps the list a zone without one of its own had when its page fails at another zone’s edge (fix round 3, Q2)', async () => {
      const CHICAGO = 'America/Chicago';
      // 09:59 in New York, 08:59 in Chicago: the Palkia week in both, Chicago without a list of
      // its own.
      now = at('2026-10-27T09:59');
      const { raidBosses, changes } = service({ now: () => now, zones: () => [ZONE, CHICAGO] });
      await raidBosses.load();
      await raidBosses.sync();
      expect(tiers(raidBosses, CHICAGO)[0]).toBe(palkiaOne);
      // New York's 10:00 edge: Halloween Part I there, while the Palkia week's page, which only
      // Chicago needs now, fails.
      const palkia = `${PAGES}palkia-mega-charizard-x-mega-charizard-y.html`;
      routes.delete(palkia);
      now = at('2026-10-27T10:00:05');
      await raidBosses.sync();
      expect(tiers(raidBosses, ZONE)[0]).toBe(halloweenOne);
      expect(tiers(raidBosses, CHICAGO)[0]).toBe(palkiaOne);
      expect(changes.map((change) => change.zone)).toEqual([ZONE]);
      // The retry that reads it tells Chicago nothing: its list never changed.
      route(palkia, reply(200, readRotationFixture('palkia-mega-charizard-x-mega-charizard-y')));
      now = at('2026-10-27T10:05');
      await raidBosses.sync();
      expect(tiers(raidBosses, CHICAGO)[0]).toBe(palkiaOne);
      expect(changes.map((change) => change.zone)).toEqual([ZONE]);
    });

    it('keeps a zone’s list when its document does not parse, and reads soon again (fix round 3, Q3)', async () => {
      vi.useFakeTimers({ now: zonedAt('2026-10-27T10:00', BERLIN) });
      const { raidBosses, changes, entries } = service({ zones, retryMs: 10 * MINUTE });
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      expect(tiers(raidBosses, BERLIN)[0]).toBe(halloweenOne);
      // Halloween Part I's page, which only Berlin needs, lists more bosses under one heading than
      // a feed may: Berlin's document is read, but does not parse.
      const halloween = `${PAGES}halloween-2026-part-1-palkia.html`;
      const card = '<div class="card"><p class="name">Pikachu</p></div>';
      const page = readRotationFixture('halloween-2026-part-1-palkia');
      route(
        halloween,
        reply(200, page.replace('<div class="card">', `${card.repeat(201)}<div class="card">`)),
      );
      await raidBosses.sync();
      expect(entries).toContainEqual(
        expect.objectContaining({ zone: BERLIN, msg: "a zone's raid boss list could not be read" }),
      );
      expect(tiers(raidBosses, BERLIN)[0]).toBe(halloweenOne);
      expect(tiers(raidBosses, ZONE)[0]).toBe(palkiaOne);
      expect(changes).toEqual([]);
      // Read again at the feed's retry, not at the refresh.
      route(halloween, reply(200, page));
      const asked = requests.length;
      await vi.advanceTimersByTimeAsync(10 * MINUTE - 1);
      expect(requests).toHaveLength(asked);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests.length).toBeGreaterThan(asked);
      expect(tiers(raidBosses, BERLIN)[0]).toBe(halloweenOne);
      expect(changes).toEqual([]);
      raidBosses.stop();
    });

    it('reads once more after a sync in flight when the zones in use change meanwhile (fix round 1, L3)', async () => {
      vi.useFakeTimers({ now: zonedAt('2026-10-27T10:00', BERLIN) });
      let inUse = [ZONE];
      const { raidBosses } = service({ zones: () => inUse });
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      // A read held at the manifest when Berlin comes into use.
      let release: () => void = () => undefined;
      route(
        MANIFEST,
        () =>
          new Promise((resolve) => {
            release = () => {
              resolve(reply(200, manifestText));
            };
          }),
      );
      const held = raidBosses.sync();
      inUse = [ZONE, BERLIN];
      raidBosses.zonesChanged();
      route(MANIFEST, reply(200, manifestText));
      release();
      await held;
      await raidBosses.whenIdle();
      expect(tiers(raidBosses, BERLIN)[0]).toBe(halloweenOne);
      raidBosses.stop();
    });

    it('keeps a boss only one zone lists first seen when that zone first listed it (fix round 1, L5)', async () => {
      now = zonedAt('2026-10-27T10:00', BERLIN);
      const first = now;
      const { raidBosses } = service({ now: () => now, zones });
      await raidBosses.load();
      await raidBosses.sync();
      now = zonedAt('2026-10-27T10:30', BERLIN);
      await raidBosses.sync();
      const pikachu = raidBosses.feedBosses(BERLIN).find((boss) => boss.pokemonId === 'PIKACHU');
      expect(pikachu?.firstSeen).toBe(first);
      expect(pikachu?.lastSeen).toBe(now);
    });

    it('gives each spelling of a zone in use its own list and announcement (fix round 2, P1)', async () => {
      const CHICAGO = 'America/Chicago';
      const IN_CHICAGO = '412345678901234599';
      const CHANGED = '412345678901234588';
      const servers = new TestServers();
      servers.changed.set(
        IN_CHICAGO,
        testServerValues({ timezone: CHICAGO, channels: { 'bot-updates': '700000000000000003' } }),
      );
      servers.changed.set(
        CHANGED,
        testServerValues({ timezone: BERLIN, channels: { 'bot-updates': '700000000000000004' } }),
      );
      servers.present = [IN_CHICAGO, CHANGED];
      // The second server's staff change Berlin for another name of Chicago's zone.
      await servers.set(CHANGED, (values) => ({ ...values, timezone: 'US/Central' }), {
        id: '123456789012345678',
      });
      const gateway = new FakePartyGateway();
      gateway.addChannel('700000000000000003', 'bot-updates', { guildId: IN_CHICAGO });
      gateway.addChannel('700000000000000004', 'bot-updates', { guildId: CHANGED });
      const base = loadSettings(TEST_SETTINGS_PATH);
      const announcer = new RaidBossAnnouncer({
        gateway,
        serverIds: () => [IN_CHICAGO, CHANGED],
        servers,
        settings: { raidBosses: { ...base.raidBosses, announceChanges: true } },
        log: createTestLogger().log,
      });
      // 09:59 in Chicago, 10:59 in New York: Halloween Part I is on in New York only.
      now = zonedAt('2026-10-27T09:59', CHICAGO);
      const { raidBosses, changes } = service({
        now: () => now,
        zones: () => servers.zonesInUse(),
      });
      announcer.attach(raidBosses);
      announcer.ready();
      await raidBosses.load();
      await raidBosses.sync();
      expect(tiers(raidBosses, 'US/Central')[0]).toBe(palkiaOne);
      now = zonedAt('2026-10-27T10:00', CHICAGO);
      await raidBosses.sync();
      await announcer.flush();
      expect(changes.map((change) => change.zone).sort()).toEqual([CHICAGO, 'US/Central']);
      expect(tiers(raidBosses, 'US/Central')[0]).toBe(halloweenOne);
      const sentTo = (channelId: string) =>
        gateway.messages.filter((message) => message.channelId === channelId);
      expect(sentTo('700000000000000003')).toHaveLength(1);
      expect(sentTo('700000000000000004')).toHaveLength(1);
    });

    it('takes the same rotations in force in any order for the same (fix round 1, L4)', () => {
      const palkia = {
        slug: 'palkia',
        title: 'Palkia',
        kind: 'regular',
        start: 1,
        end: 2,
      } as const;
      const shadow = { slug: 'shadow', title: 'Shadow', kind: 'shadow', start: 1, end: 2 } as const;
      expect(sameRotations([palkia, shadow], [shadow, palkia])).toBe(true);
      expect(sameRotations([palkia], [palkia, shadow])).toBe(false);
    });

    it('reads again just after the soonest change of rotation across the zones', async () => {
      vi.useFakeTimers({ now: zonedAt('2026-10-27T09:58', BERLIN) });
      const { raidBosses } = service({ zones });
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      const asked = requests.length;
      await vi.advanceTimersByTimeAsync(2 * MINUTE + AFTER_CHANGE_MS);
      expect(requests.length).toBeGreaterThan(asked);
      expect(tiers(raidBosses, BERLIN)[0]).toBe(halloweenOne);
      raidBosses.stop();
    });
  });

  describe('reading again at the next change of rotation', () => {
    it('reads the list again just after the rotation turns, then every refresh', async () => {
      vi.useFakeTimers({ now: at('2026-10-27T09:58') });
      const { raidBosses, changes } = service({});
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      expect(requests).toHaveLength(3);
      expect(tiers(raidBosses)[0]).toBe('T1: Axew, Frigibax, Goomy, Jangmo-o');
      expect(vi.getTimerCount()).toBe(1);

      await vi.advanceTimersByTimeAsync(2 * MINUTE + AFTER_CHANGE_MS - 1);
      expect(requests).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(6);
      expect(tiers(raidBosses)[0]).toBe('T1: Pikachu, Sinistea');
      expect(changes).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(1);

      // The next change (the Giratina week, 06:00 tomorrow) is beyond the refresh, which decides.
      await vi.advanceTimersByTimeAsync(HOUR - 1);
      expect(requests).toHaveLength(6);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(9);
      raidBosses.stop();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps the next change of a readable manifest when it fell back', async () => {
      vi.useFakeTimers({ now: at('2026-10-27T09:58') });
      route(`${PAGES}palkia-mega-charizard-x-mega-charizard-y.html`, reply(503));
      const { raidBosses } = service({});
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      expect(requests.at(-1)?.url).toBe(FEED);
      const asked = requests.length;
      await vi.advanceTimersByTimeAsync(2 * MINUTE + AFTER_CHANGE_MS);
      expect(requests.slice(asked).map((r) => r.url)).toEqual([
        MANIFEST,
        `${PAGES}halloween-2026-part-1-palkia.html`,
        `${PAGES}shadow-landorus-incarnate-october-november-2026.html`,
      ]);
      expect(tiers(raidBosses)[0]).toBe('T1: Pikachu, Sinistea');
      raidBosses.stop();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
