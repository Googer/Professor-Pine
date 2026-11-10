import { describe, expect, it } from 'vitest';
import { watchEachTest } from '../../test/support/timers.js';
import { gameDataFixture } from '../../test/support/game-data.js';
import { MemoryNicknames } from '../../test/support/nicknames.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import { PokemonSearchService } from './pokemon-search-service.js';

function service(stored: Record<string, string[]> = {}) {
  const nicknames = new MemoryNicknames(stored);
  const gameData = { catalogue: new PokemonCatalogue(gameDataFixture()) };
  const { log, entries } = createTestLogger();
  const search = new PokemonSearchService(gameData, nicknames, log);
  // `stored` is replaced by a test that changes the rows behind the back of the service.
  const state = {
    get reads() {
      return nicknames.reads;
    },
    set failing(value: boolean) {
      nicknames.failing = value;
    },
    set stored(value: Record<string, string[]>) {
      nicknames.rows.clear();
      for (const [key, list] of Object.entries(value)) nicknames.rows.set(key, list);
    },
  };
  return { search, gameData, state, nicknames, entries };
}

const first = (search: PokemonSearchService, text: string) => search.search(text)[0]?.key;
const background = watchEachTest();

describe('PokemonSearchService', () => {
  it('knows names and the curated nicknames before the database was read', () => {
    const { search, state } = service({ dratini: ['danger noodle'] });
    expect(first(search, 'giratina origin')).toBe('giratina_origin');
    expect(first(search, 'ttar')).toBe('tyranitar');
    expect(first(search, 'danger noodle')).toBeUndefined();
    expect(state.reads).toBe(0);
  });

  it('adds the moderators’ nicknames once they are read', async () => {
    const { search } = service({
      dratini: ['danger noodle'],
      giratina: ['tina'],
      ex: ['exclusive'],
    });
    await search.reloadNicknames();
    expect(first(search, 'danger noodle')).toBe('dratini');
    expect(first(search, 'tina')).toBe('giratina_altered');
    expect(first(search, 'noodle')).toBe('dratini');
    expect(first(search, 'ttar')).toBe('tyranitar');
  });

  it('takes up added and removed nicknames on the next read', async () => {
    const { search, state } = service({ dratini: ['danger noodle'] });
    await search.reloadNicknames();
    state.stored = { magikarp: ['splashy'] };
    expect(first(search, 'splashy')).toBeUndefined();
    await search.reloadNicknames();
    expect(first(search, 'splashy')).toBe('magikarp');
    expect(first(search, 'danger noodle')).toBeUndefined();
  });

  it('keeps the nicknames it has when reading fails', async () => {
    const { search, state } = service({ dratini: ['danger noodle'] });
    await search.reloadNicknames();
    state.failing = true;
    await expect(search.reloadNicknames()).rejects.toThrow('database is down');
    expect(first(search, 'danger noodle')).toBe('dratini');
  });

  it('knows a stored nickname as an exact text only once it is read', async () => {
    const { search } = service({ dratini: ['danger noodle'] });
    expect(search.exact('danger noodle')).toBeUndefined();
    expect(search.exact('ttar')?.key).toBe('tyranitar');
    await search.reloadNicknames();
    expect(search.exact('danger noodle')?.key).toBe('dratini');
  });

  it('passes the options on', () => {
    const { search } = service();
    expect(search.search('charizard', { limit: 1 }).map((entry) => entry.key)).toEqual([
      'charizard',
    ]);
    expect(search.search('charizard', { filter: (entry) => entry.kind === 'mega' })).toHaveLength(
      2,
    );
  });

  it('follows the game data when it is refreshed', async () => {
    const { search, gameData } = service({ dratini: ['danger noodle'] });
    await search.reloadNicknames();
    expect(first(search, 'mewtwo')).toBe('mewtwo');
    const data = gameDataFixture();
    gameData.catalogue = new PokemonCatalogue({
      ...data,
      pokemon: data.pokemon.map((entry) =>
        entry.key === 'mewtwo' ? { ...entry, name: 'Renamed Clone' } : entry,
      ),
    });
    expect(first(search, 'renamed clone')).toBe('mewtwo');
    // Results are entries of the catalogue in use, and the nicknames are still known.
    expect(search.search('renamed clone')[0]).toBe(gameData.catalogue.byKey('mewtwo'));
    expect(first(search, 'danger noodle')).toBe('dratini');
  });

  it('follows the game data when asked for an exact text', () => {
    const { search, gameData } = service();
    expect(search.exact('renamed clone')).toBeUndefined();
    const data = gameDataFixture();
    gameData.catalogue = new PokemonCatalogue({
      ...data,
      pokemon: data.pokemon.map((entry) =>
        entry.key === 'mewtwo' ? { ...entry, name: 'Renamed Clone' } : entry,
      ),
    });
    expect(search.exact('renamed clone')).toBe(gameData.catalogue.byKey('mewtwo'));
  });

  it('builds its index once per catalogue', () => {
    const { search, gameData } = service();
    const before = search.search('mewtwo')[0];
    expect(search.search('mewtwo')[0]).toBe(before);
    expect(before).toBe(gameData.catalogue.byKey('mewtwo'));
  });

  describe('nicknames staff add and remove', () => {
    const entry = (search: PokemonSearchService, key: string) => {
      const found = search.exact(key);
      if (!found) throw new Error(key);
      return found;
    };

    it('adds a nickname tidied, finds the Pokémon by it at once and lists it', async () => {
      const { search, nicknames } = service({ dratini: ['danger noodle'] });
      await search.reloadNicknames();
      const dratini = entry(search, 'dratini');
      expect(await search.add(dratini, '  Noodle   Boi ')).toEqual({
        kind: 'added',
        nickname: 'noodle boi',
        nicknames: ['danger noodle', 'noodle boi'],
      });
      expect(nicknames.rows.get('dratini')).toEqual(['danger noodle', 'noodle boi']);
      expect(search.exact('noodle boi')?.key).toBe('dratini');
      expect(search.stored().get('dratini')).toEqual(['danger noodle', 'noodle boi']);
    });

    it('refuses what is no nickname without writing', async () => {
      const { search, nicknames } = service();
      const dratini = entry(search, 'dratini');
      expect(await search.add(dratini, 'a')).toEqual({ kind: 'refused', problem: 'length' });
      expect(await search.add(dratini, 'a,b')).toEqual({ kind: 'refused', problem: 'characters' });
      expect(nicknames.rows.size).toBe(0);
    });

    it('refuses a name, an id or a nickname of another Pokémon, naming it', async () => {
      const { search } = service({ magikarp: ['splashy'] });
      await search.reloadNicknames();
      const dratini = entry(search, 'dratini');
      const taken = async (text: string) => {
        const result = await search.add(dratini, text);
        return result.kind === 'taken' ? result.by.map((one) => one.key) : result.kind;
      };
      expect(await taken('Mewtwo')).toEqual(['mewtwo']);
      expect(await taken('ttar')).toEqual(['tyranitar']);
      expect(await taken('splashy')).toEqual(['magikarp']);
      expect(await taken('giratina')).toEqual(['giratina_altered']);
      expect(await taken('ho oh')).toEqual(['ho_oh']);
    });

    it('says when the text already finds that Pokémon', async () => {
      const { search, nicknames } = service({ dratini: ['danger noodle'] });
      await search.reloadNicknames();
      const dratini = entry(search, 'dratini');
      expect(await search.add(dratini, 'Dratini')).toEqual({
        kind: 'already',
        nickname: 'dratini',
      });
      expect(await search.add(dratini, 'danger noodle')).toMatchObject({ kind: 'already' });
      expect(nicknames.rows.get('dratini')).toEqual(['danger noodle']);
    });

    it('says when the nicknames would not fit the stored string', async () => {
      const { search } = service({ dratini: ['x'.repeat(250)] });
      await search.reloadNicknames();
      expect(await search.add(entry(search, 'dratini'), 'wiggle')).toEqual({
        kind: 'full',
        nickname: 'wiggle',
      });
    });

    it('removes a stored nickname and stops finding the Pokémon by it', async () => {
      const { search, nicknames } = service({ dratini: ['danger noodle', 'wiggle'] });
      await search.reloadNicknames();
      const dratini = entry(search, 'dratini');
      expect(await search.remove(dratini, 'Danger Noodle')).toBe(true);
      expect(nicknames.rows.get('dratini')).toEqual(['wiggle']);
      expect(search.exact('danger noodle')).toBeUndefined();
      expect(await search.remove(dratini, 'danger noodle')).toBe(false);
      expect(await search.remove(dratini, 'ttar')).toBe(false);
    });

    it('keeps a write that stood when only the read after it fails', async () => {
      const { search, nicknames, entries } = service();
      await search.reloadNicknames();
      nicknames.failing = true;
      const dratini = entry(search, 'dratini');
      expect(await search.add(dratini, 'wiggle')).toMatchObject({ kind: 'added' });
      expect(search.exact('wiggle')?.key).toBe('dratini');
      expect(
        entries.filter((e) => e['msg'] === 'could not read the Pokémon nicknames again'),
      ).toHaveLength(1);
      expect(await search.remove(dratini, 'wiggle')).toBe(true);
      expect(search.exact('wiggle')).toBeUndefined();
    });

    it('keeps every row of the Pokémon when only the read after a write fails', async () => {
      const { search, nicknames } = service({ deoxys: ['dna'], deoxys_normal: ['alien'] });
      await search.reloadNicknames();
      const deoxys = entry(search, 'deoxys');
      nicknames.failing = true;
      expect(await search.add(deoxys, 'space bug')).toMatchObject({ kind: 'added' });
      expect([...(search.stored().get(deoxys.key) ?? [])].sort()).toEqual([
        'alien',
        'dna',
        'space bug',
      ]);
      expect(await search.remove(deoxys, 'Alien')).toBe(true);
      expect(nicknames.rows.get('deoxys_normal')).toEqual([]);
      expect([...(search.stored().get(deoxys.key) ?? [])].sort()).toEqual(['dna', 'space bug']);
    });

    it('removes a nickname from every row that holds the Pokémon', async () => {
      const { search, nicknames } = service({ deoxys: ['dna'], deoxys_normal: ['DNA', 'alien'] });
      await search.reloadNicknames();
      expect(await search.remove(entry(search, 'deoxys'), 'dna')).toBe(true);
      expect(nicknames.rows.get('deoxys')).toEqual([]);
      expect(nicknames.rows.get('deoxys_normal')).toEqual(['alien']);
      expect(search.exact('dna')).toBeUndefined();
    });

    it('applies overlapping reads in the order they were asked for', async () => {
      const { search, nicknames } = service();
      const release = nicknames.holdRead();
      const slow = search.reloadNicknames();
      const added = search.add(entry(search, 'dratini'), 'wiggle');
      const fast = search.reloadNicknames();
      // Nothing after the held read has run.
      await background.settle();
      expect(nicknames.rows.size).toBe(0);
      release();
      await Promise.all([slow, added, fast]);
      expect(search.exact('wiggle')?.key).toBe('dratini');
      expect(nicknames.reads).toBe(3);
    });

    it('goes on after a read that failed', async () => {
      const { search, nicknames } = service({ dratini: ['wiggle'] });
      nicknames.failing = true;
      await expect(search.reloadNicknames()).rejects.toThrow('database is down');
      nicknames.failing = false;
      await search.reloadNicknames();
      expect(search.exact('wiggle')?.key).toBe('dratini');
    });

    it('knows the curated nicknames of an entry', () => {
      const { search } = service();
      expect(search.curated('tyranitar')).toContain('ttar');
      expect(search.curated('toString')).toEqual([]);
      expect(search.curated('dratini')).toEqual(['noodle']);
    });
  });
});
