import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { pokemonNicknames } from './2026_11_13_058_pokemon_nicknames.js';

const PITTSBURGH = '412345678901234567';
const NEIGHBOR = '412345678901234568';

describe('migration 058: Pokémon nicknames per server', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await sql`delete from PokemonNickname`.execute(db);
    await db.deleteFrom('Pokemon').execute();
    await db.deleteFrom('Guild').execute();
  });

  /** Every row of the table, in the order of its key. */
  const rows = async () =>
    (
      await sql<{ serverId: string; pokemonKey: string; nickname: string }>`
        select serverId, pokemonKey, nickname from PokemonNickname
        order by serverId, pokemonKey, nickname`.execute(db)
    ).rows;

  it('keeps a nickname per server and Pokémon, keyed by the server first', async () => {
    const columns = await sql<{ name: string; type: string; nullable: string; key: string }>`
      select column_name as name, column_type as type, is_nullable as nullable,
        column_key as \`key\`
      from information_schema.columns
      where table_schema = database() and table_name = 'PokemonNickname'
      order by ordinal_position`.execute(db);
    expect(columns.rows).toEqual([
      { name: 'serverId', type: 'varchar(20)', nullable: 'NO', key: 'PRI' },
      { name: 'pokemonKey', type: 'varchar(100)', nullable: 'NO', key: 'PRI' },
      { name: 'nickname', type: 'varchar(255)', nullable: 'NO', key: 'PRI' },
    ]);
    const key = await sql<{ name: string; position: number }>`
      select column_name as name, seq_in_index as position from information_schema.statistics
      where table_schema = database() and table_name = 'PokemonNickname'
        and index_name = 'PRIMARY'
      order by seq_in_index`.execute(db);
    expect(key.rows.map((row) => row.name)).toEqual(['serverId', 'pokemonKey', 'nickname']);
  });

  it('copies the nicknames of the legacy rows to every server recorded, by catalogue key', async () => {
    await db
      .insertInto('Pokemon')
      .values([
        { name: 'tyranitar', nickname: 'ttar, Pupitar  Dad' },
        { name: 'mr. mime', nickname: 'mime' },
        { name: 'venusaur', tier: 4 },
        { name: 'perfect', nickname: '' },
      ])
      .execute();
    await db
      .insertInto('Guild')
      .values([{ snowflake: PITTSBURGH }, { snowflake: NEIGHBOR }])
      .execute();
    await pokemonNicknames.up(db);
    const each = (serverId: string) => [
      { serverId, pokemonKey: 'mr_mime', nickname: 'mime' },
      { serverId, pokemonKey: 'tyranitar', nickname: 'pupitar dad' },
      { serverId, pokemonKey: 'tyranitar', nickname: 'ttar' },
    ];
    expect(await rows()).toEqual([...each(PITTSBURGH), ...each(NEIGHBOR)]);
    // The legacy column is left as it was, for 2.0 going back.
    const legacy = await db
      .selectFrom('Pokemon')
      .select('nickname')
      .where('name', '=', 'tyranitar')
      .executeTakeFirst();
    expect(legacy).toEqual({ nickname: 'ttar, Pupitar  Dad' });
  });

  it('copies nothing again once the table holds a nickname', async () => {
    await db.insertInto('Pokemon').values({ name: 'dratini', nickname: 'danger noodle' }).execute();
    await db.insertInto('Guild').values({ snowflake: PITTSBURGH }).execute();
    await sql`insert into PokemonNickname (serverId, pokemonKey, nickname)
              values (${NEIGHBOR}, 'magikarp', 'splashy')`.execute(db);
    await pokemonNicknames.up(db);
    expect(await rows()).toEqual([
      { serverId: NEIGHBOR, pokemonKey: 'magikarp', nickname: 'splashy' },
    ]);
  });

  it('copies nothing where no server is recorded', async () => {
    await db.insertInto('Pokemon').values({ name: 'dratini', nickname: 'danger noodle' }).execute();
    await pokemonNicknames.up(db);
    expect(await rows()).toEqual([]);
  });
});
