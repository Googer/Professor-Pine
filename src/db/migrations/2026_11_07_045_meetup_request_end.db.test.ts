import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { meetupRequestEnd } from './2026_11_07_045_meetup_request_end.js';

describe('migration 045: when a meetup held for the moderators ends', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  const endColumn = async () => {
    const rows = await sql<{ type: string; nullable: string; dflt: string | null }>`
      select column_type as type, is_nullable as nullable, column_default as dflt
      from information_schema.columns
      where table_schema = database() and table_name = 'MeetupRequest'
        and column_name = 'endTime'`.execute(db);
    return rows.rows;
  };

  it('gives a request an end, none unless it is given', async () => {
    expect(await endColumn()).toEqual([{ type: 'bigint', nullable: 'YES', dflt: null }]);
  });

  it('runs again without touching what it made', async () => {
    await meetupRequestEnd.up(db);
    expect(await endColumn()).toEqual([{ type: 'bigint', nullable: 'YES', dflt: null }]);
  });
});
