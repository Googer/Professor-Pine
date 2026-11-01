import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import {
  ASH,
  DRATINI_RESEARCH,
  MACHAMP_DYNAMAX,
  targetWantCases,
  WANT_SERVER,
  WANTED_AT,
} from '../../../test/support/target-want-cases.js';
import type { DB } from '../types.js';
import { TargetWantRepository } from './target-want-repository.js';

describe('TargetWantRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  const fresh = async () => {
    await db.deleteFrom('TargetWant').execute();
    return new TargetWantRepository(db);
  };

  targetWantCases(fresh);

  it('counts a row it cannot read, leaves it in the list alone and removes it with all', async () => {
    const store = await fresh();
    await store.change(ASH, WANT_SERVER, { add: [DRATINI_RESEARCH], remove: [] }, WANTED_AT);
    const row = await db
      .selectFrom('TargetWant')
      .select(['guildId', 'userId'])
      .executeTakeFirstOrThrow();
    await db
      .insertInto('TargetWant')
      .values({ ...row, target: 'balloon:team-leader', createdAt: String(WANTED_AT) })
      .execute();
    expect(await store.list(ASH, WANT_SERVER)).toEqual({
      wants: [DRATINI_RESEARCH],
      unreadable: 1,
    });
    expect(await store.count(ASH, WANT_SERVER)).toBe(2);
    expect(await store.removeAll(ASH, WANT_SERVER)).toBe(2);
  });

  it('writes a target once when the same change comes twice at the same moment', async () => {
    const store = await fresh();
    await Promise.all([
      store.change(ASH, WANT_SERVER, { add: [MACHAMP_DYNAMAX], remove: [] }, WANTED_AT),
      store.change(ASH, WANT_SERVER, { add: [MACHAMP_DYNAMAX], remove: [] }, WANTED_AT),
    ]);
    expect((await store.list(ASH, WANT_SERVER)).wants).toEqual([MACHAMP_DYNAMAX]);
  });

  /**
   * The dialog of `/want` reads one member's targets of one Pokémon within Discord's three
   * seconds (design 7, the slow-read rule): that read, and the notifier's by target, go by keys.
   */
  it('reads one member’s targets by the unique key, and who wants a target by its index', async () => {
    const store = await fresh();
    for (let n = 1; n <= 60; n++) {
      await store.change(
        String(300000000000000000n + BigInt(n)),
        WANT_SERVER,
        { add: [DRATINI_RESEARCH, MACHAMP_DYNAMAX], remove: [] },
        WANTED_AT,
      );
    }
    await sql`analyze table TargetWant`.execute(db);
    const row = await db
      .selectFrom('TargetWant')
      .select(['guildId', 'userId'])
      .executeTakeFirstOrThrow();
    const ofMember = await sql<{ key: string | null }>`
      explain select target from TargetWant
      where guildId = ${row.guildId} and userId = ${row.userId}
        and target in ('research:pokemon:147', 'dynamax:147')`.execute(db);
    expect(ofMember.rows[0]?.key).toBe('targetwant_member_unique');
    const byTarget = await sql<{ key: string | null }>`
      explain select userId from TargetWant
      where guildId = ${row.guildId} and target in ('research:pokemon:147')`.execute(db);
    expect(byTarget.rows[0]?.key).toBe('targetwant_target_index');
  });
});
