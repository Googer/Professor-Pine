import { expect, it } from 'vitest';
import type { BoardReader } from '../../src/db/repositories/board-repository.js';
import type { HistoryAttendee, HistoryRecord } from '../../src/domain/history/party-history.js';

/** The server of the boards' tests, and another one. */
export const BOARD_SERVER = '412345678901234567';
export const OTHER_BOARD_SERVER = '412345678901234568';
/** When the records of the boards' tests were made: 2026-11-05 in the morning, UTC. */
export const BOARD_NOW = 1_793_000_000_000;
const HOUR = 3_600_000;
export const ASH = '312345678901234567';
export const BROCK = '312345678901234568';
export const MISTY = '312345678901234569';

let parties = 0;
/** A party id of its own for every record. */
const nextPartyId = (): string => `00000000-0000-4000-8000-${String(++parties).padStart(12, '0')}`;

/** An attendee of a record: a member (null: not opted in) who got as far as `furthest`. */
export function boardAttendee(
  memberId: string | null,
  furthest: HistoryAttendee['furthest'],
  overrides: Partial<HistoryAttendee> = {},
): HistoryAttendee {
  return {
    memberId,
    status: furthest,
    furthest,
    groupId: null,
    extras: 0,
    remote: false,
    team: null,
    signedUpAt: BOARD_NOW,
    joinedAt: null,
    hereAt: null,
    doneAt: null,
    leftAt: null,
    ...overrides,
  };
}

/** A live raid at a gym, reported by Ash, which Brock completed with her, unless overridden. */
export function boardRecord(overrides: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    source: 'live',
    partyId: nextPartyId(),
    legacyKey: null,
    kind: 'raid',
    serverId: BOARD_SERVER,
    regionId: 1,
    gymId: 7,
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
    boss: { key: 'MEWTWO', dex: 150, species: 'MEWTWO', form: null },
    fastMove: null,
    chargedMove: null,
    createdAt: BOARD_NOW,
    hatchTime: null,
    startTime: null,
    endTime: null,
    endedAt: BOARD_NOW + HOUR,
    ending: 'completed',
    closedBy: null,
    createdById: ASH,
    conductorId: null,
    anonymous: false,
    routeStops: null,
    trainKind: null,
    splitFromId: null,
    reached: 0,
    attendees: [boardAttendee(ASH, 'done'), boardAttendee(BROCK, 'done')],
    groups: [],
    stops: [],
    ...overrides,
  };
}

/** A record of a report at a stop that ended, as `StopReportHistory` keeps it. */
export interface KeptReport {
  serverId: string;
  kind: 'research' | 'rocket';
  subjectKey: string;
  /** The task's words as the report kept them (`detail.text`); null for none. */
  text: string | null;
  reporterId: string | null;
  endedAt: number;
  ending: string;
  confirmations: number;
  reach: number;
}

/** Research of a listed task by Ash that stood, unless overridden. */
export function keptReport(overrides: Partial<KeptReport> = {}): KeptReport {
  return {
    serverId: BOARD_SERVER,
    kind: 'research',
    subjectKey: 'a'.repeat(16),
    text: 'Catch 5 Pokémon',
    reporterId: ASH,
    endedAt: BOARD_NOW,
    ending: 'stood',
    confirmations: 0,
    reach: 0,
    ...overrides,
  };
}

/** What the boards' cases put in place, and the reader they read with. */
export interface BoardWorld {
  reader: BoardReader;
  party(record: HistoryRecord): Promise<void>;
  report(report: KeptReport): Promise<void>;
  /** The member opted in to the history of the server and switched the boards on. */
  onBoard(memberId: string, serverId?: string): Promise<void>;
  /** The member opted in to the history of the server only. */
  optedIn(memberId: string, serverId?: string): Promise<void>;
  wants(day: string, target: string, count: number, serverId?: string): Promise<void>;
  /** A report to the moderators about the party, decided as `status`. */
  moderated(partyId: string, status: string): Promise<void>;
  /** The member is blocked from making meetups in the board server from `at` to `lifted`. */
  blocked(memberId: string, at: number, lifted?: number): Promise<void>;
}

const all = { since: null };

