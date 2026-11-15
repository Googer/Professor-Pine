import { describe, expect, it } from 'vitest';
import { watchEachTest } from '../../test/support/timers.js';
import { gameDataFixture } from '../../test/support/game-data.js';
import { MemoryNicknames, type StoredNicknames } from '../../test/support/nicknames.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import type { PokemonEntry } from '../domain/pogo/game-master.js';
import { PokemonSearchService } from './pokemon-search-service.js';

/** Two servers, each with nicknames of its own (plan 19B-4). */
const A = '412345678901234567';
const B = '412345678901234568';

function service(stored: StoredNicknames = {}, options: { findersKept?: number } = {}) {
  const nicknames = new MemoryNicknames(stored);
  const gameData = { catalogue: new PokemonCatalogue(gameDataFixture()) };
  const { log, entries } = createTestLogger();
  const search = new PokemonSearchService(gameData, nicknames, log, options);
  return { search, gameData, nicknames, entries };
}

/**
 * The catalogue, counting its reads of every entry (`all`): each index built over it reads them
 * (the first also for the feeds' names, kept by catalogue), a search of a name it has does not.
 */
class ReadCounting extends PokemonCatalogue {
  reads = 0;

  override get all(): readonly PokemonEntry[] {
    this.reads += 1;
    return super.all;
  }
}

const first = (search: PokemonSearchService, server: string | null, text: string) =>
  search.of(server).search(text)[0]?.key;
const background = watchEachTest();

