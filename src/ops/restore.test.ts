import { describe, expect, it } from 'vitest';
import { LEGACY_REQUIRED_MIGRATION } from '../db/migrations/2026_10_09_000_baseline.js';
import { reportLines, type RestoreReport } from './restore.js';

const rows = { Guild: 4, Gym: 3213 };

describe('reportLines', () => {
  it('says what kind of database was loaded, with the rows of the main tables', () => {
    const report = (kind: RestoreReport['kind']): RestoreReport => ({
      kind,
      tables: 17,
      migrations: kind === 'pine' ? 14 : 0,
      rows,
    });

    expect(reportLines(report('pine'))).toEqual([
      "Loaded a Professor Pine database (14 of the bot's migrations applied), 17 tables.",
      '  Guild: 4 rows',
      '  Gym: 3213 rows',
    ]);
    expect(reportLines(report('legacy'))[0]).toBe(
      "Loaded a legacy Professor Pine database (the bot's migrator takes it over at the start), " +
        '17 tables.',
    );
    expect(reportLines(report('other'))[0]).toBe(
      'Loaded a database the bot does not know: its migrator will refuse it, 17 tables.',
    );
  });

  it('says why the bot will refuse a legacy database that lacks a migration', () => {
    const lines = reportLines({ kind: 'legacy-incomplete', tables: 17, migrations: 0, rows });

    expect(lines[0]).toBe(
      'Loaded a legacy Professor Pine database of 17 tables that the bot refuses: Baseline ' +
        `failed: legacy migration ${LEGACY_REQUIRED_MIGRATION} has not been applied. Run the ` +
        'legacy bot once on the legacy branch so all its migrations apply, then retry.',
    );
  });

  it('says so when nothing was loaded', () => {
    expect(reportLines({ kind: 'empty', tables: 0, migrations: 0, rows: {} })).toEqual([
      'The dump loaded no tables into the database. Was it made for another database name ' +
        '(a USE line in it)?',
    ]);
  });
});
