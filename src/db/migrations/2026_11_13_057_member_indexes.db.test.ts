import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type RawBuilder } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import { planOf, plansOf, scanned, type PlanRow } from '../../../test/support/query-plan.js';
import { HistoryRepository } from '../repositories/history-repository.js';
import { MeetupSafetyRepository } from '../repositories/meetup-safety-repository.js';
import { MemberDataRepository } from '../repositories/member-data-repository.js';
import { NewTrainRepository } from '../repositories/new-train-repository.js';
import { ReportRepository } from '../repositories/report-repository.js';
import { UnownGiftRepository } from '../repositories/unown-gift-repository.js';
import type { DB } from '../types.js';
import { memberIndexes } from './2026_11_13_057_member_indexes.js';

const CHANNEL = '512345678901234567';
const MESSAGE = '612345678901234567';
/** 2026-11-05 in the morning, UTC. */
const NOW = 1_793_000_000_000;
const MINUTE = 60_000;

/**
 * The indexes of migration 057 and what `information_schema.statistics` says of their parts in
 * order: a column by its name, an expression (a functional or multi-valued key part) by a piece
 * of its text, as `{ has }`.
 */
const INDEXES: [table: string, index: string, parts: (string | { has: string })[]][] = [
  ['ModerationReportReason', 'moderationreportreason_reporterid_index', ['reporterId']],
  ['MeetupRequest', 'meetuprequest_makerid_index', ['makerId']],
  ['MeetupAppeal', 'meetupappeal_memberid_index', ['memberId']],
  ['MeetupPlaceAsk', 'meetupplaceask_memberid_index', ['memberId']],
  ['StopReportHistory', 'stopreporthistory_reporterid_index', ['reporterId']],
  ['HistoryOptIn', 'historyoptin_memberid_index', ['memberId']],
  ['LeaderboardOptIn', 'leaderboardoptin_memberid_index', ['memberId']],
  ['LegacyFillIn', 'legacyfillin_memberid_index', ['memberId']],
  ['NewTrainNotification', 'newtrainnotification_memberid_index', ['memberId']],
  ['UnownWantGift', 'unownwantgift_memberid_index', ['memberId']],
  ['MeetupBlock', 'meetupblock_memberid_index', ['memberId']],
  // What the look counts that the removal leaves (X11): the staff's logs, what is live, and
  // what a member did as staff.
  ['PartyAudit', 'partyaudit_actorid_index', ['actorId']],
  ['PartyAudit', 'partyaudit_toid_index', [{ has: '$.to.id' }]],
  ['PartyAudit', 'partyaudit_fromid_index', [{ has: '$.from.id' }]],
  ['ServerSettingsAudit', 'serversettingsaudit_actorid_index', ['actorId']],
  ['StopReport', 'stopreport_reporterid_index', ['reporterId']],
  ['StopReport', 'stopreport_confirmedby_index', [{ has: 'array' }]],
  ['PartyAccessGrant', 'partyaccessgrant_memberid_index', ['memberId']],
  ['MeetupRequest', 'meetuprequest_decidedby_index', ['decidedBy']],
  ['MeetupAppeal', 'meetupappeal_decidedby_index', ['decidedBy']],
  ['MeetupPlaceAsk', 'meetupplaceask_decidedby_index', ['decidedBy']],
  ['MeetupPlaceRuling', 'meetupplaceruling_ruledby_index', ['ruledBy']],
  ['MeetupBlock', 'meetupblock_blockedby_index', ['blockedBy']],
  ['MeetupBlock', 'meetupblock_liftedby_index', ['liftedBy']],
  ['ModerationReport', 'moderationreport_decidedby_index', ['decidedBy']],
  ['ModerationReport', 'moderationreport_makerid_index', [{ has: '$.makerId' }]],
  ['ModerationReport', 'moderationreport_authorid_index', [{ has: '$.authorId' }]],
  ['RaidBossOverride', 'raidbossoverride_createdby_index', ['createdBy']],
  ['PineStop', 'pinestop_createdby_index', ['createdBy']],
  ['PineStop', 'pinestop_updatedby_index', ['updatedBy']],
  ['GymReview', 'gymreview_decidedby_index', ['decidedBy']],
  ['GymWayfarer', 'gymwayfarer_notinwayfarerby_index', ['notInWayfarerBy']],
  ['WayspotImport', 'wayspotimport_staffid_index', ['staffId']],
  ['EventWindow', 'eventwindow_setby_index', ['setBy']],
  ['ServerSettings', 'serversettings_updatedby_index', ['updatedBy']],
];

