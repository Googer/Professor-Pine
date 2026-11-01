import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { PokemonRepository } from './pokemon-repository.js';

describe('PokemonRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let pokemon: PokemonRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    pokemon = new PokemonRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('Pokemon').execute();
  });

  it('has no nicknames in an empty table', async () => {
    expect(await pokemon.nicknames()).toEqual(new Map());
  });

  it('reads nicknames the legacy bot stored, keyed by catalogue key', async () => {
    await db
      .insertInto('Pokemon')
      .values([
        { name: 'tyranitar', nickname: 'ttar, Pupitar Dad' },
        { name: 'mr. mime', nickname: 'mime' },
        { name: 'venusaur', tier: 4 },
        { name: 'ex', nickname: 'ex, exclusive' },
        { name: 'perfect', nickname: '' },
      ])
      .execute();
    expect(await pokemon.nicknames()).toEqual(
      new Map([
        ['tyranitar', ['ttar', 'pupitar dad']],
        ['mr_mime', ['mime']],
        ['ex', ['ex', 'exclusive']],
      ]),
    );
  });

  it('adds a nickname, creating the row under the name the legacy bot uses', async () => {
    expect(await pokemon.addNickname('nidoran_female', ' Nido ')).toEqual(['nido']);
    const row = await db
      .selectFrom('Pokemon')
      .select(['name', 'nickname'])
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ name: 'nidoran♀', nickname: 'nido' });
    expect(await pokemon.nicknames()).toEqual(new Map([['nidoran_female', ['nido']]]));
  });

  it('appends to existing nicknames in the legacy format and ignores repeats', async () => {
    await db
      .insertInto('Pokemon')
      .values({ name: 'tyranitar', nickname: 'ttar', tier: 5 })
      .execute();
    expect(await pokemon.addNickname('tyranitar', 'godzilla')).toEqual(['ttar', 'godzilla']);
    expect(await pokemon.addNickname('tyranitar', 'TTAR')).toEqual(['ttar', 'godzilla']);
    const row = await db
      .selectFrom('Pokemon')
      .select(['nickname', 'tier'])
      .where('name', '=', 'tyranitar')
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ nickname: 'ttar, godzilla', tier: 5 });
  });

  it('refuses an empty nickname or one that would break the stored format', async () => {
    await expect(pokemon.addNickname('tyranitar', '   ')).rejects.toThrow(RangeError);
    await expect(pokemon.addNickname('tyranitar', 'a, b')).rejects.toThrow(RangeError);
    expect(await db.selectFrom('Pokemon').selectAll().execute()).toHaveLength(0);
  });

  it('removes a nickname and keeps the row', async () => {
    await pokemon.addNickname('tyranitar', 'ttar');
    await pokemon.addNickname('tyranitar', 'godzilla');
    expect(await pokemon.removeNickname('tyranitar', 'TTAR')).toBe(true);
    expect(await pokemon.removeNickname('tyranitar', 'ttar')).toBe(false);
    expect(await pokemon.removeNickname('venusaur', 'anything')).toBe(false);
    expect(await pokemon.nicknames()).toEqual(new Map([['tyranitar', ['godzilla']]]));
    expect(await pokemon.removeNickname('tyranitar', 'godzilla')).toBe(true);
    expect(await pokemon.nicknames()).toEqual(new Map());
    expect(await db.selectFrom('Pokemon').selectAll().execute()).toHaveLength(1);
  });

  it('merges rows that map to the same catalogue key', async () => {
    await db
      .insertInto('Pokemon')
      .values([
        { name: 'deoxys', nickname: 'dna' },
        { name: 'deoxys_normal', nickname: 'dna, alien' },
      ])
      .execute();
    expect(await pokemon.nicknames()).toEqual(new Map([['deoxys', ['dna', 'alien']]]));
  });

  it('adds to the existing deoxys_normal row and creates no second row', async () => {
    await db.insertInto('Pokemon').values({ name: 'deoxys_normal', nickname: 'dna' }).execute();
    expect(await pokemon.addNickname('deoxys', 'alien')).toEqual(['dna', 'alien']);
    const rows = await db.selectFrom('Pokemon').select(['name', 'nickname']).execute();
    expect(rows).toEqual([{ name: 'deoxys_normal', nickname: 'dna, alien' }]);
  });

  it('removes from the deoxys_normal row', async () => {
    await db
      .insertInto('Pokemon')
      .values({ name: 'deoxys_normal', nickname: 'dna, alien' })
      .execute();
    expect(await pokemon.removeNickname('deoxys', 'dna')).toBe(true);
    const row = await db.selectFrom('Pokemon').select('nickname').executeTakeFirstOrThrow();
    expect(row.nickname).toBe('alien');
  });

  it('removes a nickname from every row that holds the Pokémon, as they are read together', async () => {
    await db
      .insertInto('Pokemon')
      .values([
        { name: 'deoxys', nickname: 'dna, Space  Bug' },
        { name: 'deoxys_normal', nickname: 'DNA, alien' },
      ])
      .execute();
    expect(await pokemon.removeNickname('deoxys', ' dna ')).toBe(true);
    expect(await pokemon.removeNickname('deoxys', 'alien')).toBe(true);
    expect(await pokemon.removeNickname('deoxys', 'space bug')).toBe(true);
    const rows = await db
      .selectFrom('Pokemon')
      .select(['name', 'nickname'])
      .orderBy('id')
      .execute();
    expect(rows).toEqual([
      { name: 'deoxys', nickname: '' },
      { name: 'deoxys_normal', nickname: '' },
    ]);
    expect(await pokemon.nicknames()).toEqual(new Map());
  });

  it('adds nothing that another row of the Pokémon holds already', async () => {
    await db
      .insertInto('Pokemon')
      .values([
        { name: 'deoxys', nickname: 'second' },
        { name: 'deoxys_normal', nickname: 'first' },
      ])
      .execute();
    expect(await pokemon.addNickname('deoxys', 'First')).toEqual(['second', 'first']);
    const rows = await db.selectFrom('Pokemon').select('nickname').orderBy('id').execute();
    expect(rows).toEqual([{ nickname: 'second' }, { nickname: 'first' }]);
  });

  it('uses the lowest id when several rows could hold the Pokémon', async () => {
    await db
      .insertInto('Pokemon')
      .values([
        { name: 'deoxys', nickname: 'second' },
        { name: 'deoxys_normal', nickname: 'first' },
      ])
      .execute();
    await pokemon.addNickname('deoxys', 'more');
    const rows = await db
      .selectFrom('Pokemon')
      .select(['name', 'nickname'])
      .orderBy('id')
      .execute();
    expect(rows).toEqual([
      { name: 'deoxys', nickname: 'second, more' },
      { name: 'deoxys_normal', nickname: 'first' },
    ]);
  });

  it('creates the female Oinkologne row with the exact legacy spelling', async () => {
    await pokemon.addNickname('oinkologne_female', 'pig');
    const rows = await db.selectFrom('Pokemon').select('name').execute();
    expect(rows.map((row) => row.name)).toEqual(['OINKOLOGNE_FEMALE']);
    expect(await pokemon.nicknames()).toEqual(new Map([['oinkologne_female', ['pig']]]));
  });

  it('keeps the nicknames the legacy bot stored exactly as they are', async () => {
    await db
      .insertInto('Pokemon')
      .values({ name: 'tyranitar', nickname: 'TTar,  Big Green ,' })
      .execute();
    await pokemon.addNickname('tyranitar', 'ttar');
    const unchanged = await db.selectFrom('Pokemon').select('nickname').executeTakeFirstOrThrow();
    expect(unchanged.nickname).toBe('TTar,  Big Green ,');
    expect(await pokemon.addNickname('tyranitar', ' Godzilla ')).toEqual([
      'ttar',
      'big green',
      'godzilla',
    ]);
    const added = await db.selectFrom('Pokemon').select('nickname').executeTakeFirstOrThrow();
    expect(added.nickname).toBe('TTar, Big Green, godzilla');
    expect(await pokemon.removeNickname('tyranitar', 'ttar')).toBe(true);
    const removed = await db.selectFrom('Pokemon').select('nickname').executeTakeFirstOrThrow();
    expect(removed.nickname).toBe('Big Green, godzilla');
  });

  it('refuses an addition that would not fit the column', async () => {
    const stored = Array.from({ length: 20 }, (_, i) => `nick${String(i).padStart(5, '0')}`).join(
      ', ',
    );
    expect(stored.length).toBeLessThanOrEqual(255);
    await db.insertInto('Pokemon').values({ name: 'tyranitar', nickname: stored }).execute();
    await expect(pokemon.addNickname('tyranitar', 'x'.repeat(40))).rejects.toThrow(RangeError);
    const row = await db.selectFrom('Pokemon').select('nickname').executeTakeFirstOrThrow();
    expect(row.nickname).toBe(stored);
    await expect(pokemon.addNickname('tyranitar', 'x'.repeat(256))).rejects.toThrow(RangeError);
    await db.deleteFrom('Pokemon').execute();
    await expect(pokemon.addNickname('tyranitar', 'x'.repeat(256))).rejects.toThrow(RangeError);
    expect(await db.selectFrom('Pokemon').selectAll().execute()).toHaveLength(0);
  });

  it('keeps the two Nidoran rows apart', async () => {
    await db.insertInto('Pokemon').values({ name: 'nidoran♂', nickname: 'boy' }).execute();
    await pokemon.addNickname('nidoran_female', 'girl');
    const rows = await db
      .selectFrom('Pokemon')
      .select(['name', 'nickname'])
      .orderBy('id')
      .execute();
    expect(rows).toEqual([
      { name: 'nidoran♂', nickname: 'boy' },
      { name: 'nidoran♀', nickname: 'girl' },
    ]);
  });
});
