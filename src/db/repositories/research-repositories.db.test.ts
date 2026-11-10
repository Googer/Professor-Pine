import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lastWarnings } from '../../../test/support/mysql-warnings.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { pineStopCases } from '../../../test/support/pine-stop-cases.js';
import {
  INTO_THE_WILD,
  listedTask,
  researchEventCases,
  researchTaskCases,
  stopPostCases,
} from '../../../test/support/research-store-cases.js';
import type { DB } from '../types.js';
import { PineStopRepository } from './pine-stop-repository.js';
import { ResearchEventRepository } from './research-event-repository.js';
import { ResearchTaskRepository } from './research-task-repository.js';
import { StopPostRepository } from './stop-post-repository.js';
import { StopLineRepository } from './stop-line-repository.js';
import { stopLineCases } from '../../../test/support/stop-line-cases.js';

/** The smaller tables of plan 8R-1: stops of Pine's own, posts of the stops, research events, tasks. */
describe('the repositories of reports at stops', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  describe('PineStopRepository', () => {
    pineStopCases(async () => {
      await db.deleteFrom('PineStop').execute();
      return new PineStopRepository(db);
    });
  });

  describe('StopPostRepository', () => {
    stopPostCases(async () => {
      await db.deleteFrom('StopPost').execute();
      return new StopPostRepository(db);
    });

    it('draws no warning of MySQL as it keeps a post again', async () => {
      await db.deleteFrom('StopPost').execute();
      const store = new StopPostRepository(db);
      const post = {
        channelId: '1',
        day: '2026-10-21',
        serverId: '2',
        threadId: '3',
        messageIds: [],
        leftover: ['4'],
        updatedAt: 1,
      };
      await store.save(post);
      expect(await lastWarnings(db, (trx) => new StopPostRepository(trx).save(post))).toEqual([]);
    });
  });

  describe('StopLineRepository', () => {
    stopLineCases(async () => {
      await db.deleteFrom('StopLine').execute();
      return new StopLineRepository(db);
    });
  });

  describe('ResearchEventRepository', () => {
    researchEventCases(async () => {
      await db.deleteFrom('ResearchEvent').execute();
      return new ResearchEventRepository(db);
    });

    it('draws no warning of MySQL as it keeps an event again', async () => {
      await db.deleteFrom('ResearchEvent').execute();
      const store = new ResearchEventRepository(db);
      await store.saveSeen([INTO_THE_WILD], 1);
      expect(
        await lastWarnings(db, (trx) =>
          new ResearchEventRepository(trx).saveSeen([INTO_THE_WILD], 2),
        ),
      ).toEqual([]);
    });
  });

  describe('ResearchTaskRepository', () => {
    researchTaskCases(async () => {
      await db.deleteFrom('ResearchTask').execute();
      return new ResearchTaskRepository(db);
    });

    it('draws no warning of MySQL as it keeps a list again', async () => {
      await db.deleteFrom('ResearchTask').execute();
      const tasks = [listedTask('Make 2 Excellent Throws')];
      await new ResearchTaskRepository(db).replace(tasks, 1);
      expect(
        await lastWarnings(db, (trx) => new ResearchTaskRepository(trx).replace(tasks, 2)),
      ).toEqual([]);
    });
  });
});
