import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeTimeoutSignals, watchBackground } from '../../test/support/timers.js';
import { catalogueFixture, gameDataFixture } from '../../test/support/game-data.js';
import { MemoryRaidBossStore, readRaidBossFeed } from '../../test/support/raid-bosses.js';
import { textAnswer } from '../../test/support/responses.js';
import { Tally } from '../../test/support/tally.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import type { NewBossOverride } from '../domain/pogo/raid-bosses.js';
import type { RaidTier } from '../domain/pogo/raid-tier.js';
import {
  RaidBossService,
  type FeedChange,
  type FetchFeed,
  type StaleFeed,
} from './raid-boss-service.js';

/** The zone of the test settings, every server's here. */
const ZONE = 'America/New_York';
const URL = 'https://example.test/raids.min.json';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const T3: RaidTier = { level: 'T3', shadow: false };
const T5: RaidTier = { level: 'T5', shadow: false };

type Response = Awaited<ReturnType<FetchFeed>>;

function reply(status: number, body = '', headers: Record<string, string> = {}): Response {
  return textAnswer(status, body, headers);
}

const HEADINGS: Record<string, string> = {
  lvl1: '1-Star Raids',
  lvl3: '3-Star Raids',
  lvl5: '5-Star Raids',
};

/** A feed with these bosses, each `[heading, id]`; `lvl1`, `lvl3` and `lvl5` stand for the headings. */
function feedOf(...bosses: [string, string][]): string {
  return JSON.stringify(
    bosses.map(([level, id]) => ({
      name: id.charAt(0) + id.slice(1).toLowerCase(),
      tier: HEADINGS[level] ?? level,
      canBeShiny: false,
    })),
  );
}

const downloaded = JSON.stringify(readRaidBossFeed());

function override(extra: Partial<NewBossOverride> = {}): NewBossOverride {
  return {
    action: 'add',
    pokemonId: 'ZEKROM',
    form: null,
    tier: T5,
    shiny: null,
    expiresAt: null,
    createdBy: '123456789012345678',
    ...extra,
  };
}