describe('PokemonSearchService', () => {
  it('knows names and the curated nicknames before the database was read', () => {
    const { search, nicknames } = service({ [A]: { dratini: ['danger noodle'] } });
    expect(first(search, null, 'giratina origin')).toBe('giratina_origin');
    expect(first(search, null, 'ttar')).toBe('tyranitar');
    expect(first(search, null, 'danger noodle')).toBeUndefined();
    expect(nicknames.reads).toBe(0);
  });

  it('finds by a server’s nicknames in that server alone, and by none in a DM', async () => {
    const { search } = service({
      [A]: { dratini: ['danger noodle'], giratina: ['tina'], ex: ['exclusive'] },
      [B]: { magikarp: ['splashy'] },
    });
    await search.load([A, B]);
    expect(first(search, A, 'danger noodle')).toBe('dratini');
    expect(first(search, A, 'tina')).toBe('giratina_altered');
    expect(first(search, A, 'ttar')).toBe('tyranitar');
    expect(first(search, B, 'danger noodle')).toBeUndefined();
    expect(first(search, B, 'splashy')).toBe('magikarp');
    expect(first(search, A, 'splashy')).toBeUndefined();
    expect(search.of(null).exact('danger noodle')).toBeUndefined();
    expect(search.of(undefined).exact('splashy')).toBeUndefined();
    // The curated ones are every server's.
    expect(first(search, B, 'ttar')).toBe('tyranitar');
  });

  it('reads the nicknames of the servers it is given in one read', async () => {
    const { search, nicknames } = service({ [A]: { dratini: ['danger noodle'] } });
    await search.load([A, B]);
    expect(nicknames.asked).toEqual([[A, B]]);
    expect(search.of(A).exact('danger noodle')?.key).toBe('dratini');
    // A server read once is not read again when it is asked about.
    search.of(B).exact('splashy');
    await background.settle();
    expect(nicknames.reads).toBe(1);
  });

  it('reads a server it was not given at the first ask, in the background', async () => {
    const { search, nicknames } = service({ [B]: { magikarp: ['splashy'] } });
    await search.load([A]);
    // Until its read is back, the instance's names alone.
    expect(search.of(B).exact('splashy')).toBeUndefined();
    await search.flush();
    expect(nicknames.asked).toEqual([[A], [B]]);
    expect(search.of(B).exact('splashy')?.key).toBe('magikarp');
  });

  it('asks again, at the next ask, for a server whose read failed', async () => {
    const { search, nicknames, entries } = service({ [B]: { magikarp: ['splashy'] } });
    nicknames.failing = true;
    search.of(B).exact('splashy');
    await search.flush();
    expect(
      entries.filter((e) => e['msg'] === 'could not read a server’s Pokémon nicknames'),
    ).toHaveLength(1);
    nicknames.failing = false;
    search.of(B).exact('splashy');
    await search.flush();
    expect(search.of(B).exact('splashy')?.key).toBe('magikarp');
  });

  it('passes the options on', () => {
    const { search } = service();
    expect(
      search
        .of(A)
        .search('charizard', { limit: 1 })
        .map((entry) => entry.key),
    ).toEqual(['charizard']);
    expect(
      search.of(A).search('charizard', { filter: (entry) => entry.kind === 'mega' }),
    ).toHaveLength(2);
  });

  it('follows the game data when it is refreshed', async () => {
    const { search, gameData } = service({ [A]: { dratini: ['danger noodle'] } });
    await search.load([A]);
    const finder = search.of(A);
    expect(finder.search('mewtwo')[0]?.key).toBe('mewtwo');
    const data = gameDataFixture();
    gameData.catalogue = new PokemonCatalogue({
      ...data,
      pokemon: data.pokemon.map((entry) =>
        entry.key === 'mewtwo' ? { ...entry, name: 'Renamed Clone' } : entry,
      ),
    });
    // A finder handed out before follows it too.
    expect(finder.search('renamed clone')[0]).toBe(gameData.catalogue.byKey('mewtwo'));
    expect(finder.exact('danger noodle')?.key).toBe('dratini');
    expect(search.of(null).exact('renamed clone')).toBe(gameData.catalogue.byKey('mewtwo'));
  });

  it('keeps a bounded number of servers’ indexes, and builds one let go again as it was', async () => {
    const { search } = service(
      { [A]: { dratini: ['danger noodle'] }, [B]: { magikarp: ['splashy'] } },
      { findersKept: 1 },
    );
    await search.load([A, B]);
    expect(search.of(A).exact('danger noodle')?.key).toBe('dratini');
    // B's index takes the place of A's; A's is built again with A's nicknames, not B's.
    expect(search.of(B).exact('splashy')?.key).toBe('magikarp');
    expect(search.of(A).exact('danger noodle')?.key).toBe('dratini');
    expect(search.of(A).exact('splashy')).toBeUndefined();
  });

  it('searches a server without nicknames of its own with the instance’s index', async () => {
    const { search, gameData } = service(
      { [A]: { dratini: ['danger noodle'] } },
      { findersKept: 1 },
    );
    const counted = new ReadCounting(gameDataFixture());
    gameData.catalogue = counted;
    await search.load([A, B]);
    // The instance's index and A's, built.
    expect(search.of(null).exact('mewtwo')?.key).toBe('mewtwo');
    expect(search.of(A).exact('danger noodle')?.key).toBe('dratini');
    const built = counted.reads;
    // B has none: it takes neither an index of its own nor A's place among those kept.
    for (const server of [B, B, null]) {
      expect(search.of(server).exact('mewtwo')?.key).toBe('mewtwo');
    }
    expect(search.of(A).exact('danger noodle')?.key).toBe('dratini');
    expect(counted.reads).toBe(built);
    // And A's nicknames are not B's (a text no index has reads the catalogue whole: asked last).
    expect(search.of(B).exact('danger noodle')).toBeUndefined();
  });

  describe('nicknames a server’s staff add and remove', () => {
    const entry = (search: PokemonSearchService, key: string) => {
      const found = search.of(null).exact(key);
      if (!found) throw new Error(key);
      return found;
    };

    it('adds a nickname tidied to its server, finds the Pokémon by it there at once and lists it', async () => {
      const { search, nicknames } = service({ [A]: { dratini: ['danger noodle'] } });
      await search.load([A, B]);
      const dratini = entry(search, 'dratini');
      expect(await search.add(A, dratini, '  Noodle   Boi ')).toEqual({
        kind: 'added',
        nickname: 'noodle boi',
        nicknames: ['danger noodle', 'noodle boi'],
      });
      expect(nicknames.rows.get(A)?.get('dratini')).toEqual(['danger noodle', 'noodle boi']);
      expect(search.of(A).exact('noodle boi')?.key).toBe('dratini');
      expect(search.stored(A).get('dratini')).toEqual(['danger noodle', 'noodle boi']);
      // Another server's staff did not add it.
      expect(search.of(B).exact('noodle boi')).toBeUndefined();
      expect(search.stored(B).get('dratini')).toBeUndefined();
    });

    it('lets two servers give one nickname to different Pokémon', async () => {
      const { search } = service({ [B]: { magikarp: ['splashy'] } });
      await search.load([A, B]);
      expect(await search.add(A, entry(search, 'dratini'), 'splashy')).toMatchObject({
        kind: 'added',
      });
      expect(search.of(A).exact('splashy')?.key).toBe('dratini');
      expect(search.of(B).exact('splashy')?.key).toBe('magikarp');
    });

    it('adds to a server it has not read yet, with that server’s own nicknames read first', async () => {
      const { search } = service({ [B]: { magikarp: ['splashy'] } });
      const taken = await search.add(B, entry(search, 'dratini'), 'splashy');
      expect(taken).toMatchObject({ kind: 'taken' });
    });

    it('refuses what is no nickname without writing', async () => {
      const { search, nicknames } = service();
      const dratini = entry(search, 'dratini');
      expect(await search.add(A, dratini, 'a')).toEqual({ kind: 'refused', problem: 'length' });
      expect(await search.add(A, dratini, 'a,b')).toEqual({
        kind: 'refused',
        problem: 'characters',
      });
      expect(nicknames.rows.size).toBe(0);
    });

    it('refuses a name, an id or a nickname of another Pokémon in its server, naming it', async () => {
      const { search } = service({ [A]: { magikarp: ['splashy'] } });
      await search.load([A]);
      const dratini = entry(search, 'dratini');
      const taken = async (text: string) => {
        const result = await search.add(A, dratini, text);
        return result.kind === 'taken' ? result.by.map((one) => one.key) : result.kind;
      };
      expect(await taken('Mewtwo')).toEqual(['mewtwo']);
      expect(await taken('ttar')).toEqual(['tyranitar']);
      expect(await taken('splashy')).toEqual(['magikarp']);
      expect(await taken('giratina')).toEqual(['giratina_altered']);
      expect(await taken('ho oh')).toEqual(['ho_oh']);
    });

    it('says when the text already finds that Pokémon', async () => {
      const { search, nicknames } = service({ [A]: { dratini: ['danger noodle'] } });
      await search.load([A]);
      const dratini = entry(search, 'dratini');
      expect(await search.add(A, dratini, 'Dratini')).toEqual({
        kind: 'already',
        nickname: 'dratini',
      });
      expect(await search.add(A, dratini, 'danger noodle')).toMatchObject({ kind: 'already' });
      expect(nicknames.rows.get(A)?.get('dratini')).toEqual(['danger noodle']);
    });

    it('says when a Pokémon’s nicknames would pass what one holds', async () => {
      const { search } = service({ [A]: { dratini: ['x'.repeat(250)] } });
      await search.load([A]);
      expect(await search.add(A, entry(search, 'dratini'), 'wiggle')).toEqual({
        kind: 'full',
        nickname: 'wiggle',
      });
    });

    it('removes a nickname from its server and stops finding the Pokémon by it there', async () => {
      const { search, nicknames } = service({
        [A]: { dratini: ['danger noodle', 'wiggle'] },
        [B]: { dratini: ['danger noodle'] },
      });
      await search.load([A, B]);
      const dratini = entry(search, 'dratini');
      expect(await search.remove(A, dratini, 'Danger Noodle')).toBe(true);
      expect(nicknames.rows.get(A)?.get('dratini')).toEqual(['wiggle']);
      expect(search.of(A).exact('danger noodle')).toBeUndefined();
      expect(search.of(B).exact('danger noodle')?.key).toBe('dratini');
      expect(await search.remove(A, dratini, 'danger noodle')).toBe(false);
      expect(await search.remove(A, dratini, 'ttar')).toBe(false);
    });

    it('keeps a write that stood when only the read after it fails', async () => {
      const { search, nicknames, entries } = service();
      await search.load([A]);
      nicknames.failing = true;
      const dratini = entry(search, 'dratini');
      expect(await search.add(A, dratini, 'wiggle')).toMatchObject({ kind: 'added' });
      expect(search.of(A).exact('wiggle')?.key).toBe('dratini');
      expect(
        entries.filter((e) => e['msg'] === 'could not read a server’s Pokémon nicknames again'),
      ).toHaveLength(1);
      expect(await search.remove(A, dratini, 'wiggle')).toBe(true);
      expect(search.of(A).exact('wiggle')).toBeUndefined();
    });

    it('makes its changes and reads one at a time, in the order asked for', async () => {
      const { search, nicknames } = service();
      const release = nicknames.holdRead();
      const slow = search.load([A]);
      const added = search.add(A, entry(search, 'dratini'), 'wiggle');
      // Nothing after the held read has run.
      await background.settle();
      expect(nicknames.rows.size).toBe(0);
      release();
      await Promise.all([slow, added]);
      expect(search.of(A).exact('wiggle')?.key).toBe('dratini');
    });

    it('knows the curated nicknames of an entry', () => {
      const { search } = service();
      expect(search.curated('tyranitar')).toContain('ttar');
      expect(search.curated('toString')).toEqual([]);
      expect(search.curated('dratini')).toEqual(['noodle']);
    });
  });
});
