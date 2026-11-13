import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import { plansOf, scanned, type PlanRow } from '../../../test/support/query-plan.js';
import { boxTarget } from '../../domain/notify/target-wants.js';
import { pokemonTarget } from '../../domain/pogo/notification-target.js';
import { formAsStored } from '../../domain/pogo/wants.js';
import type { DB } from '../types.js';
import { GymNotificationRepository } from './gym-notification-repository.js';
import { NewTrainRepository } from './new-train-repository.js';
import { PokemonNotificationRepository } from './pokemon-notification-repository.js';
import { TargetWantRepository } from './target-want-repository.js';
import { WantCountRepository } from './want-count-repository.js';

const HERE = '100000000000000001';
const THERE = '100000000000000002';
const ASH = '200000000000000001';
const MISTY = '200000000000000002';
const BROCK = '200000000000000003';

describe('WantCountRepository (plan 8H-3)', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let database: TestDatabase;
  let counts: WantCountRepository;
  let wants: PokemonNotificationRepository;
  let targets: TargetWantRepository;
  let gyms: GymNotificationRepository;
  let trains: NewTrainRepository;

  beforeAll(async () => {
    ({ db, stop, database } = await startMigratedDatabase());
    counts = new WantCountRepository(db, formAsStored);
    wants = new PokemonNotificationRepository(db, formAsStored);
    targets = new TargetWantRepository(db);
    gyms = new GymNotificationRepository(db);
    trains = new NewTrainRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    for (const table of [
      'PokemonNotification',
      'TargetWant',
      'GymNotification',
      'NewTrainNotification',
      'WantCountDay',
    ] as const) {
      await db.deleteFrom(table).execute();
    }
  });

  it('counts the members of each thing wanted in each server, of every kind of want', async () => {
    await wants.set(ASH, HERE, pokemonTarget(25), 'raid');
    await wants.set(MISTY, HERE, pokemonTarget(25), 'raid', true);
    await wants.set(BROCK, HERE, pokemonTarget(25), 'both');
    await wants.set(ASH, HERE, { kind: 'tier', tier: { level: 'T5', shadow: false } }, 'raid');
    await wants.set(ASH, THERE, pokemonTarget(25), 'raid');
    await targets.change(
      ASH,
      HERE,
      { add: [boxTarget('research-pokemon', 147), boxTarget('research-pokemon', 25)], remove: [] },
      1,
    );
    await targets.change(
      MISTY,
      HERE,
      { add: [{ kind: 'rocket', who: 'grunt:water' }], remove: [] },
      1,
    );
    await gyms.add(ASH, HERE, 7);
    await gyms.add(MISTY, HERE, 7);
    await trains.set(BROCK, HERE, true, 1);
    expect(await counts.countNow([HERE, THERE])).toEqual(
      new Map([
        [
          HERE,
          new Map([
            ['pokemon:25@raid', 2],
            ['pokemon:25@both', 1],
            ['tier:T5', 1],
            ['research:pokemon:147', 1],
            ['research:pokemon:25', 1],
            ['grunt:water', 1],
            ['gym:7', 2],
            ['trains', 1],
            // Ash wants Pikachu in raids and from research: one member of the species.
            ['species:25', 3],
            ['species:147', 1],
          ]),
        ],
        [
          THERE,
          new Map([
            ['pokemon:25@raid', 1],
            ['species:25', 1],
          ]),
        ],
      ]),
    );
  });

  it('reads a member’s legacy duplicates as one want, and skips rows it cannot read', async () => {
    await wants.set(ASH, HERE, pokemonTarget(25), 'raid');
    const row = await db
      .selectFrom('PokemonNotification')
      .select(['guildId', 'userId'])
      .executeTakeFirstOrThrow();
    await db
      .insertInto('PokemonNotification')
      .values([
        { ...row, pokemon: 25, type: 'Spawn' },
        { ...row, pokemon: 0, type: 'raid' },
      ])
      .execute();
    await db
      .insertInto('TargetWant')
      .values({
        guildId: row.guildId ?? 0,
        userId: row.userId ?? 0,
        target: 'balloon',
        createdAt: '1',
      })
      .execute();
    await db
      .insertInto('GymNotification')
      .values({ ...row, gym: 'not a gym' })
      .execute();
    expect(await counts.countNow([HERE, THERE])).toEqual(
      new Map([
        [
          HERE,
          new Map([
            ['pokemon:25@both', 1],
            ['species:25', 1],
          ]),
        ],
      ]),
    );
  });

  it('counts only the wants the notifier could act on: none of a member row without a snowflake (review 8H3-1)', async () => {
    await wants.set(ASH, HERE, pokemonTarget(25), 'raid');
    const row = await db
      .selectFrom('PokemonNotification')
      .select('guildId')
      .executeTakeFirstOrThrow();
    const nobody = await db
      .insertInto('User')
      .values({ userSnowflake: null })
      .executeTakeFirstOrThrow();
    const userId = Number(nobody.insertId);
    const guildId = row.guildId ?? 0;
    await db
      .insertInto('PokemonNotification')
      .values({ guildId, userId, pokemon: 25, type: 'raid' })
      .execute();
    await db
      .insertInto('TargetWant')
      .values({ guildId, userId, target: 'research:pokemon:147', createdAt: '1' })
      .execute();
    await db.insertInto('GymNotification').values({ guildId, userId, gym: '7' }).execute();
    expect(await counts.countNow([HERE, THERE])).toEqual(
      new Map([
        [
          HERE,
          new Map([
            ['pokemon:25@raid', 1],
            ['species:25', 1],
          ]),
        ],
      ]),
    );
  });

  it('reads the wants of the servers it is given alone (the index audit of 2026-11-13, X12)', async () => {
    await wants.set(ASH, HERE, pokemonTarget(25), 'raid');
    await wants.set(ASH, THERE, pokemonTarget(150), 'raid');
    await targets.change(
      ASH,
      HERE,
      { add: [{ kind: 'rocket', who: 'grunt:water' }], remove: [] },
      1,
    );
    await gyms.add(MISTY, HERE, 7);
    await trains.set(BROCK, HERE, true, 1);
    await trains.set(BROCK, THERE, true, 1);
    expect(await counts.countNow([THERE])).toEqual(
      new Map([
        [
          THERE,
          new Map([
            ['pokemon:150@raid', 1],
            ['trains', 1],
            ['species:150', 1],
          ]),
        ],
      ]),
    );
    expect(await counts.countNow([])).toEqual(new Map());
    expect((await counts.servers()).filter((id) => [HERE, THERE].includes(id)).sort()).toEqual([
      HERE,
      THERE,
    ]);
  });

  it('finds the servers asked for by their snowflakes and their wants by keys that begin with the server', async () => {
    // Thirty servers and 1,000 members: 6,000 wants of Pokémon, 3,000 targets, 3,000 gyms and
    // 1,000 new-train notices, spread evenly; one server's count is read.
    const servers = Array.from(
      { length: 30 },
      (_, n) => `41234567890123${String(n).padStart(4, '0')}`,
    );
    await db
      .insertInto('Guild')
      .values(servers.map((snowflake) => ({ snowflake })))
      .execute();
    await db
      .insertInto('User')
      .values(
        Array.from({ length: 1_000 }, (_, n) => ({
          userSnowflake: `71234567890123${String(n).padStart(4, '0')}`,
        })),
      )
      .execute();
    const guildIds = (
      await db.selectFrom('Guild').select('id').where('snowflake', 'in', servers).execute()
    ).map((row) => row.id);
    const userIds = (
      await db
        .selectFrom('User')
        .select('id')
        .where('userSnowflake', 'like', '71234567890123%')
        .execute()
    ).map((row) => row.id);
    const guild = (n: number) => guildIds[n % guildIds.length] ?? 0;
    const user = (n: number) => userIds[n % userIds.length] ?? 0;
    const rows = <T>(count: number, row: (n: number) => T): T[] =>
      Array.from({ length: count }, (_, n) => row(n));
    await db
      .insertInto('PokemonNotification')
      .values(rows(6_000, (n) => ({ guildId: guild(n), userId: user(n), pokemon: (n % 300) + 1 })))
      .execute();
    await db
      .insertInto('TargetWant')
      .values(
        rows(3_000, (n) => ({
          guildId: guild(n),
          userId: user(n),
          target: `research:pokemon:${String(n)}`,
          createdAt: '1',
        })),
      )
      .execute();
    await db
      .insertInto('GymNotification')
      .values(rows(3_000, (n) => ({ guildId: guild(n), userId: user(n), gym: String(n) })))
      .execute();
    await db
      .insertInto('NewTrainNotification')
      .values(
        rows(1_000, (n) => ({
          guildId: guild(n),
          memberId: `71234567890123${String(n).padStart(4, '0')}`,
          createdAt: '1',
        })),
      )
      .execute();
    await sql`analyze table Guild, User, PokemonNotification, TargetWant, GymNotification,
                            NewTrainNotification`.execute(db);

    const one = servers[7] ?? '';
    const [pokemon, wanted, gymTargets, newTrains, ...more] = await plansOf(database, (seen) =>
      new WantCountRepository(seen, formAsStored).countNow([one]),
    );
    expect(more).toEqual([]);
    const keys = (plan: readonly PlanRow[] | undefined): Record<string, string | null> =>
      Object.fromEntries((plan ?? []).map((row) => [String(row.table), row.key]));
    expect(keys(pokemon)).toEqual({
      g: 'guild_snowflake_unique',
      n: 'notification_guildid_foreign',
      u: 'PRIMARY',
    });
    // The targets by the key of `TargetWant` that begins with the server and the member.
    expect(keys(wanted)).toEqual({
      g: 'guild_snowflake_unique',
      w: 'targetwant_member_unique',
      u: 'PRIMARY',
    });
    expect(keys(gymTargets)).toEqual({
      g: 'guild_snowflake_unique',
      n: 'gymnotification_guildid_foreign',
      u: 'PRIMARY',
    });
    expect(keys(newTrains)).toEqual({ g: 'guild_snowflake_unique', n: 'PRIMARY' });
    for (const plan of [pokemon, wanted, gymTargets, newTrains]) {
      expect(scanned(plan ?? [])).toEqual([]);
      // The server looked up by its snowflake, never every server's row read along the key
      // (`index`), each with its wants.
      expect(['const', 'range']).toContain(plan?.find((row) => row.table === 'g')?.type);
    }
  });

  it('writes a server’s day all or nothing, so that a day cut short is counted again (review P2)', async () => {
    // More rows than one insert takes, the last of them a key the column cannot hold.
    const many = new Map(
      Array.from({ length: 2_000 }, (_unused, n): [string, number] => [`gym:${String(n)}`, 1]),
    );
    many.set(`gym:${'9'.repeat(200)}`, 1);
    await expect(counts.write(HERE, '2026-11-03', many)).rejects.toThrow();
    expect(await counts.serversCounted('2026-11-03')).toEqual(new Set());
    expect(await counts.countsOf(HERE, '2026-11-03')).toEqual(new Map());
  });

  it('writes a server’s counts of a day once: a second write of that day changes nothing', async () => {
    expect(await counts.serversCounted('2026-11-03')).toEqual(new Set());
    await counts.write(
      HERE,
      '2026-11-03',
      new Map([
        ['trains', 2],
        ['gym:7', 1],
      ]),
    );
    await counts.write(
      HERE,
      '2026-11-03',
      new Map([
        ['trains', 5],
        ['tier:T5', 1],
      ]),
    );
    await counts.write(THERE, '2026-11-04', new Map([['trains', 1]]));
    expect(await counts.countsOf(HERE, '2026-11-03')).toEqual(
      new Map([
        ['gym:7', 1],
        ['tier:T5', 1],
        ['trains', 2],
      ]),
    );
    expect(await counts.serversCounted('2026-11-03')).toEqual(new Set([HERE]));
    expect(await counts.serversCounted('2026-11-04')).toEqual(new Set([THERE]));
    // No member anywhere: the table has none to hold.
    const columns = await sql<{ name: string }>`
      select column_name as name from information_schema.columns
      where table_schema = database() and table_name = 'WantCountDay'`.execute(db);
    expect(columns.rows.map((column) => column.name).sort()).toEqual(
      ['count', 'day', 'serverId', 'target'].sort(),
    );
  });
});
