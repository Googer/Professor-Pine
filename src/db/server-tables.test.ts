import { describe, expect, it } from 'vitest';
import { TABLE_OWNERS } from './server-tables.js';
import { PINE_TABLES } from './table-names.js';

// That the owners agree with the schema (a server's column, its index, its foreign key) is
// checked by server-tables.db.test.ts.

describe('whose each table is (the deletion of a server, plan 19C-3)', () => {
  it('says it of every table of the database, so that a new table fails until it is said', () => {
    const unsaid = PINE_TABLES.filter((table) => TABLE_OWNERS[table] === undefined);
    expect(unsaid).toEqual([]);
  });

  it('names no table the database does not have', () => {
    const known = new Set(PINE_TABLES);
    expect(Object.keys(TABLE_OWNERS).filter((table) => !known.has(table))).toEqual([]);
  });

  it('keeps every member’s own table and the instance’s, the record of the servers among them', () => {
    const kept = Object.entries(TABLE_OWNERS)
      .filter(([, owner]) => owner.kind === 'member' || owner.kind === 'instance')
      .map(([table]) => table);
    expect(kept).toEqual(
      expect.arrayContaining(['User', 'DmContact', 'WebSession', 'ScriptAccess', 'ServerRecord']),
    );
  });

  it('hangs every table that goes through another on one that goes with the server', () => {
    const goes = (table: string, seen: ReadonlySet<string> = new Set()): boolean => {
      const owner = TABLE_OWNERS[table];
      if (owner === undefined || seen.has(table)) return false;
      if (owner.kind === 'server' || owner.kind === 'guild-row') return true;
      return owner.kind === 'through' && goes(owner.parent, new Set([...seen, table]));
    };
    const hanging = Object.entries(TABLE_OWNERS)
      .filter(([, owner]) => owner.kind === 'through')
      .map(([table]) => table);
    expect(hanging.filter((table) => !goes(table))).toEqual([]);
  });
});
