import { CompiledQuery, type Kysely } from 'kysely';
import { createDb } from '../../src/db/kysely.js';
import type { DB } from '../../src/db/types.js';
import type { TestDatabase } from './mysql.js';

/** A row of MySQL's `explain format=traditional`: one table (or derived table) of a statement. */
export interface PlanRow {
  id: number | null;
  select_type: string;
  /** The table's name or alias; `<derived2>`, `<union2,3>` and the like for what MySQL builds. */
  table: string | null;
  /** How its rows are found: `ALL` is a scan of the whole table. */
  type: string | null;
  key: string | null;
  /** What else MySQL says of it: `Using filesort` where the rows are sorted after they are read. */
  Extra: string | null;
}

/** What starts, ends or marks a transaction: no plan to ask of it. */
const TRANSACTION_CONTROL =
  /^\s*(?:begin|start transaction|commit|rollback|savepoint|release savepoint|set transaction)\b/iu;

/**
 * The plans MySQL makes of what `read` asks of the database, one per statement in the order
 * asked: `read` runs against a connection of its own that hears every statement, and each is
 * explained with the values it was asked with (`explain format=traditional`: since MySQL 9 a bare
 * `explain` answers one row of text). A transaction's own statements (`begin`, `commit` and the
 * like) are left out. A plan depends on the table's statistics: `analyze table` after seeding,
 * and seed enough rows for the optimizer to choose as it does on a real history.
 */
export async function plansOf(
  database: TestDatabase,
  read: (db: Kysely<DB>) => Promise<unknown>,
): Promise<PlanRow[][]> {
  const asked: CompiledQuery[] = [];
  const logged = createDb<DB>(database.config, (event) => {
    if (event.level === 'query' && !TRANSACTION_CONTROL.test(event.query.sql)) {
      asked.push(event.query);
    }
  });
  try {
    await read(logged);
    const plans: PlanRow[][] = [];
    for (const query of [...asked]) {
      const plan = await logged.executeQuery<PlanRow>(
        CompiledQuery.raw(`explain format=traditional ${query.sql}`, [...query.parameters]),
      );
      plans.push(plan.rows);
    }
    return plans;
  } finally {
    await logged.destroy();
  }
}

/** The plan of the one statement `read` asks; throws where it asks none or several. */
export async function planOf(
  database: TestDatabase,
  read: (db: Kysely<DB>) => Promise<unknown>,
): Promise<PlanRow[]> {
  const plans = await plansOf(database, read);
  const [plan] = plans;
  if (plan === undefined || plans.length !== 1) {
    throw new Error(`expected one statement, and ${String(plans.length)} were asked`);
  }
  return plan;
}

/** The tables of a plan that are read whole (`ALL`), those MySQL builds itself (`<…>`) left out. */
export function scanned(plan: readonly PlanRow[]): string[] {
  return plan.flatMap((row) =>
    row.type === 'ALL' && row.table !== null && !row.table.startsWith('<') ? [row.table] : [],
  );
}
