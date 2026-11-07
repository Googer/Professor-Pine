import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeTimeoutSignals } from '../../test/support/timers.js';
import { readEnglishSample, readGameMasterSample } from '../../test/support/game-data.js';
import { textAnswer } from '../../test/support/responses.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { GameDataService, MAX_DOWNLOAD_BYTES, type FetchText } from './game-data-service.js';

const GAME_MASTER_URL = 'https://example.test/latest.json';
const TEXT_URL = 'https://example.test/English.txt';
const ICONS_URL = 'https://example.test/trees/icons';
const HOUR = 3_600_000;
/** GitHub's listing of the folder of pictures, with three icons the bot can use among others. */
const iconListing = JSON.stringify({
  truncated: false,
  tree: [
    { path: 'pm147.icon.png' },
    { path: 'pm147.s.icon.png' },
    { path: 'pm19.fALOLA.icon.png' },
    { path: 'pm201.fUNOWN_F.icon.png' },
    { path: 'pm25.cFALL_2019.icon.png' },
  ],
});

const PORTRAITS_URL = 'https://example.test/trees/portraits';
/** GitHub's listing of the megas' portraits, with two the bot can use. */
const portraitListing = JSON.stringify({
  truncated: false,
  tree: [
    { path: 'pm687.fMEGA.portrait.png' },
    { path: 'pm687.fMEGA.s.portrait.png' },
    { path: 'pm150.fMEGA_X.portrait.png' },
  ],
});

const gameMaster = JSON.stringify(readGameMasterSample());
// The sample text file is a slice; the service wants the first Pokémon's name as proof it is the real one.
const english = `RESOURCE ID: pokemon_name_0001\nTEXT: Bulbasaur\n${readEnglishSample()}`;

function ok(body: string) {
  return textAnswer(200, body);
}

function stalls(): FetchText {
  return (_url, init) =>
    new Promise((_resolve, reject) => {
      if (init.signal.aborted) reject(init.signal.reason as Error);
      init.signal.addEventListener('abort', () => reject(init.signal.reason as Error), {
        once: true,
      });
    });
}

