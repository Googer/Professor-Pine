import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { HistoryRepository } from './history-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const NOWHERE = '499999999999999999';
const NOW = 1_800_000_000_000;

describe('HistoryRepository: who is named in the history', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let history: HistoryRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    history = new HistoryRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('PartyHistory').execute();
    await db.deleteFrom('HistoryOptIn').execute();
  });

  /** A party of the history in a server (by snowflake), made by `creator`, with these attendees. */
  const kept = async (server: string, creator: string | null, members: (string | null)[]) => {
    await sql`insert into PartyHistory (source, kind, serverId, createdAt, ending, createdById,
                                        conductorId)
              values ('live', 'train', ${server}, ${NOW}, 'completed', ${creator},
                      ${creator})`.execute(db);
    const id = Number(
      (await sql<{ id: number }>`select max(id) as id from PartyHistory`.execute(db)).rows[0]?.id,
    );
    for (const [seq, member] of members.entries()) {
      await sql`insert into PartyHistoryAttendee (historyId, seq, memberId, status, furthest)
                values (${id}, ${seq}, ${member}, 'here', 'here')`.execute(db);
    }
    return id;
  };
  const named = async () => {
    const parties = await db
      .selectFrom('PartyHistory')
      .select(['id', 'serverId', 'createdById', 'conductorId'])
      .orderBy('id')
      .execute();
    const attendees = await db
      .selectFrom('PartyHistoryAttendee')
      .select(['historyId', 'seq', 'memberId'])
      .orderBy('historyId')
      .orderBy('seq')
      .execute();
    return { parties, attendees };
  };

  it('names nobody until a member opts in, per server', async () => {
    expect(await history.isOptedIn(ALICE, HOME)).toBe(false);
    expect(await history.optIn(ALICE, HOME, NOW)).toBe(true);
    expect(await history.optIn(ALICE, HOME, NOW + 1)).toBe(false);
    expect(await history.isOptedIn(ALICE, HOME)).toBe(true);
    expect(await history.isOptedIn(ALICE, AWAY)).toBe(false);
    expect(await history.isOptedIn(BOB, HOME)).toBe(false);
  });

  it('keeps an opt-in by the server alone: no Guild row is needed or made', async () => {
    expect(await history.optIn(ALICE, NOWHERE, NOW)).toBe(true);
    expect(await history.isOptedIn(ALICE, NOWHERE)).toBe(true);
    expect(
      await db.selectFrom('Guild').select('id').where('snowflake', '=', NOWHERE).execute(),
    ).toEqual([]);
  });

  it('forgets two members who opt out at the same moment, each in the party the other made', async () => {
    // Each opt-out reads the parties of the attendee rows it clears (locked shared), then clears
    // the parties its member made: two at once, each in the other's party, deadlock. Over 200
    // rounds: they meet in the middle too seldom to be seen in fewer.
    for (let round = 0; round < 200; round++) {
      await db.deleteFrom('PartyHistory').execute();
      const hers = await kept(HOME, ALICE, [BOB]);
      const his = await kept(HOME, BOB, [ALICE]);
      const both = await Promise.all([history.optOut(ALICE, HOME), history.optOut(BOB, HOME)]);
      expect(both).toEqual([
        { changed: false, forgotten: 2 },
        { changed: false, forgotten: 2 },
      ]);
      expect(await named()).toEqual({
        parties: [
          { id: hers, serverId: HOME, createdById: null, conductorId: null },
          { id: his, serverId: HOME, createdById: null, conductorId: null },
        ],
        attendees: [
          { historyId: hers, seq: 0, memberId: null },
          { historyId: his, seq: 0, memberId: null },
        ],
      });
    }
  });

  it('forgets a member who opts out in every party of that server, and only there', async () => {
    await history.optIn(ALICE, HOME, NOW);
    await history.optIn(ALICE, AWAY, NOW);
    const first = await kept(HOME, ALICE, [ALICE, null, BOB]);
    const second = await kept(HOME, BOB, [BOB, ALICE]);
    const elsewhere = await kept(AWAY, ALICE, [ALICE]);

    // Named as maker, conductor and attendee of the first party: it counts once.
    expect(await history.optOut(ALICE, HOME)).toEqual({ changed: true, forgotten: 2 });
    expect(await history.isOptedIn(ALICE, HOME)).toBe(false);
    expect(await history.isOptedIn(ALICE, AWAY)).toBe(true);
    // The rows stay, without her id; the other server and the other member keep theirs.
    expect(await named()).toEqual({
      parties: [
        { id: first, serverId: HOME, createdById: null, conductorId: null },
        { id: second, serverId: HOME, createdById: BOB, conductorId: BOB },
        { id: elsewhere, serverId: AWAY, createdById: ALICE, conductorId: ALICE },
      ],
      attendees: [
        { historyId: first, seq: 0, memberId: null },
        { historyId: first, seq: 1, memberId: null },
        { historyId: first, seq: 2, memberId: BOB },
        { historyId: second, seq: 0, memberId: BOB },
        { historyId: second, seq: 1, memberId: null },
        { historyId: elsewhere, seq: 0, memberId: ALICE },
      ],
    });
  });

  it('forgets a member who opts out even when they were not opted in, or the server left', async () => {
    const id = await kept(NOWHERE, null, [ALICE]);
    expect(await history.optOut(ALICE, NOWHERE)).toEqual({ changed: false, forgotten: 1 });
    expect((await named()).attendees).toEqual([{ historyId: id, seq: 0, memberId: null }]);
    expect(await history.optOut(ALICE, HOME)).toEqual({ changed: false, forgotten: 0 });
  });
});