/** What `columnsOf` should find of an index's parts, none of them unique. */
const expected = (parts: readonly (string | { has: string })[]) =>
  parts.map((part) => ({
    part: typeof part === 'string' ? part : (expect.stringContaining(part.has) as unknown),
    unique: false,
  }));

/** Thirty servers and a hundred members, by their snowflakes. */
const SERVERS = 30;
const MEMBERS = 100;
const server = (n: number) => `41234567890123${String(n % SERVERS).padStart(4, '0')}`;
const member = (n: number) => `31234567890123${String(n % MEMBERS).padStart(4, '0')}`;
/** The member whose data the look counts. */
const LOOKED = member(7);
/** The member whose data is removed. */
const GONE = member(8);

/** Each table's key in a plan, as `Table:key`, the tables MySQL builds itself (`<…>`) left out. */
const keysOf = (plan: readonly PlanRow[]): string[] =>
  plan.flatMap((row) =>
    row.table === null || row.table.startsWith('<') ? [] : [`${row.table}:${String(row.key)}`],
  );

/** The tables of a plan not found by a key (`ref` or `range`), as `Table:type`. */
const unkeyed = (plan: readonly PlanRow[]): string[] =>
  plan.flatMap((row) =>
    row.table === null || row.table.startsWith('<') || ['ref', 'range'].includes(row.type ?? '')
      ? []
      : [`${row.table}:${String(row.type)}`],
  );

