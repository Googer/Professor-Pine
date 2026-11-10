import { expect, it } from 'vitest';
import type {
  AuditRow,
  PartyAuditStore,
} from '../../src/db/repositories/party-audit-repository.js';
import type { AuditEntry } from '../../src/domain/party/audit.js';

export const AUDIT_SERVER = '100000000000000001';
const OTHER_SERVER = '100000000000000002';
export const AUDIT_POST = '400000000000000001';
const NEW_POST = '400000000000000002';
export const AUDIT_PARTY = '00000000-0000-4000-8000-0000000000a1';
const MOVED_PARTY = '00000000-0000-4000-8000-0000000000a2';
export const ASH = { id: '200000000000000011', name: 'Ash' };
const MISTY = { id: '200000000000000012' };

/** An entry of the log, at `at`, made by `actor` (none: Pine), in the party's post. */
export function auditRow(
  at: number,
  entry: AuditEntry,
  overrides: Partial<AuditRow> = {},
): AuditRow {
  return {
    serverId: AUDIT_SERVER,
    partyId: AUDIT_PARTY,
    postId: AUDIT_POST,
    at,
    actor: ASH,
    entry,
    ...overrides,
  };
}

const CREATED: AuditEntry = {
  action: 'created',
  kind: 'raid',
  what: 'Level 5 raid',
  boss: null,
  place: 'Big Fountain',
  anonymous: true,
  hatch: 5_000,
  end: 9_000,
  start: null,
};

/** What the staff audit log keeps and finds, for the repository and its twin. */
export function partyAuditCases(made: () => Promise<PartyAuditStore>): void {
  it('keeps every fact of an entry, and who made it, as written', async () => {
    const store = await made();
    const boss: AuditEntry = { action: 'boss', from: 'T5 egg', to: 'Yveltal (T5)' };
    await store.insert([
      auditRow(1_000, CREATED),
      auditRow(2_000, boss, { actor: MISTY }),
      auditRow(3_000, { action: 'info' }, { actor: null }),
    ]);
    const read = await store.ofPost(AUDIT_SERVER, AUDIT_POST);
    expect(read.map(({ id: _id, ...row }) => row)).toEqual([
      auditRow(1_000, CREATED),
      auditRow(2_000, boss, { actor: MISTY }),
      auditRow(3_000, { action: 'info' }, { actor: null }),
    ]);
  });

  it("gives a party's first entries its post once it has one", async () => {
    const store = await made();
    await store.insert([auditRow(1_000, CREATED, { postId: null })]);
    expect(await store.ofPost(AUDIT_SERVER, AUDIT_POST)).toEqual([]);
    await store.attachPost(AUDIT_PARTY, AUDIT_POST);
    expect((await store.ofPost(AUDIT_SERVER, AUDIT_POST)).map((row) => row.at)).toEqual([1_000]);
  });

  it('finds the log of a raid that moved to another region by either post, the old one too', async () => {
    const store = await made();
    await store.insert([
      auditRow(1_000, CREATED),
      auditRow(2_000, { action: 'ended', how: 'moved', toPlace: 'Old Gym', toChannel: '3' }),
      auditRow(
        2_000,
        {
          action: 'moved',
          kind: 'raid',
          fromParty: AUDIT_PARTY,
          fromPlace: 'Big Fountain',
          fromChannel: '2',
        },
        { partyId: MOVED_PARTY, postId: NEW_POST },
      ),
      auditRow(3_000, { action: 'saved', saved: true }, { partyId: MOVED_PARTY, postId: NEW_POST }),
    ]);
    const actions = async (postId: string) =>
      (await store.ofPost(AUDIT_SERVER, postId)).map((row) => row.entry.action);
    expect(await actions(NEW_POST)).toEqual(['created', 'ended', 'moved', 'saved']);
    expect(await actions(AUDIT_POST)).toEqual(['created', 'ended']);
  });

  it("finds nothing of another server's post or member", async () => {
    const store = await made();
    await store.insert([auditRow(1_000, CREATED, { serverId: OTHER_SERVER })]);
    expect(await store.ofPost(AUDIT_SERVER, AUDIT_POST)).toEqual([]);
    expect(await store.ofMember(AUDIT_SERVER, ASH.id, 25)).toEqual([]);
  });

  it("gives a member's newest entries in the server, oldest first", async () => {
    const store = await made();
    await store.insert([
      auditRow(1_000, CREATED),
      auditRow(2_000, { action: 'info' }, { actor: MISTY }),
      auditRow(3_000, { action: 'saved', saved: true }),
      auditRow(4_000, { action: 'saved', saved: false }),
    ]);
    const mine = await store.ofMember(AUDIT_SERVER, ASH.id, 2);
    expect(mine.map((row) => row.at)).toEqual([3_000, 4_000]);
  });

  it('deletes the entries older than the time given, and says how many', async () => {
    const store = await made();
    await store.insert([
      auditRow(1_000, CREATED),
      auditRow(2_000, { action: 'info' }),
      auditRow(3_000, { action: 'saved', saved: true }),
    ]);
    expect(await store.deleteBefore(2_000)).toBe(1);
    expect((await store.ofPost(AUDIT_SERVER, AUDIT_POST)).map((row) => row.at)).toEqual([
      2_000, 3_000,
    ]);
  });
}
