import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import { planOf } from '../../../test/support/query-plan.js';
import type { DB } from '../types.js';
import { DmContactRepository } from './dm-contact-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const CAROL = '312345678901234569';
const NOW = 1_800_000_000_000;

describe('DmContactRepository (plan 19B-5)', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let database: TestDatabase;
  let contacts: DmContactRepository;

  beforeAll(async () => {
    ({ db, stop, database } = await startMigratedDatabase());
    contacts = new DmContactRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('DmContact').execute();
  });

  it('says which members were written to before, and keeps when the first message went', async () => {
    expect(await contacts.known([ALICE, BOB])).toEqual(new Set());
    await contacts.add(ALICE, NOW);
    // A second message changes nothing: the first is kept.
    await contacts.add(ALICE, NOW + 1_000);
    await contacts.add(CAROL, NOW + 2_000);
    expect(await contacts.known([ALICE, BOB, CAROL])).toEqual(new Set([ALICE, CAROL]));
    expect(await contacts.known([])).toEqual(new Set());
    expect(
      await db.selectFrom('DmContact').select(['userId', 'firstAt']).orderBy('userId').execute(),
    ).toEqual([
      { userId: ALICE, firstAt: String(NOW) },
      { userId: CAROL, firstAt: String(NOW + 2_000) },
    ]);
  });

  it('reads the members by the primary key', async () => {
    for (let n = 0; n < 200; n++)
      await contacts.add(String(400_000_000_000_000_000n + BigInt(n)), NOW);
    const plan = await planOf(database, (seen) =>
      new DmContactRepository(seen).known([ALICE, BOB]),
    );
    expect(plan.map((row) => row.key)).toEqual(['PRIMARY']);
  });

  it('forgets one member on request, by the primary key, and nobody else', async () => {
    await contacts.add(ALICE, NOW);
    await contacts.add(BOB, NOW);
    expect(await contacts.forget(ALICE)).toBe(true);
    expect(await contacts.forget(ALICE)).toBe(false);
    expect(await contacts.known([ALICE, BOB])).toEqual(new Set([BOB]));
    const plan = await planOf(database, (seen) => new DmContactRepository(seen).forget(BOB));
    expect(plan.map((row) => row.key)).toEqual(['PRIMARY']);
  });
});
