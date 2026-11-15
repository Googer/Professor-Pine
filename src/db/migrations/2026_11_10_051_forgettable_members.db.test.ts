import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { isDuplicateEntry } from '../errors.js';
import type { DB } from '../types.js';
import { forgettableMembers } from './2026_11_10_051_forgettable_members.js';

const REPORT = '00000000-0000-4000-8000-000000000051';
const ALICE = '312345678901234567';
const NOW = 1_800_000_000_000;

/** The four columns of members that a removal on request clears (plan 8G, fix round 1). */
const CLEARED: [table: string, column: string][] = [
  ['MeetupRequest', 'makerId'],
  ['MeetupAppeal', 'memberId'],
  ['MeetupPlaceAsk', 'memberId'],
  ['ModerationReportReason', 'reporterId'],
];

describe('migration 051: the ids a removal on request clears take a null', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  const nullable = async () => {
    const found: Record<string, boolean> = {};
    for (const [table, column] of CLEARED) {
      const rows = await sql<{ nullable: string; type: string }>`
        select is_nullable as nullable, column_type as type from information_schema.columns
        where table_schema = database() and table_name = ${table}
          and column_name = ${column}`.execute(db);
      expect(rows.rows[0]?.type, `${table}.${column}`).toBe('varchar(30)');
      found[`${table}.${column}`] = rows.rows[0]?.nullable === 'YES';
    }
    return found;
  };
  /** The keys of a later migration (057's index on the reporter), left out. */
  const LATER_KEYS = new Set(['moderationreportreason_reporterid_index']);
  const keysOfReasons = async () => {
    const rows = await sql<{ name: string; column: string; unique: number | string }>`
      select index_name as name, column_name as \`column\`, non_unique = 0 as \`unique\`
      from information_schema.statistics
      where table_schema = database() and table_name = 'ModerationReportReason'
      order by index_name, seq_in_index`.execute(db);
    const keys: Record<string, { columns: string[]; unique: boolean }> = {};
    for (const row of rows.rows.filter((one) => !LATER_KEYS.has(one.name))) {
      const key = (keys[row.name] ??= { columns: [], unique: Number(row.unique) === 1 });
      key.columns.push(row.column);
    }
    return keys;
  };
  const EVERY_ONE_NULLABLE = Object.fromEntries(
    CLEARED.map(([table, column]) => [`${table}.${column}`, true]),
  );
  const KEYS = {
    PRIMARY: { columns: ['id'], unique: true },
    moderationreportreason_report_reporter_unique: {
      columns: ['reportId', 'reporterId'],
      unique: true,
    },
  };

  const reason = (reporterId: string | null, text: string) =>
    db
      .insertInto('ModerationReportReason')
      .values({ reportId: REPORT, reporterId, text, createdAt: String(NOW) })
      .execute();

  it('makes the four columns nullable, and gives the reasons a row id of their own', async () => {
    expect(await nullable()).toEqual(EVERY_ONE_NULLABLE);
    expect(await keysOfReasons()).toEqual(KEYS);
  });

  it('keeps one reason per reporter and report, and lets several forgotten ones stand', async () => {
    await reason(ALICE, 'A yard.');
    const twice = await reason(ALICE, 'Again.').catch((err: unknown) => err);
    expect(isDuplicateEntry(twice, 'moderationreportreason_report_reporter_unique')).toBe(true);
    await reason(null, 'Forgotten once.');
    await reason(null, 'Forgotten twice.');
    const rows = await db
      .selectFrom('ModerationReportReason')
      .select(['id', 'reporterId', 'text'])
      .where('reportId', '=', REPORT)
      .orderBy('id')
      .execute();
    expect(rows.map((row) => [row.reporterId, row.text])).toEqual([
      [ALICE, 'A yard.'],
      [null, 'Forgotten once.'],
      [null, 'Forgotten twice.'],
    ]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(3);
    await db.deleteFrom('ModerationReportReason').execute();
  });

  it('runs again, and finishes what a failure half-way left as it was before', async () => {
    await forgettableMembers.up(db);
    expect(await nullable()).toEqual(EVERY_ONE_NULLABLE);
    expect(await keysOfReasons()).toEqual(KEYS);

    // As 050 left them: the columns not null, the reasons keyed by report and reporter.
    await sql`alter table ModerationReportReason drop column id,
              drop index moderationreportreason_report_reporter_unique,
              modify column reporterId varchar(30) not null,
              add primary key (reportId, reporterId)`.execute(db);
    await sql`alter table MeetupAppeal modify column memberId varchar(30) not null`.execute(db);
    await forgettableMembers.up(db);
    expect(await nullable()).toEqual(EVERY_ONE_NULLABLE);
    expect(await keysOfReasons()).toEqual(KEYS);

    // Half-way: the unique key there, the primary key not changed yet.
    await sql`alter table ModerationReportReason drop column id,
              modify column reporterId varchar(30) not null,
              add primary key (reportId, reporterId)`.execute(db);
    await forgettableMembers.up(db);
    expect(await keysOfReasons()).toEqual(KEYS);
    expect(await nullable()).toEqual(EVERY_ONE_NULLABLE);
  });

  it('keeps the reasons there are, each with a row id', async () => {
    await sql`alter table ModerationReportReason drop column id,
              modify column reporterId varchar(30) not null,
              add primary key (reportId, reporterId)`.execute(db);
    await sql`insert into ModerationReportReason (reportId, reporterId, text, createdAt)
              values (${REPORT}, ${ALICE}, 'Kept.', ${NOW}),
                     (${REPORT}, '312345678901234568', 'Kept too.', ${NOW})`.execute(db);
    await forgettableMembers.up(db);
    const rows = await db
      .selectFrom('ModerationReportReason')
      .select(['id', 'reporterId', 'text'])
      .orderBy('id')
      .execute();
    expect(rows.map((row) => [row.reporterId, row.text])).toEqual([
      [ALICE, 'Kept.'],
      ['312345678901234568', 'Kept too.'],
    ]);
    expect(rows.every((row) => row.id > 0)).toBe(true);
    await db.deleteFrom('ModerationReportReason').execute();
  });
});
