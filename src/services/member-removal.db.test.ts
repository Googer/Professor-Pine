import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MOD,
  newAppeal,
  newAsk,
  newRequest,
  OTHER_SERVER,
  requestId,
  SAFETY_SERVER,
} from '../../test/support/meetup-safety-cases.js';
import { startMigratedDatabase } from '../../test/support/migrated-db.js';
import { testMeetup, testRaid, withAttendees } from '../../test/support/parties.js';
import { messageSubject, newReport, partySubject } from '../../test/support/report-cases.js';
import { eggReading } from '../../test/support/screenshots.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { sessionId, storedSession } from '../../test/support/web-session-cases.js';
import { indexRouteGyms } from '../db/migrations/2026_11_13_056_gym_servers.js';
import { DmContactRepository } from '../db/repositories/dm-contact-repository.js';
import { HistoryRepository } from '../db/repositories/history-repository.js';
import { MeetupSafetyRepository } from '../db/repositories/meetup-safety-repository.js';
import {
  MemberDataRepository,
  MemberRemovalError,
  REMOVAL_STEPS,
} from '../db/repositories/member-data-repository.js';
import { NewTrainRepository } from '../db/repositories/new-train-repository.js';
import { ReportRepository } from '../db/repositories/report-repository.js';
import { RowIds } from '../db/repositories/row-ids.js';
import { ScriptAccessRepository } from '../db/repositories/script-access-repository.js';
import { UnownGiftRepository } from '../db/repositories/unown-gift-repository.js';
import { UserRepository } from '../db/repositories/user-repository.js';
import { WebSessionRepository } from '../db/repositories/web-session-repository.js';
import type { DB } from '../db/types.js';
import type { Decider } from '../domain/meetups/records.js';
import type { Party } from '../domain/party/party.js';
import { storedReport } from '../domain/ocr/screenshot-record.js';
import { memberIndexServers, writeServerIndex } from '../ops/legacy-index.js';
import { MemberRemoval, removable } from './member-removal.js';
import { ScreenshotStore, type NewScreenshot } from './screenshot-store.js';

// Invented ids: nothing here comes from a real server.
const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const NOBODY = '312345678901234569';
const STRANGER = '312345678901234570';
const OWNER = '223456789012345678';
const HOME = SAFETY_SERVER;
const AWAY = OTHER_SERVER;
const NOW = 1_800_000_000_000;
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

type Row = Record<string, unknown>;
type Dump = Record<string, Row[]>;

/** A screenshot of an egg as the reader keeps one, sent by `senderId`. */
function shot(senderId: string, refused = false): NewScreenshot {
  return {
    guildId: HOME,
    use: 'raid',
    senderId,
    uploadedAt: NOW,
    fileTakenAt: null,
    timeFrom: 'clock',
    reading: eggReading('Heinz Plant', 5, { hour: 13, minute: 39 }),
    report: storedReport({
      gym: { read: 'Heinz Plant', searched: 'Heinz Plant', gymId: 7, place: 'local', clear: true },
      stage: 'egg',
      heads: 5,
      tier: { level: 'T5', shadow: false },
      tierFrom: 'heads',
      cp: null,
      bossName: null,
      boss: null,
      bossFrom: null,
      eliteBadge: false,
      purple: 0,
      clock: { hour: 13, minute: 39 },
      countdown: 1800,
      takenAt: 0,
      timeFrom: 'clock',
      time: { hatch: 1_800_000 },
      doubts: [],
    }),
    typed: null,
    decision: refused ? { kind: 'refuse', reason: 'not-a-raid-screen' } : { kind: 'report' },
    bosses: [],
  };
}

