import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { ALICE, at, BOB } from '../../../test/support/parties.js';
import type {
  HistoryAttendee,
  HistoryRecord,
  HistoryStatus,
} from '../../domain/history/party-history.js';
import type { DB } from '../types.js';
import { HistoryRepository } from './history-repository.js';

/**
 * The questions of docs/architecture/history.md, asked of a small history: every ```sql block
 * there with a name is run as it is written (after the doc's own `set` of `@guild` and `@zone`),
 * and its answer checked here. The doc is where the queries live; a query added there needs its
 * answer here.
 */
const DOC = path.resolve(import.meta.dirname, '../../../docs/architecture/history.md');

function documentedQueries(): Map<string, string> {
  const text = readFileSync(DOC, 'utf8').replace(/\r\n/gu, '\n');
  const queries = new Map<string, string>();
  for (const match of text.matchAll(/```sql (\S+)\n([\s\S]*?)```/gu)) {
    const [, name, query] = match;
    if (name !== undefined && query !== undefined) queries.set(name, query.trim());
  }
  return queries;
}

const MINUTE = 60_000;

function attendee(furthest: HistoryStatus, more: Partial<HistoryAttendee> = {}): HistoryAttendee {
  return {
    memberId: null,
    status: furthest,
    furthest,
    groupId: 'A',
    extras: 0,
    remote: false,
    team: null,
    signedUpAt: null,
    joinedAt: null,
    hereAt: null,
    doneAt: null,
    leftAt: null,
    ...more,
  };
}

let next = 0;
function record(more: Partial<HistoryRecord>): HistoryRecord {
  next += 1;
  return {
    source: 'live',
    partyId: `00000000-0000-4000-8000-${String(next).padStart(12, '0')}`,
    legacyKey: null,
    kind: 'raid',
    serverId: '412345678901234567',
    regionId: 1,
    gymId: 1,
    legacyGymId: null,
    wayspotId: null,
    name: null,
    description: null,
    tier: 'T5',
    shadow: false,
    mega: false,
    elite: false,
    ex: false,
    shiny: null,
    boss: null,
    fastMove: null,
    chargedMove: null,
    createdAt: at('2026-07-04T18:00'),
    hatchTime: null,
    startTime: null,
    endTime: null,
    endedAt: null,
    ending: 'completed',
    createdById: null,
    conductorId: null,
    anonymous: false,
    routeStops: null,
    trainKind: null,
    splitFromId: null,
    attendees: [],
    groups: [],
    stops: [],
    ...more,
  };
}

const mewtwo = { key: 'mewtwo', dex: 150, species: 'MEWTWO', form: null };

/** The history the questions are asked of (all in New York time). */
function history(): HistoryRecord[] {
  const july = at('2026-07-04T18:00'); // a Saturday in summer
  const january = at('2026-01-10T12:00'); // a Saturday in winter
  return [
    record({
      boss: mewtwo,
      createdAt: july,
      hatchTime: july + 30 * MINUTE,
      attendees: [
        attendee('done', { memberId: ALICE, extras: 1, joinedAt: july + 5 * MINUTE }),
        attendee('here', { joinedAt: july + 10 * MINUTE }),
        attendee('interested'),
        attendee('joined', { joinedAt: july + 20 * MINUTE }),
      ],
    }),
    record({
      boss: mewtwo,
      createdAt: january,
      hatchTime: january + 20 * MINUTE,
      attendees: [
        attendee('done', { memberId: ALICE, joinedAt: january + MINUTE }),
        attendee('done', { extras: 2, joinedAt: january + 2 * MINUTE }),
        attendee('done', { joinedAt: january + 30 * MINUTE }),
      ],
    }),
    // From the legacy files: a tier 3 boss the catalogue does not know, reported on a Tuesday.
    record({
      source: 'legacy',
      partyId: null,
      legacyKey: '310000000000000001:1554207300000',
      regionId: 2,
      gymId: 2,
      legacyGymId: 2,
      tier: 'T3',
      boss: { name: 'Unheardofmon' },
      createdAt: at('2019-04-02T08:15'),
      ending: 'unknown',
      attendees: [attendee('interested')],
    }),
    // Nobody came: Alice said she would.
    record({
      regionId: 2,
      gymId: 2,
      tier: 'Mega',
      mega: true,
      boss: { key: 'charizard_mega_x', dex: 6, species: 'CHARIZARD', form: 'CHARIZARD_MEGA_X' },
      createdAt: at('2026-10-14T17:45'),
      hatchTime: at('2026-10-14T18:00'),
      ending: 'expired',
      attendees: [attendee('joined', { memberId: ALICE, joinedAt: at('2026-10-14T17:50') })],
    }),
    record({
      kind: 'train',
      gymId: null,
      tier: null,
      name: 'Saturday legendaries',
      createdAt: at('2026-10-16T20:00'),
      startTime: at('2026-10-17T10:00'),
      routeStops: 3,
      trainKind: 'raid',
      attendees: [attendee('here', { memberId: ALICE })],
      stops: [
        {
          gymId: 1,
          legacyGymId: null,
          wayspotId: null,
          arrivedAt: at('2026-10-17T10:00'),
          leftAt: at('2026-10-17T10:20'),
        },
        {
          gymId: 2,
          legacyGymId: null,
          wayspotId: null,
          arrivedAt: at('2026-10-17T10:30'),
          leftAt: at('2026-10-17T10:50'),
        },
        // A power spot of the route (plan 8X-4): a stop made, but no gym's.
        {
          gymId: null,
          legacyGymId: null,
          wayspotId: '0123456789abcdef0123456789abcdef.16',
          arrivedAt: at('2026-10-17T10:52'),
          leftAt: at('2026-10-17T10:58'),
        },
        {
          gymId: 1,
          legacyGymId: null,
          wayspotId: null,
          arrivedAt: at('2026-10-17T11:00'),
          leftAt: null,
        },
      ],
    }),
    // A meetup Alice was at: a party she took part in, but no raid she completed.
    record({
      kind: 'meetup',
      gymId: null,
      tier: null,
      name: 'Picnic',
      createdAt: at('2026-10-18T12:00'),
      attendees: [attendee('done', { memberId: ALICE })],
    }),
    // Another server: in no answer.
    record({
      serverId: '412345678901234568',
      regionId: 3,
      boss: mewtwo,
      attendees: [attendee('done', { memberId: BOB })],
    }),
  ];
}

