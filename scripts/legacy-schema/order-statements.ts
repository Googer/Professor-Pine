const TABLE = /^CREATE TABLE `([^`]+)`/;
const REFERENCE = /REFERENCES `([^`]+)`/g;

/**
 * Extracts the CREATE TABLE statements from a mysqldump, minus knex bookkeeping
 * tables and AUTO_INCREMENT counters, ordered so referenced tables come first.
 */
export function orderCreateStatements(dump: string): string[] {
  const byTable = new Map<string, { statement: string; references: string[] }>();
  for (const raw of dump.split(/;\s*\n/)) {
    const statement = raw.trim().replace(/;$/, '');
    const table = TABLE.exec(statement)?.[1];
    if (!table || table.startsWith('knex_')) continue;
    const references = [...statement.matchAll(REFERENCE)]
      .map((m) => m[1] ?? '')
      .filter((name) => name !== table);
    byTable.set(table, { statement: statement.replace(/ AUTO_INCREMENT=\d+/, ''), references });
  }

  const ordered: string[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (table: string) => {
    if (done.has(table)) return;
    if (visiting.has(table)) throw new Error(`foreign-key cycle involving ${table}`);
    const entry = byTable.get(table);
    if (!entry) return; // reference to a table outside the dump
    visiting.add(table);
    entry.references.forEach(visit);
    visiting.delete(table);
    done.add(table);
    ordered.push(entry.statement);
  };
  [...byTable.keys()].sort().forEach(visit);
  return ordered;
}