describe('GameDataService', () => {
  let dir: string;
  let cachePath: string;
  let now: number;
  let clock: () => number;
  let requests: string[];
  let respond: FetchText;
  /** The services a test made: each is idle before the test is over. */
  const made: GameDataService[] = [];

  function service(
    extra: {
      timeoutMs?: number;
      retryMs?: number;
      iconsUrl?: string;
      megaPortraitsUrl?: string;
    } = {},
  ) {
    const { log, entries } = createTestLogger();
    const fetch: FetchText = (url, init) => {
      requests.push(url);
      return respond(url, init);
    };
    const gameData = new GameDataService({
      gameMasterUrl: GAME_MASTER_URL,
      textUrl: TEXT_URL,
      cachePath,
      maxAgeMs: 24 * HOUR,
      fetch,
      log,
      now: () => clock(),
      ...extra,
    });
    made.push(gameData);
    return { gameData, entries, log };
  }

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pine-game-data-'));
    cachePath = path.join(dir, 'nested', 'game-data-cache.json');
    now = Date.UTC(2026, 9, 10, 12);
    clock = () => now;
    requests = [];
    respond = (url) =>
      Promise.resolve(
        ok(
          url === GAME_MASTER_URL
            ? gameMaster
            : url === ICONS_URL
              ? iconListing
              : url === PORTRAITS_URL
                ? portraitListing
                : english,
        ),
      );
  });
  afterEach(async () => {
    // A refresh still running writes its copy into the folder: its write raced the removal of
    // the folder (ENOTEMPTY, seen under load). Each is waited for first.
    for (const gameData of made.splice(0)) {
      gameData.stop();
      await gameData.whenIdle();
    }
    vi.useRealTimers();
    await rm(dir, { recursive: true, force: true });
  });

  describe('the list of icon files', () => {
    const withIcons = { iconsUrl: ICONS_URL };

    it('is downloaded with the game data, saved with it, and read from the saved copy', async () => {
      const { gameData, entries } = service(withIcons);
      expect(gameData.icons).toBeUndefined();
      await gameData.load();
      expect(requests.sort()).toEqual([TEXT_URL, ICONS_URL, GAME_MASTER_URL].sort());
      // One line says that the list was fetched, with how many icons it has.
      expect(
        entries.filter((entry) => entry.msg === 'the list of Pokémon icons was downloaded'),
      ).toMatchObject([{ level: 30, icons: 3 }]);
      expect(gameData.icons?.has('pm147.icon.png')).toBe(true);
      expect(gameData.icons?.has('pm147.s.icon.png')).toBe(false);
      expect(gameData.icons?.size).toBe(3);
      const saved = JSON.parse(await readFile(cachePath, 'utf8')) as { icons: string[] };
      expect(saved.icons).toEqual([
        'pm147.icon.png',
        'pm19.fALOLA.icon.png',
        'pm201.fUNOWN_F.icon.png',
      ]);
      requests = [];
      const again = service(withIcons);
      await again.gameData.load();
      expect(requests).toEqual([]);
      expect(again.gameData.icons?.has('pm201.fUNOWN_F.icon.png')).toBe(true);
    });

    it('does not keep the game data from loading when it cannot be downloaded', async () => {
      for (const answer of [
        () => Promise.reject(new Error('getaddrinfo ENOTFOUND')),
        () => Promise.resolve(textAnswer(403)),
        () => Promise.resolve(ok('not json')),
        () => Promise.resolve(ok(JSON.stringify({ message: 'API rate limit exceeded' }))),
        () => Promise.resolve(ok(JSON.stringify({ tree: [{ path: 'README.md' }] }))),
      ]) {
        await rm(cachePath, { force: true });
        respond = (url) =>
          url === ICONS_URL
            ? answer()
            : Promise.resolve(ok(url === GAME_MASTER_URL ? gameMaster : english));
        const { gameData, entries } = service(withIcons);
        await gameData.load();
        expect(gameData.catalogue.byKey('venusaur')).toBeDefined();
        expect(gameData.icons).toBeUndefined();
        const warned = entries.filter(
          (entry) => entry.msg === 'could not download the list of Pokémon icons',
        );
        expect(warned).toHaveLength(1);
        expect(warned[0]).toMatchObject({ level: 40, kept: 0 });
        // The game data was saved all the same.
        const saved = JSON.parse(await readFile(cachePath, 'utf8')) as { icons?: string[] };
        expect(saved.icons).toBeUndefined();
      }
    });

    it('keeps the last list, in use and in the saved copy, when a later download fails', async () => {
      await service(withIcons).gameData.load();
      now += 25 * HOUR;
      respond = (url) =>
        url === ICONS_URL
          ? Promise.reject(new Error('getaddrinfo ENOTFOUND'))
          : Promise.resolve(ok(url === GAME_MASTER_URL ? gameMaster : english));
      const { gameData, entries } = service(withIcons);
      await gameData.load();
      expect(gameData.fetchedAt).toBe(now);
      expect(gameData.icons?.size).toBe(3);
      expect(
        entries.find((entry) => entry.msg === 'could not download the list of Pokémon icons'),
      ).toMatchObject({ kept: 3 });
      const saved = JSON.parse(await readFile(cachePath, 'utf8')) as {
        fetchedAt: number;
        icons: string[];
      };
      expect(saved.fetchedAt).toBe(now);
      expect(saved.icons).toHaveLength(3);
    });

    it('takes a newer list on refresh, also when the game data itself could not be refreshed', async () => {
      const { gameData } = service(withIcons);
      await gameData.load();
      respond = (url) =>
        url === ICONS_URL
          ? Promise.resolve(ok(JSON.stringify({ tree: [{ path: 'pm1.icon.png' }] })))
          : Promise.resolve(ok('rubbish'));
      expect(await gameData.refresh()).toBe(false);
      expect(gameData.catalogue.byKey('venusaur')).toBeDefined();
      expect(gameData.icons?.names()).toEqual(['pm1.icon.png']);
    });

    describe('with the megas’ portraits', () => {
      const withBoth = { iconsUrl: ICONS_URL, megaPortraitsUrl: PORTRAITS_URL };
      const portraits = ['pm150.fMEGA_X.portrait.png', 'pm687.fMEGA.portrait.png'];

      it('downloads them with the icons, keeps them in the same list and saves them', async () => {
        const { gameData, entries } = service(withBoth);
        await gameData.load();
        expect(requests).toContain(PORTRAITS_URL);
        expect(gameData.icons?.portraits().names()).toEqual(portraits);
        expect(gameData.icons?.iconsOnly().size).toBe(3);
        expect(
          entries.filter((entry) => entry.msg === 'the list of mega portraits was downloaded'),
        ).toMatchObject([{ level: 30, portraits: 2 }]);
        const again = service(withBoth);
        requests = [];
        await again.gameData.load();
        expect(requests).toEqual([]);
        expect(again.gameData.icons?.portraits().names()).toEqual(portraits);
      });

      it('keeps the last portraits when their listing fails, and takes the new icons', async () => {
        await service(withBoth).gameData.load();
        now += 25 * HOUR;
        respond = (url) =>
          url === PORTRAITS_URL
            ? Promise.reject(new Error('getaddrinfo ENOTFOUND'))
            : Promise.resolve(
                ok(
                  url === GAME_MASTER_URL
                    ? gameMaster
                    : url === ICONS_URL
                      ? JSON.stringify({ tree: [{ path: 'pm1.icon.png' }] })
                      : english,
                ),
              );
        const { gameData, entries } = service(withBoth);
        await gameData.load();
        expect(gameData.icons?.iconsOnly().names()).toEqual(['pm1.icon.png']);
        expect(gameData.icons?.portraits().names()).toEqual(portraits);
        expect(
          entries.find((entry) => entry.msg === 'could not download the list of mega portraits'),
        ).toMatchObject({ level: 40, kept: 2 });
      });

      it('asks for them at once beside a fresh saved copy that has none', async () => {
        // A copy saved before the portraits were read (the staging of 2026-10-23).
        await service({ iconsUrl: ICONS_URL }).gameData.load();
        requests = [];
        const { gameData } = service(withBoth);
        await gameData.load();
        await gameData.whenIdle();
        expect(requests.sort()).toEqual([ICONS_URL, PORTRAITS_URL].sort());
        expect(gameData.icons?.portraits().names()).toEqual(portraits);
        const saved = JSON.parse(await readFile(cachePath, 'utf8')) as { icons: string[] };
        expect(saved.icons).toEqual(expect.arrayContaining(portraits));
      });

      it('keeps the last icons when theirs fails, and takes the new portraits', async () => {
        await service(withBoth).gameData.load();
        now += 25 * HOUR;
        respond = (url) =>
          url === ICONS_URL
            ? Promise.reject(new Error('getaddrinfo ENOTFOUND'))
            : Promise.resolve(
                ok(
                  url === GAME_MASTER_URL
                    ? gameMaster
                    : url === PORTRAITS_URL
                      ? JSON.stringify({ tree: [{ path: 'pm6.fMEGA_X.portrait.png' }] })
                      : english,
                ),
              );
        const { gameData } = service(withBoth);
        await gameData.load();
        expect(gameData.icons?.iconsOnly().size).toBe(3);
        expect(gameData.icons?.portraits().names()).toEqual(['pm6.fMEGA_X.portrait.png']);
      });
    });

    it('is not asked for where no address is configured', async () => {
      const { gameData } = service();
      await gameData.load();
      expect(requests).toHaveLength(2);
      expect(gameData.icons).toBeUndefined();
      requests = [];
      const again = service();
      await again.gameData.load();
      await again.gameData.whenIdle();
      expect(requests).toEqual([]);
    });

    it('is fetched alone, on the side, when a fresh saved copy has none', async () => {
      // A copy saved before the list existed, or while it could not be downloaded.
      await service().gameData.load();
      const before = JSON.parse(await readFile(cachePath, 'utf8')) as { fetchedAt: number };
      requests = [];
      now += HOUR;
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      respond = async (url) => {
        await gate;
        return ok(url === ICONS_URL ? iconListing : 'rubbish');
      };
      const later = service(withIcons);
      // The bot starts from the saved copy without waiting for the list.
      await later.gameData.load();
      expect(later.gameData.catalogue.byKey('venusaur')).toBeDefined();
      expect(later.gameData.icons).toBeUndefined();
      release();
      await later.gameData.whenIdle();
      // The game master was not fetched for it.
      expect(requests).toEqual([ICONS_URL]);
      expect(later.gameData.icons?.size).toBe(3);
      // The saved copy has the list now, and is as old as it was.
      const saved = JSON.parse(await readFile(cachePath, 'utf8')) as {
        fetchedAt: number;
        icons: string[];
        data: { pokemon: unknown[] };
      };
      expect(saved.icons).toHaveLength(3);
      expect(saved.fetchedAt).toBe(before.fetchedAt);
      expect(saved.data.pokemon.length).toBeGreaterThan(0);
      expect(later.gameData.fetchedAt).toBe(before.fetchedAt);
      requests = [];
      const third = service(withIcons);
      await third.gameData.load();
      await third.gameData.whenIdle();
      expect(requests).toEqual([]);
      expect(third.gameData.icons?.size).toBe(3);
    });

    it('never lets a listing that was cut short take names away: both lists are kept', async () => {
      const { gameData, entries } = service(withIcons);
      await gameData.load();
      expect(gameData.icons?.size).toBe(3);
      respond = (url) =>
        Promise.resolve(
          ok(
            url === ICONS_URL
              ? JSON.stringify({
                  truncated: true,
                  tree: [{ path: 'pm1.icon.png' }, { path: 'pm147.icon.png' }],
                })
              : url === GAME_MASTER_URL
                ? gameMaster
                : english,
          ),
        );
      expect(await gameData.refresh()).toBe(true);
      expect(gameData.icons?.names()).toEqual([
        'pm1.icon.png',
        'pm147.icon.png',
        'pm19.fALOLA.icon.png',
        'pm201.fUNOWN_F.icon.png',
      ]);
      expect(entries.some((entry) => entry.msg === 'the list of Pokémon icons was cut short')).toBe(
        true,
      );
      const saved = JSON.parse(await readFile(cachePath, 'utf8')) as { icons: string[] };
      expect(saved.icons).toHaveLength(4);
    });

    it('says so when the listing was cut short, and uses what it has', async () => {
      respond = (url) =>
        Promise.resolve(
          ok(
            url === ICONS_URL
              ? JSON.stringify({ truncated: true, tree: [{ path: 'pm1.icon.png' }] })
              : url === GAME_MASTER_URL
                ? gameMaster
                : english,
          ),
        );
      const { gameData, entries } = service(withIcons);
      await gameData.load();
      expect(gameData.icons?.size).toBe(1);
      expect(entries.some((entry) => entry.msg === 'the list of Pokémon icons was cut short')).toBe(
        true,
      );
    });
  });

  it('has no catalogue before it is loaded', () => {
    expect(() => service().gameData.catalogue).toThrow(/not been loaded/);
  });

  it('downloads, parses and saves the data on first start', async () => {
    const { gameData } = service();
    await gameData.load();
    expect(gameData.catalogue.byKey('venusaur')?.name).toBe('Venusaur');
    expect(gameData.fetchedAt).toBe(now);
    expect(requests.sort()).toEqual([TEXT_URL, GAME_MASTER_URL].sort());
    const saved = JSON.parse(await readFile(cachePath, 'utf8')) as { fetchedAt: number };
    expect(saved.fetchedAt).toBe(now);
  });

  it('starts from a fresh saved copy without downloading', async () => {
    await service().gameData.load();
    requests = [];
    now += 23 * HOUR;
    const { gameData } = service();
    await gameData.load();
    expect(requests).toEqual([]);
    expect(gameData.catalogue.byKey('mewtwo_a')?.name).toBe('Armored Mewtwo');
  });

  it('downloads again once the saved copy is too old', async () => {
    await service().gameData.load();
    requests = [];
    now += 25 * HOUR;
    const { gameData } = service();
    await gameData.load();
    expect(requests).toHaveLength(2);
    expect(gameData.fetchedAt).toBe(now);
  });

  it('starts from an out-of-date copy when the download fails, and says so', async () => {
    await service().gameData.load();
    const firstFetch = now;
    now += 48 * HOUR;
    respond = () => Promise.reject(new Error('getaddrinfo ENOTFOUND'));
    const { gameData, entries } = service();
    await gameData.load();
    expect(gameData.catalogue.byKey('venusaur')).toBeDefined();
    expect(gameData.fetchedAt).toBe(firstFetch);
    expect(entries.some((e) => e.level === 40 && e.msg === 'could not refresh the game data')).toBe(
      true,
    );
    expect(entries.some((e) => e.level === 40 && String(e.msg).includes('out of date'))).toBe(true);
    expect(entries.some((e) => String(e.msg).includes('retry in 30 minutes'))).toBe(true);
  });

  it('fails to start only when there is no download and no saved copy', async () => {
    respond = () => Promise.resolve(textAnswer(503));
    await expect(service().gameData.load()).rejects.toThrow(
      /Could not download the game data \(https:\/\/example\.test\/\S+ answered 503\) and there is no saved copy at .*game-data-cache\.json/,
    );
  });

  it('leaves where a redirect goes to fetchOnItsHost', async () => {
    const answered = respond;
    const redirects: unknown[] = [];
    respond = (url, init) => {
      redirects.push(init.redirect);
      return answered(url, init);
    };
    await service().gameData.load();
    expect(redirects).toEqual(['manual', 'manual']);
  });

  it('gives up a download longer than any it should be', async () => {
    const tooLong = { 'content-length': String(MAX_DOWNLOAD_BYTES + 1) };
    respond = () => Promise.resolve(textAnswer(200, '', tooLong));
    await expect(service().gameData.load()).rejects.toThrow(/sent more than \d+ bytes/);
  });

  it('keeps the data in use when a refresh returns rubbish', async () => {
    const { gameData } = service();
    await gameData.load();
    const before = gameData.catalogue;
    const savedBefore = await readFile(cachePath, 'utf8');
    for (const body of ['<html>rate limited</html>', '[]', '{"message":"Not Found"}']) {
      respond = (url) => Promise.resolve(ok(url === GAME_MASTER_URL ? body : english));
      expect(await gameData.refresh()).toBe(false);
    }
    expect(gameData.catalogue).toBe(before);
    expect(await readFile(cachePath, 'utf8')).toBe(savedBefore);
  });

  it('refuses a text file that is not the game text, beside a good game master', async () => {
    const { gameData } = service();
    await gameData.load();
    const before = gameData.catalogue;
    const savedBefore = await readFile(cachePath, 'utf8');
    for (const body of ['<html>rate limited</html>', '', '{"message":"Not Found"}']) {
      respond = (url) => Promise.resolve(ok(url === GAME_MASTER_URL ? gameMaster : body));
      expect(await gameData.refresh()).toBe(false);
    }
    expect(gameData.catalogue).toBe(before);
    expect(await readFile(cachePath, 'utf8')).toBe(savedBefore);
  });

  it('gives up on a download that stalls and starts from the saved copy', async () => {
    await service().gameData.load();
    now += 48 * HOUR;
    respond = stalls();
    const timeouts = fakeTimeoutSignals();
    const { gameData, entries } = service({ timeoutMs: 20 });
    const loading = gameData.load();
    await timeouts.made.reached(1);
    timeouts.expire();
    await loading;
    expect(gameData.catalogue.byKey('venusaur')).toBeDefined();
    expect(entries.some((e) => e.level === 40 && e.msg === 'could not refresh the game data')).toBe(
      true,
    );
  });

  it('fails to start when a download stalls and there is no saved copy', async () => {
    respond = stalls();
    const timeouts = fakeTimeoutSignals();
    const loading = service({ timeoutMs: 20 }).gameData.load();
    await timeouts.made.reached(1);
    timeouts.expire();
    await expect(loading).rejects.toThrow(
      /Could not download the game data \(https:\/\/example\.test\/\S+: timed out after 20 ms\) and there is no saved copy/,
    );
  });

  it('names the address and the underlying cause when a download fails at the network', async () => {
    respond = () =>
      Promise.reject(
        new TypeError('fetch failed', {
          cause: new Error('getaddrinfo ENOTFOUND example.test'),
        }),
      );
    const { gameData, entries } = service();
    const failure = await gameData.load().then(
      () => undefined,
      (err: unknown) => err as Error,
    );
    expect(failure?.message).toMatch(
      /https:\/\/example\.test\/\S+: getaddrinfo ENOTFOUND example\.test/,
    );
    expect(failure?.message).not.toContain('fetch failed');
    const logged = entries.find((e) => e.msg === 'could not refresh the game data');
    expect(JSON.stringify(logged)).toContain('ENOTFOUND');
  });

  it('names the first underlying error when the cause is an empty AggregateError', async () => {
    respond = () =>
      Promise.reject(
        new TypeError('fetch failed', {
          cause: new AggregateError([new Error('connect ECONNREFUSED 127.0.0.1:443')], ''),
        }),
      );
    const failure = await service()
      .gameData.load()
      .then(
        () => undefined,
        (err: unknown) => err as Error,
      );
    expect(failure?.message).toMatch(
      /https:\/\/example\.test\/\S+: connect ECONNREFUSED 127\.0\.0\.1:443/,
    );
  });

  it('uses the cause code when the cause has no message', async () => {
    respond = () =>
      Promise.reject(
        new TypeError('fetch failed', {
          cause: Object.assign(new Error(''), { code: 'ECONNRESET' }),
        }),
      );
    const failure = await service()
      .gameData.load()
      .then(
        () => undefined,
        (err: unknown) => err as Error,
      );
    expect(failure?.message).toMatch(/: ECONNRESET/);
  });

  it('refuses data with far fewer species than the data in use', async () => {
    const { gameData, entries } = service();
    await gameData.load();
    const before = gameData.catalogue;
    const savedBefore = await readFile(cachePath, 'utf8');
    const species = before.all.filter((p) => p.kind === 'species').length;
    const keep = new Set(['VENUSAUR', 'CHARIZARD', 'RATTATA']);
    const items = (
      readGameMasterSample() as Array<{ templateId: string; data: Record<string, unknown> }>
    ).filter((item) => {
      const settings = item.data['pokemonSettings'] as { pokemonId?: string } | undefined;
      return !settings?.pokemonId || keep.has(settings.pokemonId);
    });
    respond = (url) =>
      Promise.resolve(ok(url === GAME_MASTER_URL ? JSON.stringify(items) : english));
    now += HOUR;
    expect(await gameData.refresh()).toBe(false);
    expect(gameData.catalogue).toBe(before);
    expect(await readFile(cachePath, 'utf8')).toBe(savedBefore);
    const logged = JSON.stringify(entries.find((e) => e.msg === 'could not refresh the game data'));
    expect(logged).toContain(`3 species`);
    expect(logged).toContain(`${species}`);
  });

  it('refuses data in which fewer than half the species have an English name', async () => {
    respond = (url) =>
      Promise.resolve(
        ok(
          url === GAME_MASTER_URL
            ? gameMaster
            : 'RESOURCE ID: pokemon_name_0001\nTEXT: Bulbasaur\n',
        ),
      );
    const { gameData, entries } = service();
    expect(await gameData.refresh()).toBe(false);
    expect(() => gameData.catalogue).toThrow(/not been loaded/);
    expect(
      entries.some(
        (e) =>
          e.msg === 'could not refresh the game data' && JSON.stringify(e).includes('English name'),
      ),
    ).toBe(true);
    // Data that is wrong needs a person: an error, unlike a network away (plan 8X-H).
    expect(entries.find((e) => e.msg === 'could not refresh the game data')?.level).toBe(50);
    await expect(rm(cachePath)).rejects.toThrow();
  });

  it('accepts a normal refresh with the same data', async () => {
    const { gameData } = service();
    await gameData.load();
    now += HOUR;
    expect(await gameData.refresh()).toBe(true);
  });

  it('shares one download between overlapping refreshes', async () => {
    const { gameData } = service();
    const results = await Promise.all([gameData.refresh(), gameData.refresh()]);
    expect(results).toEqual([true, true]);
    expect(requests).toHaveLength(2);
  });

  it('switches to newer data on refresh', async () => {
    const { gameData } = service();
    await gameData.load();
    const before = gameData.catalogue;
    now += HOUR;
    expect(await gameData.refresh()).toBe(true);
    expect(gameData.catalogue).not.toBe(before);
    expect(gameData.fetchedAt).toBe(now);
  });

  it('ignores a saved copy it cannot read or that has another version', async () => {
    await service().gameData.load();
    for (const content of ['not json', JSON.stringify({ version: 0, fetchedAt: now, data: {} })]) {
      await writeFile(cachePath, content);
      requests = [];
      const { gameData } = service();
      await gameData.load();
      expect(requests).toHaveLength(2);
      expect(gameData.catalogue.byKey('venusaur')).toBeDefined();
    }
  });

  it('ignores a saved copy that lacks parts', async () => {
    await service().gameData.load();
    const saved = JSON.parse(await readFile(cachePath, 'utf8')) as {
      version: number;
      fetchedAt: number;
      data: Record<string, unknown>;
    };
    const { moves: _moves, ...withoutMoves } = saved.data;
    const { aliases: _aliases, ...withoutAliases } = saved.data;
    for (const data of [withoutMoves, withoutAliases]) {
      await writeFile(cachePath, JSON.stringify({ ...saved, data }));
      requests = [];
      const { gameData } = service();
      await gameData.load();
      expect(requests).toHaveLength(2);
      expect(gameData.catalogue.byKey('venusaur')).toBeDefined();
    }
  });

  it('downloads when the saved copy is dated in the future, and uses it only if that fails', async () => {
    await service().gameData.load();
    const saved = JSON.parse(await readFile(cachePath, 'utf8')) as { fetchedAt: number };
    await writeFile(cachePath, JSON.stringify({ ...saved, fetchedAt: now + HOUR }));
    requests = [];
    const online = service().gameData;
    await online.load();
    expect(requests).toHaveLength(2);
    expect(online.fetchedAt).toBe(now);

    await writeFile(cachePath, JSON.stringify({ ...saved, fetchedAt: now + HOUR }));
    respond = () => Promise.reject(new Error('offline'));
    const { gameData, entries } = service();
    await gameData.load();
    expect(gameData.catalogue.byKey('venusaur')).toBeDefined();
    expect(gameData.fetchedAt).toBe(now + HOUR);
    expect(entries.some((e) => String(e.msg).includes('out of date'))).toBe(true);
  });

  it('still works when the copy cannot be saved', async () => {
    cachePath = path.join(dir, 'file.txt', 'game-data-cache.json');
    await writeFile(path.join(dir, 'file.txt'), 'a file where a directory is needed');
    const { gameData, entries } = service();
    await gameData.load();
    expect(gameData.catalogue.byKey('venusaur')).toBeDefined();
    expect(entries.some((e) => e.msg === 'could not save the game data')).toBe(true);
  });

  it('removes its temporary file when the copy cannot be moved into place', async () => {
    // A non-empty directory where the cache file should be: the temporary file can be written, the rename cannot.
    await mkdir(cachePath, { recursive: true });
    await writeFile(path.join(cachePath, 'occupied'), 'x');
    const { gameData, entries } = service();
    await gameData.load();
    expect(gameData.catalogue.byKey('venusaur')).toBeDefined();
    expect(entries.some((e) => e.msg === 'could not save the game data')).toBe(true);
    const left = (await readdir(path.dirname(cachePath))).filter((name) => name.endsWith('.tmp'));
    expect(left).toEqual([]);
  });

  it('logs what the parser had to drop and still starts', async () => {
    const items = structuredClone(readGameMasterSample()) as { templateId: string }[];
    const reduced = items.filter((item) => item.templateId !== 'V0214_MOVE_VINE_WHIP_FAST');
    expect(reduced).toHaveLength(items.length - 1);
    respond = (url) =>
      Promise.resolve(ok(url === GAME_MASTER_URL ? JSON.stringify(reduced) : english));
    const { gameData, entries } = service();
    await gameData.load();
    expect(gameData.catalogue.byKey('venusaur')).toBeDefined();
    expect(
      entries.some(
        (e) => e.msg === 'game data warning' && String(e.detail).includes('VINE_WHIP_FAST'),
      ),
    ).toBe(true);
  });

  describe('automatic refresh', () => {
    const RETRY = 30 * 60_000;

    function fakeClock(at = now) {
      vi.useFakeTimers();
      vi.setSystemTime(at);
      clock = () => Date.now();
    }

    /** Lets a running refresh finish (its cache write uses real file I/O) and the scheduler react to it. */
    async function settle(gameData: GameDataService) {
      await gameData.whenIdle();
      await vi.advanceTimersByTimeAsync(0);
    }

    async function expectCleanSave(entries: Array<Record<string, unknown>>) {
      expect(entries.filter((e) => e.msg === 'could not save the game data')).toEqual([]);
      const left = (await readdir(path.dirname(cachePath))).filter((name) => name.endsWith('.tmp'));
      expect(left).toEqual([]);
    }

    it('waits until the data is a full period old, then downloads once', async () => {
      fakeClock();
      const { gameData, entries } = service();
      await gameData.load();
      requests = [];
      gameData.startAutoRefresh();
      await vi.advanceTimersByTimeAsync(24 * HOUR - 1);
      expect(requests).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(2);
      await settle(gameData);
      await vi.advanceTimersByTimeAsync(24 * HOUR - 1);
      expect(requests).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(4);
      gameData.stop();
      await settle(gameData);
      await expectCleanSave(entries);
    });

    it('counts from when the saved copy was downloaded, not from the start', async () => {
      await service().gameData.load();
      fakeClock(now + 23 * HOUR);
      requests = [];
      const { gameData } = service();
      await gameData.load();
      expect(requests).toEqual([]);
      gameData.startAutoRefresh();
      await vi.advanceTimersByTimeAsync(HOUR - 1);
      expect(requests).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(2);
      gameData.stop();
      await settle(gameData);
    });

    it('retries soon after a stale start, then returns to the normal period', async () => {
      await service().gameData.load();
      fakeClock(now + 48 * HOUR);
      respond = () => Promise.reject(new Error('offline'));
      const { gameData } = service();
      await gameData.load();
      gameData.startAutoRefresh();
      requests = [];
      await vi.advanceTimersByTimeAsync(RETRY - 1);
      expect(requests).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(2);
      // still failing: another retry, not a full period
      await vi.advanceTimersByTimeAsync(RETRY);
      expect(requests).toHaveLength(4);
      respond = (url) => Promise.resolve(ok(url === GAME_MASTER_URL ? gameMaster : english));
      await vi.advanceTimersByTimeAsync(RETRY);
      expect(requests).toHaveLength(6);
      await settle(gameData);
      await vi.advanceTimersByTimeAsync(24 * HOUR - 1);
      expect(requests).toHaveLength(6);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(8);
      gameData.stop();
      await settle(gameData);
    });

    it('catches up at once after a failed refresh, and only then (plan 8X-H)', async () => {
      await service().gameData.load();
      fakeClock(now + 48 * HOUR);
      respond = () => Promise.reject(new Error('offline'));
      const { gameData } = service();
      await gameData.load();
      gameData.startAutoRefresh();
      requests = [];
      respond = (url) => Promise.resolve(ok(url === GAME_MASTER_URL ? gameMaster : english));
      // Back: at once, not at the retry half an hour on.
      expect(await gameData.catchUp()).toBe('done');
      expect(requests).toHaveLength(2);
      await settle(gameData);
      expect(await gameData.catchUp()).toBe('not-owed');
      expect(requests).toHaveLength(2);
      // The next refresh a full period on.
      await vi.advanceTimersByTimeAsync(24 * HOUR - 1);
      expect(requests).toHaveLength(2);
      gameData.stop();
    });

    it('asks for the list of icons alone, after the retry period, when its download failed', async () => {
      fakeClock();
      const failing: FetchText = (url) =>
        url === ICONS_URL
          ? Promise.reject(new Error('getaddrinfo ENOTFOUND'))
          : Promise.resolve(ok(url === GAME_MASTER_URL ? gameMaster : english));
      respond = failing;
      const { gameData, entries } = service({ iconsUrl: ICONS_URL });
      await gameData.load();
      expect(gameData.icons).toBeUndefined();
      requests = [];
      gameData.startAutoRefresh();
      await vi.advanceTimersByTimeAsync(RETRY - 1);
      expect(requests).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      // The list alone: the game data is fresh.
      expect(requests).toEqual([ICONS_URL]);
      await settle(gameData);
      // Still failing: again a retry period later.
      await vi.advanceTimersByTimeAsync(RETRY);
      expect(requests).toEqual([ICONS_URL, ICONS_URL]);
      await settle(gameData);
      respond = (url) =>
        Promise.resolve(
          ok(url === GAME_MASTER_URL ? gameMaster : url === ICONS_URL ? iconListing : english),
        );
      await vi.advanceTimersByTimeAsync(RETRY);
      expect(requests).toEqual([ICONS_URL, ICONS_URL, ICONS_URL]);
      await settle(gameData);
      expect(gameData.icons?.size).toBe(3);
      const saved = JSON.parse(await readFile(cachePath, 'utf8')) as { icons: string[] };
      expect(saved.icons).toHaveLength(3);
      // From then on nothing until the game data is a full period old.
      await vi.advanceTimersByTimeAsync(24 * HOUR - 3 * RETRY - 1);
      expect(requests).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(6);
      gameData.stop();
      await settle(gameData);
      await expectCleanSave(entries);
    });

    it('asks again for a list that a fresh saved copy lacks and that could not be fetched at the start', async () => {
      await service().gameData.load();
      fakeClock(now + HOUR);
      respond = () => Promise.reject(new Error('offline'));
      requests = [];
      const { gameData } = service({ iconsUrl: ICONS_URL });
      await gameData.load();
      gameData.startAutoRefresh();
      await settle(gameData);
      expect(requests).toEqual([ICONS_URL]);
      respond = (url) => Promise.resolve(ok(url === ICONS_URL ? iconListing : 'rubbish'));
      await vi.advanceTimersByTimeAsync(RETRY);
      await settle(gameData);
      expect(requests).toEqual([ICONS_URL, ICONS_URL]);
      expect(gameData.icons?.size).toBe(3);
      gameData.stop();
      await settle(gameData);
    });

    it('downloads nothing more once stopped', async () => {
      fakeClock();
      const { gameData } = service();
      await gameData.load();
      requests = [];
      gameData.startAutoRefresh();
      gameData.stop();
      await vi.advanceTimersByTimeAsync(72 * HOUR);
      expect(requests).toEqual([]);
    });

    it('schedules nothing after a refresh that was running when it was stopped', async () => {
      fakeClock();
      const { gameData, entries } = service();
      await gameData.load();
      requests = [];
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      respond = async (url) => {
        await gate;
        return ok(url === GAME_MASTER_URL ? gameMaster : english);
      };
      gameData.startAutoRefresh();
      await vi.advanceTimersByTimeAsync(24 * HOUR);
      expect(requests).toHaveLength(2);
      gameData.stop();
      release();
      await settle(gameData);
      await vi.advanceTimersByTimeAsync(72 * HOUR);
      expect(requests).toHaveLength(2);
      await expectCleanSave(entries);
    });

    it('keeps one timer however often it is started', async () => {
      fakeClock();
      const { gameData, entries } = service();
      await gameData.load();
      requests = [];
      gameData.startAutoRefresh();
      gameData.startAutoRefresh();
      await vi.advanceTimersByTimeAsync(24 * HOUR);
      expect(requests).toHaveLength(2);
      await settle(gameData);
      await vi.advanceTimersByTimeAsync(24 * HOUR);
      expect(requests).toHaveLength(4);
      gameData.stop();
      await settle(gameData);
      await expectCleanSave(entries);
    });

    it('keeps refreshing when the logger throws while reporting a failed refresh', async () => {
      fakeClock();
      const { gameData, log } = service();
      await gameData.load();
      requests = [];
      vi.spyOn(log, 'info').mockImplementationOnce(() => {
        throw new Error('logger broke');
      });
      vi.spyOn(log, 'error').mockImplementationOnce(() => {
        throw new Error('logger broke again');
      });
      gameData.startAutoRefresh();
      await vi.advanceTimersByTimeAsync(24 * HOUR);
      expect(requests).toHaveLength(2);
      await settle(gameData);
      await vi.advanceTimersByTimeAsync(RETRY);
      expect(requests).toHaveLength(4);
      gameData.stop();
      await settle(gameData);
    });

    it('logs a refresh that fails unexpectedly and tries again after the retry period', async () => {
      fakeClock();
      const { gameData, entries, log } = service();
      await gameData.load();
      requests = [];
      // Logging the success is the last thing a refresh does before saving; if that throws, refresh() rejects.
      vi.spyOn(log, 'info').mockImplementationOnce(() => {
        throw new Error('logger broke');
      });
      gameData.startAutoRefresh();
      await vi.advanceTimersByTimeAsync(24 * HOUR);
      expect(requests).toHaveLength(2);
      await settle(gameData);
      expect(
        entries.some((e) => e.level === 50 && e.msg === 'game data refresh failed unexpectedly'),
      ).toBe(true);
      await vi.advanceTimersByTimeAsync(RETRY - 1);
      expect(requests).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(4);
      gameData.stop();
      await settle(gameData);
    });
  });
});
