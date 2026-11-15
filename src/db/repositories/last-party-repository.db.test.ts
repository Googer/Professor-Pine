import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import { planOf, scanned } from '../../../test/support/query-plan.js';
import type { DB } from '../types.js';
import { LastPartyRepository } from './last-party-repository.js';

const BUSY = '412345678901234567';
const QUIET = '412345678901234568';
/** A server with records of the legacy import alone. */
const LEGACY_ONLY = '412345678901234569';
const NONE = '412345678901234570';
const START = Date.parse('2025-01-01T12:00:00Z');
const HOUR = 3_600_000;

/** The time of each server's last recorded party (plan 19C-1, `/operator servers list`). */
describe('LastPartyRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let database: TestDatabase;

  beforeAll(async () => {
    ({ db, database, stop } = await startMigratedDatabase());
    // A real history's shape: thousands of live raids of a busy server, a few of a quiet one,
    // and the legacy import's records of every server, made earlier than the live ones.
    const live = Array.from({ length: 3_000 }, (_, n) => ({
      source: 'live',
      kind: 'raid',
      serverId: n % 500 === 0 ? QUIET : BUSY,
      createdAt: String(START + n * HOUR),
      ending: 'time',
    }));
    const legacy = Array.from({ length: 3_000 }, (_, n) => ({
      source: 'legacy',
      legacyKey: `512345678901234567:${String(n)}`,
      kind: 'raid',
      serverId: [BUSY, QUIET, LEGACY_ONLY][n % 3] ?? BUSY,
      createdAt: String(START - (n + 1) * HOUR),
      ending: 'time',
    }));
    const rows = [
      ...live,
      ...legacy,
      // The quiet server's last party is a meetup, made after its last raid.
      {
        source: 'live',
        kind: 'meetup',
        serverId: QUIET,
        createdAt: String(START + 2_600 * HOUR),
        ending: 'time',
      },
      // Recorded after the live records (a high id), made long before: an import run after the
      // bot's start.
      {
        source: 'legacy',
        legacyKey: '512345678901234567:late',
        kind: 'raid',
        serverId: BUSY,
        createdAt: String(START - 10_000 * HOUR),
        ending: 'time',
      },
      // A live record recorded last but made earlier than the busy server's newest.
      {
        source: 'live',
        kind: 'raid',
        serverId: BUSY,
        createdAt: String(START + 10 * HOUR),
        ending: 'time',
      },
    ];
    for (let at = 0; at < rows.length; at += 500) {
      await db
        .insertInto('PartyHistory')
        .values(rows.slice(at, at + 500))
        .execute();
    }
    await sql`analyze table PartyHistory`.execute(db);
  });
  afterAll(async () => {
    await stop();
  });

  it('gives the time each server’s last live party was made, of any kind, none for a server without', async () => {
    const last = await new LastPartyRepository(db).lastPartyAt([BUSY, QUIET, LEGACY_ONLY, NONE]);
    expect(last).toEqual(
      new Map([
        [BUSY, START + 2_999 * HOUR],
        [QUIET, START + 2_600 * HOUR],
      ]),
    );
    expect(await new LastPartyRepository(db).lastPartyAt([])).toEqual(new Map());
  });

  it('reads each server’s newest live record of each kind along its index, in one statement', async () => {
    const plan = await planOf(database, (seen) =>
      new LastPartyRepository(seen).lastPartyAt([BUSY, QUIET]),
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]?.key).toBe('partyhistory_server_source_kind_createdat_index');
    // One look per server and kind, not a walk over the server's records.
    expect(plan[0]?.Extra).toContain('Using index for group-by');
    expect(scanned(plan)).toEqual([]);
  });
});