describe('RaidBossService', () => {
  let now: number;
  let store: MemoryRaidBossStore;
  let requests: { url: string; headers: Record<string, string> }[];
  let respond: FetchFeed;

  function service(
    extra: {
      timeoutMs?: number;
      staleAfterMs?: number;
      retryMs?: number;
      gameData?: { catalogue: PokemonCatalogue };
    } = {},
  ) {
    const { log, entries } = createTestLogger();
    const changes: FeedChange[] = [];
    const stale: StaleFeed[] = [];
    const raidBosses = new RaidBossService({
      url: URL,
      refreshMs: HOUR,
      staleAfterMs: 48 * HOUR,
      store,
      gameData: { catalogue: catalogueFixture() },
      fetch: (url, init) => {
        requests.push({ url, headers: init.headers });
        return respond(url, init);
      },
      log,
      now: () => now,
      ...extra,
    });
    raidBosses.onChange((change) => {
      changes.push(change);
    });
    raidBosses.onStale((event) => {
      stale.push(event);
    });
    return { raidBosses, entries, changes, stale };
  }

  describe('the download', () => {
    it('leaves where a redirect goes to fetchOnItsHost', async () => {
      const redirects: unknown[] = [];
      respond = (_url, init) => {
        redirects.push(init.redirect);
        return Promise.resolve(reply(200, downloaded));
      };
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      expect(redirects).toEqual(['manual']);
    });
  });

  describe('the list in effect, the very same until it changes', () => {
    it('gives one list, a new one after a read, an override added or one run out', async () => {
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'YVELTAL'], ['lvl3', 'STARMIE'])));
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      const first = raidBosses.bosses(ZONE);
      now += HOUR;
      expect(raidBosses.bosses(ZONE)).toBe(first);

      const lasting = HOUR;
      await raidBosses.addOverride(
        override({ action: 'add', pokemonId: 'ZEKROM', expiresAt: now + lasting }),
      );
      const withZekrom = raidBosses.bosses(ZONE);
      expect(withZekrom).not.toBe(first);
      expect(withZekrom.some((boss) => boss.pokemonId === 'ZEKROM')).toBe(true);
      expect(raidBosses.bosses(ZONE)).toBe(withZekrom);

      now += lasting - 1;
      expect(raidBosses.bosses(ZONE)).toBe(withZekrom);
      now += 1;
      const after = raidBosses.bosses(ZONE);
      expect(after).not.toBe(withZekrom);
      expect(after.some((boss) => boss.pokemonId === 'ZEKROM')).toBe(false);

      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'YVELTAL'])));
      now += HOUR;
      await raidBosses.sync();
      expect(raidBosses.bosses(ZONE)).not.toBe(after);
      expect(raidBosses.bosses(ZONE).some((boss) => boss.pokemonId === 'STARMIE')).toBe(false);
    });
  });

  beforeEach(() => {
    now = Date.UTC(2026, 9, 10, 12);
    store = new MemoryRaidBossStore();
    requests = [];
    respond = () => Promise.resolve(reply(200, downloaded));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('loading', () => {
    it('has no list before it is loaded', () => {
      const { raidBosses } = service();
      expect(() => raidBosses.bosses(ZONE)).toThrow(/not been loaded/);
      expect(() => raidBosses.autoset(T5, ZONE)).toThrow(/not been loaded/);
    });

    it('loads an empty list from a new database without downloading', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      expect(raidBosses.bosses(ZONE)).toEqual([]);
      expect(raidBosses.lastSyncedAt).toBeUndefined();
      expect(requests).toEqual([]);
    });

    it('starts with the list and overrides of the last run', async () => {
      const first = service().raidBosses;
      await first.load();
      await first.sync();
      await first.addOverride(override());
      now += 10 * MINUTE;

      const { raidBosses } = service();
      await raidBosses.load();
      expect(raidBosses.bosses(ZONE)).toHaveLength(15);
      expect(raidBosses.bossesOf(T5, ZONE).map((b) => b.key)).toEqual(['yveltal', 'zekrom']);
      expect(raidBosses.lastSyncedAt).toBe(now - 10 * MINUTE);
      expect(requests).toHaveLength(1);
    });

    it('refuses to sync or start before it is loaded', () => {
      const { raidBosses } = service();
      expect(() => raidBosses.sync()).toThrow('The raid boss list has not been loaded yet');
      expect(() => raidBosses.startAutoSync()).toThrow(
        'The raid boss list has not been loaded yet',
      );
      expect(requests).toEqual([]);
    });

    it('rejects when the database cannot be read', async () => {
      store.failing = new Error('connection lost');
      await expect(service().raidBosses.load()).rejects.toThrow('connection lost');
    });
  });

  describe('syncing', () => {
    it('stores the feed and serves it against the catalogue', async () => {
      const { raidBosses, entries } = service();
      await raidBosses.load();
      const result = await raidBosses.sync();
      expect(result.status).toBe('updated');
      expect(raidBosses.lastSyncedAt).toBe(now);
      expect(raidBosses.bosses(ZONE)).toHaveLength(14);
      expect(raidBosses.bossesOf(T5, ZONE)).toMatchObject([
        { key: 'yveltal', name: 'Yveltal', shiny: true, source: 'feed' },
      ]);
      expect(raidBosses.autoset(T5, ZONE)?.key).toBe('yveltal');
      expect(raidBosses.autoset(T3, ZONE)).toBeUndefined();
      expect(await store.listActive()).toHaveLength(14);
      expect(requests).toEqual([{ url: URL, headers: { Accept: 'application/json' } }]);
      expect(entries.some((e) => e['msg'] === 'raid bosses updated')).toBe(true);
    });

    it('warns how many entries of the feed were left out, when that number changes', async () => {
      respond = () =>
        Promise.resolve(
          reply(
            200,
            JSON.stringify([
              { name: 'Zekrom', tier: '5-Star Raids', canBeShiny: false },
              { name: 'Mew', tier: 'New Raids', canBeShiny: false },
              { name: '1234', tier: '5-Star Raids', canBeShiny: false },
            ]),
          ),
        );
      const { raidBosses, entries } = service();
      await raidBosses.load();
      await raidBosses.sync();
      const left = () => entries.filter((e) => e['msg'] === 'raid boss feed entries were left out');
      expect(left()).toMatchObject([{ skipped: 2 }]);

      // The same feed again changes nothing and is not reported again.
      now += HOUR;
      await raidBosses.sync();
      expect(left()).toHaveLength(1);

      // The same list with one more entry left out: reported although no boss changed.
      respond = () =>
        Promise.resolve(
          reply(
            200,
            JSON.stringify([
              { name: 'Zekrom', tier: '5-Star Raids', canBeShiny: false },
              { name: 'Mew', tier: 'New Raids', canBeShiny: false },
              { name: 'Celebi', tier: 'New Raids', canBeShiny: false },
              { name: '1234', tier: '5-Star Raids', canBeShiny: false },
            ]),
          ),
        );
      now += HOUR;
      expect(await raidBosses.sync()).toMatchObject({ status: 'unchanged' });
      expect(left()).toMatchObject([{ skipped: 2 }, { skipped: 3 }]);

      store = new MemoryRaidBossStore();
      respond = () => Promise.resolve(reply(200, downloaded));
      const clean = service();
      await clean.raidBosses.load();
      await clean.raidBosses.sync();
      expect(
        clean.entries.filter((e) => e['msg'] === 'raid boss feed entries were left out'),
      ).toEqual([]);
    });

    it('reports what the feed added and dropped', async () => {
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'], ['lvl3', 'STARMIE'])));
      const { raidBosses, changes } = service();
      await raidBosses.load();
      await raidBosses.sync();
      now += HOUR;
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'YVELTAL'], ['lvl3', 'STARMIE'])));
      const result = await raidBosses.sync();
      expect(result).toMatchObject({
        status: 'updated',
        change: { added: [{ pokemonId: 'YVELTAL' }], removed: [{ pokemonId: 'ZEKROM' }] },
      });
      expect(changes).toHaveLength(1);
      expect(changes[0]?.added.map((b) => b.name)).toEqual(['Yveltal']);
      expect(changes[0]?.removed.map((b) => b.name)).toEqual(['Zekrom']);
      expect(raidBosses.bossesOf(T5, ZONE).map((b) => b.key)).toEqual(['yveltal']);
    });

    it('says what members see change, with the overrides in force', async () => {
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'YVELTAL'], ['lvl3', 'STARMIE'])));
      const { raidBosses, changes } = service();
      await raidBosses.load();
      await raidBosses.sync();
      await raidBosses.addOverride(override({ action: 'hide', pokemonId: 'ZEKROM' }));
      await raidBosses.addOverride(override({ action: 'add', pokemonId: 'YVELTAL' }));
      now += HOUR;
      respond = () =>
        Promise.resolve(
          reply(200, feedOf(['lvl5', 'ZEKROM'], ['lvl3', 'STARMIE'], ['lvl3', 'UMBREON'])),
        );
      const result = await raidBosses.sync();
      // The feed dropped Yveltal and listed Zekrom; members still see Yveltal and never Zekrom.
      expect(result).toMatchObject({
        status: 'updated',
        change: {
          added: [{ pokemonId: 'ZEKROM' }, { pokemonId: 'UMBREON' }],
          removed: [{ pokemonId: 'YVELTAL' }],
        },
      });
      const seen = result.status === 'updated' ? result.change.seen : undefined;
      expect(seen?.added.map((boss) => boss.key)).toEqual(['umbreon']);
      expect(seen?.removed).toEqual([]);
      expect(changes[0]?.seen.added.map((boss) => boss.key)).toEqual(['umbreon']);
    });

    it('does not announce the first list of a new database', async () => {
      const { raidBosses, changes } = service();
      await raidBosses.load();
      expect((await raidBosses.sync()).status).toBe('updated');
      expect(changes).toEqual([]);
    });

    it('announces a change found by the first sync after a restart', async () => {
      const first = service().raidBosses;
      await first.load();
      await first.sync();
      now += HOUR;
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'])));
      const { raidBosses, changes } = service();
      await raidBosses.load();
      await raidBosses.sync();
      expect(changes).toHaveLength(1);
      expect(changes[0]?.added.map((b) => b.pokemonId)).toEqual(['ZEKROM']);
      expect(changes[0]?.removed).toHaveLength(14);
    });

    it('says nothing changed when the feed lists the same bosses', async () => {
      const { raidBosses, changes } = service();
      await raidBosses.load();
      await raidBosses.sync();
      now += HOUR;
      expect(await raidBosses.sync()).toEqual({ status: 'unchanged' });
      expect(changes).toEqual([]);
      expect(raidBosses.lastSyncedAt).toBe(now);
      expect((await store.listActive()).every((b) => b.lastSeen === now)).toBe(true);
    });

    it('takes a new shiny flag without calling it a change of bosses', async () => {
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'])));
      const { raidBosses, changes } = service();
      await raidBosses.load();
      await raidBosses.sync();
      expect(raidBosses.bosses(ZONE)[0]?.shiny).toBe(false);
      const shiny = JSON.parse(feedOf(['lvl5', 'ZEKROM'])) as { canBeShiny: boolean }[];
      (shiny[0] as { canBeShiny: boolean }).canBeShiny = true;
      respond = () => Promise.resolve(reply(200, JSON.stringify(shiny)));
      expect((await raidBosses.sync()).status).toBe('unchanged');
      expect(raidBosses.bosses(ZONE)[0]?.shiny).toBe(true);
      expect(changes).toEqual([]);
    });

    it('takes a new picture without calling it a change of bosses', async () => {
      const withImage = (image: string) =>
        JSON.stringify([{ name: 'Zekrom', tier: '5-Star Raids', canBeShiny: false, image }]);
      respond = () => Promise.resolve(reply(200, withImage('https://example.test/old.png')));
      const { raidBosses, changes } = service();
      await raidBosses.load();
      await raidBosses.sync();
      expect(raidBosses.bosses(ZONE)[0]?.image).toBe('https://example.test/old.png');
      respond = () => Promise.resolve(reply(200, withImage('https://example.test/new.png')));
      expect(await raidBosses.sync()).toEqual({ status: 'unchanged' });
      expect(raidBosses.bosses(ZONE)[0]?.image).toBe('https://example.test/new.png');
      expect(changes).toEqual([]);
    });

    it('shares one download between calls made together', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      const [a, b] = await Promise.all([raidBosses.sync(), raidBosses.sync()]);
      expect(requests).toHaveLength(1);
      expect(a).toBe(b);
    });

    it('stores a feed that arrives after stop, and whenIdle waits for it', async () => {
      let release: () => void = () => undefined;
      const asked = new Tally('the downloads of the feed');
      respond = () =>
        new Promise((resolve) => {
          release = () => resolve(reply(200, downloaded));
          asked.add();
        });
      const { raidBosses } = service();
      await raidBosses.load();
      const background = watchBackground();
      const syncing = raidBosses.sync();
      await asked.reached(1);
      expect(requests).toHaveLength(1);
      raidBosses.stop();
      let idle = false;
      const waiting = raidBosses.whenIdle().then(() => {
        idle = true;
      });
      // Everything but the held download is done, and the service is not idle.
      await background.settle();
      expect(idle).toBe(false);
      release();
      await waiting;
      expect(await store.listActive()).toHaveLength(14);
      expect((await syncing).status).toBe('updated');
    });

    it('warns once per heading it does not know and keeps the rest', async () => {
      respond = () =>
        Promise.resolve(
          reply(
            200,
            feedOf(
              ['lvl5', 'ZEKROM'],
              ['Mythical Raids', 'RAYQUAZA'],
              ['Mythical Raids', 'MEW'],
              ['Shadow Raids', 'MEWTWO'],
            ),
          ),
        );
      const { raidBosses, entries } = service();
      await raidBosses.load();
      await raidBosses.sync();
      await raidBosses.sync();
      expect(raidBosses.bosses(ZONE).map((b) => b.key)).toEqual(['zekrom']);
      expect(entries.filter((e) => e['level'] === 'Mythical Raids')).toHaveLength(1);
      expect(entries.filter((e) => e['level'] === 'Shadow Raids')).toHaveLength(1);
    });

    it('keeps a boss the game master does not know, under the name of the feed', async () => {
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'NEWMON'])));
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      expect(raidBosses.bosses(ZONE)).toMatchObject([
        { key: '~newmon', name: 'Newmon', entry: undefined },
      ]);
    });

    it('lists a boss by its name when the catalogue lacks the species', async () => {
      const data = gameDataFixture();
      const pictured = JSON.stringify([
        {
          name: 'Zekrom',
          tier: '5-Star Raids',
          canBeShiny: true,
          image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm644.icon.png',
        },
      ]);
      const gameData = {
        catalogue: new PokemonCatalogue({
          ...data,
          pokemon: data.pokemon.filter((entry) => entry.pokemonId !== 'ZEKROM'),
        }),
      };
      const { log } = createTestLogger();
      const raidBosses = new RaidBossService({
        url: URL,
        refreshMs: HOUR,
        staleAfterMs: 48 * HOUR,
        store,
        gameData,
        fetch: () => Promise.resolve(reply(200, pictured)),
        log,
        now: () => now,
      });
      await raidBosses.load();
      expect((await raidBosses.sync()).status).toBe('updated');
      expect(raidBosses.bosses(ZONE)).toMatchObject([
        { key: '~zekrom', name: 'Zekrom', shiny: true, entry: undefined },
      ]);
    });

    it('builds the look-up from the catalogue in use at the moment of a sync', async () => {
      const data = gameDataFixture();
      // The catalogue at first lacks Zekrom, and so can place neither picture nor name.
      const pictured = JSON.stringify([
        {
          name: 'Zekrom',
          tier: '5-Star Raids',
          canBeShiny: false,
          image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm644.icon.png',
        },
      ]);
      const gameData = {
        catalogue: new PokemonCatalogue({
          ...data,
          pokemon: data.pokemon.filter((entry) => entry.pokemonId !== 'ZEKROM'),
        }),
      };
      const { log } = createTestLogger();
      const raidBosses = new RaidBossService({
        url: URL,
        refreshMs: HOUR,
        staleAfterMs: 48 * HOUR,
        store,
        gameData,
        fetch: () => Promise.resolve(reply(200, pictured)),
        log,
        now: () => now,
      });
      await raidBosses.load();
      await raidBosses.sync();
      expect(raidBosses.bosses(ZONE)).toMatchObject([
        { key: '~zekrom', name: 'Zekrom', entry: undefined },
      ]);
      gameData.catalogue = catalogueFixture();
      await raidBosses.sync();
      const [zekrom] = raidBosses.bosses(ZONE);
      expect(zekrom).toMatchObject({ key: 'zekrom', name: 'Zekrom' });
      expect(zekrom?.entry).toBeDefined();
    });

    it('uses the catalogue in use at the moment it is asked', async () => {
      const data = gameDataFixture();
      const gameData = { catalogue: catalogueFixture() };
      const { log } = createTestLogger();
      const raidBosses = new RaidBossService({
        url: URL,
        refreshMs: HOUR,
        staleAfterMs: 48 * HOUR,
        store,
        gameData,
        fetch: () => Promise.resolve(reply(200, downloaded)),
        log,
        now: () => now,
      });
      await raidBosses.load();
      await raidBosses.sync();
      expect(raidBosses.bossesOf(T5, ZONE)[0]?.entry?.key).toBe('yveltal');
      // A refresh of the game data swaps the catalogue; here, for one that lacks Yveltal.
      gameData.catalogue = new PokemonCatalogue({
        ...data,
        pokemon: data.pokemon.filter((entry) => entry.key !== 'yveltal'),
      });
      expect(raidBosses.bossesOf(T5, ZONE)).toMatchObject([
        { key: '~yveltal', name: 'Yveltal', entry: undefined },
      ]);
    });
  });

  describe('conditional requests', () => {
    it('sends the validators of the last accepted feed and accepts 304', async () => {
      respond = () =>
        Promise.resolve(
          reply(200, downloaded, {
            etag: '"abc"',
            'last-modified': 'Sat, 10 Oct 2026 10:00:00 GMT',
          }),
        );
      const { raidBosses, changes } = service();
      await raidBosses.load();
      await raidBosses.sync();
      now += HOUR;
      respond = () => Promise.resolve(reply(304));
      expect(await raidBosses.sync()).toEqual({ status: 'unchanged' });
      expect(requests[1]?.headers).toEqual({
        Accept: 'application/json',
        'If-None-Match': '"abc"',
        'If-Modified-Since': 'Sat, 10 Oct 2026 10:00:00 GMT',
      });
      expect(raidBosses.lastSyncedAt).toBe(now);
      expect(await store.lastSyncedAt()).toBe(now);
      expect(raidBosses.bosses(ZONE)).toHaveLength(14);
      expect(changes).toEqual([]);
    });

    it('sends no validators after the game data changed, so ids worked out before are worked out again', async () => {
      const data = gameDataFixture();
      const landorus = (key: string) => key.startsWith('landorus');
      const lacking = new PokemonCatalogue({
        ...data,
        pokemon: data.pokemon.filter((entry) => !landorus(entry.key)),
        aliases: Object.fromEntries(
          Object.entries(data.aliases).filter(([alias, key]) => !landorus(alias) && !landorus(key)),
        ),
      });
      const gameData = { catalogue: lacking };
      respond = (_url, init) =>
        Promise.resolve(
          'If-None-Match' in init.headers ? reply(304) : reply(200, downloaded, { etag: '"abc"' }),
        );
      const { raidBosses } = service({ gameData });
      await raidBosses.load();
      await raidBosses.sync();
      const shadowT5 = { level: 'T5', shadow: true } as const;
      expect(
        raidBosses.bossesOf(shadowT5, ZONE).map((b) => [b.key, b.entry === undefined]),
      ).toEqual([['~landorus_incarnate', true]]);
      expect(raidBosses.bossesOf(shadowT5, ZONE)[0]?.pokemonId).toBe('LANDORUS_INCARNATE');

      now += HOUR;
      await raidBosses.sync();
      expect(requests[1]?.headers['If-None-Match']).toBe('"abc"');
      expect(raidBosses.bossesOf(shadowT5, ZONE)[0]?.entry).toBeUndefined();

      gameData.catalogue = catalogueFixture();
      now += HOUR;
      expect((await raidBosses.sync()).status).toBe('updated');
      expect(requests[2]?.headers['If-None-Match']).toBeUndefined();
      expect(raidBosses.bossesOf(shadowT5, ZONE).map((b) => b.key)).toEqual(['landorus_incarnate']);
      expect(raidBosses.bossesOf(shadowT5, ZONE)[0]?.entry).toBeDefined();

      now += HOUR;
      await raidBosses.sync();
      expect(requests[3]?.headers['If-None-Match']).toBe('"abc"');
    });

    it('rejects a response in the old format and keeps the list in use', async () => {
      const { raidBosses, entries } = service();
      await raidBosses.load();
      await raidBosses.sync();
      const before = raidBosses.bosses(ZONE);
      now += HOUR;
      const old = {
        currentList: {
          lvl5: [{ id: 'ZEKROM', form: 'ZEKROM', shiny: false, names: { English: 'Zekrom' } }],
        },
      };
      respond = () => Promise.resolve(reply(200, JSON.stringify(old)));
      const result = await raidBosses.sync();
      expect(result).toMatchObject({ status: 'failed' });
      expect(result.status === 'failed' && result.reason).toMatch(/expected format/);
      expect(raidBosses.bosses(ZONE)).toEqual(before);
      expect(await store.listActive()).toHaveLength(14);
      expect(entries.some((e) => e['level'] === 'currentList')).toBe(false);
    });

    it('does not remember the validators of a feed it rejected', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      respond = () => Promise.resolve(reply(200, downloaded, { etag: '"good"' }));
      await raidBosses.sync();
      respond = () => Promise.resolve(reply(200, '[]', { etag: '"bad"' }));
      expect((await raidBosses.sync()).status).toBe('failed');
      await raidBosses.sync();
      expect(requests[2]?.headers['If-None-Match']).toBe('"good"');
    });

    it('sends no validators after a restart', async () => {
      respond = () => Promise.resolve(reply(200, downloaded, { etag: '"abc"' }));
      const first = service().raidBosses;
      await first.load();
      await first.sync();
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      expect(requests[1]?.headers).toEqual({ Accept: 'application/json' });
    });
  });

  describe('a feed that cannot be used', () => {
    const bad: [string, () => Promise<Response>, RegExp, object][] = [
      [
        'an error status',
        () => Promise.resolve(reply(503, 'busy')),
        /answered 503/,
        { kind: 'status', httpStatus: 503 },
      ],
      [
        'a redirect that leads off its host',
        () => Promise.resolve(reply(302, '', { location: 'http://mysql:3306/' })),
        /another host/,
        { kind: 'unreachable' },
      ],
      [
        'a page that is not JSON',
        () => Promise.resolve(reply(200, '<html>')),
        /did not send JSON/,
        { kind: 'unreadable' },
      ],
      [
        'an empty body',
        () => Promise.resolve(reply(200, '')),
        /did not send JSON/,
        { kind: 'unreadable' },
      ],
      [
        'JSON of another shape',
        () => Promise.resolve(reply(200, '{"message":"Not Found"}')),
        /expected format/,
        { kind: 'unreadable' },
      ],
      [
        'a list without bosses',
        () => Promise.resolve(reply(200, feedOf(['lvl9', 'RAYQUAZA']))),
        /lists no bosses/,
        { kind: 'unreadable' },
      ],
      [
        'an enormous body',
        () => Promise.resolve(reply(200, ' '.repeat(2_000_001))),
        /sent more than 2000000 bytes/,
        { kind: 'unreadable' },
      ],
      [
        'a network error',
        () =>
          Promise.reject(
            new TypeError('fetch failed', {
              cause: new Error('getaddrinfo ENOTFOUND example.test'),
            }),
          ),
        /ENOTFOUND/,
        { kind: 'unreachable' },
      ],
    ];

    it.each(bad)('keeps the list in use after %s', async (_what, response, reason, kind) => {
      const { raidBosses, entries, changes } = service();
      await raidBosses.load();
      await raidBosses.sync();
      const synced = now;
      now += HOUR;
      respond = response;
      const result = await raidBosses.sync();
      expect(result.status).toBe('failed');
      expect(result).toMatchObject({ reason: expect.stringMatching(reason) as unknown, ...kind });
      expect(raidBosses.bosses(ZONE)).toHaveLength(14);
      expect(raidBosses.lastSyncedAt).toBe(synced);
      expect(await store.lastSyncedAt()).toBe(synced);
      expect(changes).toEqual([]);
      expect(entries.some((e) => e['msg'] === 'could not sync the raid bosses')).toBe(true);
    });

    it('warns of a feed out of reach (the network away), and errors for one it cannot read', async () => {
      const { raidBosses, entries } = service();
      await raidBosses.load();
      const failed = () => entries.filter((e) => e['msg'] === 'could not sync the raid bosses');
      respond = () =>
        Promise.reject(
          new TypeError('fetch failed', {
            cause: Object.assign(new Error('getaddrinfo ENOTFOUND example.test'), {
              code: 'ENOTFOUND',
            }),
          }),
        );
      await raidBosses.sync();
      expect(failed().map((e) => e['level'])).toEqual([40]);
      respond = () => Promise.resolve(reply(200, 'not json'));
      await raidBosses.sync();
      expect(failed().map((e) => e['level'])).toEqual([40, 50]);
      // A 5xx passes by itself, as the network does (review V1 of 8B-L); a 404 needs a person.
      respond = () => Promise.resolve(reply(503, 'busy'));
      await raidBosses.sync();
      respond = () => Promise.resolve(reply(404, 'gone'));
      await raidBosses.sync();
      expect(failed().map((e) => e['level'])).toEqual([40, 50, 40, 50]);
    });

    it('says at debug that a read changed nothing, with how many bosses (plan 8X-H)', async () => {
      const { raidBosses, entries } = service();
      await raidBosses.load();
      await raidBosses.sync();
      now += HOUR;
      expect(await raidBosses.sync()).toEqual({ status: 'unchanged' });
      expect(entries.filter((e) => e['msg'] === 'raid bosses read, unchanged')).toEqual([
        expect.objectContaining({ level: 20, bosses: 14 }),
      ]);
    });

    it('catches up at once after a failed read, and only then (plan 8X-H)', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      // The last read worked: nothing is owed, nothing asked.
      const asked = requests.length;
      expect(await raidBosses.catchUp()).toBe('not-owed');
      expect(requests).toHaveLength(asked);
      now += HOUR;
      respond = () => Promise.reject(new TypeError('fetch failed'));
      raidBosses.startAutoSync();
      await vi.advanceTimersToNextTimerAsync();
      await raidBosses.whenIdle();
      expect(requests).toHaveLength(asked + 1);
      // Back: read at once, not at the retry five minutes on, and once only.
      respond = () => Promise.resolve(reply(200, downloaded));
      expect(await raidBosses.catchUp()).toBe('done');
      expect(requests).toHaveLength(asked + 2);
      expect(raidBosses.lastSyncedAt).toBe(now);
      // The next read is a refresh's interval on, as after any read that worked.
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(HOUR - 1);
      expect(requests).toHaveLength(asked + 2);
      raidBosses.stop();
    });

    it('gives up on a download that stalls', async () => {
      const { raidBosses } = service({ timeoutMs: 20 });
      await raidBosses.load();
      respond = (_url, init) =>
        new Promise((_resolve, reject) => {
          if (init.signal.aborted) reject(init.signal.reason as Error);
          init.signal.addEventListener('abort', () => reject(init.signal.reason as Error), {
            once: true,
          });
        });
      const timeouts = fakeTimeoutSignals();
      const syncing = raidBosses.sync();
      await timeouts.made.reached(1);
      timeouts.expire();
      expect(await syncing).toMatchObject({
        status: 'failed',
        kind: 'timeout',
        reason: expect.stringMatching(/timed out after 20 ms/) as unknown,
      });
    });

    it('keeps the list in memory when the database fails, and recovers', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      respond = () => Promise.resolve(reply(200, downloaded, { etag: '"old"' }));
      await raidBosses.sync();
      now += HOUR;
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM']), { etag: '"new"' }));
      store.failing = new Error('connection lost');
      expect(await raidBosses.sync()).toEqual({
        status: 'failed',
        kind: 'storing',
        reason: 'connection lost',
      });
      expect(raidBosses.bosses(ZONE)).toHaveLength(14);
      store.failing = undefined;
      expect((await raidBosses.sync()).status).toBe('updated');
      expect(requests[0]?.headers['If-None-Match']).toBeUndefined();
      expect(requests[1]?.headers['If-None-Match']).toBe('"old"');
      expect(requests[2]?.headers['If-None-Match']).toBeUndefined();
      expect(raidBosses.bosses(ZONE).map((b) => b.key)).toEqual(['zekrom']);
    });

    it('never rejects, even when the logger is broken', async () => {
      const { log } = createTestLogger();
      log.error = () => {
        throw new Error('logger down');
      };
      const raidBosses = new RaidBossService({
        url: URL,
        refreshMs: HOUR,
        staleAfterMs: 48 * HOUR,
        store,
        gameData: { catalogue: catalogueFixture() },
        fetch: () => Promise.reject(new Error('offline')),
        log,
        now: () => now,
      });
      await raidBosses.load();
      await expect(raidBosses.sync()).resolves.toMatchObject({ status: 'failed' });
    });

    it('does not fail a sync because the warning about an unknown level cannot be logged', async () => {
      respond = () =>
        Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'], ['Mythical Raids', 'RAYQUAZA'])));
      const { log } = createTestLogger();
      log.warn = () => {
        throw new Error('logger down');
      };
      const raidBosses = new RaidBossService({
        url: URL,
        refreshMs: HOUR,
        staleAfterMs: 48 * HOUR,
        store,
        gameData: { catalogue: catalogueFixture() },
        fetch: (url, init) => respond(url, init),
        log,
        now: () => now,
      });
      await raidBosses.load();
      await expect(raidBosses.sync()).resolves.toMatchObject({ status: 'updated' });
    });
  });

  describe('keeping the list and the validators honest', () => {
    it('serves the new list when deleting expired overrides fails, and logs a warning', async () => {
      store.failingMethods.add('removeExpiredOverrides');
      const { raidBosses, entries } = service();
      await raidBosses.load();
      expect((await raidBosses.sync()).status).toBe('updated');
      expect(raidBosses.bosses(ZONE)).toHaveLength(14);
      expect(raidBosses.lastSyncedAt).toBe(now);
      expect(entries.some((e) => e['level'] === 40)).toBe(true);
    });

    it('sends no validators after a failure that followed the new list being stored', async () => {
      respond = () => Promise.resolve(reply(200, downloaded, { etag: '"one"' }));
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      now += HOUR;
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM']), { etag: '"two"' }));
      store.failingMethods.add('listActive');
      expect(await raidBosses.sync()).toEqual({
        status: 'failed',
        kind: 'storing',
        reason: 'listActive failed',
      });
      store.failingMethods.delete('listActive');
      now += HOUR;
      expect((await raidBosses.sync()).status).toBe('updated');
      expect(requests[1]?.headers['If-None-Match']).toBe('"one"');
      expect(requests[2]?.headers['If-None-Match']).toBeUndefined();
      expect(raidBosses.bosses(ZONE).map((b) => b.key)).toEqual(['zekrom']);
    });

    it('does not take a 304 to an unconditional request as a sync', async () => {
      respond = () => Promise.resolve(reply(304));
      const { raidBosses, changes } = service();
      await raidBosses.load();
      expect(await raidBosses.sync()).toEqual({
        status: 'failed',
        kind: 'status',
        httpStatus: 304,
        reason: `${URL} answered 304 to a request without validators`,
      });
      expect(raidBosses.lastSyncedAt).toBeUndefined();
      respond = () => Promise.resolve(reply(200, downloaded));
      expect((await raidBosses.sync()).status).toBe('updated');
      expect(changes).toEqual([]);
    });

    it('makes an override written while a sync stores the feed wait, so members are told what they see', async () => {
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'YVELTAL'], ['lvl3', 'STARMIE'])));
      const { raidBosses, changes } = service();
      await raidBosses.load();
      await raidBosses.sync();
      let release: () => void = () => undefined;
      const started = new Tally('the re-reads of the overrides');
      store.beforeListOverrides = () => {
        store.beforeListOverrides = undefined;
        started.add();
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      };
      now += HOUR;
      respond = () =>
        Promise.resolve(
          reply(200, feedOf(['lvl5', 'YVELTAL'], ['lvl3', 'STARMIE'], ['lvl3', 'UMBREON'])),
        );
      // The sync has stored the new feed and is re-reading the overrides.
      const background = watchBackground();
      const syncing = raidBosses.sync();
      await started.reached(1);
      // Staff add the boss the feed has just listed: all it can do while the sync is held is
      // done, and it has written nothing.
      const adding = raidBosses.addOverride(
        override({ action: 'add', pokemonId: 'UMBREON', tier: T3 }),
      );
      await background.settle();
      expect(await store.listOverrides()).toEqual([]);
      release();
      const result = await syncing;
      await adding;
      // Members saw no Umbreon before the sync and see it after: they are told.
      const seen = result.status === 'updated' ? result.change.seen : undefined;
      expect(seen?.added.map((boss) => boss.key)).toEqual(['umbreon']);
      expect(changes[0]?.seen.added.map((boss) => boss.key)).toEqual(['umbreon']);
      expect(raidBosses.overrides()).toMatchObject([{ action: 'add', pokemonId: 'UMBREON' }]);
    });

    it('lets a sync wait for an override write in progress, and a failed write not block the next', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      let release: () => void = () => undefined;
      store.beforeListOverrides = () => {
        store.beforeListOverrides = undefined;
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      };
      // The write is stored and its re-read held back; a sync downloads meanwhile.
      const background = watchBackground();
      const adding = raidBosses.addOverride(override());
      now += HOUR;
      const syncing = raidBosses.sync();
      await background.settle();
      expect(requests).toHaveLength(2);
      release();
      await adding;
      expect((await syncing).status).toBe('unchanged');
      store.failingMethods.add('saveOverride');
      await expect(raidBosses.addOverride(override())).rejects.toThrow('saveOverride failed');
      store.failingMethods.clear();
      await raidBosses.removeOverride(raidBosses.overrides()[0]?.id ?? 0);
      expect(raidBosses.overrides()).toEqual([]);
    });

    it('deletes expired overrides while the feed answers 304', async () => {
      respond = () => Promise.resolve(reply(200, downloaded, { etag: '"abc"' }));
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      await raidBosses.addOverride(override({ expiresAt: now + 30 * MINUTE }));
      now += HOUR;
      respond = () => Promise.resolve(reply(304));
      expect(await raidBosses.sync()).toEqual({ status: 'unchanged' });
      expect(await store.listOverrides()).toEqual([]);
    });
  });

  describe('going stale', () => {
    it('says so once after staleAfterMs without a successful sync, and again after a recovery', async () => {
      const { raidBosses, stale, entries } = service();
      await raidBosses.load();
      await raidBosses.sync();
      const synced = now;
      respond = () => Promise.resolve(reply(503));

      now = synced + 48 * HOUR - 1;
      await raidBosses.sync();
      expect(stale).toEqual([]);

      now = synced + 48 * HOUR;
      await raidBosses.sync();
      expect(stale).toEqual([{ lastSyncedAt: synced, reason: `${URL} answered 503` }]);
      expect(entries.filter((e) => e['msg'] === 'the raid boss list is out of date')).toHaveLength(
        1,
      );

      now += HOUR;
      await raidBosses.sync();
      expect(stale).toHaveLength(1);

      respond = () => Promise.resolve(reply(200, downloaded));
      await raidBosses.sync();
      respond = () => Promise.resolve(reply(503));
      now += 48 * HOUR;
      await raidBosses.sync();
      expect(stale).toHaveLength(2);
    });

    it('waits for a second failure in a row when the feed has never been read', async () => {
      respond = () => Promise.resolve(reply(503));
      const { raidBosses, stale } = service();
      await raidBosses.load();
      now += 72 * HOUR;
      await raidBosses.sync();
      expect(stale).toEqual([]);
      now += 5 * MINUTE;
      await raidBosses.sync();
      expect(stale).toEqual([{ lastSyncedAt: undefined, reason: `${URL} answered 503` }]);
      await raidBosses.sync();
      expect(stale).toHaveLength(1);
    });

    it('does not count a failure before a success towards the second one', async () => {
      respond = () => Promise.resolve(reply(503));
      const { raidBosses, stale } = service({ staleAfterMs: 0 });
      await raidBosses.load();
      await raidBosses.sync();
      respond = () => Promise.resolve(reply(200, downloaded));
      await raidBosses.sync();
      respond = () => Promise.resolve(reply(503));
      now += MINUTE;
      await raidBosses.sync();
      // A list was read: from now on the time since that read decides, not the count.
      expect(stale).toEqual([{ lastSyncedAt: now - MINUTE, reason: `${URL} answered 503` }]);
    });

    it('counts from the last run when the bot starts with an old list', async () => {
      const first = service().raidBosses;
      await first.load();
      await first.sync();
      const synced = now;
      now += 72 * HOUR;
      respond = () => Promise.resolve(reply(503));
      const { raidBosses, stale } = service();
      await raidBosses.load();
      await raidBosses.sync();
      expect(stale).toMatchObject([{ lastSyncedAt: synced }]);
    });

    it('treats a 304 as a successful sync', async () => {
      respond = () => Promise.resolve(reply(200, downloaded, { etag: '"abc"' }));
      const { raidBosses, stale } = service();
      await raidBosses.load();
      await raidBosses.sync();
      respond = () => Promise.resolve(reply(304));
      now += 47 * HOUR;
      await raidBosses.sync();
      respond = () => Promise.resolve(reply(503));
      now += 2 * HOUR;
      await raidBosses.sync();
      expect(stale).toEqual([]);
    });
  });

  describe('what a read says beyond its bosses', () => {
    it('names the headings it does not know, until a read without them', async () => {
      respond = () =>
        Promise.resolve(
          reply(
            200,
            JSON.stringify([
              { name: 'Zekrom', tier: '5-Star Raids', canBeShiny: false },
              { name: 'Mew', tier: 'Brand New Raids', canBeShiny: false },
            ]),
          ),
        );
      const { raidBosses } = service();
      await raidBosses.load();
      expect(raidBosses.unknownLevels).toEqual([]);
      expect(await raidBosses.sync()).toMatchObject({
        status: 'updated',
        unknownLevels: ['Brand New Raids'],
      });
      expect(raidBosses.unknownLevels).toEqual(['Brand New Raids']);
      now += HOUR;
      expect(await raidBosses.sync()).toEqual({
        status: 'unchanged',
        unknownLevels: ['Brand New Raids'],
      });
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'])));
      now += HOUR;
      expect(await raidBosses.sync()).toEqual({ status: 'unchanged' });
      expect(raidBosses.unknownLevels).toEqual([]);
    });

    it('says and logs that the list shrank to less than half', async () => {
      const { raidBosses, entries } = service();
      await raidBosses.load();
      await raidBosses.sync();
      const before = raidBosses.feedBosses().length;
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'])));
      now += HOUR;
      expect(await raidBosses.sync()).toMatchObject({
        status: 'updated',
        shrank: { before, after: 1 },
      });
      expect(
        entries.filter(
          (e) => e['msg'] === 'the raid boss feed lists fewer than half the bosses it did',
        ),
      ).toMatchObject([{ before, after: 1 }]);
    });

    it('does not judge a short list or one that keeps half', async () => {
      respond = () =>
        Promise.resolve(
          reply(200, feedOf(['lvl5', 'ZEKROM'], ['lvl5', 'MEW'], ['lvl3', 'STARMIE'])),
        );
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'])));
      now += HOUR;
      expect(await raidBosses.sync()).not.toHaveProperty('shrank');
      respond = () =>
        Promise.resolve(
          reply(
            200,
            feedOf(['lvl5', 'ZEKROM'], ['lvl5', 'MEW'], ['lvl3', 'STARMIE'], ['lvl1', 'MAGIKARP']),
          ),
        );
      now += HOUR;
      await raidBosses.sync();
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'], ['lvl5', 'MEW'])));
      now += HOUR;
      expect(await raidBosses.sync()).not.toHaveProperty('shrank');
    });

    it('gives the stored feed rows, which a caller cannot change', async () => {
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'])));
      const { raidBosses } = service();
      expect(() => raidBosses.feedBosses()).toThrow(/not been loaded/);
      await raidBosses.load();
      await raidBosses.sync();
      const [row] = raidBosses.feedBosses();
      expect(row).toMatchObject({ pokemonId: 'ZEKROM', name: 'Zekrom', firstSeen: now });
      if (row) row.tier.level = 'T1';
      expect(raidBosses.feedBosses()[0]?.tier.level).toBe('T5');
    });
  });

  describe('listeners', () => {
    it('keeps going when a listener throws, and stops telling one that unsubscribed', async () => {
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'])));
      const { raidBosses, changes, entries } = service();
      const heard: string[] = [];
      raidBosses.onChange(() => {
        throw new Error('listener broke');
      });
      const unsubscribe = raidBosses.onChange(() => {
        heard.push('second');
      });
      await raidBosses.load();
      await raidBosses.sync();
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'YVELTAL'])));
      expect((await raidBosses.sync()).status).toBe('updated');
      expect(changes).toHaveLength(1);
      expect(heard).toEqual(['second']);
      expect(entries.some((e) => e['msg'] === 'a raid boss listener failed')).toBe(true);

      unsubscribe();
      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'])));
      await raidBosses.sync();
      expect(changes).toHaveLength(2);
      expect(heard).toEqual(['second']);
    });
  });

  describe('asynchronous listeners', () => {
    it('logs a listener whose promise rejects and still calls the others', async () => {
      const unhandled: unknown[] = [];
      const record = (reason: unknown): void => {
        unhandled.push(reason);
      };
      process.on('unhandledRejection', record);
      try {
        respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'])));
        const { raidBosses, changes, entries } = service();
        raidBosses.onChange(() => Promise.reject(new Error('post failed')));
        await raidBosses.load();
        await raidBosses.sync();
        respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'YVELTAL'])));
        const background = watchBackground();
        expect((await raidBosses.sync()).status).toBe('updated');
        // The listener's rejection has been dealt with, and an unhandled one reported, once
        // everything that followed the sync is done.
        await background.settle();
        expect(changes).toHaveLength(1);
        expect(entries.some((e) => e['msg'] === 'a raid boss listener failed')).toBe(true);
        expect(unhandled).toEqual([]);
      } finally {
        process.off('unhandledRejection', record);
      }
    });
  });

  describe('overrides', () => {
    it('applies an override at once and stores it', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      const saved = await raidBosses.addOverride(override({ shiny: true }));
      expect(saved).toMatchObject({ pokemonId: 'ZEKROM', createdAt: now });
      expect(raidBosses.bossesOf(T5, ZONE).map((b) => [b.key, b.source, b.shiny])).toEqual([
        ['yveltal', 'feed', true],
        ['zekrom', 'override', true],
      ]);
      expect(raidBosses.autoset(T5, ZONE)).toBeUndefined();
      expect(raidBosses.overrides()).toEqual([saved]);
      expect(await store.listOverrides()).toEqual([saved]);
    });

    it('lets a moderator choose what eggs hatch as', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      await raidBosses.addOverride(override({ action: 'autoset', pokemonId: 'UMBREON', tier: T3 }));
      expect(raidBosses.autoset(T3, ZONE)?.key).toBe('umbreon');
    });

    it('lets a new autoset of a tier replace the earlier one, whatever its Pokémon', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      await raidBosses.addOverride(override({ action: 'autoset', pokemonId: 'UMBREON', tier: T3 }));
      await raidBosses.addOverride(override({ action: 'autoset', pokemonId: 'MEWTWO', tier: T5 }));
      await raidBosses.addOverride(override({ action: 'add', pokemonId: 'ZEKROM', tier: T3 }));
      now += 1;
      await raidBosses.addOverride(override({ action: 'autoset', pokemonId: 'STARMIE', tier: T3 }));
      const kept = (list: NewBossOverride[]) => list.map((o) => [o.action, o.pokemonId]);
      expect(kept(raidBosses.overrides())).toEqual([
        ['autoset', 'MEWTWO'],
        ['add', 'ZEKROM'],
        ['autoset', 'STARMIE'],
      ]);
      expect(kept(await store.listOverrides())).toEqual(kept(raidBosses.overrides()));
      expect(raidBosses.autoset(T3, ZONE)?.key).toBe('starmie');
      // Umbreon stays a boss of T3 only while the feed lists it there.
      expect(raidBosses.bossesOf(T3, ZONE).find((b) => b.key === 'umbreon')?.source).toBe('feed');
    });

    it('replaces the earlier autoset of the tier also when only the re-read after saving fails', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      await raidBosses.addOverride(override({ action: 'autoset', pokemonId: 'UMBREON', tier: T3 }));
      store.failingMethods.add('listOverrides');
      await raidBosses.addOverride(override({ action: 'autoset', pokemonId: 'STARMIE', tier: T3 }));
      expect(raidBosses.overrides().map((o) => o.pokemonId)).toEqual(['STARMIE']);
    });

    it('removes an override', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      const saved = await raidBosses.addOverride(override());
      expect(await raidBosses.removeOverride(saved.id)).toBe(true);
      expect(await raidBosses.removeOverride(saved.id)).toBe(false);
      expect(raidBosses.bosses(ZONE)).toEqual([]);
      expect(raidBosses.overrides()).toEqual([]);
    });

    it('still resolves, and applies the override, when only the re-read after saving fails', async () => {
      const { raidBosses, entries } = service();
      await raidBosses.load();
      await raidBosses.sync();
      store.failingMethods.add('listOverrides');
      const saved = await raidBosses.addOverride(override());
      expect(raidBosses.overrides()).toEqual([saved]);
      expect(raidBosses.bossesOf(T5, ZONE).map((b) => b.key)).toEqual(['yveltal', 'zekrom']);
      expect(entries.some((e) => e['level'] === 40)).toBe(true);
    });

    it('still resolves, and drops the override, when only the re-read after removing fails', async () => {
      const { raidBosses, entries } = service();
      await raidBosses.load();
      await raidBosses.sync();
      const saved = await raidBosses.addOverride(override());
      store.failingMethods.add('listOverrides');
      expect(await raidBosses.removeOverride(saved.id)).toBe(true);
      expect(raidBosses.overrides()).toEqual([]);
      expect(raidBosses.bossesOf(T5, ZONE).map((b) => b.key)).toEqual(['yveltal']);
      expect(entries.some((e) => e['level'] === 40)).toBe(true);
    });

    it('refuses an override that makes no sense, storing nothing', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      await expect(raidBosses.addOverride(override({ tier: null }))).rejects.toThrow(RangeError);
      await expect(raidBosses.addOverride(override({ expiresAt: now }))).rejects.toThrow(
        /in the future/,
      );
      expect(await store.listOverrides()).toEqual([]);
    });

    it('lets an override lapse at its expiry and deletes it at the next sync', async () => {
      const { raidBosses } = service();
      await raidBosses.load();
      await raidBosses.sync();
      await raidBosses.addOverride(override({ expiresAt: now + 30 * MINUTE }));
      now += 30 * MINUTE - 1;
      expect(raidBosses.bossesOf(T5, ZONE)).toHaveLength(2);
      now += 1;
      expect(raidBosses.bossesOf(T5, ZONE)).toHaveLength(1);
      expect(raidBosses.overrides()).toEqual([]);
      expect(await store.listOverrides()).toHaveLength(1);
      await raidBosses.sync();
      expect(await store.listOverrides()).toEqual([]);
    });
  });

  describe('syncing on a timer', () => {
    beforeEach(() => {
      vi.useFakeTimers({ now });
    });

    function timed(retryMs?: number) {
      const { log } = createTestLogger();
      return new RaidBossService({
        url: URL,
        refreshMs: HOUR,
        retryMs,
        staleAfterMs: 48 * HOUR,
        store,
        gameData: { catalogue: catalogueFixture() },
        fetch: (url, init) => {
          requests.push({ url, headers: init.headers });
          return respond(url, init);
        },
        log,
      });
    }

    it('reads the feed at once on a new database, then every refreshMs', async () => {
      const raidBosses = timed();
      await raidBosses.load();
      raidBosses.startAutoSync();
      expect(requests).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(0);
      expect(requests).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(HOUR - 1);
      expect(requests).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(3 * HOUR);
      expect(requests).toHaveLength(5);
      raidBosses.stop();
    });

    it('waits for the stored list to be refreshMs old after a restart', async () => {
      const first = timed();
      await first.load();
      await first.sync();
      await vi.advanceTimersByTimeAsync(20 * MINUTE);
      const raidBosses = timed();
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(40 * MINUTE - 1);
      expect(requests).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(2);
      raidBosses.stop();
    });

    it('reads the feed at once when the stored list is older than refreshMs', async () => {
      const first = timed();
      await first.load();
      await first.sync();
      await vi.advanceTimersByTimeAsync(5 * HOUR);
      const raidBosses = timed();
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      expect(requests).toHaveLength(2);
      raidBosses.stop();
    });

    it('tries again retryMs after a failure, and refreshMs after a success', async () => {
      respond = () => Promise.resolve(reply(503));
      const raidBosses = timed(10 * MINUTE);
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      expect(requests).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(10 * MINUTE - 1);
      expect(requests).toHaveLength(1);
      respond = () => Promise.resolve(reply(200, downloaded));
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(2);
      expect(raidBosses.bosses(ZONE)).toHaveLength(14);
      await vi.advanceTimersByTimeAsync(HOUR - 1);
      expect(requests).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(3);
      raidBosses.stop();
    });

    it('retries three times retryMs apart, then every refreshMs, until a success', async () => {
      respond = () => Promise.resolve(reply(503));
      const raidBosses = timed(10 * MINUTE);
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      expect(requests).toHaveLength(1);
      for (const expected of [2, 3, 4]) {
        await vi.advanceTimersByTimeAsync(10 * MINUTE - 1);
        expect(requests).toHaveLength(expected - 1);
        await vi.advanceTimersByTimeAsync(1);
        expect(requests).toHaveLength(expected);
      }
      for (const expected of [5, 6]) {
        await vi.advanceTimersByTimeAsync(HOUR - 1);
        expect(requests).toHaveLength(expected - 1);
        await vi.advanceTimersByTimeAsync(1);
        expect(requests).toHaveLength(expected);
      }
      respond = () => Promise.resolve(reply(200, downloaded));
      await vi.advanceTimersByTimeAsync(HOUR);
      expect(requests).toHaveLength(7);
      respond = () => Promise.resolve(reply(503));
      await vi.advanceTimersByTimeAsync(HOUR);
      expect(requests).toHaveLength(8);
      await vi.advanceTimersByTimeAsync(10 * MINUTE - 1);
      expect(requests).toHaveLength(8);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(9);
      raidBosses.stop();
    });

    it('reads the feed at once when started again after a stop that ended the first read', async () => {
      respond = (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason as Error), {
            once: true,
          });
        });
      const raidBosses = timed();
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      expect(requests).toHaveLength(1);
      raidBosses.stop();
      await raidBosses.whenIdle();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      expect(requests).toHaveLength(2);
      raidBosses.stop();
    });

    it('retries after five minutes by default', async () => {
      respond = () => Promise.resolve(reply(503));
      const raidBosses = timed();
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(5 * MINUTE - 1);
      expect(requests).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(2);
      raidBosses.stop();
    });

    it('syncs within refreshMs when the stored time is in the future', async () => {
      const first = timed();
      await first.load();
      await first.sync();
      vi.setSystemTime(Date.now() - 3 * HOUR);
      const raidBosses = timed();
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(HOUR);
      expect(requests).toHaveLength(2);
      raidBosses.stop();
    });

    it('does not start two timers', async () => {
      const raidBosses = timed();
      await raidBosses.load();
      raidBosses.startAutoSync();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(2 * HOUR);
      expect(requests).toHaveLength(3);
      raidBosses.stop();
    });

    it('stops', async () => {
      const raidBosses = timed();
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      raidBosses.stop();
      await vi.advanceTimersByTimeAsync(5 * HOUR);
      expect(requests).toHaveLength(1);
    });

    it('aborts a download in flight when stopped', async () => {
      respond = (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason as Error), {
            once: true,
          });
        });
      const { log, entries } = createTestLogger();
      const stale: StaleFeed[] = [];
      const raidBosses = new RaidBossService({
        url: URL,
        refreshMs: HOUR,
        staleAfterMs: 0,
        store,
        gameData: { catalogue: catalogueFixture() },
        fetch: (url, init) => {
          requests.push({ url, headers: init.headers });
          return respond(url, init);
        },
        log,
      });
      raidBosses.onStale((event) => {
        stale.push(event);
      });
      await raidBosses.load();
      raidBosses.startAutoSync();
      await vi.advanceTimersByTimeAsync(0);
      expect(requests).toHaveLength(1);
      raidBosses.stop();
      await raidBosses.whenIdle();
      expect(entries.filter((e) => e['level'] === 50)).toEqual([]);
      expect(stale).toEqual([]);
      await vi.advanceTimersByTimeAsync(5 * HOUR);
      expect(requests).toHaveLength(1);
    });

    it('reports a sync ended by stop as failed with the reason stopped', async () => {
      respond = (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason as Error), {
            once: true,
          });
        });
      const raidBosses = timed();
      await raidBosses.load();
      const syncing = raidBosses.sync();
      await vi.advanceTimersByTimeAsync(0);
      raidBosses.stop();
      expect(await syncing).toEqual({ status: 'failed', kind: 'stopped', reason: 'stopped' });
      // Once stopped, a sync asked for answers so at once and asks the feed nothing.
      const asked = requests.length;
      expect(await raidBosses.sync()).toEqual({
        status: 'failed',
        kind: 'stopped',
        reason: 'stopped',
      });
      expect(requests).toHaveLength(asked);
    });

    it('is idle at once when nothing is running', async () => {
      await expect(timed().whenIdle()).resolves.toBeUndefined();
    });
  });
});
