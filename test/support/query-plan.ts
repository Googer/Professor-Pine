import { CompiledQuery, sql, type Kysely } from 'kysely';
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
  return explained(database, read, async (logged, query) => {
    const plan = await logged.executeQuery<PlanRow>(
      CompiledQuery.raw(`explain format=traditional ${query.sql}`, [...query.parameters]),
    );
    return plan.rows;
  });
}

/**
 * Runs `read` against a connection of its own that hears every statement (a transaction's own
 * left out), then `explain` of each statement asked, in order, on that connection.
 */
async function explained<T>(
  database: TestDatabase,
  read: (db: Kysely<DB>) => Promise<unknown>,
  explain: (logged: Kysely<DB>, query: CompiledQuery) => Promise<T>,
): Promise<T[]> {
  const asked: CompiledQuery[] = [];
  const logged = createDb<DB>(database.config, (event) => {
    if (event.level === 'query' && !TRANSACTION_CONTROL.test(event.query.sql)) {
      asked.push(event.query);
    }
  });
  try {
    await read(logged);
    const explanations: T[] = [];
    for (const query of [...asked]) explanations.push(await explain(logged, query));
    return explanations;
  } finally {
    await logged.destroy();
  }
}

/** A read: the one kind of statement `rowsRead` may run a second time. */
const SELECT = /^\s*select\b/iu;

/**
 * How many rows the one statement `read` asks, a read (a `select`), reads of its tables and
 * indexes when MySQL runs it (`explain analyze`: the actual rows of each scan or lookup, times its
 * loops), with the values it was asked with; throws where it asks none or several, and where it is
 * not a read (`explain analyze` runs what it explains: a write would be made twice), before it is
 * explained. What `explain format=traditional` cannot
 * show: how far a read walks a range of an index before it finds what it gives (a read whose
 * `where` passes over most of the range it walks reads them all, whichever key it uses). Run with
 * index condition pushdown off: with it, InnoDB passes over the entries a condition on the index's
 * other columns refuses before the scan counts them (`with index condition` in the plan), and a
 * walk of thousands shows as the one row it gave.
 */
export async function rowsRead(
  database: TestDatabase,
  read: (db: Kysely<DB>) => Promise<unknown>,
): Promise<number> {
  const counts = await explained(database, read, async (logged, query) => {
    if (!SELECT.test(query.sql)) {
      throw new Error(
        `rowsRead explains a read alone (a select), and explain analyze would run this again: ${query.sql}`,
      );
    }
    const result = await logged.connection().execute(async (connection) => {
      await sql`set session optimizer_switch = 'index_condition_pushdown=off'`.execute(connection);
      return connection.executeQuery<Record<string, string>>(
        CompiledQuery.raw(`explain analyze ${query.sql}`, [...query.parameters]),
      );
    });
    const tree = result.rows.flatMap((row) => Object.values(row)).join('\n');
    let rows = 0;
    for (const line of tree.split('\n')) {
      if (!/(?:scan|lookup) on /u.test(line)) continue;
      const actual = /\(actual [^)]*?rows=([\d.e+]+) loops=(\d+)\)/u.exec(line);
      if (!actual) throw new Error(`no actual rows in "${line.trim()}"`);
      rows += Number(actual[1]) * Number(actual[2]);
    }
    return rows;
  });
  const [count] = counts;
  if (count === undefined || counts.length !== 1) {
    throw new Error(`expected one statement, and ${String(counts.length)} were asked`);
  }
  return count;
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
