import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import {
  candyRowsOf,
  researchCandyWants,
  serversWithWants,
} from './2026_11_16_066_research_candy_wants.js';

describe('migration 066: Eternatus Candy wanted where Eternatus Mega Energy was', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  const guild = async (snowflake: string) =>
    Number((await db.insertInto('Guild').values({ snowflake }).executeTakeFirstOrThrow()).insertId);
  const user = async (userSnowflake: string) =>
    Number(
      (await db.insertInto('User').values({ userSnowflake }).executeTakeFirstOrThrow()).insertId,
    );
  const want = (guildId: number, userId: number, target: string, createdAt: number) =>
    db
      .insertInto('TargetWant')
      .values({ guildId, userId, target, createdAt: String(createdAt) })
      .execute();
  const rows = async () =>
    (
      await db
        .selectFrom('TargetWant')
        .select(['guildId', 'userId', 'target', 'createdAt', 'costumed'])
        .orderBy('guildId')
        .orderBy('userId')
        .orderBy('target')
        .execute()
    ).map((row) => ({ ...row, createdAt: Number(row.createdAt) }));

  it('adds a want of Eternatus Candy beside each of its Mega Energy, once, the rest untouched', async () => {
    const home = await guild('100000000000000066');
    const away = await guild('100000000000000067');
    const ash = await user('200000000000000066');
    const gary = await user('200000000000000067');
    await want(home, ash, 'research:energy:890', 1_000);
    await want(home, ash, 'research:energy:6', 1_001);
    await want(home, gary, 'research:energy:890', 1_002);
    await want(home, gary, 'research:candy:890', 1_003);
    await want(away, ash, 'research:energy:890', 1_004);
    await want(away, gary, 'research:pokemon:890', 1_005);
    const before = await rows();

    await researchCandyWants.up(db);
    const after = await rows();
    expect(after).toEqual(
      expect.arrayContaining([
        ...before,
        { guildId: home, userId: ash, target: 'research:candy:890', createdAt: 1_000, costumed: 0 },
        { guildId: away, userId: ash, target: 'research:candy:890', createdAt: 1_004, costumed: 0 },
      ]),
    );
    // Gary's own candy row stays as it was: one row, its own time.
    expect(after).toHaveLength(before.length + 2);

    await researchCandyWants.up(db);
    expect(await rows()).toEqual(after);
  });

  it('reads the wants of each server by its server and target, and the servers by the index', async () => {
    const home = await guild('100000000000000068');
    for (let n = 0; n < 40; n += 1) {
      const member = await user(String(300000000000000000n + BigInt(n)));
      await want(home, member, `research:energy:${String((n % 5) + 1)}`, n);
    }
    await sql`analyze table TargetWant`.execute(db);
    const plan = await sql<{ table: string | null; key: string | null }>`
      explain format=traditional ${candyRowsOf(home)}`.execute(db);
    expect(plan.rows.map((row) => row.key)).toEqual(['targetwant_target_index']);
    // A loose scan of a key that leads with the server: either of the two that do.
    const servers = await sql<{ key: string | null; Extra: string | null }>`
      explain format=traditional ${serversWithWants()}`.execute(db);
    expect(servers.rows).toHaveLength(1);
    expect(['targetwant_target_index', 'targetwant_member_unique']).toContain(servers.rows[0]?.key);
    expect(servers.rows[0]?.Extra).toContain('Using index for group-by');
  });
});
