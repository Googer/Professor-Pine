import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { wayspotId } from '../../../test/support/wayspot-cases.js';
import { polygonWkt } from '../spatial.js';
import type { DB } from '../types.js';
import { historyUseOf, reportUse, serverWayspots } from './2026_11_13_059_server_wayspots.js';

const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const THIRD = '412345678901234569';
const GONE = '412345678901234570';

function square(south: number, west: number, north: number, east: number) {
  return polygonWkt([
    { lat: south, lon: west },
    { lat: north, lon: west },
    { lat: north, lon: east },
    { lat: south, lon: east },
    { lat: south, lon: west },
  ]);
}

describe('migration 059: the Wayspots of each server', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await sql`delete from ServerWayspot`.execute(db);
    await sql`delete from Wayspot`.execute(db);
    await sql`delete from StopReport`.execute(db);
    await sql`delete from MeetupPlaceRuling`.execute(db);
    await sql`delete from PartyHistoryStop`.execute(db);
    await sql`delete from PartyHistory`.execute(db);
    await sql`delete from Region`.execute(db);
    await sql`delete from Guild`.execute(db);
  });

  /**
   * Three servers: Home has West, Away has Wide over West and East (their regions overlap), Third
   * none. Wayspot 1 in West, 2 in East (found gone), 3 to 7 in no region: 3 used by Third's max
   * battle, 4 by a server without a row, 5 a Power Spot stop of Away's train, 6 a stop Home
   * reported, 7 a place Third's moderators ruled on, 8 used by nobody.
   */
  const seed = async () => {
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY}), (3, ${THIRD})`.execute(
      db,
    );
    await sql`insert into Region (guildId, channelId, bounds) values
      (1, 100000000000000001, ST_PolygonFromText(${square(40.0, -80.1, 40.1, -80.0)})),
      (2, 100000000000000002, ST_PolygonFromText(${square(40.0, -80.1, 40.1, -79.9)}))`.execute(db);
    const place = (n: number): [number, number] =>
      n === 1 ? [40.05, -80.05] : n === 2 ? [40.05, -79.95] : [40.5 + n / 10, -80.05];
    await sql`insert into Wayspot
        (id, kind, formerKind, lat, lon, title, address, image, firstSeen, lastSeen) values ${sql.join(
          [1, 2, 3, 4, 5, 6, 7, 8].map((n) => {
            const [lat, lon] = place(n);
            return n === 2
              ? sql`(${wayspotId(n)}, 'gone', 'powerspot', ${lat}, ${lon}, 'Fountain', null, null, 100, 200)`
              : sql`(${wayspotId(n)}, 'stop', null, ${lat}, ${lon}, ${`Stop ${String(n)}`},
                  ${`${String(n)} Main St`}, ${`https://lh3.googleusercontent.com/${String(n)}`},
                  100, 300)`;
          }),
        )}`.execute(db);
    await sql`insert into PartyHistory (id, kind, source, ending, createdAt, serverId, wayspotId) values
      (1, 'raid', 'bot', 'ended', 1, ${THIRD}, ${wayspotId(3)}),
      (2, 'raid', 'bot', 'ended', 1, ${GONE}, ${wayspotId(4)}),
      (3, 'train', 'bot', 'ended', 1, ${AWAY}, null)`.execute(db);
    await sql`insert into PartyHistoryStop (historyId, seq, wayspotId) values (3, 0, ${wayspotId(5)})`.execute(
      db,
    );
    await sql`insert into StopReport
        (serverId, stopKey, kind, periodKey, subjectKey, reporterId, reporterName, madeAt,
         endsAt, stopName, lat, lon, detail)
      values (${HOME}, ${wayspotId(6)}, 'research', 'day', 'task', '1', 'Ash', 1, 2, 'Stop 6',
        40, -80, '{}')`.execute(db);
    await sql`insert into MeetupPlaceRuling (serverId, placeKind, placeId, ruling, ruledBy, ruledAt)
      values (${THIRD}, 'stop', ${wayspotId(7)}, 'allow', '1', 1)`.execute(db);
  };

  const copies = async () =>
    (
      await sql<{
        id: string;
        guildId: number;
      }>`select id, guildId from ServerWayspot order by id, guildId`.execute(db)
    ).rows.map((row) => [Number.parseInt(row.id, 16), row.guildId]);

  it('copies each Wayspot to the servers whose regions hold it, else to those that used it, else to every server', async () => {
    await seed();
    await serverWayspots.up(db);
    expect(await copies()).toEqual([
      [1, 1],
      [1, 2],
      [2, 2],
      [3, 3],
      // Used only by a server that has no row: as a Wayspot nobody used.
      [4, 1],
      [4, 2],
      [4, 3],
      [5, 2],
      [6, 1],
      [7, 3],
      [8, 1],
      [8, 2],
      [8, 3],
    ]);
  });

  it('copies every column as it was, a tombstone as a tombstone', async () => {
    await seed();
    await serverWayspots.up(db);
    const rows = await sql`select * from ServerWayspot where guildId = 2 and id in
      (${wayspotId(1)}, ${wayspotId(2)}) order by id`.execute(db);
    expect(rows.rows).toEqual([
      {
        guildId: 2,
        id: wayspotId(1),
        kind: 'stop',
        formerKind: null,
        lat: 40.05,
        lon: -80.05,
        title: 'Stop 1',
        address: '1 Main St',
        image: 'https://lh3.googleusercontent.com/1',
        firstSeen: '100',
        lastSeen: '300',
      },
      {
        guildId: 2,
        id: wayspotId(2),
        kind: 'gone',
        formerKind: 'powerspot',
        lat: 40.05,
        lon: -79.95,
        title: 'Fountain',
        address: null,
        image: null,
        firstSeen: '100',
        lastSeen: '200',
      },
    ]);
  });

  it('gives the same copies when it runs again after stopping half-way, and leaves Wayspot as it was', async () => {
    await seed();
    await serverWayspots.up(db);
    await sql`delete from ServerWayspot where guildId = 3`.execute(db);
    await serverWayspots.up(db);
    expect(await copies()).toHaveLength(13);
    const kept = await sql<{ n: number }>`select count(*) as n from Wayspot`.execute(db);
    expect(Number(kept.rows[0]?.n)).toBe(8);
  });

  it('goes with its server', async () => {
    await seed();
    await serverWayspots.up(db);
    await sql`delete from Guild where id = 3`.execute(db);
    expect((await copies()).filter(([, guildId]) => guildId === 3)).toEqual([]);
  });

  it('reads the history of the Wayspots in no region alone, through the Wayspot indexes', async () => {
    await seed();
    await serverWayspots.up(db);
    // A history of some size, of other Wayspots, so that the plan is the one a real history gets.
    const many = Array.from({ length: 300 }, (_, n) => wayspotId(n + 100));
    await sql`insert into PartyHistory (kind, source, ending, createdAt, serverId, wayspotId) values ${sql.join(
      many.map((id) => sql`('max', 'bot', 'ended', 1, ${HOME}, ${id})`),
    )}`.execute(db);
    await sql`insert into PartyHistoryStop (historyId, seq, wayspotId)
      select id, 0, wayspotId from PartyHistory where kind = 'max'`.execute(db);
    await sql`analyze table PartyHistory, PartyHistoryStop`.execute(db);
    const plan = await sql<{ table: string | null; key: string | null }>`
      explain format=traditional ${historyUseOf([wayspotId(3), wayspotId(4), wayspotId(5)])}`.execute(
      db,
    );
    const keyOf = (table: string) => plan.rows.find((row) => row.table === table)?.key;
    expect(keyOf('PartyHistoryStop')).toBe('partyhistorystop_wayspotid_index');
    const histories = plan.rows.filter((row) => row.table === 'PartyHistory');
    expect(histories.map((row) => row.key)).toContain('partyhistory_wayspotid_index');
    expect(histories.map((row) => row.key)).not.toContain(null);
  });

  it('reads the servers and stops of the reports from their key alone', async () => {
    await seed();
    const plan = await sql<{
      table: string | null;
      key: string | null;
    }>`explain format=traditional ${reportUse()}`.execute(db);
    expect(plan.rows.find((row) => row.table === 'StopReport')?.key).toBe(
      'stopreport_identity_unique',
    );
  });

  it('copies nothing in a database without Wayspots', async () => {
    await sql`insert into Guild (id, snowflake) values (1, ${HOME})`.execute(db);
    await serverWayspots.up(db);
    expect(await copies()).toEqual([]);
  });
});