describe('MemberRemoval over the database and the folders (plan 8G, `/operator forget`)', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let users: UserRepository;
  let history: HistoryRepository;
  let safety: MeetupSafetyRepository;
  let reports: ReportRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    users = new UserRepository(db);
    history = new HistoryRepository(db);
    safety = new MeetupSafetyRepository(db);
    reports = new ReportRepository(db);
  });
  afterAll(async () => {
    await stop();
  });

  /** Every table the bot's migrations made or took over, by name. */
  const tables = async (): Promise<string[]> => {
    const found = await sql<{ name: string }>`
      select table_name as name from information_schema.tables
      where table_schema = database() and table_type = 'BASE TABLE'`.execute(db);
    return found.rows.map((row) => row.name).filter((name) => !name.startsWith('kysely_'));
  };
  /** Every row of every table, each table's in an order of their own text. */
  const dump = async (): Promise<Dump> => {
    const all: Dump = {};
    for (const table of await tables()) {
      const rows = await sql<Row>`select * from ${sql.table(table)}`.execute(db);
      all[table] = rows.rows
        .map((row) => ({ ...row }))
        .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
    }
    return all;
  };

  beforeEach(async () => {
    for (const table of await tables()) {
      // Children go with their parents; the order does not matter with the checks off.
      await sql`set foreign_key_checks = 0`.execute(db);
      await sql`delete from ${sql.table(table)}`.execute(db);
    }
    await sql`set foreign_key_checks = 1`.execute(db);
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
    await sql`insert into Region (id, guildId, channelId)
              values (1, 1, 1234567890123456788), (2, 2, 1234567890123456789)`.execute(db);
  });

  /**
   * A party of the history in a server, made and led by `creator`, with these attendees, named
   * and described by its maker when `words` says so.
   */
  const kept = async (
    server: string,
    creator: string | null,
    members: string[],
    words: { name: string; description: string } | null = null,
  ) => {
    await sql`insert into PartyHistory (source, kind, serverId, createdAt, ending, createdById,
                                        conductorId, name, description)
              values ('live', 'train', ${server}, ${NOW}, 'completed', ${creator},
                      ${creator}, ${words?.name ?? null}, ${words?.description ?? null})`.execute(
      db,
    );
    const id = Number(
      (await sql<{ id: number }>`select max(id) as id from PartyHistory`.execute(db)).rows[0]?.id,
    );
    for (const [seq, member] of members.entries()) {
      await sql`insert into PartyHistoryAttendee (historyId, seq, memberId, status, furthest)
                values (${id}, ${seq}, ${member}, 'here', 'here')`.execute(db);
    }
  };

  /**
   * Everything Pine can hold of one member, in two servers: what the removal takes, what it
   * blanks and what it leaves. `n` keeps the two members' rows apart.
   */
  const seed = async (member: string, name: string, n: number) => {
    await users.update(member, {
      friendCode: `${String(n)}111 2222 3333`,
      nickname: `${name}Go`,
      pokebattlerId: 40 + n,
    });
    const userId = await users.ensure(member);
    for (const guild of [1, 2]) {
      await sql`insert into PokemonNotification (pokemon, guildId, userId)
                values (150, ${guild}, ${userId})`.execute(db);
      await sql`insert into TargetWant (guildId, userId, target, createdAt)
                values (${guild}, ${userId}, 'reward:pokemon:147', ${NOW})`.execute(db);
      await sql`insert into GymNotification (gym, userId, guildId)
                values ('12', ${userId}, ${guild})`.execute(db);
      await sql`insert into SavedRoutes (userId, name, region, gyms)
                values (${userId}, 'Loop', ${guild}, '1,2')`.execute(db);
    }
    // The gyms of the routes beside them (migration 056).
    await indexRouteGyms(db);
    for (const server of [HOME, AWAY]) {
      await new NewTrainRepository(db).set(member, server, true, NOW);
      await new UnownGiftRepository(db).record(member, server, NOW);
    }
    // The history: on in both servers, on the boards and asked for the old bot's in one.
    await history.joinBoards(member, HOME, NOW);
    await history.optIn(member, AWAY, NOW);
    await db
      .insertInto('LegacyFillIn')
      .values({ serverId: HOME, memberId: member, requestedAt: String(NOW) })
      .execute();
    await kept(HOME, member, [member], {
      name: `${name}’s Tuesday walk`,
      description: `Call ${name} at 555-0100`,
    });
    await kept(AWAY, null, [member]);
    await db
      .insertInto('StopReportHistory')
      .values({
        reportId: n,
        reportMadeAt: String(NOW),
        serverId: HOME,
        kind: 'research',
        periodKey: 'day:2027-01-15',
        subjectKey: 'a'.repeat(16),
        detail: JSON.stringify({}),
        madeAt: String(NOW),
        endsAt: String(NOW + 1),
        endedAt: String(NOW + 1),
        reporterId: member,
        ending: 'stood',
      })
      .execute();
    // Two web logins and a row of access to the export tool.
    const sessions = new WebSessionRepository(db);
    await sessions.create({ ...storedSession(sessionId(n * 16 + 1), NOW, member), userName: name });
    await sessions.create({ ...storedSession(sessionId(n * 16 + 2), NOW, member), userName: name });
    await new ScriptAccessRepository(db).ask({
      userId: member,
      name,
      community: `${name}’s raiders`,
      at: NOW,
    });
    // Pine has sent them a direct message (plan 19B-5).
    await new DmContactRepository(db).add(member, NOW);
    // A report they made, and one about a message they wrote.
    await reports.addReport(newReport(n * 10 + 1, partySubject({ partyId: requestId(700 + n) })), {
      reporterId: member,
      reporterName: name,
      text: `${name} says it is a yard.`,
      at: NOW,
    });
    await reports.addReport(
      newReport(
        n * 10 + 2,
        messageSubject({
          messageId: `80000000000000000${String(n)}`,
          authorId: member,
          authorName: name,
        }),
      ),
      { reporterId: STRANGER, reporterName: 'Stranger', text: 'Rude.', at: NOW },
    );
    // Meetup safety: a request refused and one waiting, an appeal kept, an ask expired, a block.
    await safety.addRequest(newRequest(n * 10 + 1, { makerId: member, makerName: name }));
    await safety.decideRequest(requestId(n * 10 + 1), 'refused', 'refuse', MOD);
    await safety.addRequest(newRequest(n * 10 + 2, { makerId: member, makerName: name }));
    await safety.addAppeal(newAppeal(n * 10 + 1, { memberId: member, memberName: name }));
    await safety.decideAppeal(requestId(100 + n * 10 + 1), 'kept', MOD);
    await safety.addAsk(newAsk(n * 10 + 1, { memberId: member, memberName: name }));
    await safety.expireAsk(requestId(300 + n * 10 + 1));
    await safety.addBlock(HOME, member, MOD, name);
    // What they did as staff: a ruling, a boss override, a stop of Pine's own.
    await safety.rule(HOME, { kind: 'gym', id: String(n) }, 'refuse', {
      id: member,
      name,
      at: NOW,
    });
    await sql`insert into RaidBossOverride (pokemonId, action, createdBy, createdAt)
              values ('mewtwo', 'add', ${member}, ${NOW})`.execute(db);
    await sql`insert into PineStop (serverId, name, lat, lon, createdBy, createdAt, updatedBy,
                                    updatedAt)
              values (${HOME}, ${`Stop ${String(n)}`}, 40, -80, ${member}, ${NOW}, ${member},
                      ${NOW})`.execute(db);
    // The event window, a gym marked not in Wayfarer, an import and its review decided.
    const as: Decider = { id: member, name, at: NOW };
    await sql`insert into EventWindow (id, startsAt, endsAt, setBy, setAt)
              values (${n}, ${NOW}, ${NOW + 1}, ${member}, ${NOW})`.execute(db);
    // A server's settings they changed last (plan 19A-1).
    await sql`insert into ServerSettings (serverId, settings, updatedAt, updatedBy)
              values (${`41234567890123456${String(n)}`}, '{}', ${NOW}, ${member})`.execute(db);
    await sql`insert into Gym (id, name, lat, lon) values (${100 + n}, ${`Gym ${String(n)}`}, 40,
                                                         -80)`.execute(db);
    await sql`insert into GymWayfarer (gymId, notInWayfarer, notInWayfarerBy, notInWayfarerAt)
              values (${100 + n}, 1, ${member}, ${NOW})`.execute(db);
    await sql`insert into WayspotImport (id, guildId, staffId, importedAt, counts)
              values (${n}, 1, ${member}, ${NOW}, '{}')`.execute(db);
    await sql`insert into GymReview (guildId, gymId, kind, candidates, importId, createdAt,
                                     queuedAt, decidedAt, decidedBy, decision)
              values (1, ${100 + n}, 'new', '[]', ${n}, ${NOW}, ${NOW}, ${NOW}, ${member},
                      'keep')`.execute(db);
    // As a moderator: a report, a request, an appeal and an ask of somebody else decided; a
    // block of somebody else given and lifted.
    const other = `51234567890123450${String(n)}`;
    await reports.addReport(
      newReport(
        n * 10 + 3,
        messageSubject({ messageId: `80000000000000010${String(n)}`, authorId: other }),
      ),
      { reporterId: STRANGER, reporterName: 'Stranger', text: 'Spam.', at: NOW },
    );
    await reports.decideReport(requestId(200 + n * 10 + 3), 'dismissed', null, as);
    await safety.addRequest(newRequest(n * 10 + 3, { makerId: other, makerName: 'Other' }));
    await safety.decideRequest(requestId(n * 10 + 3), 'refused', 'refuse', as);
    await safety.addAppeal(newAppeal(n * 10 + 3, { memberId: other, memberName: 'Other' }));
    await safety.decideAppeal(requestId(100 + n * 10 + 3), 'kept', as);
    await safety.addAsk(
      newAsk(n * 10 + 3, {
        memberId: other,
        memberName: 'Other',
        key: { kind: 'stop', id: `asked-${String(n)}` },
      }),
    );
    const asked = await safety.ask(requestId(300 + n * 10 + 3));
    if (asked === undefined) throw new Error('the ask is gone');
    // Allowing it rules the place too: a ruling of theirs more.
    await safety.allowOnAsk(asked, as);
    await safety.addBlock(AWAY, other, as, 'Other');
    await safety.liftBlock(AWAY, other, as);
    // A wild spawn they reported: kept by name, never by id.
    await sql`insert into SpawnReport (channelId, messageId, deleteAt, reporterName, guildId,
                                       pokemonName, madeAt)
              values ('900000000000000002', ${`90000000000000010${String(n)}`}, ${NOW + 1},
                      ${name}, ${HOME}, 'Pikachu', ${NOW})`.execute(db);
    // The staff's log, and what is live: a party with a click of theirs, a report at a stop
    // today, the forum they were let into.
    await sql`insert into PartyAudit (serverId, partyId, at, actorId, actorName, action)
              values (${HOME}, ${requestId(800 + n)}, ${NOW}, ${member}, ${name},
                      'created')`.execute(db);
    // A setting of the server they changed, in the staff's log of settings (plan 19A-1).
    await sql`insert into ServerSettingsAudit (serverId, at, actorId, actorName, \`key\`, \`before\`,
                                               \`after\`)
              values (${HOME}, ${NOW}, ${member}, ${name}, 'postNewGyms', 'false',
                      'true')`.execute(db);
    await sql`insert into Party (id, type, guildId, createdById, createdAt, updatedAt, state,
                                 mirrorMessages)
              values (${requestId(800 + n)}, 'raid', 1, ${member}, ${NOW}, ${NOW}, '{}',
                      '[]')`.execute(db);
    await sql`insert into PartyHistoryStep (partyId, at, kind, subject, value)
              values (${requestId(800 + n)}, ${NOW}, 'status', ${member}, 1)`.execute(db);
    await sql`insert into StopReport (serverId, stopKey, kind, periodKey, endsAt, stopName, lat,
                                      lon, subjectKey, detail, reporterId, reporterName, madeAt)
              values (${HOME}, ${`stop-${String(n)}`}, 'research', 'day:2027-01-15', ${NOW + 1},
                      'Fountain', 40, -80, ${'b'.repeat(16)}, '{}', ${member}, ${name},
                      ${NOW})`.execute(db);
    await sql`insert into PartyAccessGrant (forumChannelId, memberId, guildId, createdAt)
              values ('900000000000000001', ${member}, 1, ${NOW})`.execute(db);
  };

  /**
   * The service over this database, a store of screenshots and a member index, both empty;
   * `parties` the parties going on, the world's unless given.
   */
  const serviceWith = (parties?: { active(): readonly Party[] }) => {
    const shots = mkdtempSync(path.join(tmpdir(), 'pine-forget-shots-'));
    const index = mkdtempSync(path.join(tmpdir(), 'pine-forget-index-'));
    const { log, entries } = createTestLogger();
    const store = new ScreenshotStore({
      dir: shots,
      reviewDays: 30,
      keepMegabytes: 64,
      reviewPerDay: 200,
      shown: () => new Set(),
      gymName: () => undefined,
      log,
    });
    const ids = new RowIds();
    const ended: string[] = [];
    const live = [
      testRaid({ createdById: ALICE }),
      withAttendees(testMeetup({ createdById: BOB }), { [ALICE]: {} }),
      testMeetup({ createdById: BOB, id: requestId(999) }),
      // Saved by staff (`/admin save-party`): it ends when they let it go, not by itself.
      { ...testRaid({ createdById: ALICE, id: requestId(998) }), saved: true },
    ];
    const removal = new MemberRemoval({
      data: new MemberDataRepository(db, ids),
      screenshots: store,
      parties: parties ?? { active: () => live },
      legacyFiles: (member) => memberIndexServers(index, member),
      endSession: (id) => ended.push(id),
      log,
    });
    const files = (folder: string) => {
      try {
        return readdirSync(path.join(shots, folder)).sort();
      } catch {
        return [];
      }
    };
    return { removal, store, index, entries, ended, ids, files };
  };

  /** Both members with everything, a party of the history they share, and their files. */
  const world = async () => {
    const made = serviceWith();
    await seed(ALICE, 'Alice', 1);
    await seed(BOB, 'Bob', 2);
    await kept(HOME, ALICE, [ALICE, BOB]);
    // Bob's doings that name her: he made her a train's conductor, and she confirmed his
    // report at a stop today.
    await sql`insert into PartyAudit (serverId, partyId, at, actorId, actorName, action, detail)
              values (${HOME}, ${requestId(802)}, ${NOW}, ${BOB}, 'Bob', 'conductor',
                      ${JSON.stringify({ from: null, to: { id: ALICE, name: 'Alice' } })})`.execute(
      db,
    );
    await sql`update StopReport set confirmedBy = ${JSON.stringify([ALICE])}
              where reporterId = ${BOB}`.execute(db);
    // A report both of them gave a reason on.
    for (const [reporter, name] of [
      [ALICE, 'Alice'],
      [BOB, 'Bob'],
    ] as const) {
      await reports.addReport(newReport(90, partySubject({ partyId: requestId(790) })), {
        reporterId: reporter,
        reporterName: name,
        text: `${name} saw it too.`,
        at: NOW,
      });
    }
    // A party going on that both of them signed up for: its state names both.
    await sql`insert into Party (id, type, guildId, createdById, createdAt, updatedAt, state,
                                 mirrorMessages)
              values (${requestId(850)}, 'raid', 1, ${STRANGER}, ${NOW}, ${NOW},
                      ${JSON.stringify({ attendees: { [ALICE]: { status: 1 }, [BOB]: { status: 1 } } })},
                      '[]')`.execute(db);
    // A train of the history Bob made and named, which Alice rode and conducted at the end.
    await sql`insert into PartyHistory (source, kind, serverId, createdAt, ending, createdById,
                                        conductorId, name, description)
              values ('live', 'train', ${HOME}, ${NOW}, 'completed', ${BOB}, ${ALICE},
                      'Bob’s loop', 'Bring water')`.execute(db);
    const bobsTrain = Number(
      (await sql<{ id: number }>`select max(id) as id from PartyHistory`.execute(db)).rows[0]?.id,
    );
    for (const [seq, member] of [BOB, ALICE].entries()) {
      await sql`insert into PartyHistoryAttendee (historyId, seq, memberId, status, furthest)
                values (${bobsTrain}, ${seq}, ${member}, 'here', 'here')`.execute(db);
    }
    const keep = async (sender: string, refused = false) => {
      const id = await made.store.keep(PNG, shot(sender, refused));
      if (id === undefined) throw new Error('not kept');
      return id;
    };
    const hers = [await keep(ALICE), await keep(ALICE, true)];
    const his = [await keep(BOB), await keep(BOB, true)];
    await made.store.feedback(his[0] ?? '', ALICE, { verdict: 'right' });
    const modes = { dir: 0o750, file: 0o640 };
    const entry = ['310000000000000001:1650000000000 r'];
    writeServerIndex(
      made.index,
      HOME,
      new Map([
        [ALICE, entry],
        [BOB, entry],
      ]),
      modes,
    );
    writeServerIndex(made.index, AWAY, new Map([[ALICE, entry]]), modes);
    return { ...made, hers, his };
  };

  /** What `look` says of either member in that world, but their files. */
  const HELD = {
    user: {
      friendCode: true,
      inGameName: true,
      pokebattlerId: true,
      wants: 2,
      targetWants: 2,
      gymTargets: 2,
      savedRoutes: 2,
    },
    newTrains: 2,
    unownGifts: 2,
    // Four parties (their own, another server's, the one they share, Bob's train she
    // conducted) and a report at a stop; their own train's name and description.
    history: { optIns: 2, boards: 1, fillIns: 1, named: 5, words: 1 },
    sessions: 2,
    toolAccess: true,
    dmContact: true,
    // Their own report, and the one both of them gave a reason on.
    reports: { reasons: 2, about: 1 },
    meetups: { blocks: 1, open: 1, unmade: 0, live: 0, over: 3 },
    // Her own entry, Bob's that made her conductor, and her change of the server's settings.
    audit: 3,
    stopReports: 1,
    stopConfirms: 1,
    accessGrants: 1,
    // Two rulings (one by allowing an ask), a boss override, a stop, the event window, a gym
    // review, a gym marked, an import, and a report, a request, an appeal, an ask and a block
    // decided.
    staffActs: 14,
  };

  it('looks: counts what Pine holds of a member over every server, and changes nothing', async () => {
    const { removal, files } = await world();
    const before = await dump();
    const held = files('held');

    const look = await removal.look(ALICE);

    expect(look).toEqual({
      memberId: ALICE,
      held: HELD,
      screenshots: { sent: 2, feedback: 1 },
      // The raid she reported and the meetup she signed up for; and the raid staff saved.
      liveParties: 2,
      savedParties: 1,
      legacyFiles: [HOME, AWAY].sort(),
    });
    expect(removable(look)).toBe(true);
    expect(await dump()).toEqual(before);
    expect(files('held')).toEqual(held);
  });

  it('removes what is listed, leaves what is listed as left, and touches nobody else', async () => {
    const { removal, files, entries, ended, ids, hers, his } = await world();
    const before = await dump();
    const aliceRow = before.User?.find((row) => row.userSnowflake === ALICE)?.id;
    const bobBefore = await removal.look(BOB);
    // The process remembers her row, as after any command of hers.
    ids.sawUser(ALICE, Number(aliceRow));

    const outcome = await removal.remove(ALICE, OWNER);

    expect(outcome.removed).toEqual({
      user: HELD.user,
      newTrains: 2,
      unownGifts: 2,
      history: HELD.history,
      sessions: [sessionId(17), sessionId(18)],
      toolAccess: true,
      dmContact: true,
      reportReasons: 2,
      meetupRecords: 3,
    });
    expect(outcome.screenshots).toEqual({ removed: 2, feedback: 1, failed: 0 });

    // Every table of the database: hers gone or blanked where the removal says so, and every
    // other row of every table exactly as it was.
    const without = (table: string, gone: (row: Row) => boolean) =>
      (before[table] ?? []).filter((row) => !gone(row));
    const changed = (table: string, change: (row: Row) => Row) =>
      (before[table] ?? []).map((row) => change(row));
    const hung = (row: Row) => row.userId === aliceRow;
    const herRoutes = new Set((before.SavedRoutes ?? []).filter(hung).map((row) => row.id));
    const hersBy = (column: string) => (row: Row) => row[column] === ALICE;
    const blank = (row: Row, is: boolean, columns: string[]) =>
      is ? { ...row, ...Object.fromEntries(columns.map((column) => [column, null])) } : row;
    expect(await dump()).toEqual({
      ...before,
      User: without('User', hersBy('userSnowflake')),
      PokemonNotification: without('PokemonNotification', hung),
      TargetWant: without('TargetWant', hung),
      GymNotification: without('GymNotification', hung),
      SavedRoutes: without('SavedRoutes', hung),
      SavedRouteGym: without('SavedRouteGym', (row) => herRoutes.has(row.routeId)),
      NewTrainNotification: without('NewTrainNotification', hersBy('memberId')),
      UnownWantGift: without('UnownWantGift', hersBy('memberId')),
      HistoryOptIn: without('HistoryOptIn', hersBy('memberId')),
      LeaderboardOptIn: without('LeaderboardOptIn', hersBy('memberId')),
      LegacyFillIn: without('LegacyFillIn', hersBy('memberId')),
      WebSession: without('WebSession', hersBy('userId')),
      ScriptAccess: without('ScriptAccess', hersBy('userId')),
      DmContact: without('DmContact', hersBy('userId')),
      // What she wrote of the parties she made goes with her id; Bob's train keeps his words.
      PartyHistory: changed('PartyHistory', (row) =>
        blank(
          blank(row, row.createdById === ALICE, ['createdById', 'name', 'description']),
          row.conductorId === ALICE,
          ['conductorId'],
        ),
      ),
      PartyHistoryAttendee: changed('PartyHistoryAttendee', (row) =>
        blank(row, row.memberId === ALICE, ['memberId']),
      ),
      StopReportHistory: changed('StopReportHistory', (row) =>
        blank(row, row.reporterId === ALICE, ['reporterId']),
      ),
      ModerationReportReason: changed('ModerationReportReason', (row) =>
        blank(row, row.reporterId === ALICE, ['reporterId', 'reporterName']),
      ),
      // What is over loses who she was; her request still waiting keeps both.
      MeetupRequest: changed('MeetupRequest', (row) =>
        blank(row, row.makerId === ALICE && row.status === 'refused', [
          'makerId',
          'makerName',
          'makerTeam',
        ]),
      ),
      MeetupAppeal: changed('MeetupAppeal', (row) =>
        blank(row, row.memberId === ALICE && row.status === 'kept', ['memberId', 'memberName']),
      ),
      MeetupPlaceAsk: changed('MeetupPlaceAsk', (row) =>
        blank(row, row.memberId === ALICE && row.status === 'expired', ['memberId', 'memberName']),
      ),
    });
    // The seed had something of hers in each of them.
    for (const table of [
      'User',
      'TargetWant',
      'HistoryOptIn',
      'WebSession',
      'ScriptAccess',
      'DmContact',
    ]) {
      expect((await dump())[table]?.length).toBeLessThan(before[table]?.length ?? 0);
    }

    // Her screenshots are gone from both folders, his are there, without her feedback.
    const left = his.flatMap((id) => [`${id}.json`, `${id}.png`]).sort();
    expect(files('held')).toEqual(left);
    expect(files('review')).toEqual(left);
    for (const id of hers) expect(files('held').join()).not.toContain(id);
    // Her live streams are ended as a logout ends them, nobody else's.
    expect(ended.sort()).toEqual([sessionId(17), sessionId(18)]);
    // The row id the process remembered is forgotten.
    expect(ids.user(ALICE)).toBeUndefined();

    // What is left of her, and why the look says there is nothing more to remove.
    expect(outcome.after).toEqual({
      memberId: ALICE,
      held: {
        user: undefined,
        newTrains: 0,
        unownGifts: 0,
        history: { optIns: 0, boards: 0, fillIns: 0, named: 0, words: 0 },
        sessions: 0,
        toolAccess: false,
        dmContact: false,
        reports: { reasons: 0, about: 1 },
        meetups: { blocks: 1, open: 1, unmade: 0, live: 0, over: 0 },
        audit: 3,
        stopReports: 1,
        stopConfirms: 1,
        accessGrants: 1,
        staffActs: 14,
      },
      screenshots: { sent: 0, feedback: 0 },
      liveParties: 2,
      savedParties: 1,
      legacyFiles: [HOME, AWAY].sort(),
    });
    if (outcome.after === undefined) throw new Error('the look after the removal failed');
    expect(removable(outcome.after)).toBe(false);
    // The other member's look is what it was, but for her feedback on his screenshot.
    expect(await removal.look(BOB)).toEqual(bobBefore);

    // One line at info: who was removed and who asked, and nothing of the data.
    const said = entries.filter((entry) => entry.msg === 'removed a member’s data on request');
    expect(said).toHaveLength(1);
    expect(said[0]).toMatchObject({ level: 30, member: ALICE, by: OWNER });
    expect(Object.keys(said[0] ?? {}).sort()).toEqual(
      ['by', 'hostname', 'level', 'member', 'msg', 'pid', 'time'].sort(),
    );
  });

  it('is harmless run again, and for somebody Pine holds nothing of', async () => {
    const { removal, ended } = await world();
    await removal.remove(ALICE, OWNER);
    const after = await dump();
    ended.length = 0;

    const again = await removal.remove(ALICE, OWNER);
    expect(again.removed).toEqual({
      user: undefined,
      newTrains: 0,
      unownGifts: 0,
      history: { optIns: 0, boards: 0, fillIns: 0, named: 0, words: 0 },
      sessions: [],
      toolAccess: false,
      dmContact: false,
      reportReasons: 0,
      meetupRecords: 0,
    });
    expect(again.screenshots).toEqual({ removed: 0, feedback: 0, failed: 0 });
    expect(await dump()).toEqual(after);
    expect(ended).toEqual([]);

    const nobody = await removal.look(NOBODY);
    expect(removable(nobody)).toBe(false);
    expect(nobody).toMatchObject({
      held: { user: undefined, sessions: 0, audit: 0, staffActs: 0 },
      screenshots: { sent: 0, feedback: 0 },
      liveParties: 0,
      legacyFiles: [],
    });
    await removal.remove(NOBODY, OWNER);
    expect(await dump()).toEqual(after);
  });

  it('leaves the approval of a meetup still going on with its maker, and clears it once the meetup has ended', async () => {
    // Two approvals of hers, their meetups made: one still going on, one ended.
    for (const n of [1, 2]) {
      await safety.addRequest(newRequest(n, { makerId: ALICE, makerName: 'Alice' }));
      await safety.decideRequest(requestId(n), 'approved', 'approve', MOD);
      await safety.settleApproval(requestId(n), { partyId: requestId(950 + n) });
    }
    let live: Party[] = [
      testMeetup({ createdById: ALICE, id: requestId(951) }),
      // Bob's meetup going on keeps nothing of hers.
      testMeetup({ createdById: BOB, id: requestId(952) }),
    ];
    const { removal } = serviceWith({ active: () => live });

    const look = await removal.look(ALICE);
    expect(look.held.meetups).toEqual({ blocks: 0, open: 0, unmade: 0, live: 1, over: 1 });

    const outcome = await removal.remove(ALICE, OWNER);
    expect(outcome.removed.meetupRecords).toBe(1);
    // The moderators are still told when the meetup going on changes (`tellChange`).
    expect(await safety.approvedRequestOf(HOME, ALICE, requestId(951))).toMatchObject({
      id: requestId(1),
      makerId: ALICE,
      makerName: 'Alice',
      makerTeam: 'mystic',
    });
    expect(await safety.approvedRequestOf(HOME, ALICE, requestId(952))).toBeUndefined();
    expect(await safety.request(requestId(2))).toMatchObject({
      makerId: null,
      makerName: null,
      makerTeam: null,
    });
    expect(outcome.after?.held.meetups).toEqual({
      blocks: 0,
      open: 0,
      unmade: 0,
      live: 1,
      over: 0,
    });

    // The meetup has ended: a second run clears it.
    live = [];
    const again = await removal.remove(ALICE, OWNER);
    expect(again.removed.meetupRecords).toBe(1);
    expect(await safety.approvedRequestOf(HOME, ALICE, requestId(951))).toBeUndefined();
    expect(again.after?.held.meetups).toEqual({
      blocks: 0,
      open: 0,
      unmade: 0,
      live: 0,
      over: 0,
    });
  });

  it('leaves everything as it was when a step fails, and says which', async () => {
    const { removal, files, entries, ended, ids } = await world();
    const before = await dump();
    const held = files('held');
    ids.sawUser(ALICE, 1);
    // The database refuses to delete her web logins: a row that must keep one of them. By then
    // her settings, her notices and her history are gone inside the transaction.
    await sql`create table SessionKeeper (sessionId char(64) not null,
      constraint sessionkeeper_session foreign key (sessionId)
        references WebSession (id))
      engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`insert into SessionKeeper (sessionId) values (${sessionId(17)})`.execute(db);
    let failure: unknown;
    try {
      failure = await removal.remove(ALICE, OWNER).catch((err: unknown) => err);
    } finally {
      await sql`drop table SessionKeeper`.execute(db);
    }

    expect(failure).toBeInstanceOf(MemberRemovalError);
    expect(failure).toMatchObject({ step: 'their web logins' });
    expect(await dump()).toEqual(before);
    // Nothing outside the database was touched either.
    expect(files('held')).toEqual(held);
    expect(ended).toEqual([]);
    expect(ids.user(ALICE)).toBe(1);
    expect(entries.filter((entry) => entry.msg === 'removed a member’s data on request')).toEqual(
      [],
    );
    expect(
      entries.filter((entry) => entry.msg === 'could not remove a member’s data; nothing changed'),
    ).toMatchObject([{ level: 50, member: ALICE, by: OWNER, step: 'their web logins' }]);
  });

  it('runs all of it again after a deadlock, and removes what one run removes', async () => {
    const made = await world();
    const steps: string[] = [];
    let deadlocks = 0;
    const removal = new MemberRemoval({
      data: new MemberDataRepository(db, new RowIds(), {
        step: (step) => {
          steps.push(step);
          // The first try meets a party's recording or an opt-out in a deadlock half-way, its
          // settings and notices already gone inside the transaction.
          if (step === REMOVAL_STEPS.history && deadlocks === 0) {
            deadlocks += 1;
            throw Object.assign(new Error('Deadlock found when trying to get lock'), {
              errno: 1213,
            });
          }
        },
      }),
      screenshots: made.store,
      parties: { active: () => [] },
      log: createTestLogger().log,
    });
    const outcome = await removal.remove(ALICE, OWNER);
    // The second try began from the first step, and found everything still to do.
    expect(steps.filter((step) => step === REMOVAL_STEPS.user)).toHaveLength(2);
    expect(steps.at(-1)).toBe(REMOVAL_STEPS.commit);
    expect(outcome.removed).toMatchObject({
      user: HELD.user,
      newTrains: 2,
      unownGifts: 2,
      history: HELD.history,
      reportReasons: 2,
      meetupRecords: 3,
    });
    expect(outcome.after?.held.user).toBeUndefined();
    expect(outcome.after?.held.history).toEqual({
      optIns: 0,
      boards: 0,
      fillIns: 0,
      named: 0,
      words: 0,
    });
  });

  it('names a failure after the last step as the saving of the removal, and changes nothing', async () => {
    const made = await world();
    const before = await dump();
    const steps: string[] = [];
    const removal = new MemberRemoval({
      data: new MemberDataRepository(db, new RowIds(), {
        step: (step) => {
          steps.push(step);
          // As the commit itself failing: every statement went through.
          if (step === 'saving the removal') throw new Error('the commit was refused');
        },
      }),
      screenshots: made.store,
      parties: { active: () => [] },
      log: createTestLogger().log,
    });
    const failure = await removal.remove(ALICE, OWNER).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(MemberRemovalError);
    expect(failure).toMatchObject({ step: 'saving the removal' });
    expect(steps.at(-2)).toBe('their id and name on meetup requests, appeals and asks');
    expect(await dump()).toEqual(before);
  });

  it('removes the data even when a stream cannot be ended, and says so in the log', async () => {
    const made = await world();
    const { log, entries } = createTestLogger();
    const endSession = vi.fn(() => {
      throw new Error('no such stream');
    });
    const removal = new MemberRemoval({
      data: new MemberDataRepository(db),
      screenshots: made.store,
      parties: { active: () => [] },
      endSession,
      log,
    });
    const outcome = await removal.remove(ALICE, OWNER);
    expect(outcome.removed.sessions).toHaveLength(2);
    expect(endSession).toHaveBeenCalledTimes(2);
    // Without a member index nothing is to delete by hand.
    expect(outcome.after?.legacyFiles).toEqual([]);
    expect(entries.some((entry) => entry.msg === 'could not end a removed login’s streams')).toBe(
      true,
    );
  });
});
