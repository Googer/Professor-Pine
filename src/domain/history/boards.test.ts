import { describe, expect, it } from 'vitest';
import { zonedAt } from '../../../test/support/time.js';
import {
  boardStandings,
  mostReportedTasks,
  mostSent,
  mostWanted,
  peopleStandings,
  periodStart,
  reportsThatCount,
  reputationOf,
  UNCONTESTED_PER_POINT,
  rides,
  type BoardCredit,
  type ReportCredit,
} from './boards.js';

const ZONE = 'America/New_York';
const at = (local: string): number => zonedAt(local, ZONE);
const ASH = '312345678901234567';
const BROCK = '312345678901234568';
const MISTY = '312345678901234569';

const credit = (memberId: string, local: string, anonymous = false): BoardCredit => ({
  memberId,
  at: at(local),
  anonymous,
});

describe('the boards of people', () => {
  it('ranks by the count, then by who reached it first, then by member id', () => {
    const standings = boardStandings([
      credit(BROCK, '2026-11-01T10:00'),
      credit(BROCK, '2026-11-03T10:00'),
      credit(ASH, '2026-11-02T10:00'),
      credit(ASH, '2026-11-02T11:00'),
      credit(MISTY, '2026-11-04T10:00'),
      credit(MISTY, '2026-11-02T12:00'),
      credit(ASH, '2026-11-05T10:00'),
    ]);
    // Ash has three; Misty reached two on the 4th, Brock on the 3rd: Brock first.
    expect(standings.map((one) => [one.memberId, one.count])).toEqual([
      [ASH, 3],
      [BROCK, 2],
      [MISTY, 2],
    ]);
    expect(standings[1]?.reachedAt).toBe(at('2026-11-03T10:00'));
    // At the same moment, the lower member id first.
    const same = boardStandings([
      credit(MISTY, '2026-11-01T10:00'),
      credit(ASH, '2026-11-01T10:00'),
    ]);
    expect(same.map((one) => one.memberId)).toEqual([ASH, MISTY]);
  });

  it('ranks only members on the boards, and no anonymous record, keeping everybody’s place (A6)', () => {
    const { standings, ranked } = peopleStandings(
      [
        credit(ASH, '2026-11-01T10:00'),
        credit(ASH, '2026-11-02T10:00', true),
        credit(BROCK, '2026-11-01T11:00'),
        credit(BROCK, '2026-11-01T12:00'),
        credit(MISTY, '2026-11-01T09:00'),
      ],
      new Set([ASH, MISTY]),
    );
    // Brock is off the boards: placed, never ranked. Ash's anonymous raid counts for nobody.
    expect(standings.map((one) => [one.memberId, one.count])).toEqual([
      [BROCK, 2],
      [MISTY, 1],
      [ASH, 1],
    ]);
    expect(ranked.map((one) => one.memberId)).toEqual([MISTY, ASH]);
  });

  it('sums the confirmations of the counted reports beside the count', () => {
    const reports: ReportCredit[] = [
      { memberId: ASH, at: at('2026-11-01T10:00'), confirmations: 2 },
      { memberId: ASH, at: at('2026-11-02T10:00'), confirmations: 0 },
    ];
    expect(boardStandings(reports)).toEqual([
      { memberId: ASH, count: 2, reachedAt: at('2026-11-02T10:00'), confirmations: 2 },
    ]);
  });

  it('counts a train ride once per member, however often it was split', () => {
    const credited = rides(
      [
        { ...credit(ASH, '2026-11-01T10:00'), partyId: 'a' },
        { ...credit(ASH, '2026-11-01T11:00'), partyId: 'c' },
        { ...credit(BROCK, '2026-11-01T11:00'), partyId: 'b' },
        { ...credit(ASH, '2026-11-02T10:00'), partyId: 'd' },
      ],
      // a split into b, and b into c: one ride; d stands alone.
      [
        { partyId: 'b', splitFromId: 'a' },
        { partyId: 'c', splitFromId: 'b' },
      ],
    );
    expect(credited).toEqual([
      credit(ASH, '2026-11-01T10:00'),
      credit(BROCK, '2026-11-01T11:00'),
      credit(ASH, '2026-11-02T10:00'),
    ]);
  });

  it('keeps a member’s reputation from the confirmations their reports received, less those contradicted', () => {
    const score = (confirmations: number, contradicted: number, counted = 0) =>
      reputationOf({ memberId: ASH, confirmations, contradicted, counted });
    expect(score(3, 1)).toBe(2);
    expect(score(0, 2)).toBe(-2);
  });

  it('adds a point for every 20 counting reports nobody contradicted (Matt, 2026-11-05)', () => {
    const score = (counted: number, contradicted = 0) =>
      reputationOf({ memberId: ASH, confirmations: 0, contradicted, counted });
    expect(UNCONTESTED_PER_POINT).toBe(20);
    expect(score(19)).toBe(0);
    expect(score(20)).toBe(1);
    expect(score(40)).toBe(2);
    // A member contradicted once is pulled back to 0 by twenty reports that stood.
    expect(score(19, 1)).toBe(-1);
    expect(score(20, 1)).toBe(0);
    const unconfirmed: ReportCredit[] = [{ memberId: ASH, at: 1, confirmations: 0 }];
    expect(
      reportsThatCount(unconfirmed, [
        { memberId: ASH, confirmations: 0, contradicted: 1, counted: 20 },
      ]),
    ).toHaveLength(1);
  });

  it('counts every report of a member at 0 or above, and only confirmed ones below 0', () => {
    const reports: ReportCredit[] = [
      { memberId: ASH, at: 1, confirmations: 0 },
      { memberId: ASH, at: 2, confirmations: 1 },
      { memberId: BROCK, at: 3, confirmations: 0 },
      { memberId: BROCK, at: 4, confirmations: 2 },
      { memberId: MISTY, at: 5, confirmations: 0 },
    ];
    const counted = reportsThatCount(reports, [
      { memberId: ASH, confirmations: 1, contradicted: 1, counted: 2 },
      { memberId: BROCK, confirmations: 2, contradicted: 3, counted: 2 },
    ]);
    // Ash stands at 0, Misty has no score (0): all of theirs; Brock at -1: the confirmed one.
    expect(counted.map((one) => one.at)).toEqual([1, 2, 4, 5]);
  });
});

