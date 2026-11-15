import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import { planOf, scanned, type PlanRow } from '../../../test/support/query-plan.js';
import type { DB } from '../types.js';
import { PokemonNicknameRepository } from './pokemon-nickname-repository.js';

const PITTSBURGH = '412345678901234567';
const NEIGHBOR = '412345678901234568';
const FAR = '412345678901234569';

describe('PokemonNicknameRepository (plan 19B-4)', () => {
  let stop: () => Promise<void>;
  let database: TestDatabase;
  let db: Kysely<DB>;
  let nicknames: PokemonNicknameRepository;

  beforeAll(async () => {
    ({ database, db, stop } = await startMigratedDatabase());
    nicknames = new PokemonNicknameRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('PokemonNickname').execute();
  });

  it('reads the nicknames of the servers asked for, by server and Pokémon', async () => {
    await nicknames.addNickname(PITTSBURGH, 'dratini', 'danger noodle');
    await nicknames.addNickname(PITTSBURGH, 'dratini', 'wiggle');
    await nicknames.addNickname(PITTSBURGH, 'magikarp', 'splashy');
    await nicknames.addNickname(NEIGHBOR, 'dratini', 'noodle');
    await nicknames.addNickname(FAR, 'pikachu', 'pika');
    expect(await nicknames.nicknamesOf([PITTSBURGH, NEIGHBOR])).toEqual(
      new Map([
        [
          PITTSBURGH,
          new Map([
            ['dratini', ['danger noodle', 'wiggle']],
            ['magikarp', ['splashy']],
          ]),
        ],
        [NEIGHBOR, new Map([['dratini', ['noodle']]])],
      ]),
    );
    expect(await nicknames.nicknamesOf([])).toEqual(new Map());
  });

  it('adds a nickname once, and removes it from its server alone', async () => {
    await nicknames.addNickname(PITTSBURGH, 'dratini', 'noodle');
    await nicknames.addNickname(PITTSBURGH, 'dratini', 'noodle');
    await nicknames.addNickname(NEIGHBOR, 'dratini', 'noodle');
    expect(await nicknames.removeNickname(PITTSBURGH, 'dratini', 'noodle')).toBe(true);
    expect(await nicknames.removeNickname(PITTSBURGH, 'dratini', 'noodle')).toBe(false);
    expect(await nicknames.nicknamesOf([PITTSBURGH, NEIGHBOR])).toEqual(
      new Map([[NEIGHBOR, new Map([['dratini', ['noodle']]])]]),
    );
  });

  it('tells nicknames apart as the code does: an accent is another nickname', async () => {
    await nicknames.addNickname(PITTSBURGH, 'flabebe', 'flabébé');
    await nicknames.addNickname(PITTSBURGH, 'flabebe', 'flabebe');
    expect(await nicknames.nicknamesOf([PITTSBURGH])).toEqual(
      new Map([[PITTSBURGH, new Map([['flabebe', ['flabebe', 'flabébé']]])]]),
    );
  });

  describe('its reads, among many servers’ nicknames', () => {
    /** Each server's: 2,000 nicknames of 200 servers, so that the optimizer chooses as it would. */
    const SEEDED_SERVERS = 200;
    const seededServer = (n: number) => String(500_000_000_000_000_000n + BigInt(n));

    beforeEach(async () => {
      const rows = Array.from({ length: 2_000 }, (_, n) => ({
        serverId: seededServer(n % SEEDED_SERVERS),
        pokemonKey: `pokemon_${String(n % 50)}`,
        nickname: `nick ${String(n)}`,
      }));
      await db.insertInto('PokemonNickname').values(rows).execute();
      await sql`analyze table PokemonNickname`.execute(db);
    });

    it('reads a server’s nicknames through the primary key, not the whole table', async () => {
      const plan = await planOf(database, (seen) =>
        new PokemonNicknameRepository(seen).nicknamesOf([PITTSBURGH, NEIGHBOR]),
      );
      expect(plan.map((row) => row.key)).toEqual(['PRIMARY']);
      expect(scanned(plan)).toEqual([]);
    });

    it('reads one server’s (a server first asked about) by the key, in its order', async () => {
      const plan = await planOf(database, (seen) =>
        new PokemonNicknameRepository(seen).nicknamesOf([seededServer(7)]),
      );
      expect(plan.map((row) => row.key)).toEqual(['PRIMARY']);
      expect(unkeyed(plan)).toEqual([]);
      expect(plan.map((row) => row.Extra ?? '').join(' ')).not.toContain('Using filesort');
    });
  });
});

/** The tables of a plan not found by a key (`ref` or `range`), as `Table:type`. */
function unkeyed(plan: readonly PlanRow[]): string[] {
  return plan.flatMap((row) =>
    row.table === null || row.table.startsWith('<') || ['ref', 'range'].includes(row.type ?? '')
      ? []
      : [`${row.table}:${String(row.type)}`],
  );
}
