import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  serverSettingsAuditCases,
  settingsAuditRow,
} from '../../../test/support/server-settings-audit-cases.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import { planOf, scanned } from '../../../test/support/query-plan.js';
import type { DB } from '../types.js';
import { ServerSettingsAuditRepository } from './server-settings-audit-repository.js';

/** 2026-11-05 in the morning, UTC. */
const NOW = 1_793_000_000_000;
const MINUTE = 60_000;

/** The log of a server's settings of migration 053. */
describe('ServerSettingsAuditRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let database: TestDatabase;

  beforeAll(async () => {
    ({ db, stop, database } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  serverSettingsAuditCases(async () => {
    await db.deleteFrom('ServerSettingsAudit').execute();
    return new ServerSettingsAuditRepository(db);
  });

  describe('beside 30 days of entries of thirty servers (the index audit of 2026-11-13, X13)', () => {
    const server = (n: number) => `41234567890123${String(n % 30).padStart(4, '0')}`;
    const actor = (n: number) => `31234567890123${String(n % 10).padStart(4, '0')}`;

    // 6,000 entries: thirty servers, ten members of staff each, a change every few minutes.
    beforeAll(async () => {
      await db.deleteFrom('ServerSettingsAudit').execute();
      const store = new ServerSettingsAuditRepository(db);
      await store.insert(
        Array.from({ length: 6_000 }, (_, n) =>
          settingsAuditRow(NOW - n * 7 * MINUTE, {
            serverId: server(n),
            actor: { id: actor(Math.floor(n / 30)), name: 'Staff' },
          }),
        ),
      );
      await sql`analyze table ServerSettingsAudit`.execute(db);
    });

    it('reads a server’s newest entries along its index, in its order, without sorting them', async () => {
      const store = new ServerSettingsAuditRepository(db);
      const read = await store.ofServer(server(7), 20);
      expect(read).toHaveLength(20);
      expect(read.every((row) => row.serverId === server(7))).toBe(true);
      const plan = await planOf(database, (seen) =>
        new ServerSettingsAuditRepository(seen).ofServer(server(7), 20),
      );
      expect(plan.map((row) => row.key)).toEqual(['serversettingsaudit_server_at_index']);
      expect(plan.map((row) => row.Extra ?? '').join(' ')).not.toContain('Using filesort');
      expect(scanned(plan)).toEqual([]);
    });

    it('reads a member’s newest entries in a server along its index, in its order, without sorting them', async () => {
      const store = new ServerSettingsAuditRepository(db);
      const read = await store.ofMember(server(7), actor(3), 10);
      expect(read).toHaveLength(10);
      expect(read.every((row) => row.serverId === server(7) && row.actor.id === actor(3))).toBe(
        true,
      );
      const plan = await planOf(database, (seen) =>
        new ServerSettingsAuditRepository(seen).ofMember(server(7), actor(3), 10),
      );
      expect(plan.map((row) => row.key)).toEqual(['serversettingsaudit_actor_index']);
      expect(plan.map((row) => row.Extra ?? '').join(' ')).not.toContain('Using filesort');
      expect(scanned(plan)).toEqual([]);
    });
  });
});
