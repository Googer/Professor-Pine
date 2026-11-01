import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import {
  gruntMessageCases,
  listedChoice,
  rocketLineupCases,
  waterWithLineups,
} from '../../../test/support/rocket-store-cases.js';
import { createTestLogger } from '../../../test/support/test-logger.js';
import type { DB } from '../types.js';
import { GruntMessageRepository } from './grunt-message-repository.js';
import { RocketLineupRepository } from './rocket-lineup-repository.js';

/** The tables of plan 8R-2: the kept Rocket lineups and the grunt messages. */
describe('the repositories of Team GO Rocket', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  describe('GruntMessageRepository', () => {
    gruntMessageCases(async () => {
      await db.deleteFrom('GruntMessage').execute();
      return new GruntMessageRepository(db);
    });
  });

  describe('RocketLineupRepository', () => {
    rocketLineupCases(async () => {
      await db.deleteFrom('RocketLineup').execute();
      return new RocketLineupRepository(db);
    });

    it('leaves out a kept choice whose catches it cannot read, and says so', async () => {
      await db.deleteFrom('RocketLineup').execute();
      const { log, entries } = createTestLogger();
      const store = new RocketLineupRepository(db, log);
      await store.replace([listedChoice('grunt:water'), listedChoice('leader:arlo')], 1_000);
      await db
        .updateTable('RocketLineup')
        .set({ catches: JSON.stringify([{ name: 1 }]) })
        .where('rocketKey', '=', 'leader:arlo')
        .execute();
      expect((await store.kept()).choices.map((choice) => choice.key)).toEqual(['grunt:water']);
      expect(
        entries.some((entry) => entry.msg === 'a kept Rocket lineup cannot be read; left out'),
      ).toBe(true);
    });

    it('reads a row kept before plan 8R-4L, its catches a bare list, as no lineups', async () => {
      await db.deleteFrom('RocketLineup').execute();
      const water = listedChoice('grunt:water');
      await db
        .insertInto('RocketLineup')
        .values({
          rocketKey: 'grunt:water',
          name: water.name,
          catches: JSON.stringify(water.catches),
          firstSeen: '1000',
          lastSeen: '1000',
          active: 1,
          position: 0,
        })
        .execute();
      expect(await new RocketLineupRepository(db).kept()).toEqual({
        choices: [water],
        readAt: 1_000,
      });
    });

    it('keeps the lineups apart in the row, without their fingerprints', async () => {
      await db.deleteFrom('RocketLineup').execute();
      const water = waterWithLineups();
      await new RocketLineupRepository(db).replace([water], 1_000);
      const row = await db.selectFrom('RocketLineup').select('catches').executeTakeFirstOrThrow();
      const kept = (typeof row.catches === 'string' ? JSON.parse(row.catches) : row.catches) as {
        catches: unknown[];
        lineups: Record<string, unknown>[];
      };
      expect(kept.catches).toEqual(water.catches);
      expect(kept.lineups.map((one) => Object.keys(one).sort())).toEqual([
        ['catches', 'first', 'lineup'],
        ['catches', 'first', 'lineup'],
      ]);
    });

    it('reads a choice whose lineups it cannot read as the merged choice, and says so', async () => {
      await db.deleteFrom('RocketLineup').execute();
      const { log, entries } = createTestLogger();
      const store = new RocketLineupRepository(db, log);
      const water = waterWithLineups();
      await store.replace([water], 1_000);
      await db
        .updateTable('RocketLineup')
        .set({
          catches: JSON.stringify({ catches: water.catches, lineups: [{ lineup: 'other' }] }),
        })
        .execute();
      const { lineups: _lineups, ...merged } = water;
      expect((await store.kept()).choices).toEqual([merged]);
      expect(
        entries.some(
          (entry) => entry.msg === 'the lineups of a kept Rocket choice cannot be read; merged',
        ),
      ).toBe(true);
    });

    it('reads lineups of one gender twice, of one first slot, or an empty one, as the merged choice (L2, L-2)', async () => {
      const water = waterWithLineups();
      const [female, male] = water.lineups ?? [];
      if (!female || !male) throw new Error('the water grunt has two lineups');
      const { lineups: _lineups, ...merged } = water;
      const kept = ({ fingerprint: _fp, ...one }: typeof male) => one;
      for (const lineups of [
        [kept(female), { ...kept(male), lineup: 'female' }],
        [kept(female), { ...kept(male), first: female.first }],
        [kept(female), { ...kept(male), first: [] }],
      ]) {
        await db.deleteFrom('RocketLineup').execute();
        const { log, entries } = createTestLogger();
        const store = new RocketLineupRepository(db, log);
        await store.replace([water], 1_000);
        await db
          .updateTable('RocketLineup')
          .set({ catches: JSON.stringify({ catches: water.catches, lineups }) })
          .execute();
        expect((await store.kept()).choices).toEqual([merged]);
        expect(
          entries.some(
            (entry) => entry.msg === 'the lineups of a kept Rocket choice cannot be read; merged',
          ),
        ).toBe(true);
      }
    });
  });
});
