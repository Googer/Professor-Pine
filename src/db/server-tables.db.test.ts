import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../test/support/migrated-db.js';
import { TABLE_OWNERS } from './server-tables.js';
import type { DB } from './types.js';

/**
 * The columns that name a server: by its snowflake, or by its `Guild` row; and either of a pair
 * of servers (plan 19E's neighbors).
 */
const SERVER_COLUMNS = new Set(['serverId', 'guildId', 'serverA', 'serverB']);

/**
 * The tables that name a server and stay: the record of each server (plan 19C-1), which outlives
 * its data (an allowance, a block, and a new install's adoption window, closed for good).
 */
const KEPT_WITH_A_SERVER = new Set(['ServerRecord']);

describe('whose each table is, against the schema (plan 19C-3)', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  /** Each table's columns. */
  const columns = new Map<string, Set<string>>();
  /** Each table's indexes, by name: their columns in order (an expression's part as null). */
  const indexes = new Map<string, Map<string, (string | null)[]>>();
  /** Each table's foreign keys: column, the table it names, what a delete there does. */
  const foreign = new Map<string, { column: string; parent: string; onDelete: string }[]>();

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    const cols = await sql<{ t: string; c: string }>`
      select table_name as t, column_name as c from information_schema.columns
      where table_schema = database()`.execute(db);
    for (const { t, c } of cols.rows) columns.set(t, (columns.get(t) ?? new Set()).add(c));
    const stats = await sql<{ t: string; i: string; seq: number; c: string | null }>`
      select table_name as t, index_name as i, seq_in_index as seq, column_name as c
      from information_schema.statistics where table_schema = database()
      order by table_name, index_name, seq_in_index`.execute(db);
    for (const { t, i, c } of stats.rows) {
      const byName = indexes.get(t) ?? new Map<string, (string | null)[]>();
      byName.set(i, [...(byName.get(i) ?? []), c]);
      indexes.set(t, byName);
    }
    const keys = await sql<{ t: string; c: string; p: string; d: string }>`
      select k.table_name as t, k.column_name as c, k.referenced_table_name as p,
        r.delete_rule as d
      from information_schema.key_column_usage k
      join information_schema.referential_constraints r
        on r.constraint_schema = k.constraint_schema and r.constraint_name = k.constraint_name
      where k.table_schema = database() and k.referenced_table_name is not null`.execute(db);
    for (const { t, c, p, d } of keys.rows) {
      foreign.set(t, [...(foreign.get(t) ?? []), { column: c, parent: p, onDelete: d }]);
    }
  });
  afterAll(async () => {
    await stop();
  });

  /** Whether one of the table's indexes leads with the column. */
  const leadsWith = (table: string, column: string): boolean =>
    [...(indexes.get(table)?.values() ?? [])].some((parts) => parts[0] === column);

  it('knows every table of the schema', () => {
    expect([...columns.keys()].filter((table) => TABLE_OWNERS[table] === undefined)).toEqual([]);
  });

  it('deletes every table that names a server, but the record of the servers', () => {
    const naming = [...columns.entries()]
      .filter(([, cols]) => [...cols].some((c) => SERVER_COLUMNS.has(c)))
      .map(([table]) => table)
      .filter((table) => !KEPT_WITH_A_SERVER.has(table));
    const notDeleted = naming.filter((table) => {
      const owner = TABLE_OWNERS[table];
      return (
        owner?.kind !== 'server' && owner?.kind !== 'server-pair' && owner?.kind !== 'guild-row'
      );
    });
    expect(notDeleted).toEqual([]);
  });

  it('deletes by its `Guild` row every table with a foreign key to it', () => {
    const toGuild = [...foreign.entries()]
      .filter(([, keys]) => keys.some((key) => key.parent === 'Guild'))
      .map(([table]) => table);
    expect(toGuild.filter((table) => TABLE_OWNERS[table]?.kind !== 'guild-row')).toEqual([]);
    for (const table of toGuild) {
      const owner = TABLE_OWNERS[table];
      const key = foreign.get(table)?.find((k) => k.parent === 'Guild');
      expect({ table, column: key?.column, onDelete: key?.onDelete }).toEqual({
        table,
        column: owner?.kind === 'guild-row' ? owner.column : undefined,
        onDelete: 'CASCADE',
      });
    }
  });

  it('reads every server’s and every row’s table along an index that leads with its column', () => {
    const unindexed = Object.entries(TABLE_OWNERS).flatMap(([table, owner]) => {
      if (owner.kind === 'server-pair') {
        // Each of the two columns, by an index of its own.
        return owner.columns
          .filter((column) => !leadsWith(table, column))
          .map((column) => `${table}.${column}`);
      }
      if (owner.kind !== 'server' && owner.kind !== 'guild-row' && owner.kind !== 'through') {
        return [];
      }
      return leadsWith(table, owner.column) ? [] : [`${table}.${owner.column}`];
    });
    expect(unindexed).toEqual([]);
  });

  it('cascades from the parent where the table says so', () => {
    const wrong = Object.entries(TABLE_OWNERS).flatMap(([table, owner]) => {
      if (owner.kind !== 'through' || !owner.cascade) return [];
      const key = foreign
        .get(table)
        ?.find((k) => k.column === owner.column && k.parent === owner.parent);
      return key?.onDelete === 'CASCADE' ? [] : [table];
    });
    expect(wrong).toEqual([]);
  });

  it('lets every gym’s table go with its gym', () => {
    const wrong = Object.entries(TABLE_OWNERS).flatMap(([table, owner]) => {
      if (owner.kind !== 'gym' || table === 'Gym') return [];
      const key = foreign.get(table)?.find((k) => k.parent === 'Gym');
      return key?.onDelete === 'CASCADE' ? [] : [table];
    });
    expect(wrong).toEqual([]);
  });
});
