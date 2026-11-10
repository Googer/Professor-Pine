import { describe, expect, it } from 'vitest';
import { zonedAt } from '../../../test/support/time.js';
import {
  memberStats,
  memberYears,
  type MemberParty,
  type MemberStatsInput,
} from './member-stats.js';

const ZONE = 'America/New_York';
const at = (local: string): number => zonedAt(local, ZONE);
const ASH = '312345678901234567';

let parties = 0;
const party = (overrides: Partial<MemberParty> = {}): MemberParty => ({
  partyId: `party-${String(++parties)}`,
  splitFromId: null,
  kind: 'raid',
  at: at('2026-06-10T18:00'),
  regionId: 1,
  bossKey: 'MEWTWO',
  anonymous: false,
  made: false,
  furthest: 'done',
  reached: 0,
  ...overrides,
});

const input = (overrides: Partial<MemberStatsInput> = {}): MemberStatsInput => ({
  parties: [],
  reports: [],
  raids: [],
  trains: [],
  splits: [],
  meetups: [],
  reportCredits: [],
  scores: [],
  ...overrides,
});

describe('a member’s own stats', () => {
  it('counts their boards’ numbers, saying how many of them were anonymous', () => {
    const stats = memberStats(
      input({
        raids: [
          { memberId: ASH, at: 1, anonymous: false },
          { memberId: ASH, at: 2, anonymous: true },
        ],
        trains: [
          { memberId: ASH, at: 1, anonymous: true, partyId: 'a' },
          { memberId: ASH, at: 2, anonymous: true, partyId: 'b' },
          { memberId: ASH, at: 3, anonymous: false, partyId: 'c' },
        ],
        splits: [{ partyId: 'b', splitFromId: 'a' }],
        meetups: [{ memberId: ASH, at: 1, anonymous: false }],
        reportCredits: [
          { memberId: ASH, at: 1, confirmations: 2 },
          { memberId: ASH, at: 2, confirmations: 0 },
        ],
      }),
      { zone: ZONE },
    );
    expect(stats.raids).toEqual({ count: 2, anonymous: 1 });
    // a and b are one ride.
    expect(stats.trains).toEqual({ count: 2, anonymous: 1 });
    expect(stats.meetups).toEqual({ count: 1, anonymous: 0 });
    expect(stats.reports).toEqual({ count: 2, confirmations: 2 });
  });

  it('holds back the unconfirmed reports of a member whose reports were contradicted more', () => {
    const stats = memberStats(
      input({
        reportCredits: [
          { memberId: ASH, at: 1, confirmations: 1 },
          { memberId: ASH, at: 2, confirmations: 0 },
        ],
        scores: [{ memberId: ASH, confirmations: 1, contradicted: 3, counted: 0 }],
      }),
      { zone: ZONE },
    );
    expect(stats.reports).toEqual({ count: 1, confirmations: 1 });
  });

  it('counts what they completed and came to, their busiest region and the bosses they did most', () => {
    const stats = memberStats(
      input({
        parties: [
          party(),
          party({ kind: 'max', bossKey: 'ZACIAN', regionId: 2 }),
          party({ furthest: 'here' }),
          party({ bossKey: 'DIALGA', regionId: 2 }),
          party({ bossKey: 'DIALGA', regionId: 2 }),
          party({ bossKey: 'PALKIA', regionId: 3, furthest: 'joined' }),
          party({ kind: 'train', bossKey: null, furthest: 'here', regionId: 2 }),
          party({ kind: 'meetup', bossKey: null, furthest: 'done', regionId: null }),
          party({ kind: 'meetup', bossKey: null, furthest: 'interested' }),
        ],
      }),
      { zone: ZONE },
    );
    expect(stats.completed).toBe(4);
    expect(stats.trainsCame).toBe(1);
    expect(stats.meetupsCame).toBe(1);
    // Region 2: a max battle, two raids and a train; region 1: two raids.
    expect(stats.busiestRegion).toEqual({ regionId: 2, parties: 4 });
    expect(stats.bosses).toEqual([
      { bossKey: 'DIALGA', count: 2 },
      { bossKey: 'MEWTWO', count: 1 },
      { bossKey: 'ZACIAN', count: 1 },
    ]);
  });

  it('says how many members what they made and reported was sent to', () => {
    const stats = memberStats(
      input({
        parties: [
          party({ made: true, reached: 20 }),
          party({ made: true, reached: 5, kind: 'train', anonymous: true }),
          party({ made: false, reached: 99 }),
        ],
        reports: [
          { at: 1, reach: 7 },
          { at: 2, reach: 3 },
        ],
      }),
      { zone: ZONE },
    );
    expect(stats.sent).toBe(35);
  });

  it('leaves anonymous records out of a shared card, counts and reach alike', () => {
    const stats = memberStats(
      input({
        raids: [
          { memberId: ASH, at: 1, anonymous: false },
          { memberId: ASH, at: 2, anonymous: true },
        ],
        parties: [
          party({ made: true, reached: 20, anonymous: true }),
          party({ made: true, reached: 5 }),
          party({ anonymous: true }),
        ],
      }),
      { zone: ZONE, shared: true },
    );
    expect(stats.raids).toEqual({ count: 1, anonymous: 0 });
    expect(stats.sent).toBe(5);
    expect(stats.completed).toBe(1);
  });

  it('counts a train ride once however often it was split (A5)', () => {
    const first = party({ kind: 'train', bossKey: null, furthest: 'here' });
    const split = party({
      kind: 'train',
      bossKey: null,
      furthest: 'here',
      splitFromId: first.partyId,
    });
    const other = party({ kind: 'train', bossKey: null, furthest: 'done' });
    const stats = memberStats(input({ parties: [first, split, other] }), { zone: ZONE });
    expect(stats.trainsCame).toBe(2);
    // The ride counts once in its month and its region too (R-A3).
    expect(stats.months).toEqual([{ month: '2026-06', came: 2, reports: 0 }]);
    expect(stats.busiestRegion).toEqual({ regionId: 1, parties: 2 });
  });

  it('keeps to a calendar year in the zone, and lists the years they have anything in', () => {
    const records = input({
      parties: [
        party({ at: at('2025-12-31T23:30') }),
        party({ at: at('2026-01-01T00:30') }),
        party({ at: at('2024-03-01T12:00'), furthest: 'interested' }),
      ],
      reports: [{ at: at('2023-05-05T10:00'), reach: 1 }],
      raids: [{ memberId: ASH, at: at('2026-02-01T10:00'), anonymous: false }],
    });
    const year = memberStats(records, { zone: ZONE, year: 2026 });
    expect(year.completed).toBe(1);
    expect(year.raids.count).toBe(1);
    expect(year.year).toBe(2026);
    expect(memberStats(records, { zone: ZONE, year: 2025 }).raids.count).toBe(0);
    // 2024 holds only a raid they were interested in: its card would be all zeros (A9).
    expect(memberYears(records, ZONE)).toEqual([2026, 2025, 2023]);
  });

  it('counts by local month what they came to and the reports that counted, for the chart', () => {
    const stats = memberStats(
      input({
        parties: [
          party({ at: at('2026-05-31T23:30') }),
          party({ at: at('2026-06-01T00:30') }),
          party({ at: at('2026-06-02T00:30'), furthest: 'joined' }),
        ],
        reportCredits: [{ memberId: ASH, at: at('2026-06-03T10:00'), confirmations: 0 }],
      }),
      { zone: ZONE },
    );
    expect(stats.months).toEqual([
      { month: '2026-05', came: 1, reports: 0 },
      { month: '2026-06', came: 1, reports: 1 },
    ]);
  });
});