/**
 * What the boards read of the history (plan 8H-6), run against `BoardRepository` and its twin
 * `MemoryBoards` alike. `made` gives a fresh world.
 */
export function boardReaderCases(made: () => Promise<BoardWorld>): void {
  it('credits a raid or max battle to its reporter where another member completed it', async () => {
    const world = await made();
    const raid = boardRecord();
    const max = boardRecord({ kind: 'max', createdAt: BOARD_NOW + HOUR, tier: 'D5' });
    await world.party(raid);
    await world.party(max);
    // Only Ash completed it, or only somebody who left: nothing.
    await world.party(boardRecord({ attendees: [boardAttendee(ASH, 'done')] }));
    await world.party(
      boardRecord({ attendees: [boardAttendee(ASH, 'done'), boardAttendee(BROCK, 'here')] }),
    );
    // A member who did not opt in counts as another, by their row.
    const unnamed = boardRecord({
      createdAt: BOARD_NOW + 2 * HOUR,
      attendees: [boardAttendee(ASH, 'here'), boardAttendee(null, 'done')],
    });
    await world.party(unnamed);
    expect(await world.reader.raidCredits(BOARD_SERVER, all)).toEqual(
      expect.arrayContaining([
        { memberId: ASH, at: BOARD_NOW, anonymous: false },
        { memberId: ASH, at: BOARD_NOW + HOUR, anonymous: false },
        { memberId: ASH, at: BOARD_NOW + 2 * HOUR, anonymous: false },
      ]),
    );
    expect(await world.reader.raidCredits(BOARD_SERVER, all)).toHaveLength(3);
  });

  it('credits no raid that is legacy, canceled, without a named reporter or in another server', async () => {
    const world = await made();
    await world.party(boardRecord({ source: 'legacy', partyId: null, legacyKey: 'x:1' }));
    await world.party(boardRecord({ ending: 'cancelled' }));
    await world.party(boardRecord({ createdById: null }));
    await world.party(boardRecord({ serverId: OTHER_BOARD_SERVER }));
    await world.party(boardRecord({ kind: 'meetup' }));
    expect(await world.reader.raidCredits(BOARD_SERVER, all)).toEqual([]);
  });

  it('credits no raid the moderators closed, but one staff closed (W3)', async () => {
    const world = await made();
    await world.party(boardRecord({ closedBy: 'moderators' }));
    await world.party(boardRecord({ kind: 'max', closedBy: 'moderators' }));
    await world.party(boardRecord({ closedBy: 'staff', createdAt: BOARD_NOW + HOUR }));
    expect(await world.reader.raidCredits(BOARD_SERVER, all)).toEqual([
      { memberId: ASH, at: BOARD_NOW + HOUR, anonymous: false },
    ]);
  });

  it('credits no train the moderators closed, but one staff closed (W3)', async () => {
    const world = await made();
    const led = [boardAttendee(ASH, 'here', { conducted: 2 }), boardAttendee(BROCK, 'here')];
    await world.party(boardRecord({ kind: 'train', closedBy: 'moderators', attendees: led }));
    const kept = boardRecord({ kind: 'train', closedBy: 'staff', attendees: led });
    await world.party(kept);
    expect(await world.reader.trainCredits(BOARD_SERVER, all)).toEqual([
      { memberId: ASH, at: BOARD_NOW, anonymous: false, partyId: kept.partyId },
    ]);
  });

  it('says which raids were anonymous, reads from a moment on and of one member', async () => {
    const world = await made();
    await world.party(boardRecord({ anonymous: true }));
    await world.party(boardRecord({ createdAt: BOARD_NOW - 2 * HOUR }));
    await world.party(
      boardRecord({
        createdById: BROCK,
        attendees: [boardAttendee(BROCK, 'done'), boardAttendee(MISTY, 'done')],
      }),
    );
    expect(await world.reader.raidCredits(BOARD_SERVER, { since: BOARD_NOW - HOUR })).toEqual(
      expect.arrayContaining([
        { memberId: ASH, at: BOARD_NOW, anonymous: true },
        { memberId: BROCK, at: BOARD_NOW, anonymous: false },
      ]),
    );
    expect(
      await world.reader.raidCredits(BOARD_SERVER, { since: null, memberId: ASH }),
    ).toHaveLength(2);
  });

  it('credits a train to each member who led it where another member came, by its party', async () => {
    const world = await made();
    const train = boardRecord({
      kind: 'train',
      createdById: MISTY,
      attendees: [
        boardAttendee(ASH, 'here', { conducted: 3 }),
        boardAttendee(BROCK, 'here', { conducted: 1 }),
        boardAttendee(MISTY, 'interested'),
      ],
    });
    await world.party(train);
    // Ash led a train nobody else came to; Brock was on a train nobody led.
    await world.party(
      boardRecord({
        kind: 'train',
        attendees: [boardAttendee(ASH, 'here', { conducted: 2 }), boardAttendee(BROCK, 'joined')],
      }),
    );
    await world.party(
      boardRecord({
        kind: 'train',
        attendees: [boardAttendee(BROCK, 'here'), boardAttendee(ASH, 'here')],
      }),
    );
    const credits = await world.reader.trainCredits(BOARD_SERVER, all);
    expect(credits).toEqual(
      expect.arrayContaining([
        { memberId: ASH, at: BOARD_NOW, anonymous: false, partyId: train.partyId },
        { memberId: BROCK, at: BOARD_NOW, anonymous: false, partyId: train.partyId },
      ]),
    );
    expect(credits).toHaveLength(2);
  });

  it('links the trains split off others', async () => {
    const world = await made();
    const first = boardRecord({ kind: 'train' });
    const split = boardRecord({ kind: 'train', splitFromId: first.partyId });
    await world.party(first);
    await world.party(split);
    await world.party(
      boardRecord({ kind: 'train', serverId: OTHER_BOARD_SERVER, splitFromId: 'x' }),
    );
    expect(await world.reader.splitLinks(BOARD_SERVER)).toEqual([
      { partyId: split.partyId, splitFromId: first.partyId },
    ]);
  });

  it('credits a meetup to its host where another member came, unless the moderators closed it', async () => {
    const world = await made();
    const came = boardRecord({
      kind: 'meetup',
      attendees: [boardAttendee(ASH, 'here'), boardAttendee(BROCK, 'here')],
    });
    await world.party(came);
    await world.party(
      boardRecord({
        kind: 'meetup',
        attendees: [boardAttendee(ASH, 'here'), boardAttendee(BROCK, 'joined')],
      }),
    );
    for (const status of ['closed', 'refused', 'blocked', 'dismissed']) {
      const closed = boardRecord({
        kind: 'meetup',
        createdAt: BOARD_NOW + HOUR,
        attendees: [boardAttendee(ASH, 'here'), boardAttendee(null, 'here')],
      });
      await world.party(closed);
      await world.moderated(closed.partyId ?? '', status);
    }
    // Dismissed is no closing: that one counts.
    expect(await world.reader.meetupCredits(BOARD_SERVER, all)).toEqual(
      expect.arrayContaining([
        { memberId: ASH, at: BOARD_NOW, anonymous: false },
        { memberId: ASH, at: BOARD_NOW + HOUR, anonymous: false },
      ]),
    );
    expect(await world.reader.meetupCredits(BOARD_SERVER, all)).toHaveLength(2);
  });

  it('credits no meetup staff or the moderators closed, though somebody came (A1)', async () => {
    const world = await made();
    for (const closedBy of ['staff', 'moderators', null] as const) {
      await world.party(
        boardRecord({
          kind: 'meetup',
          closedBy,
          attendees: [boardAttendee(ASH, 'here'), boardAttendee(BROCK, 'here')],
        }),
      );
    }
    expect(await world.reader.meetupCredits(BOARD_SERVER, all)).toHaveLength(1);
  });

  it('credits no meetup that ended while its host was blocked from making meetups', async () => {
    const world = await made();
    const meetup = (endedAt: number) =>
      boardRecord({
        kind: 'meetup',
        endedAt,
        attendees: [boardAttendee(ASH, 'here'), boardAttendee(BROCK, 'here')],
      });
    await world.blocked(ASH, BOARD_NOW + 2 * HOUR, BOARD_NOW + 5 * HOUR);
    await world.party(meetup(BOARD_NOW + HOUR));
    await world.party(meetup(BOARD_NOW + 2 * HOUR));
    await world.party(meetup(BOARD_NOW + 6 * HOUR));
    const credits = await world.reader.meetupCredits(BOARD_SERVER, all);
    expect(credits).toHaveLength(2);
  });

  it('credits the reports at stops that counted, with their confirmations, by when they ended', async () => {
    const world = await made();
    for (const ending of ['stood', 'narrowed', 'refined', 'churned', 'contradicted', 'staff']) {
      await world.report(keptReport({ ending, confirmations: 1 }));
    }
    await world.report(keptReport({ reporterId: null }));
    await world.report(keptReport({ endedAt: BOARD_NOW - 2 * HOUR }));
    await world.report(keptReport({ serverId: OTHER_BOARD_SERVER }));
    const credits = await world.reader.reportCredits(BOARD_SERVER, { since: BOARD_NOW - HOUR });
    expect(credits).toEqual(
      Array.from({ length: 4 }, () => ({ memberId: ASH, at: BOARD_NOW, confirmations: 1 })),
    );
  });

  it('scores each reporter all time: confirmations of every report but staff’s take-backs, the contradicted and the counted (A4)', async () => {
    const world = await made();
    await world.report(keptReport({ confirmations: 3 }));
    await world.report(keptReport({ ending: 'narrowed' }));
    await world.report(keptReport({ ending: 'contradicted', confirmations: 2 }));
    await world.report(keptReport({ ending: 'staff', confirmations: 5 }));
    await world.report(keptReport({ ending: 'contradicted', endedAt: 1 }));
    await world.report(keptReport({ reporterId: BROCK, ending: 'withdrawn', confirmations: 4 }));
    const scores = await world.reader.reportScores(BOARD_SERVER);
    expect(scores).toEqual(
      expect.arrayContaining([
        { memberId: ASH, confirmations: 5, contradicted: 2, counted: 2 },
        { memberId: BROCK, confirmations: 4, contradicted: 0, counted: 0 },
      ]),
    );
    expect(await world.reader.reportScores(BOARD_SERVER, [BROCK])).toEqual([
      { memberId: BROCK, confirmations: 4, contradicted: 0, counted: 0 },
    ]);
  });

  it('knows who is on the boards: both switches on, in that server', async () => {
    const world = await made();
    await world.onBoard(ASH);
    await world.optedIn(BROCK);
    await world.onBoard(MISTY, OTHER_BOARD_SERVER);
    expect([...(await world.reader.onBoards(BOARD_SERVER))]).toEqual([ASH]);
  });

  it('reads the species of the latest day of want counts', async () => {
    const world = await made();
    expect(await world.reader.latestWants(BOARD_SERVER)).toBeUndefined();
    await world.wants('2026-11-03', 'species:25', 9);
    await world.wants('2026-11-04', 'species:25', 7);
    await world.wants('2026-11-04', 'species:1', 2);
    await world.wants('2026-11-04', 'tier:5', 30);
    await world.wants('2026-11-05', 'species:1', 2, OTHER_BOARD_SERVER);
    const latest = await world.reader.latestWants(BOARD_SERVER);
    expect(latest?.day).toBe('2026-11-04');
    expect(latest?.counts).toEqual(
      expect.arrayContaining([
        { target: 'species:25', count: 7 },
        { target: 'species:1', count: 2 },
      ]),
    );
    expect(latest?.counts).toHaveLength(2);
  });

  it('sums what raids and max battles of each boss were sent to, from a moment on', async () => {
    const world = await made();
    await world.party(boardRecord({ reached: 10 }));
    await world.party(boardRecord({ kind: 'max', reached: 5 }));
    await world.party(boardRecord({ reached: 4, createdAt: BOARD_NOW - 2 * HOUR }));
    await world.party(boardRecord({ kind: 'train', reached: 50, boss: null }));
    await world.party(boardRecord({ reached: 3, boss: { name: 'Mewtwo?' } }));
    await world.party(
      boardRecord({ reached: 2, boss: { key: 'DIALGA', dex: 483, species: 'DIALGA', form: null } }),
    );
    expect(await world.reader.bossSends(BOARD_SERVER, BOARD_NOW - HOUR)).toEqual(
      expect.arrayContaining([
        { bossKey: 'MEWTWO', sent: 15 },
        { bossKey: 'DIALGA', sent: 2 },
      ]),
    );
    expect(await world.reader.bossSends(BOARD_SERVER, null)).toEqual(
      expect.arrayContaining([{ bossKey: 'MEWTWO', sent: 19 }]),
    );
  });

  it('reads the records a member is in, as maker or attendee, live and legacy alike', async () => {
    const world = await made();
    const raid = boardRecord({ reached: 12, regionId: 3, anonymous: true });
    await world.party(raid);
    const train = boardRecord({
      kind: 'train',
      boss: null,
      createdAt: BOARD_NOW + HOUR,
      attendees: [boardAttendee(BROCK, 'here')],
      reached: 4,
      splitFromId: '00000000-0000-4000-8000-999999999999',
    });
    await world.party(train);
    await world.party(
      boardRecord({
        source: 'legacy',
        partyId: null,
        legacyKey: 'x:1',
        createdById: null,
        createdAt: 1,
        attendees: [boardAttendee(ASH, 'joined')],
      }),
    );
    await world.party(boardRecord({ serverId: OTHER_BOARD_SERVER }));
    await world.party(
      boardRecord({ createdById: BROCK, attendees: [boardAttendee(BROCK, 'done')] }),
    );
    const parties = await world.reader.memberParties(BOARD_SERVER, ASH);
    expect(parties).toEqual(
      expect.arrayContaining([
        {
          partyId: raid.partyId,
          splitFromId: null,
          kind: 'raid',
          at: BOARD_NOW,
          regionId: 3,
          bossKey: 'MEWTWO',
          anonymous: true,
          made: true,
          furthest: 'done',
          reached: 12,
        },
        {
          partyId: train.partyId,
          splitFromId: '00000000-0000-4000-8000-999999999999',
          kind: 'train',
          at: BOARD_NOW + HOUR,
          regionId: 1,
          bossKey: null,
          anonymous: false,
          made: true,
          furthest: null,
          reached: 4,
        },
        {
          partyId: 'x:1',
          splitFromId: null,
          kind: 'raid',
          at: 1,
          regionId: 1,
          bossKey: 'MEWTWO',
          anonymous: false,
          made: false,
          furthest: 'joined',
          reached: 0,
        },
      ]),
    );
    expect(parties).toHaveLength(3);
  });

  it('reads a member’s reports at stops however they ended, with their reach', async () => {
    const world = await made();
    await world.report(keptReport({ reach: 5 }));
    await world.report(keptReport({ ending: 'withdrawn', reach: 2, endedAt: BOARD_NOW + 1 }));
    await world.report(keptReport({ reporterId: BROCK, reach: 9 }));
    await world.report(keptReport({ serverId: OTHER_BOARD_SERVER, reach: 9 }));
    expect(await world.reader.memberReports(BOARD_SERVER, ASH)).toEqual(
      expect.arrayContaining([
        { at: BOARD_NOW, reach: 5 },
        { at: BOARD_NOW + 1, reach: 2 },
      ]),
    );
    expect(await world.reader.memberReports(BOARD_SERVER, ASH)).toHaveLength(2);
  });

  it('counts the research reports that counted by subject, with the words they kept', async () => {
    const world = await made();
    await world.report(keptReport());
    await world.report(keptReport({ subjectKey: `${'a'.repeat(16)}:0123abcd` }));
    await world.report(keptReport({ ending: 'contradicted' }));
    await world.report(keptReport({ kind: 'rocket', subjectKey: 'grunt:water' }));
    await world.report(keptReport({ endedAt: BOARD_NOW - 2 * HOUR }));
    expect(await world.reader.taskReports(BOARD_SERVER, BOARD_NOW - HOUR)).toEqual(
      expect.arrayContaining([
        { subjectKey: 'a'.repeat(16), text: 'Catch 5 Pokémon', reports: 1 },
        { subjectKey: `${'a'.repeat(16)}:0123abcd`, text: 'Catch 5 Pokémon', reports: 1 },
      ]),
    );
    expect(await world.reader.taskReports(BOARD_SERVER, BOARD_NOW - HOUR)).toHaveLength(2);
  });
}