/** Numbers as numbers (MySQL gives counts and sums as text); ids and dates stay as they are. */
function plainRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === 'string' && /^-?\d{1,12}(\.\d+)?$/u.test(value) ? Number(value) : value,
    ]),
  );
}

const ANSWERS: Record<string, Record<string, unknown>[]> = {
  'most-active-members': [{ memberId: ALICE, parties: 4, completed: 2 }],
  'raids-per-gym': [
    { gymId: 1, name: 'Library', raids: 2 },
    { gymId: 2, name: 'Fountain', raids: 2 },
  ],
  'raids-per-region': [
    { regionId: 1, channelId: '1234567890123456788', raids: 2 },
    { regionId: 2, channelId: '1234567890123456789', raids: 2 },
  ],
  'raids-per-boss': [
    { boss: 'mewtwo', raids: 2 },
    { boss: 'charizard_mega_x', raids: 1 },
    { boss: 'Unheardofmon', raids: 1 },
  ],
  'raids-per-tier': [
    { tier: 'T5', raids: 2 },
    { tier: 'Mega', raids: 1 },
    { tier: 'T3', raids: 1 },
  ],
  'largest-groups': [
    { boss: 'mewtwo', raids: 2, averageCame: 4, mostCame: 5 },
    { boss: 'charizard_mega_x', raids: 1, averageCame: 0, mostCame: 0 },
    { boss: 'Unheardofmon', raids: 1, averageCame: 0, mostCame: 0 },
  ],
  'raids-by-hour': [
    { hour: 8, raids: 1 },
    { hour: 12, raids: 1 },
    { hour: 18, raids: 2 },
  ],
  'raids-by-weekday': [
    { weekday: 'Tuesday', raids: 1 },
    { weekday: 'Wednesday', raids: 1 },
    { weekday: 'Saturday', raids: 2 },
  ],
  'raids-by-month': [
    { month: '2019-04', raids: 1 },
    { month: '2026-01', raids: 1 },
    { month: '2026-07', raids: 1 },
    { month: '2026-10', raids: 1 },
  ],
  'raids-by-season': [
    { season: 'winter', raids: 1 },
    { season: 'spring', raids: 1 },
    { season: 'summer', raids: 1 },
    { season: 'autumn', raids: 1 },
  ],
  'how-fast-groups-filled': [{ raids: 2, averageMinutes: 25 }],
  'signed-up-never-came': [
    { furthest: 'interested', members: 1 },
    { furthest: 'joined', members: 1 },
  ],
  'trains-by-length': [
    { name: 'Saturday legendaries', routeStops: 3, stopsMade: 4, gyms: 2, minutes: 58 },
  ],
  'busiest-gyms': [
    { gymId: 1, name: 'Library', lat: 40.44, lon: -79.95, visits: 4 },
    { gymId: 2, name: 'Fountain', lat: 40.45, lon: -79.96, visits: 3 },
  ],
};

describe('the questions of docs/architecture/history.md', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    await sql`insert into Guild (id, snowflake)
              values (1, '412345678901234567'), (2, '412345678901234568')`.execute(db);
    await sql`insert into Region (id, guildId, channelId)
              values (1, 1, 1234567890123456788), (2, 1, 1234567890123456789),
                     (3, 2, 1234567890123456790)`.execute(db);
    await sql`insert into Gym (id, name, lat, lon)
              values (1, 'Library', 40.44, -79.95), (2, 'Fountain', 40.45, -79.96)`.execute(db);
    await new HistoryRepository(db).insertRecords(history());
  });
  afterAll(async () => {
    await stop();
  });

  const queries = documentedQueries();

  it('has a name for every sql block there, so that none goes untested', () => {
    const text = readFileSync(DOC, 'utf8');
    const fences = text.match(/```sql\b[^\n]*/gu) ?? [];
    expect(fences.filter((fence) => !/^```sql \S+$/u.test(fence.trimEnd()))).toEqual([]);
    expect(fences).toHaveLength(queries.size);
  });

  it('has an answer here for every question there', () => {
    expect([...queries.keys()].filter((name) => name !== 'setup').sort()).toEqual(
      Object.keys(ANSWERS).sort(),
    );
  });

  it.each(Object.entries(ANSWERS))('answers %s', async (name, answer) => {
    const setup = queries.get('setup');
    const query = queries.get(name);
    if (setup === undefined || query === undefined) throw new Error(`no query ${name}`);
    // The doc's own setup, with the server of these rows: one connection for both.
    const rows = await db.connection().execute(async (connection) => {
      await sql.raw(setup.replace("'<server id>'", "'412345678901234567'")).execute(connection);
      return (await sql.raw<Record<string, unknown>>(query).execute(connection)).rows;
    });
    expect(rows.map(plainRow)).toEqual(answer);
  });
});
