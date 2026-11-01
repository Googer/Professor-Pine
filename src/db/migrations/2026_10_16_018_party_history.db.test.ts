import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { partyHistory } from './2026_10_16_018_party_history.js';

const HOME = '412345678901234567';
const PARTY = '00000000-0000-4000-8000-000000000001';
const MEMBER = '200000000000000002';

describe('migration 018: the party history', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await sql`delete from Guild`.execute(db);
    await sql`delete from Gym`.execute(db);
    // The history and the opt-ins outlive the servers' rows: cleared by hand.
    await sql`delete from PartyHistory`.execute(db);
    await sql`delete from HistoryOptIn`.execute(db);
    await sql`insert into Guild (id, snowflake) values (1, ${HOME})`.execute(db);
    await sql`insert into Region (id, guildId, channelId) values (5, 1, 1234567890123456789)`.execute(
      db,
    );
    await sql`insert into Gym (id, lat, lon, name) values (7, 40.4, -79.9, 'Library')`.execute(db);
  });

  const count = async (table: string): Promise<number> => {
    const rows = await sql<{ n: number }>`select count(*) as n from ${sql.table(table)}`.execute(
      db,
    );
    return Number(rows.rows[0]?.n ?? 0);
  };
  const insertHistory = (values: { partyId?: string; legacyKey?: string; gymId?: number }) =>
    sql`insert into PartyHistory
          (source, partyId, legacyKey, kind, serverId, regionId, gymId, createdAt, ending)
        values (${values.partyId ? 'live' : 'legacy'}, ${values.partyId ?? null},
                ${values.legacyKey ?? null}, 'raid', ${HOME}, 5, ${values.gymId ?? null}, 1000,
                'completed')`.execute(db);
  const historyId = async (): Promise<number> => {
    const rows = await sql<{ id: number }>`select max(id) as id from PartyHistory`.execute(db);
    return Number(rows.rows[0]?.id);
  };

  it('keeps a live party once and a party of the legacy files once', async () => {
    await insertHistory({ partyId: PARTY });
    await expect(insertHistory({ partyId: PARTY })).rejects.toThrow(/Duplicate entry/u);
    await insertHistory({ legacyKey: '300000000000000001:1500000000000' });
    await expect(insertHistory({ legacyKey: '300000000000000001:1500000000000' })).rejects.toThrow(
      /Duplicate entry/u,
    );
    expect(await count('PartyHistory')).toBe(2);
  });

  it('keeps the gym and region of a party when they are deleted later', async () => {
    await insertHistory({ partyId: PARTY, gymId: 7 });
    await sql`delete from Gym where id = 7`.execute(db);
    await sql`delete from Region where id = 5`.execute(db);
    const rows = await sql<{
      gymId: number;
      regionId: number;
    }>`select gymId, regionId from PartyHistory`.execute(db);
    expect(rows.rows).toEqual([{ gymId: 7, regionId: 5 }]);
  });

  it('takes the attendees, groups and stops of a party with it', async () => {
    await insertHistory({ partyId: PARTY });
    const id = await historyId();
    await sql`insert into PartyHistoryAttendee (historyId, seq, memberId, status, furthest)
              values (${id}, 0, ${MEMBER}, 'done', 'done'), (${id}, 1, null, null, 'joined')`.execute(
      db,
    );
    await sql`insert into PartyHistoryGroup (historyId, groupId, members, heads)
              values (${id}, 'A', 2, 3)`.execute(db);
    await sql`insert into PartyHistoryStop (historyId, seq, gymId) values (${id}, 0, 7)`.execute(
      db,
    );
    await sql`delete from PartyHistory where id = ${id}`.execute(db);
    expect(await count('PartyHistoryAttendee')).toBe(0);
    expect(await count('PartyHistoryGroup')).toBe(0);
    expect(await count('PartyHistoryStop')).toBe(0);
  });

  it("keeps a server's history and opt-ins when its Guild row goes (Matt, 2026-10-16)", async () => {
    await insertHistory({ partyId: PARTY });
    await sql`insert into HistoryOptIn (serverId, memberId, createdAt)
              values (${HOME}, ${MEMBER}, 1000)`.execute(db);
    await sql`insert into EndedPartyPost (forumPostId, forumChannelId, guildId, endedAt)
              values ('900000000000000001', '900000000000000002', 1, 1000)`.execute(db);
    await sql`delete from Guild where id = 1`.execute(db);
    expect(await count('PartyHistory')).toBe(1);
    expect(await count('HistoryOptIn')).toBe(1);
    // What stands in for an ended party's row goes with its server, as the row would.
    expect(await count('EndedPartyPost')).toBe(0);
  });

  it('indexes who made a party and who led it, for an opt-out', async () => {
    const indexed = await sql<{ c: string }>`
      select distinct column_name as c from information_schema.statistics
      where table_schema = database() and table_name = 'PartyHistory'
        and column_name in ('createdById', 'conductorId') and seq_in_index = 1`.execute(db);
    expect(indexed.rows.map((row) => row.c).sort()).toEqual(['conductorId', 'createdById']);
  });

  it('keeps the steps of an active party only as long as the party', async () => {
    await sql`insert into Party (id, guildId, type, mirrorMessages, createdById, state, createdAt,
                                 updatedAt)
              values (${PARTY}, 1, 'raid', '[]', ${MEMBER}, '{}', 1000, 1000)`.execute(db);
    await sql`insert into PartyHistoryStep (partyId, at, kind, subject, value)
              values (${PARTY}, 1000, 'status', ${MEMBER}, 1)`.execute(db);
    await sql`delete from Party where id = ${PARTY}`.execute(db);
    expect(await count('PartyHistoryStep')).toBe(0);
  });

  it('can run again over what it made, keeping every row', async () => {
    await insertHistory({ partyId: PARTY });
    await partyHistory.up(db);
    expect(await count('PartyHistory')).toBe(1);
  });
});
