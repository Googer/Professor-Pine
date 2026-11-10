import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AUDIT_POST,
  AUDIT_SERVER,
  auditRow,
  partyAuditCases,
} from '../../../test/support/party-audit-cases.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { createTestLogger } from '../../../test/support/test-logger.js';
import type { DB } from '../types.js';
import { PartyAuditRepository } from './party-audit-repository.js';

/** The staff audit log (the migration `party_audit`). */
describe('PartyAuditRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  partyAuditCases(async () => {
    await db.deleteFrom('PartyAudit').execute();
    return new PartyAuditRepository(db);
  });

  it('leaves out an entry it cannot read, and says so', async () => {
    await db.deleteFrom('PartyAudit').execute();
    const { log, entries } = createTestLogger();
    const store = new PartyAuditRepository(db, log);
    await store.insert([auditRow(1_000, { action: 'info' })]);
    await db
      .insertInto('PartyAudit')
      .values({
        serverId: AUDIT_SERVER,
        partyId: '00000000-0000-4000-8000-0000000000a1',
        postId: AUDIT_POST,
        at: '2000',
        action: 'boss',
        detail: JSON.stringify({ from: 3 }),
      })
      .execute();
    expect((await store.ofPost(AUDIT_SERVER, AUDIT_POST)).map((row) => row.at)).toEqual([1_000]);
    expect(entries.at(-1)).toMatchObject({ level: 40, msg: 'an audit entry cannot be read' });
  });
});