describe('the periods of the boards', () => {
  it('starts this month and this year at local midnight, and all time nowhere', () => {
    const now = at('2026-11-05T14:00');
    expect(periodStart('month', now, ZONE)).toBe(at('2026-11-01T00:00'));
    expect(periodStart('year', now, ZONE)).toBe(at('2026-01-01T00:00'));
    expect(periodStart('all', now, ZONE)).toBeNull();
  });
});

describe('the boards of things', () => {
  it('ranks the most wanted species of the day, those the catalogue knows only', () => {
    const names = new Map([
      [25, 'Pikachu'],
      [1, 'Bulbasaur'],
      [150, 'Mewtwo'],
    ]);
    const rows = mostWanted(
      [
        { target: 'species:1', count: 4 },
        { target: 'species:25', count: 9 },
        { target: 'species:150', count: 4 },
        { target: 'species:9999', count: 50 },
        { target: 'tier:5', count: 70 },
      ],
      (dex) => names.get(dex),
    );
    expect(rows).toEqual([
      { key: 'species:25', name: 'Pikachu', count: 9 },
      { key: 'species:1', name: 'Bulbasaur', count: 4 },
      { key: 'species:150', name: 'Mewtwo', count: 4 },
    ]);
  });

  it('ranks the bosses sent to the most members, catalogue bosses only', () => {
    const rows = mostSent(
      [
        { bossKey: 'MEWTWO', sent: 30 },
        { bossKey: 'GONE', sent: 90 },
        { bossKey: 'PIKACHU', sent: 0 },
        { bossKey: 'DIALGA', sent: 30 },
      ],
      (key) => ({ MEWTWO: 'Mewtwo', DIALGA: 'Dialga', PIKACHU: 'Pikachu' })[key],
    );
    expect(rows).toEqual([
      { key: 'DIALGA', name: 'Dialga', count: 30 },
      { key: 'MEWTWO', name: 'Mewtwo', count: 30 },
    ]);
  });

  it('ranks the tasks reported most, each task once over its rewards, typed tasks left out', () => {
    const task = 'a'.repeat(16);
    const other = 'b'.repeat(16);
    const rows = mostReportedTasks(
      [
        { subjectKey: task, text: 'Catch 5 Pokémon', reports: 2 },
        { subjectKey: `${task}:0123abcd`, text: 'Catch 5 Pokémon', reports: 3 },
        { subjectKey: other, text: 'Spin 3 stops', reports: 4 },
        { subjectKey: `typed:${'c'.repeat(16)}`, text: 'My own task', reports: 9 },
        { subjectKey: 'nonsense', text: 'Odd', reports: 9 },
      ],
      (key) => (key === other ? 'Spin 3 PokéStops or Gyms' : undefined),
    );
    // The list's words where it still has the task, else the words kept with the report.
    expect(rows).toEqual([
      { key: task, name: 'Catch 5 Pokémon', count: 5 },
      { key: other, name: 'Spin 3 PokéStops or Gyms', count: 4 },
    ]);
  });
});