describe('migration 057: indexes that begin with the member, for the removal and its look', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let database: TestDatabase;

  beforeAll(async () => {
    ({ db, stop, database } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  /** An index's parts in order: a column's name, or an expression's text. */
  const columnsOf = async (table: string, index: string) => {
    const rows = await sql<{ part: string; unique: number | string }>`
      select coalesce(column_name, expression) as part, non_unique = 0 as \`unique\`
      from information_schema.statistics
      where table_schema = database() and table_name = ${table} and index_name = ${index}
      order by seq_in_index`.execute(db);
    return rows.rows.map((row) => ({ part: row.part, unique: Number(row.unique) === 1 }));
  };

  it('adds each index, none of them unique', async () => {
    for (const [table, index, parts] of INDEXES) {
      expect(await columnsOf(table, index), index).toEqual(expected(parts));
    }
  });

  it('runs again: what is there stays, what a failure half-way left out is added', async () => {
    await sql`drop index meetupappeal_memberid_index on MeetupAppeal`.execute(db);
    await sql`drop index unownwantgift_memberid_index on UnownWantGift`.execute(db);
    await sql`drop index partyaudit_toid_index on PartyAudit`.execute(db);
    await sql`drop index stopreport_confirmedby_index on StopReport`.execute(db);
    await memberIndexes.up(db);
    await memberIndexes.up(db);
    for (const [table, index, parts] of INDEXES) {
      expect(await columnsOf(table, index), index).toEqual(expected(parts));
    }
  });

  it('leaves an index of its name that somebody added by hand as it is', async () => {
    await sql`drop index meetupblock_memberid_index on MeetupBlock`.execute(db);
    await sql`create index meetupblock_memberid_index on MeetupBlock (memberId, blockedAt)`.execute(
      db,
    );
    try {
      await memberIndexes.up(db);
      expect(await columnsOf('MeetupBlock', 'meetupblock_memberid_index')).toEqual([
        { part: 'memberId', unique: false },
        { part: 'blockedAt', unique: false },
      ]);
    } finally {
      await sql`drop index meetupblock_memberid_index on MeetupBlock`.execute(db);
      await memberIndexes.up(db);
    }
    expect(await columnsOf('MeetupBlock', 'meetupblock_memberid_index')).toEqual([
      { part: 'memberId', unique: false },
    ]);
  });

  // What the schemas bound where the values are written (the log's `loggedMember`, a report's
  // subject, the stop reports' `confirmedBy`), the database refuses as well: widening an id is a
  // decision of a migration that widens its index.
  it('refuses what its JSON indexes cannot hold: a member id over 30 characters, a confirmation that is no id', async () => {
    const conductor = (from: string | null, to: string) =>
      db
        .insertInto('PartyAudit')
        .values({
          serverId: server(0),
          partyId: randomUUID(),
          at: String(NOW),
          actorId: null,
          action: 'conductor',
          detail: JSON.stringify({ from: from === null ? null : { id: from }, to: { id: to } }),
        })
        .execute();
    const confirmed = (confirmedBy: string) =>
      db
        .insertInto('StopReport')
        .values({
          serverId: server(0),
          stopKey: 'stop-refused',
          kind: 'research',
          periodKey: 'day:2026-11-05',
          endsAt: String(NOW),
          stopName: 'Fountain',
          lat: 40,
          lon: -80,
          subjectKey: '0'.repeat(16),
          detail: '{}',
          reporterId: LOOKED,
          reporterName: 'Trainer',
          madeAt: String(NOW),
          confirmedBy,
        })
        .execute();
    try {
      // The longest id the index holds is written; one character more is refused.
      const longest = '1'.repeat(30);
      const longer = '1'.repeat(31);
      await conductor(longest, longest);
      await expect(conductor(null, longer)).rejects.toThrow(
        "Data truncated for functional index 'partyaudit_toid_index'",
      );
      await expect(conductor(longer, LOOKED)).rejects.toThrow(
        "Data truncated for functional index 'partyaudit_fromid_index'",
      );
      const report = (subject: Record<string, string>) =>
        db
          .insertInto('ModerationReport')
          .values({
            id: randomUUID(),
            serverId: server(0),
            kind: subject.kind ?? 'party',
            subject: JSON.stringify(subject),
            createdAt: String(NOW),
            status: 'dismissed',
            decidedBy: LOOKED,
            decidedAt: String(NOW),
          })
          .execute();
      await report({ kind: 'party', makerId: longest });
      await expect(report({ kind: 'party', makerId: longer })).rejects.toThrow(
        "Data truncated for functional index 'moderationreport_makerid_index'",
      );
      await expect(report({ kind: 'message', authorId: longer })).rejects.toThrow(
        "Data truncated for functional index 'moderationreport_authorid_index'",
      );
      // Who confirmed: a list of ids alone, SQL null for none.
      await confirmed(JSON.stringify([longest, LOOKED]));
      await expect(confirmed('[null]')).rejects.toThrow(
        "Invalid JSON value for CAST for functional index 'stopreport_confirmedby_index'",
      );
      await expect(confirmed('null')).rejects.toThrow(
        "Invalid JSON value for CAST for functional index 'stopreport_confirmedby_index'",
      );
      await expect(confirmed(JSON.stringify([longer]))).rejects.toThrow(
        "Data too long for functional index 'stopreport_confirmedby_index'",
      );
      await expect(confirmed(JSON.stringify([{ id: LOOKED }]))).rejects.toThrow(
        "Cannot store an array or an object in a scalar key part of the index 'stopreport_confirmedby_index'",
      );
      await expect(confirmed(JSON.stringify({ id: LOOKED }))).rejects.toThrow(
        'CAST-ing JSON OBJECT type to array',
      );
    } finally {
      await db.deleteFrom('PartyAudit').execute();
      await db.deleteFrom('ModerationReport').execute();
      await db.deleteFrom('StopReport').execute();
    }
  });

  describe('beside thousands of rows of a hundred members in thirty servers', () => {
    // An instance of thirty servers and a hundred members: a third of the pairs of a server and a
    // member hold a switch of the history, a place on the boards, a request for the old bot's
    // history, a block, a new-train notice and a settled Unown want (1,000 rows each, some ten
    // servers a member); 3,000 records of the history, attendee rows, reports at stops, reasons
    // given on reports, meetup requests, appeals and asks about places, thirty of each a member.
    beforeAll(async () => {
      const rows = <T>(count: number, row: (n: number) => T): T[] =>
        Array.from({ length: count }, (_, n) => row(n));
      const at = (n: number) => String(NOW - n * MINUTE);
      const pairs = rows(SERVERS * MEMBERS, (n) => ({
        serverId: server(n % SERVERS),
        memberId: member(Math.floor(n / SERVERS)),
        n,
      })).filter(({ n }) => ((n % SERVERS) + Math.floor(n / SERVERS)) % 3 === 0);

      await db
        .insertInto('HistoryOptIn')
        .values(
          pairs.map(({ serverId, memberId, n }) => ({ serverId, memberId, createdAt: at(n) })),
        )
        .execute();
      await db
        .insertInto('LeaderboardOptIn')
        .values(
          pairs.map(({ serverId, memberId, n }) => ({ serverId, memberId, createdAt: at(n) })),
        )
        .execute();
      await db
        .insertInto('LegacyFillIn')
        .values(
          pairs.map(({ serverId, memberId, n }) => ({ serverId, memberId, requestedAt: at(n) })),
        )
        .execute();
      await db
        .insertInto('MeetupBlock')
        .values(
          // A third lifted by who blocked, a third by another moderator.
          pairs.map(({ serverId, memberId, n }) => ({
            serverId,
            memberId,
            blockedBy: member(n + 1),
            blockedAt: at(n),
            liftedBy: n % 3 === 0 ? member(n + 1) : n % 3 === 1 ? member(n + 2) : null,
            liftedAt: n % 3 === 2 ? null : at(n - 1),
          })),
        )
        .execute();
      await db
        .insertInto('Guild')
        .values(rows(SERVERS, (n) => ({ snowflake: server(n) })))
        .execute();
      const guilds = new Map(
        (await db.selectFrom('Guild').select(['id', 'snowflake']).execute()).map((row) => [
          row.snowflake,
          row.id,
        ]),
      );
      const byGuild = pairs.map(({ serverId, memberId, n }) => ({
        guildId: guilds.get(serverId) ?? 0,
        memberId,
        createdAt: at(n),
      }));
      await db.insertInto('NewTrainNotification').values(byGuild).execute();
      await db.insertInto('UnownWantGift').values(byGuild).execute();

      await db
        .insertInto('PartyHistory')
        .values(
          rows(3_000, (n) => ({
            source: 'live',
            partyId: randomUUID(),
            kind: n % 6 === 4 ? 'train' : n % 6 === 5 ? 'meetup' : 'raid',
            serverId: server(n),
            createdAt: at(n),
            ending: 'ended',
            createdById: member(n),
            conductorId: n % 6 === 4 ? member(n + 3) : null,
            name: n % 6 === 5 ? 'Community Day' : null,
          })),
        )
        .execute();
      await sql`insert into PartyHistoryAttendee (historyId, seq, memberId, status, furthest)
                select id, 0, concat('31234567890123', lpad(mod(id + 1, ${MEMBERS}), 4, '0')),
                       'done', 'done'
                from PartyHistory`.execute(db);
      await db
        .insertInto('StopReportHistory')
        .values(
          rows(3_000, (n) => ({
            reportId: n + 1,
            reportMadeAt: at(n + 1),
            serverId: server(n),
            kind: 'research',
            periodKey: 'day:2026-11-05',
            subjectKey: (n % 50).toString(16).padStart(16, '0'),
            detail: '{}',
            madeAt: at(n + 1),
            endsAt: at(n),
            endedAt: at(n),
            reporterId: member(n),
            ending: 'stood',
          })),
        )
        .execute();
      await db
        .insertInto('ModerationReportReason')
        .values(
          rows(3_000, (n) => ({
            reportId: randomUUID(),
            reporterId: member(n),
            reporterName: 'Trainer',
            text: 'Please',
            createdAt: at(n),
          })),
        )
        .execute();
      const requestStatus = (n: number) =>
        n % 300 === 1 ? 'pending' : n % 10 < 7 ? 'approved' : n % 10 < 9 ? 'refused' : 'expired';
      await db
        .insertInto('MeetupRequest')
        .values(
          rows(3_000, (n) => ({
            id: randomUUID(),
            serverId: server(n),
            regionChannelId: CHANNEL,
            makerId: member(n),
            place: '{}',
            name: 'Community Day',
            startTime: at(n),
            description: '',
            createdAt: at(n),
            expiresAt: at(n - 60),
            status: requestStatus(n),
            channelId: CHANNEL,
            messageId: MESSAGE,
            decidedAt: requestStatus(n) === 'pending' ? null : at(n + 60),
            decidedBy: requestStatus(n) === 'pending' ? null : member(n + 3),
            partyId: requestStatus(n) === 'approved' ? randomUUID() : null,
          })),
        )
        .execute();
      await db
        .insertInto('MeetupAppeal')
        .values(
          rows(3_000, (n) => ({
            id: randomUUID(),
            serverId: server(n),
            memberId: member(n),
            text: 'Please',
            createdAt: at(n),
            status: n % 2 === 0 ? 'lifted' : 'refused',
            decidedBy: member(n + 3),
            messageId: MESSAGE,
          })),
        )
        .execute();
      await db
        .insertInto('MeetupPlaceAsk')
        .values(
          rows(3_000, (n) => ({
            id: randomUUID(),
            serverId: server(n),
            placeKind: 'gym',
            placeId: String(n),
            place: '{}',
            memberId: member(n),
            text: 'Please',
            createdAt: at(n),
            status: n % 2 === 0 ? 'kept' : 'changed',
            decidedBy: member(n + 3),
            messageId: MESSAGE,
          })),
        )
        .execute();
      // What the look counts that the removal leaves (X11), thirty rows of each a member, the
      // rows that name a member twice among them: entries of the parties' log by Pine itself,
      // by a member alone, and of a conductor (a member who made themselves conductor, one
      // made conductor and taken off again); reports at stops some of which others confirmed;
      // reports about a party and about a message (some, as no report is, about both of one
      // member); stops of Pine's own changed by who made them or by another.
      const guildOf = (n: number) => guilds.get(server(n)) ?? 0;
      await db
        .insertInto('PartyAudit')
        .values(
          rows(3_000, (n) => {
            const conductor =
              n % 3 === 0
                ? { actorId: member(n), detail: { from: null, to: { id: member(n) } } }
                : n % 3 === 1
                  ? {
                      actorId: member(n + 1),
                      detail: { from: { id: member(n) }, to: { id: member(n) } },
                    }
                  : {
                      actorId: n % 9 === 2 ? null : member(n),
                      detail: { from: { id: member(n + 1) }, to: { id: member(n + 2) } },
                    };
            return {
              serverId: server(n),
              partyId: randomUUID(),
              at: at(n),
              actorId: conductor.actorId,
              action: 'conductor',
              detail: JSON.stringify(conductor.detail),
            };
          }),
        )
        .execute();
      await db
        .insertInto('ServerSettingsAudit')
        .values(
          rows(3_000, (n) => ({
            serverId: server(n),
            at: at(n),
            actorId: member(n),
            key: 'postNewGyms',
            before: 'false',
            after: 'true',
          })),
        )
        .execute();
      await db
        .insertInto('StopReport')
        .values(
          rows(3_000, (n) => ({
            serverId: server(n),
            stopKey: `stop-${String(n)}`,
            kind: 'research',
            periodKey: 'day:2026-11-05',
            endsAt: at(n - 600),
            stopName: 'Fountain',
            lat: 40,
            lon: -80,
            subjectKey: (n % 50).toString(16).padStart(16, '0'),
            detail: '{}',
            reporterId: member(n),
            reporterName: 'Trainer',
            madeAt: at(n),
            confirmedBy: n % 5 === 0 ? null : JSON.stringify([member(n + 1), member(n + 2)]),
          })),
        )
        .execute();
      await db
        .insertInto('PartyAccessGrant')
        .values(
          rows(3_000, (n) => ({
            forumChannelId: `51234567890123${String(n).padStart(4, '0')}`,
            memberId: member(n),
            guildId: guildOf(n),
            createdAt: at(n),
          })),
        )
        .execute();
      await db
        .insertInto('MeetupPlaceRuling')
        .values(
          rows(3_000, (n) => ({
            serverId: server(n),
            placeKind: 'gym',
            placeId: String(n),
            ruling: 'refuse',
            ruledBy: member(n),
            ruledAt: at(n),
          })),
        )
        .execute();
      await db
        .insertInto('ModerationReport')
        .values(
          rows(3_000, (n) => ({
            id: randomUUID(),
            serverId: server(n),
            kind: n % 2 === 0 ? 'party' : 'message',
            subject: JSON.stringify(
              n % 7 === 0
                ? { kind: 'party', makerId: member(n), authorId: member(n) }
                : n % 2 === 0
                  ? { kind: 'party', makerId: member(n) }
                  : { kind: 'message', authorId: member(n) },
            ),
            createdAt: at(n),
            status: 'dismissed',
            decidedBy: member(n + 4),
            decidedAt: at(n - 1),
          })),
        )
        .execute();
      await db
        .insertInto('RaidBossOverride')
        .values(
          rows(300, (n) => ({
            pokemonId: 'mewtwo',
            action: 'add',
            createdBy: member(n),
            createdAt: at(n),
          })),
        )
        .execute();
      await db
        .insertInto('PineStop')
        .values(
          rows(3_000, (n) => ({
            serverId: server(n),
            name: `Stop ${String(n)}`,
            lat: 40,
            lon: -80,
            createdBy: member(n),
            createdAt: at(n),
            updatedBy: n % 3 === 0 ? member(n) : member(n + 1),
            updatedAt: at(n - 1),
          })),
        )
        .execute();
      await db
        .insertInto('Gym')
        .values(rows(3_000, (n) => ({ id: n + 1, name: `Gym ${String(n)}`, lat: 40, lon: -80 })))
        .execute();
      await db
        .insertInto('GymWayfarer')
        .values(
          rows(3_000, (n) => ({
            gymId: n + 1,
            notInWayfarer: 1,
            notInWayfarerBy: member(n),
            notInWayfarerAt: at(n),
          })),
        )
        .execute();
      await db
        .insertInto('WayspotImport')
        .values(
          rows(300, (n) => ({
            guildId: guildOf(n),
            staffId: member(n),
            importedAt: at(n),
            counts: '{}',
          })),
        )
        .execute();
      await db
        .insertInto('GymReview')
        .values(
          rows(3_000, (n) => ({
            guildId: guildOf(n),
            gymId: n + 1,
            kind: 'new',
            candidates: '[]',
            createdAt: at(n),
            queuedAt: at(n),
            decidedAt: at(n - 1),
            decidedBy: member(n),
            decision: 'keep',
          })),
        )
        .execute();
      // The event window: one row at most, by its nature.
      await db
        .insertInto('EventWindow')
        .values({ id: 1, startsAt: at(0), endsAt: at(-60), setBy: LOOKED, setAt: at(0) })
        .execute();
      await db
        .insertInto('ServerSettings')
        .values(
          rows(SERVERS, (n) => ({
            serverId: server(n),
            settings: '{}',
            updatedAt: at(n),
            updatedBy: member(n),
          })),
        )
        .execute();

      await sql`analyze table HistoryOptIn, LeaderboardOptIn, LegacyFillIn, MeetupBlock,
                              NewTrainNotification, UnownWantGift, PartyHistory,
                              PartyHistoryAttendee, StopReportHistory, ModerationReportReason,
                              MeetupRequest, MeetupAppeal, MeetupPlaceAsk, PartyAudit,
                              ServerSettingsAudit, StopReport, PartyAccessGrant,
                              MeetupPlaceRuling, ModerationReport, RaidBossOverride, PineStop,
                              Gym, GymWayfarer, WayspotImport, GymReview, EventWindow,
                              ServerSettings`.execute(db);
    });

    it('finds the servers whose history names a member by keys that begin with the member, and counts their switches', async () => {
      const held = await new HistoryRepository(db).heldEverywhere(LOOKED);
      // Member 7 holds a switch in the servers n with (n + 7) divisible by three: ten of them.
      expect(held.optIns).toBe(10);
      expect(held.boards).toBe(10);
      expect(held.fillIns).toBe(10);
      // Thirty records made, a meetup with its name every sixth record: ten of theirs.
      expect(held.words).toBe(10);

      const plans = await plansOf(database, (seen) =>
        new HistoryRepository(seen).heldEverywhere(LOOKED),
      );
      // The first statement finds the servers (`serversNaming`), each branch of its union by
      // the member.
      const [naming] = plans;
      expect(keysOf(naming ?? []).sort()).toEqual(
        [
          'HistoryOptIn:historyoptin_memberid_index',
          'LeaderboardOptIn:leaderboardoptin_memberid_index',
          'LegacyFillIn:legacyfillin_memberid_index',
          'PartyHistory:partyhistory_createdbyid_index',
          'PartyHistory:partyhistory_conductorid_index',
          'a:partyhistoryattendee_memberid_index',
          'h:PRIMARY',
          'StopReportHistory:stopreporthistory_reporterid_index',
        ].sort(),
      );
      expect(scanned(naming ?? [])).toEqual([]);
      // Every branch finds its rows by the key (`ref`, `range`); the records of the attendee
      // rows found are read by their primary key, one row each.
      expect(unkeyed(naming ?? [])).toEqual(['h:eq_ref']);
      // The counts of one table each: the three switches, then what they wrote (`wordsCount`).
      const counts = plans.filter((plan) => plan.length === 1);
      expect(counts.map(keysOf)).toEqual([
        ['HistoryOptIn:historyoptin_memberid_index'],
        ['LeaderboardOptIn:leaderboardoptin_memberid_index'],
        ['LegacyFillIn:legacyfillin_memberid_index'],
        ['PartyHistory:partyhistory_createdbyid_index'],
      ]);
      expect(counts.flatMap(unkeyed)).toEqual([]);
    });

    it('counts a member’s meetup records and the reasons they gave by keys that begin with the member', async () => {
      const meetups = await planOf(database, (seen) =>
        new MeetupSafetyRepository(seen).heldOf(LOOKED),
      );
      expect(keysOf(meetups).sort()).toEqual(
        [
          'MeetupBlock:meetupblock_memberid_index',
          'MeetupRequest:meetuprequest_makerid_index',
          'MeetupAppeal:meetupappeal_memberid_index',
          'MeetupPlaceAsk:meetupplaceask_memberid_index',
        ].sort(),
      );
      expect(unkeyed(meetups)).toEqual([]);
      // The first of the two statements: the reasons they gave.
      const [reasons] = await plansOf(database, (seen) =>
        new ReportRepository(seen).heldOf(LOOKED),
      );
      expect(keysOf(reasons ?? [])).toEqual([
        'ModerationReportReason:moderationreportreason_reporterid_index',
      ]);
      expect(unkeyed(reasons ?? [])).toEqual([]);
      const trains = await planOf(database, (seen) => new NewTrainRepository(seen).countOf(LOOKED));
      expect(keysOf(trains)).toEqual(['NewTrainNotification:newtrainnotification_memberid_index']);
      expect(unkeyed(trains)).toEqual([]);
      const gifts = await planOf(database, (seen) => new UnownGiftRepository(seen).countOf(LOOKED));
      expect(keysOf(gifts)).toEqual(['UnownWantGift:unownwantgift_memberid_index']);
      expect(unkeyed(gifts)).toEqual([]);
    });

    it('finds the rows the removal takes or blanks by keys that begin with the member', async () => {
      const reasons = await plansOf(database, (seen) =>
        new ReportRepository(seen).forgetReporter(GONE),
      );
      expect(reasons.map(keysOf)).toEqual([
        ['ModerationReportReason:moderationreportreason_reporterid_index'],
        ['ModerationReportReason:PRIMARY'],
      ]);
      expect(reasons.flatMap(unkeyed)).toEqual([]);
      const meetups = await plansOf(database, (seen) =>
        new MeetupSafetyRepository(seen).forgetMember(GONE),
      );
      // Their requests, appeals and asks that are over, then each changed by its ids.
      expect(meetups.slice(0, 3).map(keysOf)).toEqual([
        ['MeetupRequest:meetuprequest_makerid_index'],
        ['MeetupAppeal:meetupappeal_memberid_index'],
        ['MeetupPlaceAsk:meetupplaceask_memberid_index'],
      ]);
      expect(meetups.flatMap(unkeyed)).toEqual([]);
      const [trains] = await plansOf(database, (seen) => new NewTrainRepository(seen).forget(GONE));
      expect(keysOf(trains ?? [])).toEqual([
        'NewTrainNotification:newtrainnotification_memberid_index',
      ]);
      expect(unkeyed(trains ?? [])).toEqual([]);
      const [gifts] = await plansOf(database, (seen) => new UnownGiftRepository(seen).forget(GONE));
      expect(keysOf(gifts ?? [])).toEqual(['UnownWantGift:unownwantgift_memberid_index']);
      expect(unkeyed(gifts ?? [])).toEqual([]);
      // The history's servers are found as the look finds them, in the removal's transaction.
      const [naming] = await plansOf(database, (seen) =>
        new HistoryRepository(seen).forgetEverywhere(GONE),
      );
      expect(keysOf(naming ?? [])).toContain('HistoryOptIn:historyoptin_memberid_index');
      expect(keysOf(naming ?? [])).toContain(
        'StopReportHistory:stopreporthistory_reporterid_index',
      );
      expect(scanned(naming ?? [])).toEqual([]);
      expect(unkeyed(naming ?? [])).toEqual(['h:eq_ref']);
    });

    /**
     * What the look counts that the removal leaves, as one read of each table with `or` counts
     * it (the look's reads before migration 057): each row once, however many ways it names
     * the member.
     */
    const leftByOr = async (memberId: string) => {
      const counted = await sql<Record<string, number | string>>`
        select
          (select count(*) from PartyAudit
            where actorId = ${memberId}
               or json_unquote(json_extract(detail, '$.to.id')) = ${memberId}
               or json_unquote(json_extract(detail, '$.from.id')) = ${memberId})
            + (select count(*) from ServerSettingsAudit where actorId = ${memberId}) as audit,
          (select count(*) from StopReport where reporterId = ${memberId}) as stopReports,
          (select count(*) from StopReport
            where json_contains(confirmedBy, json_quote(${memberId}))) as stopConfirms,
          (select count(*) from PartyAccessGrant where memberId = ${memberId}) as accessGrants,
          (select count(*) from MeetupRequest where decidedBy = ${memberId})
            + (select count(*) from MeetupAppeal where decidedBy = ${memberId})
            + (select count(*) from MeetupPlaceAsk where decidedBy = ${memberId})
            + (select count(*) from MeetupPlaceRuling where ruledBy = ${memberId})
            + (select count(*) from MeetupBlock
                where blockedBy = ${memberId} or liftedBy = ${memberId})
            + (select count(*) from ModerationReport where decidedBy = ${memberId})
            + (select count(*) from RaidBossOverride where createdBy = ${memberId})
            + (select count(*) from PineStop
                where createdBy = ${memberId} or updatedBy = ${memberId})
            + (select count(*) from GymReview where decidedBy = ${memberId})
            + (select count(*) from GymWayfarer where notInWayfarerBy = ${memberId})
            + (select count(*) from WayspotImport where staffId = ${memberId})
            + (select count(*) from EventWindow where setBy = ${memberId})
            + (select count(*) from ServerSettings where updatedBy = ${memberId})
            as staffActs`.execute(db);
      const row = counted.rows[0] ?? {};
      return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
    };

    /** How many rows of a table match `where`: the seed's rows that name a member twice. */
    const matching = async (table: string, where: RawBuilder<unknown>) => {
      const counted = await sql<{ n: number | string }>`
        select count(*) as n from ${sql.table(table)} where ${where}`.execute(db);
      return Number(counted.rows[0]?.n ?? 0);
    };

    it('counts what the removal leaves of a member by keys that begin with the member, a row that names them twice once', async () => {
      // Rows that name the member in two ways, which two of the reads find.
      const twice = {
        actorAndConductor: await matching(
          'PartyAudit',
          sql`actorId = ${LOOKED} and json_unquote(json_extract(detail, '$.to.id')) = ${LOOKED}`,
        ),
        conductorBeforeAndAfter: await matching(
          'PartyAudit',
          sql`json_unquote(json_extract(detail, '$.from.id')) = ${LOOKED}
              and json_unquote(json_extract(detail, '$.to.id')) = ${LOOKED}`,
        ),
        blockedAndLifted: await matching(
          'MeetupBlock',
          sql`blockedBy = ${LOOKED} and liftedBy = ${LOOKED}`,
        ),
        madeAndChanged: await matching(
          'PineStop',
          sql`createdBy = ${LOOKED} and updatedBy = ${LOOKED}`,
        ),
      };
      for (const [what, count] of Object.entries(twice)) expect(count, what).toBeGreaterThan(0);

      const held = await new MemberDataRepository(db).held(LOOKED);
      const { audit, stopReports, stopConfirms, accessGrants, staffActs } = held;
      expect({ audit, stopReports, stopConfirms, accessGrants, staffActs }).toEqual(
        await leftByOr(LOOKED),
      );
      expect(stopReports).toBe(30);
      expect(accessGrants).toBe(30);

      const plans = await plansOf(database, (seen) => new MemberDataRepository(seen).held(LOOKED));
      const left = plans.find((plan) => keysOf(plan).some((key) => key.startsWith('PartyAudit:')));
      expect(keysOf(left ?? []).sort()).toEqual(
        [
          'PartyAudit:partyaudit_actorid_index',
          'PartyAudit:partyaudit_toid_index',
          'PartyAudit:partyaudit_fromid_index',
          'ServerSettingsAudit:serversettingsaudit_actorid_index',
          'StopReport:stopreport_reporterid_index',
          'StopReport:stopreport_confirmedby_index',
          'PartyAccessGrant:partyaccessgrant_memberid_index',
          'MeetupRequest:meetuprequest_decidedby_index',
          'MeetupAppeal:meetupappeal_decidedby_index',
          'MeetupPlaceAsk:meetupplaceask_decidedby_index',
          'MeetupPlaceRuling:meetupplaceruling_ruledby_index',
          'MeetupBlock:meetupblock_blockedby_index',
          'MeetupBlock:meetupblock_liftedby_index',
          'ModerationReport:moderationreport_decidedby_index',
          'RaidBossOverride:raidbossoverride_createdby_index',
          'PineStop:pinestop_createdby_index',
          'PineStop:pinestop_updatedby_index',
          'GymReview:gymreview_decidedby_index',
          'GymWayfarer:gymwayfarer_notinwayfarerby_index',
          'WayspotImport:wayspotimport_staffid_index',
          'EventWindow:eventwindow_setby_index',
          'ServerSettings:serversettings_updatedby_index',
        ].sort(),
      );
      expect(unkeyed(left ?? [])).toEqual([]);
    });

    it('counts the reports about a member by keys of the subject’s member, a report about them twice once', async () => {
      const both = await matching(
        'ModerationReport',
        sql`json_unquote(json_extract(subject, '$.makerId')) = ${LOOKED}
            and json_unquote(json_extract(subject, '$.authorId')) = ${LOOKED}`,
      );
      expect(both).toBeGreaterThan(0);
      const byOr = await matching(
        'ModerationReport',
        sql`json_unquote(json_extract(subject, '$.makerId')) = ${LOOKED}
            or json_unquote(json_extract(subject, '$.authorId')) = ${LOOKED}`,
      );
      // Thirty reports about them: of a party, of a message, or (five) of both.
      expect(byOr).toBe(30);
      expect((await new ReportRepository(db).heldOf(LOOKED)).about).toBe(byOr);

      const [, about] = await plansOf(database, (seen) =>
        new ReportRepository(seen).heldOf(LOOKED),
      );
      expect(keysOf(about ?? []).sort()).toEqual(
        [
          'ModerationReport:moderationreport_makerid_index',
          'ModerationReport:moderationreport_authorid_index',
        ].sort(),
      );
      expect(unkeyed(about ?? [])).toEqual([]);
    });
  });
});
