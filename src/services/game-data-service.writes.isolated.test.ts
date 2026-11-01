import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readEnglishSample, readGameMasterSample } from '../../test/support/game-data.js';
import { textAnswer } from '../../test/support/responses.js';
import { Tally } from '../../test/support/tally.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { watchImmediates } from '../../test/support/timers.js';
import { GameDataService, type FetchText } from './game-data-service.js';

/**
 * The writes of a copy (each begins with its folder, `mkdir`) and their moves into its place: a
 * test holds the first move back.
 */
const moves = vi.hoisted(() => ({
  /** While set, the next move waits for it (and takes it away: only that one waits). */
  gate: undefined as Promise<void> | undefined,
  /** Told of every move that begins. */
  onBegin: undefined as (() => void) | undefined,
  writes: 0,
  done: 0,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    mkdir: (...args: Parameters<typeof actual.mkdir>) => {
      moves.writes += 1;
      return actual.mkdir(...args);
    },
    rename: async (from: string, to: string): Promise<void> => {
      const gate = moves.gate;
      moves.gate = undefined;
      moves.onBegin?.();
      await gate;
      await actual.rename(from, to);
      moves.done += 1;
    },
  };
});

const GAME_MASTER_URL = 'https://example.test/latest.json';
const TEXT_URL = 'https://example.test/English.txt';
const ICONS_URL = 'https://example.test/trees/icons';
const HOUR = 3_600_000;
const gameMaster = JSON.stringify(readGameMasterSample());
const english = `RESOURCE ID: pokemon_name_0001\nTEXT: Bulbasaur\n${readEnglishSample()}`;
const iconListing = JSON.stringify({ truncated: false, tree: [{ path: 'pm147.icon.png' }] });

const fetch: FetchText = (url) =>
  Promise.resolve(
    textAnswer(
      200,
      url === GAME_MASTER_URL ? gameMaster : url === ICONS_URL ? iconListing : english,
    ),
  );

describe('GameDataService: the two writers of the saved copy', () => {
  let dir: string;
  let cachePath: string;
  let begun: Tally;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pine-game-data-writes-'));
    cachePath = path.join(dir, 'game-data-cache.json');
    moves.gate = undefined;
    begun = new Tally('the moves begun');
    moves.onBegin = () => {
      begun.add();
    };
    moves.writes = 0;
    moves.done = 0;
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('never overlap: the copy of a refresh is not overwritten by an older one with the list of icons', async () => {
    let now = Date.UTC(2026, 9, 10, 12);
    const options = {
      gameMasterUrl: GAME_MASTER_URL,
      textUrl: TEXT_URL,
      cachePath,
      maxAgeMs: 24 * HOUR,
      fetch,
      log: createTestLogger().log,
      now: () => now,
    };
    // A fresh saved copy without a list of icons.
    await new GameDataService(options).load();
    const first = now;
    expect(moves.done).toBe(1);

    // Started from it, the list is fetched alone and the copy written again with it: that
    // write is held back just before the copy is moved into its place.
    now += HOUR;
    let release: () => void = () => undefined;
    moves.gate = new Promise((resolve) => {
      release = resolve;
    });
    const gameData = new GameDataService({ ...options, iconsUrl: ICONS_URL });
    await gameData.load();
    await begun.reached(2);
    expect(moves.writes).toBe(2);

    // A refresh of the game data meanwhile has a newer copy to write. Everything it does up to
    // that write answers in memory: once that is done, its write waits behind the held one and
    // has not even begun. (A write that overtook would have begun, with its folder, by then.)
    const immediates = watchImmediates();
    now += HOUR;
    const refreshing = gameData.refresh();
    try {
      await immediates.settle();
    } finally {
      immediates.restore();
    }
    expect(moves.writes).toBe(2);
    expect(moves.done).toBe(1);
    release();
    expect(await refreshing).toBe(true);
    await gameData.whenIdle();

    // The newest copy is the one that stands, with the list of icons.
    const saved = JSON.parse(await readFile(cachePath, 'utf8')) as {
      fetchedAt: number;
      icons?: string[];
    };
    expect(saved.fetchedAt).toBe(now);
    expect(saved.fetchedAt).not.toBe(first);
    expect(saved.icons).toEqual(['pm147.icon.png']);
    expect(moves.done).toBe(3);
  });
});
