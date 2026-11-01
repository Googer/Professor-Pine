import { sql, type Kysely } from 'kysely';
import type { ResearchTask } from '../../domain/research/task.js';
import type { Logger } from '../../log.js';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';
import { rewardsDocument } from './stop-report-repository.js';

/** The last good task list, and when it was read (undefined while none was ever read). */
export interface KeptTaskList {
  tasks: ResearchTask[];
  readAt: number | undefined;
}

/**
 * The last good task list read from Leek Duck (plan 8R-1; design 4.1; table `ResearchTask` of
 * migration 027), as the raid bosses' list is kept: a start without the network still offers
 * it. Twin `MemoryResearchTasks` (`test/support/research-store.ts`), both running
 * `researchTaskCases`.
 */
export interface ResearchTaskStorage {
  /** The tasks of the last good read, in the order of the page, and when it was. */
  kept(): Promise<KeptTaskList>;
  /**
   * Makes `tasks` the kept list, in one transaction: a task kept before keeps when it was first
   * read, every task listed is read `at` in its place on the page, and one not listed is no
   * longer kept as current.
   */
  replace(tasks: readonly ResearchTask[], at: number): Promise<void>;
}

/** The `ResearchTask` table. */
export class ResearchTaskRepository implements ResearchTaskStorage {
  /** `log` hears of a row whose rewards cannot be read (left out). */
  constructor(
    private readonly db: Kysely<DB>,
    private readonly log?: Logger,
  ) {}

  async kept(): Promise<KeptTaskList> {
    const rows = await this.db
      .selectFrom('ResearchTask')
      .selectAll()
      .where('active', '=', 1)
      .orderBy('position')
      .orderBy('taskKey')
      .execute();
    const tasks: ResearchTask[] = [];
    let readAt: number | undefined;
    for (const row of rows) {
      const rewards = rewardsDocument.safeParse(
        typeof row.rewards === 'string' ? JSON.parse(row.rewards) : row.rewards,
      );
      readAt = Math.max(readAt ?? 0, Number(row.lastSeen));
      if (!rewards.success) {
        this.log?.warn({ task: row.taskKey }, 'a kept research task cannot be read; left out');
        continue;
      }
      tasks.push({
        key: row.taskKey,
        text: row.text,
        category: row.category,
        rewards: rewards.data,
        ...(row.endsAt === null ? {} : { endsAt: Number(row.endsAt) }),
      });
    }
    return { tasks, readAt };
  }

  replace(tasks: readonly ResearchTask[], at: number): Promise<void> {
    return inTransaction(this.db, async (trx) => {
      await trx.updateTable('ResearchTask').set({ active: 0 }).execute();
      if (tasks.length === 0) return;
      const values = sql.join(
        tasks.map(
          (task, position) =>
            sql`(${task.key}, ${task.text}, ${task.category}, ${JSON.stringify(task.rewards)},
              ${String(at)}, ${String(at)}, 1, ${position},
              ${task.endsAt === undefined ? null : String(task.endsAt)})`,
        ),
      );
      await sql`
        insert into ResearchTask
          (taskKey, text, category, rewards, firstSeen, lastSeen, active, position, endsAt)
        values ${values} as new
        on duplicate key update text = new.text, category = new.category,
          rewards = new.rewards, lastSeen = new.lastSeen, active = 1,
          position = new.position, endsAt = new.endsAt`.execute(trx);
    });
  }
}
